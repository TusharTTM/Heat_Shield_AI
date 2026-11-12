from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.air_quality import AirQualityClient
from backend.app.main import create_app
from backend.app.models import ExternalDocumentCache, OfficialAlert, OfficialAlertFetch
from backend.app.sachet import SachetClient
from backend.app.weather import WeatherClient
from backend.tests.conftest import ProviderStub
import backend.app.sachet_service as sachet_service


FEED_URL = "https://sachet.test/cap_public_website/rss/rss_india.xml"
CAP_URL = "https://sachet.test/cap_public_website/FetchXMLFile?identifier="


def cap_xml(identifier="pune-1", **overrides):
    now = datetime.now(timezone.utc)
    values = {
        "sender": "IMD-Pune", "sent": (now - timedelta(minutes=10)).isoformat(),
        "status": "Actual", "msg_type": "Alert", "scope": "Public", "references": "",
        "event": "Severe Heat wave", "severity": "Severe", "urgency": "Expected", "certainty": "Likely",
        "effective": (now - timedelta(minutes=20)).isoformat(), "onset": (now - timedelta(minutes=10)).isoformat(),
        "expires": (now + timedelta(hours=2)).isoformat(),
        "headline": "Severe Heat wave in Pune, Maharashtra",
        "description": "Software test CAP fixture: severe heat is likely in the named test area.",
        "instruction": "Software test instruction: follow the issuing authority and local SDMA guidance.",
        "areas": "Pune district of Maharashtra", "polygons": "", "language": "en-IN",
    }
    values.update(overrides)
    info = "" if values["msg_type"] == "Cancel" else f"""
      <info><language>{values['language']}</language><category>Met</category><event>{values['event']}</event>
        <urgency>{values['urgency']}</urgency><severity>{values['severity']}</severity><certainty>{values['certainty']}</certainty>
        <effective>{values['effective']}</effective><onset>{values['onset']}</onset><expires>{values['expires']}</expires>
        <senderName>India Meteorological Department - software fixture</senderName>
        <headline>{values['headline']}</headline><description>{values['description']}</description><instruction>{values['instruction']}</instruction>
        <area><areaDesc>{values['areas']}</areaDesc>{values['polygons']}</area>
      </info>"""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
    <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
      <identifier>{identifier}</identifier><sender>{values['sender']}</sender><sent>{values['sent']}</sent>
      <status>{values['status']}</status><msgType>{values['msg_type']}</msgType><scope>{values['scope']}</scope>
      <references>{values['references']}</references>{info}
    </alert>"""


def rss_xml(identifiers, hostile=False):
    items = "".join(
        f"<item><title>CAP item</title><link>{'https://untrusted.example/cap.xml' if hostile else CAP_URL + identifier}</link>"
        f"<guid>{identifier}</guid><pubDate>Sun, 08 Nov 2026 09:00:00 GMT</pubDate><category>Met</category></item>"
        for identifier in identifiers
    )
    return f'<?xml version="1.0"?><rss version="2.0"><channel><title>Software test RSS</title><copyright>public domain</copyright>{items}</channel></rss>'


class SachetProvider:
    def __init__(self, identifiers=("pune-1",)):
        self.identifiers = list(identifiers)
        self.feed_etag = '"rss-1"'
        self.cap_etags = {identifier: f'"cap-{identifier}-1"' for identifier in self.identifiers}
        self.cap_bodies = {identifier: cap_xml(identifier) for identifier in self.identifiers}
        self.feed_failure = None
        self.cap_failures = set()
        self.hostile = False
        self.feed_requests = []
        self.cap_requests = []
        self.transport = httpx.MockTransport(self.handler)

    def handler(self, request):
        if request.url.path.endswith("/rss/rss_india.xml"):
            self.feed_requests.append(request)
            if self.feed_failure:
                return httpx.Response(self.feed_failure)
            if request.headers.get("If-None-Match") == self.feed_etag:
                return httpx.Response(304, headers={"ETag": self.feed_etag})
            return httpx.Response(200, text=rss_xml(self.identifiers, self.hostile), headers={"ETag": self.feed_etag})
        identifier = parse_qs(urlparse(str(request.url)).query)["identifier"][0]
        self.cap_requests.append(request)
        if identifier in self.cap_failures:
            return httpx.Response(503)
        etag = self.cap_etags[identifier]
        if request.headers.get("If-None-Match") == etag:
            return httpx.Response(304, headers={"ETag": etag})
        return httpx.Response(200, text=self.cap_bodies[identifier], headers={"ETag": etag})


def api_for(settings, provider):
    weather_provider = ProviderStub()
    settings.sachet_feed_url = FEED_URL
    settings.sachet_enabled = True
    app = create_app(
        settings,
        WeatherClient("https://provider.test/forecast", transport=weather_provider.transport),
        AirQualityClient("https://air-provider.test/air-quality", transport=weather_provider.transport),
        sachet_client=SachetClient(FEED_URL, transport=provider.transport),
    )
    return TestClient(app)


def test_sachet_official_cap_fields_area_match_and_fresh_cache(settings):
    provider = SachetProvider()
    with api_for(settings, provider) as client:
        response = client.get("/api/v1/official/alerts/pune")
        assert response.status_code == 200
        body = response.json()
        assert body["count"] == 1
        assert body["retrieval_complete"] is True
        assert body["freshness"] == "current"
        assert body["evidence_type"] == "official-warning"
        alert = body["alerts"][0]
        assert alert["is_official"] is True
        assert alert["identifier"] == "pune-1"
        assert alert["sender"] == "IMD-Pune"
        assert alert["event"] == "Severe Heat wave"
        assert alert["severity"] == "Severe"
        assert alert["level"] == "high"
        assert alert["match_type"] == "area-text"
        assert alert["areas"] == ["Pune district of Maharashtra"]
        assert "Software test instruction" in alert["instruction"]
        assert datetime.fromisoformat(alert["expires"]) > datetime.now(timezone.utc)
        assert body["attribution"].startswith("NDMA SACHET")
        assert client.get("/api/v1/official/alerts/pune").json() == body
        assert len(provider.feed_requests) == 1
        assert len(provider.cap_requests) == 1
        assert client.get("/api/v1/health").json()["sachet_provider"].startswith("NDMA SACHET CAP (enabled")


def test_sachet_persistent_etags_304_reuse_and_cap_updates(settings):
    provider = SachetProvider()
    with api_for(settings, provider) as client:
        first = client.get("/api/v1/official/alerts/pune").json()
        settings.sachet_cache_seconds = 0
        second = client.get("/api/v1/official/alerts/pune").json()
        assert second["count"] == 1
        assert len(provider.feed_requests) == 2
        assert len(provider.cap_requests) == 1  # RSS 304 means no linked CAP request.
        assert provider.feed_requests[-1].headers["If-None-Match"] == '"rss-1"'
        assert second["retrieved_at"] == first["retrieved_at"]

        provider.feed_etag = '"rss-2"'
        third = client.get("/api/v1/official/alerts/pune").json()
        assert third["count"] == 1
        assert len(provider.cap_requests) == 2
        assert provider.cap_requests[-1].headers["If-None-Match"] == '"cap-pune-1-1"'

        provider.feed_etag = '"rss-3"'
        provider.cap_etags["pune-1"] = '"cap-pune-1-2"'
        provider.cap_bodies["pune-1"] = cap_xml("pune-1", severity="Extreme", event="Extreme Heat wave")
        updated = client.get("/api/v1/official/alerts/pune").json()
        assert updated["count"] == 1
        assert updated["alerts"][0]["severity"] == "Extreme"
        assert updated["alerts"][0]["level"] == "extreme"


def test_sachet_etags_and_cached_xml_survive_application_restart(settings):
    provider = SachetProvider()
    settings.sachet_cache_seconds = 600
    with api_for(settings, provider) as client:
        assert client.get("/api/v1/official/alerts/pune").json()["count"] == 1
    settings.sachet_cache_seconds = 0
    with api_for(settings, provider) as restarted:
        response = restarted.get("/api/v1/official/alerts/pune")
        assert response.status_code == 200
        assert response.json()["count"] == 1
        assert len(provider.feed_requests) == 2
        assert provider.feed_requests[-1].headers["If-None-Match"] == '"rss-1"'
        assert len(provider.cap_requests) == 1


@pytest.mark.parametrize("rss_304", [False, True])
def test_sachet_304_revalidation_renews_presence_for_long_lived_alerts(settings, rss_304):
    provider = SachetProvider()
    now = datetime.now(timezone.utc)
    provider.cap_bodies["pune-1"] = cap_xml(
        "pune-1", sent=(now - timedelta(hours=100)).isoformat(),
        effective=(now - timedelta(hours=100)).isoformat(), onset=(now - timedelta(hours=99)).isoformat(),
        expires=(now + timedelta(hours=120)).isoformat(),
    )
    with api_for(settings, provider) as client:
        assert client.get("/api/v1/official/alerts/pune").json()["count"] == 1
        old = now - timedelta(hours=73)
        with client.app.state.SessionLocal() as db:
            for document in db.query(ExternalDocumentCache).all():
                document.retrieved_at = old
                document.checked_at = old
                db.add(document)
            for alert in db.query(OfficialAlert).all():
                alert.retrieved_at = old
                alert.last_seen_in_feed_at = old
                db.add(alert)
            state = db.get(OfficialAlertFetch, FEED_URL)
            state.retrieved_at = old
            state.checked_at = old
            db.add(state)
            db.commit()
        settings.sachet_cache_seconds = 0
        if not rss_304:
            provider.feed_etag = '"rss-2"'  # New RSS 200; unchanged CAP returns 304.
        response = client.get("/api/v1/official/alerts/pune")
        assert response.status_code == 200
        assert response.json()["count"] == 1
        assert response.json()["alerts"][0]["identifier"] == "pune-1"
        assert len(provider.cap_requests) == (1 if rss_304 else 2)
        with client.app.state.SessionLocal() as db:
            alert = db.query(OfficialAlert).one()
            assert alert.last_seen_in_feed_at.replace(tzinfo=timezone.utc) > old + timedelta(hours=72)
            cap_cache = next(row for row in db.query(ExternalDocumentCache).all() if row.source == "sachet-cap")
            assert cap_cache.retrieved_at.replace(tzinfo=timezone.utc) == old
            if rss_304:
                assert cap_cache.checked_at.replace(tzinfo=timezone.utc) == old
            else:
                assert cap_cache.checked_at.replace(tzinfo=timezone.utc) > old


def test_sachet_feed_outage_uses_stale_cache_only_until_cap_expiry(settings, monkeypatch):
    provider = SachetProvider()
    with api_for(settings, provider) as client:
        assert client.get("/api/v1/official/alerts/pune").json()["count"] == 1
        settings.sachet_cache_seconds = 0
        provider.feed_failure = 503
        stale = client.get("/api/v1/official/alerts/pune")
        assert stale.status_code == 200
        assert stale.json()["freshness"] == "stale"
        assert stale.json()["provider_status"] == "unavailable"
        assert stale.json()["count"] == 1
        monkeypatch.setattr(sachet_service, "utc_now", lambda: datetime.now(timezone.utc) + timedelta(hours=3))
        expired = client.get("/api/v1/official/alerts/pune")
        assert expired.status_code == 200
        assert expired.json()["count"] == 0
        assert expired.json()["alerts"] == []
        assert "not an all-clear" in expired.json()["message"]


def test_sachet_no_cache_failures_are_explicit_not_fabricated(settings):
    for status, code in [(503, "SACHET_UNAVAILABLE"), (429, "SACHET_RATE_LIMITED"), (403, "SACHET_ACCESS_DENIED")]:
        provider = SachetProvider()
        provider.feed_failure = status
        settings.database_url = settings.database_url.replace("test.db", f"failure-{status}.db")
        with api_for(settings, provider) as client:
            response = client.get("/api/v1/official/alerts/pune")
            assert response.status_code == 503
            assert response.json()["code"] == code
            assert "Severe Heat wave" not in response.text


def test_sachet_disabled_without_cache_is_not_connected(settings):
    provider = SachetProvider()
    settings.sachet_enabled = False
    with api_for(settings, provider) as client:
        # api_for enables normal integration; disable after app construction to test the configured route state.
        client.app.state.settings.sachet_enabled = False
        response = client.get("/api/v1/official/alerts/pune")
        assert response.status_code == 503
        assert response.json()["code"] == "SACHET_NOT_CONFIGURED"
        assert provider.feed_requests == []


def test_sachet_expired_nonactual_cancel_and_update_lifecycle(settings):
    now = datetime.now(timezone.utc)
    provider = SachetProvider(("pune-1", "cancel-1", "expired-1", "draft-1"))
    provider.cap_bodies["cancel-1"] = cap_xml("cancel-1", msg_type="Cancel", references="pune-1")
    provider.cap_bodies["expired-1"] = cap_xml("expired-1", expires=(now - timedelta(minutes=1)).isoformat())
    provider.cap_bodies["draft-1"] = cap_xml("draft-1", status="Draft")
    with api_for(settings, provider) as client:
        body = client.get("/api/v1/official/alerts/pune").json()
        assert body["count"] == 0
        assert body["alerts"] == []
        assert "not an all-clear" in body["message"]


def test_sachet_embedded_polygon_match_does_not_require_place_guessing(settings):
    ring = "18.0,73.0 18.0,74.0 19.0,74.0 19.0,73.0 18.0,73.0"
    provider = SachetProvider()
    provider.cap_bodies["pune-1"] = cap_xml(
        "pune-1", areas="Geometry-only software fixture", headline="Official test geometry",
        polygons=f"<polygon>{ring}</polygon>",
    )
    with api_for(settings, provider) as client:
        body = client.get("/api/v1/official/alerts/pune").json()
        assert body["count"] == 1
        assert body["alerts"][0]["match_type"] == "embedded-polygon"
        assert "coordinates fall inside" in body["alerts"][0]["match_explanation"]


def test_sachet_mismatch_invalid_xml_and_untrusted_links_never_become_local_alerts(settings):
    provider = SachetProvider()
    provider.cap_bodies["pune-1"] = cap_xml("pune-1", areas="Chennai district of Tamil Nadu", headline="Rain in Chennai, Tamil Nadu")
    with api_for(settings, provider) as client:
        body = client.get("/api/v1/official/alerts/pune").json()
        assert body["count"] == 0
        assert "not an all-clear" in body["message"]

    settings.database_url = settings.database_url.replace("test.db", "invalid-cap.db")
    invalid = SachetProvider()
    invalid.cap_bodies["pune-1"] = '<!DOCTYPE alert [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><alert>&xxe;</alert>'
    with api_for(settings, invalid) as client:
        body = client.get("/api/v1/official/alerts/pune").json()
        assert body["count"] == 0
        assert body["retrieval_complete"] is False
        assert body["invalid_count"] == 1
        assert body["validity_incomplete_count"] == 0
        assert "incomplete" in body["message"]

    settings.database_url = settings.database_url.replace("invalid-cap.db", "hostile.db")
    hostile = SachetProvider()
    hostile.hostile = True
    with api_for(settings, hostile) as client:
        response = client.get("/api/v1/official/alerts/pune")
        assert response.status_code == 503
        assert response.json()["code"] == "SACHET_INVALID_RSS"
        assert hostile.cap_requests == []


def test_sachet_added_regions_and_oid_identifiers_match_conservatively(settings):
    oid_id = "urn:oid:2.49.0.1.356.0.2026.1108"
    kochi_id = "imd.kerala.ernakulam-1"
    provider = SachetProvider((oid_id, kochi_id))
    provider.cap_bodies[oid_id] = cap_xml(
        oid_id, sender="IMD-Bengaluru", areas="Bengaluru Urban district, Karnataka",
        headline="Heavy rain alert for Bangalore, Karnataka", event="Heavy Rain",
    )
    provider.cap_bodies[kochi_id] = cap_xml(
        kochi_id, sender="KSDMA-Kerala", areas="Ernakulam district of Kerala",
        headline="High wave alert for Ernakulam, Kerala", event="High Wave",
    )
    with api_for(settings, provider) as client:
        bengaluru = client.get("/api/v1/official/alerts/bengaluru")
        assert bengaluru.status_code == 200
        assert bengaluru.json()["count"] == 1
        assert bengaluru.json()["alerts"][0]["identifier"] == oid_id
        assert bengaluru.json()["alerts"][0]["match_type"] == "area-text"

        kochi = client.get("/api/v1/official/alerts/kochi")
        assert kochi.status_code == 200
        assert kochi.json()["count"] == 1
        assert kochi.json()["alerts"][0]["identifier"] == kochi_id

        jaipur = client.get("/api/v1/official/alerts/jaipur")
        assert jaipur.status_code == 200
        assert jaipur.json()["count"] == 0
        assert "not an all-clear" in jaipur.json()["message"]


def test_sachet_matches_when_rss_query_id_differs_from_cap_identifier_and_across_rss_304(settings):
    settings.sachet_cache_seconds = 0
    rss_id = "176267340012345"
    cap_id = "CAP-IN-IMD-2026-998877"
    provider = SachetProvider((rss_id,))
    provider.cap_bodies[rss_id] = cap_xml(
        cap_id, sender="KSDMA-Kerala", areas="Kochi, Ernakulam, Kerala",
        headline="Heavy rain alert for Kochi, Kerala", event="Heavy Rain",
    )
    with api_for(settings, provider) as client:
        first = client.get("/api/v1/official/alerts/kochi")
        assert first.status_code == 200
        assert first.json()["count"] == 1
        assert first.json()["alerts"][0]["identifier"] == cap_id
        assert len(provider.cap_requests) == 1

        second = client.get("/api/v1/official/alerts/kochi")
        assert second.status_code == 200
        assert second.json()["count"] == 1
        assert second.json()["alerts"][0]["identifier"] == cap_id
        assert len(provider.feed_requests) == 2
        assert len(provider.cap_requests) == 1
