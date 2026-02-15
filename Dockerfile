# ============================================================
# SMTP API - Docker Image
# Multi-stage build for minimal production image
# ============================================================

# --- Build stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install all dependencies (including dev)
COPY package*.json ./
RUN npm ci

# Copy source code and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# --- Production stage ---
FROM node:20-alpine

WORKDIR /app

# Install docker CLI (needed for docker exec commands to manage SMTP server)
RUN apk add --no-cache docker-cli

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built output
COPY --from=builder /app/dist/ ./dist/

# Copy shell scripts for SMTP management
COPY scripts/ ./scripts/
RUN chmod +x ./scripts/*.sh

# Expose the API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the API server
CMD ["node", "dist/index.js"]
