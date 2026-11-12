import pytest

from ml.prediction.hotspots import rank_hotspots


def test_hotspots_are_ranked_and_evidence_labelled():
    predictions = [
        {"region": "mumbai", "predicted_temperature_c": 39, "evidence_type": "model_inferred", "model_version": "test-v1"},
        {"region": "delhi", "predicted_temperature_c": 42, "evidence_type": "model_inferred", "model_version": "test-v1"},
    ]
    ranked = rank_hotspots(predictions, limit=1)
    assert ranked[0]["region"] == "delhi"
    assert ranked[0]["evidence_type"] == "model_inferred"
    with pytest.raises(ValueError, match="model_inferred"):
        rank_hotspots([{**predictions[0], "evidence_type": "observed"}])
