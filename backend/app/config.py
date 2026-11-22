"""Server-only configuration. No secret is exposed through an API response."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Sensor keys guard ingestion and reading retrieval. The docs ask for at least
# 32 random characters, so anything shorter is rejected at startup instead of
# quietly protecting a device endpoint with a guessable secret.
MIN_SENSOR_API_KEY_LENGTH = 32


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
    sachet_max_cap_documents: int = 50
    weather_cache_seconds: int = 600
    sensor_api_key: str = ""
    sensor_stale_seconds: int = 900
    ml_model_path: Path = Path("ml/saved_models/temperature_model.joblib")
    ml_metadata_path: Path = Path("ml/saved_models/temperature_model.metadata.json")
    assistant_api_key: str = ""
    assistant_base_url: str = "https://api.openai.com/v1"
    assistant_model: str = "gpt-4o-mini"
    assistant_timeout_seconds: float = 30
    assistant_max_output_tokens: int = Field(default=700, ge=64, le=4096)
    assistant_rate_limit_per_minute: int = Field(default=20, ge=1)
    # Bounds how many regions a single /api/v1/risk fan-out probes in parallel.
    risk_map_workers: int = Field(default=4, ge=1, le=16)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @field_validator("sensor_api_key")
    @classmethod
    def sensor_key_is_strong(cls, value: str) -> str:
        key = value.strip()
        if key and len(key) < MIN_SENSOR_API_KEY_LENGTH:
            raise ValueError(
                f"sensor_api_key must be empty or at least {MIN_SENSOR_API_KEY_LENGTH} characters "
                "(generate a random value; do not use a short password)"
            )
        return key


@lru_cache
def get_settings() -> Settings:
    return Settings()
