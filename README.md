# CLIMATO — Space-Weather & Geospatial Climate Intelligence Platform

Bilingual (**English / Arabic RTL**) climate intelligence and space-weather platform built for Egypt, the Nile Delta, Greater Cairo, and Upper Egypt — pairing an interactive **Three.js WebGL 3D Earth & Satellite Canvas**, live atmospheric & land-surface telemetry, NASA Earth-science bento analytics, 7-day regional forecasts, and a hardened **Express + Node SQLite** scientific backend.

---

## Core Capabilities

- **Interactive 3D Earth Globe & Orbiting Satellites (`Three.js` WebGL)**:
  - High-resolution Deep Cosmic Black (`#050805`) & Neon Green (`#00FF66`) procedural Earth with emissive coastlines, Nile River/Delta highlight, atmospheric Fresnel halo, and rotating equatorial scanner ring.
  - Three multi-part orbital satellites with pre-allocated luminous orbital trails, dual-layer starfield, drag-to-spin + pointer parallax, clickable Egyptian study beacons, and GSAP `ScrollTrigger` orbital descent.
- **Hero Atmospheric Search & Live Telemetry Sync**:
  - Real-time geocoding & coordinate locking (`?q=Cairo`, `Alexandria`, `31.20, 29.92`, or `?regionId=...`) powered by Open-Meteo atmospheric & topsoil streams (`temperature_2m`, `relative_humidity_2m`, `wind_speed_10m`, `precipitation`, `soil_moisture_0_to_7cm`).
  - Bidirectional data binding (`AbortController`-protected) synchronizing the Hero search bar, 3D Earth focus marker, Analytics Bento cards, and 7-day forecast in lockstep.
- **NASA Earth-Science Bento & Egypt Trend Detective**:
  - Calibrated **MERRA-2** (2m Air Temperature), **GPM IMERG** (Precipitation), **GLDAS** (0–10 cm Topsoil Moisture), and **GRACE-FO** (Terrestrial Water Storage Mascons) with strict native spatial footprint preservation.
  - Non-parametric statistical workbench: **Mann-Kendall**, **Hamed-Rao** autocorrelation correction, **Theil-Sen** slopes with 95% confidence bounds, seasonal `DJF/MAM/JJA/SON` analysis, Giovanni/AppEEARS CSV ingestion, and live NASA CMR catalog verification.
- **Security & Multi-Tenant Backend**:
  - Versioned transactional SQLite migrations (`node:sqlite`), SHA-256 hashed API keys with prefix masking, sliding-window per-key rate limiting, fail-closed `CLIMATO_ADMIN_SECRET` & `CLIMATO_WEBHOOK_SECRET` HMAC webhook signing in production, and workspace tenant isolation.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Three.js (`0.187`), GSAP (`ScrollTrigger`), Lucide Icons
- **Backend**: Node.js `v22+`, Express `4`, `node:sqlite` (WAL mode), TypeScript (`tsx`)
- **Live Upstreams**: Open-Meteo Forecast & Geocoding APIs, NASA CMR REST Discovery API

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env

# 3. Run full-stack development server (Express API + Vite middleware on port 3000)
npm run dev
```

Open `http://localhost:3000`.

### Quality & Build Verification

```bash
# TypeScript static type-checking
npm run lint

# Automated unit, migration, scientific, security & weather API tests
npm test

# Production Vite build (outputs to ./dist)
npm run build
```

---

## Environment Variables

See `.env.example` for the full list. Key production variables:

| Variable | Required in Prod | Description |
| :--- | :---: | :--- |
| `NODE_ENV` | Yes | Set to `production` to serve built `./dist` and enforce fail-closed security |
| `PORT` | No | Server port (defaults to `3000`) |
| `CLIMATO_ADMIN_SECRET` | Yes | Protects `/api/v1/keys`, `/api/audit-logs`, `/api/demo-requests` via `X-Climato-Admin-Secret` |
| `CLIMATO_WEBHOOK_SECRET` | Yes | HMAC-SHA256 signing secret for alert evaluation webhook payloads |
| `CLIMATO_DB_PATH` | Recommended | Persistent SQLite file path (defaults to `./data/terrapulse.db`) |
| `NASA_EARTHDATA_TOKEN` | Optional | Enables programmatic Earthdata OPeNDAP/Harmony retrieval |

---

## Deployment Options

### 1. Full-Stack Node.js / Docker (Recommended — Cloud Run, Render, Railway, Fly.io)

Because CLIMATO includes an Express API, live atmospheric/NASA proxies, and persistent SQLite storage (`node:sqlite`), deploying via the included `Dockerfile` or Node 22 runtime serves both the frontend and all `/api/*` endpoints from a single origin:

```bash
docker build -t climato:latest .
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e CLIMATO_ADMIN_SECRET="replace-with-32+-char-secret" \
  -e CLIMATO_WEBHOOK_SECRET="replace-with-32+-char-secret" \
  -e CLIMATO_DB_PATH=/app/data/terrapulse.db \
  -v climato_data:/app/data \
  climato:latest
```

### 2. Static Frontend Hosting (Vercel / Netlify / GitHub Pages)

Repository root includes `vercel.json` and `netlify.toml` configured for the Vite production build (`npm run build` → `dist/`):

- **Vercel**: Connect the GitHub repository (`malakmosa642-cell/Climato`). `vercel.json` automatically configures `npm run build`, `dist`, and SPA rewrites.
- **Netlify**: Connect the repository. `netlify.toml` automatically configures `npm run build`, `dist`, and `/* -> /index.html` status `200`.
- **Important API Routing Note**: Static hosts (`Vercel` static output, `Netlify` CDN, `GitHub Pages`) do **not** run the persistent `node:sqlite` + Express backend. For live `/api/*` endpoints on static frontend deployments, configure a reverse proxy rewrite in `vercel.json` / `netlify.toml` pointing `/api/:path*` to your hosted full-stack Node 22 container URL.

---

## Further Documentation

- [Security Architecture](docs/SECURITY.md)
- [Scientific Methodology](docs/SCIENTIFIC_METHODOLOGY.md)
- [Data Provenance](docs/DATA_PROVENANCE.md)
- [NASA Earthdata Integration](docs/NASA_EARTHDATA_INTEGRATION.md)
- [API Reference](docs/API_REFERENCE.md)
- [Operations & Deployment Guide](docs/DEPLOYMENT.md)
