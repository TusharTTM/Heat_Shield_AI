"""Regression tests for outbound client lifecycle, retry safety, and config gates."""

import httpx
import pytest

from backend.app.air_quality import AirQualityClient, AirQualityProviderError
from backend.app.config import MIN_SENSOR_API_KEY_LENGTH, Settings
from backend.app.cpcb import CPCBClient
from backend.app.http_client import build_timeout
from backend.app.weather import WeatherClient


def test_timeout_splits_connect_budget_from_read_budget():
    timeout = build_timeout(10)
    assert timeout.read == 10
    assert 1 <= timeout.connect <= 10
    # A short configured timeout still gets a positive, bounded connect budget.
    brief = build_timeout(2)
    assert brief.connect < brief.read or brief.connect == brief.read


def test_adapters_reuse_one_pooled_client_across_calls():
    seen = []

    def handler(request):
        seen.append(id(request))
        return httpx.Response(200, json={"utc_offset_seconds": 0, "current": {
            "time": "2026-11-16T12:00:00+00:00", "temperature_2m": 34.0, "relative_humidity_2m": 60.0,
            "apparent_temperature": 36.0, "weather_code": 0, "wind_speed_10m": 10.0,
        }})

    client = WeatherClient("https://provider.test/forecast", transport=httpx.MockTransport(handler))
    region = {"slug": "mumbai", "latitude": 19.076, "longitude": 72.8777}
    client.current(region)
    first = client._client
    client.current(region)
    assert client._client is first, "a new HTTP client per request would drop connection pooling"
    assert len(seen) == 2
    client.close()
    assert client._client is None


def test_cpcb_client_does_not_follow_redirects():
    """A redirect could move the API key to a host the operator never approved."""
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(302, headers={"Location": "https://evil.test/steal"})

    client = CPCBClient("https://api.data.gov.in/resource/x", "key-" + "a" * 30, transport=httpx.MockTransport(handler))
    with pytest.raises(Exception):
        client.observations({"slug": "mumbai", "name": "Mumbai", "state": "Maharashtra"})
    assert len(requests) == 1
    assert all(request.url.host == "api.data.gov.in" for request in requests)


def test_out_of_range_hourly_value_is_a_provider_error_not_an_unhandled_500():
    def handler(request):
        base = {"time": "2026-11-16T12:00:00", "us_aqi": 120.0, "european_aqi": 50.0, "pm10": 80.0,
                "pm2_5": 40.0, "carbon_monoxide": 300.0, "nitrogen_dioxide": 30.0,
                "sulphur_dioxide": 8.0, "ozone": 60.0}
        hourly = {field: [value] * 3 for field, value in base.items() if field != "time"}
        hourly["time"] = ["2026-11-16T12:00:00", "2026-11-16T13:00:00", "2026-11-16T14:00:00"]
        hourly["us_aqi"][1] = 99999
        return httpx.Response(200, json={"utc_offset_seconds": 0, "current": base, "hourly": hourly})

    client = AirQualityClient("https://air.test/x", transport=httpx.MockTransport(handler))
    with pytest.raises(AirQualityProviderError):
        client.outlook({"slug": "mumbai", "latitude": 19.076, "longitude": 72.8777})


@pytest.mark.parametrize("key", ["x", "short", "a" * (MIN_SENSOR_API_KEY_LENGTH - 1)])
def test_short_sensor_keys_are_rejected(key):
    with pytest.raises(ValueError, match="sensor_api_key"):
        Settings(sensor_api_key=key)


def test_empty_and_long_sensor_keys_are_accepted():
    assert Settings(sensor_api_key="").sensor_api_key == ""
    long_key = "a" * MIN_SENSOR_API_KEY_LENGTH
    assert Settings(sensor_api_key=f"  {long_key}  ").sensor_api_key == long_key
