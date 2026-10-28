// This Go program starts the mailbox ingest edge service listening on port 8080.
// It wires configuration, structured logging, Prometheus metrics, an HTTP handler package, a simulation controller, and a client to the Node internal ingest API.
// Docker Compose runs it as ingest-gateway for webhook and simulation traffic.
// The binary is built multi-stage into a small image suitable for edge deployment.


package main

import (
	"net/http"
	"os"
	"time"

	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/backend"
	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/config"
	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/handler"
	gwlogger "github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/logger"
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
		gwlogger.Warn("startup", "ingest-gateway disabled (MAILBOX_INGEST_ENABLED=false); sleeping", nil)
		select {} // block forever — no HTTP listener
	}

	// In-memory stats for the React #ingest dashboard (not persisted across restarts).
	store := stats.NewStore()

	// HTTP client that POSTs to Node /ingest/internal/mailbox with shared secret header.
	client := backend.NewClient(cfg.BackendURL, cfg.IngestInternalToken, cfg.IngestRegistrationToken)

	// Simulation controller: dev-only *traffic generator* (not created conditionally here — always wired).
	// Role: when an operator calls POST /v1/simulation/start, it runs a background goroutine with a
	// time.Ticker that invents synthetic emails at N/min and POSTs them through the same backend client
	// as real webhooks (source=mailbox_simulation). Updates in-memory stats for the #ingest dashboard.
	// Non-dev guard: handler routes check cfg.IsDev() (DEPLOYMENT_ENV=dev) and return 403 before
	// calling sim.Start — staging/prod never start the loop even though this struct exists.
	// onResult: forwards each tick outcome to Prometheus counters (success vs backend vs sim error).
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

	// api: handler bundle holding cfg, stats, backend client, and sim controller.
	api := handler.NewAPI(cfg, store, client, sim)

	// mux: Go 1.22 ServeMux — route table (health, metrics, ingest, simulation, client registration).
	// Initialized empty, then api.Register(mux) attaches "METHOD /path" patterns to handler funcs.
	mux := http.NewServeMux()
	api.Register(mux)

	// server: stdlib HTTP listener config — binds Addr, serves all routes via mux, caps header read time.
	// Initialized as a struct literal; ListenAndServe() below opens the TCP socket and blocks.
	server := &http.Server{
		Addr:    cfg.ListenAddr, // e.g. ":8080" from INGEST_GATEWAY_LISTEN
		Handler: mux,
		// ReadHeaderTimeout: reject clients that stall while sending headers (slowloris).
		ReadHeaderTimeout: 5 * time.Second,
	}

	gwlogger.Info("startup", "ingest-gateway listening", map[string]interface{}{
		"listenAddr":    cfg.ListenAddr,
		"deploymentEnv": cfg.DeploymentEnv,
		"backendUrl":    cfg.BackendURL,
		"maxSimRate":    cfg.MaxEventsPerMinute,
	})

	// ListenAndServe blocks; returns http.ErrServerClosed on graceful Shutdown (not wired yet).
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		gwlogger.Error("startup", "fatal server error", map[string]interface{}{"error": err.Error()})
		os.Exit(1)
	}
}
