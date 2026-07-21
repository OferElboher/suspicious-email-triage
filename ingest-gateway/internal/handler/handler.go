// Package handler implements HTTP routes for mailbox ingest and dev simulation.
//
// Routes (Go 1.22 net/http ServeMux patterns):
//   GET  /health/live, /health/ready — probes for Docker/Kubernetes
//   GET  /metrics — Prometheus scrape endpoint
//   GET  /v1/stats/dashboard — JSON for React ingest dashboard
//   POST /v1/ingest/email — webhook-style mailbox payload (production path)
//   POST /v1/simulation/start, /v1/simulation/stop, GET /v1/simulation/status — dev only
package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/backend"
	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/config"
	gwmetrics "github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/metrics"
	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/simulation"
	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/stats"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// API wires dependencies for HTTP handlers.
type API struct {
	cfg         config.Config
	stats       *stats.Store
	backend     *backend.Client
	simulation  *simulation.Controller
	startedAt   time.Time
}

// NewAPI constructs the HTTP handler bundle.
func NewAPI(cfg config.Config, store *stats.Store, client *backend.Client, sim *simulation.Controller) *API {
	return &API{
		cfg:        cfg,
		stats:      store,
		backend:    client,
		simulation: sim,
		startedAt:  time.Now(),
	}
}

// Register attaches all routes to a Go 1.22 ServeMux (method-aware patterns).
func (a *API) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /health/live", a.handleLive)
	mux.HandleFunc("GET /health/ready", a.handleReady)
	mux.Handle("GET /metrics", promhttp.Handler())
	mux.HandleFunc("GET /v1/stats/dashboard", a.handleDashboard)
	mux.HandleFunc("POST /v1/ingest/email", a.handleIngestEmail)
	mux.HandleFunc("POST /v1/simulation/start", a.handleSimulationStart)
	mux.HandleFunc("POST /v1/simulation/stop", a.handleSimulationStop)
	mux.HandleFunc("GET /v1/simulation/status", a.handleSimulationStatus)
}

// handleLive is a minimal liveness probe (process is up).
func (a *API) handleLive(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "live"})
}

// handleReady confirms the gateway can reach configuration (backend URL set).
func (a *API) handleReady(w http.ResponseWriter, _ *http.Request) {
	if strings.TrimSpace(a.cfg.BackendURL) == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not_ready", "reason": "missing_backend_url"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

// handleDashboard returns rolling stats for the React ingest sub-window.
func (a *API) handleDashboard(w http.ResponseWriter, _ *http.Request) {
	uptime := int64(time.Since(a.startedAt).Seconds())
	writeJSON(w, http.StatusOK, a.stats.Snapshot(a.cfg.MaxEventsPerMinute, uptime))
}

// ingestBody is the JSON schema for POST /v1/ingest/email.
type ingestBody struct {
	SenderName  string `json:"senderName"`
	SenderEmail string `json:"senderEmail"`
	Subject     string `json:"subject"`
	Body        string `json:"body"`
}

// handleIngestEmail accepts a mailbox webhook payload and forwards to Node.
func (a *API) handleIngestEmail(w http.ResponseWriter, r *http.Request) {
	var body ingestBody
	if err := decodeJSON(r, &body); err != nil {
		a.stats.RecordError(false)
		gwmetrics.RecordError("invalid_json")
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if err := validateIngest(body); err != nil {
		a.stats.RecordError(false)
		gwmetrics.RecordError("validation")
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	result, err := a.backend.CreateMailboxReview(r.Context(), backend.EmailPayload{
		SenderName:  strings.TrimSpace(fallbackSenderName(body.SenderName)),
		SenderEmail: body.SenderEmail,
		Subject:     body.Subject,
		Body:        body.Body,
		Source:      "mailbox_ingest",
	})
	if err != nil {
		a.stats.RecordError(true)
		gwmetrics.RecordError("backend")
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "backend_failed", "detail": err.Error()})
		return
	}
	a.stats.RecordSuccess("webhook", false)
	gwmetrics.RecordSuccess("mailbox_ingest")
	writeJSON(w, http.StatusCreated, result)
}

// simulationStartBody configures dev synthetic traffic rate.
type simulationStartBody struct {
	EmailsPerMinute int `json:"emailsPerMinute"`
}

// handleSimulationStart enables dev simulation (403 outside dev).
func (a *API) handleSimulationStart(w http.ResponseWriter, r *http.Request) {
	if !a.cfg.IsDev() {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "simulation_dev_only"})
		return
	}
	var body simulationStartBody
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if err := a.simulation.Start(body.EmailsPerMinute); err != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	enabled, rate := a.simulation.Status()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"enabled":         enabled,
		"emailsPerMinute": rate,
		"maxEventsPerMinute": a.cfg.MaxEventsPerMinute,
	})
}

// handleSimulationStop disables dev simulation.
func (a *API) handleSimulationStop(w http.ResponseWriter, r *http.Request) {
	if !a.cfg.IsDev() {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "simulation_dev_only"})
		return
	}
	a.simulation.Stop()
	writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

// handleSimulationStatus returns current simulation configuration.
func (a *API) handleSimulationStatus(w http.ResponseWriter, _ *http.Request) {
	enabled, rate := a.simulation.Status()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"available":       a.cfg.IsDev(),
		"enabled":         enabled,
		"emailsPerMinute": rate,
		"maxEventsPerMinute": a.cfg.MaxEventsPerMinute,
	})
}

// validateIngest ensures required email fields are present.
func validateIngest(body ingestBody) error {
	if strings.TrimSpace(body.SenderEmail) == "" {
		return errString("missing_senderEmail")
	}
	if strings.TrimSpace(body.Subject) == "" {
		return errString("missing_subject")
	}
	if strings.TrimSpace(body.Body) == "" {
		return errString("missing_body")
	}
	return nil
}

type errString string

func (e errString) Error() string { return string(e) }

// fallbackSenderName supplies a default display name when webhooks omit senderName.
func fallbackSenderName(name string) string {
	if strings.TrimSpace(name) == "" {
		return "Unknown Sender"
	}
	return name
}

// decodeJSON reads and unmarshals a JSON request body.
func decodeJSON(r *http.Request, dest interface{}) error {
	defer r.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, dest)
}

// writeJSON serializes a response with Content-Type application/json.
func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
