# Migration and delivery plan

> **Implementation update (8 November 2026):** the simplified five-section frontend now uses live Open-Meteo model data, and initial FastAPI, SQL, chronological ML, authenticated ingestion, firmware, and deployment structure is present. This plan is not evidence of hosted services or trained models. See `docs/COMPLETE_FEATURE_AUDIT.md`, `docs/DEPLOYMENT.md`, `ml/README.md`, and `firmware/esp32_dht22/README.md` for implemented behavior and remaining external requirements.

## Phase 1 — Preserve and establish contracts

1. Keep the audited legacy deployment untouched; it belongs to another repository.
2. Establish source/status/timestamp API envelopes before creating dashboard cards.
3. Seed only geographic reference data (coordinates and region names), safety-rule content and mission definitions—not environmental readings.
4. Add environment templates and separate development/test/production configuration.

## Phase 2 — Data and backend foundation

1. Implement SQLAlchemy models and an initial PostgreSQL/PostGIS migration.
2. Add Open-Meteo current, hourly, daily and archive clients with timeout, bounded retry, cache, provider-error propagation and observation persistence.
3. Add standards-based derived heat index using valid temperature/humidity pairs; unavailable inputs produce unavailable metrics.
4. Implement authenticated sensor ingestion and idempotent reading storage.
5. Implement authentication, role checks, rate limiting, CORS, consistent errors and health/status endpoints.

## Phase 3 — Real ML

1. Retrieve archive data through the reproducible ingestion CLI/workflow and record retrieval metadata.
2. Validate units, ranges, duplicates, coordinates and timestamps.
3. Create lag/rolling/calendar features without future leakage.
4. Compare Linear Regression, Random Forest and Gradient Boosting using a chronological holdout.
5. Train a heat-wave classifier using an explicit research-label configuration and class-imbalance handling.
6. Persist selected models, evaluation metrics and feature metadata. Predictions are served only from a loaded artifact.

## Phase 4 — Decision and geospatial services

1. Apply shared configurable heat-risk rules to current conditions.
2. Add measured sensor and model-inferred regional hotspot analysis with explicit evidence types.
3. Generate rule-based safety, energy and water recommendations from current conditions.
4. Connect an OpenAI-compatible chat provider only when server-side credentials exist; preserve deterministic emergency guidance and a clear unavailable state otherwise.

## Phase 5 — Frontend migration

1. Rebuild legacy dashboard concepts as accessible React components backed by APIs.
2. Add the complete module navigation, Chart.js forecasts/trends and Leaflet regional maps.
3. Replace random heatmaps and scripted chat with source-backed history and real provider states.
4. Persist accounts, profiles, mission completion and feedback through backend APIs.

## Phase 6 — Verification and deployment

1. Run backend, ML, IoT and frontend unit/integration tests.
2. Exercise provider outages, stale cache, disconnected sensors and absent AI credentials.
3. Build the frontend and check the FastAPI OpenAPI schema.
4. Supply PostGIS Compose configuration, deployment manifests and setup/runbooks.
5. Verify hosted deployments only after real hosting credentials and URLs exist. Hardware verification requires a physical ESP32/DHT22.

## Compatibility mapping

| Legacy element | Replacement |
|---|---|
| Static alert | Current provider/ML/risk-backed alert with timestamp and safety action |
| Metric cards | Source-aware cards including unavailable and stale states |
| Hardcoded forecast | Provider forecast and separately labelled ML prediction |
| Region cards | Coordinate-backed region API and Leaflet map |
| Random historical cells | Aggregated stored observations only |
| Fixed chat reply | Secure server-side AI connector with honest unavailable/fallback states |
| Checkbox missions | Authenticated, idempotent persistent mission completions |
| Placeholder map | Leaflet with regional risk, hotspots and verified facilities |

No destructive migration of the existing checkout is needed because it contains no application files.
