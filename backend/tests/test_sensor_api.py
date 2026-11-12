from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.app.main import create_app


def test_sensor_requires_valid_key_and_never_exposes_device_publicly(client, simulated_reading, auth):
    assert client.post("/api/v1/sensors/readings", json=simulated_reading).status_code == 401
    assert client.post("/api/v1/sensors/readings", json=simulated_reading, headers={"X-Sensor-Key": "wrong"}).status_code == 401
    assert client.get("/api/v1/sensors/simulated-test-device/readings").status_code == 401
    assert client.get("/api/v1/sensors/simulated-test-device/status").status_code == 401
    created = client.post("/api/v1/sensors/readings", json=simulated_reading, headers=auth)
    assert created.status_code == 201
    assert created.json()["created"] is True
    assert created.json()["reading"]["is_simulated"] is True
    assert "physical" in created.json()["reading"]["note"]


def test_simulated_sensor_ingestion_is_idempotent_and_labelled(client, simulated_reading, auth):
    first = client.post("/api/v1/sensors/readings", json=simulated_reading, headers=auth)
    duplicate = client.post("/api/v1/sensors/readings", json=simulated_reading, headers=auth)
    assert first.json()["reading"]["id"] == duplicate.json()["reading"]["id"]
    assert duplicate.json()["created"] is False
    conflict = {**simulated_reading, "temperature_c": 41.0}
    response = client.post("/api/v1/sensors/readings", json=conflict, headers=auth)
    assert response.status_code == 409
    assert response.json()["code"] == "READING_CONFLICT"
    readings = client.get("/api/v1/sensors/simulated-test-device/readings", headers=auth)
    assert readings.status_code == 200
    assert len(readings.json()) == 1
    assert readings.json()[0]["is_simulated"] is True
    status = client.get("/api/v1/sensors/simulated-test-device/status", headers=auth).json()
    assert status["state"] == "online"
    assert status["is_simulated"] is True


def test_sensor_validation_and_stale_status(client, simulated_reading, auth):
    invalid = {**simulated_reading, "humidity_pct": 101}
    assert client.post("/api/v1/sensors/readings", json=invalid, headers=auth).status_code == 422
    naive = {**simulated_reading, "observed_at": "2026-01-01T12:00:00"}
    assert client.post("/api/v1/sensors/readings", json=naive, headers=auth).status_code == 422
    future = {**simulated_reading, "observed_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()}
    assert client.post("/api/v1/sensors/readings", json=future, headers=auth).status_code == 422
    old = {**simulated_reading, "observed_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()}
    assert client.post("/api/v1/sensors/readings", json=old, headers=auth).status_code == 201
    status = client.get("/api/v1/sensors/simulated-test-device/status", headers=auth).json()
    assert status["state"] == "stale"
    assert status["is_simulated"] is True
    no_data = client.get("/api/v1/sensors/no-such-device/status", headers=auth).json()
    assert no_data["state"] == "no_data"


def test_unconfigured_sensor_auth_fails_closed(settings, provider):
    settings.sensor_api_key = ""
    with TestClient(create_app(settings)) as client:
        response = client.post("/api/v1/sensors/readings", json={})
        assert response.status_code == 503
        assert response.json()["code"] == "SENSOR_AUTH_NOT_CONFIGURED"
