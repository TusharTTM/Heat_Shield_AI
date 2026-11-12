# HeatShield AI FastAPI backend

This is a real API implementation, not a hosted-service claim. It supports Open-Meteo weather and CAMS air-quality retrieval, timestamped SQL persistence, deterministic heat/AQI screening, optional NDMA SACHET CAP warnings, optional CPCB/data.gov.in station observations, static safety guidance, optional trained-model inference, and authenticated ESP32/simulated sensor ingestion.

## Run locally

From the repository root:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements-dev.txt
cp .env.example .env
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

Open `http://localhost:8000/docs`. The default local database is `./heatshield.db`; tests use isolated temporary SQLite databases. Create at least a 32-character random `SENSOR_API_KEY` before testing ingestion. Without it, sensor endpoints fail closed with `SENSOR_AUTH_NOT_CONFIGURED`.

## Tests

```bash
pytest backend/tests -q
```

Weather, CAMS, SACHET and CPCB provider tests use explicit `httpx.MockTransport` fixtures. Sensor tests use readings labelled `source=simulated`; none is evidence of live provider, credential or physical hardware success.

## Production configuration

- Set `DATABASE_URL=postgresql+psycopg://...` and provision PostgreSQL/PostGIS. PostGIS is recommended for future spatial queries, while the current schema stores scalar coordinates in `shared/regions.json` (15 locations) and CAP polygon JSON without claiming spatial indexing.
- Review and apply migrations `001_initial.sql` through `005_sachet_cap_alerts.sql` in order on PostgreSQL; see `docs/DEPLOYMENT.md`. CI (`verify-integrations.yml`, run `42584079125`) applies `001`–`005` twice on `postgis/postgis:16-3.4` and verifies all 10 ORM tables and Compose HTTP endpoints, while managed production database provisioning and backups remain external operator responsibilities.
- Set `CORS_ORIGINS` to exact deployed frontend origins, `APP_ENV=production`, strong sensor credentials, and trusted HTTPS reverse-proxy settings.
- Open-Meteo non-commercial use does not require a frontend secret. Review and configure the appropriate commercial plan/server-side credentials if your usage requires them. Provider network access is still required.
- Configure `ML_MODEL_PATH` and `ML_METADATA_PATH` only after a real source-backed training/evaluation run (such as 15-region CI run `42579707328`). Joblib artifacts are trusted code inputs; never load uploads or untrusted models.
- Keep `/api/v1/sensors/*` private. Do not put `SENSOR_API_KEY`, `DATA_GOV_IN_API_KEY`, database URLs, or provider secrets in `VITE_*` variables. Live NDMA SACHET RSS/CAP retrieval is verified in CI (`verify-open-meteo.yml`, runs `42584079253` and `42584410097`), while live CPCB retrieval requires an operator-supplied `DATA_GOV_IN_API_KEY` (without it, the API fails closed with `503 CPCB_NOT_CONFIGURED`).

No hosted API, managed PostgreSQL instance, DNS/TLS certificate, or production uptime is included in this checkout.
