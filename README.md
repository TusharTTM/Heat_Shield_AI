# HeatShield AI

**Source-aware weather and air-quality monitoring, deterministic multi-hazard screening, practical safety guidance, and honest integration boundaries.**

**[Open the live GitHub Pages website](https://tusharttm.github.io/Heat_Shield_AI/)**

The website connects directly to **Open-Meteo** for current weather, hourly values, five-day forecasts, and CAMS air-quality model estimates across all **fifteen** configured Indian locations (`shared/regions.json`), shared with the FastAPI backend and ML pipeline. Responses are cached with explicit stale/error states and a single automatic timeout retry. Fixed fixtures remain only in software tests and are not displayed as live data. Optional FastAPI adapters add NDMA SACHET CAP warnings and CPCB station observations without mixing them into modelled indices. Static GitHub Pages weather connectivity does not imply a publicly hosted FastAPI backend, configured `DATA_GOV_IN_API_KEY` credential, promoted production ML service, or physical IoT device.

## Seven website sections

- **Dashboard:** current weather and dual US/European AQI model estimates, explainable heat/pollution screening, upcoming heat/AQ signals, and separate optional SACHET/CPCB panels.
- **Disaster Monitor:** detailed deterministic assessments and model trends, official CAP warnings when configured, station observations/history, and explicit flood/cyclone/lightning/drought coverage limits.
- **Forecast:** a responsive five-day high/low chart, exact dates, freshness and source labels, daily cards, and a highlighted hottest model day.
- **Risk Map:** selectable heat and modelled US/European AQI air-pollution layers across all fifteen locations, unavailable/stale marker states, and an offline India outline with no third-party tiles.
- **Alerts:** official SACHET CAP warnings panel (when `VITE_API_BASE_URL` points to a deployed backend) kept separate from generated heat/AQ screening notices, with deduplication and explicit “not official warning delivery” labeling. No email, SMS, or background push service is claimed.
- **Safety:** selected-location heat/AQ guidance plus sourced flood, cyclone, lightning, drought, official-agency, and emergency information.
- **About:** implementation status and clear weather-model, station-observation, official-warning, AI/ML, backend, and sensor boundaries.

The responsive interface supports mobile, tablet, desktop, keyboard operation, reduced motion, and legacy redirects. Region selection persists only in the current browser.

## Run the frontend

Requirements: Node.js 22+ and npm. No credentials or environment file are required.

```bash
cd frontend
npm ci
npm run dev
```

```bash
npm test
npm run build
npm audit
```

Network-enabled verification (not expected to work in a restricted sandbox):

```bash
npm run test:live-api
npx playwright install chromium
npm run test:live-ui
npm run test:official-ui  # Mocked SACHET/CPCB HTTP; not live-provider evidence
# Or verify the deployed app without starting a local server:
PLAYWRIGHT_BASE_URL=https://tusharttm.github.io/Heat_Shield_AI/ npm run test:live-ui
```

The live browser test compares actual Open-Meteo responses with the Home cards, hourly values, five-day Forecast cards/chart, cache behavior, and location switching. Open-Meteo attribution and CC BY 4.0 links appear beside weather data.

To connect the optional official-source panels, copy `frontend/.env.example` to `frontend/.env` and set only `VITE_API_BASE_URL` to a reachable FastAPI origin. Leaving it empty is supported: the UI reports that the backend is not configured and never substitutes generated warnings or station readings.

## Run the optional backend locally

Requirements: Python 3.11+. The default is an isolated local SQLite database; production PostgreSQL configuration is documented separately.

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements-dev.txt -r ml/requirements-dev.txt
cp .env.example .env
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

Open `http://localhost:8000/docs`. Weather endpoints use server-side Open-Meteo requests and return stale/unavailable states on failure. Sensor endpoints fail closed until a strong `SENSOR_API_KEY` is configured. ML inference returns `MODEL_UNAVAILABLE` until a matching, reviewed artifact pair is installed.

Optional official sources:

- **NDMA SACHET:** the backend retrieves the all-India RSS and identifier-specific CAP XML, validates the configured HTTPS host/path, rejects DTD/entities, correlates RSS query IDs with CAP `<identifier>` values, persists XML/ETags, honours CAP update/cancel/expiry fields, and uses conservative polygon/national/state-plus-place matching across all fifteen locations. Live CI verification (runs `42584079253` and `42584410097`) retrieved and validated 100 live CAP XML documents with ETag caching from `sachet.ndma.gov.in`; public production hosting still requires deployment infrastructure and NDMA reproduction/notification policy review.
- **CPCB through data.gov.in:** create an account and configure `DATA_GOV_IN_API_KEY` only on the backend for resource `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69`. The supplied Indian AQI is shown only when present; pollutant averages are never converted into AQI. Authentication/rate-limit/outage and stale-cache states are explicit. Because no `DATA_GOV_IN_API_KEY` is configured in public CI, live CPCB retrieval remains an operator-credential step while `503 CPCB_NOT_CONFIGURED` fail-closed behavior is verified. See `docs/MULTI_HAZARD_DEVELOPMENT.md` and `docs/DEPLOYMENT.md`.

```bash
pytest backend/tests ml/tests firmware/tests -q
```

Automated unit tests (`90 passed`) use mocked HTTP transports and `source=simulated` sensor readings; live provider, PostgreSQL/PostGIS (`001`–`005`), and Playwright Chromium browser checks run in `.github/workflows/verify-integrations.yml` and `.github/workflows/verify-open-meteo.yml`.

## ML and firmware boundaries

- Archive ingestion retrieves genuine Open-Meteo historical/reanalysis data only when run with provider network access; no real historical CSV is bundled. GitHub run `42579707328` retrieved **16,440 real daily rows** across all **15 configured locations** (`2023-01-01` to `2025-12-31`), evaluated Linear Regression, Random Forest, and Gradient Boosting chronologically on **3,285 holdout rows** (Gradient Boosting MAE **0.8759°C**, RMSE **1.2156°C**, R² **0.8782**), and verified FastAPI inference across all 15 regions plus 5 `model_inferred` hotspots. It remains an external, unpromoted CI artifact rather than a deployed prediction service.
- Training compares Linear Regression, Random Forest, and Gradient Boosting using a no-shuffle chronological holdout and MAE/RMSE/R². Synthetic fixtures test the implementation only and are non-promotable.
- Heat risk is deterministic NWS heat-index screening. ML hotspots are labelled `model_inferred`; no learned heat-risk classifier or observed hotspot detection is claimed.
- ESP32 firmware requires local credentials, CA-validated HTTPS, NTP time, and valid DHT22 readings. Compilation, physical connectivity, and sensor accuracy are separate verification steps.
- Safety recommendations are documented offline rules, not AI-generated medical advice. Suspected heatstroke requires emergency/professional help.

## Documentation

- [`docs/MULTI_HAZARD_DEVELOPMENT.md`](docs/MULTI_HAZARD_DEVELOPMENT.md) — current implementation boundaries, official-source behavior, verification, and release blockers.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — frontend/backend/database/official-source/model/sensor deployment and verification commands.
- [`docs/COMPLETE_FEATURE_AUDIT.md`](docs/COMPLETE_FEATURE_AUDIT.md) — earlier whole-project audit; use the multi-hazard report above for this working branch's current status.
- [`ml/README.md`](ml/README.md) — ingestion, chronological training, evaluation, artifacts, inference, and hotspot limits.
- [`firmware/esp32_dht22/README.md`](firmware/esp32_dht22/README.md) — wiring, configuration, build, and hardware verification boundary.
- [`docs/PRODUCT_REVIEW.md`](docs/PRODUCT_REVIEW.md), [`docs/PREVIEW.md`](docs/PREVIEW.md), and [`DESIGN.md`](DESIGN.md) — static interface decisions and evidence.
