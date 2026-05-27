package main

import (
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Horse struct {
	HorseNo    string `json:"horse_no"`
	Name       string `json:"name"`
	Age        string `json:"age"`
	Sire       string `json:"sire"`
	Dam        string `json:"dam"`
	Weight     string `json:"weight"`
	Jockey     string `json:"jockey"`
	Owner      string `json:"owner"`
	Trainer    string `json:"trainer"`
	St         string `json:"st"`
	AGF        string `json:"agf"`
	H          string `json:"h"`
	Last6      string `json:"last6"`
	KGS        string `json:"kgs"`
	S20        string `json:"s20"`
	BestRating string `json:"best_rating"`
}

type Race struct {
	RaceName  string  `json:"race_name"`
	Time      string  `json:"time"`
	Condition string  `json:"condition"`
	AgeGroup  string  `json:"age_group"`
	Distance  string  `json:"distance"`
	Horses    []Horse `json:"horses"`
}

type RaceProgram struct {
	City  string `json:"city"`
	Date  string `json:"date"`
	Races []Race `json:"races"`
}

func buildURL(city, dateStr string) string {
	// dateStr is expected to be "YYYY-MM-DD"
	parsedDate, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return ""
	}
	yyyy := parsedDate.Format("2006")
	ddmmyyyy := parsedDate.Format("02.01.2006")

	return fmt.Sprintf("https://medya-cdn.tjk.org/raporftp/TJKPDF/%s/%s/CSV/GunlukYarisProgrami/%s-%s-GunlukYarisProgrami-TR.csv", yyyy, dateStr, ddmmyyyy, city)
}

func parseCSVProgram(city, date string, r io.Reader) *RaceProgram {
	reader := csv.NewReader(r)
	reader.Comma = ';'
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true

	prog := &RaceProgram{City: city, Date: date}
	var currentRace *Race
	inHorseList := false

	for {
		record, err := reader.Read()
		if err != nil {
			break
		}
		if len(record) == 0 {
			continue
		}

		firstCol := strings.TrimSpace(record[0])

		if strings.Contains(firstCol, ". Kosu") || strings.Contains(firstCol, ". Koşu") {
			if currentRace != nil && len(currentRace.Horses) > 0 {
				prog.Races = append(prog.Races, *currentRace)
			}
			currentRace = &Race{}
			parts := strings.Split(firstCol, ":")
			if len(parts) >= 2 {
				currentRace.RaceName = strings.TrimSpace(parts[0])
				currentRace.Time = strings.TrimSpace(parts[1])
			} else {
				currentRace.RaceName = firstCol
			}

			if len(record) > 1 {
				currentRace.Condition = strings.TrimSpace(record[1])
			}

			// record[2] contains the age/breed group e.g. "4 ve Yukarı Araplar"
			if len(record) > 2 {
				currentRace.AgeGroup = strings.TrimSpace(record[2])
			}

			// Capture distance/track details and format cleanly
			var distParts []string
			for i := 3; i < len(record); i++ {
				p := strings.TrimSpace(record[i])
				if p != "" && !strings.Contains(strings.ToLower(p), "rekor derece") {
					distParts = append(distParts, p)
				}
			}
			currentRace.Distance = strings.Join(distParts, " - ")
			inHorseList = false
			continue
		}

		if firstCol == "At No" {
			inHorseList = true
			continue
		}

		// Detect footer lines to stop reading horses for current race
		if inHorseList && (strings.Contains(firstCol, "GANYAN") || strings.Contains(firstCol, "ÇİFTE") || strings.HasPrefix(firstCol, "[")) {
			inHorseList = false
			continue
		} // Handle case where sometimes first col is empty but it's a footer
		if inHorseList && firstCol == "" && len(record) > 1 && strings.Contains(record[1], "GANYAN") {
			inHorseList = false
			continue
		}

		if inHorseList && currentRace != nil {
			// Expected Columns:
			// 0: At No, 1: At İsmi, 2: Yaş, 3: Orijin(Baba), 4: Orijin(Anne), 5: Kilo, 6: Jokey Adı, 7: Sahip Adı, 8: Antrenör Adı, 9: St, 10: AGF, 11: H, 12: Son 6 Yarış
			if len(record) >= 11 {
				// Only add if column 0 holds a number (At No)
				if record[0] != "" {
					h := Horse{
						HorseNo: strings.TrimSpace(record[0]),
						Name:    strings.TrimSpace(record[1]),
						Age:     strings.TrimSpace(record[2]),
						Sire:    strings.TrimSpace(record[3]),
						Dam:     strings.TrimSpace(record[4]),
						Weight:  strings.TrimSpace(record[5]),
						Jockey:  strings.TrimSpace(record[6]),
						Owner:   strings.TrimSpace(record[7]),
						Trainer: strings.TrimSpace(record[8]),
						St:      strings.TrimSpace(record[9]),
					}
					if len(record) > 10 {
						h.AGF = strings.TrimSpace(record[10])
					}
					if len(record) > 11 {
						h.H = strings.TrimSpace(record[11])
					}
					if len(record) > 12 {
						h.Last6 = strings.TrimSpace(record[12])
					}
					if len(record) > 13 {
						h.KGS = strings.TrimSpace(record[13])
					}
					if len(record) > 14 {
						h.S20 = strings.TrimSpace(record[14])
					}
					if len(record) > 15 {
						h.BestRating = strings.TrimSpace(record[15])
					}
					currentRace.Horses = append(currentRace.Horses, h)
				}
			}
		}
	}

	if currentRace != nil && len(currentRace.Horses) > 0 {
		prog.Races = append(prog.Races, *currentRace)
	}

	return prog
}

// FetchAllPrograms makes requests for all active cities for a given date
func FetchAllPrograms(date string) []RaceProgram {
	cities := []string{"İstanbul", "Ankara", "İzmir", "Adana", "Bursa", "Kocaeli", "Antalya", "Şanlıurfa", "Elazığ", "Diyarbakır"}
	
	type result struct {
		city string
		prog *RaceProgram
	}
	ch := make(chan result, len(cities))

	for _, city := range cities {
		go func(c string) {
			url := buildURL(c, date)
			if url == "" {
				ch <- result{c, nil}
				return
			}
			
			client := &http.Client{Timeout: 10 * time.Second}
			req, err := http.NewRequest("GET", url, nil)
			if err != nil {
				ch <- result{c, nil}
				return
			}
			
			resp, err := client.Do(req)
			if err != nil || resp.StatusCode != 200 {
				if resp != nil {
					resp.Body.Close()
				}
				ch <- result{c, nil}
				return
			}
			
			prog := parseCSVProgram(c, date, resp.Body)
			resp.Body.Close()
			ch <- result{c, prog}
		}(city)
	}

	var programs []RaceProgram
	for i := 0; i < len(cities); i++ {
		res := <-ch
		if res.prog != nil && len(res.prog.Races) > 0 {
			programs = append(programs, *res.prog)
		}
	}
	return programs
}
