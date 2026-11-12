from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.air_quality import AirQualityClient
from backend.app.cpcb import CPCBClient
from backend.app.main import create_app
from backend.app.weather import WeatherClient
from backend.tests.conftest import ProviderStub


TEST_KEY = "software-test-key-not-a-real-credential"


class CPCBProvider:
    def __init__(self):
        self.calls = 0
        self.failure_status = None
        self.empty = False
        self.invalid = False
        self.transport = httpx.MockTransport(self.handler)

    def records(self):
        observed = (datetime.now(ZoneInfo("Asia/Kolkata")) - timedelta(minutes=20)).strftime("%d-%m-%Y %H:%M:%S")
        if self.invalid:
            return [
                {"station": "Invalid station", "city": "Mumbai", "state": "Maharashtra", "last_update": observed, "pollutant_id": "PM2.5", "pollutant_avg": "-2"},
                {"station": "Missing time", "city": "Mumbai", "state": "Maharashtra", "last_update": "", "pollutant_id": "PM10", "pollutant_avg": "80"},
                {"station": "No values", "city": "Mumbai", "state": "Maharashtra", "last_update": observed, "pollutant_id": "CO", "pollutant_avg": "NA"},
            ]
        base = {"country": "India", "city": "Mumbai", "state": "Maharashtra", "last_update": observed}
        return [
            {**base, "station": "Bandra, Mumbai - MPCB", "pollutant_id": "PM2.5", "pollutant_min": "40.1", "pollutant_max": "50.2", "pollutant_avg": "45.2", "pollutant_unit": "µg/m³"},
            {**base, "station": "Bandra, Mumbai - MPCB", "pollutant_id": "PM10", "pollutant_min": "80", "pollutant_max": "90", "pollutant_avg": "88.4", "pollutant_unit": "µg/m³"},
            {**base, "station": "Bandra, Mumbai - MPCB", "pollutant_id": "AQI", "pollutant_avg": "175", "pollutant_unit": "NA"},
            {**base, "station": "Worli, Mumbai - MPCB", "pollutant_id": "CO", "pollutant_avg": "1.2", "pollutant_unit": "mg/m³"},
            {**base, "station": "Worli, Mumbai - MPCB", "pollutant_id": "OZONE", "pollutant_avg": "60", "pollutant_unit": "µg/m³"},
        ]

    def handler(self, request):
        self.calls += 1
        if self.failure_status:
            return httpx.Response(self.failure_status, json={"status": "error"})
        return httpx.Response(200, json={"status": "ok", "records": [] if self.empty else self.records()})


def api_for(settings, cpcb_provider, key=TEST_KEY):
    weather_provider = ProviderStub()
    app = create_app(
        settings,
        WeatherClient("https://provider.test/forecast", transport=weather_provider.transport),
        AirQualityClient("https://air-provider.test/air-quality", transport=weather_provider.transport),
        CPCBClient("https://cpcb.test/resource", key, transport=cpcb_provider.transport),
    )
    return TestClient(app)


def test_cpcb_supplied_aqi_station_fields_cache_history_and_secret_boundary(settings):
    provider = CPCBProvider()
    with api_for(settings, provider) as client:
        response = client.get("/api/v1/official/air-quality/current/mumbai")
        assert response.status_code == 200
        body = response.json()
        assert body["count"] == 2
        assert body["records_read"] == 5
        assert body["invalid_records"] == 0
        assert body["evidence_type"] == "station-observation"
        assert body["freshness"] == "current"
        assert TEST_KEY not in response.text
        bandra = next(item for item in body["observations"] if item["station"].startswith("Bandra"))
        worli = next(item for item in body["observations"] if item["station"].startswith("Worli"))
        assert bandra["aqi"] == 175
        assert bandra["aqi_category"] == "Moderate"
        assert bandra["aqi_standard"] == "Indian CPCB AQI"
        assert bandra["screening_level"] == "moderate"
        assert bandra["pollutants"]["PM2.5"] == {
            "pollutant_id": "PM2.5", "minimum": 40.1, "maximum": 50.2, "average": 45.2, "unit": "µg/m³",
        }
        assert worli["aqi"] is None
        assert worli["aqi_category"] is None
        assert worli["aqi_standard"] is None
        assert worli["pollutants"]["CO"]["unit"] == "mg/m³"
        assert "No AQI is calculated" in body["aqi_method"]
        assert client.get("/api/v1/official/air-quality/current/mumbai").json() == body
        assert provider.calls == 1
        history = client.get("/api/v1/official/air-quality/history/mumbai").json()
        assert history["status"] == "stored_station_observations"
        assert history["count"] == 2
        assert client.get("/api/v1/health").json()["cpcb_provider"].startswith("CPCB via data.gov.in (credential configured")


def test_cpcb_missing_key_is_explicit_and_does_not_call_provider(settings):
    provider = CPCBProvider()
    with api_for(settings, provider, key="") as client:
        response = client.get("/api/v1/official/air-quality/current/mumbai")
        assert response.status_code == 503
        assert response.json()["code"] == "CPCB_NOT_CONFIGURED"
        assert "DATA_GOV_IN_API_KEY" in response.json()["detail"]
        assert provider.calls == 0
        assert client.get("/api/v1/official/air-quality/history/mumbai").json() == {
            "region": "mumbai", "count": 0, "status": "empty", "items": [],
        }


@pytest.mark.parametrize("status,code", [(401, "CPCB_AUTH_FAILED"), (403, "CPCB_AUTH_FAILED"), (429, "CPCB_RATE_LIMITED"), (503, "CPCB_UNAVAILABLE")])
def test_cpcb_authentication_rate_limit_and_outage_errors(settings, status, code):
    provider = CPCBProvider()
    provider.failure_status = status
    with api_for(settings, provider) as client:
        response = client.get("/api/v1/official/air-quality/current/mumbai")
        assert response.status_code == 503
        assert response.json()["code"] == code
        assert "45.2" not in response.text


def test_cpcb_outage_uses_timestamped_stale_station_cache(settings):
    provider = CPCBProvider()
    with api_for(settings, provider) as client:
        assert client.get("/api/v1/official/air-quality/current/mumbai").status_code == 200
        settings.cpcb_cache_seconds = 0
        provider.failure_status = 503
        response = client.get("/api/v1/official/air-quality/current/mumbai")
        assert response.status_code == 200
        body = response.json()
        assert body["freshness"] == "stale"
        assert body["provider_status"] == "unavailable"
        assert body["count"] == 2
        assert body["observations"][0]["evidence_type"] == "station-observation"
        assert "original timestamps" in body["message"]


def test_cpcb_empty_refresh_does_not_relabel_previous_history_as_current(settings):
    provider = CPCBProvider()
    with api_for(settings, provider) as client:
        first = client.get("/api/v1/official/air-quality/current/mumbai").json()
        assert first["count"] == 2
        settings.cpcb_cache_seconds = 0
        provider.empty = True
        empty = client.get("/api/v1/official/air-quality/current/mumbai").json()
        assert empty["count"] == 0
        assert empty["observations"] == []
        assert empty["latest_observation_at"] is None
        assert "not an all-clear" in empty["message"]
        settings.cpcb_cache_seconds = 3600
        cached_empty = client.get("/api/v1/official/air-quality/current/mumbai").json()
        assert cached_empty["count"] == 0
        assert cached_empty["observations"] == []
        history = client.get("/api/v1/official/air-quality/history/mumbai").json()
        assert history["count"] == 2
        assert {item["observed_at"] for item in history["items"]} == {item["observed_at"] for item in first["observations"]}


def test_cpcb_empty_and_invalid_records_are_not_converted_to_clean_air(settings):
    provider = CPCBProvider()
    provider.empty = True
    with api_for(settings, provider) as client:
        response = client.get("/api/v1/official/air-quality/current/mumbai")
        assert response.status_code == 200
        assert response.json()["count"] == 0
        assert "not an all-clear" in response.json()["message"]
        assert client.get("/api/v1/official/air-quality/current/mumbai").status_code == 200
        assert provider.calls == 1
    settings.database_url = settings.database_url.replace("test.db", "invalid.db")
    invalid_provider = CPCBProvider()
    invalid_provider.invalid = True
    with api_for(settings, invalid_provider) as client:
        body = client.get("/api/v1/official/air-quality/current/mumbai").json()
        assert body["count"] == 0
        assert body["records_read"] == 3
        assert body["invalid_records"] == 3
        assert body["observations"] == []


def test_cpcb_supports_added_cities_and_south_mumbai_alias(settings):
    observed = (datetime.now(ZoneInfo("Asia/Kolkata")) - timedelta(minutes=15)).strftime("%d-%m-%Y %H:%M:%S")
    seen_filters = []

    def handler(request):
        seen_filters.append(request.url.params.get("filters[city]"))
        city = request.url.params.get("filters[city]", "Bengaluru")
        state = "Karnataka" if city == "Bengaluru" else "Maharashtra"
        return httpx.Response(200, json={
            "status": "ok",
            "records": [{
                "country": "India", "city": city, "state": state,
                "station": f"Central Station, {city}", "last_update": observed,
                "pollutant_id": "PM2.5", "pollutant_min": "20", "pollutant_max": "36",
                "pollutant_avg": "28", "pollutant_unit": "µg/m³",
            }],
        })

    weather_provider = ProviderStub()
    app = create_app(
        settings,
        WeatherClient("https://provider.test/forecast", transport=weather_provider.transport),
        AirQualityClient("https://air-provider.test/air-quality", transport=weather_provider.transport),
        CPCBClient("https://cpcb.test/resource", TEST_KEY, transport=httpx.MockTransport(handler)),
    )
    with TestClient(app) as client:
        bengaluru = client.get("/api/v1/official/air-quality/current/bengaluru")
        assert bengaluru.status_code == 200
        assert bengaluru.json()["count"] == 1
        assert bengaluru.json()["location"]["name"] == "Bengaluru"
        south_mumbai = client.get("/api/v1/official/air-quality/current/south-mumbai")
        assert south_mumbai.status_code == 200
        assert south_mumbai.json()["count"] == 1
        assert seen_filters == ["Bengaluru", "Mumbai"]
