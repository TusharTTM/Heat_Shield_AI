import math
from datetime import date

from .config import Settings
from .regions import get_region
from .risk import risk_result


class ModelUnavailable(RuntimeError):
    pass


class ModelService:
    def __init__(self, settings: Settings):
        self.model_path = settings.ml_model_path
        self.metadata_path = settings.ml_metadata_path
        self.bundle = None
        self.metadata = None
        self.load_error = None
        if self.model_path.exists() and self.metadata_path.exists():
            try:
                import joblib
                self.bundle = joblib.load(self.model_path)
                import json
                disk_metadata = json.loads(self.metadata_path.read_text(encoding="utf-8"))
                if self.bundle.get("metadata", {}).get("model_version") != disk_metadata.get("model_version"):
                    raise ValueError("Model and metadata versions do not match")
                self.metadata = disk_metadata
            except Exception as exc:  # artifact errors must not expose local paths or traces
                self.bundle = None
                self.load_error = type(exc).__name__

    @property
    def status(self) -> str:
        if self.metadata is not None:
            return "loaded"
        return "unavailable" if self.load_error else "not_configured"

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
