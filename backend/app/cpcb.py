import math
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx


SOURCE = "Central Pollution Control Board via Open Government Data Platform India"
RESOURCE_URL = "https://www.data.gov.in/catalog/real-time-air-quality-index"
LICENSE_URL = "https://data.gov.in/godl"
IST = ZoneInfo("Asia/Kolkata")
CITY_FILTERS = {"south-mumbai": "Mumbai"}
POLLUTANT_ALIASES = {
    "PM2.5": "PM2.5", "PM2_5": "PM2.5", "PM25": "PM2.5", "PM10": "PM10",
    "CO": "CO", "NO2": "NO2", "SO2": "SO2", "O3": "O3", "OZONE": "O3",
    "NH3": "NH3", "PB": "Pb",
}


class CPCBProviderError(RuntimeError):
    code = "CPCB_UNAVAILABLE"


class CPCBNotConfigured(CPCBProviderError):
    code = "CPCB_NOT_CONFIGURED"


class CPCBAuthenticationError(CPCBProviderError):
    code = "CPCB_AUTH_FAILED"


class CPCBRateLimitError(CPCBProviderError):
    code = "CPCB_RATE_LIMITED"


def cpcb_aqi_category(value: float) -> str:
    if value <= 50:
        return "Good"
    if value <= 100:
        return "Satisfactory"
    if value <= 200:
        return "Moderate"
    if value <= 300:
        return "Poor"
    if value <= 400:
        return "Very Poor"
    return "Severe"


def cpcb_screening_level(value: float) -> str:
    """Display mapping only; this does not calculate an AQI from pollutant records."""
    cpcb_aqi_category(value)
    return "low" if value <= 100 else "moderate" if value <= 200 else "high" if value <= 300 else "extreme"


def _optional_number(value: Any) -> float | None:
    if value is None or str(value).strip().upper() in {"", "NA", "N/A", "NULL", "NONE", "-"}:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("invalid numeric pollutant field") from exc
    if not math.isfinite(number) or not 0 <= number <= 100000:
        raise ValueError("out-of-range pollutant field")
    return number


def _observation_time(value: Any) -> datetime:
    text = str(value or "").strip()
    if not text:
        raise ValueError("missing station timestamp")
    try:
        if "-" in text[:10] and len(text) >= 19 and text[2] == "-":
            parsed = datetime.strptime(text[:19], "%d-%m-%Y %H:%M:%S").replace(tzinfo=IST)
        else:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=IST)
    except ValueError as exc:
        raise ValueError("invalid station timestamp") from exc
    return parsed.astimezone(timezone.utc)


class CPCBClient:
    """Server-only OGD/CPCB client. It never derives missing Indian AQI from pollutant averages."""

    def __init__(self, base_url: str, api_key: str, timeout_seconds: float = 10, transport: httpx.BaseTransport | None = None):
        self.base_url = base_url
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    @property
    def configured(self) -> bool:
        return bool(self.api_key.strip())

    def observations(self, region: dict) -> dict:
        if not self.configured:
            raise CPCBNotConfigured("data.gov.in API key is not configured")
        params = {
            "api-key": self.api_key, "format": "json", "offset": 0, "limit": 1000,
            "filters[city]": CITY_FILTERS.get(region["slug"], region["name"]),
        }
        try:
            with httpx.Client(timeout=self.timeout_seconds, transport=self.transport, follow_redirects=False) as client:
                response = client.get(self.base_url, params=params)
                if response.status_code in {401, 403}:
                    raise CPCBAuthenticationError("data.gov.in rejected the configured API key")
                if response.status_code == 429:
                    raise CPCBRateLimitError("data.gov.in rate limit reached")
                if 300 <= response.status_code < 400:
                    raise CPCBProviderError("data.gov.in returned an unexpected redirect")
                response.raise_for_status()
                payload = response.json()
        except CPCBProviderError:
            raise
        except httpx.HTTPStatusError as exc:
            raise CPCBProviderError("data.gov.in returned an HTTP error") from exc
        except (httpx.HTTPError, ValueError) as exc:
            raise CPCBProviderError("data.gov.in request failed") from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("records"), list):
            raise CPCBProviderError("data.gov.in omitted the station records array")
        if payload.get("status") not in {None, "ok", "success"}:
            raise CPCBProviderError("data.gov.in returned an error response")
        return self._parse_records(region, payload["records"])

    def _parse_records(self, region: dict, records: list) -> dict:
        retrieved_at = datetime.now(timezone.utc)
        grouped: dict[tuple, dict] = {}
        invalid_records = 0
        for record in records:
            if not isinstance(record, dict):
                invalid_records += 1
                continue
            try:
                station = str(record.get("station") or "").strip()
                pollutant_id = str(record.get("pollutant_id") or "").strip().upper()
                if not station or not pollutant_id:
                    raise ValueError("missing station or pollutant identifier")
                observed_at = _observation_time(record.get("last_update"))
                if observed_at > retrieved_at + timedelta(minutes=5):
                    raise ValueError("station timestamp is in the future")
                minimum = _optional_number(record.get("pollutant_min"))
                maximum = _optional_number(record.get("pollutant_max"))
                average = _optional_number(record.get("pollutant_avg"))
                if minimum is None and maximum is None and average is None:
                    raise ValueError("pollutant has no readings")
                unit = str(record.get("pollutant_unit") or "").strip()
                if unit.upper() in {"", "NA", "N/A", "NULL", "NONE", "-"}:
                    unit = ""
                city = str(record.get("city") or region["name"]).strip()
                state = str(record.get("state") or region["state"]).strip()
                country = str(record.get("country") or "India").strip()
                key = (country, state, city, station, observed_at)
                group = grouped.setdefault(key, {
                    "region_slug": region["slug"], "country": country, "state": state, "city": city,
                    "station": station, "observed_at": observed_at, "retrieved_at": retrieved_at,
                    "aqi": None, "pollutants": {}, "source": SOURCE,
                })
                if pollutant_id in {"AQI", "NAQI", "NATIONAL_AQI", "NATIONAL AQI"}:
                    if average is None or not 0 <= average <= 1000:
                        raise ValueError("invalid supplied AQI")
                    group["aqi"] = average
                else:
                    canonical = POLLUTANT_ALIASES.get(pollutant_id, pollutant_id)
                    group["pollutants"][canonical] = {
                        "pollutant_id": pollutant_id, "minimum": minimum, "maximum": maximum,
                        "average": average, "unit": unit or None,
                    }
            except (TypeError, ValueError):
                invalid_records += 1
        latest_by_station: dict[tuple[str, str], dict] = {}
        for observation in grouped.values():
            key = (observation["city"], observation["station"])
            current = latest_by_station.get(key)
            if current is None or observation["observed_at"] > current["observed_at"]:
                latest_by_station[key] = observation
        observations = sorted(latest_by_station.values(), key=lambda item: (item["station"], item["observed_at"]))
        return {
            "observations": observations, "records_read": len(records),
            "invalid_records": invalid_records, "observation_count": len(observations),
        }
