// Package config loads environment variables for the ingest-gateway process.
//
// Pattern: twelve-factor app — all settings come from the environment at startup.
// Docker Compose and Kubernetes inject the same variable names in dev and prod.
//
// Usage flow:
//  main() → config.Load() → Config passed to handler.NewAPI and backend.NewClient
package config

import (
	"os"
	"strconv"
	"strings"
)

// Config holds all runtime settings for the Go mailbox ingest gateway.
//
// Usage flow:
//  Load() fills this struct from env → main wires fields into HTTP server, backend client, simulation cap.
type Config struct {
	// ListenAddr — TCP bind address for the HTTP server (e.g. ":8080" → port 8080 on all interfaces).
	ListenAddr string
	// DeploymentEnv — "dev" enables /v1/simulation/* routes; staging/prod return 403 on simulation.
	DeploymentEnv string
	// BackendURL — Node API base URL without trailing slash (e.g. http://backend:3000).
	BackendURL string
	// IngestInternalToken — shared secret for POST /ingest/internal/mailbox (X-Ingest-Internal-Token).
	IngestInternalToken string
	// IngestRegistrationToken — shared secret for PUT /ingest/register/* (X-Ingest-Registration-Token).
	IngestRegistrationToken string
	// MaxEventsPerMinute — upper cap on dev simulation rate (MAILBOX_INGEST_MAX_EVENTS_PER_MIN).
	MaxEventsPerMinute int
	// GatewayEnabled — when false, main.go sleeps forever instead of listening (compose profile toggle).
	GatewayEnabled bool
}

// Load reads process environment and applies safe defaults for local Docker dev.
//
// Usage: called once at startup in cmd/ingest-gateway/main.go before wiring dependencies.
func Load() Config {
	maxRate := 30 // default cap matches Node SIMULATION_MAX_EVENTS_PER_MIN convention
	if v := os.Getenv("MAILBOX_INGEST_MAX_EVENTS_PER_MIN"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxRate = n
		}
	}
	// Enabled by default when unset — dev compose expects the gateway without extra env.
	// Explicit MAILBOX_INGEST_ENABLED=false makes main.go block without opening a port.
	enabled := strings.EqualFold(os.Getenv("MAILBOX_INGEST_ENABLED"), "true") ||
		os.Getenv("MAILBOX_INGEST_ENABLED") == ""

	return Config{
		ListenAddr:              envOr("INGEST_GATEWAY_LISTEN", ":8080"),
		DeploymentEnv:           strings.ToLower(envOr("DEPLOYMENT_ENV", "dev")),
		BackendURL:              strings.TrimRight(envOr("INGEST_BACKEND_URL", "http://backend:3000"), "/"),
		IngestInternalToken:     envOr("INGEST_INTERNAL_TOKEN", "dev-ingest-internal-token"),
		IngestRegistrationToken: envOr("INGEST_CLIENT_REGISTRATION_TOKEN", envOr("INGEST_INTERNAL_TOKEN", "dev-ingest-internal-token")),
		MaxEventsPerMinute:      maxRate,
		GatewayEnabled:          enabled,
	}
}

// IsDev returns true when DEPLOYMENT_ENV=dev — simulation HTTP routes check this before Start().
func (c Config) IsDev() bool {
	return c.DeploymentEnv == "dev"
}

// envOr returns the trimmed environment value or fallback when unset/blank.
func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
