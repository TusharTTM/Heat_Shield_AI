# Simplified disconnected preview

HeatShield AI is a five-section static website with **no API connections**. GitHub Pages deployment remains supported at **https://tusharttm.github.io/Heat_Shield_AI/**.

> **Deployment status:** the November 2026 product-review improvements and follow-up visual refinements are deployed. The latest interface commit is `99267aa`, including the cool-neutral design system and reorganized Safety hierarchy; GitHub Actions run `42461524691` succeeded. See [`PRODUCT_REVIEW.md`](PRODUCT_REVIEW.md) for the baseline inventory, local evidence, and earlier public verification.

## Working locally and on static hosting

- **Home:** four essential demo weather/risk cards, one consistent calculated heat index, a numeric risk explanation, deterministic offline safety guidance, and six fixed example-day forecast points.
- **Forecast:** one accessible Chart.js maximum-temperature line, five exact dated cards, full-date tooltips, source/freshness disclosures, and hottest-demo-day highlighting.
- **Risk Map:** seven Leaflet circle markers and seven equivalent location buttons. Marker or button selection updates the summary and persists the region when browser storage is available. Popups stay in view and remain closable after zooming.
- **Safety Tips:** selected-location risk guidance, five practical cards, NWS source links, emergency cooling guidance, and a `tel:112` link for India.
- **About:** short project explanations, explicit weather/AI/sensor statuses, browser-local storage limits, and the reason no alert preferences are offered.
- **Navigation:** exactly five main links, a responsive mobile menu that also closes on same-route selection, Escape handling, a main-focus skip link, and a working not-found page.

Legacy `/weather`, `/risk`, `/assistant`, and other retired URLs redirect to the closest simplified destination. They do not expose duplicate modules.

## Data boundaries

Environmental values are fixed local fixtures in `frontend/src/data/preview.ts`, timestamped **2026-05-15T09:30:00Z**. They are not random, fetched, current observations, official alerts, or trained-model outputs. The interface identifies the source as **bundled HeatShield AI demo fixtures**, displays the example time, says **Not current weather**, and directs users to official local weather for decisions.

“Feels like” and risk use the same heat index calculated from each fixture’s temperature and humidity. The product review removed separate unsupported apparent-temperature fixtures that disagreed with that calculation. Temperatures, humidity, conditions, identities, coordinates, forecast values, and risk boundaries were not changed. The exact before/after derived values are documented in `PRODUCT_REVIEW.md`.

The underlying NOAA/NWS-style heat-index calculation and five screening bands are retained. The interface combines the underlying High and Severe bands into **High**, producing four display levels: Low, Moderate, High, and Extreme. See `shared/risk_thresholds.json`.

Home, Map, and Safety recommendations are deterministic local text rules. **AI is not connected and no recommendation is represented as AI-generated.** General safety content and sources are centralised in `frontend/src/data/guidance.ts`. IoT sensors, live weather, remote persistence, geolocation, alert delivery, historical observations, and trained-model inference remain unavailable. No credentials are required for this static demo; real integrations require separate configuration and verification.

## Offline map asset

The map makes no tile requests. It bundles a 1:110m India boundary extracted from **Natural Earth** (`nvkelso/natural-earth-vector`, public-domain Natural Earth data) in `frontend/src/data/india-outline.json`. This is a bundled static geometry asset, not a geospatial service. Marker coordinates are reference data; heat values are demo fixtures.

## Commands

```bash
cd frontend
npm ci
npm run dev
npm test
npm run build
npm audit
```

For a GitHub Pages-subpath check, build sequentially rather than running two builds into one `dist` concurrently:

```bash
cd frontend
GITHUB_PAGES=true npm run build
cp dist/index.html dist/404.html
touch dist/.nojekyll
GITHUB_PAGES=true npm run preview
```

## Current verification summary

- **27/27 tests passed**; default and GitHub Pages-subpath strict builds passed; npm reported **0 vulnerabilities**.
- Real Chromium checks covered every active section at desktop and mobile sizes, keyboard flows, all seven location choices and buttons, browser-local reload persistence, full-date chart tooltip, all 17 legacy redirects, not-found recovery, and reduced-motion emulation.
- Desktop/mobile axe scans reported **0 violations** and responsive checks found no horizontal overflow.
- The offline map rendered seven markers with zero tiles. Delhi marker selection, zoom in/out, visible popup close, and actual popup closing passed.
- The production-subpath artifact returned **HTTP 200 for all five active routes**, with no failed assets, runtime errors, or external requests.
- The NWS heat-index, heat-safety, and heat-illness source pages were retrieved successfully for guidance review. The telephone link was inspected but no call was placed.
- Hosted Chromium navigation remains blocked by `ERR_CONNECTION_CLOSED`. Public route, content, and asset retrieval is verified, but hosted interactive browser behavior is not claimed.

Deployment run `42461524691` succeeded for overall visual-refresh commit `99267aa`, with job `128671634252`. All five public routes were subsequently retrieved with the original Safety guidance preserved, and the new `index-Yplkyw57.css` production asset was publicly reachable. This verification confirms the deployed static content and visual asset, not hosted interactions.

Earlier deployment run `42458701632` succeeded for UI refinement commit `c835715`, with job `128663119296`. All five public routes were retrieved, and the `index-DMhyTUsC.css` production asset was publicly reachable.

Earlier deployment run `42454912468` succeeded for product-review commit `5d86a3f`, with job `128651762942`. All five public routes were retrieved with the updated content; `/weather` and `/assistant` also resolved to their updated destinations. The simplified deployment run `42411125811` succeeded for commit `2d72e51`.

These checks verify the disconnected static preview only. They do not verify physical sensors, remote persistence, trained models, live providers, notification delivery, production backend connectivity, or manual screen-reader behavior.
