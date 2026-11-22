import json
import math
from datetime import date

from .config import Settings
from .regions import get_region
from .risk import risk_result


class ModelUnavailable(RuntimeError):
    pass


def _promotion_rejection(metadata: dict) -> str | None:
    """Return why an artifact pair may not be served, or None when it may.

    Training only marks a pair ``promotion_eligible`` when the dataset hash
    matches the real ingestion manifest and the ingestion recorded no failures.
    Everything else in this project refuses to present synthetic or unverified
    fixtures as real output, so serving must apply the same gate rather than
    checking only that the two files agree on a version string.
    """
    if metadata.get("promotion_eligible") is not True:
        return "artifact is not marked promotion_eligible"
    if metadata.get("dataset_type") != "historical_weather_reanalysis":
        return "artifact dataset is not verified historical reanalysis"
    if metadata.get("source_metadata_failures"):
        return "artifact ingestion recorded failures"
    if metadata.get("source_metadata_sha256_match") is False:
        return "artifact dataset hash does not match its ingestion manifest"
    return None


class ModelService:
    def __init__(self, settings: Settings):
        self.model_path = settings.ml_model_path
        self.metadata_path = settings.ml_metadata_path
        self.bundle = None
        self.metadata = None
        self.load_error = None
        self.rejection_reason = None
        # Metadata of an on-disk pair that was refused, kept only so /ml/status
        # can explain the refusal. It is never used to answer predictions.
        self.rejected_metadata = None
        if self.model_path.exists() and self.metadata_path.exists():
            try:
                import joblib
                disk_metadata = json.loads(self.metadata_path.read_text(encoding="utf-8"))
                rejection = _promotion_rejection(disk_metadata)
                if rejection is not None:
                    # Artifacts are only deserialised after the metadata gate:
                    # joblib.load executes code, so nothing unverified is loaded.
                    self.rejection_reason = rejection
                    self.rejected_metadata = disk_metadata
                    self.load_error = "ARTIFACT_NOT_PROMOTABLE"
                    return
                bundle = joblib.load(self.model_path)
                if bundle.get("metadata", {}).get("model_version") != disk_metadata.get("model_version"):
                    raise ValueError("Model and metadata versions do not match")
                self.bundle = bundle
                self.metadata = disk_metadata
            except Exception as exc:  # artifact errors must not expose local paths or traces
                self.bundle = None
                self.metadata = None
                self.load_error = type(exc).__name__

    @property
    def status(self) -> str:
        if self.metadata is not None:
            return "loaded"
        return "unavailable" if self.load_error else "not_configured"

    def status_detail(self) -> str | None:
        """Operator-facing reason when an artifact pair exists but is not served."""
        if self.metadata is not None:
            return None
        return self.rejection_reason or self.load_error

    def predict(self, region_slug: str, target_date: date, recent: list[float], humidity_pct: float | None) -> dict:
        if get_region(region_slug) is None:
            raise KeyError(region_slug)
        if self.metadata is None:
            raise ModelUnavailable("A validated trained model artifact is not configured")
        import numpy as np
        import pandas as pd
        features = pd.DataFrame([{
            "region": region_slug, "lag_1": recent[-1], "lag_2": recent[-2], "lag_3": recent[-3],
            "rolling_mean_3": float(np.mean(recent)), "rolling_std_3": float(np.std(recent, ddof=1)),
            "day_of_year_sin": math.sin(2 * math.pi * target_date.timetuple().tm_yday / 365.25),
            "day_of_year_cos": math.cos(2 * math.pi * target_date.timetuple().tm_yday / 365.25),
        }])
        prediction = float(self.bundle["model"].predict(features)[0])
        if not math.isfinite(prediction) or not -80 <= prediction <= 70:
            raise ModelUnavailable("Model produced an invalid prediction")
        selected = self.metadata["selected_model"]
        evaluation = selected["metrics"]
        explanation = (
            f"Estimated from the three preceding daily maximum temperatures and seasonal date features using "
            f"{selected['name']}. Chronological holdout MAE was {evaluation['mae']:.2f}°C and RMSE was "
            f"{evaluation['rmse']:.2f}°C for artifact {self.metadata['model_version']}. This is not an official forecast."
        )
        return {
            "region": region_slug, "target_date": target_date, "predicted_temperature_c": round(prediction, 2),
            "model_version": self.metadata["model_version"], "model_name": selected["name"], "evaluation": evaluation,
            "explanation": explanation, "risk": risk_result(prediction, humidity_pct) if humidity_pct is not None else None,
            "is_ml_prediction": True, "official_forecast": False,
        }
