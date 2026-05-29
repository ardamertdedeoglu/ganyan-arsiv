package main

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// StartResultsWorker starts the background results checker
func StartResultsWorker(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	go func() {
		// Run immediately on startup
		checkAndUpdateResults(ctx)

		for {
			select {
			case <-ticker.C:
				checkAndUpdateResults(ctx)
			case <-ctx.Done():
				ticker.Stop()
				return
			}
		}
	}()
}

func checkAndUpdateResults(ctx context.Context) {
	predictions, err := getPredictionsFromDB()
	if err != nil {
		return
	}

	hasActive := false
	updatedAny := false

	for _, p := range predictions {
		// Only check predictions that are not fully completed yet
		if p.IsCompleted {
			continue
		}
		hasActive = true

		winners := fetchWinners(p.City, p.Date)
		if len(winners) == 0 {
			continue
		}

		allLegsCompleted := true
		predictionUpdated := false

		for i := range p.Legs {
			leg := &p.Legs[i]
			if leg.WinnerHorse == 0 {
				if winHorse, found := winners[leg.LegNumber]; found {
					leg.WinnerHorse = winHorse
					updatedAny = true
					predictionUpdated = true
				} else {
					allLegsCompleted = false
				}
			}
		}

		if predictionUpdated {
			if allLegsCompleted {
				p.IsCompleted = true
			}
			_ = updatePredictionInDB(p)
		}
	}

	if updatedAny || hasActive {
		// Notify frontend of database or potential Tevzi updates
		runtime.EventsEmit(ctx, "predictions-updated")
	}
}

func fetchWinners(city, dateStr string) map[int]int {
	winners := make(map[int]int)

	cleanDateStr := dateStr
	if idx := strings.Index(dateStr, "T"); idx != -1 {
		cleanDateStr = dateStr[:idx]
	}

	parsedDate, err := time.Parse("2006-01-02", cleanDateStr)
	if err != nil {
		return winners
	}
	yyyy := parsedDate.Format("2006")
	ddmmyyyy := parsedDate.Format("02.01.2006")

	// Escape path characters but keep Turkish characters as UTF-8 in the URL
	escapedCity := url.PathEscape(city)
	targetURL := fmt.Sprintf(
		"https://medya-cdn.tjk.org/raporftp/TJKPDF/%s/%s/CSV/GunlukYarisSonuclari/%s-%s-GunlukYarisSonuclari-TR.csv",
		yyyy,
		cleanDateStr,
		ddmmyyyy,
		escapedCity,
	)

	client := &http.Client{Timeout: 8 * time.Second}
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return winners
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		if resp != nil {
			resp.Body.Close()
		}
		return winners
	}
	defer resp.Body.Close()

	reader := csv.NewReader(resp.Body)
	reader.Comma = ';'
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true

	var currentRaceNum int
	var inHorseList bool
	ganyanRegex := regexp.MustCompile(`GANYAN\((\d+)\)`)

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}
		if len(record) == 0 {
			continue
		}

		firstCol := strings.TrimSpace(record[0])

		if strings.Contains(firstCol, ". Kosu") || strings.Contains(firstCol, ". Koşu") {
			parts := strings.Split(firstCol, ".")
			if len(parts) > 0 {
				fmt.Sscanf(strings.TrimSpace(parts[0]), "%d", &currentRaceNum)
			}
			inHorseList = false
			continue
		}

		if firstCol == "At No" {
			inHorseList = true
			continue
		}

		if inHorseList && (strings.Contains(firstCol, "GANYAN") || strings.Contains(firstCol, "ÇİFTE") || strings.HasPrefix(firstCol, "[") || firstCol == "") {
			inHorseList = false
		}

		// Scan entire record for GANYAN(winner)
		for _, col := range record {
			matches := ganyanRegex.FindStringSubmatch(col)
			if len(matches) > 1 && currentRaceNum > 0 {
				var winner int
				fmt.Sscanf(matches[1], "%d", &winner)
				if winner > 0 {
					winners[currentRaceNum] = winner
				}
			}
		}
	}

	return winners
}
