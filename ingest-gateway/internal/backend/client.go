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
	SenderName        string `json:"senderName"`
	SenderEmail       string `json:"senderEmail"`
	Subject           string `json:"subject"`
	Body              string `json:"body"`
	Source            string `json:"source"`
	ExternalMessageID string `json:"externalMessageId,omitempty"`
	CallbackURL       string `json:"callbackUrl,omitempty"`
	IngestClientID    string `json:"ingestClientId,omitempty"`
}

// CreateResult is the Node response after a review document is persisted.
type CreateResult struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// RegisterClientPayload is the JSON body for mail platform webhook self-registration.
type RegisterClientPayload struct {
	DisplayName string `json:"displayName"`
	CallbackURL string `json:"callbackUrl"`
	IsActive    *bool  `json:"isActive"`
}

// RegisterClientResult is the Node response after upserting ingest_clients.
type RegisterClientResult struct {
	Client struct {
		ClientID    string `json:"clientId"`
		DisplayName string `json:"displayName"`
		CallbackURL string `json:"callbackUrl"`
		IsActive    bool   `json:"isActive"`
	} `json:"client"`
}

// Client performs authenticated HTTP calls to the Node API.
type Client struct {
	baseURL            string
	token              string
	registrationToken  string
	httpClient         *http.Client
}

// NewClient builds a backend HTTP client with a reasonable timeout.
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

// CreateMailboxReview posts one email-shaped review to the internal Node route.
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
	req.Header.Set("X-Ingest-Internal-Token", c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return CreateResult{}, fmt.Errorf("http do: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return CreateResult{}, fmt.Errorf("backend status %d: %s", resp.StatusCode, string(raw))
	}
	var out CreateResult
	if err := json.Unmarshal(raw, &out); err != nil {
		return CreateResult{}, fmt.Errorf("decode response: %w", err)
	}
	return out, nil
}

// RegisterIngestClient proxies mail platform self-registration to Node PUT /ingest/register/:clientId.
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
