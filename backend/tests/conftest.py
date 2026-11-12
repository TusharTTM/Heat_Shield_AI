from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.air_quality import AirQualityClient
from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.weather import WeatherClient


class ProviderStub:
    def __init__(self):
        self.fail = False
        self.current_calls = 0
        self.forecast_calls = 0
        self.air_quality_calls = 0
        self.transport = httpx.MockTransport(self.handler)

    def handler(self, request: httpx.Request) -> httpx.Response:
        if self.fail:
            return httpx.Response(503, json={"error": True, "reason": "fixture outage"})
        params = request.url.params
        if request.url.host == "air-provider.test":
            self.air_quality_calls += 1
            now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
            payload = {
                "latitude": float(params["latitude"]), "longitude": float(params["longitude"]),
                "timezone": "Asia/Kolkata", "utc_offset_seconds": 19800,
                "current": {
                    "time": now.isoformat(), "us_aqi": 125.0, "european_aqi": 55.0,
                    "pm10": 88.4, "pm2_5": 45.2, "carbon_monoxide": 420.5,
                    "nitrogen_dioxide": 31.1, "sulphur_dioxide": 8.2, "ozone": 64.3,
                },
            }
            if "hourly" in params:
                payload["hourly"] = {
                    "time": [(now + timedelta(hours=index)).isoformat() for index in range(30)],
                    "us_aqi": [125.0 + index for index in range(30)],
                    "european_aqi": [55.0 + index for index in range(30)],
                    "pm10": [88.4 + index for index in range(30)],
                    "pm2_5": [45.2 + index for index in range(30)],
                    "carbon_monoxide": [420.5 + index for index in range(30)],
                    "nitrogen_dioxide": [31.1 + index for index in range(30)],
                    "sulphur_dioxide": [8.2 + index for index in range(30)],
                    "ozone": [64.3 + index for index in range(30)],
                }
            return httpx.Response(200, json=payload)
        if "current" in params:
            self.current_calls += 1
            return httpx.Response(200, json={
                "latitude": float(params["latitude"]), "longitude": float(params["longitude"]),
                "timezone": "UTC", "utc_offset_seconds": 0,
                "current": {
                    "time": datetime.now(timezone.utc).isoformat(), "temperature_2m": 40.0,
                    "relative_humidity_2m": 50.0, "apparent_temperature": 41.2,
                    "weather_code": 2, "wind_speed_10m": 12.0,
                },
            })
        self.forecast_calls += 1
        today = datetime.now(timezone.utc).date()
        dates = [(today + timedelta(days=index)).isoformat() for index in range(5)]
        return httpx.Response(200, json={
            "latitude": float(params["latitude"]), "longitude": float(params["longitude"]),
            "timezone": "Asia/Kolkata", "utc_offset_seconds": 19800,
            "daily": {
                "time": dates, "temperature_2m_max": [40 + index for index in range(5)],
                "temperature_2m_min": [28 + index for index in range(5)],
                "relative_humidity_2m_mean": [50] * 5, "wind_speed_10m_max": [14] * 5,
                "precipitation_sum": [0] * 5, "weather_code": [0, 1, 2, 3, 61],
            },
        })


@pytest.fixture
def provider():
    return ProviderStub()


@pytest.fixture
def settings(tmp_path):
    return Settings(
        app_env="test", database_url=f"sqlite:///{tmp_path}/test.db", cors_origins="http://localhost:5173",
        weather_cache_seconds=600, sensor_api_key="test-sensor-key-with-sufficient-length",
        ml_model_path=tmp_path / "missing-model.joblib", ml_metadata_path=tmp_path / "missing-model.json",
    )


@pytest.fixture
def client(settings, provider):
    weather = WeatherClient("https://provider.test/forecast", transport=provider.transport)
    air_quality = AirQualityClient("https://air-provider.test/air-quality", transport=provider.transport)
    app = create_app(settings, weather, air_quality)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth():
    return {"X-Sensor-Key": "test-sensor-key-with-sufficient-length"}


@pytest.fixture
def simulated_reading():
    return {
        "device_id": "simulated-test-device", "observed_at": datetime.now(timezone.utc).isoformat(),
        "temperature_c": 39.5, "humidity_pct": 48.0, "wind_speed_kmh": 8.0,
        "source": "simulated", "note": "Automated software integration fixture; not a physical sensor.",
    }
