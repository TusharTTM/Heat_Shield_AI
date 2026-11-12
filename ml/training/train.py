#!/usr/bin/env python3
"""Compare regressors chronologically and write a provenance-labelled artifact."""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

try:
    from .features import FEATURE_COLUMNS, NUMERIC_FEATURES, chronological_split, load_daily_csv, make_features
except ImportError:  # direct `python ml/training/train.py` execution
    from features import FEATURE_COLUMNS, NUMERIC_FEATURES, chronological_split, load_daily_csv, make_features


def build_pipeline(regressor) -> Pipeline:
    preprocessor = ColumnTransformer([
        ("region", OneHotEncoder(handle_unknown="ignore", sparse_output=False), ["region"]),
        ("numeric", "passthrough", NUMERIC_FEATURES),
    ])
    return Pipeline([("features", preprocessor), ("regressor", regressor)])


def candidate_models(random_state: int = 42) -> dict[str, object]:
    return {
        "Linear Regression": LinearRegression(),
        "Random Forest": RandomForestRegressor(n_estimators=200, min_samples_leaf=2, random_state=random_state, n_jobs=-1),
        "Gradient Boosting": GradientBoostingRegressor(n_estimators=200, max_depth=3, random_state=random_state),
    }


def regression_metrics(actual: pd.Series, predicted: np.ndarray) -> dict[str, float]:
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(np.sqrt(mean_squared_error(actual, predicted))),
        "r2": float(r2_score(actual, predicted)),
    }


def is_promotion_eligible(dataset_hash: str, metadata: dict | None) -> bool:
    metadata = metadata or {}
    return (
        metadata.get("sha256") == dataset_hash
        and metadata.get("dataset_type") == "historical_weather_reanalysis"
        and not metadata.get("failures", [])
    )


def train_models(dataset_path: str | Path, output_dir: str | Path, dataset_metadata: dict | None = None, test_fraction: float = 0.2) -> dict:
    dataset_path = Path(dataset_path)
    output_dir = Path(output_dir)
    raw = load_daily_csv(dataset_path)
    features = make_features(raw)
    if len(features) < 60:
        raise ValueError(f"At least 60 usable chronological feature rows are required; found {len(features)}")
    if features["region"].nunique() < 1:
        raise ValueError("No regions available for training")
    train, evaluation, split_date = chronological_split(features, test_fraction)
    results = []
    fitted = {}
    for name, regressor in candidate_models().items():
        pipeline = build_pipeline(regressor)
        pipeline.fit(train[FEATURE_COLUMNS], train["target_temperature_max_c"])
        predicted = pipeline.predict(evaluation[FEATURE_COLUMNS])
        metrics = regression_metrics(evaluation["target_temperature_max_c"], predicted)
        results.append({"name": name, "metrics": metrics, "evaluation_rows": len(evaluation)})
        fitted[name] = pipeline
    selected = min(results, key=lambda result: result["metrics"]["rmse"])
    # Refit only after model selection; holdout predictions/metrics above remain untouched.
    final_model = clone(fitted[selected["name"]])
    final_model.fit(features[FEATURE_COLUMNS], features["target_temperature_max_c"])
    dataset_hash = hashlib.sha256(dataset_path.read_bytes()).hexdigest()
    metadata_in = dataset_metadata or {}
    metadata_failures = metadata_in.get("failures", [])
    promotion_eligible = is_promotion_eligible(dataset_hash, metadata_in)
    trained_at = datetime.now(timezone.utc)
    version = f"{trained_at.strftime('%Y%m%dT%H%M%SZ')}-{dataset_hash[:12]}"
    metadata = {
        "model_version": version, "trained_at": trained_at.isoformat(),
        "artifact_type": "next_day_maximum_temperature_regression",
        "feature_columns": FEATURE_COLUMNS, "feature_strategy": "three prior daily maxima; shifted three-day mean/std; seasonal sine/cosine; region one-hot",
        "split_strategy": "global chronological holdout; no shuffle; training dates strictly before evaluation dates",
        "train_rows": len(train), "evaluation_rows": len(evaluation), "usable_feature_rows": len(features),
        "raw_rows": len(raw), "regions": sorted(features["region"].unique().tolist()),
        "train_start": train["date"].min().date().isoformat(), "train_end": train["date"].max().date().isoformat(),
        "evaluation_start": evaluation["date"].min().date().isoformat(), "evaluation_end": evaluation["date"].max().date().isoformat(),
        "split_date": split_date.date().isoformat(), "test_fraction": test_fraction,
        "models": results, "selected_model": selected,
        "dataset_sha256": dataset_hash, "dataset_type": metadata_in.get("dataset_type", "unverified_input_dataset"),
        "dataset_provider": metadata_in.get("provider", "unknown"),
        "dataset_retrieved_at": metadata_in.get("retrieved_at"), "source_metadata_sha256_match": metadata_in.get("sha256") == dataset_hash,
        "source_metadata_failures": metadata_failures, "promotion_eligible": promotion_eligible,
        "risk_method": "Heat risk is deterministic heat-index screening using predicted temperature and supplied humidity; it is not a learned heat-risk classifier.",
        "limitations": "Metrics apply only to this dataset and chronological holdout. This is not an official forecast and does not establish skill on other periods or locations.",
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    model_path = output_dir / "temperature_model.joblib"
    metadata_path = output_dir / "temperature_model.metadata.json"
    joblib.dump({"model": final_model, "metadata": metadata}, model_path)
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("ml/saved_models"))
    parser.add_argument("--metadata", type=Path, help="Ingestion metadata JSON; defaults to ingestion_metadata.json beside the CSV")
    parser.add_argument("--test-fraction", type=float, default=0.2)
    args = parser.parse_args()
    metadata_path = args.metadata or args.dataset.parent / "ingestion_metadata.json"
    dataset_metadata = None
    if metadata_path.exists():
        dataset_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    result = train_models(args.dataset, args.output, dataset_metadata, args.test_fraction)
    print(json.dumps({
        "model_version": result["model_version"], "selected_model": result["selected_model"],
        "models": result["models"], "dataset_type": result["dataset_type"],
        "promotion_eligible": result["promotion_eligible"], "output": str(args.output),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
