from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import os

from config import get_settings
from database import init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting ntrides node — mode: %s", settings.node_mode)
    init_db()

    if settings.is_storage:
        from agent.heartbeat import start_heartbeat
        from agent.watcher import start_watcher
        from agent.replica_sync import start_replica_sync
        await start_heartbeat()
        await start_watcher()
        await start_replica_sync()

    yield

    logger.info("Shutting down ntrides node")


app = FastAPI(
    title="ntrides",
    version=settings.node_version,
    docs_url="/api/docs" if settings.is_directory else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# always mount auth
from routers import auth
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])

# directory-only routers
if settings.is_directory:
    from routers import nodes, roots, files, shares, search, cache, ingest, replica, admin
    app.include_router(nodes.router,   prefix="/api/v1/nodes",   tags=["nodes"])
    app.include_router(roots.router,   prefix="/api/v1/roots",   tags=["roots"])
    app.include_router(files.router,   prefix="/api/v1/files",   tags=["files"])
    app.include_router(shares.router,  prefix="/api/v1/shares",  tags=["shares"])
    app.include_router(search.router,  prefix="/api/v1/search",  tags=["search"])
    app.include_router(cache.router,   prefix="/api/v1/cache",   tags=["cache"])
    app.include_router(ingest.router,  prefix="/api/v1/ingest",  tags=["ingest"])
    app.include_router(replica.router, prefix="/api/v1/replica", tags=["replica"])
    app.include_router(admin.router,   prefix="/api/v1/admin",   tags=["admin"])

    if settings.serve_react and os.path.isdir(settings.react_static_path):
        app.mount("/", StaticFiles(directory=settings.react_static_path, html=True), name="react")

# storage-only routers
if settings.is_storage:
    from routers import files as files_router
    app.include_router(files_router.router, prefix="/api/v1/files", tags=["files"])


@app.get("/api/v1/health")
async def health():
    return {
        "node_mode": settings.node_mode,
        "node_id": settings.node_id,
        "version": settings.node_version,
        "status": "ok",
    }
