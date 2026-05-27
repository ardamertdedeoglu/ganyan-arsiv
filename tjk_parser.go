package main

import (
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
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
	SilkURL    string `json:"silk_url"`
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

// cityToSehirID maps Turkish city names (as used in CSV) to TJK website SehirId values
var cityToSehirID = map[string]int{
	"İstanbul":  3,
	"Ankara":    1,
	"İzmir":     2,
	"Adana":     4,
	"Bursa":     5,
	"Kocaeli":   6,
	"Antalya":   7,
	"Şanlıurfa": 8,
	"Elazığ":    9,
	"Diyarbakır": 10,
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
			if idx := strings.Index(strings.ToLower(firstCol), "saat"); idx != -1 {
				currentRace.RaceName = strings.TrimSpace(firstCol[:idx])
				timePart := strings.TrimSpace(firstCol[idx:])
				timePart = strings.TrimPrefix(timePart, "Saat:")
				timePart = strings.TrimPrefix(timePart, "saat:")
				timePart = strings.TrimPrefix(timePart, "Saat :")
				timePart = strings.TrimPrefix(timePart, "saat :")
				timePart = strings.TrimPrefix(timePart, "Saat")
				timePart = strings.TrimPrefix(timePart, "saat")
				timePart = strings.TrimSpace(timePart)
				timePart = strings.TrimPrefix(timePart, ":")
				currentRace.Time = strings.TrimSpace(timePart)
			} else {
				parts := strings.SplitN(firstCol, ":", 2)
				if len(parts) >= 2 {
					currentRace.RaceName = strings.TrimSpace(parts[0])
					currentRace.Time = strings.TrimSpace(parts[1])
				} else {
					currentRace.RaceName = firstCol
				}
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

func cleanString(s string) string {
	s = strings.ToLower(s)
	replacer := strings.NewReplacer(
		"ı", "i",
		"i̇", "i",
		"ğ", "g",
		"ü", "u",
		"ş", "s",
		"ö", "o",
		"ç", "c",
	)
	return replacer.Replace(s)
}

// FetchSilks scrapes jockey silk image URLs for all races of a given city on a given date.
// Returns a map: raceIndex (0-based) -> horseNo -> silkURL
func FetchSilks(city, date string) (map[int]map[string]string, error) {
	parsedDate, err := time.Parse("2006-01-02", date)
	if err != nil {
		return nil, fmt.Errorf("invalid date: %s", date)
	}
	ddmmyyyy := parsedDate.Format("02/01/2006")

	client := &http.Client{Timeout: 15 * time.Second}

	// 1. Dynamically find targetURL from main program page
	mainURL := fmt.Sprintf("https://www.tjk.org/TR/YarisSever/Info/Page/GunlukYarisProgrami?QueryParameter_Tarih=%s", url.QueryEscape(ddmmyyyy))
	reqMain, err := http.NewRequest("GET", mainURL, nil)
	if err != nil {
		return nil, err
	}
	reqMain.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	reqMain.Header.Set("Accept-Language", "tr-TR,tr;q=0.9")

	respMain, err := client.Do(reqMain)
	if err != nil {
		return nil, err
	}
	defer respMain.Body.Close()

	if respMain.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d from TJK main page", respMain.StatusCode)
	}

	docMain, err := goquery.NewDocumentFromReader(respMain.Body)
	if err != nil {
		return nil, err
	}

	targetURL := ""
	found := false
	docMain.Find("ul.gunluk-tabs li a").Each(func(_ int, s *goquery.Selection) {
		if found {
			return
		}
		tabText := strings.TrimSpace(s.Text())
		href, _ := s.Attr("href")

		if strings.Contains(cleanString(tabText), cleanString(city)) {
			found = true
			if !strings.HasPrefix(href, "http") {
				href = "https://www.tjk.org" + href
			}
			targetURL = href
		}
	})

	// 2. Fallback to hardcoded map if dynamic tab is not found
	if !found {
		sehirID, ok := cityToSehirID[city]
		if !ok {
			return nil, fmt.Errorf("city not found in tabs and unknown in map: %s", city)
		}
		targetURL = fmt.Sprintf(
			"https://www.tjk.org/TR/YarisSever/Info/Sehir/GunlukYarisProgrami?SehirId=%d&QueryParameter_Tarih=%s&SehirAdi=%s&Era=today",
			sehirID,
			url.QueryEscape(ddmmyyyy),
			url.QueryEscape(city),
		)
	}

	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Accept-Language", "tr-TR,tr;q=0.9")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d from TJK target page", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}

	// Result: raceIndex -> horseNo -> silkURL
	result := make(map[int]map[string]string)
	raceIndex := 0

	// Each race is inside a div under div.races-panes with numeric id (koşu kodu)
	doc.Find("div.races-panes > div[id]").Each(func(_ int, raceDiv *goquery.Selection) {
		id, exists := raceDiv.Attr("id")
		if !exists || id == "" || id == "all" {
			return
		}

		horseMap := make(map[string]string)

		// Each horse row in the table
		raceDiv.Find("tr").Each(func(_ int, row *goquery.Selection) {
			// Get horse number from SiraId cell
			horseNo := strings.TrimSpace(row.Find("td.gunluk-GunlukYarisProgrami-SiraId").Text())
			// Get silk URL from FormaKodu cell's anchor href
			silkURL, _ := row.Find("td.gunluk-GunlukYarisProgrami-FormaKodu a").Attr("href")

			if horseNo != "" && silkURL != "" {
				horseMap[horseNo] = silkURL
			}
		})

		if len(horseMap) > 0 {
			result[raceIndex] = horseMap
			raceIndex++
		}
	})

	return result, nil
}

// MergeSilksIntoProgram merges silk URLs fetched from the website into a parsed program
func MergeSilksIntoProgram(prog *RaceProgram) {
	if prog == nil {
		return
	}

	silks, err := FetchSilks(prog.City, prog.Date)
	if err != nil {
		// Silks not critical - log and continue without them
		return
	}

	for raceIdx := range prog.Races {
		horseMap, ok := silks[raceIdx]
		if !ok {
			continue
		}
		for horseIdx := range prog.Races[raceIdx].Horses {
			no := prog.Races[raceIdx].Horses[horseIdx].HorseNo
			if silkURL, ok := horseMap[no]; ok {
				prog.Races[raceIdx].Horses[horseIdx].SilkURL = silkURL
			}
		}
	}
}
