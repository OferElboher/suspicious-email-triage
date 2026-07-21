# =============================================================================
# Mailbox ingest-gateway — multi-stage Docker build
# =============================================================================
# Pattern: multi-stage build — compile in a full Go toolchain image, run in a
# minimal runtime image. This keeps the final container small (~20 MB) and
# reduces attack surface (no shell, no package manager in production stage).
#
# Technology:
#   - golang:1.22-alpine  — builder with Go compiler and module cache
#   - distroless/static   — Google distroless base (non-root, no shell)
#   - CGO_ENABLED=0       — pure Go binary (static link, runs on distroless)
#
# Build context: repository root (see docker-compose.yml build.context: ../../)
# so COPY paths are prefixed with ingest-gateway/.
# =============================================================================

# --- Stage 1: builder -------------------------------------------------------
# AS builder names this stage so stage 2 can COPY --from=builder.
FROM golang:1.22-alpine AS builder

# WORKDIR creates /src/ingest-gateway and sets it as the working directory
# for subsequent RUN/COPY commands (like cd in a shell script).
WORKDIR /src/ingest-gateway

# Copy go.mod and go.sum first — Docker layer cache trick: dependency download
# only re-runs when these files change, not on every source edit.
COPY ingest-gateway/go.mod ingest-gateway/go.sum ./

# Download modules declared in go.mod into the image layer (prometheus client, etc.).
RUN go mod download

# Copy the rest of the Go source tree (cmd/, internal/, etc.).
COPY ingest-gateway/ ./

# Build a statically linked Linux binary:
#   CGO_ENABLED=0 — disable cgo so the binary has no libc dependency
#   GOOS=linux    — target Linux even when building on macOS/Windows
#   -o /ingest-gateway — output path outside WORKDIR for a clean COPY in stage 2
RUN CGO_ENABLED=0 GOOS=linux go build -o /ingest-gateway ./cmd/ingest-gateway

# --- Stage 2: runtime -------------------------------------------------------
# distroless/static-debian12:nonroot — no shell, no apt; only the binary runs.
# "nonroot" variant includes a non-root user (uid 65532) for security.
FROM gcr.io/distroless/static-debian12:nonroot

# Copy only the compiled binary from the builder stage (not source or Go toolchain).
COPY --from=builder /ingest-gateway /ingest-gateway

# Document the port for operators and compose; does not publish by itself.
EXPOSE 8080

# Run as non-root (matches distroless nonroot image default user).
USER nonroot:nonroot

# exec form ENTRYPOINT — PID 1 is the Go process (receives SIGTERM for graceful shutdown).
ENTRYPOINT ["/ingest-gateway"]
