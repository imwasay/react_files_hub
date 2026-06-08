# ═══════════════════════════════════════════════════════════════════════════════
# Files Hub — Multi-Stage Dockerfile
#
# Stage 1 (frontend): Builds the React/Vite app inside Docker.
#                     The VITE_FALLBACK_NODE_URLS build arg is baked in at
#                     image build time so storage nodes know about fallbacks
#                     even on a fresh browser session.
#
# Stage 2 (backend):  Python FastAPI image with the compiled frontend dist
#                     baked directly in at /app/frontend/dist.
#                     No nginx, no volume mounts, no separate deploy steps.
#                     Run the container and "/" serves the React SPA.
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Build the React frontend ─────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /frontend

# Cache dependencies first
COPY frontend/package*.json ./
RUN npm install

# Copy source and build
COPY frontend/ .

# Accept fallback node URLs at build time (e.g. https://alphaservers.dns.army)
ARG VITE_FALLBACK_NODE_URLS=""
ENV VITE_FALLBACK_NODE_URLS=${VITE_FALLBACK_NODE_URLS}

RUN npm run build


# ── Stage 2: Python backend with baked-in frontend ────────────────────────────
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libmagic1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .

# Install backend dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Copy compiled frontend from Stage 1 — baked directly into the image
COPY --from=frontend-builder /frontend/dist /app/frontend/dist

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
