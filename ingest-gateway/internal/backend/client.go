// Package backend calls the Node.js internal ingest API to persist reviews.
//
// Pattern: sidecar/gateway delegates domain logic to the existing Express API rather than
// duplicating MongoDB schemas in Go. The gateway focuses on network I/O and rate control.
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

// EmailPayload is the JSON body accepted by POST /ingest/internal/mailbox on Node.
type EmailPayload struct {
	SenderName          string `json:"senderName"`
	SenderEmail         string `json:"senderEmail"`
	Subject             string `json:"subject"`
	Body                string `json:"body"`
	Source              string `json:"source"`
	ExternalMessageID   string `json:"externalMessageId,omitempty"`
	CallbackURL         string `json:"callbackUrl,omitempty"`
	IngestClientID      string `json:"ingestClientId,omitempty"`
}

// CreateResult is the Node response after a review document is persisted.
type CreateResult struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// Client performs authenticated HTTP calls to the Node API.
type Client struct {
	baseURL    string
	token      string
	httpClient *http.Client
}

// NewClient builds a backend HTTP client with a reasonable timeout.
func NewClient(baseURL, token string) *Client {
	return &Client{
		baseURL: baseURL,
		token:   token,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// CreateMailboxReview posts one email-shaped review to the internal Node route.
func (c *Client) CreateMailboxReview(ctx context.Context, payload EmailPayload) (CreateResult, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return CreateResult{}, fmt.Errorf("marshal payload: %w", err)
	}
	url := c.baseURL + "/ingest/internal/mailbox"
	// NewRequestWithContext ties the outbound HTTP call to caller cancellation (simulation Stop).
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return CreateResult{}, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	// Shared secret — same value as INGEST_INTERNAL_TOKEN in Node and Go containers.
	req.Header.Set("X-Ingest-Internal-Token", c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return CreateResult{}, fmt.Errorf("http do: %w", err)
	}
	defer resp.Body.Close() // always drain/close body so the connection can be reused

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Include response body in error — helps debug 401 invalid token vs 400 validation.
		return CreateResult{}, fmt.Errorf("backend status %d: %s", resp.StatusCode, string(raw))
	}
	var out CreateResult
	if err := json.Unmarshal(raw, &out); err != nil {
		return CreateResult{}, fmt.Errorf("decode response: %w", err)
	}
	return out, nil
}
