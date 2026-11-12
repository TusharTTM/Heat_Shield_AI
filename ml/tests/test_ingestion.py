from unittest.mock import patch
from urllib.error import HTTPError, URLError

import pytest

from ml.ingest_open_meteo import DAILY_FIELDS, fetch_region, request_json


def archive_payload():
    times = ["2025-01-01", "2025-01-02"]
    daily = {"time": times}
    for field in DAILY_FIELDS:
        daily[field] = [1, 2]
    daily["temperature_2m_max"] = [35, 36]
    daily["temperature_2m_min"] = [25, 26]
    daily["temperature_2m_mean"] = [30, 31]
    daily["relative_humidity_2m_mean"] = [50, 51]
    daily["wind_speed_10m_max"] = [12, 13]
    daily["precipitation_sum"] = [0, 1]
    daily["shortwave_radiation_sum"] = [20, 21]
    return {"latitude": 19.076, "longitude": 72.8777, "elevation": 14, "timezone": "Asia/Kolkata", "daily": daily, "daily_units": {}}


def test_archive_parser_preserves_real_provider_fields():
    region = {"slug": "mumbai", "latitude": 19.076, "longitude": 72.8777}
    with patch("ml.ingest_open_meteo.request_json", return_value=archive_payload()) as request:
        rows, metadata = fetch_region(region, "2025-01-01", "2025-01-02")
    assert len(rows) == 2
    assert rows[0]["temperature_2m_max"] == 35
    assert rows[0]["source"] == "Open-Meteo Historical Weather API"
    assert metadata["rows"] == 2
    assert "archive-api.open-meteo.com" in request.call_args.args[0]


def test_archive_parser_rejects_out_of_range_values():
    payload = archive_payload()
    payload["daily"]["relative_humidity_2m_mean"] = [120, 50]
    with patch("ml.ingest_open_meteo.request_json", return_value=payload):
        with pytest.raises(RuntimeError, match="Out-of-range"):
            fetch_region({"slug": "mumbai", "latitude": 19.076, "longitude": 72.8777}, "2025-01-01", "2025-01-02")


def test_request_errors_are_bounded_and_diagnostic_without_response_data():
    rate_limited = HTTPError("https://provider.test", 429, "rate limited", hdrs={}, fp=None)
    with patch("ml.ingest_open_meteo.urlopen", side_effect=rate_limited) as request, patch("ml.ingest_open_meteo.time.sleep") as sleep:
        with pytest.raises(RuntimeError, match="HTTP 429"):
            request_json("https://provider.test", attempts=2)
    assert request.call_count == 2
    sleep.assert_called_once()

    invalid = HTTPError("https://provider.test", 400, "bad request", hdrs={}, fp=None)
    with patch("ml.ingest_open_meteo.urlopen", side_effect=invalid) as request, patch("ml.ingest_open_meteo.time.sleep") as sleep:
        with pytest.raises(RuntimeError, match="HTTP 400"):
            request_json("https://provider.test", attempts=4)
    assert request.call_count == 1
    sleep.assert_not_called()

    with patch("ml.ingest_open_meteo.urlopen", side_effect=URLError(TimeoutError("timed out"))):
        with pytest.raises(RuntimeError, match="timed out"):
            request_json("https://provider.test", attempts=1)


def test_archive_parser_rejects_missing_temperature():
    payload = archive_payload()
    payload["daily"]["temperature_2m_max"] = [None, 36]
    with patch("ml.ingest_open_meteo.request_json", return_value=payload):
        with pytest.raises(RuntimeError, match="Missing maximum"):
            fetch_region({"slug": "mumbai", "latitude": 19.076, "longitude": 72.8777}, "2025-01-01", "2025-01-02")
