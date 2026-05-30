package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
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
	StartResultsWorker(ctx)
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

// UpdatePrediction updates an existing prediction in the database
func (a *App) UpdatePrediction(p Prediction) error {
	return updatePredictionInDB(p)
}

// GetDailyPrograms fetches daily race programs for a given date from the TJK website
func (a *App) GetDailyPrograms(date string) ([]RaceProgram, error) {
	programs := FetchAllPrograms(date)
	return programs, nil
}

// GetProgramSilks fetches jockey silk image URLs for a specific city and date from the TJK website.
// Returns a map of raceIndex -> horseNo -> silkURL
func (a *App) GetProgramSilks(city, date string) (map[int]map[string]string, error) {
	return FetchSilks(city, date)
}

// GetGanyanTypes fetches Pick 6 types for a specific city and date
func (a *App) GetGanyanTypes(city, date string) ([]GanyanInfo, error) {
	return GetGanyanTypes(city, date)
}

// ForceCheckResults triggers the background results checker instantly
func (a *App) ForceCheckResults() {
	checkAndUpdateResults(a.ctx)
}

// BackupPredictions exports the database file to a user selected path
func (a *App) BackupPredictions() (string, error) {
	dbPath, err := getDBPath()
	if err != nil {
		return "", err
	}

	// Ensure source exists
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		return "", fmt.Errorf("yedeklenecek tahmin veritabanı bulunamadı")
	}

	nowStr := time.Now().Format("2006-01-02_15-04-05")
	defaultName := fmt.Sprintf("tahminler_yedek_%s.bak", nowStr)

	selectedPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Yedek Kaydet (.bak)",
		DefaultFilename: defaultName,
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Yedek Dosyaları (*.bak)",
				Pattern:     "*.bak",
			},
		},
	})
	if err != nil {
		return "", err
	}
	if selectedPath == "" {
		return "Seçim iptal edildi", nil
	}

	// Read db file under read lock
	dbMutex.RLock()
	data, err := os.ReadFile(dbPath)
	dbMutex.RUnlock()
	if err != nil {
		return "", fmt.Errorf("veritabanı dosyası okunamadı: %w", err)
	}

	// Write to backup file
	err = os.WriteFile(selectedPath, data, 0644)
	if err != nil {
		return "", fmt.Errorf("yedek dosyası oluşturulamadı: %w", err)
	}

	return "Yedek başarıyla oluşturuldu!", nil
}

// RestorePredictions imports predictions from a selected backup file
func (a *App) RestorePredictions() (string, error) {
	selectedPath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Yedek Seç (.bak)",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Yedek Dosyaları (*.bak)",
				Pattern:     "*.bak",
			},
		},
	})
	if err != nil {
		return "", err
	}
	if selectedPath == "" {
		return "Seçim iptal edildi", nil
	}

	// Close current DB connection
	err = CloseDB()
	if err != nil {
		return "", fmt.Errorf("veritabanı kapatılamadı: %w", err)
	}

	dbPath, err := getDBPath()
	if err != nil {
		_ = InitDB() // Recover connection
		return "", err
	}

	// Read backup file bytes
	sourceData, err := os.ReadFile(selectedPath)
	if err != nil {
		_ = InitDB() // Recover connection
		return "", fmt.Errorf("yedek dosyası okunamadı: %w", err)
	}

	// Write backup to normal db path under dbMutex lock
	dbMutex.Lock()
	err = os.WriteFile(dbPath, sourceData, 0644)
	dbMutex.Unlock()
	if err != nil {
		_ = InitDB() // Recover connection
		return "", fmt.Errorf("veritabanı dosyası güncellenemedi: %w", err)
	}

	// Reopen DB connection
	err = InitDB()
	if err != nil {
		return "", fmt.Errorf("veritabanı yeniden yüklenirken hata oluştu: %w", err)
	}

	// Notify frontend of potential updates
	runtime.EventsEmit(a.ctx, "predictions-updated")

	return "Yedek başarıyla yüklendi!", nil
}

