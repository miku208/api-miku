# MikuHost-Api

Modular REST API platform for `https://api-mikuhost.biz.id`. Phase 1 intentionally contains no authentication, user accounts, API keys, billing, or Supabase Auth.

## Stack

- **API:** Node.js 22+, TypeScript, Fastify, Zod, native `fetch`
- **Dashboard:** React, TypeScript, Vite, Tailwind CSS
- **Runtime:** `0.0.0.0:8686`
- **Existing scraper source:** `../src/scraper` (adapted without changing the original files)

## Quick start

```bash
cp .env.example .env
npm install
npm run typecheck
npm run build
npm start
```

Open `http://localhost:8686`. The same Fastify process serves the built dashboard and API.

Development mode:

```bash
npm run dev
```

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Operational status and uptime |
| GET | `/api/plugins` | Registered plugin metadata |
| GET | `/api/scraper/youtube?url=https://...&format=mp3\|mp4` | YouTube MP3/MP4 downloader (bundled scraper) |
| GET | `/api/scraper/capcut?url=https://...` | CapCut template downloader (bundled scraper) |
| GET | `/api/scraper/instagram?url=https://...` | Instagram downloader (bundled; upstream saat ini diblokir Cloudflare) |
| GET | `/api/scraper/tiktok?url=https://...` | TikTok downloader |
| GET | `/api/ai/mikuhost-chatgpt?text=...` | Verified MikuHost upstream adapter |
| GET | `/api/fetch?url=https://...` | SSRF-protected public fetch |
| GET | `/api/docs` | Machine-readable endpoint documentation |
| GET | `/api/logs` | In-memory request logs |
| GET | `/api/mikuhost/categories` | MikuHost upstream categories + counts |
| GET | `/api/mikuhost/catalog` | Full MikuHost catalog (method, path, alias, params) |
| GET | `/api/mikuhost/sync` | Last catalog sync status |
| POST | `/api/mikuhost/sync` | Trigger a catalog re-scrape now |
| ANY | `/api/mikuhost/endpoint/:category/:slug` | Proxy to a MikuHost endpoint, params forwarded 1:1 |

All successful API responses use `{ success, data, meta }`; errors use `{ success: false, error: { code, message } }`. Every response is branded MikuHost: `meta.source` uses `mikuhost:*`, and upstream payload fields such as `author` are stripped/rebranded so no third-party identity leaks through.

## cURL examples

```bash
# Service health
curl http://localhost:8686/api/health

# AI endpoint (verified upstream adapter)
curl "http://localhost:8686/api/ai/mikuhost-chatgpt?text=Haloo"

# AI proxy through the MikuHost catalog (bypass endpoint)
curl "http://localhost:8686/api/mikuhost/endpoint/ai/bypass?text=Haloo"

# MikuHost catalog categories
curl http://localhost:8686/api/mikuhost/categories

# Full MikuHost catalog
curl http://localhost:8686/api/mikuhost/catalog

# Catalog sync status / trigger re-scrape
curl http://localhost:8686/api/mikuhost/sync
curl -X POST http://localhost:8686/api/mikuhost/sync

# Registered plugins
curl http://localhost:8686/api/plugins

# SSRF-protected fetch
curl "http://localhost:8686/api/fetch?url=https://example.com"

# Google Search scraper
curl "http://localhost:8686/api/scraper/google-search?text=hatsune+miku"

# YouTube downloader (MP3 default, atau MP4)
curl "http://localhost:8686/api/scraper/youtube?url=https://youtu.be/dQw4w9WgXcQ&format=mp4"

# CapCut template downloader
curl "http://localhost:8686/api/scraper/capcut?url=https://www.capcut.com/tv2/ZSVEwBgtH/"

# TikTok scraper
curl "http://localhost:8686/api/scraper/tiktok?url=https://www.tiktok.com/@tiktok/video/7106594312292453675"
```

Example AI response shape:

```json
{
  "success": true,
  "data": {
    "status": true,
    "author": "MikuHost",
    "result": "Haloo",
    "timestamp": "2026-09-18T12:36:50.021Z",
    "response_time": "2689ms"
  },
  "meta": {
    "source": "mikuhost:/ai/bypass",
    "upstreamStatus": 200,
    "timestamp": "2026-09-18T12:36:46.105Z"
  }
}
```

## Plugin architecture (WA-bot style)

Plugin **modular per-file**: satu folder `src/plugins/`, satu file per plugin, **auto-load** saat server start.

```ts
// src/plugins/contoh-baru.ts
type PluginModule = { /* lihat src/plugins/_shared.ts */ };

const plugin = {
  name: "Contoh Baru",
  slug: "contoh",
  type: "scraper",              // "scraper" → /api/scraper/contoh, "ai" → /api/ai/contoh
  status: "active",
  description: "...",
  inputKind: "url",             // url | text | none
  paramExample: "https://...",
  execute: async (input) => ({ ... })
};
export default plugin;
```

Aturan loader (`src/plugins.ts`):
- Semua `.ts`/`.js` di `src/plugins/` otomatis terdaftar; file berawalan `_` (mis. `_shared.ts`) di-skip
- `endpoint` diturunkan otomatis dari `type` + `slug`
- File yang gagal load dilaporkan di `GET /api/plugins` → `meta.loadErrors`

**Bundled scrapers** (`src/scrapers/`) dipakai plugin di dalam proses dengan SSRF protection (`assertSafeUrl`), size cap, validasi redirect, dan timeout:

- `youtube` → `src/scrapers/youtube.ts` (MP3/MP4 via ytmp3; param `format=mp3|mp4`)
- `capcut` → `src/scrapers/capcut.ts` (metadata template + video URL)
- `instagram` → `src/scrapers/instagram.ts` (bundled tapi `unavailable`: instashadow.com Cloudflare-blocked dari IP datacenter; ganti `status` ke `"active"` kalau provider sudah jalan)

**External adapters** (dari folder scraper lama, dicari di `SCRAPER_SOURCE`/`../src/scraper`/`scrapers`): `tiktok`, `google-search`, `soundcloud`, `tempmail`.

Plugin AI `mikuhost-chatgpt` diaktifkan hanya setelah tes `GET ?text=` nyata mengembalikan HTTP 200. Endpoint lain yang gagal verifikasi tidak diiklankan aktif.

## Security

The generic fetch endpoint is not an open proxy. It validates HTTP(S), resolves DNS before requesting, blocks localhost/private/link-local/metadata/internal targets, validates every redirect, limits redirects, applies a timeout, caps response size, and does not forward incoming auth or cookie headers. Fastify body limits, Helmet, CORS, validation, rate limiting, and safe error responses are enabled.

## Deployment with Nginx

The live domain must have both the Node service and Nginx proxy running. A Nginx-only setup returns 502 when nothing listens on `127.0.0.1:8686`.

```bash
sudo mkdir -p /var/www
sudo cp -a mikuhost-api /var/www/mikuhost-api
cd /var/www/mikuhost-api
npm install
npm run build
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # jalankan perintah yang dicetak, agar auto-start saat boot

curl http://127.0.0.1:8686/api/health
```

Perintah pm2 sehari-hari:

```bash
pm2 restart mikuhost-api   # restart server
pm2 logs mikuhost-api      # lihat log live
pm2 status                 # daftar proses
```

Migrasi dari systemd ke pm2 (jika sebelumnya pakai `mikuhost-api.service`):

```bash
sudo systemctl disable --now mikuhost-api
npm install -g pm2
pm2 start ecosystem.config.cjs && pm2 save
```

If HTTPS is managed by Certbot, run `sudo certbot --nginx -d api-mikuhost.biz.id` after HTTP works. Do not commit `.env`. Use the included systemd unit for restart behavior.

## Verification

See [`TEST_REPORT.md`](./TEST_REPORT.md) for the executed build, API, security, scraper, and upstream verification results. The report records failed/limited upstream tests rather than presenting them as active features.
