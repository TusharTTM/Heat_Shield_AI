# HeatShield AI

**Source-aware weather and air-quality monitoring, deterministic multi-hazard screening, practical safety guidance, and honest integration boundaries.**

**[Open the live GitHub Pages website](https://tusharttm.github.io/Heat_Shield_AI/)**

The website connects directly to **Open-Meteo** for current weather, hourly values, five-day forecasts, and CAMS air-quality model estimates across all **fifteen** configured Indian locations (`shared/regions.json`), shared with the FastAPI backend and ML pipeline. Responses are cached with explicit stale/error states and a single automatic timeout retry. Fixed fixtures remain only in software tests and are not displayed as live data. Optional FastAPI adapters add NDMA SACHET CAP warnings and CPCB station observations without mixing them into modelled indices. Static GitHub Pages weather connectivity does not imply a publicly hosted FastAPI backend, configured `DATA_GOV_IN_API_KEY` credential, promoted production ML service, or physical IoT device.

## Website sections

The current app (`frontend/src/App.tsx`) routes five screens:

- **Dashboard (`/`):** current weather and dual US/European AQI model estimates, explainable heat/pollution screening, early heat/AQ signals, the 24-hour day planner, the preparedness checklist, and a separate optional SACHET warning panel.
- **Metric detail (`/metric/:metricId`):** Temperature, Heat Index, Humidity, UV Index, Air Quality, and Heat Risk views with hourly charts, tables, and Yesterday/Today/Tomorrow controls.
- **AI Assistant (`/assistant`):** the chat screen, which fails closed with setup guidance when no backend `VITE_API_BASE_URL` or `ASSISTANT_API_KEY` is configured.
- **Menu (`/menu`):** chat history and navigation.
- **Profile (`/profile`):** units, language, alert types/lead time/quiet hours, and the device-location toggle.

The earlier Disaster Monitor, Forecast, Risk Map, Alerts, Safety, and About screens are **not routed** in this branch; their source files remain in `frontend/src/pages/` but every old path redirects to the dashboard with an explanatory, dismissible notice (`frontend/src/test/siteAudit.test.tsx` asserts every retired path is explained).

Official SACHET warnings render in a panel on the dashboard itself. The Reports count links to that panel, because there is no separate alerts page. The responsive interface supports mobile, tablet, desktop, keyboard operation, and reduced motion. Region selection persists only in the current browser.

## Heat-risk day planner (dashboard)

The dashboard includes a non-AI day planner that screens the modelled hourly forecast for the selected city over the next 24 hours. It highlights the hours with the highest screened heat, points out comparatively lower-heat windows for planning outdoor time, and lets you compare six-hour blocks — all from the forecast data the site already loads. User-facing limitations:

- All values are **model estimates** (Open-Meteo weather model), not official warnings, station observations, or medical advice.
- "Lower heat" is only comparative. **No period is ever presented as completely safe** — heat stress is still possible in any window.
- Hours the model cannot screen (for example, missing humidity) are shown as **unknown, never as an all-clear**.
- The planner never requests or transmits precise location (only the selected city) or any personal health information.
- Long limitation notes and source labels are in English, matching the site's other technical disclosures.

## Metric detail views

Each dashboard metric card (Temperature, Heat Index, Humidity, UV Index, Air Quality, Heat Risk) opens its own detail view in a new tab, so the dashboard stays open. Every detail view includes an interactive hourly chart with units and tooltips, an accessible hourly table, Yesterday / Today / Tomorrow controls, minimum/maximum/current summary values, a plain-language explanation with safety guidance, the data source and last-updated time, and previous/next metric navigation. Limitations:

- Hourly values are **modelled estimates** (Open-Meteo weather model, ERA5 reanalysis, or CAMS air-quality model) — not official warnings or station observations.
- Yesterday uses historical reanalysis when the connected source provides it. When it does not (for example historical UV index), the view says so plainly — **missing data is shown as unknown, never invented or presented as an all-clear**.
- Missing hours inside a day appear as chart gaps and "Unavailable" table cells, never as zeros.

## Run the frontend

Requirements: Node.js 22+ and npm. No credentials or environment file are required.

```bash
cd frontend
npm ci
npm run dev
```

```bash
npm test          # unit tests
npm run lint      # ESLint (TypeScript + React hooks rules)
npx tsc -b        # strict type check
npm run build
npm audit
```

From the repository root, `make help` lists the same commands (`make setup`, `make test`, `make lint`, `make build`) so contributors do not need to memorise the per-directory setup.

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
pytest backend/tests ml/tests firmware/tests -q   # 130 tests
cd frontend && npm test                          # 208 tests, 3 network-gated skips
```

Automated unit tests use mocked HTTP transports and `source=simulated` sensor readings; live provider, PostgreSQL/PostGIS (`001`–`005`), and Playwright Chromium browser checks run in `.github/workflows/verify-integrations.yml` and `.github/workflows/verify-open-meteo.yml`.

## ML and firmware boundaries

- Archive ingestion retrieves genuine Open-Meteo historical/reanalysis data only when run with provider network access; no real historical CSV is bundled. GitHub run `42579707328` retrieved **16,440 real daily rows** across all **15 configured locations** (`2023-01-01` to `2025-12-31`), evaluated Linear Regression, Random Forest, and Gradient Boosting chronologically on **3,285 holdout rows** (Gradient Boosting MAE **0.8759°C**, RMSE **1.2156°C**, R² **0.8782**), and verified FastAPI inference across all 15 regions plus 5 `model_inferred` hotspots. It remains an external, unpromoted CI artifact rather than a deployed prediction service.
- Training compares Linear Regression, Random Forest, and Gradient Boosting using a no-shuffle chronological holdout and MAE/RMSE/R². Synthetic fixtures test the implementation only and are non-promotable.
- Loading is gated on the artifact's own `promotion_eligible` flag, `dataset_type`, recorded ingestion failures, and dataset-hash match — an unpromotable pair is refused **before** `joblib.load` runs, so an unverified blob is never deserialised. `/api/v1/ml/status` reports `served`, `promotion_eligible`, and `status_detail` explaining any refusal.
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
