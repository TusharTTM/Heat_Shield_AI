import math

from .regions import ROOT


import json

RISK_THRESHOLDS = json.loads((ROOT / "shared" / "risk_thresholds.json").read_text(encoding="utf-8"))
DISPLAY_LEVELS = {"low": "low", "moderate": "moderate", "high": "high", "severe": "high", "extreme": "extreme"}
RECOMMENDATIONS = {
    "low": "Conditions are usually manageable. Drink water regularly, wear lightweight clothing, and check on people who are more sensitive to heat.",
    "moderate": "Reduce long periods in direct sun. Carry water, take shade breaks, and avoid strenuous activity during the hottest part of the day.",
    "high": "Avoid unnecessary outdoor activity, especially around midday. Move to a cooler place, drink water often, and check on older adults, children, and people with health conditions.",
    "extreme": "Stay in an air-conditioned or coolest available space. Avoid outdoor exertion. Check on vulnerable people frequently and seek medical help for signs of heatstroke.",
}
GENERAL_TIPS = [
    {"id": "hydrate", "title": "Drink before you feel thirsty", "description": "Sip water regularly throughout the day. Do not rely on thirst alone during hot weather.", "action": "Carry a refillable bottle and keep water within easy reach.", "source_url": "https://www.weather.gov/safety/heat"},
    {"id": "shade", "title": "Plan around the hottest hours", "description": "Move outdoor work or exercise to cooler morning or evening hours whenever possible.", "action": "Take frequent breaks in shade or an air-conditioned place.", "source_url": "https://www.weather.gov/safety/heat"},
    {"id": "clothing", "title": "Dress for cooling", "description": "Lightweight, loose-fitting, light-colored clothing helps your body manage heat.", "action": "Use a hat and sunscreen when you are in direct sunlight.", "source_url": "https://www.weather.gov/safety/heat"},
    {"id": "community", "title": "Check on one another", "description": "Older adults, young children, pregnant people, outdoor workers, and people with some health conditions can be more vulnerable.", "action": "Make a check-in plan with neighbors and family members.", "source_url": "https://www.weather.gov/safety/heat"},
    {"id": "warning", "title": "Know the warning signs", "description": "Heavy sweating, weakness, dizziness, nausea, headache, or cramps can signal heat exhaustion. Confusion, fainting, hot dry skin, or a very high body temperature can signal heatstroke.", "action": "Move to a cooler place and cool the person. For confusion, loss of consciousness, or suspected heatstroke, call local emergency services immediately. Do not give fluids to someone who is unconscious or severely confused.", "source_url": "https://www.weather.gov/safety/heat-illness"},
]


def heat_index_c(temperature_c: float, humidity_pct: float) -> float:
    """Match the verified frontend NWS approximation, including its adjustments."""
    t = temperature_c * 9 / 5 + 32
    rh = humidity_pct
    simple = 0.5 * (t + 61 + ((t - 68) * 1.2) + rh * 0.094)
    index_f = (simple + t) / 2
    if index_f >= 80:
        index_f = (
            -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh
            - 0.00683783 * t * t - 0.05481717 * rh * rh + 0.00122874 * t * t * rh
            + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh
        )
        if rh < 13 and 80 <= t <= 112:
            index_f -= ((13 - rh) / 4) * math.sqrt((17 - abs(t - 95)) / 17)
        elif rh > 85 and 80 <= t <= 87:
            index_f += ((rh - 85) / 10) * ((87 - t) / 5)
    index_c = (index_f - 32) * 5 / 9
    return round(index_c, 1) if math.isfinite(index_c) else temperature_c


def classify_heat_risk(index_c: float) -> tuple[str, str]:
    underlying = "extreme"
    for band in RISK_THRESHOLDS["levels"]:
        if band["maximum_heat_index_c"] is None or index_c < band["maximum_heat_index_c"]:
            underlying = band["level"]
            break
    return DISPLAY_LEVELS[underlying], underlying


def risk_result(temperature_c: float, humidity_pct: float) -> dict:
    index = round(heat_index_c(temperature_c, humidity_pct), 1)
    level, underlying = classify_heat_risk(index)
    return {
        "temperature_c": temperature_c,
        "humidity_pct": humidity_pct,
        "heat_index_c": index,
        "level": level,
        "underlying_level": underlying,
        "explanation": RECOMMENDATIONS[level],
        "screening_warning": RISK_THRESHOLDS["warning"],
        "method": "NWS heat-index approximation plus configured screening thresholds; not a trained model or official warning.",
    }


AQI_RECOMMENDATIONS = {
    "Good": "Normal outdoor activity is generally reasonable. Check local station information if you are particularly sensitive to air pollution.",
    "Moderate": "People who are unusually sensitive to air pollution should monitor symptoms and consider reducing prolonged strenuous outdoor exertion.",
    "Unhealthy for Sensitive Groups": "Children, older adults, pregnant people, and people with heart or lung disease should reduce prolonged or strenuous outdoor exertion.",
    "Unhealthy": "Reduce prolonged or strenuous outdoor exertion. Sensitive groups should avoid it and follow local public-health advice.",
    "Very Unhealthy": "Avoid outdoor exertion and reduce exposure to outdoor air. Follow official local health guidance.",
    "Hazardous": "Remain indoors where possible, avoid outdoor exertion, and follow official local health or emergency guidance.",
}


def air_quality_category(us_aqi: float) -> str:
    if not math.isfinite(us_aqi) or not 0 <= us_aqi <= 1000:
        raise ValueError("US AQI must be a finite value from 0 to 1000")
    if us_aqi <= 50:
        return "Good"
    if us_aqi <= 100:
        return "Moderate"
    if us_aqi <= 150:
        return "Unhealthy for Sensitive Groups"
    if us_aqi <= 200:
        return "Unhealthy"
    if us_aqi <= 300:
        return "Very Unhealthy"
    return "Hazardous"


EUROPEAN_AQI_RECOMMENDATIONS = {
    "Good": AQI_RECOMMENDATIONS["Good"],
    "Fair": AQI_RECOMMENDATIONS["Moderate"],
    "Moderate": AQI_RECOMMENDATIONS["Unhealthy for Sensitive Groups"],
    "Poor": AQI_RECOMMENDATIONS["Unhealthy"],
    "Very Poor": AQI_RECOMMENDATIONS["Very Unhealthy"],
    "Extremely Poor": AQI_RECOMMENDATIONS["Hazardous"],
}
RISK_RANK = {"low": 0, "moderate": 1, "high": 2, "extreme": 3}


def european_air_quality_category(european_aqi: float) -> str:
    if not math.isfinite(european_aqi) or not 0 <= european_aqi <= 1000:
        raise ValueError("European AQI must be a finite value from 0 to 1000")
    if european_aqi <= 20:
        return "Good"
    if european_aqi <= 40:
        return "Fair"
    if european_aqi <= 60:
        return "Moderate"
    if european_aqi <= 80:
        return "Poor"
    if european_aqi <= 100:
        return "Very Poor"
    return "Extremely Poor"


def european_air_quality_level(european_aqi: float) -> str:
    european_air_quality_category(european_aqi)
    return "low" if european_aqi <= 40 else "moderate" if european_aqi <= 60 else "high" if european_aqi <= 80 else "extreme"


def air_quality_risk_result(us_aqi: float | None, european_aqi: float | None = None) -> dict:
    if us_aqi is None and european_aqi is None:
        raise ValueError("At least one AQI index is required")
    category = air_quality_category(us_aqi) if us_aqi is not None else None
    us_level = ("low" if us_aqi <= 50 else "moderate" if us_aqi <= 150 else "high" if us_aqi <= 200 else "extreme") if us_aqi is not None else None
    european_category = european_air_quality_category(european_aqi) if european_aqi is not None else None
    european_level = european_air_quality_level(european_aqi) if european_aqi is not None else None
    candidates = [value for value in (us_level, european_level) if value is not None]
    level = max(candidates, key=RISK_RANK.__getitem__)
    use_european_recommendation = european_level is not None and (us_level is None or RISK_RANK[european_level] > RISK_RANK[us_level])
    recommendation = EUROPEAN_AQI_RECOMMENDATIONS[european_category] if use_european_recommendation else AQI_RECOMMENDATIONS[category]
    descriptions = []
    if us_aqi is not None:
        descriptions.append(f"{category} modelled US AQI ({us_aqi:g})")
    if european_aqi is not None:
        descriptions.append(f"{european_category} modelled European AQI ({european_aqi:g})")
    return {
        "us_aqi": us_aqi, "european_aqi": european_aqi, "aqi_category": category,
        "european_aqi_category": european_category, "european_level": european_level, "level": level,
        "explanation": f"{'; '.join(descriptions)} from the Open-Meteo/CAMS air-quality model. The overall level uses the more severe available index. This is not a CPCB monitoring-station observation, Indian CPCB AQI, or an official health warning.",
        "recommendation": recommendation,
        "method": "Deterministic US AQI mapping: 0-50 Low, 51-150 Moderate, 151-200 High, above 200 Extreme. European AQI mapping: 0-40 Low, 41-60 Moderate, 61-80 High, above 80 Extreme. Not AI-generated analysis.",
    }


def safety_result(level: str) -> dict:
    if level not in RECOMMENDATIONS:
        raise KeyError(level)
    return {
        "level": level,
        "recommendation": RECOMMENDATIONS[level],
        "general_tips": GENERAL_TIPS,
        "emergency_guidance": "Confusion, fainting, hot dry skin, or a very high body temperature may indicate heatstroke. Call local emergency services immediately and begin cooling. AI output is not a substitute for professional medical care.",
    }
