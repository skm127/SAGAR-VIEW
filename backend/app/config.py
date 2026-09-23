"""Application configuration loaded from environment variables."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
import os


class Settings(BaseSettings):
    """SAGAR VIEW backend settings."""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "SAGAR VIEW API"
    debug: bool = False
    data_dir: str = "data"
    model_data_path: str = ""
    argo_data_path: str = ""
    data_refresh_interval_hours: int = 6
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    database_url: str | None = None
    redis_url: str | None = None
    copernicus_username: str | None = None
    copernicus_password: str | None = None
    argo_erddap_url: str = "https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats"
    bob_lat_min: float = 0.0
    bob_lat_max: float = 28.0
    bob_lon_min: float = 60.0
    bob_lon_max: float = 100.0
    bob_depth_max: float = 500.0
    # Run a live refresh at startup when the data on disk is missing, synthetic
    # or older than this many hours. Set to 0 to disable (e.g. in tests/CI).
    startup_refresh_max_age_hours: float = 12.0
    argo_days_back: int = 21
    model_days_back: int = 4
    model_days_forward: int = 2

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.model_data_path:
            self.model_data_path = os.path.join(self.data_dir, "model", "live_ocean_model.nc")
        if not self.argo_data_path:
            self.argo_data_path = os.path.join(self.data_dir, "argo", "argo_live_profiles.json")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

@lru_cache()
def get_settings() -> Settings:
    return Settings()
