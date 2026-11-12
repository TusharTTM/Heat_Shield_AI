import re
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import parse_qs, urlparse
from xml.etree import ElementTree

import httpx


PORTAL_URL = "https://sachet.ndma.gov.in/"
FEED_GUIDE_URL = "https://sachet.ndma.gov.in/docs/Integration_Guide_For_Agencies.pdf"
CAP_PATH = "/cap_public_website/FetchXMLFile"
ALLOWED_SEVERITIES = {"Extreme", "Severe", "Moderate", "Minor", "Unknown"}


class SachetProviderError(RuntimeError):
    def __init__(self, message: str, code: str = "SACHET_UNAVAILABLE"):
        super().__init__(message)
        self.code = code


@dataclass
class SachetDocument:
    status: int
    body: str | None
    etag: str | None
    checked_at: datetime


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].split(":")[-1]


def _children(element: ElementTree.Element, name: str) -> list[ElementTree.Element]:
    return [child for child in element if _local(child.tag) == name]


def _child(element: ElementTree.Element, name: str) -> ElementTree.Element | None:
    return next((child for child in element if _local(child.tag) == name), None)


def _text(element: ElementTree.Element, name: str) -> str:
    child = _child(element, name)
    return " ".join((child.text or "").split()) if child is not None else ""


def _xml(body: str) -> ElementTree.Element:
    if "\x00" in body or re.search(r"<!\s*(?:DOCTYPE|ENTITY)\b", body, re.IGNORECASE):
        raise SachetProviderError("DTD/entity XML is not accepted", "SACHET_INVALID_XML")
    try:
        return ElementTree.fromstring(body)
    except ElementTree.ParseError as exc:
        raise SachetProviderError("Provider returned malformed XML", "SACHET_INVALID_XML") from exc


def _iso_time(value: Any, required_zone: bool = True) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SachetProviderError("CAP contains an invalid timestamp", "SACHET_INVALID_CAP") from exc
    if required_zone and parsed.tzinfo is None:
        raise SachetProviderError("CAP timestamps must include a timezone", "SACHET_INVALID_CAP")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _polygon(value: str) -> list[list[float]]:
    ring = []
    for pair in value.split():
        try:
            lat_text, lon_text = pair.split(",", 1)
            lat, lon = float(lat_text), float(lon_text)
        except (TypeError, ValueError) as exc:
            raise SachetProviderError("CAP contains an invalid polygon", "SACHET_INVALID_CAP") from exc
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise SachetProviderError("CAP polygon is out of range", "SACHET_INVALID_CAP")
        ring.append([lat, lon])
    if len(ring) < 3:
        raise SachetProviderError("CAP polygon has fewer than three points", "SACHET_INVALID_CAP")
    return ring


class SachetClient:
    """Conditional RSS/CAP client with official-host/path restrictions and persistent-cache support."""

    def __init__(self, feed_url: str, timeout_seconds: float = 12, transport: httpx.BaseTransport | None = None):
        self.feed_url = feed_url
        self.timeout_seconds = timeout_seconds
        self.transport = transport
        parsed = urlparse(feed_url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("SACHET_FEED_URL must be an HTTPS URL without embedded credentials")
        self.allowed_host = parsed.hostname.lower()

    def validate_cap_url(self, url: str) -> None:
        parsed = urlparse(url)
        if (
            parsed.scheme != "https" or (parsed.hostname or "").lower() != self.allowed_host
            or parsed.path != CAP_PATH or parsed.username or parsed.password
        ):
            raise SachetProviderError("CAP link is outside the configured official endpoint", "SACHET_UNTRUSTED_URL")

    def fetch(self, url: str, etag: str | None = None) -> SachetDocument:
        if url != self.feed_url:
            self.validate_cap_url(url)
        headers = {
            "Accept": "application/rss+xml, application/xml, text/xml",
            "User-Agent": "HeatShieldAI/0.1 (+https://github.com/TusharTTM/Heat_Shield_AI)",
        }
        if etag:
            headers["If-None-Match"] = etag
        checked_at = datetime.now(timezone.utc)
        try:
            with httpx.Client(timeout=self.timeout_seconds, transport=self.transport, follow_redirects=False) as client:
                with client.stream("GET", url, headers=headers) as response:
                    if response.status_code == 304:
                        return SachetDocument(304, None, response.headers.get("ETag", etag), checked_at)
                    if response.status_code == 429:
                        raise SachetProviderError("SACHET rate limit reached", "SACHET_RATE_LIMITED")
                    if response.status_code in {401, 403}:
                        raise SachetProviderError("SACHET denied the request", "SACHET_ACCESS_DENIED")
                    if 300 <= response.status_code < 400:
                        raise SachetProviderError("SACHET redirects are not followed", "SACHET_UNAVAILABLE")
                    response.raise_for_status()
                    maximum = 2_000_000 if url == self.feed_url else 1_000_000
                    content_length = response.headers.get("Content-Length")
                    if content_length and int(content_length) > maximum:
                        raise SachetProviderError("SACHET document exceeds the size limit", "SACHET_DOCUMENT_TOO_LARGE")
                    chunks = []
                    size = 0
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        if size > maximum:
                            raise SachetProviderError("SACHET document exceeds the size limit", "SACHET_DOCUMENT_TOO_LARGE")
                        chunks.append(chunk)
                    body = b"".join(chunks).decode("utf-8-sig")
                    return SachetDocument(200, body, response.headers.get("ETag"), checked_at)
        except SachetProviderError:
            raise
        except (httpx.HTTPError, UnicodeError, ValueError) as exc:
            raise SachetProviderError("SACHET request failed") from exc

    def rss_items(self, body: str) -> list[dict]:
        root = _xml(body)
        self.last_rss_rejected = 0
        items = []
        seen = set()
        for element in root.iter():
            if _local(element.tag) != "item":
                continue
            guid = _text(element, "guid")
            link = _text(element, "link")
            try:
                self.validate_cap_url(link)
                query_identifier = parse_qs(urlparse(link).query).get("identifier", [""])[0]
                identifier = guid or query_identifier
                if ".." in identifier or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,159}", identifier):
                    raise SachetProviderError("RSS item has an invalid identifier", "SACHET_INVALID_RSS")
                if guid and query_identifier != guid:
                    raise SachetProviderError("RSS identifier/link mismatch", "SACHET_INVALID_RSS")
                if identifier in seen:
                    continue
                published_at = None
                published = _text(element, "pubDate")
                if published:
                    try:
                        parsed = parsedate_to_datetime(published)
                        published_at = parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
                    except (TypeError, ValueError):
                        published_at = None
                items.append({"identifier": identifier, "url": link, "published_at": published_at})
                seen.add(identifier)
            except SachetProviderError:
                # Invalid links/items are omitted and counted by the service as incomplete retrieval.
                self.last_rss_rejected += 1
                continue
        if not items and "<item" in body:
            raise SachetProviderError("RSS items did not contain valid official CAP links", "SACHET_INVALID_RSS")
        return items

    def cap_alert(self, body: str, source_url: str) -> dict:
        self.validate_cap_url(source_url)
        root = _xml(body)
        if _local(root.tag) != "alert":
            raise SachetProviderError("Document is not a CAP alert", "SACHET_INVALID_CAP")
        infos = []
        for info_element in _children(root, "info"):
            severity = _text(info_element, "severity") or None
            if severity is not None and severity not in ALLOWED_SEVERITIES:
                raise SachetProviderError("CAP contains an unknown severity value", "SACHET_INVALID_CAP")
            areas = []
            polygons = []
            for area_element in _children(info_element, "area"):
                description = _text(area_element, "areaDesc")
                if description:
                    areas.append(description)
                for polygon_element in _children(area_element, "polygon"):
                    polygons.append(_polygon(polygon_element.text or ""))
            infos.append({
                "language": _text(info_element, "language") or None,
                "sender_name": _text(info_element, "senderName") or None,
                "category": _text(info_element, "category") or None,
                "event": _text(info_element, "event") or None,
                "urgency": _text(info_element, "urgency") or None,
                "severity": severity,
                "certainty": _text(info_element, "certainty") or None,
                "effective": _iso_time(_text(info_element, "effective")),
                "onset": _iso_time(_text(info_element, "onset")),
                "expires": _iso_time(_text(info_element, "expires")),
                "headline": _text(info_element, "headline") or None,
                "description": _text(info_element, "description") or None,
                "instruction": _text(info_element, "instruction") or None,
                "areas": areas,
                "polygons": polygons,
            })
        msg_type = _text(root, "msgType")
        if not infos and msg_type != "Cancel":
            raise SachetProviderError("CAP alert has no information block", "SACHET_INVALID_CAP")
        selected = next((info for info in infos if (info["language"] or "").lower().startswith("en")), infos[0] if infos else None)
        return {
            "identifier": _text(root, "identifier"), "sender": _text(root, "sender"),
            "sent": _iso_time(_text(root, "sent")), "status": _text(root, "status"),
            "msg_type": msg_type, "scope": _text(root, "scope"), "references": _text(root, "references"),
            "info": selected, "infos": infos, "source_url": source_url,
        }
