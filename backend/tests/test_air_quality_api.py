def test_air_quality_is_modelled_timestamped_cached_and_screened(client, provider):
    response = client.get("/api/v1/air-quality/current/mumbai")
    assert response.status_code == 200
    body = response.json()
    assert body["us_aqi"] == 125
    assert body["european_aqi"] == 55
    assert body["aqi_standards"] == ["US AQI", "European AQI"]
    assert body["pm2_5"] == 45.2
    assert body["pm10"] == 88.4
    assert body["nitrogen_dioxide"] == 31.1
    assert body["ozone"] == 64.3
    assert body["sulphur_dioxide"] == 8.2
    assert body["carbon_monoxide"] == 420.5
    assert body["aqi_standard"] == "US AQI"
    assert body["evidence_type"] == "air-quality-model"
    assert body["is_station_observation"] is False
    assert body["freshness"] == "current"
    assert "CAMS model" in body["source"]
    assert client.get("/api/v1/air-quality/current/mumbai").json() == body
    assert provider.air_quality_calls == 1

    history = client.get("/api/v1/air-quality/history/mumbai").json()
    assert history["count"] == 1
    assert history["status"] == "stored_model_estimates"
    assert history["items"][0]["is_station_observation"] is False

    risk = client.get("/api/v1/risk/air-quality/mumbai")
    assert risk.status_code == 200
    assert risk.json()["aqi_category"] == "Unhealthy for Sensitive Groups"
    assert risk.json()["level"] == "moderate"
    assert "not a CPCB monitoring-station observation" in risk.json()["explanation"]
    assert "0-50 Low" in risk.json()["method"]
    assert risk.json()["european_aqi_category"] == "Moderate"
    assert risk.json()["european_level"] == "moderate"


def test_air_quality_hourly_forecast_has_both_indices_all_pollutants_and_cache(client, provider):
    response = client.get("/api/v1/air-quality/forecast/mumbai")
    assert response.status_code == 200
    body = response.json()
    assert body["forecast_status"] == "ok"
    assert len(body["hourly"]) == 24
    first = body["hourly"][0]
    assert first["us_aqi"] == 125
    assert first["european_aqi"] == 55
    assert first["pm2_5"] == 45.2
    assert first["pm10"] == 88.4
    assert first["carbon_monoxide"] == 420.5
    assert first["nitrogen_dioxide"] == 31.1
    assert first["sulphur_dioxide"] == 8.2
    assert first["ozone"] == 64.3
    assert body["hourly"][1]["pm2_5"] == 46.2
    assert body["hourly"][-1]["european_aqi"] == 78
    assert all(item["evidence_type"] == "air-quality-model" for item in body["hourly"])
    calls = provider.air_quality_calls
    assert client.get("/api/v1/air-quality/forecast/mumbai").json() == body
    assert provider.air_quality_calls == calls


def test_air_quality_hourly_outage_retains_current_and_explicit_stale_hours(client, provider, settings):
    assert client.get("/api/v1/air-quality/forecast/mumbai").status_code == 200
    settings.weather_cache_seconds = 0
    provider.fail = True
    response = client.get("/api/v1/air-quality/forecast/mumbai")
    assert response.status_code == 200
    body = response.json()
    assert body["us_aqi"] == 125
    assert body["freshness"] == "stale"
    assert body["forecast_status"] == "unavailable"
    assert len(body["hourly"]) == 24
    assert "most recent stored model estimates" in body["forecast_message"]


def test_air_quality_outage_without_cache_is_unavailable_not_fabricated(client, provider):
    provider.fail = True
    response = client.get("/api/v1/air-quality/current/pune")
    assert response.status_code == 503
    assert response.json()["code"] == "AIR_QUALITY_UNAVAILABLE"
    assert "45.2" not in response.text
    assert client.get("/api/v1/air-quality/history/pune").json() == {
        "region": "pune", "count": 0, "status": "empty", "items": [],
    }


def test_air_quality_outage_uses_explicitly_stale_model_cache(client, provider, settings):
    assert client.get("/api/v1/air-quality/current/mumbai").status_code == 200
    settings.weather_cache_seconds = 0
    provider.fail = True
    response = client.get("/api/v1/air-quality/current/mumbai")
    assert response.status_code == 200
    assert response.json()["freshness"] == "stale"
    assert response.json()["provider_status"] == "unavailable"
    assert "most recent stored model estimate" in response.json()["message"]
    assert response.json()["is_station_observation"] is False


def test_air_quality_risk_outage_and_validation(client, provider):
    provider.fail = True
    assert client.get("/api/v1/risk/air-quality/mumbai").status_code == 503
    assert client.get("/api/v1/air-quality/current/not-a-region").status_code == 404
    assert client.get("/api/v1/air-quality/history/mumbai?limit=1001").status_code == 422
    assert client.get("/api/v1/air-quality/history/mumbai?start=2026-05-02T00:00:00Z&end=2026-05-01T00:00:00Z").status_code == 422


def test_air_quality_contract_is_in_openapi_and_health(client):
    schema = client.get("/openapi.json").json()
    assert "/api/v1/air-quality/current/{slug}" in schema["paths"]
    assert "/api/v1/air-quality/history/{slug}" in schema["paths"]
    assert "/api/v1/air-quality/forecast/{slug}" in schema["paths"]
    assert "/api/v1/risk/air-quality/{slug}" in schema["paths"]
    health = client.get("/api/v1/health").json()
    assert "CAMS" in health["air_quality_provider"]
    assert "network checked only" in health["air_quality_provider"]
