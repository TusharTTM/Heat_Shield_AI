# HeatShield AI — complete feature audit and integration delivery

> **Multi-hazard & fifteen-location unified architecture (9 November 2026 update):** statements in the historical baseline sections below refer to earlier snapshots. All **15 configured Indian locations** (`mumbai`, `south-mumbai`, `thane`, `navi-mumbai`, `pune`, `ahmedabad`, `delhi`, `jaipur`, `lucknow`, `bhopal`, `hyderabad`, `bengaluru`, `chennai`, `kochi`, `kolkata`) are now unified across `shared/regions.json`, the seven-route React frontend (`Dashboard`, `Disaster Monitor`, `Forecast`, `Risk Map`, `Alerts`, `Safety Guide`, `About`), FastAPI weather/CAMS/SACHET/CPCB/risk/ML endpoints, PostgreSQL migrations `001`–`005`, and 15-region Open-Meteo historical archive ingestion and chronological ML training. See [`docs/MULTI_HAZARD_DEVELOPMENT.md`](MULTI_HAZARD_DEVELOPMENT.md) for full multi-hazard design and verification details (Pages run `42584079221`, full-stack + PostGIS + Chromium official-panel run `42584079125`, live Open-Meteo/CAMS/SACHET run `42584079253`, hosted Pages Chromium run `42584410097`, and 15-region ML run `42579707328`).

## Open-Meteo integration verification

- Hosted production run [`42488852520`](https://github.com/TusharTTM/Heat_Shield_AI/actions/runs/42488852520), at commit `bdde2f4`, passed real current/five-day/archive tests and Chromium verification against `https://tusharttm.github.io/Heat_Shield_AI/`. At provider model time `2026-11-08T19:45` Asia/Kolkata, Mumbai was **30.6°C**, apparent **33.4°C**, humidity **53%**, wind **7.3 km/h**, calculated heat index **32.5°C**, and **Moderate** screening risk. Pune was **25.2°C**, heat index **25.0°C**, and **Low**; Bengaluru was **22.6°C**, heat index **22.8°C**, and **Low**. Mumbai, Pune, and Bengaluru each completed the full selected-location workflow with five forecast days.
- The verified Mumbai daily high/low forecast was **36.6/25.0°C** (8 Nov), **35.6/24.4°C** (9 Nov), **35.7/24.4°C** (10 Nov), **35.1/24.3°C** (11 Nov), and **34.3/23.6°C** (12 Nov). The deployed-browser test checked all five cards, both chart series, the hottest-day highlight, and responsive layout at 390px. It also checked Mumbai/Pune hourly values, heat-index/risk recommendations, exact provider-model timestamp conversion, retrieval timestamps, and selected-location Safety guidance. Cached Mumbai → Pune → Bengaluru navigation caused exactly **three full weather requests**.
- All **fifteen real current-only map responses** were checked against marker risk levels, including all eight added slugs; Pune's popup temperature, apparent temperature, timestamp, and risk were also verified. The run retrieved seven real Historical Weather API days for `2025-01-01` through `2025-01-07`. Historical values remain weather-model reanalysis, not physical observations.
- NOAA/NWS reference vectors, humidity adjustments, invalid inputs, threshold boundaries, and all four recommendation mappings have dedicated unit tests. Pages run [`42488841291`](https://github.com/TusharTTM/Heat_Shield_AI/actions/runs/42488841291), real-provider CI run [`42488841184`](https://github.com/TusharTTM/Heat_Shield_AI/actions/runs/42488841184), and full-stack regression run [`42488841242`](https://github.com/TusharTTM/Heat_Shield_AI/actions/runs/42488841242) passed. Earlier hosted attempts timed out while awaiting the initial provider response; explicit bounded waits, browser network/page diagnostics, and DOM-content navigation were added before the successful rerun. The successful run is not an uptime guarantee. Provider failures/stale states are tested with controlled failures; those transient attempts do not verify the UI's error-state semantics.
- Remaining boundaries: the eight added cities are **frontend-only weather locations**. `shared/regions.json`, the historical training dataset, FastAPI region coverage, and ML artifacts remain seven-region artifacts; no added city has trained-ML, historical-dataset, or backend-region coverage. No official IMD warning/alert delivery, physical sensor connection, promoted production ML model, WBGT/direct-sun assessment, medical diagnosis, arbitrary-city search, or observed geographic hotspot detection is claimed. Heat-index categories are rounded screening bands, not official local warning categories. Forecast temperatures are ordinary weather-model forecasts, not AI predictions.

## Whole-UI correction pass

- Commit `ca765f6` corrected the outdated “Disconnected demo website” metadata and duplicate static/React skip link; added route/location-specific document titles and main-content focus after navigation; restored focus when closing an active mobile route; closed and hid the mobile menu at the desktop breakpoint; wrapped narrow About status rows; and made the map badge reflect marker loading/error/stale state instead of the selected city's separate full-forecast request.
- The expanded suite passes **52 tests with 2 network-gated skips**. A production Chromium audit covered all five routes and the not-found state at eleven viewport widths from **320px to 1440px**, with no document/component overflow, duplicate IDs, missing top-level headings, runtime errors, or axe violations. Separate interaction checks retained all fifteen markers, thirty requests after explicit map refresh, popups, chart/cards, API failure/retry, stale-cache behavior, and mobile layouts.
- Real-provider run [`42492230797`](https://github.com/TusharTTM/Heat_Shield_AI/actions/runs/42492230797), full-stack run [`42492230924`](https://github.com/TusharTTM/Heat_Shield_AI/actions/runs/42492230924), and Pages deployment [`42492230886`](https://github.com/TusharTTM/Heat_Shield_AI/actions/runs/42492230886) passed. Hosted public run [`42492631952`](https://github.com/TusharTTM/Heat_Shield_AI/actions/runs/42492631952) then verified the corrected navigation plus all live weather workflows. An earlier hosted attempt, `42492424179`, received no provider response within the app's 15-second timeout and correctly displayed unavailable/retry UI; the next run passed without code changes, so no provider-uptime guarantee is made.

## Searchable location picker correction pass

- Commit `287cf80` replaces the cramped native header select with a compact searchable picker shared by Home, Forecast, Risk Map, Safety Tips, and About. It searches the configured city and state labels, shows all fifteen supported locations with city/state text and a selected checkmark, reports filtered result counts, provides a supported-city-only empty state, and uses a scrollable mobile presentation. It does not imply arbitrary-city geocoding or backend/ML coverage for the eight frontend-only added cities.
- The picker retains the existing `region`/`setRegion` workflow, Mumbai default, persistence, configured coordinates, and weather updates. Arrow keys, Home/End, Escape, outside press, the close button, trigger focus restoration, mobile-menu interaction, and scrolling the selected option into view are implemented. A regression specifically covers Arrow Up from the search field selecting the last city rather than skipping it.
- Final local verification passed **56 tests with 2 network-gated skips**, strict real-provider-spec typechecking, the Pages production build, `git diff --check`, and npm audit with **0 vulnerabilities**. The dedicated production Chromium audit passed at **320, 390, 421, 681, 1120, and 1440px**, with fifteen options, no document/popover overflow, and zero open-state axe violations at 320, 390, and 1440px. State search selected Kolkata and requested `22.5726, 88.3639`; selection persisted and restored trigger focus; reopening kept Kolkata visible; Bengaluru selection updated the map; and opening mobile navigation closed the picker.
- The final whole-UI regression retained **66 clean layout checks**, **12 clean whole-page axe scans**, and no runtime errors. Separate production workflows verified picker-based Pune selection, the corresponding second full-weather request, fifteen map responses/markers, thirty current-only requests after explicit refresh, selected-location Safety guidance, responsive charts/maps, all fifteen mobile picker options, API failure/retry, and stale-cache labeling with no unexpected external requests or runtime errors.
- For commit `287cf80`, real-provider run [`42495672149`](https://github.com/TusharTTM/Heat_Shield_AI/actions/runs/42495672149), full-stack run [`42495672134`](https://github.com/TusharTTM/Heat_Shield_AI/actions/runs/42495672134), and Pages deployment [`42495672133`](https://github.com/TusharTTM/Heat_Shield_AI/actions/runs/42495672133) passed. The real-provider browser spec exercised the picker search/selection flow for Pune and Bengaluru against actual Open-Meteo responses. Hosted public run [`42495826776`](https://github.com/TusharTTM/Heat_Shield_AI/actions/runs/42495826776) then passed against `https://tusharttm.github.io/Heat_Shield_AI/`, verifying the deployed picker and real current/forecast/map/Safety workflows. This is run-specific integration evidence, not a provider-uptime guarantee.

Audit date: **8 November 2026**. Current frontend verification commit: `287cf80`; original inventory baseline: `aa33e66` on `arena/fcd541ac-heat-shield-ai`.

## Status meanings

- **WORKING:** executed and tested for the stated behavior; external capabilities are not implied.
- **PARTIALLY WORKING:** a useful local/demo or integration layer works, but production data, deployment, or verification remains incomplete.
- **NOT WORKING:** present but broken.
- **PLACEHOLDER:** visual or structural demonstration without real functionality.
- **MISSING:** no implementation exists in the checkout.
- **BLOCKED:** completion requires an unavailable external service, credential, dataset, deployment, or hardware.

## Baseline evidence

The complete current checkout was inventoried before implementation. It contains the React/Vite frontend, local fixtures and guidance, shared region/risk JSON, tests, styles, deployment configuration, documentation, and empty ML package folders. There is no active backend, database, firmware, historical dataset, model training/inference implementation, or model artifact. Git history contains an earlier Open-Meteo archive/current ingestion client in `9e2066d`; it was inspected read-only for selective reuse, not restored as a claimed working system.

Before changes, the existing static product passed **27/27 Vitest tests**, `npm audit` with **0 vulnerabilities**, real Chromium checks of all five routes, five-day chart and tooltip behavior, seven map markers and location buttons, popup zoom/close, all 17 legacy redirects, mobile-menu and skip-link keyboard flows, Safety content and `tel:112` metadata, reduced motion, and 25 route/viewport overflow cases. Desktop/mobile axe scans reported no violations and no application runtime errors, failed responses, or external requests occurred.

Hosted public documents were inspected separately. Earlier hosted Chromium attempts were blocked by `ERR_CONNECTION_CLOSED`; hosted interactions are therefore not claimed.

## Baseline feature audit

| Feature | Baseline status | Evidence and boundary |
|---|---|---|
| Home Dashboard | **PARTIALLY WORKING** | Four metrics, consistent heat index/risk, offline recommendation, fixed timestamp, and unavailable-data disclosures work with fixed demo fixtures. No current provider data exists. |
| Temperature Forecast | **PARTIALLY WORKING** | Exact five-day demo chart/cards, hottest-day highlight, warnings, and accessible descriptions work. No live forecast or ML prediction exists. |
| Heat Risk Map | **PARTIALLY WORKING** | Seven configured coordinates, offline outline, marker/button selection, legend, zoom and popup behavior work. Risks are demo calculations, not live observations or inferred hotspots. |
| Safety Tips | **WORKING** | Five sourced general topics, four risk-matched deterministic recommendations, heat illness/emergency guidance, limitations, and `tel:112` metadata are verified. It is not medical diagnosis or AI advice. |
| About | **WORKING** | Purpose, weather/AI/IoT concepts, community benefits, and disconnected statuses are present. Status copy must evolve honestly as integration code is added. |
| Weather API | **MISSING** | No active API client, backend endpoint, cache, or live request exists. The earlier ingestion client is only in history. |
| ML Prediction | **MISSING** | Package folders and README placeholders exist, but no features, training, chronological evaluation, artifacts, inference, or metrics exist. |
| Backend / database | **MISSING** | No FastAPI application, schema, ORM models, migrations, endpoint tests, or deployment exists. |
| IoT / ESP32 | **MISSING** | No firmware, ingestion endpoint, device authentication, reading validation, persistence, or hardware status exists. |
| Responsive / accessible design | **WORKING** | Local desktop/tablet/mobile rendering, controls, keyboard behavior, reduced motion, overflow checks, and automated axe scans pass. Manual screen-reader and physical-device studies remain unverified. |

No present-but-broken main-navigation feature was found. Demo weather, forecasts, and map values are deliberately demonstrational; they must not be reclassified as real observations.

## Implementation scope following the audit

1. Add a FastAPI backend with validated region, current/forecast/history, risk, safety, health, ML-status/inference, and authenticated sensor-ingestion contracts.
2. Add SQLAlchemy persistence with SQLite for local tests and PostgreSQL-compatible production configuration; no hosted database is assumed.
3. Add an Open-Meteo server-side provider with timeout, validation, source timestamps, caching, and stale/unavailable behavior. Provider responses in automated tests must be explicit fixtures; no live success is claimed without a live request.
4. Add source-backed archive ingestion, leakage-safe time-series features, chronological Linear Regression/Random Forest/Gradient Boosting comparison, MAE/RMSE/R² evaluation, artifact metadata/loading, and model-inferred hotspot utilities. Synthetic data may test pipeline mechanics only and may not be promoted as a trained production model.
5. Add ESP32/DHT22 firmware with TLS, NTP timestamps, validation, authenticated ingestion, and explicit physical/simulated source separation. Hardware and firmware compilation require separate verification.
6. Preserve the five-section static frontend and its offline fallback. Add integration documentation and only claim live frontend connectivity after a deployed backend URL and cross-origin request are verified.
7. Run frontend, backend, ML, and sensor-ingestion tests; document all external blockers and unverified deployment/hardware work.

Final outcomes and remaining work are recorded in the completion sections below after implementation and verification.

---

# Completion audit

## Delivered implementation

- **FastAPI:** region, current, exact five-day forecast, stored history, deterministic risk, risk-map, safety, health/status, ML status/prediction/hotspots, and authenticated sensor ingestion/reading/status endpoints; OpenAPI docs, validation, structured errors, logging, CORS, security headers, and environment configuration.
- **Persistence:** SQLAlchemy weather/forecast/sensor models, isolated SQLite test/local runtime, PostgreSQL initial migration, psycopg configuration, and a PostGIS Compose service. No PostgreSQL server was available for a live database test.
- **Weather:** server-side Open-Meteo client with explicit units, timeouts, validation, UTC normalization, cache, stale fallback, and unavailable responses. No demo fixture is used by the API.
- **ML:** source-backed archive ingestion, three-prior-day leakage-safe features, no-shuffle chronological split, Linear Regression/Random Forest/Gradient Boosting comparison, MAE/RMSE/R², versioned artifact/metadata writing and version-match loading, plain-language inference, deterministic heat-index risk classification, and `model_inferred` hotspot ranking.
- **IoT:** ESP32/DHT22 firmware with validated readings, NTP timestamps, CA-validated HTTPS, `X-Sensor-Key`, and `source=physical`; server-side idempotent authenticated ingestion and separate `simulated` labels.
- **Deployment:** backend Dockerfile, PostgreSQL/PostGIS Compose definition, environment template, deployment guide, CI test/build/compile jobs, and manual real-data/provider/training workflow.
- **Frontend:** the five-section design is preserved with direct Open-Meteo integration, fifteen predefined locations, deterministic heat-index screening, forecast/chart and current-only map views, caching/deduplication, timestamps, source attribution, and explicit loading/error/retry/stale states. Non-production preview fixtures remain clearly separated from live provider responses.

## A. Final feature status table

| Feature | Final status | Verified evidence | Remaining boundary |
|---|---|---|---|
| Home Dashboard | **WORKING** | Real current/apparent temperature, humidity, wind, deterministic heat-index/risk guidance, six hourly values, timestamps, location selection, loading/error/stale states, and responsive controls passed unit and hosted-browser checks for Mumbai/Pune/Bengaluru. | Weather-model estimates for fifteen predefined locations only; no physical sensor reading, arbitrary-city search, or AI prediction is implied. |
| Temperature Forecast | **WORKING** | The public dashboard displays real five-day maximum/minimum cards and a responsive two-series chart. Run `42488852520` verified all days, values, hottest-day highlight, and 390px layout. | Ordinary Open-Meteo weather-model forecast, not an official warning or trained ML prediction. |
| Heat Risk Map | **WORKING** | Fifteen configured-coordinate current-only responses, marker risk levels, Pune popup values/timestamp, offline map controls, and desktop/mobile layouts passed real and mocked browser verification. | Added cities have no backend/ML coverage; this is not observed geographic hotspot detection or a complete city search. |
| Safety Tips | **WORKING** | Five sourced topics, four deterministic risk recommendations, selected-location guidance, dehydration/heat illness signs, heatstroke emergency guidance, professional-care limits, and `tel:112` metadata were browser-tested. | Not medical diagnosis, AI advice, or a substitute for local official/professional guidance. |
| About | **WORKING** | Purpose, weather/AI/IoT concepts, community value, integration boundaries, and source/limitations copy remain available without changing the preserved navigation/design. | Detailed run evidence remains in repository documentation rather than adding dashboard clutter. |
| Weather API | **PARTIALLY WORKING** | Direct frontend Open-Meteo current/forecast/map integration passed hosted run `42495826776`, including deployed picker-based Pune/Bengaluru selection. Backend mocked success/outage/stale tests and real Mumbai backend smoke run `42465620614` also passed. | No hosted FastAPI origin; direct frontend weather success is not backend deployment evidence. Sandbox provider egress remains unavailable. |
| Historical data | **PARTIALLY WORKING** | Run `42465620614` retrieved 7,672 real Open-Meteo daily rows for seven regions, 2023-01-01 through 2025-12-31, with source metadata and artifacts. History API returns stored current observations and tested empty states. | Dataset is a temporary CI artifact, not bundled or loaded into PostgreSQL. An archive-to-SQL scheduled loader is not implemented. |
| ML Prediction | **PARTIALLY WORKING** | Real chronological training/evaluation completed; real candidate loaded through FastAPI for seven region predictions and five hotspots in run `42465620614`. | Candidate is not promoted/deployed, expires as a CI artifact, and has no public dashboard binding or ongoing monitoring. |
| IoT / ESP32 | **PARTIALLY WORKING** | Firmware compiled successfully in CI. Authenticated, validated, idempotent simulated ingestion passed 44 Python tests and real local HTTP verification with explicit simulated labels. | No physical ESP32/DHT22, device network, TLS/NTP interoperability, calibration, or physical reading was verified. |
| Backend | **PARTIALLY WORKING** | Local real-HTTP health/regions/safety/docs/sensor/ML-unavailable behavior passed; Docker image built in CI; OpenAPI is available. | No hosted API, production process manager, HTTPS domain, uptime, or public interactive verification. |
| Database | **PARTIALLY WORKING** | SQLite persistence and constraints are exercised by API tests. PostgreSQL migration and PostGIS Compose configuration are present. | No live PostgreSQL/PostGIS migration, query, persistence, backup, or restore test was possible. |
| Responsive / accessible design | **WORKING** | 56 passing frontend tests (2 network-gated skips), searchable city/state picker keyboard/focus coverage, eleven-width visual/layout audits, six-width open-picker checks, desktop/mobile map and chart checks, mobile/reduced-motion coverage, zero local axe violations on every route and tested open-picker states, and hosted Chromium workflows passed. | Automated checks do not replace manual screen-reader or physical-device studies. |
| Security | **PARTIALLY WORKING** | Secrets are server-side examples only; sensor routes fail closed, use constant-time key comparison and `no-store`; input ranges/timestamps, CORS, SQL ORM, generic errors, and private device reads are tested. npm audit reports 0 vulnerabilities. | Production secret management, HTTPS, per-device credentials, rate limiting across workers, and a Python advisory-database scan remain external/hardening work. |
| Static deployment | **WORKING** | Pages deployment `42495672133` passed, and hosted run `42495826776` exercised the public fifteen-location searchable-picker interface with real Open-Meteo responses. | This is frontend-only deployment evidence, not backend/model/IoT deployment or an availability guarantee. |

No known present-but-broken main navigation control remains. All fifteen predefined frontend locations use configured coordinates and live provider requests. Preview fixtures remain explicit non-production fallbacks and are not presented as live readings.

## Real provider and ML evidence

Successful GitHub run: **[42465620614](https://github.com/TusharTTM/Heat_Shield_AI/actions/runs/42465620614)**, job `128684335936`, commit `425efb4`.

### Live provider smoke (run-specific, not a current reading now)

- Region: Mumbai; source: Open-Meteo through `backend.app.weather.WeatherClient`.
- Observed at `2026-11-08T09:00:00+00:00`; retrieved at `2026-11-08T09:04:57.041348+00:00`.
- Provider values in that response: 36.2°C and 15% relative humidity.
- Forecast: exactly five days, 8–12 November 2026.

### Real chronological training

- Dataset: Open-Meteo historical weather/reanalysis, seven configured regions, **7,672 raw rows**; **7,651 usable feature rows**.
- Split: **6,118 training rows** through 26 May 2025; **1,533 later evaluation rows** beginning 27 May 2025; no shuffle or date overlap.
- Candidate version: `20261108T090518Z-7879b519d722`; provenance checks passed and ingestion had no failures.

| Model | Holdout MAE | Holdout RMSE | Holdout R² |
|---|---:|---:|---:|
| Linear Regression | 0.8368°C | 1.1559°C | 0.8711 |
| Random Forest | 0.8405°C | 1.1712°C | 0.8677 |
| **Gradient Boosting (lowest RMSE)** | **0.8218°C** | **1.1471°C** | **0.8731** |

These are actual results for this dataset/holdout only, not a guarantee for other periods, locations, official forecasting, or live accuracy. Gradient Boosting's advantage over Linear Regression is small and requires review rather than hype.

The same run loaded the real candidate through FastAPI and received valid prediction responses for all seven regions and five `model_inferred` hotspots. This verified software inference, not additional holdout accuracy or a public prediction service.

Artifacts: `heatshield-open-meteo-42465620614` and `heatshield-candidate-model-42465620614`; GitHub reports expiration on **8 December 2026**. The sandbox cannot download the signed artifact host, so neither is installed locally or committed. Earlier archive runs `42464849991` and `42465188199` failed on provider HTTP/network errors; diagnostics/retries were fixed before the successful smaller-window run. Partial failed data was never trained or promoted.

## B. Remaining work and reasons

1. **Arbitrary-city geocoding and live dashboard ML — NOT IMPLEMENTED.** All 15 predefined cities in `shared/regions.json` now have full frontend, FastAPI backend, SACHET area-matching, historical ingestion, and chronological ML training/inference support (verified in run `42579707328`), whereas arbitrary-city geocoding and frontend ML predictions remain intentionally out of scope.
2. **Hosted backend & CPCB live key — BLOCKED externally.** A Python/Docker host, HTTPS reverse proxy/domain, `VITE_API_BASE_URL`, operator-owned `DATA_GOV_IN_API_KEY`, logging/backups, NDMA reproduction/notification review, and operations ownership are required before operating a public backend.
3. **PostgreSQL/PostGIS managed operations — PARTIALLY WORKING.** Ephemeral `postgis/postgis:16-3.4` runtime, double-applied migrations `001`–`005`, all 10 ORM tables, and Docker Compose FastAPI HTTP contracts are verified in CI (`42584079125`). Provisioning a managed database, backup/restore drills, and network lockdown remain operator steps.
4. **Model promotion and persistent serving — PARTIALLY WORKING.** Run `42579707328` trained and evaluated the 15-region 2023–2025 candidate (`16,440` raw rows; Gradient Boosting MAE `0.8759°C`, RMSE `1.2156°C`, R² `0.8782`) and verified 15-region FastAPI inference and 5 `model_inferred` hotspots. Controlled storage, promotion review, monitoring, and retraining remain external.
5. **Archive-to-SQL history — MISSING.** Add a validated importer/scheduler if historical archive rows must appear in `/weather/history`; that endpoint currently serves stored current observations, while archive data is a CI CSV artifact.
6. **Physical IoT — BLOCKED externally.** Real hardware, Wi-Fi/NTP, deployed HTTPS API, CA chain, server/device credentials, compilation/upload on the target board, calibration, and physical readings are required.
7. **Production IoT hardening — PARTIALLY WORKING.** Add per-device credentials/rotation, buffering/retry policy, secure provisioning, OTA controls, and multi-worker rate limiting before fleet use.
8. **Extended assurance — UNVERIFIED.** Manual assistive-technology studies, physical mobile devices, managed database failover, long-term public availability, and Python vulnerability-advisory scanning remain unperformed. `pip check` passes; this is not a vulnerability scan.

## C. Exact external requirements

- **Weather:** outbound access to `api.open-meteo.com` and `archive-api.open-meteo.com`, compliance with Open-Meteo license/usage limits, and a suitable commercial/server-side plan if required by usage. Basic non-commercial requests need no frontend secret. Never place provider credentials in `VITE_*` values.
- **Backend:** Python 3.11 or Docker, public HTTPS origin, exact `CORS_ORIGINS`, strong `SENSOR_API_KEY`, and provider egress. Set `APP_ENV=production`; configure process supervision and secret storage.
- **Database:** PostgreSQL/PostGIS service, `DATABASE_URL=postgresql+psycopg://...`, Compose `POSTGRES_PASSWORD`, migration privileges, backups, and restricted network access. URL-encode credentials.
- **ML:** the matching reviewed `temperature_model.joblib` and `temperature_model.metadata.json` from controlled storage; configure `ML_MODEL_PATH` and `ML_METADATA_PATH`. Joblib is trusted executable serialization, not an upload format.
- **Frontend live mode:** the public frontend calls Open-Meteo directly and needs no backend URL or provider secret for the implemented basic non-commercial requests. Any future switch to a hosted backend requires a non-secret public API base URL, exact backend CORS origin, adapter/state changes, and new deployed verification; merely defining an unused environment variable has no effect.
- **IoT:** ESP32 board, DHT22/AM2302 and correct wiring/pull-up, PlatformIO, local `config.h`, Wi-Fi, NTP, deployed API root CA PEM, and matching sensor key. Physical success must use firmware `source=physical`; software tests remain `simulated`.

## D. Deployment instructions

Full commands and verification limits are in [`docs/DEPLOYMENT.md`](DEPLOYMENT.md). Summary:

1. **Static frontend:** `cd frontend && npm ci && npm test && GITHUB_PAGES=true npm run build`; deploy through the existing Pages workflow. Do not add secrets.
2. **Backend/database:** copy `.env.example` to `.env`, set strong database/sensor secrets, then `docker compose up --build -d` on a Docker host; or install `backend/requirements.txt` and run Uvicorn behind HTTPS. Apply `backend/migrations/001_initial.sql` in a controlled PostgreSQL deployment.
3. **Provider:** verify real current/forecast/risk responses and source timestamps. A 503 unavailable response is not successful weather integration; stale cached responses must remain labelled stale.
4. **ML:** run/review the manual ingestion/training workflow, install the matching candidate pair in controlled storage, configure model paths, restart, and require `/api/v1/ml/status` to report `loaded` before prediction checks.
5. **Firmware:** copy the example config locally, replace all credentials/CA/device values, then `pio run`, upload, monitor, and verify actual physical ingestion. The CI compile used placeholders and is not hardware evidence.

## E. Service verification record

| Layer | Verified result | Evidence boundary |
|---|---|---|
| Frontend unit/build | **80 passed, 3 network-gated skips** locally (all 3 live API/CAMS/archive tests passed in CI), strict TypeScript (`tsc -b`), Pages build, `git diff --check`, npm audit **0 vulnerabilities** | Unit/build evidence plus explicit non-production fixtures; live behavior is evidenced separately below. |
| Browser/UI | Seven routes, 15 locations, Heat + Air-pollution map layers, official-panel mocked Chromium suite (`42584079125` at `1440x1000` & `390x844`), and live Hosted Pages Chromium suite (`42584410097`) passed | Official-panel browser tests use mocked HTTP; manual assistive-technology and physical-device studies remain unverified. |
| Python | **90/90 tests** locally and CI run `42584079125`; `ruff==0.11.8` and `pip check` pass | Includes explicit synthetic ML fixtures, mocked SACHET/CPCB transports, and simulated sensors. |
| PostgreSQL/PostGIS & Compose | CI run `42584079125` (`postgres-migrations-and-compose`): `postgis/postgis:16-3.4`, migrations `001`–`005` applied twice, all 10 ORM tables & Compose FastAPI HTTP + simulated sensor deduplication verified | Ephemeral CI container evidence; managed production database, backups, and TLS remain external. |
| Real Open-Meteo, CAMS & SACHET | Runs `42584079253` and `42584410097`: live Open-Meteo weather + CAMS AQ across 15 regions, plus live NDMA SACHET RSS + 100 CAP XML documents validated & ETag-cached | Run-specific live evidence; CPCB returned `503 CPCB_NOT_CONFIGURED` (no `DATA_GOV_IN_API_KEY` in public CI); direct IMD/CWC remain unconnected. |
| Real 15-region ML | Run `42579707328`: 16,440 rows across 15 regions (2023–2025), 3,285 chronological holdout rows, Gradient Boosting MAE `0.8759°C` / RMSE `1.2156°C` / R² `0.8782`, 15 FastAPI predictions, 5 `model_inferred` hotspots | External CI candidate artifact (`20261109T073141Z-9010a3bc4b8e`) only; no promoted model or live accuracy claim. |
| Firmware | PlatformIO `pio run` succeeded in CI (`42584079125`) | Placeholder configuration compile; no physical upload/connectivity/calibration. |
| Public hosting | GitHub Pages static frontend deployed (`42584079221`) and browser-verified (`42584410097`); **FastAPI/PostgreSQL/ML/IoT not publicly hosted** | Must not be inferred from local or CI success. |
