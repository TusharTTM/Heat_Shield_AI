# HeatShield AI design system

## Direction

HeatShield AI is an instrument for a public heat emergency. The governing image is the **instrument panel and the printed heat advisory**: warm paper stock under a dark film, brass signal lamps, a ruled masthead. Heat is warm, so a cool blue-grey chrome fights its own subject; the ramp is tinted warm and the one signal colour is a light brass.

A visitor should know the current heat, the risk state and the next safety step within ten seconds. The chrome stays quiet and the colour is spent on the one thing that matters: the verdict plate, whose top rule takes the hazard colour.

The system is **Kiln** (v4.0.0, advisory genre, app-screen scope). Every section is separated by a rule and nothing glows: depth comes from surface steps and hairlines.

## Foundations

- **Typography:** Oswald for display and the wordmark; Archivo for body, labels and controls; Archivo Narrow with tabular figures for measurements. Weights are 400, 500 and 600 only — hierarchy comes from size and colour, never from 700+. Sentence case everywhere: no tracked capitals on labels, headings or buttons. Small text (under 20 px) carries zero or slightly positive tracking, never negative.
- **Colour:** warm graphite surfaces — paper `oklch(16.5% 0.012 72)`, plate `oklch(23.5% 0.013 72)` — under warm off-white ink `oklch(96.5% 0.012 85)`. One signal colour, a brass at `oklch(84% 0.14 50)`, held to a few percent of a screen: the primary action, the current selection, the word "Heat" in the wordmark. Every colour resolves through a token in `src/styles/tokens.css`; no literal colour appears outside it.
- **Hazard ramp:** four states, each its own hue family and spread across the warm wheel so no two read alike — low mint `oklch(78% 0.15 152)`, watch chartreuse `oklch(86% 0.15 118)`, warning ember `oklch(68% 0.17 32)`, severe crimson `oklch(62% 0.19 12)`. Each fill carries plate ink at 4.8:1 or better. The accent is chosen at hue 50 so the nearest hazard sits 14.8 ΔE away in OKLab: the accent is never mistaken for a hazard, and the hazards are never mistaken for each other.
- **Contrast:** measured against the surface each value actually sits on, and asserted in `src/test/contrast.test.ts` rather than trusted to a comment. Ink 17.4:1 on paper, 16.0:1 on paper-2, 15.1:1 on plate; `ink-2` 13.6 / 12.6 / 11.8; muted 8.2 / 7.5 / 7.1; accent text 13.1 / 12.0 / 11.3.
- **Shapes:** radius follows size, so nothing is a pill by habit — 6 px on small tags and icon tiles, 10 px on controls, 14 px on plates, and the full pill only where the element really is one (a switch track, a chip, a toast). Depth is a hairline of light on the top edge plus one neutral drop; there are no coloured halos and no shadows under text.
- **Texture:** none. The grain overlay was removed: a noise film over a system UI reads as a filter on a photograph, not as material.
- **Spacing:** one 4 px scale (`--space-1` to `--space-12`); nothing off it, except values that exactly centre something against a fixed-size icon.
- **Icons:** one Lucide set at two sizes — 16 px inline with text, 18 px in controls — with no per-icon stroke overrides and no colour of their own; they take their text role. Three named exceptions exist for illustration and brand weight (a 52 px assistant mark, a 28 px avatar glyph, a 22 px card header and brand mark).
- **Motion:** one easing curve (`--ease-out`) and one duration ladder. No overshoot, no spring, no growth on hover: hover is a colour or surface change, press is a small scale down. Never `transition: all`, never width, height, top or left. `prefers-reduced-motion` removes every non-essential transition and the loading sweep.

- **Risk display:** Safe, Watch, Warning and Severe map onto low, moderate, high and extreme. The underlying high and severe heat-index bands combine as Warning in the simplified interface. No state is ever conveyed by colour alone: every badge carries its word, and every band carries its range in text. Each risk surface carries a 3 px state rule — the signature detail — coloured by level.
- **Map colour:** the same ramp as the badges. Location buttons state the city and its level in text.

## Components

The live shell is the dashboard, the assistant, the metric detail view and the profile. Every other route is retired and redirects to the dashboard with a notice.

- The dashboard masthead: mark, wordmark, Notify and Profile. The city picker drops to its own row beneath, where it reads as page context rather than as page furniture.
- The verdict plate carries the primary hazard, one plain-language reason, and the two-part source split (official NDMA SACHET status versus Open-Meteo/CAMS screening). Its 3 px top rule takes the hazard colour; that rule is the signature detail.
- Early warnings and the day planner sit in one "coming up" section, ahead of the readings, because "what do I do next" outranks "what is it now".
- Readings are delivered as one grid of metric tiles, each linking to its detail view. Charts live in the detail view, never on the dashboard.
- The assistant is a chat surface with a history drawer, a composer, and a visible privacy note naming exactly what leaves the device.
- The profile holds identity, units, language and alert settings; every destructive action names its scope in the label.

## Action-focused Dashboard

The dashboard is ordered around one question — "what should I do right now?" — and pushes technical depth to labelled secondary surfaces.

- **Verdict plate:** selected city and state, primary hazard, one risk level with a plain-language reason, and a two-part source split (official NDMA SACHET CAP status versus Open-Meteo/CAMS screening). Unassessed inputs always surface a missing-data notice; an absent feed is never rendered as "Safe". Its 3 px top rule carries the hazard colour.
- **Primary hazard selection:** the risk shown is the higher of the deterministic shade heat index and the modelled US/European CAMS AQI. Ties and both-Low cases state both hazards rather than implying a clean all-clear.
- **Coming up:** early warnings plus the day planner, in one section above the readings, because the next step outranks the current reading.
- **Readings grid:** metric tiles for temperature, heat index, humidity and UV, each opening its own detail view. Charts live in the detail view only, so the dashboard stays a decision surface.
- **Suggestions:** condition-specific precautions as checkboxes, each with its explanation behind a per-item disclosure that sits beside the label rather than inside it, so expanding never toggles the task.
- **Ordering:** verdict → coming up → readings → suggestions. Desktop and phone share that DOM order; nothing is reordered visually with `order`.

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
- Every interactive control clears 44 px, including icon-only closes; adjacent icon rows keep an 8 px gap. Narrow screens never shrink a target below the floor.
- Landmarks and headings are labelled, the mobile menu closes on same-route selection and Escape, and the skip link focuses the main landmark.
- Layouts are checked at 320, 390, 768, 1024, and 1440 CSS pixels.
- One easing curve for the whole interface. No spring, no overshoot, no hover growth; press is a small scale down.

## Verification

What was actually run, and what was not.

**Run and passing**
- `tsc -b` clean; **140 Vitest tests across 19 active test files** pass, with 3 live-API tests skipped without network access.
- Default and `GITHUB_PAGES=true` production builds succeed.
- `sloplint` (Hallmark v2.0.0, editorial genre) over the three stylesheets, `tokens.css`, `base.css` and `index.css`: **0 FAIL, 0 REFLEX, 0 WARN** — down from 259 FAIL, 356 REFLEX and 15 WARN before the redesign.
- Scope of that number, stated plainly: the 0/0/0 applies to CSS. The same checker run over `src/**/*.tsx` reports 53 FAILs — em-dashes in copy, `section-label` eyebrows above headings, nested card classes, and two long link labels. Those are markup-craft findings, not layout defects, and every page of the redesign deliberately uses the editorial eyebrow as its section marker. They are recorded here rather than silently suppressed; the CSS gate is the one this project holds at zero.
- `uiReview.test.tsx` (11 cases) pins the six reported defects one by one, so a regression fails a test instead of surfacing in a screenshot review nobody can run: one screening vocabulary, one statement per AQI index, a Risk Map that names only what it assesses, an in-flow map inspector, one hottest-day announcement, and loading placeholders that cannot be read as results.
- The real-browser workflow runs the live Open-Meteo and CAMS responses through the new stylesheet and passes every assertion: every route navigated by clicking the actual masthead links, the city picker exercised, and the responsive forecast checked at 390 and 1440 px. Historically this is the check that caught three defects a jsdom suite cannot see — a header row that let the city picker cover the About link, a picker name/state pair that ran together, and panels that animated while being clicked.
- `contrast.test.ts` computes every text/surface pair from the tokens themselves in OKLab, and its checks were verified to fail on the earlier values: the first accent text only reached 3.30:1 on paper and 2.76:1 on the band, which is a WCAG failure for the link text used throughout the site.
- A new `design-system.test.ts` locks the system: no undeclared custom properties, no colour literal outside the token block, no `transition: all` or animated layout properties, no tracked-capital labels, `overflow-x: clip` on both `html` and `body`, no `100vw`, the four risk states present, reduced-motion and visible-focus fallbacks, and the Formwork faces with no framework default as display.

**Not run, and why**
- No screenshot or render-tier review locally: the sandbox has no Chromium and the browser download CDN is unreachable. Layout was reasoned from the stylesheet, the unit suite and the CI browser run rather than observed on this machine. Contrast and the hazard ramp were computed numerically in OKLab rather than eyeballed, so no screenshot was needed to confirm a ratio.
- No visual judgement of the page as a picture: the CI run proves the DOM, the geometry and the interactions, not that it looks good. That still wants a human eye.
- The unhappy paths are covered by `appStates.test.tsx`: the error state renders as an alert that names the place, states the failure and offers a real retry button while never presenting a substituted number as live; the loading state announces itself as a status rather than an alert and names the place; and every state container is asserted to carry a visible border and padding, so an edge case never renders as a bare unstyled block. Stale-cache and missing-input states remain covered by their existing suites.

These results cover local development and production builds, not a new hosted deployment. Weather and air-quality values come from Open-Meteo/CAMS model endpoints; IoT sensors, official SACHET CAP feeds, CPCB stations and any AI/ML predictions remain unconnected in the static build.

## Web Interface Guidelines

The site is reviewed against Vercel's [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) (pinned `434b7f9`), installed as the `web-design-guidelines` skill in `.agents/skills/` and refreshed with `npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines`.

Two suites hold the machine-checkable half of it, so a rewrite fails a test instead of drifting:

- `src/test/webInterfaceGuidelines.test.ts` (source): no click handler on a `div`/`span`, decorative icons hidden, every control labelled, `…` not `...`, placeholders end in `…` and name an example, no paste blocking, no zoom disabling, preconnect to the reading origins.
- `src/test/design-system.test.ts` (CSS): `color-scheme` and `theme-color` agree with the canvas, a global `:focus-visible` ring exists, no unstyled `outline` removal, reduced-motion honoured, no `transition: all`, `touch-action: manipulation` on controls, safe-area insets on full-bleed fixed surfaces, `overscroll-behavior: contain` in overlays.

**Deliberate exceptions**, each pinned in the test rather than suppressed:

- Three rules set `outline: none`: `.page-content` (a scroll target for the skip link, not a control), `.city-picker-search input` and `.assistant-prompt`. The last two move the ring to their parent's `:focus-within`, which the test also asserts exists.
- The city picker keeps its open state in `useState` rather than the URL. It is a transient popover over a grid of links, and a querystring would add history entries for a control the user dismisses with Escape or an outside press. Selection itself is persisted (`hs-region`), so the state that matters survives a reload.
- The avatar `<img>` carries no `width`/`height` attributes because the container is a fixed 72 px square with `object-fit: cover`; there is no layout shift to prevent.

**Not verified here:** the guideline's rendered-page items (hover contrast, sticky-header occlusion, real focus-ring geometry) need a browser. CI's Chromium pass covers navigation, the picker and two viewports; the sandbox cannot download Chromium.

## UI/UX Pro Max review

A second pass used `ui-ux-pro-max` (`.agents/skills/ui-ux-pro-max`, installed from `nextlevelbuilder/ui-ux-pro-max-skill`), which scores interfaces against ten weighted categories — accessibility and touch first.

**What it changed.** The audit found one systemic defect rather than a set of opinions: touch targets were sized for a mouse. Chat-history row actions were 28 px, the settings segmented control 34 px, five icon-only close buttons 26–36 px, and the primary button, icon-text button, profile button, city-picker trigger and settings rows sat at 38–42 px. Several mobile breakpoints then *shrank* already-small targets (`min-height: 40px` at narrow widths). Everything now clears 44 px, icon-only controls expand their hit area rather than their glyph, and adjacent icon rows moved from a 4 px gap to 8 px. Controls that had only a `:hover` style — chat actions, profile buttons, the settings switch — gained `:active` states, and hover tinting is dropped under `@media (hover: none)` where a tapped hover would stick.

**What it removed.** The dead-CSS scan it motivated found a retired 3D risk scene and several removed components still shipping ~160 lines of rules: `risk-scene-*`, `risk-level-guide`, `risk-threshold`, `risk-method-copy`, `official-sources-card`. With two empty `@media` blocks, that is −164 lines against +50.

**What it recommended and was refused.** `--design-system` returned a *light* palette (`#F8FAFC` canvas, `#1E40AF` primary), Fira Code / Fira Sans, and an enterprise gateway landing pattern. That conflicts with the dark theme this project documents, with `tokens.css` as the single source of every colour, and with `contrast.test.ts`, which computes each pair in OKLab. The skill's own contract says to verify fit for the product and to treat results as recommendations, so the palette and typography were rejected; the touch, feedback and dead-code findings were kept. A dark-first emergency dashboard is also not a B2B gateway, and the recommended landing sections (client logos, contact sales) have no meaning here.

**Guards.** `design-system.test.ts` now fails any control rule under 44 px, any icon row under an 8 px gap, and any hovered control without a pressed state; the live browser spec measures the real computed boxes, scoped to styled controls so inline prose links (a WCAG inline exception) are not penalised.

## Unslop review

A third pass used `unslop` (Damir Sokolovsky, CC BY 4.0; `.agents/skills/unslop`), which audits a screen for the tells of machine-generated UI and then fixes craft and copy without touching what the product is. Its audit of this site is in `docs/UNSLOP-AUDIT.md`.

**Verdict: light slop, leaning designed.** No emoji, no hue gradients, no gradient text, no glows on cards, one accent, one neutral ramp, no `transition: all`, no `hover:scale` on cards. The palette, type and layout were kept; the pass was craft, not a rebuild.

**Direction.** `calm, exact, a little warm`. World: the instrument panel and the printed heat advisory. Signature: the 3 px hazard rule on the verdict plate. The chrome had been a cool cyan-grey, which fights the subject it warns about; the ramp is now warm graphite with a brass accent.

**The colour problem, and how it was solved.** Heat hazards occupy the entire warm wheel — amber, ember and crimson *are* the warning states. A warm chromatic accent therefore cannot coexist with them naively: the first candidate sat 4.1 ΔE from Warning, i.e. a primary button that read as a hazard. The accent was moved to `oklch(84% 0.14 50)` and the hazard hues were spread to 12/32/118/152, which puts every hazard at least 14.8 ΔE from the accent and at least 20 ΔE from each other. All five contrast gates in `contrast.test.ts` pass on the new values.

**What changed.** Type: sentence case everywhere (the global `h1`–`h4` uppercase rule is gone), weights capped at 600, tracked capitals removed from the wordmark, the loader and the two label roles, zero tracking under 20 px. Motion: the spring curve is gone, so is `scale(1.06)` on hover and the 4 px accent halo; one easing curve remains. Details: radius now follows size (6 tag / 10 control / 14 plate, pill only where the element is genuinely a pill), the grain overlay is removed, the coloured `--shadow-glow` became a neutral `--shadow-float`. Icons: 14 sizes collapsed to two tiers plus three named illustrative sizes. Type scale: eight one-off `rem` sizes — including 0.55 rem, under 9 px — moved onto the token scale. Copy: ~28 captions lost their trailing period while multi-sentence paragraphs kept theirs, "Rule-based safety suggestions" became "Safety suggestions", "AI Assistant" became "Assistant". Layout: the content cap widened from 1180 to 1440 px so the shell stops reading as a narrow centred column. Wordmark: the accent now falls on "Heat", so the brand never reads as "Shield"; its accessible name is a real `dash.brandName` key in all six languages instead of hardcoded English.

**Refused, with reasons.** No generated hero image (a dashboard's moment is its verdict plate, not a picture). No chart restructure (they already lead with one accent and carry a text fallback). No story video (not asked for). Safety copy untouched beyond its final period: the never-say-safe rule is a policy obligation locked by `i18n.test.ts`, and a trailing stop is not copy.

**Still open.** The audit is source-level: this sandbox had no browser, so composition and motion were reasoned from the rules rather than screenshotted. The judgement that survives that limit is the colour work, which is measured rather than seen.
