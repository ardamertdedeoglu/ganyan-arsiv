package main

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

var db *sql.DB

type Prediction struct {
	ID          int64     `json:"id"`
	Date        string    `json:"date"`
	City        string    `json:"city"`
	RaceTime    string    `json:"race_time"`
	IsCompleted bool      `json:"is_completed"`
	CreatedAt   time.Time `json:"created_at"`
	Legs        []Leg     `json:"legs"`
}

type Leg struct {
	LegNumber   int   `json:"leg_number"`
	Predictions []int `json:"predictions"`
	WinnerHorse int   `json:"winner_horse"`
}

func InitDB() error {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return err
	}

	appDir := filepath.Join(configDir, "ganyan-arsiv")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return err
	}

	dbPath := filepath.Join(appDir, "ganyan.db")
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
		legs TEXT
	);`

	_, err = db.Exec(createTableSQL)
	return err
}

func savePredictionToDB(p Prediction) error {
	legsJSON, err := json.Marshal(p.Legs)
	if err != nil {
		return err
	}

	query := `INSERT INTO predictions (date, city, race_time, is_completed, created_at, legs) VALUES (?, ?, ?, ?, ?, ?)`
	result, err := db.Exec(query, p.Date, p.City, p.RaceTime, p.IsCompleted, time.Now(), string(legsJSON))
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
	rows, err := db.Query(`SELECT id, date, city, race_time, is_completed, created_at, legs FROM predictions ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var predictions []Prediction
	for rows.Next() {
		var p Prediction
		var legsJSON string
		err := rows.Scan(&p.ID, &p.Date, &p.City, &p.RaceTime, &p.IsCompleted, &p.CreatedAt, &legsJSON)
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
	_, err := db.Exec(`DELETE FROM predictions WHERE id = ?`, id)
	return err
}

func updatePredictionInDB(p Prediction) error {
	legsJSON, err := json.Marshal(p.Legs)
	if err != nil {
		return err
	}

	query := `UPDATE predictions SET date = ?, city = ?, race_time = ?, is_completed = ?, legs = ? WHERE id = ?`
	_, err = db.Exec(query, p.Date, p.City, p.RaceTime, p.IsCompleted, string(legsJSON), p.ID)
	return err
}
