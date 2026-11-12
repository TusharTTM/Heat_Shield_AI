from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Server-only configuration. No secret is exposed through an API response."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str = "sqlite:///./heatshield.db"
    cors_origins: str = "http://localhost:5173,https://tusharttm.github.io"
    log_level: str = "INFO"
    weather_base_url: str = "https://api.open-meteo.com/v1/forecast"
    weather_timeout_seconds: float = 10
    air_quality_base_url: str = "https://air-quality-api.open-meteo.com/v1/air-quality"
    air_quality_timeout_seconds: float = 10
    data_gov_in_api_key: str = ""
    cpcb_base_url: str = "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
    cpcb_timeout_seconds: float = 10
    cpcb_cache_seconds: int = 3600
    sachet_enabled: bool = True
    sachet_feed_url: str = "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml"
    sachet_timeout_seconds: float = 12
    sachet_cache_seconds: int = 300
    sachet_max_cap_documents: int = 150
    weather_cache_seconds: int = 600
    sensor_api_key: str = ""
    sensor_stale_seconds: int = 900
    ml_model_path: Path = Path("ml/saved_models/temperature_model.joblib")
    ml_metadata_path: Path = Path("ml/saved_models/temperature_model.metadata.json")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
