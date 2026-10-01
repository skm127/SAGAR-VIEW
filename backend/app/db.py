from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os
import logging
from app.config import get_settings

logger = logging.getLogger("oceanx.db")
settings = get_settings()


def _build_sqlite_url():
    """Build a local SQLite URL as fallback."""
    os.makedirs(settings.data_dir, exist_ok=True)
    sqlite_path = os.path.abspath(os.path.join(settings.data_dir, "oceanx_history.db"))
    return f"sqlite:///{sqlite_path}"


def _create_engine():
    """Create the SQLAlchemy engine, falling back to SQLite if the configured
    database driver (e.g. psycopg for PostgreSQL) is not installed."""
    url = settings.database_url if settings.database_url else _build_sqlite_url()
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}

    try:
        eng = create_engine(url, connect_args=connect_args)
        # Force a real connection attempt so missing drivers surface now
        eng.connect().close()
        logger.info(f"Database connected: {url.split('@')[-1] if '@' in url else url}")
        return eng
    except Exception as exc:
        if settings.database_url:
            logger.warning(
                f"Cannot connect to configured DATABASE_URL ({exc}); "
                "falling back to local SQLite."
            )
            fallback = _build_sqlite_url()
            return create_engine(fallback, connect_args={"check_same_thread": False})
        raise


engine = _create_engine()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def init_db():
    from app.models.db_models import OceanTelemetryHistory, FleetPlatformHistory
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
