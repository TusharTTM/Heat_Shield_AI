from datetime import datetime, timezone
from typing import Any

import httpx

from .weather import _number, _parse_provider_time


SOURCE = "Open-Meteo Air Quality API (CAMS model)"
CURRENT_FIELDS = (
    "us_aqi", "european_aqi", "pm10", "pm2_5", "carbon_monoxide", "nitrogen_dioxide", "sulphur_dioxide", "ozone",
)
RANGES = {
    "us_aqi": (0, 1000), "european_aqi": (0, 1000), "pm10": (0, 5000), "pm2_5": (0, 5000),
    "carbon_monoxide": (0, 20000), "nitrogen_dioxide": (0, 2000),
    "sulphur_dioxide": (0, 2000), "ozone": (0, 2000),
}


class AirQualityProviderError(RuntimeError):
    pass


class AirQualityClient:
    """Source-aware CAMS model client; never represents values as CPCB station observations."""

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
            raise AirQualityProviderError("Air-quality provider request failed") from exc
        if not isinstance(payload, dict) or payload.get("error"):
            raise AirQualityProviderError("Air-quality provider returned an error response")
        return payload

    def _current_values(self, region: dict, payload: dict) -> dict:
        current = payload.get("current")
        if not isinstance(current, dict):
            raise AirQualityProviderError("Provider omitted current air-quality model data")
        try:
            model_time = _parse_provider_time(current.get("time", ""), int(payload.get("utc_offset_seconds", 0)))
            values = {field: _number(current, field, low, high) for field, (low, high) in RANGES.items()}
        except Exception as exc:
            raise AirQualityProviderError(f"Provider returned invalid air-quality data: {type(exc).__name__}") from exc
        if all(values[field] is None for field in CURRENT_FIELDS):
            raise AirQualityProviderError("Provider returned no air-quality measurements")
        return {
            "region_slug": region["slug"], "model_time": model_time,
            "retrieved_at": datetime.now(timezone.utc), **values,
            "source": SOURCE, "provider_payload": payload,
        }

    def _hourly_values(self, region: dict, payload: dict, current_values: dict) -> list[dict]:
        hourly = payload.get("hourly")
        if not isinstance(hourly, dict) or not isinstance(hourly.get("time"), list):
            raise AirQualityProviderError("Provider omitted hourly air-quality model data")
        times = hourly["time"]
        raw_current_time = payload["current"]["time"]
        try:
            current_index = times.index(raw_current_time)
        except ValueError:
            current_index = next((index for index, value in enumerate(times) if isinstance(value, str) and value >= raw_current_time), -1)
        if current_index < 0:
            raise AirQualityProviderError("Provider hourly outlook does not include the current model time")
        rows = []
        offset_seconds = int(payload.get("utc_offset_seconds", 0))
        try:
            for index in range(current_index, min(current_index + 24, len(times))):
                value = times[index]
                if not isinstance(value, str):
                    raise ValueError("invalid hourly timestamp")
                model_time = _parse_provider_time(value, offset_seconds)
                values = {field: _number({field: hourly.get(field, [None] * len(times))[index]}, field, low, high) for field, (low, high) in RANGES.items()}
                if all(reading is None for reading in values.values()):
                    continue
                rows.append({
                    "region_slug": region["slug"], "model_time": model_time,
                    "retrieved_at": current_values["retrieved_at"], **values, "source": SOURCE,
                })
        except (IndexError, TypeError, ValueError) as exc:
            raise AirQualityProviderError("Provider returned invalid hourly air-quality data") from exc
        if not rows:
            raise AirQualityProviderError("Provider returned no hourly air-quality estimates")
        return rows

    def current(self, region: dict) -> dict:
        payload = self._get({
            "latitude": region["latitude"], "longitude": region["longitude"],
            "current": ",".join(CURRENT_FIELDS), "timezone": "Asia/Kolkata",
        })
        return self._current_values(region, payload)

    def outlook(self, region: dict) -> tuple[dict, list[dict]]:
        payload = self._get({
            "latitude": region["latitude"], "longitude": region["longitude"],
            "current": ",".join(CURRENT_FIELDS), "hourly": ",".join(CURRENT_FIELDS),
            "forecast_days": 2, "timezone": "Asia/Kolkata",
        })
        current_values = self._current_values(region, payload)
        return current_values, self._hourly_values(region, payload, current_values)
