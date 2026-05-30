package main

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

var (
	db      *sql.DB
	dbMutex sync.RWMutex
)

type Prediction struct {
	ID          int64     `json:"id"`
	Date        string    `json:"date"`
	City        string    `json:"city"`
	RaceTime    string    `json:"race_time"`
	IsCompleted bool      `json:"is_completed"`
	CreatedAt   time.Time `json:"created_at"`
	Legs        []Leg     `json:"legs"`
	GanyanName  string    `json:"ganyan_name"`
	GanyanLegs  string    `json:"ganyan_legs"`
	GanyanCost  float64   `json:"ganyan_cost"`
}

type Leg struct {
	LegNumber   int   `json:"leg_number"`
	Predictions []int `json:"predictions"`
	WinnerHorse int   `json:"winner_horse"`
}

func getDBPath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, "ganyan-arsiv", "ganyan.db"), nil
}

func CloseDB() error {
	dbMutex.Lock()
	defer dbMutex.Unlock()
	if db != nil {
		err := db.Close()
		db = nil
		return err
	}
	return nil
}

func InitDB() error {
	dbMutex.Lock()
	defer dbMutex.Unlock()

	dbPath, err := getDBPath()
	if err != nil {
		return err
	}

	appDir := filepath.Dir(dbPath)
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return err
	}

	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		return err
	}

	createTableSQL := `CREATE TABLE IF NOT EXISTS predictions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		date TEXT,
		city TEXT,
		race_time TEXT,
		is_completed BOOLEAN,
		created_at DATETIME,
		legs TEXT,
		ganyan_name TEXT DEFAULT '',
		ganyan_legs TEXT DEFAULT '',
		ganyan_cost REAL DEFAULT 0.0
	);`

	_, err = db.Exec(createTableSQL)
	if err != nil {
		return err
	}

	// Dynamic column migrations for existing databases
	_, _ = db.Exec("ALTER TABLE predictions ADD COLUMN ganyan_name TEXT DEFAULT ''")
	_, _ = db.Exec("ALTER TABLE predictions ADD COLUMN ganyan_legs TEXT DEFAULT ''")
	_, _ = db.Exec("ALTER TABLE predictions ADD COLUMN ganyan_cost REAL DEFAULT 0.0")

	return nil
}

func savePredictionToDB(p Prediction) error {
	dbMutex.RLock()
	defer dbMutex.RUnlock()

	legsJSON, err := json.Marshal(p.Legs)
	if err != nil {
		return err
	}

	query := `INSERT INTO predictions (date, city, race_time, is_completed, created_at, legs, ganyan_name, ganyan_legs, ganyan_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	result, err := db.Exec(query, p.Date, p.City, p.RaceTime, p.IsCompleted, time.Now(), string(legsJSON), p.GanyanName, p.GanyanLegs, p.GanyanCost)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err == nil {
		p.ID = id
	}
	return nil
}

func getPredictionsFromDB() ([]Prediction, error) {
	dbMutex.RLock()
	defer dbMutex.RUnlock()

	rows, err := db.Query(`SELECT id, date, city, race_time, is_completed, created_at, legs, COALESCE(ganyan_name, ''), COALESCE(ganyan_legs, ''), COALESCE(ganyan_cost, 0.0) FROM predictions ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var predictions []Prediction
	for rows.Next() {
		var p Prediction
		var legsJSON string
		err := rows.Scan(&p.ID, &p.Date, &p.City, &p.RaceTime, &p.IsCompleted, &p.CreatedAt, &legsJSON, &p.GanyanName, &p.GanyanLegs, &p.GanyanCost)
		if err != nil {
			return nil, err
		}
		err = json.Unmarshal([]byte(legsJSON), &p.Legs)
		if err != nil {
			return nil, err
		}
		predictions = append(predictions, p)
	}
	return predictions, nil
}

func deletePredictionFromDB(id int64) error {
	dbMutex.RLock()
	defer dbMutex.RUnlock()

	_, err := db.Exec(`DELETE FROM predictions WHERE id = ?`, id)
	return err
}

func updatePredictionInDB(p Prediction) error {
	dbMutex.RLock()
	defer dbMutex.RUnlock()

	legsJSON, err := json.Marshal(p.Legs)
	if err != nil {
		return err
	}

	query := `UPDATE predictions SET date = ?, city = ?, race_time = ?, is_completed = ?, legs = ?, ganyan_name = ?, ganyan_legs = ?, ganyan_cost = ? WHERE id = ?`
	_, err = db.Exec(query, p.Date, p.City, p.RaceTime, p.IsCompleted, string(legsJSON), p.GanyanName, p.GanyanLegs, p.GanyanCost, p.ID)
	return err
}
