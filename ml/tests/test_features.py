import pandas as pd
import pytest

from ml.training.features import chronological_split, make_features


def fixture_frame(periods=40):
    dates = pd.date_range("2025-01-01", periods=periods, freq="D")
    return pd.DataFrame({"region": "mumbai", "date": dates, "temperature_2m_max": [10 + index for index in range(periods)]})


def test_lags_and_rolling_values_use_only_three_prior_days():
    features = make_features(fixture_frame())
    first = features.iloc[0]
    assert first["date"] == pd.Timestamp("2025-01-04")
    assert first["lag_1"] == 12
    assert first["lag_2"] == 11
    assert first["lag_3"] == 10
    assert first["rolling_mean_3"] == 11
    assert first["rolling_std_3"] == 1
    assert first["target_temperature_max_c"] == 13


def test_changing_future_target_does_not_change_earlier_features():
    original = fixture_frame()
    before = make_features(original).iloc[0]
    changed = original.copy()
    changed.loc[changed.index[10], "temperature_2m_max"] = 60
    after = make_features(changed).iloc[0]
    pd.testing.assert_series_equal(before.drop("target_temperature_max_c"), after.drop("target_temperature_max_c"))


def test_chronological_split_has_no_date_overlap():
    features = make_features(fixture_frame())
    train, evaluation, split = chronological_split(features)
    assert train["date"].max() < split <= evaluation["date"].min()
    assert train["date"].max() < evaluation["date"].min()
    assert set(train["date"]).isdisjoint(set(evaluation["date"]))


def test_invalid_or_duplicate_data_is_rejected():
    duplicate = pd.concat([fixture_frame(10), fixture_frame(10).iloc[[0]]], ignore_index=True)
    with pytest.raises(ValueError, match="duplicate"):
        make_features(duplicate)
    invalid = fixture_frame(10)
    invalid.loc[0, "temperature_2m_max"] = 100
    with pytest.raises(ValueError, match="outside"):
        make_features(invalid)
