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

Open `http://localhost:8000/docs`. The default local database is `./heatshield.db`; tests use isolated temporary SQLite databases. Create at least a 32-character random `SENSOR_API_KEY` before testing ingestion — shorter values are rejected at startup — and leave it empty to keep sensor endpoints failing closed with `SENSOR_AUTH_NOT_CONFIGURED`.

## API notes

- `GET /api/v1/risk` probes the fifteen regions over a bounded thread pool (`RISK_MAP_WORKERS`, default 4) instead of one sequential round-trip per region.
- `POST /api/v1/assistant/chat` is rate-limited per client IP (`ASSISTANT_RATE_LIMIT_PER_MINUTE`, default 20) and returns `429 ASSISTANT_RATE_LIMITED` with `Retry-After`; it never calls the provider for a throttled request.
- Assistant context fields reject line breaks (`422`) because each context item renders as one prompt line; a newline would let cached provider text forge an official-warning row. `/api/v1/assistant/chat` responses always carry the sources actually used.
- Provider adapters share one pooled `httpx` client per adapter and close it on application shutdown.

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
- Configure `ML_MODEL_PATH` and `ML_METADATA_PATH` only after a real source-backed training/evaluation run (such as 15-region CI run `42579707328`). Joblib artifacts are trusted code inputs; never load uploads or untrusted models. The service refuses any pair whose metadata is not `promotion_eligible`, does not name `historical_weather_reanalysis`, records ingestion failures, or fails the dataset-hash match, and it does so **before** deserialising the artifact; `GET /api/v1/ml/status` explains the refusal with `status_detail`.
- Keep `/api/v1/sensors/*` private. Do not put `SENSOR_API_KEY`, `DATA_GOV_IN_API_KEY`, database URLs, or provider secrets in `VITE_*` variables. Live NDMA SACHET RSS/CAP retrieval is verified in CI (`verify-open-meteo.yml`, runs `42584079253` and `42584410097`), while live CPCB retrieval requires an operator-supplied `DATA_GOV_IN_API_KEY` (without it, the API fails closed with `503 CPCB_NOT_CONFIGURED`).
- The AI assistant endpoint (`POST /api/v1/assistant/chat`) talks to an OpenAI-compatible chat-completions service. Set `ASSISTANT_API_KEY` (server-only), and optionally `ASSISTANT_BASE_URL` (default `https://api.openai.com/v1`, point it at any compatible gateway), `ASSISTANT_MODEL` (default `gpt-4o-mini`), `ASSISTANT_TIMEOUT_SECONDS`, and `ASSISTANT_MAX_OUTPUT_TOKENS`. Without `ASSISTANT_API_KEY` the endpoint fails closed with `503 ASSISTANT_NOT_CONFIGURED` and `GET /api/v1/assistant/status` reports `not_configured`. Requests carry only the city-level conditions the frontend already displays — the schema rejects profile names, emails, and coordinates (`extra="forbid"`) — and the provider key is never sent to the browser.

No hosted API, managed PostgreSQL instance, DNS/TLS certificate, or production uptime is included in this checkout.
