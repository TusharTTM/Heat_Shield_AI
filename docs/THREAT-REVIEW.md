# Threat review — Heat Shield

Run against the `0security` threat-hunting skill library (0sec-labs/0security,
MIT/Apache-2.0) on 2026-11-23, at commit `5e86ea5` (the deployed build).

## How this was run, and what is limited

`0security` is an agentic scanner: its `0 scan` command drives a model provider
to apply its skill playbooks to a codebase. **It could not be executed here.**
Three hard blockers, each verified rather than assumed:

1. The release binary is served from `objects.githubusercontent.com`, which this
   sandbox cannot reach (HTTP 000). The repo's `install.sh` fetches the same
   host, so the installer fails too.
2. Building from source needs Node >= 24; this sandbox has 22.22.3.
3. `0 scan` requires a configured model provider (`OPENAI_API_KEY` or an
   equivalent). No key is present and none should be pasted into a chat.

So the review below is **the skill library applied by hand**, not a scanner run.
That is a real limitation and the confident claims are separated from the
weaker ones: every "no finding" statement names the file and the check that
produced it, so it can be re-run or disputed.

The playbooks used, from `packages/engine/src/agent/skills/`:
`ssrf-bypass`, `command-injection`, `structural-sqli`, `path-traversal`,
`llm-insecure-output-handling`, `llm-prompt-injection`,
`llm-excessive-agency`, `dependency-reachability`, `artifact-scan`.

Regression baseline: backend `pytest` **117 passed**, frontend vitest **236
passed / 3 skipped**.

## Attack surface

Public, statically hosted SPA (GitHub Pages) that calls Open-Meteo directly from
the browser, plus an optional FastAPI backend that is **not deployed** by any
workflow (the Pages build passes an empty `VITE_API_BASE_URL`, so the official
panels and assistant render "not configured"). 28 API routes, one authenticated
write path (`POST /api/v1/sensors/readings`).

## Findings

### F1 — No security headers on the deployed site (low, accepted risk)

`frontend/index.html` declares no CSP, `referrer-policy`, or
`permissions-policy`. GitHub Pages does not let you set response headers, so
this cannot be fully fixed without moving the host.

Mitigating facts, all verified:

- No third-party scripts, no analytics, no CDN. The only `<script>` is the app's
  own entry point. Fonts are self-hosted via `@fontsource`.
- No `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`, no `new Function`
  anywhere in `src/` — so DOM XSS has no sink to reach even without a CSP.
- All external links that carry a URL from data go through `httpsUrl()` in
  `api/official.ts`, which rejects any non-`https:` scheme.
- React escapes `{message.content}` in `Assistant.tsx:169`; model output is
  rendered as a text node.

**Action taken:** a `referrer-policy` meta tag, because the URL genuinely leaks
otherwise. The app asks Open-Meteo for a city's coordinates, so the document URL
contains a location; with the default policy a cross-origin request would send
the origin (not the path), and a strict policy removes even that. `frame-ancestors`
and `X-Frame-Options` cannot be set by meta tag, so they remain unfixed.

### F2 — Redirect following is correctly scoped (no finding)

`http_client.py` defaults to following redirects, which applied naively is the
classic SSRF redirect bypass. Each client that needs otherwise opts out through
the mixin's `_follow_redirects` class attribute, and I verified the mixin
actually passes it to `httpx.Client(follow_redirects=...)` rather than ignoring
it:

| Client | Carries a credential? | `_follow_redirects` | Verdict |
| --- | --- | --- | --- |
| `cpcb` (data.gov.in key) | yes | **False** | correct |
| `sachet` | no | **False**, plus an explicit `300 <= status < 400` rejection | correct |
| Open-Meteo weather/air | no | True | fine — no credential to leak |

No request URL is built from user input anywhere: every base URL comes from
`config.py`, and every path segment is either a region slug resolved against the
fixed region list or a `device_id` constrained to `^[A-Za-z0-9_-]{3,64}$`. So
there is no attacker-controlled URL to redirect in the first place.

### F3 — Model output has no downstream sink (no finding)

`llm-insecure-output-handling` asks for the sink, not the text. The assistant
backend (`assistant.py`) sends messages to an OpenAI-compatible endpoint and
returns `response.json()["choices"][0]["message"]["content"]` as a **string**.
There is no tool use, no function calling, no SQL, no shell. `assistant.py`
contains no `tool`, `exec`, `eval` or `subprocess` reference at all. So
"model writes something dangerous" cannot escalate to an action here.

### F4 — Prompt injection is present but bounded (low, by design)

`llm-prompt-injection`: the app deliberately feeds weather and alert context
into the prompt (`build_provider_messages`). An attacker who controls an
upstream CAP document could inject instructions. The blast radius is bounded by
F3 — the model can only produce text — and the UI labels the assistant's output
as model-generated. Not fixed; recorded as a known property.

### F5 — Secrets: clean, including history (no finding)

- No hardcoded credential in the working tree (`grep` over `.py`, `.ts`, `.tsx`,
  `.yml` for key/token/secret/password assignments, excluding tests and
  placeholders).
- No added `.env`/`.pem`/`.key` in any commit's history.
- `.env.example` documents that `DATA_GOV_IN_API_KEY`, `ASSISTANT_API_KEY`,
  sensor keys and DB passwords must never be `VITE_*` values. The deploy passes
  exactly one variable, `VITE_API_BASE_URL`, from a non-secret repo variable.
- `cpcb.py` is the only client that sends an API key, and it disables redirects.

### F6 — Injection and traversal (no finding)

- No raw SQL string building. The only `text()` call is `text("SELECT 1")` in a
  health check; everything else goes through SQLAlchemy ORM expressions.
- Path traversal: no filesystem path is built from request data. The only file
  reads are fixed paths under `shared/` and the model metadata path from config.
- `device_id` and all numeric fields are constrained by Pydantic; the assistant
  request forbids extra fields and caps lengths (4000 chars per message, 40
  messages, 30 context items).

### F7 — Sensor auth is correct (no finding)

`require_sensor_key` fails closed when no key is configured (503), and compares
with `hmac.compare_digest` (constant time), returning 401 with
`WWW-Authenticate` otherwise. Both write and read paths require it.

## What I did not cover

- The two browser-driven scanners (`gitleaks`, `trivy`, `osv-scanner`, Semgrep)
  were not run: none is installed and the image has no network to fetch the
  trivy/osv databases. **Dependency CVEs are therefore unchecked** — that is the
  most significant gap in this review and it needs a machine with network.
- No dynamic testing. Nothing was fuzzed or probed against a running instance.
- `backend` is not deployed by any workflow, so its findings are latent rather
  than live.
