package main

import (
	"context"
	"fmt"
	"os"
	"runtime"

	"github.com/creativeprojects/go-selfupdate"
)

// GitHub repository owner and name - change these to your own!
const (
	repoOwner = "ardamertdedeoglu"
	repoName  = "ganyan-arsiv"
)

// UpdateResult is returned to the frontend with update status info
type UpdateResult struct {
	UpdateAvailable bool   `json:"updateAvailable"`
	CurrentVersion  string `json:"currentVersion"`
	LatestVersion   string `json:"latestVersion"`
	Message         string `json:"message"`
}

// CheckForUpdate checks GitHub Releases for a newer version
func (a *App) CheckForUpdate() UpdateResult {
	latest, found, err := detectLatest()
	if err != nil {
		fmt.Printf("Error detecting latest release: %v\n", err)
		return UpdateResult{
			UpdateAvailable: false,
			CurrentVersion:  version,
			Message:         "Güncelleme kontrolü başarısız: " + err.Error(),
		}
	}

	if !found {
		fmt.Printf("No published release found\n")
		return UpdateResult{
			UpdateAvailable: false,
			CurrentVersion:  version,
			Message:         "Henüz yayınlanmış bir release bulunamadı.",
		}
	}

	fmt.Printf("Latest version: %s, Found: %v\n", latest.Version(), found)

	if latest.LessOrEqual(version) {
		return UpdateResult{
			UpdateAvailable: false,
			CurrentVersion:  version,
			LatestVersion:   latest.Version(),
			Message:         "Uygulama güncel!",
		}
	}

	return UpdateResult{
		UpdateAvailable: true,
		CurrentVersion:  version,
		LatestVersion:   latest.Version(),
		Message: fmt.Sprintf(
			"Yeni sürüm mevcut: %s (mevcut: %s)",
			latest.Version(), version,
		),
	}
}

// PerformUpdate downloads and applies the latest update
func (a *App) PerformUpdate() UpdateResult {
	latest, found, err := detectLatest()
	if err != nil || !found {
		return UpdateResult{
			UpdateAvailable: false,
			CurrentVersion:  version,
			Message:         "Güncelleme bulunamadı.",
		}
	}

	if latest.LessOrEqual(version) {
		return UpdateResult{
			UpdateAvailable: false,
			CurrentVersion:  version,
			LatestVersion:   latest.Version(),
			Message:         "Zaten güncel!",
		}
	}

	exe, err := os.Executable()
	if err != nil {
		return UpdateResult{
			UpdateAvailable: true,
			CurrentVersion:  version,
			LatestVersion:   latest.Version(),
			Message:         "Executable yolu alınamadı: " + err.Error(),
		}
	}

	updater, err := newUpdater()
	if err != nil {
		return UpdateResult{
			UpdateAvailable: true,
			CurrentVersion:  version,
			LatestVersion:   latest.Version(),
			Message:         "Updater oluşturulamadı: " + err.Error(),
		}
	}

	if err := updater.UpdateTo(context.Background(), latest, exe); err != nil {
		return UpdateResult{
			UpdateAvailable: true,
			CurrentVersion:  version,
			LatestVersion:   latest.Version(),
			Message:         "Güncelleme başarısız: " + err.Error(),
		}
	}

	return UpdateResult{
		UpdateAvailable: false,
		CurrentVersion:  latest.Version(),
		LatestVersion:   latest.Version(),
		Message:         "Güncelleme başarılı! Uygulamayı yeniden başlatın.",
	}
}

// GetAppVersion returns the current application version
func (a *App) GetAppVersion() string {
	return version
}

// detectLatest finds the latest release from GitHub
func detectLatest() (*selfupdate.Release, bool, error) {
	updater, err := newUpdater()
	if err != nil {
		return nil, false, err
	}

	latest, found, err := updater.DetectLatest(
		context.Background(),
		selfupdate.NewRepositorySlug(repoOwner, repoName),
	)
	if err != nil {
		return nil, false, err
	}

	return latest, found, nil
}

// newUpdater creates a selfupdate.Updater with GitHub source
func newUpdater() (*selfupdate.Updater, error) {
	source, err := selfupdate.NewGitHubSource(selfupdate.GitHubConfig{})
	if err != nil {
		return nil, err
	}

	updater, err := selfupdate.NewUpdater(selfupdate.Config{
		Source: source,
		// Filter by OS and Architecture to get the correct binary
		Filters: []string{
			fmt.Sprintf("%s_%s", runtime.GOOS, runtime.GOARCH),
		},
	})
	if err != nil {
		return nil, err
	}

	return updater, nil
}
