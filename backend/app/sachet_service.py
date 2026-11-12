import logging
import re
from datetime import timedelta
from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .config import Settings
from .models import ExternalDocumentCache, OfficialAlert, OfficialAlertFetch
from .regions import get_region
from .sachet import FEED_GUIDE_URL, PORTAL_URL, SachetClient, SachetDocument, SachetProviderError
from .time_utils import as_utc, utc_now
from .weather_service import region_or_404

logger = logging.getLogger(__name__)
SOURCE = "NDMA SACHET Common Alerting Protocol"
ATTRIBUTION = "NDMA SACHET and the issuing agency preserved in each CAP message. The official all-India RSS feed declares public domain."
MATCH_LIMITATIONS = (
    "Only active Actual/Public CAP alerts with a future expiry are shown. Location matching uses embedded polygons, "
    "explicit national scope, or conservative state + place-name text. External polygon files and ambiguous areas are not guessed. "
    "No match is not an all-clear; check the issuing agency and SACHET directly."
)
PLACES = {
    "mumbai": ["Mumbai", "Mumbai City", "Mumbai Suburban"],
    "south-mumbai": ["South Mumbai", "Mumbai City", "Mumbai"],
    "thane": ["Thane"],
    "navi-mumbai": ["Navi Mumbai"],
    "pune": ["Pune"],
    "ahmedabad": ["Ahmedabad", "Ahmadabad"],
    "delhi": ["Delhi", "New Delhi", "NCT of Delhi"],
    "jaipur": ["Jaipur"],
    "lucknow": ["Lucknow"],
    "bhopal": ["Bhopal"],
    "hyderabad": ["Hyderabad"],
    "bengaluru": ["Bengaluru", "Bangalore", "Bengaluru Urban"],
    "chennai": ["Chennai"],
    "kochi": ["Kochi", "Cochin", "Ernakulam"],
    "kolkata": ["Kolkata", "Calcutta"],
}
STATE_ALIASES = {"Delhi": ["Delhi", "NCT of Delhi"]}
SEVERITY_LEVELS = {"Extreme": "extreme", "Severe": "high", "Moderate": "moderate", "Minor": "low"}


def _contains_place(text: str, place: str) -> bool:
    pattern = r"(?<![A-Za-z])" + re.escape(place).replace(r"\ ", r"[\s-]+") + r"(?![A-Za-z])"
    return re.search(pattern, text, re.IGNORECASE) is not None


def _point_in_polygon(latitude: float, longitude: float, ring: list) -> bool:
    inside = False
    if len(ring) < 3:
        return False
    previous = ring[-1]
    for current in ring:
        try:
            y1, x1 = float(previous[0]), float(previous[1])
            y2, x2 = float(current[0]), float(current[1])
        except (TypeError, ValueError, IndexError):
            return False
        if (y1 > latitude) != (y2 > latitude):
            intersection = (x2 - x1) * (latitude - y1) / (y2 - y1) + x1
            if longitude < intersection:
                inside = not inside
        previous = current
    return inside


def match_alert_to_region(alert: OfficialAlert, region: dict) -> dict | None:
    for index, ring in enumerate(alert.polygons or []):
        if _point_in_polygon(region["latitude"], region["longitude"], ring):
            area = alert.areas[index] if index < len(alert.areas or []) else (alert.areas or [None])[0]
            return {"match_type": "embedded-polygon", "matched_area": area, "match_explanation": "The selected coordinates fall inside a polygon embedded in the official CAP message."}
    area_text = " | ".join(alert.areas or [])
    searchable = " | ".join([alert.headline or "", area_text])
    if any(_contains_place(searchable, phrase) for phrase in ["All India", "entire country"]):
        return {"match_type": "national-area", "matched_area": area_text or "All India", "match_explanation": "The official CAP area explicitly states national coverage."}
    state_names = STATE_ALIASES.get(region["state"], [region["state"]])
    state_text = " | ".join([alert.sender or "", alert.headline or "", area_text])
    if not any(_contains_place(state_text, state) for state in state_names):
        return None
    if region["slug"] in {"mumbai", "south-mumbai"}:
        searchable = re.sub(r"Navi[\s-]+Mumbai", " ", searchable, flags=re.IGNORECASE)
    for place in PLACES.get(region["slug"], [region["name"]]):
        if _contains_place(searchable, place):
            return {
                "match_type": "area-text", "matched_area": area_text or place,
                "match_explanation": f"The official CAP area/headline explicitly names {place} and {region['state']}. Text matching is conservative but is not a precise point-in-polygon assertion.",
            }
    return None


def _document(db: Session, url: str) -> ExternalDocumentCache | None:
    return db.get(ExternalDocumentCache, url)


def _save_document(db: Session, url: str, source: str, document: SachetDocument) -> ExternalDocumentCache:
    if document.body is None:
        raise ValueError("A 200 document response requires a body")
    cached = _document(db, url)
    if cached is None:
        cached = ExternalDocumentCache(url=url, source=source, body=document.body, retrieved_at=document.checked_at, checked_at=document.checked_at)
    cached.body = document.body
    cached.etag = document.etag
    cached.retrieved_at = document.checked_at
    cached.checked_at = document.checked_at
    cached.source = source
    db.add(cached)
    return cached


def _json_info(info: dict | None) -> dict:
    if info is None:
        return {}
    result = {}
    for key, value in info.items():
        if hasattr(value, "isoformat"):
            result[key] = value.isoformat()
        else:
            result[key] = value
    return result


def _store_alert(db: Session, parsed: dict, source_url: str, retrieved_at, seen_at) -> OfficialAlert:
    identifier = parsed["identifier"].strip()
    sender = parsed["sender"].strip()
    if not identifier or not sender or not parsed["status"] or not parsed["msg_type"] or not parsed["scope"]:
        raise SachetProviderError("CAP omitted required alert identity fields", "SACHET_INVALID_CAP")
    if parsed["sent"] and parsed["sent"] > utc_now() + timedelta(minutes=5):
        raise SachetProviderError("CAP sent time is in the future", "SACHET_INVALID_CAP")
    info = parsed["info"]
    if parsed["msg_type"] in {"Alert", "Update"}:
        if info is None or not info.get("event") or not info.get("severity"):
            raise SachetProviderError("CAP alert omitted event or severity", "SACHET_INVALID_CAP")
    existing = db.scalar(select(OfficialAlert).where(OfficialAlert.identifier == identifier, OfficialAlert.sender == sender))
    if existing is None:
        existing = OfficialAlert(
            identifier=identifier, sender=sender, status=parsed["status"], msg_type=parsed["msg_type"], scope=parsed["scope"],
            source_url=source_url, retrieved_at=retrieved_at, last_seen_in_feed_at=seen_at,
        )
    values = {
        "sent": parsed["sent"], "status": parsed["status"], "msg_type": parsed["msg_type"], "scope": parsed["scope"],
        "references": parsed["references"], "language": info.get("language") if info else None,
        "sender_name": info.get("sender_name") if info else None,
        "category": info.get("category") if info else None, "event": info.get("event") if info else None,
        "urgency": info.get("urgency") if info else None, "severity": info.get("severity") if info else None,
        "certainty": info.get("certainty") if info else None, "effective": info.get("effective") if info else None,
        "onset": info.get("onset") if info else None, "expires": info.get("expires") if info else None,
        "headline": info.get("headline") if info else None, "description": info.get("description") if info else None,
        "instruction": info.get("instruction") if info else None, "areas": info.get("areas", []) if info else [],
        "polygons": info.get("polygons", []) if info else [], "info_payload": {"infos": [_json_info(item) for item in parsed["infos"]]},
        "source_url": source_url, "retrieved_at": retrieved_at, "last_seen_in_feed_at": seen_at,
    }
    for key, value in values.items():
        setattr(existing, key, value)
    db.add(existing)
    return existing


def _fresh_state(state: OfficialAlertFetch | None, settings: Settings) -> bool:
    if state is None:
        return False
    age = (utc_now() - as_utc(state.checked_at)).total_seconds()
    return 0 <= age <= settings.sachet_cache_seconds


def _refresh(db: Session, client: SachetClient, settings: Settings) -> OfficialAlertFetch:
    state = db.get(OfficialAlertFetch, client.feed_url)
    if _fresh_state(state, settings):
        return state
    cached_feed = _document(db, client.feed_url)
    document = client.fetch(client.feed_url, cached_feed.etag if cached_feed else None)
    if document.status == 304:
        if not cached_feed or not state:
            raise SachetProviderError("SACHET returned 304 without a usable cached feed/state")
        # A 304 revalidates the cached RSS, including its current CAP links. Preserve the
        # original CAP retrieval times but renew feed presence without downloading CAP again.
        items = client.rss_items(cached_feed.body)
        identifiers = [item["identifier"] for item in items]
        urls = [item["url"] for item in items]
        resolved_identifiers = list(dict.fromkeys(identifiers))
        if identifiers or urls:
            matched_alerts = db.scalars(
                select(OfficialAlert).where(
                    or_(
                        OfficialAlert.identifier.in_(identifiers),
                        OfficialAlert.source_url.in_(urls),
                    )
                )
            ).all()
            for alert in matched_alerts:
                alert.last_seen_in_feed_at = document.checked_at
                if alert.identifier not in resolved_identifiers:
                    resolved_identifiers.append(alert.identifier)
                db.add(alert)
        cached_feed.checked_at = document.checked_at
        state.checked_at = document.checked_at
        state.current_identifiers = resolved_identifiers
        db.add_all([cached_feed, state])
        db.commit()
        return state
    if document.body is None:
        raise SachetProviderError("SACHET returned an empty feed")
    items = client.rss_items(document.body)
    feed_cache = _save_document(db, client.feed_url, "sachet-rss", document)
    identifiers = list(dict.fromkeys(item["identifier"] for item in items))
    failed_count = 0
    invalid_count = client.last_rss_rejected
    stale_cache_used = False
    skipped = max(0, len(items) - settings.sachet_max_cap_documents)
    failed_count += skipped
    for item in items[:settings.sachet_max_cap_documents]:
        cached_cap = _document(db, item["url"])
        try:
            cap_document = client.fetch(item["url"], cached_cap.etag if cached_cap else None)
            if cap_document.status == 304:
                if not cached_cap:
                    raise SachetProviderError("CAP returned 304 without cached XML")
                cached_cap.checked_at = cap_document.checked_at
                db.add(cached_cap)
                parsed = client.cap_alert(cached_cap.body, item["url"])
                # The item is present in the newly retrieved RSS; CAP 304 only means its XML is unchanged.
                _store_alert(db, parsed, item["url"], cached_cap.retrieved_at, document.checked_at)
                if parsed["identifier"] not in identifiers:
                    identifiers.append(parsed["identifier"])
            else:
                if cap_document.body is None:
                    raise SachetProviderError("CAP returned an empty document")
                parsed = client.cap_alert(cap_document.body, item["url"])
                _save_document(db, item["url"], "sachet-cap", cap_document)
                _store_alert(db, parsed, item["url"], cap_document.checked_at, document.checked_at)
                if parsed["identifier"] not in identifiers:
                    identifiers.append(parsed["identifier"])
        except (SachetProviderError, ValueError) as exc:
            invalid_response = isinstance(exc, SachetProviderError) and exc.code.startswith("SACHET_INVALID")
            if invalid_response:
                invalid_count += 1
            else:
                failed_count += 1
            logger.warning("SACHET CAP processing failed: %s", type(exc).__name__)
            if cached_cap:
                try:
                    parsed = client.cap_alert(cached_cap.body, item["url"])
                    _store_alert(db, parsed, item["url"], cached_cap.retrieved_at, document.checked_at)
                    if parsed["identifier"] not in identifiers:
                        identifiers.append(parsed["identifier"])
                    stale_cache_used = True
                except (SachetProviderError, ValueError):
                    if not invalid_response:
                        invalid_count += 1
    state = state or OfficialAlertFetch(
        feed_url=client.feed_url, retrieved_at=document.checked_at, checked_at=document.checked_at,
    )
    state.retrieved_at = feed_cache.retrieved_at
    state.checked_at = document.checked_at
    state.current_identifiers = identifiers
    state.invalid_count = invalid_count
    state.failed_count = failed_count
    state.retrieval_complete = failed_count == 0 and invalid_count == 0
    state.stale_cache_used = stale_cache_used
    db.add(state)
    db.commit()
    return state


def _alert_dict(alert: OfficialAlert, match: dict) -> dict:
    return {
        "identifier": alert.identifier, "sender": alert.sender, "sender_name": alert.sender_name,
        "sent": as_utc(alert.sent) if alert.sent else None, "status": alert.status, "msg_type": alert.msg_type,
        "scope": alert.scope, "language": alert.language, "category": alert.category, "event": alert.event,
        "urgency": alert.urgency, "severity": alert.severity, "certainty": alert.certainty,
        "level": SEVERITY_LEVELS.get(alert.severity or ""),
        "effective": as_utc(alert.effective) if alert.effective else None,
        "onset": as_utc(alert.onset) if alert.onset else None, "expires": as_utc(alert.expires) if alert.expires else None,
        "headline": alert.headline, "description": alert.description, "instruction": alert.instruction,
        "areas": alert.areas, **match, "source_url": alert.source_url, "retrieved_at": as_utc(alert.retrieved_at),
        "is_official": True,
    }


def _active_rows(db: Session, state: OfficialAlertFetch) -> tuple[list[OfficialAlert], int]:
    rows = list(db.scalars(select(OfficialAlert)).all())
    current_ids = set(state.current_identifiers or [])
    rows = [row for row in rows if row.identifier in current_ids]
    superseded = set()
    for row in rows:
        if row.status == "Actual" and row.msg_type in {"Cancel", "Update"}:
            superseded.update(filter(None, re.split(r"[\s,]+", row.references or "")))
    now = utc_now()
    active = []
    validity_incomplete = 0
    for row in rows:
        if row.identifier in superseded or row.status != "Actual" or row.scope != "Public" or row.msg_type not in {"Alert", "Update"}:
            continue
        if row.sent is None or row.expires is None:
            validity_incomplete += 1
            continue
        if as_utc(row.sent) > now + timedelta(minutes=5) or as_utc(row.expires) <= now:
            continue
        active.append(row)
    active.sort(key=lambda row: (list(SEVERITY_LEVELS).index(row.severity) if row.severity in SEVERITY_LEVELS else 99, -(as_utc(row.sent).timestamp())))
    return active, validity_incomplete


def _response(db: Session, slug: str, state: OfficialAlertFetch, provider_status: str = "ok", stale: bool = False, failure: str | None = None) -> dict:
    region = get_region(slug)
    active, validity_incomplete = _active_rows(db, state)
    matches = [_alert_dict(alert, match) for alert in active if (match := match_alert_to_region(alert, region)) is not None]
    unresolved = sum(1 for alert in active if not alert.areas and not alert.polygons)
    incomplete = not state.retrieval_complete or validity_incomplete > 0
    if failure:
        message = failure
    elif incomplete:
        message = f"Official-alert retrieval is incomplete ({state.failed_count} failed/skipped, {state.invalid_count} invalid, {validity_incomplete} missing validity fields). Missing matches are not an all-clear."
    elif not matches:
        message = "No verified active CAP alert matched this location using the supported area rules. This is not an all-clear; other areas or unsupported polygons may be omitted."
    else:
        message = None
    return {
        "region": slug, "location": region, "source": SOURCE, "evidence_type": "official-warning",
        "provider_status": provider_status, "freshness": "stale" if stale or state.stale_cache_used else "current",
        "retrieval_complete": not incomplete, "retrieved_at": as_utc(state.retrieved_at), "checked_at": as_utc(state.checked_at),
        "active_messages_evaluated": len(active), "failed_count": state.failed_count,
        "invalid_count": state.invalid_count, "unresolved_area_count": unresolved,
        "validity_incomplete_count": validity_incomplete, "count": len(matches), "alerts": matches,
        "message": message, "limitations": MATCH_LIMITATIONS, "attribution": ATTRIBUTION,
        "portal_url": PORTAL_URL, "feed_url": state.feed_url, "integration_guide_url": FEED_GUIDE_URL,
    }


def current_official_alerts(db: Session, slug: str, client: SachetClient, settings: Settings) -> dict:
    region_or_404(slug)
    state = db.get(OfficialAlertFetch, client.feed_url)
    try:
        if not settings.sachet_enabled:
            if state:
                return _response(db, slug, state, "unavailable", True, "SACHET polling is disabled on this backend. Stored official alerts remain visible only until their own expiry.")
            raise SachetProviderError("SACHET integration is disabled", "SACHET_NOT_CONFIGURED")
        state = _refresh(db, client, settings)
        return _response(db, slug, state)
    except SachetProviderError as exc:
        db.rollback()
        logger.warning("SACHET refresh failed for %s: %s", slug, exc.code)
        state = db.get(OfficialAlertFetch, client.feed_url)
        if state:
            return _response(db, slug, state, "unavailable", True, "Live SACHET refresh failed. Stored official CAP alerts remain visible only until their own expiry; this is not an all-clear.")
        raise HTTPException(status_code=503, detail={
            "code": exc.code, "detail": "Official SACHET CAP alerts could not be retrieved. No official alert substitute is shown.",
            "portal_url": PORTAL_URL,
        }) from exc
