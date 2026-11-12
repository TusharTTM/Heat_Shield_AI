def test_ml_is_explicitly_unavailable_without_artifact(client):
    status = client.get("/api/v1/ml/status")
    assert status.status_code == 200
    assert status.json()["status"] == "not_configured"
    assert status.json()["model_version"] is None
    request = {
        "region": "mumbai", "target_date": "2026-05-16", "recent_max_temperatures": [38, 39, 40],
        "humidity_pct": 50,
    }
    response = client.post("/api/v1/ml/predict", json=request)
    assert response.status_code == 503
    assert response.json()["code"] == "MODEL_UNAVAILABLE"
    assert client.post("/api/v1/ml/hotspots", json=[request]).status_code == 503


def test_ml_input_validation(client):
    request = {"region": "mumbai", "target_date": "2026-05-16", "recent_max_temperatures": [38, 1000, 40]}
    response = client.post("/api/v1/ml/predict", json=request)
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
