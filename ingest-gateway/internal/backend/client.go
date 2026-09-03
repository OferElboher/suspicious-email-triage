// Package backend calls the Node.js internal ingest API to persist reviews.
//
// Why this package exists:
// The Go ingest-gateway is a thin edge service. It validates HTTP payloads from mail platforms
// but does NOT talk to MongoDB or Kafka directly. Instead it forwards JSON to Node Express routes
// that already implement Review creation, Kafka enqueue, and Postgres client registry.
//
// Typical call flows:
//
//  Flow A — real mailbox webhook ingest:
//    POST /v1/ingest/email (handler) → CreateMailboxReview → Node POST /ingest/internal/mailbox
//    → Node creates Review, enqueues Kafka → returns { id, status: "pending" }
//
//  Flow B — dev simulation tick:
//    simulation.Controller.emitOne → CreateMailboxReview (source=mailbox_simulation)
//
//  Flow C — mail platform registers default verdict webhook:
//    PUT /v1/clients/{id} (handler) → RegisterIngestClient → Node PUT /ingest/register/{id}
//    → Postgres ingest_clients row upserted
package backend

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// EmailPayload is the JSON body Node expects at POST /ingest/internal/mailbox.
//
// Usage flow:
//  1. handler.handleIngestEmail or simulation.emitOne fills this struct from incoming JSON.
//  2. CreateMailboxReview marshals it and POSTs to Node with X-Ingest-Internal-Token.
//  3. Node stores fields on the Review document (including optional ingestClientId / callbackUrl).
type EmailPayload struct {
	SenderName        string `json:"senderName"`
	SenderEmail       string `json:"senderEmail"`
	Subject           string `json:"subject"`
	Body              string `json:"body"`
	Source            string `json:"source"` // "mailbox_ingest" (webhook) or "mailbox_simulation" (dev)
	ExternalMessageID string `json:"externalMessageId,omitempty"`
	CallbackURL       string `json:"callbackUrl,omitempty"`   // per-message verdict webhook override
	IngestClientID    string `json:"ingestClientId,omitempty"` // selects default webhook from Postgres registry
}

// CreateResult is the JSON Node returns after a review is persisted (HTTP 201 body).
//
// Usage flow:
//  CreateMailboxReview unmarshals the response → handler returns review id to the mail platform.
type CreateResult struct {
	ID     string `json:"id"`     // MongoDB Review ObjectId as string
	Status string `json:"status"` // always "pending" at ingest time — verdict comes later via webhook
}

// RegisterClientPayload is the JSON body for mail platform webhook self-registration.
//
// Usage flow:
//  handler.handleRegisterClient parses HTTP body → RegisterIngestClient → Node upserts ingest_clients.
type RegisterClientPayload struct {
	DisplayName string `json:"displayName"`
	CallbackURL string `json:"callbackUrl"`
	IsActive    *bool  `json:"isActive"` // nil means "default true" on Node side
}

// RegisterClientResult wraps the client row Node returns after registration (HTTP 200 body).
type RegisterClientResult struct {
	Client struct {
		ClientID    string `json:"clientId"`
		DisplayName string `json:"displayName"`
		CallbackURL string `json:"callbackUrl"`
		IsActive    bool   `json:"isActive"`
	} `json:"client"`
}

// Client is an HTTP client that talks to Node internal ingest routes.
//
// Usage flow (constructed once in main.go):
//  NewClient(backendURL, ingestInternalToken, registrationToken)
//  → passed to handler.API and simulation.Controller
//  → CreateMailboxReview / RegisterIngestClient called per request or simulation tick
//
// Fields:
//  baseURL           — Node API root, e.g. "http://backend:3000" (no trailing slash)
//  token             — INGEST_INTERNAL_TOKEN → header X-Ingest-Internal-Token (mailbox create)
//  registrationToken — INGEST_CLIENT_REGISTRATION_TOKEN → header X-Ingest-Registration-Token
//  httpClient        — shared client with 15s timeout so one slow Node call cannot hang forever
type Client struct {
	baseURL           string
	token             string
	registrationToken string
	httpClient        *http.Client
}

// NewClient builds a Client used for the lifetime of the ingest-gateway process.
//
// Usage: called once from cmd/ingest-gateway/main.go after config.Load().
func NewClient(baseURL, token, registrationToken string) *Client {
	return &Client{
		baseURL:           baseURL,
		token:             token,
		registrationToken: registrationToken,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// CreateMailboxReview persists one email-shaped review through Node's internal ingest API.
//
// Usage flow:
//  caller (handler or simulation) → CreateMailboxReview(ctx, EmailPayload)
//  → POST {baseURL}/ingest/internal/mailbox
//  → Node validates token, creates Review, enqueues Kafka
//  → returns CreateResult or error with Node status code in message
//
// ctx: ties the HTTP call to request cancellation (simulation Stop cancels in-flight emits).
func (c *Client) CreateMailboxReview(ctx context.Context, payload EmailPayload) (CreateResult, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return CreateResult{}, fmt.Errorf("marshal payload: %w", err)
	}
	url := c.baseURL + "/ingest/internal/mailbox"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return CreateResult{}, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	// Shared secret — must match INGEST_INTERNAL_TOKEN in Node container env.
	req.Header.Set("X-Ingest-Internal-Token", c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return CreateResult{}, fmt.Errorf("http do: %w", err)
	}
	defer resp.Body.Close() // drain body so connection can be reused from the pool

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Include Node response body — helps distinguish 401 bad token vs 400 validation.
		return CreateResult{}, fmt.Errorf("backend status %d: %s", resp.StatusCode, string(raw))
	}
	var out CreateResult
	if err := json.Unmarshal(raw, &out); err != nil {
		return CreateResult{}, fmt.Errorf("decode response: %w", err)
	}
	return out, nil
}

// RegisterIngestClient upserts a mail platform's default verdict webhook URL in Postgres (via Node).
//
// Usage flow:
//  PUT /v1/clients/{clientId} (Go handler) → RegisterIngestClient(ctx, clientID, payload)
//  → PUT {baseURL}/ingest/register/{clientId} with X-Ingest-Registration-Token
//  → Node writes ingest_clients row → verdict delivery uses callback_url at analysis complete
func (c *Client) RegisterIngestClient(ctx context.Context, clientID string, payload RegisterClientPayload) (RegisterClientResult, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return RegisterClientResult{}, fmt.Errorf("marshal payload: %w", err)
	}
	url := c.baseURL + "/ingest/register/" + clientID
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return RegisterClientResult{}, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	// Narrower token than internal ingest — safe to give platform ops teams for self-registration only.
	req.Header.Set("X-Ingest-Registration-Token", c.registrationToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return RegisterClientResult{}, fmt.Errorf("http do: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return RegisterClientResult{}, fmt.Errorf("backend status %d: %s", resp.StatusCode, string(raw))
	}
	var out RegisterClientResult
	if err := json.Unmarshal(raw, &out); err != nil {
		return RegisterClientResult{}, fmt.Errorf("decode response: %w", err)
	}
	return out, nil
}
