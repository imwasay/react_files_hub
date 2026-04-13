from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import os
import uuid

from passlib.context import CryptContext
from sqlalchemy.exc import IntegrityError
from config import get_settings
from database import init_db, get_db
from models.user import User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()
pwd = CryptContext(schemes=["bcrypt", "pbkdf2_sha256"], deprecated="auto")
admin_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def bootstrap_admin_user():
    if not (settings.admin_username and settings.admin_email and settings.admin_password):
        return

    try:
        with get_db() as db:
            existing = db.query(User).filter(User.email == settings.admin_email).first()
            if existing:
                return

            user = User(
                id=str(uuid.uuid4()),
                username=settings.admin_username,
                email=settings.admin_email,
                password_hash=admin_pwd.hash(settings.admin_password),
                role="owner",
            )
            db.add(user)
            db.flush()
        logger.info("Created admin user %s", settings.admin_email)
    except IntegrityError:
        logger.info("Admin user %s already exists; skipping bootstrap.", settings.admin_email)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting files_hub node — mode: %s", settings.node_mode)
    init_db()
    bootstrap_admin_user()

    if settings.is_storage:
        from agent.heartbeat import start_heartbeat
        from agent.watcher import start_watcher
        from agent.replica_sync import start_replica_sync
        await start_heartbeat()
        await start_watcher()
        await start_replica_sync()

    yield

    logger.info("Shutting down files_hub node")


app = FastAPI(
    title="files_hub",
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
