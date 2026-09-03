// Package handler implements HTTP routes for mailbox ingest and dev simulation.
//
// This is the public edge of the Go ingest-gateway. Mail platforms and the React #ingest UI
// call these routes; handlers validate input, update in-memory stats, and delegate persistence
// to backend.Client (Node internal API).
//
// Route map (Go 1.22 method-aware ServeMux patterns):
//   GET  /health/live, /health/ready     — Docker/Kubernetes probes
//   GET  /metrics                        — Prometheus scrape
//   GET  /v1/stats/dashboard             — JSON for React #ingest charts
//   POST /v1/ingest/email                — production mailbox webhook ingest
//   PUT  /v1/clients/{clientId}          — mail platform verdict webhook self-registration
//   POST /v1/simulation/start|stop       — dev-only synthetic traffic (403 when not dev)
//   GET  /v1/simulation/status           — dev simulation state
package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/backend"
	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/config"
	gwlogger "github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/logger"
	gwmetrics "github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/metrics"
	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/simulation"
	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/stats"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// API wires dependencies for all HTTP handlers.
//
// Usage flow:
//  main → NewAPI(cfg, store, client, sim) → Register(mux) → http.Server serves mux
type API struct {
	cfg        config.Config
	stats      *stats.Store
	backend    *backend.Client
	simulation *simulation.Controller
	startedAt  time.Time // used to compute uptimeSeconds in dashboard JSON
}

// NewAPI constructs the HTTP handler bundle with all shared dependencies.
func NewAPI(cfg config.Config, store *stats.Store, client *backend.Client, sim *simulation.Controller) *API {
	return &API{
		cfg:        cfg,
		stats:      store,
		backend:    client,
		simulation: sim,
		startedAt:  time.Now(),
	}
}

// Register attaches all routes to a Go 1.22 ServeMux.
//
// Usage: main creates empty mux → api.Register(mux) → server.Handler = mux
// Pattern syntax "METHOD /path" avoids manual method checks inside each handler.
func (a *API) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /health/live", a.handleLive)
	mux.HandleFunc("GET /health/ready", a.handleReady)
	mux.Handle("GET /metrics", promhttp.Handler())
	mux.HandleFunc("GET /v1/stats/dashboard", a.handleDashboard)
	mux.HandleFunc("POST /v1/ingest/email", a.handleIngestEmail)
	mux.HandleFunc("PUT /v1/clients/{clientId}", a.handleRegisterClient)
	mux.HandleFunc("POST /v1/simulation/start", a.handleSimulationStart)
	mux.HandleFunc("POST /v1/simulation/stop", a.handleSimulationStop)
	mux.HandleFunc("GET /v1/simulation/status", a.handleSimulationStatus)
}

// handleLive — GET /health/live — liveness probe (process is running).
func (a *API) handleLive(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "live"})
}

// handleReady — GET /health/ready — readiness probe (config has backend URL).
func (a *API) handleReady(w http.ResponseWriter, _ *http.Request) {
	if strings.TrimSpace(a.cfg.BackendURL) == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not_ready", "reason": "missing_backend_url"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

// handleDashboard — GET /v1/stats/dashboard — JSON consumed by React #ingest via Node proxy.
func (a *API) handleDashboard(w http.ResponseWriter, _ *http.Request) {
	uptime := int64(time.Since(a.startedAt).Seconds())
	writeJSON(w, http.StatusOK, a.stats.Snapshot(a.cfg.MaxEventsPerMinute, uptime))
}

// ingestBody is the JSON schema external mail platforms send to POST /v1/ingest/email.
type ingestBody struct {
	SenderName        string `json:"senderName"`
	SenderEmail       string `json:"senderEmail"`
	Subject           string `json:"subject"`
	Body              string `json:"body"`
	ExternalMessageID string `json:"externalMessageId"`
	CallbackURL       string `json:"callbackUrl"`
	IngestClientID    string `json:"ingestClientId"`
}

// handleIngestEmail — POST /v1/ingest/email — primary production ingest path.
//
// Usage flow:
//  mail platform POST → validate JSON → backend.CreateMailboxReview → 201 { id, status }
//  → Node enqueues Kafka → Celery analyzes → verdict webhook later
func (a *API) handleIngestEmail(w http.ResponseWriter, r *http.Request) {
	var body ingestBody
	if err := decodeJSON(r, &body); err != nil {
		a.stats.RecordError(false)
		gwmetrics.RecordError("invalid_json")
		gwlogger.Warn("ingest", "invalid webhook JSON", map[string]interface{}{"error": err.Error()})
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if err := validateIngest(body); err != nil {
		a.stats.RecordError(false)
		gwmetrics.RecordError("validation")
		gwlogger.Warn("ingest", "webhook validation failed", map[string]interface{}{"error": err.Error()})
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	result, err := a.backend.CreateMailboxReview(r.Context(), backend.EmailPayload{
		SenderName:        strings.TrimSpace(fallbackSenderName(body.SenderName)),
		SenderEmail:       body.SenderEmail,
		Subject:           body.Subject,
		Body:              body.Body,
		Source:            "mailbox_ingest",
		ExternalMessageID: strings.TrimSpace(body.ExternalMessageID),
		CallbackURL:       strings.TrimSpace(body.CallbackURL),
		IngestClientID:    strings.TrimSpace(body.IngestClientID),
	})
	if err != nil {
		a.stats.RecordError(true)
		gwmetrics.RecordError("backend")
		gwlogger.Error("ingest", "Node internal mailbox create failed", map[string]interface{}{
			"error": err.Error(), "senderEmail": body.SenderEmail,
		})
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "backend_failed", "detail": err.Error()})
		return
	}
	a.stats.RecordSuccess("webhook", false)
	gwmetrics.RecordSuccess("mailbox_ingest")
	gwlogger.Info("ingest", "mailbox webhook persisted", map[string]interface{}{
		"reviewId": result.ID, "source": "mailbox_ingest", "senderEmail": body.SenderEmail,
	})
	writeJSON(w, http.StatusCreated, result)
}

// registerClientBody is the JSON schema for PUT /v1/clients/{clientId}.
type registerClientBody struct {
	DisplayName string `json:"displayName"`
	CallbackURL string `json:"callbackUrl"`
	IsActive    *bool  `json:"isActive"`
}

// handleRegisterClient — PUT /v1/clients/{clientId} — proxy for mail platform webhook registration.
//
// Usage flow:
//  platform PUT with X-Ingest-Registration-Token → backend.RegisterIngestClient → Node Postgres upsert
func (a *API) handleRegisterClient(w http.ResponseWriter, r *http.Request) {
	clientID := strings.TrimSpace(r.PathValue("clientId"))
	if clientID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_clientId"})
		return
	}
	var body registerClientBody
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if strings.TrimSpace(body.DisplayName) == "" || strings.TrimSpace(body.CallbackURL) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_required_fields"})
		return
	}
	result, err := a.backend.RegisterIngestClient(r.Context(), clientID, backend.RegisterClientPayload{
		DisplayName: strings.TrimSpace(body.DisplayName),
		CallbackURL: strings.TrimSpace(body.CallbackURL),
		IsActive:    body.IsActive,
	})
	if err != nil {
		gwlogger.Error("ingest", "client registration proxy failed", map[string]interface{}{
			"clientId": clientID, "error": err.Error(),
		})
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "registration_failed", "detail": err.Error()})
		return
	}
	gwlogger.Info("ingest", "mail platform registered callback URL", map[string]interface{}{
		"clientId": clientID, "callbackUrl": result.Client.CallbackURL,
	})
	writeJSON(w, http.StatusOK, result)
}

// simulationStartBody is the JSON body for POST /v1/simulation/start.
type simulationStartBody struct {
	EmailsPerMinute int `json:"emailsPerMinute"`
}

// handleSimulationStart — POST /v1/simulation/start — starts dev synthetic traffic (403 outside dev).
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
		gwlogger.Warn("simulation", "simulation start rejected", map[string]interface{}{"error": err.Error()})
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	enabled, rate := a.simulation.Status()
	gwlogger.Info("simulation", "simulation started", map[string]interface{}{"emailsPerMinute": rate})
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"enabled":            enabled,
		"emailsPerMinute":    rate,
		"maxEventsPerMinute": a.cfg.MaxEventsPerMinute,
	})
}

// handleSimulationStop — POST /v1/simulation/stop — stops dev synthetic traffic.
func (a *API) handleSimulationStop(w http.ResponseWriter, r *http.Request) {
	if !a.cfg.IsDev() {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "simulation_dev_only"})
		return
	}
	a.simulation.Stop()
	gwlogger.Info("simulation", "simulation stopped", nil)
	writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

// handleSimulationStatus — GET /v1/simulation/status — returns simulation enabled flag and rate.
func (a *API) handleSimulationStatus(w http.ResponseWriter, _ *http.Request) {
	enabled, rate := a.simulation.Status()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"available":          a.cfg.IsDev(),
		"enabled":            enabled,
		"emailsPerMinute":    rate,
		"maxEventsPerMinute": a.cfg.MaxEventsPerMinute,
	})
}

// validateIngest ensures required email fields are present before calling Node.
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

// errString is a lightweight validation error type (implements error interface).
type errString string

// Error returns the validation message string.
func (e errString) Error() string { return string(e) }

// fallbackSenderName supplies "Unknown Sender" when webhooks omit senderName.
func fallbackSenderName(name string) string {
	if strings.TrimSpace(name) == "" {
		return "Unknown Sender"
	}
	return name
}

// decodeJSON reads and unmarshals a JSON request body (max 1 MiB).
func decodeJSON(r *http.Request, dest interface{}) error {
	defer r.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // cap prevents memory exhaustion
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, dest)
}

// writeJSON serializes payload as application/json with the given HTTP status code.
func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
