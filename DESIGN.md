# HeatShield AI design system

## Direction

HeatShield AI is a site-office instrument for a public heat emergency, not a dashboard. The governing image is poured concrete: a warm grey paper, near-black ink, condensed capitals, square cast edges and one safety orange. A visitor should know the current heat, the risk state and the next safety step within ten seconds. Everything is ruled, nothing is rounded and nothing is blurred.

The system is **Formwork** (Hallmark v2.0.0, editorial genre, app-screen scope). Two surfaces carry a full ink border — the verdict plate and the 3D stage — so a box keeps meaning something. Every other section is separated by a rule: a 3px ink bar across its top, hairlines inside.

## Foundations

- **Typography:** Oswald 700 capitals for display heads and buttons; Archivo 400/500 for body, labels and captions; Archivo Narrow 500 with tabular figures for measurements. Body is 16 px at 1.55 line height, page headings 32–40 px, and the verdict headline 32 px. Labels, captions, table heads and meta are the body face a step smaller, sentence case and untracked — the rule above them carries the hierarchy, never tracked capitals.
- **Colour:** warm grey concrete paper (`oklch(74% 0.008 80)`) under near-black ink (`oklch(18% 0.005 270)`), with raised plates at `oklch(86% 0.006 80)`. One signal colour, a safety orange at `oklch(66% 0.21 38)`, held under 5% of a screen: the primary button, the current selection, the focus ring. Every colour resolves through a token in `src/styles/tokens.css`; no literal colour appears outside it.
- **Hazard ramp:** four states, each a distinct hue family so no two read alike — Safe green `oklch(47% 0.10 158)`, Watch ochre `oklch(52% 0.11 86)`, Warning orange-brown `oklch(53% 0.16 50)`, Severe crimson `oklch(45.5% 0.185 18)`. Each fill carries plate ink at 4.8:1 or better, and neighbouring states sit 10.0–14.4 ΔE apart in OKLab. The ramp and the product accent sit 14.2 ΔE apart, so the accent is never mistaken for a hazard.
- **Contrast:** measured against the surface each value actually sits on, and asserted in `src/test/contrast.test.ts` rather than trusted to a comment. Ink 8.8:1 on paper, 7.3:1 on the ruled band and 13.1:1 on plate; `ink-2` 6.8 / 5.7 / 10.2; muted 6.0 / 5.0 / 9.0; accent text 5.4 / 4.5 / 8.1. The band value is the floor because accent text is used for body-size links.
- **Shapes:** radius 0 on every surface, control and chip. Concrete is cast against straight boards. Elevation is a rule, never a soft shadow; the only shadows are the 3px hard press on the orange primary and the emergency call.
- **Texture:** one fixed 64 px grain tile at 5% opacity under all content, which is what makes the paper read as poured rather than as a grey fill.
- **Spacing:** one 4 px scale (`--space-1` to `--space-12`); nothing off it.
- **Motion:** concrete does not move. Controls press in over 120 ms with cubic-out easing; menus and popovers fade and shift 4 px over 220 ms; the progress ring eases over 220 ms. One spinner. No entrance sequences, no parallax, no ambient loops, no pulsing dots. Only `transform`, `opacity`, colour and `box-shadow` transition — never `all`, never width, height, top or left. `prefers-reduced-motion` removes every non-essential transition and stops the spinner.

- **Risk display:** Safe, Watch, Warning and Severe map onto low, moderate, high and extreme. The underlying high and severe heat-index bands combine as Warning in the simplified interface. No state is ever conveyed by colour alone: every badge carries its word, and every band carries its range in text.
- **Map colour:** Safe green, Watch ochre, Warning orange-brown, Severe crimson, all from the same ramp as the badges. Location buttons state the city and its level in text.

## Components

- Four essential Home cards: current temperature, feels-like temperature, humidity, and heat risk.
- One deterministic safety recommendation with an explicit offline/not-AI label.
- One five-day Chart.js line with short axis labels, full-date tooltips and accessible text, exact daily cards, and a hottest-demo-day warning.
- An offline Leaflet map with a bundled Natural Earth outline, seven selectable markers, equivalent keyboard-accessible location buttons, refined zoom/popup controls, and popups kept in view after zooming.
- Location buttons invert to an ink fill with plate ink and a bold label in addition to `aria-pressed`; selection never depends on colour alone.
- Safety separates selected-location context from the unchanged primary recommendation, then places the heat-index explanation in a cool supporting strip. Five existing tips use a balanced three-plus-two desktop grid, two-column tablet layout, and single-column phone layout. The emergency panel has a clear red priority edge and full-width phone action; the three existing sources use a readable cool-toned list.
- Source notes sit on a hairline-ruled strip of `--paper-2` so provenance stays visible without competing with readings or safety actions.
- Persistent but concise demo messaging, original fixture timestamps, explicit “not current” freshness, and bundled-fixture attribution.

## Action-focused Dashboard

The Dashboard is ordered around one question — "what should I do right now?" — and pushes technical depth to labelled secondary surfaces.

- **Warning hero:** selected city and state, primary hazard, one risk level with a plain-language reason, an explicit `Updated … IST` time, and a two-part source split (official NDMA SACHET CAP status versus HeatShield Open-Meteo/CAMS screening). Unassessed inputs always surface a missing-data notice; an absent feed is never rendered as “Safe”.
- **Primary hazard selection:** the risk shown is the higher of the deterministic shade heat index and the modelled US/European CAMS AQI. Ties and both-Low cases state both hazards rather than implying a clean all-clear.
- **Stylized 3D stage:** a perspective `<canvas>` view of the bundled Natural Earth outline plus 15 configured city columns. Column height and colour encode the active layer only. Camera rotate/tilt/zoom work with pointer drag, toolbar buttons, and arrow/`+`/`-`/`0` keys on the focusable stage; the stage is labelled “Stylized 3D city-point view” and explicitly denies terrain or street-level precision.
- **Layer switch and selection:** `Heat risk` / `Air pollution` toggles reuse the same deterministic assessments as the rest of the site. Selecting a column (click or keyboard) updates the site-wide city, the inspector, and the key readings.
- **Text equivalent:** a `<details>` list of all 15 locations gives every reading as text, and a 15-marker SVG 2D fallback (button-per-city, Enter/Space selectable) renders automatically when canvas 2D is unavailable or sustained slow frames are detected, and can be toggled manually.
- **Tasks and progress:** up to three condition-specific actions, expressed as checkboxes. Task rows scan as title + severity badge + category tag, with each explanation behind a per-task "Why this helps" disclosure. That disclosure sits beside the checkbox label rather than inside it, so expanding an explanation never toggles the task. The checklist still states that completing tasks does not remove weather or air-quality risk. The progress ring and three rule-visible badges are derived only from today's checked tasks, scoped per city and per IST date in `localStorage`, with no points, streaks, or safety guarantees; badge rules stay on each badge and reappear in a "How badges and progress work" drawer.
- **Trimmed stage controls:** the toolbar keeps only essentials — zoom in/out, reset, the 2D/3D toggle and refresh. Rotate and tilt live in a labelled "Camera angle" disclosure that also states you can drag the map or use the arrow keys. Camera buttons ease to their target over ~260 ms with cubic-out easing and shortest-path yaw; direct pointer dragging bypasses the tween entirely, and reduced motion applies the target instantly.
- **Key readings:** exactly four cards (temperature, feels-like plus heat index, humidity, air quality). Wind, rainfall, daytime hours, upcoming signals, official panels, and source attribution live inside a collapsed `<details>` drawer.
- **Action-first ordering:** the warning hero comes first, then suggested actions and the task checklist, then the 3D stage, then preparedness progress. Desktop places the action column beside the wider stage using explicit grid placement — never visual `order` — so the DOM order that phones and screen readers follow is unchanged.
- **Mobile ordering:** on phones that order becomes a single column: risk → actions → checklist → stage → progress. The stage becomes a compact 290 px map so it stays easy to reach without pushing the checklist far down the page. The full 15-city text list and the 2D SVG fallback remain available at every width.
- **No duplicated readings:** the stage inspector names only the value that decides the selected column's colour (shade heat index, or the higher US/European AQI band). Temperature, feels-like, humidity and modelled AQI appear once, in the four key-reading cards.

## Progressive disclosure and disclaimers

- Source status is compact everywhere: each note shows the source, model time and last-updated time in one line, with the "what this is and is not" explanation in the note's own disclosure. Freshness and timestamps are never hidden.
- The global data-status banner keeps a one-line source status on every page; "What this data is not" opens a short, complete explanation of model limits.
- Repeated one-line disclaimers (for example the Safety Guide's scope statement) use an inline "＋" disclosure so the practical instruction stays first.
- Official-source panels lead with a compact status and the consequence that matters — an empty panel is never an all-clear — and fold the operator/self-hosting explanation into "Why official warnings are unavailable here".
- Warnings, missing-data notices, and freshness/staleness states are never moved behind a disclosure.

## Motion and accessibility

- Transitions are limited to 120–260 ms: presses land at 120 ms, menus and popovers at 220 ms, the progress ring at 220 ms, and the camera tween at 260 ms. The mobile menu has one short open transition; there are no page entrance sequences, continuous pulses, parallax effects, or animated numbers.
- `prefers-reduced-motion` removes nonessential transitions and chart/map animation, including the mobile-menu transition.
- Native links, buttons, and selects remain keyboard accessible with visible `:focus-visible` outlines. The header select also has a grouped focus treatment.
- Primary actions, menu controls, mobile navigation and city selectors provide 44–48 px touch targets; very narrow screens use a single-column city list. Dense controls in the stage toolbar never fall below 32 px with an expanded hit area.
- Landmarks and headings are labelled, the mobile menu closes on same-route selection and Escape, and the skip link focuses the main landmark.
- Layouts are checked at 320, 390, 768, 1024, and 1440 CSS pixels.
- The Dashboard 3D stage is a focusable region with a written keyboard contract (arrows rotate/tilt, `+`/`-` zoom, `0`/Home reset). Visitors who prefer reduced motion get no progress-ring transition, and the 2D SVG city view remains a fully keyboard-operable alternative to the canvas stage.

## Verification

What was actually run, and what was not.

**Run and passing**
- `tsc -b` clean; **140 Vitest tests across 19 active test files** pass, with 3 live-API tests skipped without network access.
- Default and `GITHUB_PAGES=true` production builds succeed.
- `sloplint` (Hallmark v2.0.0, editorial genre) over the three stylesheets, `tokens.css`, `base.css` and `index.css`: **0 FAIL, 0 REFLEX, 0 WARN** — down from 259 FAIL, 356 REFLEX and 15 WARN before the redesign.
- Scope of that number, stated plainly: the 0/0/0 applies to CSS. The same checker run over `src/**/*.tsx` reports 53 FAILs — em-dashes in copy, `section-label` eyebrows above headings, nested card classes, and two long link labels. Those are markup-craft findings, not layout defects, and every page of the redesign deliberately uses the editorial eyebrow as its section marker. They are recorded here rather than silently suppressed; the CSS gate is the one this project holds at zero.
- `uiReview.test.tsx` (11 cases) pins the six reported defects one by one, so a regression fails a test instead of surfacing in a screenshot review nobody can run: one screening vocabulary, one statement per AQI index, a Risk Map that names only what it assesses, an in-flow map inspector, one hottest-day announcement, and loading placeholders that cannot be read as results.
- One live-browser assertion is now stale by design, and it is the only failure in that workflow: `live-weather.spec.ts:308` expects `'Multi-hazard risk map for Bengaluru · HeatShield AI'`. The page title was renamed to "Heat and air-quality risk map for Bengaluru" because the map assesses exactly two hazards — the report's fourth defect was precisely that the old name promised more. The marker assertions (`.leaflet-interactive` fills) still pass: Maps still renders the Leaflet `RegionMap`. The spec is not edited to match; the assertion should be updated by its owner when the rename is accepted.
- The real-browser workflow runs the live Open-Meteo and CAMS responses through the new stylesheet and passes every stage up to the stale title assertion above: every route navigated by clicking the actual masthead links, the city picker exercised, and the responsive forecast checked at 390 and 1440 px. Historically this is the check that caught three defects a jsdom suite cannot see — a header row that let the city picker cover the About link, a picker name/state pair that ran together, and panels that animated while being clicked.
- `contrast.test.ts` computes every text/surface pair from the tokens themselves in OKLab, and its checks were verified to fail on the earlier values: the first accent text only reached 3.30:1 on paper and 2.76:1 on the band, which is a WCAG failure for the link text used throughout the site.
- A new `design-system.test.ts` locks the system: no undeclared custom properties, no colour literal outside the token block, no `transition: all` or animated layout properties, no tracked-capital labels, `overflow-x: clip` on both `html` and `body`, no `100vw`, the four risk states present, reduced-motion and visible-focus fallbacks, and the Formwork faces with no framework default as display.

**Not run, and why**
- No screenshot or render-tier review locally: the sandbox has no Chromium and the browser download CDN is unreachable. Layout was reasoned from the stylesheet, the unit suite and the CI browser run rather than observed on this machine. Contrast and the hazard ramp were computed numerically in OKLab rather than eyeballed, so no screenshot was needed to confirm a ratio.
- No visual judgement of the page as a picture: the CI run proves the DOM, the geometry and the interactions, not that it looks good. That still wants a human eye.
- The unhappy paths are covered by `appStates.test.tsx`: the error state renders as an alert that names the place, states the failure and offers a real retry button while never presenting a substituted number as live; the loading state announces itself as a status rather than an alert and names the place; and every state container is asserted to carry a visible border and padding, so an edge case never renders as a bare unstyled block. Stale-cache and missing-input states remain covered by their existing suites.

These results cover local development and production builds, not a new hosted deployment. Weather and air-quality values come from Open-Meteo/CAMS model endpoints; IoT sensors, official SACHET CAP feeds, CPCB stations and any AI/ML predictions remain unconnected in the static build.
