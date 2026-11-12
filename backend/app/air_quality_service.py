import logging
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .air_quality import AirQualityClient, AirQualityProviderError
from .config import Settings
from .models import AirQualityForecastHour, AirQualityObservation
from .regions import get_region
from .time_utils import as_utc, utc_now
from .weather_service import region_or_404

logger = logging.getLogger(__name__)


def _is_fresh(retrieved_at: datetime, model_time: datetime, settings: Settings) -> bool:
    retrieved_age = (utc_now() - as_utc(retrieved_at)).total_seconds()
    model_age = (utc_now() - as_utc(model_time)).total_seconds()
    return (
        0 <= retrieved_age <= settings.weather_cache_seconds
        and -900 <= model_age <= max(7200, settings.weather_cache_seconds * 2)
    )


def air_quality_response(
    observation: AirQualityObservation, freshness: str = "current", provider_status: str = "ok", message: str | None = None,
) -> dict:
    return {
        "region": observation.region_slug, "location": get_region(observation.region_slug),
        "model_time": as_utc(observation.model_time), "retrieved_at": as_utc(observation.retrieved_at),
        "us_aqi": observation.us_aqi, "european_aqi": observation.european_aqi,
        "pm10": observation.pm10, "pm2_5": observation.pm2_5,
        "carbon_monoxide": observation.carbon_monoxide, "nitrogen_dioxide": observation.nitrogen_dioxide,
        "sulphur_dioxide": observation.sulphur_dioxide, "ozone": observation.ozone,
        "aqi_standard": "US AQI", "source": observation.source,
        "evidence_type": "air-quality-model", "is_station_observation": False,
        "freshness": freshness, "provider_status": provider_status, "message": message,
    }


def _latest_observation(db: Session, slug: str) -> AirQualityObservation | None:
    return db.scalar(select(AirQualityObservation).where(AirQualityObservation.region_slug == slug).order_by(AirQualityObservation.retrieved_at.desc()).limit(1))


def _retrieval_is_fresh(retrieved_at: datetime, settings: Settings) -> bool:
    age = (utc_now() - as_utc(retrieved_at)).total_seconds()
    return 0 <= age <= settings.weather_cache_seconds


def _store_current(db: Session, values: dict) -> AirQualityObservation:
    existing = db.scalar(select(AirQualityObservation).where(
        AirQualityObservation.region_slug == values["region_slug"],
        AirQualityObservation.model_time == values["model_time"],
        AirQualityObservation.source == values["source"],
    ))
    if existing:
        for key, value in values.items():
            setattr(existing, key, value)
        observation = existing
    else:
        observation = AirQualityObservation(**values)
        db.add(observation)
    return observation


def _hour_response(row: AirQualityForecastHour) -> dict:
    return {
        "model_time": as_utc(row.model_time), "retrieved_at": as_utc(row.retrieved_at),
        "us_aqi": row.us_aqi, "european_aqi": row.european_aqi,
        "pm10": row.pm10, "pm2_5": row.pm2_5, "carbon_monoxide": row.carbon_monoxide,
        "nitrogen_dioxide": row.nitrogen_dioxide, "sulphur_dioxide": row.sulphur_dioxide,
        "ozone": row.ozone, "source": row.source, "evidence_type": "air-quality-model",
    }


def current_air_quality(db: Session, slug: str, client: AirQualityClient, settings: Settings) -> dict:
    region = region_or_404(slug)
    cached = _latest_observation(db, slug)
    if cached and _is_fresh(cached.retrieved_at, cached.model_time, settings):
        return air_quality_response(cached)
    try:
        values = client.current(region)
        observation = _store_current(db, values)
        db.commit()
        db.refresh(observation)
        return air_quality_response(observation)
    except AirQualityProviderError as exc:
        db.rollback()
        logger.warning("Air quality unavailable for %s: %s", slug, type(exc).__name__)
        if cached:
            return air_quality_response(
                cached, "stale", "unavailable", "Live air-quality refresh failed; this is the most recent stored model estimate.",
            )
        raise HTTPException(status_code=503, detail={
            "code": "AIR_QUALITY_UNAVAILABLE", "detail": "No air-quality model estimate is available for this region.",
        }) from exc


def forecast_air_quality(db: Session, slug: str, client: AirQualityClient, settings: Settings) -> dict:
    """Return current CAMS values and up to 24 hourly values without substituting station data."""
    region = region_or_404(slug)
    current = current_air_quality(db, slug, client, settings)
    cached_hours = list(db.scalars(select(AirQualityForecastHour).where(
        AirQualityForecastHour.region_slug == slug,
        AirQualityForecastHour.model_time >= current["model_time"],
    ).order_by(AirQualityForecastHour.model_time.asc()).limit(24)).all())
    if (
        current["freshness"] == "current" and cached_hours
        and all(_retrieval_is_fresh(row.retrieved_at, settings) for row in cached_hours)
    ):
        return {**current, "hourly": [_hour_response(row) for row in cached_hours], "forecast_status": "ok", "forecast_message": None}
    try:
        values, hours = client.outlook(region)
        observation = _store_current(db, values)
        for values_for_hour in hours:
            existing = db.scalar(select(AirQualityForecastHour).where(
                AirQualityForecastHour.region_slug == slug,
                AirQualityForecastHour.model_time == values_for_hour["model_time"],
                AirQualityForecastHour.source == values_for_hour["source"],
            ))
            if existing:
                for key, value in values_for_hour.items():
                    setattr(existing, key, value)
            else:
                db.add(AirQualityForecastHour(**values_for_hour))
        db.commit()
        db.refresh(observation)
        stored_hours = list(db.scalars(select(AirQualityForecastHour).where(
            AirQualityForecastHour.region_slug == slug,
            AirQualityForecastHour.model_time >= observation.model_time,
        ).order_by(AirQualityForecastHour.model_time.asc()).limit(24)).all())
        return {
            **air_quality_response(observation), "hourly": [_hour_response(row) for row in stored_hours],
            "forecast_status": "ok", "forecast_message": None,
        }
    except AirQualityProviderError as exc:
        db.rollback()
        logger.warning("Hourly air quality unavailable for %s: %s", slug, type(exc).__name__)
        return {
            **current, "freshness": "stale" if current["freshness"] == "stale" or cached_hours else "current",
            "hourly": [_hour_response(row) for row in cached_hours], "forecast_status": "unavailable",
            "forecast_message": "Hourly air-quality refresh failed. Any hourly values shown are the most recent stored model estimates; none are fabricated.",
        }


def air_quality_history(
    db: Session, slug: str, start: datetime | None, end: datetime | None, limit: int, settings: Settings,
) -> dict:
    region_or_404(slug)
    query = select(AirQualityObservation).where(AirQualityObservation.region_slug == slug)
    if start:
        query = query.where(AirQualityObservation.model_time >= start)
    if end:
        query = query.where(AirQualityObservation.model_time <= end)
    rows = list(db.scalars(query.order_by(AirQualityObservation.model_time.desc()).limit(limit)).all())
    items = [air_quality_response(row, "current" if _is_fresh(row.retrieved_at, row.model_time, settings) else "stale") for row in rows]
    return {"region": slug, "count": len(items), "status": "stored_model_estimates" if items else "empty", "items": items}
