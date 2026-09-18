# MikuHost-Api Test Report

Executed on September 18, 2026 in `ourin/mikuhost-api` (second verification pass after adding three new scraper plugins and expanding the API tester/documentation UI).

## Build

PASS — `npm run build` completed; TypeScript and Vite production bundles generated.

## Typecheck

PASS — `npm run typecheck` completed with strict TypeScript enabled.

## Health

PASS — `GET /api/health` returned HTTP 200 and `{ success: true, data.status: "operational" }`.

## Plugin Registry

PASS — `GET /api/plugins` returned HTTP 200 and seven registered metadata entries.

## Scrapers

| Plugin | Endpoint | Status | Response |
|---|---|---|---|
| TikTok | `/api/scraper/tiktok` | PASS | HTTP 200 with title, author, and download links using existing `src/scraper/tiktok.js` |
| Google Search | `/api/scraper/google-search` | PASS | HTTP 200 with ranked results using existing `src/scraper/google.js` (`GoogleSearch`) — verified in this pass |
| SoundCloud Search | `/api/scraper/soundcloud` | PASS | HTTP 200 with track list using existing `src/scraper/soundcloud.js` — verified in this pass |
| TempMail Create | `/api/scraper/tempmail` | PASS | HTTP 200 with a fresh disposable address using existing `src/scraper/tempmail.js` (`TempMailCreate`) — verified in this pass |
| YouTube | `/api/scraper/youtube` | FAILED / DISABLED | Existing upstream returned HTTP 502 from ssyoutube; adapter is retained but not advertised active |
| Instagram | `/api/scraper/instagram` | FAILED / DISABLED | Representative upstream returned HTTP 500; adapter is retained but not advertised active |

## AI Endpoints

| Provider | Endpoint | Status | Response |
|---|---|---|---|
| MikuHost | `/api/ai/mikuhost-chatgpt?text=...` | PASS | Real upstream GET returned HTTP 200 with JSON `status: true` and `result` |
| MikuHost | `/ai/deepseek?text=...` | FAILED | HTTP 500: `Failed to extract nonce` |
| MikuHost | `/ai/alisia?text=...` | TIMEOUT | Exceeded 7-second probe timeout |
| MikuHost remaining discovered routes | `/ai/*` | FAILED / RATE LIMITED | Not activated; provider returned endpoint errors and then HTTP 429 during enumeration |

## Fetch API

PASS — `GET /api/fetch?url=https://example.com` returned HTTP 200 and bounded response content.

## Security

- SSRF: PASS — `http://127.0.0.1` rejected with HTTP 400 `VALIDATION_ERROR`.
- invalid URL: PASS — malformed URL rejected with HTTP 400.
- timeout: IMPLEMENTED — native `AbortSignal.timeout` is applied to upstream fetches.
- rate limit: IMPLEMENTED — 60 requests per IP per minute; runtime behavior is wired in Fastify hook.
- malformed request: PASS — Zod validation returns HTTP 400.
- response size limit: IMPLEMENTED — streaming fetch caps body at `FETCH_MAX_BYTES`.
- redirect validation: IMPLEMENTED — every redirect is revalidated against SSRF rules.
- secrets: PASS by design — incoming Authorization/Cookie headers are not forwarded or logged.

## External discovery

- Ryuu root: PASS, HTTP 200 interactive landing page; no machine-readable endpoint list was exposed in the returned HTML.
- MikuHost category page: PASS, HTTP 200; 69 AI endpoint links were enumerated and probed before activation decisions.

## Direct scraper probes (September 18, 2026, second pass)

| Existing adapter | Result | Reason it was not activated |
|---|---|---|
| `youtube.js` | FAILED | Cloudflare HTTP 502 from ssyoutube.com upstream |
| `ig.js` | FAILED | Upstream `api.azbry.com` returned HTTP 500 |
| `twitter.js` | FAILED | Upstream requires Turnstile verification (`verification_required`) |
| `mediafire.js` | FAILED | Upstream returned HTTP 404 for the representative link |
| `gsmarena.js` | FAILED | Returned an empty result set on multiple queries |
| `spotify.js` | FAILED | Upstream `spotyloader.com` returned HTTP 403 `turnstile_required` (anti-bot); the file is CLI-only with no module export, so no adapter was built |
| `douyin.js` | FAILED | Upstream `snapvideotools.com` timed out; two separate public share links returned `status: false` |
| `terabox.js` | FAILED | Upstream reachable (HTTP 200) but returned "no data" for two real public share links taken from TeraBox's own blog |
| `pindl.js` (Pinterest) | FAILED | Upstream host `ilovepin.net` no longer resolves in DNS (dead domain) |
| `tiktoksearch.js` | FAILED | Upstream returned HTTP 500 |
| `wallpapersearch.js` | FAILED | Upstream returned HTTP 403 |

## Failed Tests

- YouTube live adapter test failed because the upstream converter returned Cloudflare HTTP 502.
- Instagram live adapter test failed with upstream HTTP 500.
- DeepSeek failed nonce extraction.
- Alisia timed out.
- Most remaining MikuHost probes were rate-limited after the provider limit was reached. These are deliberately documented but not exposed as working API features.
- Twitter, MediaFire, GSMArena, TikTok search, and wallpaper search adapters were probed directly in this pass and failed; they remain unregistered rather than being advertised as features.
- Spotify, Douyin, TeraBox, and Pinterest adapters were additionally probed (upstream inspected first, then real requests): all failed for independent reasons (Turnstile anti-bot, upstream timeout, upstream "no data", dead DNS). None were activated.

## Second-pass HTTP verification (all executed against the production build on 127.0.0.1:4000)

- `GET /api/plugins` → 200, seven plugins with `inputKind` metadata (tiktok, youtube, instagram, google-search, soundcloud, tempmail, mikuhost-chatgpt).
- `GET /api/scraper/google-search?text=miku` → 200 with results.
- `GET /api/scraper/tempmail` → 200 with a fresh address.
- `GET /api/scraper/soundcloud?text=the phoenix` → 200 with 11 tracks.
- `GET /api/scraper/tiktok?url=…` → 200 (regression check after refactor).
- `GET /api/ai/mikuhost-chatgpt?text=hi` → 200.
- `GET /api/scraper/google-search` (missing text) → 400 `VALIDATION_ERROR` per-plugin input schema.
- `GET /api/scraper/tiktok` (missing url) → 400 `VALIDATION_ERROR`.
- `GET /api/scraper/youtube?url=…` → 503 (unavailable, not advertised).
- `GET /api/fetch?url=http://127.0.0.1:4000/api/health` → 400 (SSRF blocked).
- `GET /api/docs` → 200.
- Dashboard `GET /` → 200 serving the built Vite bundle.
