from backend.app.risk import heat_index_c


def test_health_regions_safety_and_openapi(client):
    health = client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json()["database"] == "ok"
    assert health.json()["ml_model"] == "not_configured"
    assert "test-sensor-key" not in health.text
    assert client.get("/api/v1/status").status_code == 200
    regions = client.get("/api/v1/regions").json()
    assert len(regions) == 15
    assert [item["slug"] for item in regions[7:]] == [
        "jaipur", "lucknow", "bhopal", "hyderabad", "bengaluru", "chennai", "kochi", "kolkata",
    ]
    safety = client.get("/api/v1/safety/extreme")
    assert safety.status_code == 200
    assert "heatstroke" in safety.json()["emergency_guidance"].lower()
    assert "professional medical care" in safety.json()["emergency_guidance"]
    assert client.get("/api/v1/safety/unknown").status_code == 404
    schema = client.get("/openapi.json")
    assert schema.status_code == 200
    assert "/api/v1/weather/current/{slug}" in schema.json()["paths"]
    assert client.get("/docs").status_code == 200


def test_current_weather_is_provider_backed_timestamped_and_cached(client, provider):
    response = client.get("/api/v1/weather/current/mumbai")
    assert response.status_code == 200
    body = response.json()
    assert body["temperature_c"] == 40
    assert body["humidity_pct"] == 50
    assert body["wind_speed_kmh"] == 12
    assert body["source"] == "Open-Meteo"
    assert body["freshness"] == "current"
    assert body["is_simulated"] is False
    assert body["observed_at"].endswith("+00:00") or body["observed_at"].endswith("Z")
    assert body["heat_index_c"] == round(heat_index_c(40, 50), 1)
    assert client.get("/api/v1/weather/current/mumbai").json() == body
    assert provider.current_calls == 1
    history = client.get("/api/v1/weather/history/mumbai").json()
    assert history["count"] == 1
    assert history["status"] == "stored_observations"


def test_weather_outage_without_cache_is_unavailable_not_demo(client, provider):
    provider.fail = True
    response = client.get("/api/v1/weather/current/mumbai")
    assert response.status_code == 503
    assert response.json()["code"] == "WEATHER_UNAVAILABLE"
    assert "40" not in response.text
    history = client.get("/api/v1/weather/history/mumbai").json()
    assert history == {"region": "mumbai", "count": 0, "status": "empty", "items": []}


def test_weather_outage_uses_explicitly_stale_cache(client, provider, settings):
    assert client.get("/api/v1/weather/current/mumbai").status_code == 200
    settings.weather_cache_seconds = 0
    provider.fail = True
    response = client.get("/api/v1/weather/current/mumbai")
    assert response.status_code == 200
    assert response.json()["freshness"] == "stale"
    assert response.json()["provider_status"] == "unavailable"
    assert "most recent stored" in response.json()["message"]


def test_exact_five_day_forecast_and_stale_fallback(client, provider, settings):
    response = client.get("/api/v1/weather/forecast/pune")
    assert response.status_code == 200
    body = response.json()
    assert len(body["days"]) == 5
    assert body["days"][0]["temperature_max_c"] == 40
    assert body["days"][4]["description"] == "Slight rain"
    assert client.get("/api/v1/weather/forecast/pune").json() == body
    assert provider.forecast_calls == 1
    settings.weather_cache_seconds = 0
    provider.fail = True
    stale = client.get("/api/v1/weather/forecast/pune").json()
    assert stale["freshness"] == "stale"
    assert stale["provider_status"] == "unavailable"


def test_forecast_outage_without_cache(client, provider):
    provider.fail = True
    response = client.get("/api/v1/weather/forecast/pune")
    assert response.status_code == 503
    assert response.json()["code"] == "FORECAST_UNAVAILABLE"


def test_risk_map_and_validation(client):
    risk = client.get("/api/v1/risk/mumbai")
    assert risk.status_code == 200
    assert risk.json()["heat_index_c"] == round(heat_index_c(40, 50), 1)
    assert "not a trained model" in risk.json()["method"]
    bengaluru_risk = client.get("/api/v1/risk/bengaluru")
    assert bengaluru_risk.status_code == 200
    assert bengaluru_risk.json()["region"] == "bengaluru"
    assert client.get("/api/v1/risk/not-a-region").status_code == 404
    assert client.get("/api/v1/weather/history/mumbai?start=2026-05-02T00:00:00Z&end=2026-05-01T00:00:00Z").status_code == 422
    assert client.get("/api/v1/weather/history/mumbai?limit=1001").status_code == 422
    map_response = client.get("/api/v1/risk")
    assert map_response.status_code == 200
    assert len(map_response.json()) == 15
    assert all(item["location"]["latitude"] is not None for item in map_response.json())


def test_cors_allows_only_configured_origins(client):
    allowed = client.options("/api/v1/regions", headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET",
    })
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    denied = client.options("/api/v1/regions", headers={
        "Origin": "https://untrusted.example", "Access-Control-Request-Method": "GET",
    })
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers
