from sqlalchemy import Column, Integer, String, Float, DateTime, JSON
from datetime import datetime
from app.db import Base

class OceanTelemetryHistory(Base):
    __tablename__ = "ocean_telemetry_history"

    id = Column(Integer, primary_key=True, index=True)
    timestamp_utc = Column(DateTime, default=datetime.utcnow, index=True)
    latitude = Column(Float, index=True)
    longitude = Column(Float, index=True)
    
    # Core variables
    wave_height_m = Column(Float)
    wave_period_s = Column(Float)
    swell_wave_height_m = Column(Float)
    current_velocity_ms = Column(Float)
    current_direction_deg = Column(Float)
    sea_surface_temp_c = Column(Float)
    
    # Store full JSON for flexibility
    raw_payload = Column(JSON)

class FleetPlatformHistory(Base):
    __tablename__ = "fleet_platform_history"

    id = Column(Integer, primary_key=True, index=True)
    timestamp_utc = Column(DateTime, default=datetime.utcnow, index=True)
    platform_id = Column(String, index=True)
    platform_type = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    status = Column(String)
    
    raw_payload = Column(JSON)
