import json

import joblib
import pandas as pd
from fastapi.testclient import TestClient
from sklearn.linear_model import LinearRegression

from backend.app.main import create_app
from ml.training.features import FEATURE_COLUMNS
from ml.training.train import build_pipeline


def test_backend_loads_only_version_matched_artifact_and_explains_prediction(settings, tmp_path):
    # Explicit synthetic integration fixture; this artifact stays in a temporary test directory.
    features = pd.DataFrame([
        {"region": "mumbai" if index % 2 == 0 else "pune", "lag_1": 35 + index * 0.1,
         "lag_2": 34 + index * 0.1, "lag_3": 33 + index * 0.1, "rolling_mean_3": 34 + index * 0.1,
         "rolling_std_3": 1.0, "day_of_year_sin": 0.5, "day_of_year_cos": 0.5}
        for index in range(20)
    ])
    target = pd.Series([36 + index * 0.1 for index in range(20)])
    model = build_pipeline(LinearRegression())
    model.fit(features[FEATURE_COLUMNS], target)
    metadata = {
        "model_version": "synthetic-integration-v1", "trained_at": "2026-01-01T00:00:00+00:00",
        "dataset_type": "synthetic_pipeline_test", "selected_model": {"name": "Linear Regression", "metrics": {"mae": 1.0, "rmse": 1.5, "r2": 0.0}},
    }
    model_path = tmp_path / "model.joblib"
    metadata_path = tmp_path / "model.json"
    joblib.dump({"model": model, "metadata": metadata}, model_path)
    metadata_path.write_text(json.dumps(metadata))
    settings.ml_model_path = model_path
    settings.ml_metadata_path = metadata_path
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/ml/status").json()["status"] == "loaded"
        request = {"region": "mumbai", "target_date": "2026-05-16", "recent_max_temperatures": [38, 39, 40], "humidity_pct": 50}
        response = client.post("/api/v1/ml/predict", json=request)
        assert response.status_code == 200
        body = response.json()
        assert body["model_version"] == "synthetic-integration-v1"
        assert body["is_ml_prediction"] is True
        assert body["official_forecast"] is False
        assert body["risk"]["method"].startswith("NWS heat-index")
        assert "not an official forecast" in body["explanation"]
        hotspots = client.post("/api/v1/ml/hotspots", json=[request, {**request, "region": "pune"}])
        assert hotspots.status_code == 200
        assert len(hotspots.json()) == 2
        assert all(item["evidence_type"] == "model_inferred" for item in hotspots.json())


def test_backend_rejects_mismatched_model_metadata(settings, tmp_path):
    model_path = tmp_path / "model.joblib"
    metadata_path = tmp_path / "model.json"
    joblib.dump({"metadata": {"model_version": "one"}}, model_path)
    metadata_path.write_text(json.dumps({"model_version": "two"}))
    settings.ml_model_path = model_path
    settings.ml_metadata_path = metadata_path
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/ml/status").json()["status"] == "unavailable"
