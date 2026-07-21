// Package config loads environment variables for the ingest-gateway process.
//
// Pattern: twelve-factor app — configuration comes from the environment at startup,
// not from hard-coded paths. Docker Compose and Kubernetes inject the same keys.
package config

import (
	"os"
	"strconv"
	"strings"
)

// Config holds all runtime settings for the Go mailbox ingest gateway.
type Config struct {
	// ListenAddr is the HTTP bind address (e.g. ":8080").
	ListenAddr string
	// DeploymentEnv distinguishes dev simulation from staging/prod (dev enables /v1/simulation/*).
	DeploymentEnv string
	// BackendURL is the Node API base URL used to persist reviews (e.g. http://backend:3000).
	BackendURL string
	// IngestInternalToken is the shared secret sent as X-Ingest-Internal-Token to Node.
	IngestInternalToken string
	// MaxEventsPerMinute caps simulation rate in dev (mirrors SIMULATION_MAX_EVENTS_PER_MIN idea).
	MaxEventsPerMinute int
	// GatewayEnabled allows operators to disable the HTTP server without removing the container.
	GatewayEnabled bool
}

// Load reads process environment and applies safe defaults for local Docker dev.
func Load() Config {
	// Default simulation cap matches Node SIMULATION_MAX_EVENTS_PER_MIN convention (30/min).
	maxRate := 30
	if v := os.Getenv("MAILBOX_INGEST_MAX_EVENTS_PER_MIN"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxRate = n
		}
	}
	// Enabled by default when unset — dev compose expects the gateway without extra env.
	// Explicit "false" disables the HTTP server in main.go (container sleeps instead).
	enabled := strings.EqualFold(os.Getenv("MAILBOX_INGEST_ENABLED"), "true") ||
		os.Getenv("MAILBOX_INGEST_ENABLED") == ""

	return Config{
		ListenAddr:          envOr("INGEST_GATEWAY_LISTEN", ":8080"),
		DeploymentEnv:       strings.ToLower(envOr("DEPLOYMENT_ENV", "dev")),
		BackendURL:          strings.TrimRight(envOr("INGEST_BACKEND_URL", "http://backend:3000"), "/"),
		IngestInternalToken: envOr("INGEST_INTERNAL_TOKEN", "dev-ingest-internal-token"),
		MaxEventsPerMinute:  maxRate,
		GatewayEnabled:      enabled,
	}
}

// IsDev returns true when simulation controls are allowed (DEPLOYMENT_ENV=dev).
func (c Config) IsDev() bool {
	return c.DeploymentEnv == "dev"
}

// envOr returns the environment value or a default when unset.
func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
