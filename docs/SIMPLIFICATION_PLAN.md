# HeatShield AI simplification plan

## Product boundary

Reduce the active product to five destinations: Home, Forecast, Risk Map, Safety Tips, and About. The existing `/maps` and `/safety` URLs remain unchanged; legacy routes redirect to the closest relevant destination rather than breaking previously shared links.

This remains a disconnected static preview. Do not add weather, AI, database, IoT, map-tile, or other API connections. Fixed local values must remain visibly labelled as demo data. Safety recommendations are deterministic offline guidance, not AI-generated output.

## Preserve and reuse

- Existing React, TypeScript, Vite, Chart.js, Leaflet, and Lucide dependencies.
- NOAA/NWS heat-index calculation and configured regional coordinates.
- Fixed regional weather and forecast fixtures with their original timestamp.
- Browser-local region selection and the seven selectable locations.
- Offline map rendering with no tile provider; add only a bundled public-domain India outline for geographic context.
- Emergency guidance and the India 112 telephone link.
- React Router subpath handling and the existing GitHub Pages workflow.

## Simplify

- Replace the grouped sidebar and technical top bar with one responsive five-link navigation bar and one location selector.
- Replace the crowded dashboard with four weather/risk cards, one offline safety recommendation, and a compact today forecast.
- Replace the seven-day multi-series chart and filters with one five-day maximum-temperature line chart and a hottest-day warning.
- Remove map layers, hotspot simulations, search, technical coordinates, and comparison tables. Keep marker selection, location buttons, a three-colour legend, and one selected-location summary.
- Replace long safety and architecture pages with practical safety guidance and short About paragraphs.
- Retire unused routes, components, local missions, profiles, settings, downloads, and dormant administrative features after their replacements are tested. Git history retains the previous implementation.

## Display rules

- Keep the underlying five heat-index bands for transparent calculations.
- For the simplified interface, display Low, Moderate, High, and Extreme; combine the underlying High and Severe bands as High.
- Use green for Low, orange for Moderate/High, and red for Extreme on the map.
- Use readable body text, large values, warm accents, rounded cards, restrained shadows, and reduced-motion-aware transitions.

## Verification

- Rewrite unit and workflow tests for the five-section product, redirects, region persistence, forecast, navigation, and safety actions.
- Run strict TypeScript, production builds, and dependency auditing.
- Check every active route and legacy redirect in Chromium, all navigation and location controls, the chart, marker and button map selection, mobile menu, and emergency link.
- Audit mobile layouts at 320, 390, 768, 1024, and 1440 CSS pixels, keyboard/accessibility behaviour, runtime errors, and external requests.
- Deploy through the existing GitHub Pages workflow and verify the public homepage and direct routes after deployment.
