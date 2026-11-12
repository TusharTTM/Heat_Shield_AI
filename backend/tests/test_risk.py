import pytest

from backend.app.risk import air_quality_risk_result, classify_heat_risk, heat_index_c


@pytest.mark.parametrize("temperature,humidity,expected", [
    (34.8, 62, 45.4), (33.9, 66, 44.5), (36.4, 54, 46.2), (35.0, 45, 38.8),
    (34.8, 32, 34.8), (45.0, 30, 54.1), (42.1, 25, 44.8),
])
def test_heat_index_parity_with_labelled_frontend_demo_calculations(temperature, humidity, expected):
    # These fixed fixtures test formula parity only; they are not observations.
    assert heat_index_c(temperature, humidity) == expected


@pytest.mark.parametrize("index,underlying,display", [
    (26.9, "low", "low"), (27, "moderate", "moderate"), (32.9, "moderate", "moderate"),
    (33, "high", "high"), (39.9, "high", "high"), (40, "severe", "high"),
    (51.9, "severe", "high"), (52, "extreme", "extreme"),
])
def test_shared_risk_threshold_boundaries(index, underlying, display):
    assert classify_heat_risk(index) == (display, underlying)


@pytest.mark.parametrize("aqi,category,level", [
    (0, "Good", "low"), (50, "Good", "low"), (51, "Moderate", "moderate"),
    (100, "Moderate", "moderate"), (101, "Unhealthy for Sensitive Groups", "moderate"),
    (150, "Unhealthy for Sensitive Groups", "moderate"), (151, "Unhealthy", "high"),
    (200, "Unhealthy", "high"), (201, "Very Unhealthy", "extreme"),
    (300, "Very Unhealthy", "extreme"), (301, "Hazardous", "extreme"), (500, "Hazardous", "extreme"),
])
def test_modelled_us_aqi_categories_and_screening_boundaries(aqi, category, level):
    result = air_quality_risk_result(aqi)
    assert result["aqi_category"] == category
    assert result["level"] == level
    assert result["recommendation"]


@pytest.mark.parametrize("aqi", [-1, 1001, float("nan"), float("inf")])
def test_invalid_aqi_is_rejected(aqi):
    with pytest.raises(ValueError):
        air_quality_risk_result(aqi)
