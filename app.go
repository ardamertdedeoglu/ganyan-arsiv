package main

import (
	"context"
	"fmt"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// SavePrediction saves a new prediction to the database
func (a *App) SavePrediction(p Prediction) error {
	return savePredictionToDB(p)
}

// GetPredictions retrieves all predictions from the database
func (a *App) GetPredictions() ([]Prediction, error) {
	return getPredictionsFromDB()
}

// DeletePrediction deletes a prediction by its ID
func (a *App) DeletePrediction(id int64) error {
	return deletePredictionFromDB(id)
}

// GetDailyPrograms fetches daily race programs for a given date from the TJK website
func (a *App) GetDailyPrograms(date string) ([]RaceProgram, error) {
	programs := FetchAllPrograms(date)
	return programs, nil
}
