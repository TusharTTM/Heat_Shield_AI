# Unslop audit — Heat Shield

Audited with the `unslop` skill (Damir Sokolovsky, CC BY 4.0) on 2026-11-22.
Scope: the dashboard, assistant, metric detail, profile and the shared chrome.

**Method note.** This sandbox has no browser and no way to download one, so this
is a source-level audit: the rendered CSS, the JSX that consumes it and the
string table. Motion and composition findings are therefore reasoned from the
rules rather than screenshotted. Nothing here is a guess about what the markup
does — every line names the rule or file it came from.

## Verdict

**Light slop, leaning designed.** Most of what this skill hunts is already
absent, and absent deliberately:

- No emoji anywhere in the interface (checked every `.ts`/`.tsx`).
- No purple-to-blue or any hue-to-hue gradient: exactly one `linear-gradient`
  in the whole sheet, and it is a same-hue `color-mix` tint.
- No gradient text, no colored glows, no radial washes, no blobs.
- One accent (`--accent`, cyan), used sparingly; hazard colours are semantic.
- One tinted neutral ramp, three text roles, real measured contrast.
- No `transition-all`, no bouncy springs on layout, no `hover:scale` on cards.
- Every touch target clears 44px; focus rings are visible and tested.

So this is polish mode, not a rebuild. Fixes below are confined to what the
audit actually found, and the palette, type system, layout and voice stay.

## Signs found

### Type

| Sign | Where | Fix |
| --- | --- | --- |
| Uppercase display type as a global heading rule | `base.css:88-91` — `h1`–`h4` all `text-transform: uppercase` | Sentence case; let size and colour carry hierarchy |
| Uppercase tracked wordmark | `index.css:59-60` `.brand`, 0.01em tracking + uppercase | Sentence case wordmark, no tracking |
| Uppercase tracked placeholder text | `index.css:84-85` `.route-loading` | Sentence case (it is a sentence) |
| Uppercase 16px button labels | `index.css:165-167` `.button` | Sentence case, drop tracking |
| Weight 700 used as the default emphasis | 13 declarations; e.g. `.uploaded-alert h2`, `.dashboard-section-heading h2`, `.assistant-welcome h1` | 500/600; hierarchy from size + colour |
| A display condensed face on the body copy path | `--font-display: Oswald` on `.brand`, `.route-loading`, buttons, `.assistant-welcome h1` | Keep Oswald for large display only; body face elsewhere |
| Negative tracking on small text | `index.css:501` `.city-picker-heading h2` at `--text-lg` (19px) `-0.01em` | 0 under 20px |

### Motion

| Sign | Where | Fix |
| --- | --- | --- |
| Spring easing that overshoots | `--ease-spring` `cubic-bezier(.34,1.32,.64,1)`, used on `.assistant-send`, `.settings-switch-thumb`, a third control | One ease-out curve; overshoot is the "bouncy" tell |
| Grow on hover | `index.css:1198` `.assistant-send:hover` `scale(1.06)` + 4px accent ring | Colour/surface change on hover; press stays `scale(.97)` |
| Second ring-glow on focus | `.assistant-composer:focus-within` `--shadow-glow` | Border colour + the standard focus ring |

### Components

| Sign | Where | Fix |
| --- | --- | --- |
| Near-universal pill radius | 35 uses of `--radius-pill` | Radius by size: knob/pill only where it *is* a pill |
| Blurred colored halo as depth | `--shadow-glow` (cyan ring + 60px blurred shadow) on 4 elements | Hairline + surface step; keep the neutral `--shadow` |
| Grain overlay | `--grain` SVG turbulence at 2.5% over the whole page (`base.css:33`) | Remove; reads as a filter over a system UI |

### Copy

| Sign | Where | Fix |
| --- | --- | --- |
| Trailing full stops on short strings | `dash.lead`, `dash.suggestionsEmpty`, `retired.title`, `early.sourceNote`, 9 × `profile.*Desc`, 5 × `perm.*` etc. (~20 keys) | Drop the period on labels and one-line captions |
| Internal process word in a user-facing label | `dash.suggestionsKicker`: "Rule-based safety suggestions" | Say what it is, not how it is built |
| Assistant named by the model, not the job | `nav.assistant`: "AI Assistant" | "Assistant" |
| **Possessive name shortens to an insult** | `dash.brand` "Heat Shield" → `.brand strong` renders "Shield" in accent; `dashboard-brand` shortens the same way → "Shield" | Short name must never be a word on its own |

### Surfaces

| Sign | Where | Fix |
| --- | --- | --- |
| Chrome does not read like an instrument | Cool cyan-grey ramp, glass plate, grain, glow | Tint the ramp warm (the World below) and let the hazard ramp be the only saturated colour |

## Direction

- **Product.** A heat-health early-warning dashboard for people in Indian
  cities: current conditions, official warnings, a model-screened look at the
  next day, and a plan for the day — read in minutes, often in bright light.
- **Character.** `calm, exact, a little warm`. Not sunny, not clinical.
- **World.** The instrument panel and the printed heat advisory: warm paper
  stock under a dark film, amber and ember signal lamps, a masthead rule. Heat
  is warm; a cool blue-grey chrome fights the subject it is warning about.
- **Moments.** (1) The verdict plate — the one screen element that carries rich
  colour, its hue is the hazard level, its rule bar is the signature. (2) The
  hazard ramp in charts and the day planner, where colour *is* the meaning.
- **Signature.** A 3px state rule bar on the verdict plate, coloured by hazard
  level, repeated on every risk surface. It is already in the CSS
  (`--rule-bar`); this pass makes it the one deliberate detail rather than
  decoration.

## What this pass changes

Applied, because each is a sign above: sentence case, weight ladder, tracking,
spring easing, hover growth, focus glow, grain, pill radius on non-pills,
glow shadows, trailing periods, two labels, and the wordmark short name.
The ramp is retinted warm, which is the World decision and touches every
surface — done by changing token *values* only, so every existing rule keeps
resolving and `tokens.css` stays the only place colour lives.

Not done, and why:

- **No generated hero image.** Dashboards do not need one, and this product's
  "moment" is the verdict plate.
- **Charts are not restructured.** They already have one accent and a text
  fallback; the pass only tunes their grid and label weight.
- **No story video.** Not asked for.
- **Safety copy is untouched** beyond trailing periods: the wording carries
  medical and policy obligations (never call a lower-heat window "safe") and is
  locked by `i18n.test.ts`.
