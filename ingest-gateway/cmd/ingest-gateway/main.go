// Command ingest-gateway is the Go mailbox ingest service entry point.
//
// Architecture: this binary runs as a separate container (ingest-gateway) in Docker Compose.
// It receives email-shaped HTTP payloads, optionally simulates mailbox traffic in dev, and
// delegates review persistence to the existing Node.js API via an internal authenticated route.
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

func main() {
	cfg := config.Load()
	if !cfg.GatewayEnabled {
		log.Println("ingest-gateway disabled (MAILBOX_INGEST_ENABLED=false); sleeping")
		select {}
	}

	store := stats.NewStore()
	client := backend.NewClient(cfg.BackendURL, cfg.IngestInternalToken)
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

	api := handler.NewAPI(cfg, store, client, sim)
	mux := http.NewServeMux()
	api.Register(mux)

	server := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("ingest-gateway listening on %s env=%s backend=%s max_sim_rate=%d",
		cfg.ListenAddr, cfg.DeploymentEnv, cfg.BackendURL, cfg.MaxEventsPerMinute)

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Printf("fatal: %v", err)
		os.Exit(1)
	}
}
