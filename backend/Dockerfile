# ── Stage 1: Build ────────────────────────────────────────────────────────────
# Use the official Go image as our builder. We use a specific version for
# reproducibility.
FROM golang:1.22-alpine AS builder

# Install git (needed by `go mod download` for some VCS resolvers)
RUN apk add --no-cache git

WORKDIR /app

# Copy dependency manifests first so Docker can cache the module download layer.
COPY go.mod go.sum ./
RUN go mod download

# Copy source code and build a statically linked binary.
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /glitchrun-server .

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
# Use a minimal scratch image — no shell, no utilities, just the binary.
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy only the compiled binary from the builder stage.
COPY --from=builder /glitchrun-server .

# Expose the port the server listens on (must match PORT env var)
EXPOSE 8080

# Run the binary
ENTRYPOINT ["./glitchrun-server"]
