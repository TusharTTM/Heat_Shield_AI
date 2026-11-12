from datetime import datetime, timedelta, timezone
from typing import Any

import httpx


SOURCE = "Open-Meteo"


class WeatherProviderError(RuntimeError):
    pass


WEATHER_DESCRIPTIONS = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
    55: "Dense drizzle", 56: "Light freezing drizzle", 57: "Dense freezing drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain", 66: "Light freezing rain",
    67: "Heavy freezing rain", 71: "Slight snowfall", 73: "Moderate snowfall", 75: "Heavy snowfall",
    77: "Snow grains", 80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    85: "Slight snow showers", 86: "Heavy snow showers", 95: "Thunderstorm",
    96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
}


def weather_description(code: int | None) -> str:
    return WEATHER_DESCRIPTIONS.get(code, "Weather description unavailable")


def _parse_provider_time(value: str, utc_offset_seconds: int) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise WeatherProviderError("Provider returned an invalid observation timestamp") from exc
    if parsed.tzinfo is None:
        parsed = (parsed - timedelta(seconds=utc_offset_seconds)).replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _weather_code(value: Any) -> int | None:
    if value is None:
        return None
    try:
        code = int(value)
    except (TypeError, ValueError) as exc:
        raise WeatherProviderError("Provider returned an invalid weather code") from exc
    if not 0 <= code <= 99:
        raise WeatherProviderError("Provider weather code outside expected range")
    return code


def _number(payload: dict, key: str, low: float, high: float, required: bool = False) -> float | None:
    value = payload.get(key)
    if value is None:
        if required:
            raise WeatherProviderError(f"Provider omitted required field: {key}")
        return None
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise WeatherProviderError(f"Provider returned invalid field: {key}") from exc
    if not low <= number <= high:
        raise WeatherProviderError(f"Provider value outside expected range: {key}")
    return number


class WeatherClient:
    """Open-Meteo client with explicit units and no client-side credentials."""

    def __init__(self, base_url: str, timeout_seconds: float = 10, transport: httpx.BaseTransport | None = None):
        self.base_url = base_url
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    def _get(self, params: dict[str, Any]) -> dict:
        try:
            with httpx.Client(timeout=self.timeout_seconds, transport=self.transport) as client:
                response = client.get(self.base_url, params=params)
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise WeatherProviderError("Weather provider request failed") from exc
        if not isinstance(payload, dict) or payload.get("error"):
            raise WeatherProviderError("Weather provider returned an error response")
        return payload

    def current(self, region: dict) -> dict:
        payload = self._get({
            "latitude": region["latitude"], "longitude": region["longitude"],
            "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
            "timezone": "Asia/Kolkata", "temperature_unit": "celsius", "wind_speed_unit": "kmh",
        })
        current = payload.get("current")
        if not isinstance(current, dict):
            raise WeatherProviderError("Provider omitted current weather")
        observed_at = _parse_provider_time(current.get("time", ""), int(payload.get("utc_offset_seconds", 0)))
        return {
            "region_slug": region["slug"], "observed_at": observed_at, "retrieved_at": datetime.now(timezone.utc),
            "temperature_c": _number(current, "temperature_2m", -70, 65, required=True),
            "humidity_pct": _number(current, "relative_humidity_2m", 0, 100, required=True),
            "wind_speed_kmh": _number(current, "wind_speed_10m", 0, 200),
            "apparent_temperature_c": _number(current, "apparent_temperature", -90, 80),
            "weather_code": _weather_code(current.get("weather_code")),
            "source": SOURCE, "provider_payload": payload,
        }

    def forecast(self, region: dict) -> tuple[datetime, list[dict]]:
        daily_fields = [
            "temperature_2m_max", "temperature_2m_min", "relative_humidity_2m_mean",
            "wind_speed_10m_max", "precipitation_sum", "weather_code",
        ]
        payload = self._get({
            "latitude": region["latitude"], "longitude": region["longitude"], "daily": ",".join(daily_fields),
            "timezone": "Asia/Kolkata", "forecast_days": 5, "temperature_unit": "celsius",
            "wind_speed_unit": "kmh", "precipitation_unit": "mm",
        })
        daily = payload.get("daily")
        if not isinstance(daily, dict) or not isinstance(daily.get("time"), list):
            raise WeatherProviderError("Provider omitted daily forecast")
        times = daily["time"]
        if len(times) != 5:
            raise WeatherProviderError("Provider did not return exactly five forecast days")
        retrieved_at = datetime.now(timezone.utc)
        records = []
        for index, day in enumerate(times):
            try:
                forecast_for = datetime.strptime(day, "%Y-%m-%d").date()
            except (TypeError, ValueError) as exc:
                raise WeatherProviderError("Provider returned an invalid forecast date") from exc
            day_payload = {field: daily.get(field, [None] * len(times))[index] for field in daily_fields}
            code = day_payload["weather_code"]
            records.append({
                "region_slug": region["slug"], "forecast_for": forecast_for, "retrieved_at": retrieved_at,
                "temperature_max_c": _number(day_payload, "temperature_2m_max", -70, 65, required=True),
                "temperature_min_c": _number(day_payload, "temperature_2m_min", -80, 60, required=True),
                "humidity_mean_pct": _number(day_payload, "relative_humidity_2m_mean", 0, 100),
                "wind_speed_max_kmh": _number(day_payload, "wind_speed_10m_max", 0, 200),
                "precipitation_mm": _number(day_payload, "precipitation_sum", 0, 2000),
                "weather_code": _weather_code(code), "source": SOURCE,
            })
        return retrieved_at, records
