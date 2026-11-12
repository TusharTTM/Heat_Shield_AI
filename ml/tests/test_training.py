import hashlib
import json
import math

import joblib
import pandas as pd

from ml.training.features import FEATURE_COLUMNS, make_features
from ml.training.train import is_promotion_eligible, train_models


def synthetic_dataset(path):
    """Deterministic synthetic fixture for software tests only, never weather evidence."""
    rows = []
    for region_index, region in enumerate(["mumbai", "pune"]):
        for index, day in enumerate(pd.date_range("2024-01-01", periods=180, freq="D")):
            temperature = 30 + region_index * 2 + 5 * math.sin(2 * math.pi * index / 365) + 2 * math.sin(index / 5)
            rows.append({"region": region, "date": day.date().isoformat(), "temperature_2m_max": temperature})
    frame = pd.DataFrame(rows)
    frame.to_csv(path, index=False)
    return frame


def test_real_training_execution_on_explicitly_synthetic_fixture(tmp_path):
    dataset = tmp_path / "synthetic_pipeline_test.csv"
    raw = synthetic_dataset(dataset)
    metadata = train_models(dataset, tmp_path / "artifact", {"dataset_type": "synthetic_pipeline_test", "provider": "synthetic test generator"})
    assert metadata["raw_rows"] == len(raw)
    assert metadata["train_end"] < metadata["evaluation_start"]
    assert metadata["dataset_type"] == "synthetic_pipeline_test"
    assert metadata["promotion_eligible"] is False
    assert {model["name"] for model in metadata["models"]} == {"Linear Regression", "Random Forest", "Gradient Boosting"}
    for model in metadata["models"]:
        assert set(model["metrics"]) == {"mae", "rmse", "r2"}
        assert all(math.isfinite(value) for value in model["metrics"].values())
        assert model["metrics"]["mae"] >= 0
        assert model["metrics"]["rmse"] >= 0
    bundle = joblib.load(tmp_path / "artifact" / "temperature_model.joblib")
    disk_metadata = json.loads((tmp_path / "artifact" / "temperature_model.metadata.json").read_text())
    assert bundle["metadata"]["model_version"] == disk_metadata["model_version"]
    features = make_features(raw)
    prediction = bundle["model"].predict(features[FEATURE_COLUMNS].tail(1))[0]
    assert math.isfinite(float(prediction))
    assert disk_metadata["dataset_sha256"] == hashlib.sha256(dataset.read_bytes()).hexdigest()


def test_promotion_requires_matching_real_ingestion_provenance_without_failures():
    # Pure provenance logic: no synthetic weather is relabelled or promoted by this test.
    assert is_promotion_eligible("abc", {"dataset_type": "historical_weather_reanalysis", "sha256": "abc", "failures": []}) is True
    assert is_promotion_eligible("abc", {"dataset_type": "historical_weather_reanalysis", "sha256": "different", "failures": []}) is False
    assert is_promotion_eligible("abc", {"dataset_type": "historical_weather_reanalysis", "sha256": "abc", "failures": ["missing region"]}) is False
    assert is_promotion_eligible("abc", {"dataset_type": "synthetic_pipeline_test", "sha256": "abc", "failures": []}) is False
