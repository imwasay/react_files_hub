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
from models.node import Node

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()
pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


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
                password_hash=pwd.hash(settings.admin_password),
                role="owner",
            )
            db.add(user)
            db.flush()
        logger.info("Created admin user %s", settings.admin_email)
    except IntegrityError:
        logger.info("Admin user %s already exists; skipping bootstrap.", settings.admin_email)


def bootstrap_self_node():
    """Register the Directory Node as a node in its own registry (self-node).

    This must run after bootstrap_admin_user() so the owner FK exists.
    Idempotent — does nothing if the node ID is already registered.
    """
    if not settings.self_node_id:
        logger.info("SELF_NODE_ID not set — skipping self-node bootstrap.")
        return

    try:
        with get_db() as db:
            existing = db.query(Node).filter(Node.node_id == settings.self_node_id).first()
            if existing:
                # Update status to online every restart
                existing.status = "online"
                existing.ipv4 = settings.node_public_ipv4
                existing.ipv6 = settings.node_public_ipv6
                existing.wg_ip = settings.node_wg_ip
                logger.info("Self-node '%s' already registered — marked online.", settings.self_node_id)
                return

            # Find the owner user (admin bootstrapped user or first owner)
            owner = db.query(User).filter(User.role == "owner").first()
            if not owner:
                logger.warning("No owner user found — cannot bootstrap self-node yet.")
                return

            node = Node(
                id=str(uuid.uuid4()),
                node_id=settings.self_node_id,
                subdomain=settings.self_node_subdomain,
                wg_ip=settings.node_wg_ip,
                ipv4=settings.node_public_ipv4,
                ipv6=settings.node_public_ipv6,
                host_os=settings.host_os,
                status="online",
                owner_id=owner.id,
            )
            db.add(node)
            db.flush()
        logger.info("Self-node '%s' bootstrapped successfully.", settings.self_node_id)
    except IntegrityError:
        logger.info("Self-node '%s' already exists (race); skipping.", settings.self_node_id)
    except Exception as e:
        logger.error("Self-node bootstrap failed: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting files_hub node — mode: %s", settings.node_mode)
    init_db()
    bootstrap_admin_user()
    bootstrap_self_node()

    if settings.is_storage:
        from agent.heartbeat import start_heartbeat
        from agent.watcher import start_watcher
        from agent.replica_sync import start_replica_sync
        await start_heartbeat()
        await start_watcher()
        await start_replica_sync()

    if settings.is_directory:
        # Self-node: run watcher + ingestion locally.
        # Skip heartbeat (no point pinging yourself) and replica_sync (we ARE the source).
        from agent.watcher import start_watcher_self_node
        from agent.ingestion import process_queue
        await start_watcher_self_node()
        await process_queue()

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

# ── health — registered before StaticFiles mount ──────────────────────────────
@app.get("/api/v1/health")
async def health():
    return {
        "node_mode": settings.node_mode,
        "node_id": settings.node_id or settings.self_node_id,
        "version": settings.node_version,
        "status": "ok",
    }

# ── auth ──────────────────────────────────────────────────────────────────────
from routers import auth
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])

# ── directory-only routers ────────────────────────────────────────────────────
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

# ── storage-only routers ──────────────────────────────────────────────────────
if settings.is_storage:
    from routers import files as files_router
    app.include_router(files_router.router, prefix="/api/v1/files", tags=["files"])

# ── static files LAST — catches everything not matched above ──────────────────
if settings.is_directory and settings.serve_react and os.path.isdir(settings.react_static_path):
    app.mount("/", StaticFiles(directory=settings.react_static_path, html=True), name="react")
