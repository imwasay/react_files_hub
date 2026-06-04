.PHONY: up down logs build-frontend deploy-vps push-cert

# ── Production ───────────────────────────────────────────────────────────────

# Build frontend + start backend (works for both directory and storage nodes)
up: build-frontend
	docker compose up -d --build

# Start with ChromaDB (directory node with semantic search)
up-dir: build-frontend
	docker compose --profile directory up -d --build

down:
	docker compose --profile directory down

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

# ── Build ────────────────────────────────────────────────────────────────────

build-frontend:
	cd frontend && npm ci && npm run build

# ── Deploy ───────────────────────────────────────────────────────────────────

deploy-vps: build-frontend
	bash scripts/deploy-vps.sh

push-cert:
	bash nginx_others/push-cert.sh
