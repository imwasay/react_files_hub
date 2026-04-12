from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool
from contextlib import contextmanager
from config import get_settings
import logging

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


def _get_db_path() -> str:
    settings = get_settings()
    if settings.is_directory:
        return settings.db_path
    return settings.db_path.replace("registry.db", "replica.db")


def create_db_engine():
    db_path = _get_db_path()
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

    return engine


engine = create_db_engine()
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def init_db():
    from models import user, node, mapped_root, file, share, file_cache, cache_key
    Base.metadata.create_all(bind=engine)
    logger.info("Database initialized at %s", _get_db_path())


@contextmanager
def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_db_dep():
    """FastAPI dependency."""
    with get_db() as db:
        yield db
