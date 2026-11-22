import threading
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


def test_same_instant_is_stored_once_regardless_of_offset(client, auth):
    """Two encodings of one moment must not create two rows or two `created` responses."""
    moment = (datetime.now(timezone.utc) - timedelta(minutes=1)).replace(microsecond=0)
    ist = moment.astimezone(timezone(timedelta(hours=5, minutes=30)))
    base = {"device_id": "offset-device", "temperature_c": 35.0, "humidity_pct": 50.0, "source": "physical"}

    first = client.post("/api/v1/sensors/readings", json={**base, "observed_at": ist.isoformat()}, headers=auth)
    second = client.post("/api/v1/sensors/readings", json={**base, "observed_at": moment.isoformat()}, headers=auth)

    assert first.status_code == 201 and first.json()["created"] is True
    assert second.status_code == 200 or second.status_code == 201
    assert second.json()["created"] is False
    assert first.json()["reading"]["id"] == second.json()["reading"]["id"]
    rows = client.get("/api/v1/sensors/offset-device/readings", headers=auth).json()
    assert len(rows) == 1
    # The stored instant is the same moment, expressed in UTC.
    assert rows[0]["observed_at"] == moment.isoformat().replace("+00:00", "Z")


def test_reading_ahead_of_server_clock_is_online_not_stale(client, auth):
    """Clock skew up to the accepted +5 minutes must not be reported as stale data."""
    ahead = (datetime.now(timezone.utc) + timedelta(minutes=2)).isoformat()
    accepted = client.post("/api/v1/sensors/readings", json={
        "device_id": "clock-ahead-device", "observed_at": ahead, "temperature_c": 35.0,
        "humidity_pct": 50.0, "source": "physical",
    }, headers=auth)
    assert accepted.status_code == 201
    status = client.get("/api/v1/sensors/clock-ahead-device/status", headers=auth).json()
    assert status["state"] == "online"


def test_concurrent_duplicate_ingestion_does_not_raise(settings, simulated_reading, auth):
    """The unique-constraint race must resolve to the stored row, not a 500."""
    with TestClient(create_app(settings)) as concurrent_client:
        results = []

        def send():
            results.append(concurrent_client.post("/api/v1/sensors/readings", json=simulated_reading, headers=auth))

        threads = [threading.Thread(target=send) for _ in range(6)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert {response.status_code for response in results} <= {200, 201}
        created = [response.json()["created"] for response in results]
        assert created.count(True) == 1
        assert len(set(response.json()["reading"]["id"] for response in results)) == 1
