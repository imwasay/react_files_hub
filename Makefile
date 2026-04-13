.PHONY: dev dev-down dev-logs dev-dir dev-storage prod prod-down prod-logs prod-backend build-frontend deploy-dir deploy-storage deploy-vps push-cert

# ── development (Linux Mint desktop) ─────────────────────────────────────────

dev:
	docker compose -f docker-compose.dev.yml up --build

dev-down:
	docker compose -f docker-compose.dev.yml down

dev-logs:
	docker compose -f docker-compose.dev.yml logs -f

dev-backend:
	docker compose -f docker-compose.dev.yml logs -f backend

dev-frontend:
	docker compose -f docker-compose.dev.yml logs -f frontend

# ── production (directory node) ─────────────────────────────────────────────────

prod: build-frontend
	docker compose up -d --build

prod-down:
	docker compose down

prod-logs:
	docker compose logs -f

prod-backend:
	docker compose logs -f backend

build-frontend:
	cd frontend && npm ci && npm run build

deploy-dir: build-frontend
	bash scripts/deploy-dir.sh

deploy-storage:
	bash scripts/deploy-storage.sh

deploy-vps: build-frontend
	bash scripts/deploy-vps.sh

push-cert:
	bash scripts/push-cert.sh

logs-dir:
	docker compose -f docker-compose.directory.yml logs -f

logs-storage:
	docker compose -f docker-compose.storage.yml logs -f
