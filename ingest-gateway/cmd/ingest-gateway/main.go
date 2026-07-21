// Command ingest-gateway is the Go mailbox ingest service entry point.
//
// Architecture: this binary runs as a separate container (ingest-gateway) in Docker Compose.
// It receives email-shaped HTTP payloads, optionally simulates mailbox traffic in dev, and
// delegates review persistence to the existing Node.js API via an internal authenticated route.
//
// Go patterns used here:
//   - net/http.Server with ReadHeaderTimeout (slowloris mitigation)
//   - http.NewServeMux with Go 1.22 method-aware patterns (GET /health/live)
//   - Dependency injection: config, stats store, backend client, simulation controller
package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/backend"
	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/config"
	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/handler"
	gwmetrics "github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/metrics"
	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/simulation"
	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/stats"
)

// main wires dependencies and blocks until the HTTP server exits or fatals.
func main() {
	// Load twelve-factor config from environment (see internal/config/config.go).
	cfg := config.Load()

	// When MAILBOX_INGEST_ENABLED=false, keep the container alive but idle so
	// Docker Compose does not restart-loop; operators can enable via env + recreate.
	if !cfg.GatewayEnabled {
		log.Println("ingest-gateway disabled (MAILBOX_INGEST_ENABLED=false); sleeping")
		select {} // block forever — no HTTP listener
	}

	// In-memory stats for the React #ingest dashboard (not persisted across restarts).
	store := stats.NewStore()

	// HTTP client that POSTs to Node /ingest/internal/mailbox with shared secret header.
	client := backend.NewClient(cfg.BackendURL, cfg.IngestInternalToken)

	// Simulation controller runs synthetic traffic in a background goroutine (dev only).
	// onResult callback bridges simulation outcomes into Prometheus counters.
	sim := simulation.NewController(cfg.MaxEventsPerMinute, store, client, func(ok bool, backendFailure bool) {
		if ok {
			gwmetrics.RecordSuccess("mailbox_simulation")
			return
		}
		if backendFailure {
			gwmetrics.RecordError("backend")
		} else {
			gwmetrics.RecordError("simulation")
		}
	})

	// HTTP handlers bundle config + dependencies; Register mounts routes on the mux.
	api := handler.NewAPI(cfg, store, client, sim)
	mux := http.NewServeMux()
	api.Register(mux)

	// Standard library HTTP server — no framework; explicit timeouts on the server struct.
	server := &http.Server{
		Addr:    cfg.ListenAddr, // e.g. ":8080" from INGEST_GATEWAY_LISTEN
		Handler: mux,
		// ReadHeaderTimeout: reject clients that stall while sending headers (slowloris).
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("ingest-gateway listening on %s env=%s backend=%s max_sim_rate=%d",
		cfg.ListenAddr, cfg.DeploymentEnv, cfg.BackendURL, cfg.MaxEventsPerMinute)

	// ListenAndServe blocks; returns http.ErrServerClosed on graceful Shutdown (not wired yet).
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Printf("fatal: %v", err)
		os.Exit(1)
	}
}
