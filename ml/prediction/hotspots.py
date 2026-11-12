"""Evidence-labelled ranking of model outputs, not observed hotspot detection."""
from __future__ import annotations

import math


def rank_hotspots(predictions: list[dict], limit: int = 5) -> list[dict]:
    if not 1 <= limit <= 20:
        raise ValueError("limit must be between 1 and 20")
    validated = []
    for prediction in predictions:
        if prediction.get("evidence_type") != "model_inferred":
            raise ValueError("Hotspots require model_inferred evidence; observations are a separate evidence type")
        temperature = float(prediction["predicted_temperature_c"])
        if not math.isfinite(temperature):
            raise ValueError("Hotspot prediction must be finite")
        if not prediction.get("model_version"):
            raise ValueError("Hotspot prediction requires a model version")
        validated.append({
            "region": prediction["region"], "predicted_temperature_c": temperature,
            "evidence_type": "model_inferred", "model_version": prediction["model_version"],
        })
    return sorted(validated, key=lambda item: item["predicted_temperature_c"], reverse=True)[:limit]
