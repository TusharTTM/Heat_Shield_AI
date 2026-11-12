# Technical audit — HeatShield AI

**Audit date:** 2026-11-07  
**Target checkout:** `TusharTTM/Heat_Shield_AI` at `8d799d7`  
**Published legacy source:** `hsawant602-debug/Heat-Wave-Prediction-Software` (`main`, three static files)

## Current repository

The target repository contained only `README.md` (`# Heat_Shield_AI`). There was no frontend build, backend, database schema, model artifact, test suite, IoT firmware, or deployment configuration to preserve in this checkout.

The separately published legacy GitHub Pages site was audited through the public GitHub API. It consists of:

| File | Approximate size | Responsibility |
|---|---:|---|
| `index.html` | 31 KB | Single dashboard, metric cards, charts, region cards, recommendations, missions, heatmap and chat markup |
| `style.css` | 21 KB | Responsive visual styling |
| `script.js` | 12 KB | Chart.js configuration and browser-only interactions |

GitHub Pages is enabled on the legacy repository root and HTTPS is enforced.

## Useful functionality to retain

- HeatShield AI identity and urban-heat positioning.
- Mumbai, Thane, Navi Mumbai, Pune, Delhi and Ahmedabad regional context. South Mumbai is added as requested.
- At-a-glance environmental metrics, seven-day charts, regional comparison and safety actions.
- Hydration, cooling, energy/water conservation and community-mission concepts.
- Chart.js as the charting library and a responsive dashboard layout.
- General heat-safety guidance, after review and clear non-diagnostic wording.

## Material defects and gaps

1. **Hardcoded environmental values:** temperature, heat index, humidity, UV, AQI, wind, heat risk and regional values are not provider-backed.
2. **Fabricated visual variation:** the historical heatmap uses `Math.random()`; it cannot be represented as historical analysis.
3. **Scripted assistant:** chat uses a timeout and a fixed “Severe” response, with user text inserted through `innerHTML` (also an XSS risk).
4. **No ML:** the forecast is labelled AI without a trained model, validation, metadata or prediction endpoint.
5. **No persistence:** missions are checkboxes; location selection only logs to the console.
6. **Incomplete controls:** the map button displays a placeholder alert; several controls have no operational backend.
7. **No source semantics:** values lack traceable observation timestamps, units, provider status and stale/error states.
8. **Missing services:** no API, authentication, authorization, database, sensor ingestion, geospatial store, notification persistence or administration.
9. **External CDN dependencies:** fonts, icons and Chart.js are loaded from CDNs without local build pinning or integrity metadata.

## Current implementation boundary

Following the audit, the user requested a design-focused continuation and then explicitly paused all API connections. The delivered phase is therefore a frontend-only, disconnected preview. The target architecture below remains a long-term plan, not a description of deployed functionality.

## Target architecture decision

Build a modular React + TypeScript frontend and FastAPI backend in this repository. Use SQLAlchemy with PostgreSQL/PostGIS in production and SQLite only for local development/tests. Store provider observations, forecasts, predictions and sensor measurements as separate record types. Use versioned scikit-learn artifacts trained from source-backed historical observations.

Open-Meteo requires no secret for basic weather/archive access. AI chat and hosted PostgreSQL require external credentials and therefore remain explicitly unavailable until configured; neither is emulated.

## Data and safety constraints

- No legacy hardcoded values will be imported as observations.
- No random weather, hotspot, sensor or accuracy data will be generated.
- Cached values retain original source timestamps and are marked stale.
- A sensor with no authenticated readings is disconnected.
- Heat-risk thresholds are configuration, not universal medical or official warning thresholds.
- Heat-wave labels are research labels derived from documented configurable rules, not official IMD declarations.
- Unverified community reports never become confirmed hotspots.
- Cooling/emergency facilities are shown only when a source and verification date are present.
