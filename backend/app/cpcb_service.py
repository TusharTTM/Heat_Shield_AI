import logging
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .cpcb import (
    CPCBNotConfigured, CPCBProviderError, CPCBClient, LICENSE_URL, RESOURCE_URL, SOURCE,
    cpcb_aqi_category, cpcb_screening_level,
)
from .models import OfficialAirQualityFetch, OfficialAirQualityObservation
from .regions import get_region
from .time_utils import as_utc, utc_now
from .weather_service import region_or_404

logger = logging.getLogger(__name__)
ATTRIBUTION = (
    "Central Pollution Control Board, Ministry of Environment, Forest and Climate Change; "
    "Real time Air Quality Index, Open Government Data Platform India. "
    "Published under Government Open Data License - India."
)
AQI_METHOD = (
    "Indian CPCB AQI and categories are shown only when an AQI record is supplied by the resource. "
    "No AQI is calculated from incomplete station pollutant min/max/average records. "
    "Four-level display mapping for supplied AQI: 0-100 Low, 101-200 Moderate, 201-300 High, above 300 Extreme."
)


def _latest_state(db: Session, slug: str) -> OfficialAirQualityFetch | None:
    return db.get(OfficialAirQualityFetch, slug)


def _stored_observations(db: Session, slug: str, limit: int = 100) -> list[OfficialAirQualityObservation]:
    return list(db.scalars(select(OfficialAirQualityObservation).where(
        OfficialAirQualityObservation.region_slug == slug,
    ).order_by(OfficialAirQualityObservation.observed_at.desc()).limit(limit)).all())


def _observation_dict(row: OfficialAirQualityObservation) -> dict:
    return {
        "station": row.station, "country": row.country, "state": row.state, "city": row.city,
        "observed_at": as_utc(row.observed_at), "retrieved_at": as_utc(row.retrieved_at),
        "aqi": row.aqi, "aqi_category": cpcb_aqi_category(row.aqi) if row.aqi is not None else None,
        "aqi_standard": "Indian CPCB AQI" if row.aqi is not None else None,
        "screening_level": cpcb_screening_level(row.aqi) if row.aqi is not None else None,
        "pollutants": row.pollutants, "source": row.source, "evidence_type": "station-observation",
    }


def _response(
    slug: str, rows: list[OfficialAirQualityObservation], state: OfficialAirQualityFetch | None,
    freshness: str = "current", provider_status: str = "ok", message: str | None = None,
) -> dict:
    # A current response contains only the latest provider batch, never every stored history row.
    # If that batch was empty, older rows remain available through history but are not current observations.
    if state and state.observation_count == 0 and freshness == "current":
        rows = []
    elif rows:
        latest_batch = max(as_utc(row.retrieved_at) for row in rows)
        rows = [row for row in rows if as_utc(row.retrieved_at) == latest_batch]
    retrieved_candidates = [as_utc(row.retrieved_at) for row in rows]
    if state:
        retrieved_candidates.append(as_utc(state.retrieved_at))
    if not retrieved_candidates:
        raise ValueError("A CPCB response requires a retrieval timestamp")
    return {
        "region": slug, "location": get_region(slug), "source": SOURCE, "evidence_type": "station-observation",
        "freshness": freshness, "provider_status": provider_status, "retrieved_at": max(retrieved_candidates),
        "latest_observation_at": max((as_utc(row.observed_at) for row in rows), default=None),
        "records_read": state.records_read if state else 0,
        "invalid_records": state.invalid_records if state else 0,
        "count": len(rows), "observations": [_observation_dict(row) for row in rows],
        "message": message, "attribution": ATTRIBUTION, "resource_url": RESOURCE_URL,
        "license_url": LICENSE_URL, "aqi_method": AQI_METHOD,
    }


def _is_fresh(state: OfficialAirQualityFetch | None, settings: Settings) -> bool:
    if state is None:
        return False
    age = (utc_now() - as_utc(state.retrieved_at)).total_seconds()
    return 0 <= age <= settings.cpcb_cache_seconds


def current_official_air_quality(db: Session, slug: str, client: CPCBClient, settings: Settings) -> dict:
    region = region_or_404(slug)
    state = _latest_state(db, slug)
    rows = _stored_observations(db, slug)
    if _is_fresh(state, settings):
        message = "No station records matched the configured city filter; this is not an all-clear or proof of clean air." if state and state.observation_count == 0 else None
        return _response(slug, rows, state, message=message)
    try:
        result = client.observations(region)
        retrieved_at = utc_now()
        for values in result["observations"]:
            existing = db.scalar(select(OfficialAirQualityObservation).where(
                OfficialAirQualityObservation.region_slug == slug,
                OfficialAirQualityObservation.station == values["station"],
                OfficialAirQualityObservation.observed_at == values["observed_at"],
            ))
            if existing:
                for key, value in values.items():
                    setattr(existing, key, value)
            else:
                db.add(OfficialAirQualityObservation(**values))
        state = state or OfficialAirQualityFetch(region_slug=slug, retrieved_at=retrieved_at)
        state.retrieved_at = retrieved_at
        state.records_read = result["records_read"]
        state.invalid_records = result["invalid_records"]
        state.observation_count = result["observation_count"]
        db.add(state)
        db.commit()
        rows = _stored_observations(db, slug)
        message = "No station records matched the configured city filter; this is not an all-clear or proof of clean air." if result["observation_count"] == 0 else None
        return _response(slug, rows, state, message=message)
    except CPCBProviderError as exc:
        db.rollback()
        logger.warning("CPCB observations unavailable for %s: %s", slug, exc.code)
        state = _latest_state(db, slug)
        rows = _stored_observations(db, slug)
        if state or rows:
            detail = "CPCB refresh is not configured; stored station observations are shown with their original timestamps." if isinstance(exc, CPCBNotConfigured) else "Live CPCB refresh failed; stored station observations are shown with their original timestamps."
            return _response(slug, rows, state, "stale", "unavailable", detail)
        detail = {
            "CPCB_NOT_CONFIGURED": "Set DATA_GOV_IN_API_KEY on the Python backend. No CPCB station data is available.",
            "CPCB_AUTH_FAILED": "data.gov.in rejected the configured API key. Check the server-side credential.",
            "CPCB_RATE_LIMITED": "data.gov.in rate limit reached. Retry later and retain the hourly cache.",
        }.get(exc.code, "CPCB station observations could not be retrieved. No substitute readings are shown.")
        raise HTTPException(status_code=503, detail={"code": exc.code, "detail": detail, "resource_url": RESOURCE_URL}) from exc


def official_air_quality_history(db: Session, slug: str, limit: int) -> dict:
    region_or_404(slug)
    rows = _stored_observations(db, slug, limit)
    return {
        "region": slug, "count": len(rows),
        "status": "stored_station_observations" if rows else "empty",
        "items": [_observation_dict(row) for row in rows],
    }
