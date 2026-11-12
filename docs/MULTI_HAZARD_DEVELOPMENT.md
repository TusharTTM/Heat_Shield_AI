# HeatShield AI — multi-hazard development plan and evidence rules

## Initial audit (historical)

The repository already contains a working React/Open-Meteo heat dashboard, five-day weather forecast, fifteen-location heat map, deterministic NOAA/NWS heat-index screening, sourced heat guidance, an optional FastAPI/SQL backend, chronological temperature-model training, authenticated sensor-ingestion contracts, and ESP32/DHT22 firmware. Hosted verification covers the public frontend only. The FastAPI service, PostgreSQL/PostGIS, trained model artifact, and physical sensors are not publicly deployed.

The following capabilities were not established at that audit point and could not be implied by navigation or cards. The delivery report below records which boundaries have since changed:

- Air-quality weather-model integration and observed CPCB station data.
- Official IMD/CWC/CPCB warning or observation feeds.
- Rainfall/flood, cyclone, lightning, or drought assessment engines.
- Hazard-specific trained models beyond the existing temperature regression candidate.
- A hosted alert-delivery service, email provider, browser-notification permission, or official-warning feed.
- Hydrological flood confirmation, independently generated cyclone tracks, lightning-strike prediction, or earthquake prediction.

## Ordered implementation plan

1. Preserve and regression-test the existing weather/heat workflows; record source and method boundaries.
2. Add expanded Open-Meteo weather inputs and the Open-Meteo Air Quality API with independent freshness/error states.
3. Build a unified environmental dashboard that distinguishes current model conditions, deterministic screening, upcoming model signals, and unavailable official warnings.
4. Add explainable heat and modelled-US-AQI assessments, detailed monitoring views, and health guidance.
5. Integrate official Indian warnings only through an approved, validated feed. Until then show **feed not connected**, never “no warnings”.
6. Add rainfall/storm monitoring only with hazard-specific inputs and rules. Flood estimates must remain weather-based indicators unless hydrological inputs are available; cyclone tracks and lightning warnings require official/observed sources.
7. Add selectable hazard layers to the configured-location map without inventing warning zones.
8. Extend stored history before adding new training targets.
9. Train and temporally evaluate separate models only when sufficient real pollutant/rainfall/drought datasets exist. Do not reuse the temperature regressor as a generic disaster model.
10. Complete notification delivery, production backend/database deployment, security hardening, and physical-device verification as externally available services permit.

## Source register

| Data | Source and evidence type | Required presentation |
|---|---|---|
| Current weather and five-day forecast | Open-Meteo Forecast API, weather-model estimates | Model time, retrieval time, freshness, coordinates, Open-Meteo/CC BY 4.0 attribution; not sensor observations or official warnings |
| Air quality and pollutant forecast | Open-Meteo Air Quality API, based on CAMS air-quality models | “Modelled US AQI”, model/retrieval times and freshness; never CPCB station AQI |
| Historical weather | Open-Meteo Historical Weather API | Weather-model reanalysis, not necessarily physical observations |
| Official weather/cyclone/rainfall/lightning warnings | IMD only after approved access and response validation | Issuing agency, issue/effective/expiry times, affected area, original URL and severity; unavailable feed remains explicit |
| Observed Indian air quality | Optional CPCB-contributed OGD/data.gov.in station resource; station observations | Station, original observation/retrieval times, supplied Indian AQI standard, pollutant min/max/average and original units; separate from CAMS; missing AQI remains null |
| Official multi-agency disaster warnings | Optional NDMA SACHET all-India RSS + CAP XML; official-warning evidence | Sender, CAP status/type/scope, severity/urgency/certainty, issue/onset/expiry, instructions, area match, original XML and attribution; no match is not an all-clear |
| Flood/river information | CWC or another authoritative hydrological source only after integration | Gauge/basin, observation time and source; rainfall alone is not confirmed flooding |
| Heat screening | NOAA/NWS heat-index regression and rounded local screening bands | Deterministic screening, not an IMD heatwave declaration or medical diagnosis |
| AQI screening | Open-Meteo consolidated US AQI and US EPA/AirNow category guidance | Modelled index and category; not CPCB AQI or an individual medical assessment |

IMD documentation reviewed at `https://api.imd.gov.in/public/api_reference.html` (the older `mausam.imd.gov.in/responsive/apis.php` URL returned 404). Published material describes restricted/IP-whitelisted access for warning APIs. No direct IMD district-warning credential, proxy, scraping, or access-control bypass is used. SACHET CAP warnings retain their actual issuing agency and are not relabelled as a direct IMD API integration.

Open-Meteo air-quality documentation: `https://open-meteo.com/en/docs/air-quality-api`. US AQI bands are 0–50 Good, 51–100 Moderate, 101–150 Unhealthy for Sensitive Groups, 151–200 Unhealthy, 201–300 Very Unhealthy, and 301–500 Hazardous. Consolidated AQI is the maximum of the available pollutant subindices.

## Deterministic assessment rules

### Heat

The existing NOAA/NWS heat-index implementation remains unchanged: Low below 27°C, Moderate 27°C to below 33°C, High 33°C to below 52°C (including the underlying Severe band), and Extreme at 52°C or above. Forecast high-heat-day counts use daily maxima calculated from hourly model temperature/humidity pairs. These are high-heat-index days, not official IMD heatwave declarations.

### Modelled US AQI

- **Low:** US AQI 0–50 (Good).
- **Moderate:** US AQI 51–150 (Moderate or Unhealthy for Sensitive Groups; the detailed category remains visible).
- **High:** US AQI 151–200 (Unhealthy).
- **Extreme:** US AQI above 200 (Very Unhealthy or Hazardous).

European AQI uses Low 0–40, Moderate 41–60, High 61–80, and Extreme above 80. When both modelled indices are present, the more severe display level is used while both detailed categories remain visible. This is a deterministic display mapping, not a conversion between US, European, and Indian AQI.

The next-24-hour trend compares the first and last available hourly modelled US AQI values. A change of at least +10 is Rising, at most −10 is Falling, and otherwise Steady. Missing values produce an unavailable trend, never a zero substitute.

### Overall dashboard screening

The overall screening level is the highest available heat/air level: Low → Safe, Moderate → Watch, High → Warning, Extreme → Severe. It is a deterministic screening summary, not an official alert or a probability. Missing hazard inputs produce a partial or unavailable assessment and cannot be treated as Safe. Official warnings remain a separate lane and take precedence only when a verified official feed exists.

## Delivery report

### Implemented in the working branch

- Open-Meteo current/hourly/five-day weather and CAMS current/hourly air quality have independent cache, error and freshness states. Heat and dual US/European-AQI screening is deterministic and explainable. The map exposes heat and modelled-US-AQI layers without inventing official warning zones.
- Dashboard, Disaster Monitor, Alerts and Safety distinguish model estimates, generated screening notices, official warnings, station observations and unavailable hazard engines. Rainfall does not establish flooding; no cyclone track, lightning strike, drought class or earthquake prediction is generated.
- `GET /api/v1/official/alerts/{slug}` uses bounded HTTPS retrieval of the SACHET all-India RSS and identifier-specific CAP documents. It validates the configured host/CAP path, rejects redirects and DTD/entities, limits document sizes/counts, persists XML/ETags, sends `If-None-Match`, and reuses cached XML on 304. RSS 304 also renews cached feed presence without CAP downloads.
- CAP persistence handles updates/cancellation references, Actual/Public filtering, expiry, incomplete retrieval and stale outage fallback. Location matching is limited to embedded polygons, explicit national coverage, or conservative state-plus-place text. Missing, expired, unmatched or unsupported-area alerts never become an all-clear. Cached alerts remain visible only until their own CAP expiry.
- `GET /api/v1/official/air-quality/current/{slug}` and `/history/{slug}` use the CPCB-contributed OGD resource `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69`. The data.gov.in credential is server-only. Provider pollutant IDs, min/max/average, units and observation/retrieval timestamps are preserved. Supplied Indian AQI uses CPCB categories; missing AQI stays null. Current responses contain only the latest provider batch, while history retains prior batches.
- The optional browser client validates official response evidence types, timestamps, freshness, levels and HTTPS source links. Without `VITE_API_BASE_URL`, official panels report that the backend is not configured and make no backend request. CPCB credential state comes only from the backend, never from a frontend guess.

### Source and policy boundaries

- SACHET source: `https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml`; CAP links use the official `FetchXMLFile?identifier=...` mechanism described by the NDMA integration guide. Every displayed match links its original XML and names the issuing sender. NDMA's website policy requires accurate, non-misleading attribution and describes permission/notification obligations for reproduction; deployment operators must review and satisfy them. External links are used instead of iframing SACHET.
- CPCB/OGD catalogue: `https://www.data.gov.in/catalog/real-time-air-quality-index`. Attribution names CPCB, the ministry and OGD, and links the Government Open Data License. No endorsement is implied. Numeric public rate limits are not assumed; the hourly application cache and explicit 429 handling do not prove the provider's actual quota.
- Direct IMD district-warning and CWC gauge/basin integrations remain unconnected. SACHET coverage must not be described as either of those direct integrations. CWC links and hydrological evidence requirements remain available, but rainfall alone never produces a flood-risk category.

### Verification and remaining external operator boundaries

Mocked tests cover CPCB absence/authentication/rate limiting/outages/stale cache/invalid records/history and SACHET XML validation, RSS-query-ID vs CAP-`<identifier>` correlation, conditional requests, restart persistence, update/cancel/expiry, partial failures, stale fallback and geographic matching across all 15 configured locations. Frontend tests cover `shared/regions.json` parity, unconfigured behavior, runtime validation, official CAP presentation, missing Indian AQI, stored-station trends, timeout retry and preserved units.

Executed verification on `arena/fcd541ac-heat-shield-ai`:

- **Local unit, type, lint and build checks:** **90 Python tests passed** across backend/ML/firmware (`ruff==0.11.8` and `pip check` clean); **80 frontend tests passed with 3 live-only tests skipped** locally; `npx tsc -b` and `GITHUB_PAGES=true npm run build` passed; `npm audit --audit-level=low` reported **0 vulnerabilities**; and `git diff --check` passed.
- **Full-stack CI, Chromium official-source browser suite, and PostgreSQL 16 / PostGIS 3.4 Compose verification (`42584079125`):**
  - `official-sources-browser`: executed all **3 Playwright Chromium specs** (`official-sources.spec.ts`) at `1440x1000` desktop and `390x844` mobile across `/`, `/monitor`, `/alerts`, and `503` fail-closed states with zero horizontal overflow (`documentElement.scrollWidth <= innerWidth + 1`). HTTP responses in this job are mocked; they verify browser UI and fail-closed behavior, not live credentials.
  - `postgres-migrations-and-compose`: started `postgis/postgis:16-3.4` (`PostGIS 3.4 USE_GEOS=1 USE_PROJ=1 USE_STATS=1`), applied `001_initial.sql` through `005_sachet_cap_alerts.sql` **twice** (`ON_ERROR_STOP=1`), round-trip verified all **10 PostgreSQL ORM tables**, built and started the Compose FastAPI container, and verified `/api/v1/health`, `/api/v1/regions` (15), `/api/v1/safety`, and authenticated `source=simulated` sensor ingestion/deduplication.
  - `firmware-compile` and `backend-image`: PlatformIO ESP32 firmware compile and Docker image build both succeeded.
- **Live Open-Meteo, CAMS, NDMA SACHET CAP, and hosted GitHub Pages Chromium verification (`42584079221`, `42584079253`, `42584410097`):**
  - Pages deployment `42584079221` published the updated multi-hazard static site to `https://tusharttm.github.io/Heat_Shield_AI/`.
  - Live CI run `42584079253` (local Vite) and hosted run `42584410097` (`https://tusharttm.github.io/Heat_Shield_AI/`) passed all **3 live Open-Meteo/CAMS/archive Vitest checks** plus the full Chromium `live-weather.spec.ts` workflow across Mumbai, Pune, and Bengaluru, CAMS attribution, `/monitor` + `/alerts` + `/about` boundaries, five-day Forecast chart/cards at 1440px and 390px, all **15 Risk Map markers** across both `Heat risk` and `Air pollution` layers, and mobile navigation focus.
  - `live-backend-and-official-sources` verified FastAPI Open-Meteo weather + CAMS air quality across 15 regions and executed a **live NDMA SACHET RSS + CAP smoke test** against `https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml`: HTTP `200`, **100 live CAP XML documents** retrieved, parsed, and cached with ETags (`retrievalComplete=true`, `failedCount=0`, `invalidCount=0`, `rssEtagPresent=true`, `capEtagsPresent=100`), RSS-304 conditional revalidation verified, and expired CAP messages accurately excluded from active regional matches.
- **15-region Open-Meteo archive ingestion and chronological ML evaluation (`42579707328`):**
  - Retrieved **16,440 daily rows** (`2023-01-01` to `2025-12-31`) across all **15 configured locations**, engineered **16,395 feature rows** (`13,110` train `<= 2025-05-26`, `3,285` chronological holdout `>= 2025-05-27`), compared Linear Regression (MAE `0.8922°C`, RMSE `1.2354°C`, R² `0.8742`), Random Forest (MAE `0.8891°C`, RMSE `1.2324°C`, R² `0.8748`), and Gradient Boosting (selected: MAE `0.8759°C`, RMSE `1.2156°C`, R² `0.8782`), and verified FastAPI inference across all 15 regions plus 5 `model_inferred` hotspots.

The following remain external operator steps rather than claims of this repository:

1. Obtain an operator-owned `data.gov.in` account and server-only `DATA_GOV_IN_API_KEY` to test live CPCB station responses, station coverage, pagination, and provider quotas against `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69` (public CI has no secret configured and verifies `503 CPCB_NOT_CONFIGURED`).
2. Provision a public HTTPS FastAPI host and managed PostgreSQL database with backups, exact `CORS_ORIGINS`, and `VITE_API_BASE_URL` on the frontend build if optional SACHET/CPCB panels are to be active on GitHub Pages.
3. Review and satisfy NDMA SACHET reproduction/notification policy obligations and Open-Meteo/OGD terms before operating a public SACHET/CPCB-connected service.
4. Direct IMD district-warning feeds, CWC river-gauge feeds, email/SMS/push alerting, promoted live ML serving, and physical ESP32/DHT22 hardware deployment remain external and unclaimed.
