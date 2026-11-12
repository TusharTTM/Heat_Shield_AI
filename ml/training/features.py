"""Leakage-safe next-day features from chronological daily maximum temperatures."""
from __future__ import annotations

import math
from pathlib import Path

import pandas as pd

FEATURE_COLUMNS = [
    "region", "lag_1", "lag_2", "lag_3", "rolling_mean_3", "rolling_std_3",
    "day_of_year_sin", "day_of_year_cos",
]
NUMERIC_FEATURES = [column for column in FEATURE_COLUMNS if column != "region"]
REQUIRED_INPUT = {"region", "date", "temperature_2m_max"}


def load_daily_csv(path: str | Path) -> pd.DataFrame:
    frame = pd.read_csv(path)
    missing = REQUIRED_INPUT - set(frame.columns)
    if missing:
        raise ValueError(f"Dataset is missing columns: {sorted(missing)}")
    return frame


def make_features(frame: pd.DataFrame) -> pd.DataFrame:
    missing = REQUIRED_INPUT - set(frame.columns)
    if missing:
        raise ValueError(f"Dataset is missing columns: {sorted(missing)}")
    data = frame.copy()
    data["date"] = pd.to_datetime(data["date"], errors="raise").dt.tz_localize(None).dt.normalize()
    data["temperature_2m_max"] = pd.to_numeric(data["temperature_2m_max"], errors="raise")
    if data.duplicated(["region", "date"]).any():
        raise ValueError("Dataset contains duplicate region/date rows")
    if not data["temperature_2m_max"].between(-70, 65).all():
        raise ValueError("Dataset contains temperatures outside -70°C to 65°C")
    data = data.sort_values(["region", "date"]).reset_index(drop=True)
    grouped = data.groupby("region", sort=False)["temperature_2m_max"]
    data["lag_1"] = grouped.shift(1)
    data["lag_2"] = grouped.shift(2)
    data["lag_3"] = grouped.shift(3)
    # All rolling inputs are shifted: row N never includes target N or a future value.
    data["rolling_mean_3"] = data.groupby("region", sort=False)["lag_1"].transform(lambda values: values.rolling(3, min_periods=3).mean())
    data["rolling_std_3"] = data.groupby("region", sort=False)["lag_1"].transform(lambda values: values.rolling(3, min_periods=3).std(ddof=1))
    day = data["date"].dt.dayofyear
    data["day_of_year_sin"] = day.map(lambda value: math.sin(2 * math.pi * value / 365.25))
    data["day_of_year_cos"] = day.map(lambda value: math.cos(2 * math.pi * value / 365.25))
    data["target_temperature_max_c"] = data["temperature_2m_max"]
    featured = data.dropna(subset=NUMERIC_FEATURES + ["target_temperature_max_c"]).copy()
    return featured[["region", "date", *FEATURE_COLUMNS[1:], "target_temperature_max_c"]].reset_index(drop=True)


def chronological_split(features: pd.DataFrame, test_fraction: float = 0.2) -> tuple[pd.DataFrame, pd.DataFrame, pd.Timestamp]:
    if not 0.1 <= test_fraction <= 0.5:
        raise ValueError("test_fraction must be between 0.1 and 0.5")
    dates = sorted(features["date"].unique())
    if len(dates) < 10:
        raise ValueError("At least ten distinct feature dates are required for a chronological split")
    split_index = int(len(dates) * (1 - test_fraction))
    split_index = min(max(split_index, 1), len(dates) - 1)
    split_date = pd.Timestamp(dates[split_index])
    train = features[features["date"] < split_date].copy()
    test = features[features["date"] >= split_date].copy()
    if train.empty or test.empty:
        raise ValueError("Chronological split produced an empty train or evaluation set")
    if train["date"].max() >= test["date"].min():
        raise AssertionError("Chronological split overlap detected")
    return train, test, split_date
