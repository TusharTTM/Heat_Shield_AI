# Deployment and service verification

No hosted FastAPI, managed database, trained-model service, or physical IoT deployment is included automatically. The GitHub Pages site is statically hosted but connects directly to Open-Meteo for weather-model data. Follow the relevant steps below and record real responses before changing service status.

## 1. Public static frontend

Requirements: GitHub Pages enabled for the repository's GitHub Actions source.

```bash
cd frontend
npm ci
npm test
GITHUB_PAGES=true npm run build
```

`.github/workflows/deploy-pages.yml` builds and deploys this static bundle on the configured branch paths (verified in run `42584079221`). The browser calls Open-Meteo directly and caches responses; no backend URL or frontend credential is required for weather/CAMS. To enable the optional official-source panels, set the non-secret `VITE_API_BASE_URL` variable on the **github-pages** environment to an HTTPS FastAPI origin. If it is empty, those panels explicitly report that the backend is not configured. Never put the data.gov.in key, database password, sensor key or other secrets in `VITE_*` values. `.github/workflows/verify-open-meteo.yml` runs real Open-Meteo/CAMS/archive Vitest checks, a Chromium test (`live-weather.spec.ts`) against local Vite (`42584079253`) or hosted GitHub Pages (`42584410097`), and a live FastAPI + NDMA SACHET RSS/CAP + CPCB fail-closed check (`live-backend-and-official-sources`). Mocked official-panel browser flows at `1440x1000` and `390x844` run in `.github/workflows/verify-integrations.yml` (`official-sources-browser`, run `42584079125`).

Verify the deployed Home, Forecast, Maps, Safety, and About documents/assets. Browser interaction must be checked separately from text/asset retrieval.

## 2. Backend with Docker Compose and PostgreSQL/PostGIS

Requirements: Docker Compose, a machine with provider egress, and strong locally generated secrets.

```bash
cp .env.example .env
# Set long random POSTGRES_PASSWORD and SENSOR_API_KEY values; URL-encode the DB password.
# Optional CPCB: set DATA_GOV_IN_API_KEY only in this server-side environment.
# SACHET is enabled by default; set SACHET_ENABLED=false to disable polling.
docker compose up --build -d
docker compose ps
curl --fail http://localhost:8000/api/v1/health
curl --fail http://localhost:8000/openapi.json
```

The Compose database uses `postgis/postgis:16-3.4`. The current application stores configured scalar coordinates and CAP polygon JSON, but does not claim PostGIS spatial queries. `create_all` initializes a new local/development database; for controlled production changes, review and apply pending SQL migrations in order. Use a libpq-compatible URL (not the SQLAlchemy `postgresql+psycopg://` form):

```bash
export PGDATABASE_URL='postgresql://heatshield:URL_ENCODED_PASSWORD@DB_HOST:5432/heatshield'
for migration in \
  backend/migrations/001_initial.sql \
  backend/migrations/002_air_quality.sql \
  backend/migrations/003_air_quality_european_forecast.sql \
  backend/migrations/004_cpcb_station_observations.sql \
  backend/migrations/005_sachet_cap_alerts.sql; do
  psql "$PGDATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" || exit 1
done
```

On an existing database, apply only migrations that have not already been applied after reviewing the schema and taking a backup. These plain SQL files are written idempotently and verified across two consecutive passes (`001`–`005`) against `postgis/postgis:16-3.4` in `.github/workflows/verify-integrations.yml` (`postgres-migrations-and-compose`, run `42584079125`), but they do not provide a versioned migration ledger or rollback framework; introduce a migration runner and backup procedure before operating a managed production database.

For a public deployment, run the API behind an HTTPS reverse proxy, restrict database network access, set `APP_ENV=production`, set exact `CORS_ORIGINS`, configure backups/log retention, and use a secret manager. Do not expose PostgreSQL publicly. The container binds `0.0.0.0:8000`; a host-specific proxy/domain and TLS certificate are external requirements.

## 3. Backend without Docker

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
export DATABASE_URL='postgresql+psycopg://heatshield:URL_ENCODED_PASSWORD@DB_HOST:5432/heatshield'
export SENSOR_API_KEY='GENERATE_A_LONG_RANDOM_VALUE'
export CORS_ORIGINS='https://tusharttm.github.io'
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

Provision PostgreSQL/PostGIS and apply the migration first. Production process management, worker sizing, proxy headers, HTTPS, secret storage, and database credentials are provided by the hosting platform.

## 4. Real weather, training, and model configuration

Open-Meteo requires network access and compliance with the applicable plan/license; basic non-commercial requests do not need a frontend API key. Test the actual deployed endpoints:

```bash
curl --fail "$API_ORIGIN/api/v1/weather/current/mumbai"
curl --fail "$API_ORIGIN/api/v1/weather/forecast/mumbai"
curl --fail "$API_ORIGIN/api/v1/risk/mumbai"
```

A 503 with `WEATHER_UNAVAILABLE`/`FORECAST_UNAVAILABLE` is an honest provider outage, not a successful integration. Cached successful responses must say `stale` when a later provider request fails.

The manual **Ingest source-backed climate data** GitHub workflow live-tests the backend provider client, retrieves archive/current data, and optionally trains/evaluates a candidate. Download its data/model artifacts only after reviewing run logs, failures, provenance, chronological metrics, license, and intended deployment. Install the matching pair on the backend model volume:

- `temperature_model.joblib`
- `temperature_model.metadata.json`

Then configure `ML_MODEL_PATH` and `ML_METADATA_PATH`, restart the API, and verify `/api/v1/ml/status` is `loaded`. Joblib files are trusted executable serialization; never accept an uploaded/unreviewed artifact.

## 5. Optional SACHET and CPCB verification

Set `VITE_API_BASE_URL` to the deployed API origin at frontend build time and include the exact frontend origin in backend `CORS_ORIGINS`. The URL is public configuration, not a credential. Keep `DATA_GOV_IN_API_KEY` only on the API service. Health configuration can be checked without exposing the key:

```bash
curl --fail "$API_ORIGIN/api/v1/health"
curl --fail "$API_ORIGIN/api/v1/official/alerts/mumbai"
curl --fail "$API_ORIGIN/api/v1/official/air-quality/current/mumbai"
curl --fail "$API_ORIGIN/api/v1/official/air-quality/history/mumbai?limit=100"
```

A SACHET 200 response must retain `evidence_type=official-warning`, CAP sender/status/scope/severity/validity/source fields, match explanations, completeness counts and attribution. `retrieval_complete=false`, stale data or zero matches is not an all-clear. A 503 with no cache is an honest unavailable state. Verify that conditional requests and cached XML survive restart and that long-lived alerts remain present after RSS/CAP 304 revalidation.

A CPCB 200 response must retain `evidence_type=station-observation` and original station timestamps/units. `aqi=null` means Indian AQI was not supplied; do not replace it with a pollutant average or CAMS index. `CPCB_NOT_CONFIGURED`, `CPCB_AUTH_FAILED`, `CPCB_RATE_LIMITED` and `CPCB_UNAVAILABLE` are distinct server outcomes. A stale response must identify the live-refresh failure. Record the real provider HTTP behavior, station coverage, pagination and applicable terms/quota rather than inferring them from mocks.

Review the NDMA website/reproduction policy and notify/request permission as required before production reproduction. Preserve NDMA/issuing-agency attribution and original CAP links. Preserve CPCB/ministry/OGD attribution and the Government Open Data License link without implying endorsement.

## 6. Sensor verification

Without a configured server key, ingestion returns 503. With a key, missing/wrong credentials return 401. A software-only test must explicitly say `source=simulated`:

```bash
curl --fail -X POST "$API_ORIGIN/api/v1/sensors/readings" \
  -H "Content-Type: application/json" \
  -H "X-Sensor-Key: $SENSOR_API_KEY" \
  -d '{"device_id":"simulated-deployment-test","observed_at":"2026-11-08T00:00:00Z","temperature_c":35,"humidity_pct":45,"source":"simulated","note":"Software integration test only; not a physical sensor."}'
```

Use a current timestamp in a real request. Then query the private reading/status endpoints with the same key. This verifies software only; physical ESP32 status requires firmware compilation/upload, valid CA/NTP/Wi-Fi, DHT22 readings, and `source=physical` responses from the actual device.

## 7. Evidence checklist

Record the environment, UTC time, endpoint, HTTP status, source/observed/retrieved timestamps, freshness, and test run IDs. Keep these categories distinct:

1. unit/mocked integration tests;
2. local real-HTTP service checks;
3. live provider responses;
4. hosted interactive browser checks;
5. managed PostgreSQL/PostGIS verification;
6. real-data model training and holdout metrics;
7. firmware compilation;
8. physical sensor/hardware connectivity.

Never convert one category of evidence into a claim about another.
