# Multi-stage build: compile a static Go binary, run in a minimal distroless image.
FROM golang:1.22-alpine AS builder
WORKDIR /src/ingest-gateway
COPY ingest-gateway/go.mod ingest-gateway/go.sum ./
RUN go mod download
COPY ingest-gateway/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /ingest-gateway ./cmd/ingest-gateway

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /ingest-gateway /ingest-gateway
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/ingest-gateway"]
