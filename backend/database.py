from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool
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
        connect_args={
            "check_same_thread": False,
            "timeout": 30
        },
        poolclass=NullPool,  # CRITICAL CHANGE
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()

        # DO NOT use WAL in Docker + bind mounts
        cursor.execute("PRAGMA journal_mode=DELETE")

        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

    return engine


engine = create_db_engine()
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def init_db():
    # Import all models to register them with SQLAlchemy
    import models.user
    import models.node
    import models.mapped_root
    import models.file
    import models.share
    import models.file_cache
    import models.cache_key
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
    with get_db() as db:
        yield db
