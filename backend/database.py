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

    from sqlalchemy import text
    try:
        with get_db() as db:
            # Create FTS5 virtual table for full-text search
            db.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(
                    file_id UNINDEXED,
                    filename,
                    relative_path,
                    mime_type,
                    extracted_text,
                    content=files,
                    tokenize='porter unicode61'
                );
            """))
            db.commit()
        logger.info("FTS5 table verified.")
    except Exception as e:
        logger.warning("FTS5 table creation failed: %s", e)

    # Clean up duplicate files (keeping one per node_id + real_path)
    from sqlalchemy import text
    try:
        with get_db() as db:
            db.execute(text(
                "DELETE FROM files WHERE id NOT IN ("
                "  SELECT MIN(id) FROM files GROUP BY node_id, real_path"
                ")"
            ))
            # Also create unique index to enforce this at database level
            db.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_files_node_real_path "
                "ON files (node_id, real_path)"
            ))
            db.commit()
        logger.info("Database duplicate files cleaned up and unique index verified.")
    except Exception as e:
        logger.warning("Database duplicate cleanup/index creation failed: %s", e)

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
