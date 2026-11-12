import logging
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .models import ForecastRecord, WeatherObservation
from .regions import get_region
from .risk import heat_index_c
from .time_utils import as_utc, utc_now
from .weather import WeatherClient, WeatherProviderError, weather_description

logger = logging.getLogger(__name__)


def region_or_404(slug: str) -> dict:
    region = get_region(slug)
    if region is None:
        raise HTTPException(status_code=404, detail={"code": "REGION_NOT_FOUND", "detail": "Unknown configured region"})
    return region


def _is_fresh(retrieved_at: datetime, observed_at: datetime, settings: Settings) -> bool:
    now = utc_now()
    retrieved_age = (now - as_utc(retrieved_at)).total_seconds()
    observed_age = (now - as_utc(observed_at)).total_seconds()
    return (
        0 <= retrieved_age <= settings.weather_cache_seconds
        and -900 <= observed_age <= max(3600, settings.weather_cache_seconds * 2)
    )


def observation_response(observation: WeatherObservation, freshness: str = "current", provider_status: str = "ok", message: str | None = None) -> dict:
    region = get_region(observation.region_slug)
    temperature = observation.temperature_c
    humidity = observation.humidity_pct
    index = round(heat_index_c(temperature, humidity), 1) if temperature is not None and humidity is not None else None
    return {
        "region": observation.region_slug, "location": region,
        "observed_at": as_utc(observation.observed_at), "retrieved_at": as_utc(observation.retrieved_at),
        "temperature_c": temperature, "humidity_pct": humidity, "wind_speed_kmh": observation.wind_speed_kmh,
        "apparent_temperature_c": observation.apparent_temperature_c, "heat_index_c": index,
        "weather_code": observation.weather_code, "source": observation.source,
        "freshness": freshness, "provider_status": provider_status, "message": message, "is_simulated": False,
    }


def _latest_observation(db: Session, slug: str) -> WeatherObservation | None:
    return db.scalar(select(WeatherObservation).where(WeatherObservation.region_slug == slug).order_by(WeatherObservation.retrieved_at.desc()).limit(1))


def current_weather(db: Session, slug: str, client: WeatherClient, settings: Settings) -> dict:
    region = region_or_404(slug)
    cached = _latest_observation(db, slug)
    if cached and _is_fresh(cached.retrieved_at, cached.observed_at, settings):
        return observation_response(cached)
    try:
        values = client.current(region)
        existing = db.scalar(select(WeatherObservation).where(
            WeatherObservation.region_slug == slug,
            WeatherObservation.observed_at == values["observed_at"],
            WeatherObservation.source == values["source"],
        ))
        if existing:
            for key, value in values.items():
                setattr(existing, key, value)
            observation = existing
        else:
            observation = WeatherObservation(**values)
            db.add(observation)
        db.commit()
        db.refresh(observation)
        return observation_response(observation)
    except WeatherProviderError as exc:
        db.rollback()
        logger.warning("Current weather unavailable for %s: %s", slug, type(exc).__name__)
        if cached:
            return observation_response(cached, "stale", "unavailable", "Live weather is unavailable; this is the most recent stored observation.")
        raise HTTPException(status_code=503, detail={"code": "WEATHER_UNAVAILABLE", "detail": "No current weather is available for this region."}) from exc


def forecast_response(rows: list[ForecastRecord], freshness: str = "current", provider_status: str = "ok", message: str | None = None) -> dict:
    if not rows:
        raise ValueError("forecast_response requires rows")
    latest = max(as_utc(row.retrieved_at) for row in rows)
    return {
        "region": rows[0].region_slug, "location": get_region(rows[0].region_slug), "retrieved_at": latest,
        "source": rows[0].source, "freshness": freshness, "provider_status": provider_status, "message": message,
        "days": [{
            "date": row.forecast_for, "temperature_max_c": row.temperature_max_c, "temperature_min_c": row.temperature_min_c,
            "humidity_mean_pct": row.humidity_mean_pct, "wind_speed_max_kmh": row.wind_speed_max_kmh,
            "precipitation_mm": row.precipitation_mm, "weather_code": row.weather_code,
            "description": weather_description(row.weather_code),
        } for row in rows],
    }


def forecast_weather(db: Session, slug: str, client: WeatherClient, settings: Settings) -> dict:
    region = region_or_404(slug)
    cached = list(db.scalars(select(ForecastRecord).where(ForecastRecord.region_slug == slug).order_by(ForecastRecord.forecast_for.asc())).all())
    latest_retrieved = max((as_utc(row.retrieved_at) for row in cached), default=None)
    cache_fresh = latest_retrieved is not None and 0 <= (utc_now() - latest_retrieved).total_seconds() <= settings.weather_cache_seconds
    if cached and cache_fresh:
        return forecast_response(cached[-5:])
    try:
        _, records = client.forecast(region)
        stored = []
        for values in records:
            existing = db.scalar(select(ForecastRecord).where(
                ForecastRecord.region_slug == slug, ForecastRecord.forecast_for == values["forecast_for"],
                ForecastRecord.source == values["source"],
            ))
            if existing:
                for key, value in values.items():
                    setattr(existing, key, value)
                row = existing
            else:
                row = ForecastRecord(**values)
                db.add(row)
            stored.append(row)
        db.commit()
        return forecast_response(stored)
    except WeatherProviderError as exc:
        db.rollback()
        logger.warning("Forecast unavailable for %s: %s", slug, type(exc).__name__)
        if cached:
            return forecast_response(cached[-5:], "stale", "unavailable", "Live forecast is unavailable; these are the most recent stored forecast days.")
        raise HTTPException(status_code=503, detail={"code": "FORECAST_UNAVAILABLE", "detail": "No forecast is available for this region."}) from exc


def weather_history(db: Session, slug: str, start: datetime | None, end: datetime | None, limit: int, settings: Settings) -> dict:
    region_or_404(slug)
    query = select(WeatherObservation).where(WeatherObservation.region_slug == slug)
    if start:
        query = query.where(WeatherObservation.observed_at >= start)
    if end:
        query = query.where(WeatherObservation.observed_at <= end)
    rows = list(db.scalars(query.order_by(WeatherObservation.observed_at.desc()).limit(limit)).all())
    items = [observation_response(row, "current" if _is_fresh(row.retrieved_at, row.observed_at, settings) else "stale") for row in rows]
    return {"region": slug, "count": len(items), "status": "stored_observations" if items else "empty", "items": items}
