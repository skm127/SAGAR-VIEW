from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os
import logging
from app.config import get_settings

logger = logging.getLogger("oceanx.db")
settings = get_settings()

# Fallback to local SQLite if Postgres isn't running
if settings.database_url:
    SQLALCHEMY_DATABASE_URL = settings.database_url
else:
    # Local fallback
    os.makedirs(settings.data_dir, exist_ok=True)
    sqlite_path = os.path.abspath(os.path.join(settings.data_dir, "oceanx_history.db"))
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{sqlite_path}"

logger.info(f"Initializing database at: {SQLALCHEMY_DATABASE_URL}")

# SQLite needs check_same_thread=False
connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args=connect_args
)

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
