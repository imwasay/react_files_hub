.PHONY: dev-dir dev-storage build-frontend deploy-dir deploy-storage deploy-vps push-cert

dev-dir:
	cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000

dev-storage:
	NODE_MODE=storage cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000

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
