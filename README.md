# CLIMATO — Space-Weather & Geospatial Climate Intelligence Platform

Bilingual (**English / Arabic RTL**) climate intelligence and space-weather platform built for Egypt, the Nile Delta, Greater Cairo, and Upper Egypt — pairing an interactive **Three.js WebGL 3D Earth & Satellite Canvas**, live atmospheric & land-surface telemetry, NASA Earth-science bento analytics, 7-day regional forecasts, and a hardened **Express + Node SQLite** multi-tenant scientific backend.

---

## Core Capabilities

- **Interactive 3D Earth Globe & Orbiting Satellites (`Three.js` WebGL)**:
  - High-resolution Deep Cosmic Black (`#050805`) & Neon Green (`#00FF66`) procedural Earth with emissive coastlines, Nile River/Delta highlight, atmospheric Fresnel halo, and rotating equatorial scanner ring.
  - Three multi-part orbital satellites with pre-allocated luminous orbital trails, dual-layer starfield, drag-to-spin + pointer parallax, clickable Egyptian study beacons, and GSAP `ScrollTrigger` orbital descent.
- **Hero Atmospheric Search & Live Telemetry Sync**:
  - Real-time geocoding & coordinate locking (`?q=Cairo`, `Alexandria`, `31.20, 29.92`, or `?regionId=...`) powered by Open-Meteo atmospheric & topsoil streams (`temperature_2m`, `relative_humidity_2m`, `wind_speed_10m`, `precipitation`, `soil_moisture_0_to_7cm`).
  - Bidirectional data binding (`AbortController`-protected) synchronizing the Hero search bar, 3D Earth focus marker, Analytics Bento cards, and 7-day forecast in lockstep.
- **NASA Earth-Science Bento & Egypt Trend Detective**:
  - Calibrated **MERRA-2** (2m Air Temperature), **GPM IMERG** (Precipitation), **GLDAS** (0–10 cm Topsoil Moisture), and **GRACE-FO** (Terrestrial Water Storage Mascons) with strict native spatial footprint preservation (`CRS EPSG:4326`).
  - Non-parametric statistical workbench: **Mann-Kendall**, **Hamed-Rao (1998)** autocorrelation correction, **Theil-Sen** slopes with 95% confidence bounds, seasonal `DJF/MAM/JJA/SON` analysis, Giovanni/AppEEARS CSV/JSON ingestion, live NASA CMR collection & granule discovery, and authenticated NetCDF-3 / OPeNDAP download + SHA-256 checksum tracking when `NASA_EARTHDATA_TOKEN` is configured.
- **Multi-Tenant Security, Alerts, Real Webhooks & ESG Reports**:
  - Versioned transactional SQLite migrations `v1..v6` (`node:sqlite`), organization & RBAC user authentication (`scrypt` passwords, `clm_ses_` sessions, brute-force lockout), SHA-256 hashed API keys with rotation, expiration, scopes, per-key sliding-window RPM rate limits, and monthly organization quotas.
  - Helmet, explicit CORS allowlist (`CORS_ALLOWED_ORIGINS`), SSRF-protected real HTTP webhook dispatch with retries and dual HMAC signatures (`X-Climato-Signature`, `X-Climato-Signature-V2`), honest `INSUFFICIENT_DATA` alert evaluation (`observedValue: null`), and structured **JSON / CSV / `%PDF-1.4`** ESG report exports.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Three.js (`0.187`), GSAP (`ScrollTrigger`), Lucide Icons
- **Backend**: Node.js `v22+`, Express `4`, `node:sqlite` (WAL mode), `helmet`, `cors`, `express-rate-limit`, TypeScript (`tsx`)
- **Live Upstreams**: Open-Meteo Forecast & Geocoding APIs, NASA CMR REST Discovery & Earthdata OPeNDAP/Granule APIs

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

Open `http://localhost:3000`. Note: SQLite database `./data/terrapulse.db` is initialized automatically on startup via versioned migrations (`v1..v6`) — operational `.db` / `.db-wal` / `.db-shm` files are excluded from Git via `.gitignore`.

### Quality & Build Verification

```bash
# TypeScript static type-checking
npm run lint

# Automated unit, migration, scientific, security, webhook/report & weather API tests (6 suites / 44 tests)
npm test

# Production Vite build (outputs to ./dist)
npm run build
```

---

## Environment Variables

See `.env.example` for the full template. Key production variables:

| Variable | Required in Prod | Description |
| :--- | :---: | :--- |
| `NODE_ENV` | Yes | Set to `production` to serve built `./dist` and enforce fail-closed security |
| `PORT` | No | Server port (defaults to `3000`) |
| `CLIMATO_ADMIN_SECRET` | Yes | Protects `platform_admin` overview and fallback admin key access via `X-Climato-Admin-Secret` |
| `CLIMATO_WEBHOOK_SECRET` | Yes | HMAC-SHA256 signing & AES-256-GCM secret key encryption material for webhooks |
| `CLIMATO_SESSION_KEY` | Recommended | Additional key material for session & encryption derivation |
| `CORS_ALLOWED_ORIGINS` | Yes | Comma-separated origin allowlist for browser CORS requests |
| `CLIMATO_DB_PATH` | Recommended | Persistent SQLite file path (defaults to `./data/terrapulse.db`) |
| `NASA_EARTHDATA_TOKEN` | Optional | Enables authenticated Earthdata NetCDF-3 / OPeNDAP granule downloads (`BLOCKED_BY_CREDENTIALS` when unset) |

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
  -e CORS_ALLOWED_ORIGINS="https://your-domain.example" \
  -e CLIMATO_DB_PATH=/app/data/terrapulse.db \
  -v climato_data:/app/data \
  climato:latest
```

### 2. Static Frontend Hosting (Vercel / Netlify)

Repository root includes `vercel.json` and `netlify.toml` configured for the Vite production build (`npm run build` -> `dist/`). For live `/api/*` endpoints on static frontend deployments, configure a reverse proxy rewrite pointing `/api/:path*` to your hosted full-stack Node 22 container URL and include the frontend origin in `CORS_ALLOWED_ORIGINS`.

---

## Documentation

- [Security Architecture](docs/SECURITY.md)
- [Scientific Methodology](docs/SCIENTIFIC_METHODOLOGY.md)
- [Data Provenance](docs/DATA_PROVENANCE.md)
- [NASA Earthdata Integration](docs/NASA_EARTHDATA_INTEGRATION.md)
- [API Reference](docs/API_REFERENCE.md)
- [Operations & Deployment Guide](docs/DEPLOYMENT.md)
- [CLIMATO v2 Repair & Audit Report](docs/CLIMATO_V2_REPAIR_REPORT.md)
