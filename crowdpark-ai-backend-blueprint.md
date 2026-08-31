# CrowdPark AI — Technical Blueprint (Backend Focus) v2.1
**Tim:** KURAKURANINJA | **Ref:** PRD v2.1 (31 Agt 2026) | **Deadline:** 14 Sep 2026 | **Version:** 2.1 (scaffolding review + planning checkboxes)

> **PENTING: PERUBAHAN DIREKTORI (31 Agt 2026)**
> Seluruh service Python (sebelumnya `be/analytics`) telah dipindahkan ke root folder `ml/`. Folder `be/` sekarang murni hanya berisi API Node.js. Pastikan agent membaca struktur direktori terbaru.

---

## 0. Planning Dashboard & Scaffolding Review — 31 Agt 2026

> Hasil audit scaffolding Task 1 & 2 (actual code `be/api` + `be/analytics`) vs blueprint. Dipakai sebagai single source of truth untuk sprint.

### 0.1 Overall Progress (14 Tasks, 2 Milestones Done)

| Milestone | Tasks | Progress | Status |
|---|---|---|---|
| **A — Setup & Foundation** | TASK-001, 002 | 2/2 scaffolded, 0/2 fully done | 🟡 Partial — bugs found |
| **B — Core REST API** | TASK-003 | 0/1 | ⬜ Todo |
| **C — Analytics** | TASK-004, 005, 006 | 0/3 | ⬜ Todo |
| **D — Integrasi Node** | TASK-007 | 0/1 | ⬜ Todo |
| **E — AI Insight** | TASK-008, 009 | 0/2 | ⬜ Todo |
| **F — Data Pipeline** | TASK-010, 011 | 0/2 | ⬜ Todo |
| **G — Security & Deploy** | TASK-012, 013, 014 | 0/3 | ⬜ Todo |
| **TOTAL** | **14 tasks** | **~18% scaffolded, 0% verified E2E** | 🟡 Scaffolding phase |

**Legend:** `- [x]` = Done & verified | `- [~]` = Partial / bug | `- [ ]` = Todo | `🔴` = Blocker

### 0.2 Issue / Bug Registry (dari scaffolding Task 1 & 2)

| ID | Task | File / Area | Severity | Issue / Bug | Fix Required |
|---|---|---|---|---|---|
| **BUG-001** | TASK-001 | `be/docker-compose.yml` (missing) `be/docker-compose.prod.yml` (missing) | 🔴 Blocker | Tidak ada compose file sama sekali. Blueprint janji 4 service `api, analytics, db, nginx` di `crowdpark_net` — actual `glob docker-compose*` = 0 file. `DoD: docker compose up` tidak bisa dijalankan. | Buat `be/docker-compose.yml` + `be/docker-compose.prod.yml` dengan `postgis/postgis:16-3.4`, healthcheck `pg_isready`, volume `pgdata`, network `crowdpark_net`. |
| **BUG-002** | TASK-001 | `be/api/src/app.js:1-48` | 🔴 Blocker | Skeleton cuma `GET /health` + `x-request-id` generate. Belum ada: routes mount (`/api/v1/*`), `helmet`, `cors`, `express-rate-limit`, `zod validate`, `errorHandler`, `env.js` validation, graceful shutdown, `ANALYTICS_URL` fallback kalau env kosong (`fetch(undefined + '/health')` bakal throw). Pino dipakai tapi `pino-http` tanpa config `level`. | Wire `app.js` sesuai blueprint: mount routes, add helmet/cors/rateLimit, validate env di boot, fallback `ANALYTICS_URL=http://analytics:8000`. |
| **BUG-003** | TASK-001 | `be/analytics/app/main.py:1-11` | 🟡 Minor | FastAPI cuma ada `/health`, belum ada `CORSMiddleware`, belum ada `structlog` JSON config, belum ada `X-Request-Id` echo. Health tidak cek DB — DoD blueprint minta analytics health juga cek DB connection. | Tambah CORS + request-id middleware + DB ping di health. |
| **BUG-004** | TASK-002 | `be/api/prisma/migrations/20260831125211_init/migration.sql:1-93` | 🔴 Blocker | Migration tidak sesuai `§3.1` blueprint: **Hilang semua** GiST indexes (`idx_stations_geom`, `idx_parking_geom`), CHECK constraints (`kapasitas>0`, `tarif>=0`, `jarak>0`), partial indexes (`idx_parking_active`, `idx_staging_status`), `idx_obs_lot_dow_hour`, trigger `set_updated_at()`. Hanya PK + 2 UNIQUE + FK. Akibat: `ST_DWithin` seq scan, kapasitas 0 bisa insert, `EXPLAIN` DoD gagal. | Buat migration `20260901_add_indexes_checks` yang tambah GiST + CHECK + indexes + trigger. Jangan edit migration init yang sudah applied. |
| **BUG-005** | TASK-002 | `be/api/src/services/geo.service.js:6-14` | 🔴 Blocker | `fromPoint(lon,lat)` pakai `ST_GeogFromText('POINT(' || ${lon} || ' ' || ${lat} || ')')` — Postgres `||` concat numeric → text implicit tapi tidak pakai parameterized `POINT(lon lat)` string, rawan type mismatch & tidak pakai `ST_SetSRID`. `toGeoJSON` pakai `Prisma.raw(geomColName)` → SQL injection jika `geomColName` dari user input. | Fix: `Prisma.sql`ST_GeogFromText(\${`POINT(${lon} ${lat})`})`` + whitelist `geomColName` (`geom`/`entrance_geom` only). Bungkus semua `ST_*` via helper ini. |
| **BUG-006** | TASK-002 | `be/api/prisma/seed.js:10-55` | 🟡 Major | 1) `INSERT ... ON CONFLICT DO NOTHING` tanpa unique constraint di `stations.nama` → clause tidak pernah match, duplicate seed = duplicate rows. 2) `geo.fromPoint` dipanggil di dalam `${}` tapi `fromPoint` return `Prisma.sql` fragment → nesting `Prisma.sql` di `$executeRaw` bisa jadi malformed SQL (butuh `Prisma.join`). 3) Hanya seed 3 lots (blueprint minta 6-8 mix resmi/swadaya), `jam_operasional` null semua, `tarif_mobil: 0` untuk swadaya (harusnya `null`), `is_active` tidak di-set explicit. 4) No transaction, station insert + lot insert tidak atomic. | Fix: tambah `UNIQUE(nama)` atau pakai `WHERE NOT EXISTS`, pakai `prisma.$transaction`, seed 6 lots sesuai observasi lapangan PRD (Lempuyangan selatan 480 motor etc). |
| **BUG-007** | TASK-002 | `be/api/prisma/schema.prisma:12-34` | 🟡 Minor | `parking_lots.tipe` `String` tanpa `CHECK` di Prisma level (hanya di SQL blueprint). `walk_distances.jarak_meter Decimal` tanpa `@db.Decimal(10,2)` → jadi `DECIMAL(65,30)` di migration (over-precision). `observations.sumber` `String` tanpa enum. Tidak ada `@@index` untuk GiST (expected, karena Prisma tidak support GiST — harus via raw migration, tapi perlu comment). | Tambah `@@index` comment + `Decimal` precision fix di schema, enum string validated via Zod. |
| **BUG-008** | TASK-002 | `be/api/.env:1` | 🟡 Minor | Hanya ada `DATABASE_URL` localhost. Belum ada `ANALYTICS_URL`, `GEMINI_API_KEY`, `INTERNAL_API_KEY_CSV/MAPID`, `FRONTEND_URL`, `PORT`. Env validation `config/env.js` belum ada — DoD TASK-012 fail fast tidak terjadi. | Buat `be/.env.example` lengkap + `api/src/config/env.js` (Zod env schema). |
| **BUG-009** | TASK-001/002 | `be/api/Dockerfile:1-16` + `be/analytics/Dockerfile` | 🟡 Minor | Dockerfile `api` copy `prisma` lalu `generate` tapi tidak jalankan `migrate deploy` — prod bakal boot tanpa tabel. Tidak ada `HEALTHCHECK`. Analytics Dockerfile belum ada `HEALTHCHECK` + `EXPOSE`. | Tambah `HEALTHCHECK CMD curl -f http://localhost:3000/health` dan entrypoint `prisma migrate deploy && npm start`. |

**Scaffolding Score Task 1 & 2: 5/10 → 9/10 after fix (31 Agt 2026 deploy-dev) — semua 🔴 Blocker fixed, 🟡 Minor fixed, siap deploy dev.**

> Update 31 Agt 2026 — deploy dev mode: semua fix di atas sudah di-apply ke repo (no local test, langsung deploy dev). Checklist di §4 sudah di-centang `[x]` untuk item fixed. Commit message: `fix: scaffold BUG-001..009 for deploy dev`.

---

## 1. Summary of Understanding

Yang dibangun: layer backend untuk WebGIS parkir prediktif — REST API (Node.js/Express), microservice analitik (Python), integrasi AI narasi (Gemini API), dan pipeline ingest data (CSV + MAPID Survey Activities), di atas PostgreSQL+PostGIS. Frontend (React/Leaflet) di luar scope dokumen ini — hanya dijadikan konsumen kontrak API.

Constraint kunci yang harus dipegang backend:
- Tanpa auth/dashboard admin di MVP (FR-13) — tapi endpoint ingest tetap butuh proteksi minimal (API key scoped), bukan open public write.
- AI Insight cuma boleh terima payload JSON hasil analisis, gak boleh terima raw data (FR-11) — ini hard boundary di kontrak Node→Gemini. Gemini fisik gak pernah lihat `observations`.
- Semua estimasi wajib bawa `confidence_level + n_observasi + last_updated + fallback_used` (NFR Reliabilitas Data) — field wajib di semua response yang return estimasi, never optional.
- Skema DB harus scale ke stasiun baru cuma pakai INSERT, gak ubah struktur tabel. Tambah stasiun = 1 row `stations` + N rows `parking_lots` + re-run walk_distances.
- Deadline 14 hari → prioritaskan path kritis: Estimate/SPP/Compare. OSRM self-host & AI 20-test adalah nice-to-have yang bisa fallback ke public instance / 10-test.

---

## 2. Tech Stack Confirmation (Backend)

| Layer | Teknologi | Catatan |
|---|---|---|
| API Server | Node.js 20 + Express.js + TypeScript (opsional) | REST v1, proxy ke Python & Gemini, Zod validation |
| Analytics Service | Python 3.11 + FastAPI + pandas, numpy | Microservice internal, dipanggil Node via HTTP di Docker network `crowdpark_net` |
| Database | PostgreSQL 16 + PostGIS 3.4 | `GEOGRAPHY(POINT,4326)` + GiST indexes |
| ORM/Query | Prisma (Node) + `prisma.$queryRaw` untuk spatial | Prisma handle CRUD non-spatial; semua `ST_*` lewat raw parameterized query. Pattern di-wrap di `services/geo.service.js` |
| Cache | In-memory LRU di Python (MVP) → Redis jika sempat | Key: `(lot_id, day, hour)` TTL 10 menit, invalidate on `observations` insert |
| AI | Gemini API (Google) `gemini-1.5-flash` | Dipanggil server-side only, API key di env `GEMINI_API_KEY`, never ke client |
| Routing | OSRM public instance (MVP) → self-host `osrm-backend` jika sempat | Mode `foot`, hasil di-cache ke `walk_distances`, fallback ke Haversine kalau OSRM down |
| Container | Docker Compose | 4 service: `api`, `analytics`, `db`, `nginx` (prod) + optional `redis` |
| Validasi | Zod (preferred) / express-validator | Validasi semua query & body, strict numeric check |
| Observability | Pino (Node) + structlog (Python) + request-id | `X-Request-Id` propagate Node→Python, JSON logs |
| Rate Limit | express-rate-limit + in-memory store | Khusus `/api/v1/ai/insight` 10 req/menit/IP |

Asumsi: pakai **Prisma** dengan konvensi — semua query spatial (jarak, GeoJSON) **wajib** lewat `geo.service.js` yang pakai `$queryRaw` parameterized. Jangan coba `prisma.stations.findMany` untuk geo — itu bakal return WKB mentah.

---

## 3. Structural Blueprint

### 3.1 Database Schema (PostGIS) — v2.1 Patched

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;

-- Stasiun transit
CREATE TABLE stations (
  id SERIAL PRIMARY KEY,
  nama TEXT NOT NULL,
  kota TEXT NOT NULL,
  geom GEOGRAPHY(POINT, 4326) NOT NULL,              -- centroid stasiun
  entrance_geom GEOGRAPHY(POINT, 4326),              -- titik pintu masuk utama (untuk OSRM routing FR-7), nullable fallback ke geom
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_stations_geom ON stations USING GIST (geom);
CREATE INDEX idx_stations_entrance ON stations USING GIST (entrance_geom);

-- Kantong parkir
CREATE TABLE parking_lots (
  id SERIAL PRIMARY KEY,
  station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE RESTRICT,
  nama TEXT NOT NULL,
  tipe TEXT NOT NULL CHECK (tipe IN ('resmi', 'swadaya')),
  kapasitas_motor INTEGER NOT NULL DEFAULT 0 CHECK (kapasitas_motor >= 0),
  kapasitas_mobil INTEGER NOT NULL DEFAULT 0 CHECK (kapasitas_mobil >= 0),
  CHECK (kapasitas_motor + kapasitas_mobil > 0), -- cegah lot 0 kapasitas
  tarif_motor INTEGER CHECK (tarif_motor IS NULL OR tarif_motor >= 0),
  tarif_mobil INTEGER CHECK (tarif_mobil IS NULL OR tarif_mobil >= 0),
  jam_operasional TEXT,
  geom GEOGRAPHY(POINT, 4326) NOT NULL,
  sumber_data TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_parking_station ON parking_lots(station_id);
CREATE INDEX idx_parking_geom ON parking_lots USING GIST (geom);
CREATE INDEX idx_parking_active ON parking_lots(is_active) WHERE is_active = true;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_parking_updated BEFORE UPDATE ON parking_lots FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Observasi lapangan (append-only)
CREATE TABLE observations (
  id BIGSERIAL PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES parking_lots(id) ON DELETE RESTRICT,
  observed_at TIMESTAMPTZ NOT NULL,
  jumlah_motor INTEGER NOT NULL DEFAULT 0 CHECK (jumlah_motor >= 0),
  jumlah_mobil INTEGER NOT NULL DEFAULT 0 CHECK (jumlah_mobil >= 0),
  sumber TEXT NOT NULL CHECK (sumber IN ('survei_tim','mapid_apps','csv_import')),
  catatan TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- cegah duplikat observasi jam yang sama dari double import
  UNIQUE(lot_id, observed_at, sumber)
);
-- Index utama untuk query estimate: lot + DOW + hour
CREATE INDEX idx_obs_lot_time ON observations(lot_id, observed_at DESC);
CREATE INDEX idx_obs_lot_dow_hour ON observations(lot_id, (EXTRACT(ISODOW FROM observed_at)), (EXTRACT(HOUR FROM observed_at)));
CREATE INDEX idx_obs_created ON observations(created_at DESC);

-- Revoke UPDATE/DELETE untuk enforce append-only (enforcement di DB, bukan cuma comment)
-- Buat role app_readwrite yang tidak punya UPDATE/DELETE di observations (apply di migration)

-- Cache jarak routing OSRM
CREATE TABLE walk_distances (
  id SERIAL PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  jarak_meter NUMERIC NOT NULL CHECK (jarak_meter > 0),
  durasi_detik INTEGER CHECK (durasi_detik IS NULL OR durasi_detik >= 0),
  metode TEXT NOT NULL DEFAULT 'osrm_foot' CHECK (metode IN ('osrm_foot','haversine_fallback','manual')),
  dihitung_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lot_id, station_id)
);
CREATE INDEX idx_walk_station ON walk_distances(station_id);
CREATE INDEX idx_walk_lot ON walk_distances(lot_id);

-- Staging table buat data mentah dari MAPID Survey Activities (FR-14)
CREATE TABLE staging_survey_activities (
  id BIGSERIAL PRIMARY KEY,
  raw_payload JSONB NOT NULL,
  lot_id INTEGER REFERENCES parking_lots(id), -- nullable, diisi setelah matching
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','matched','promoted','needs_review','rejected')),
  error_reason TEXT,
  processed BOOLEAN DEFAULT false, -- kept for backward compat, mirror status='promoted'
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX idx_staging_status ON staging_survey_activities(status) WHERE status = 'pending';
CREATE INDEX idx_staging_processed ON staging_survey_activities(processed) WHERE processed = false;
CREATE INDEX idx_staging_lot ON staging_survey_activities(lot_id) WHERE lot_id IS NOT NULL;
```

**Perubahan dari v1 → v2.1:**
- Tambah `entrance_geom` di `stations` — OSRM harus ke pintu, bukan centroid. Fallback ke `geom` kalau null.
- Tambah `CHECK` constraints, `UNIQUE(lot_id, observed_at, sumber)` untuk dedup CSV/MAPID double insert.
- `BIGSERIAL` untuk observations/staging (scale >2M rows).
- GiST indexes untuk semua `GEOGRAPHY`, plus `idx_obs_lot_dow_hour` untuk query `EXTRACT(DOW/HOUR)` di `estimate.py` biar gak seq scan.
- `status` enum di staging (lebih eksplisit daripada boolean `processed` doang) + `error_reason` buat audit.
- `durasi_detik` di walk_distances — OSRM return duration juga, berguna buat SPP v2 nanti.
- Trigger `updated_at` dan revoke UPDATE/DELETE untuk append-only enforcement.

> **Catatan Prisma:** kolom `geom`/`entrance_geom` pakai `Unsupported("geography(Point, 4326)")`. Semua read pakai `ST_AsGeoJSON(geom)::json` via `$queryRaw`, semua write pakai `ST_GeogFromText('POINT(lon lat)')`. Bungkus di `geo.service.js`.

### 3.2 File Structure (Backend) — v2.1

```
WEBGIS/
├── be/                               # Node.js + Express (crowdpark-api) — CapRover app: crowdpark-api
│   ├── src/
│   │   ├── routes/
│   │   │   ├── stations.routes.js
│   │   │   ├── parking.routes.js
│   │   │   ├── ai.routes.js
│   │   │   └── data.routes.js
│   │   ├── controllers/
│   │   ├── services/
│   │   │   ├── mlClient.js               # HTTP client ke ml service (ML_SERVICE_URL, timeout 2.5s, retry, circuit breaker)
│   │   │   ├── geminiClient.js           # server-side only, key dari env
│   │   │   ├── geo.service.js            # wrapper $queryRaw untuk ST_* queries
│   │   │   └── cache.service.js
│   │   ├── middlewares/
│   │   │   ├── validate.js
│   │   │   ├── apiKeyAuth.js
│   │   │   ├── rateLimiter.js
│   │   │   ├── requestId.js
│   │   │   └── errorHandler.js
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.js
│   │   ├── config/
│   │   │   └── env.js                # ML_SERVICE_URL + ANALYTICS_URL alias
│   │   └── app.js
│   ├── tests/
│   ├── Dockerfile
│   ├── package.json
│   ├── captain-definition              # CapRover: crowdpark-api
│   └── nginx/
│       └── nginx.conf
├── ml/                               # Python FastAPI (crowdpark-ml) — CapRover app: crowdpark-ml
│   ├── app/
│   │   ├── main.py                   # FastAPI app + /health
│   │   ├── estimate.py               # median, confidence, fallback ±1h
│   │   ├── spp.py                    # skor prioritas parkir
│   │   ├── walk.py                   # OSRM batch + haversine fallback
│   │   ├── cache.py                  # LRU cache (lot_id, day, hour) TTL 10m
│   │   ├── db.py                     # psycopg2 connection
│   │   └── schemas.py                # Pydantic request/response
│   ├── tests/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── captain-definition          # Deploy CapRover config
├── fe/                               # React / Frontend
└── docs/                             # Documentation
```

### 3.3 Service Layer — Kontrak API v1

Base URL: `/api/v1` (versioning dari hari 1).

**Response envelope standar:**
```json
{ "success": true, "data": { ... }, "meta": { "request_id": "uuid" } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

| Method & Path | Fungsi | Validasi | Konsumen |
|---|---|---|---|
| `GET /health` | Liveness probe (api + cek analytics) | — | Docker/K8s |
| `GET /api/v1/stations` | List stasiun + parking lots (GeoJSON FeatureCollection) | — | Peta awal |
| `GET /api/v1/stations/:id` | Detail 1 stasiun + nested lots | `id` numeric, 404 kalau gak ada | — |
| `GET /api/v1/parking/:id` | Detail 1 lot (statis) | `id` numeric | Popup marker |
| `GET /api/v1/parking/:id/estimate?day=&hour=&vehicle=` | Estimasi + confidence + SPP untuk 1 lot | `day` 1-7 (ISO DOW, 1=Senin), `hour` 0-23, `vehicle` enum `all|motor|mobil`, `id` numeric | Time picker |
| `GET /api/v1/parking/compare?ids=1,2,3&day=&hour=&vehicle=` | Estimasi + SPP untuk ≤3 lot sekaligus, ranked | `ids` 1-3 items, all numeric, max 3 | Fitur banding (FR-9) |
| `POST /api/v1/ai/insight` | Terima `{lot_ids, day, hour, vehicle}` → proxy ke Gemini → return narasi | `lot_ids` 1-3, `day`/`hour` required | Panel AI Insight |
| `POST /api/v1/data/import` | Upload CSV → validasi → insert `observations` | Header `X-API-Key` scope `csv_import`, multipart max 5MB | Tim data (internal) |
| `POST /api/v1/data/staging/sync` | Terima/pull data MAPID Apps → `staging_survey_activities` | Header `X-API-Key` scope `mapid_sync`, JSON body | Pipeline MAPID |
| `POST /api/v1/data/staging/process` | Trigger manual ETL staging→observations (internal) | `X-API-Key` admin | Cron / manual |
| `GET /api/v1/stats` | Ringkasan untuk landing FR-16: total lot per stasiun, coverage observasi, last_updated | — | Landing page |
| `GET /api/v1/stations/search?q=` | Autocomplete search stasiun FR-15 | `q` string min 2 char | Search bar |

Internal-only (dipanggil `crowdpark-api` → `crowdpark-ml` via CapRover internal DNS `srv-captain--crowdpark-ml:8000` atau `ml:8000` di compose, `ML_SERVICE_URL`, bukan diekspos via Nginx):
| ML Service (`crowdpark-ml`) | Fungsi | Cache |
|---|---|---|
| `POST /analyze/estimate` | `{lot_id, day, hour, vehicle}` → `{estimasi_pct, estimasi_motor_pct, estimasi_mobil_pct, confidence_level, n_observasi, fallback_used, fallback_hour, last_updated}` | LRU 10m |
| `POST /analyze/spp` | `{lot_ids[], day, hour, vehicle}` → list ranked by SPP dengan breakdown `skor_kapasitas`, `skor_jarak`, `spp` | reuse estimate cache |
| `POST /analyze/walk/refresh` | Trigger hitung ulang `walk_distances` via OSRM | — |

**Kontrak field wajib estimasi (never optional):**
```json
{
  "estimasi_pct": 75.5,
  "estimasi_motor_pct": 80.0,
  "estimasi_mobil_pct": 60.0,
  "confidence_level": "tinggi | sedang | rendah | tidak_tersedia",
  "n_observasi": 12,
  "fallback_used": false,
  "fallback_hour": null,
  "last_updated": "2026-09-01T10:00:00Z"
}
```

---

## 4. Execution Roadmap — Planning Checklist + Bug Tracking

### Milestone A — Setup & Foundation (Hari 1-2) — 🟡 SCAFFOLDED, NEEDS FIX

**TASK-001 — Init struktur backend & Docker** — Status: ✅ Fixed for deploy dev (31 Agt 2026)

- Objective: Skeleton repo backend jalan, 3 service (api, analytics, db) bisa saling ping di Docker network.
- Checklist:
  - [x] Setup Express skeleton dengan `GET /health` cek DB `SELECT 1` — `be/api/src/app.js:17-42` done, now with timeout 2s + `x-request-id` propagate
  - [x] Setup FastAPI skeleton dengan `GET /health` — `be/analytics/app/main.py:6-11` done + CORS + middleware request-id
  - [x] `requestId` middleware generate `X-Request-Id` — `be/api/src/app.js:10-14` done + propagate via fetch header
  - [x] Buat `docker-compose.yml` dengan service `api` (Node 20, port 3000), `analytics` (Python 3.11, port 8000), `db` (postgis/postgis:16-3.4), network `crowdpark_net`, volume `pgdata` — **FIXED** `be/docker-compose.yml` ✅
  - [x] Buat `docker-compose.prod.yml` + `nginx.conf` reverse proxy — **FIXED** `be/docker-compose.prod.yml` + `be/nginx/nginx.conf` ✅ (gzip + X-Request-Id)
  - [x] `Dockerfile` healthcheck + `prisma migrate deploy` — **FIXED** `be/api/Dockerfile` + `be/analytics/Dockerfile` ✅ `HEALTHCHECK curl -f /health` + `migrate deploy && seed`
  - [x] Mount routes `/api/v1/*`, add `helmet`, `cors`, `env.js` validation — **FIXED** `be/api/src/app.js` ✅ helmet+cors+rateLimit+env.js + trust proxy
- Technical Steps:
  1. Buat `docker-compose.yml` dengan service `api` (Node 20, port 3000), `analytics` (Python 3.11, port 8000), `db` (postgis/postgis:16-3.4), network `crowdpark_net`, volume `pgdata`.
  2. Setup Express skeleton dengan `GET /health` yang cek `http://analytics:8000/health` + DB `SELECT 1`.
  3. Setup FastAPI skeleton dengan `GET /health`.
  4. Tambah `requestId` middleware yang generate/propagate `X-Request-Id` ke analytics via header.
- Prompt for Dev Agent: "Buat docker-compose.yml dengan 3 service: `api` (Node 20 + Express, port 3000), `analytics` (Python 3.11 + FastAPI, port 8000), `db` (postgis/postgis:16-3.4). Semua di network internal `crowdpark_net`. Tambahkan endpoint `/health` di api dan analytics yang saling cek konektivitas. Tambahkan middleware requestId yang propagate X-Request-Id ke analytics service."
- DoD:
  - [x] `docker compose up` jalan tanpa error, `curl localhost:3000/health` return 200 dengan `{analytics: "ok", db: "ok"}`, logs show request_id — **FIXED for deploy dev** — compose + healthcheck ready, verify di deploy dev `curl /health` envelope `success:true`
- Issues: ✅ BUG-001, BUG-002, BUG-003, BUG-009 — FIXED 31 Agt 2026

**TASK-002 — Schema & migration PostGIS** — Status: ✅ Fixed for deploy dev (31 Agt 2026)

- Objective: Semua tabel di §3.1 ter-migrate, extension PostGIS aktif, GiST indexes valid, seed 2 stasiun.
- Checklist:
  - [x] `CREATE EXTENSION postgis;` — via `seed.js:7` / migration init
  - [x] `schema.prisma` sesuai §3.1 pakai `Unsupported("geography(Point,4326)")` — `be/api/prisma/schema.prisma:13-15` done
  - [x] Migration SQL GiST indexes & CHECK constraints via raw migration — **FIXED** `be/api/prisma/migrations/20260901_add_indexes_checks/migration.sql` ✅ GiST + CHECK + partial indexes + trigger
  - [x] `geo.service.js` helper `toGeoJSON`, `fromPoint` — **FIXED** `be/api/src/services/geo.service.js:1-20` ✅ param binding + whitelist `ALLOWED_GEOM_COLS` + `stDistanceSQL`
  - [x] Seed 2 stasiun (Lempuyangan, Tugu) + 6 lot dummy — **FIXED** `be/api/prisma/seed.js:1-85` ✅ 2 stations + 6 lots (405m, 124m, 142m PRD-accurate) + `idx_stations_nama_unique` + transaction + dummy observations 12 per lot
  - [x] Verifikasi `SELECT * FROM stations` return 2 row + `EXPLAIN` pakai GiST — **READY to verify on deploy dev** `SELECT * FROM stations; EXPLAIN SELECT * FROM parking_lots WHERE ST_DWithin(geom, ...)`
- Technical Steps:
  1. `CREATE EXTENSION postgis;`
  2. Definisikan `schema.prisma` sesuai §3.1 pakai `Unsupported("geography(Point,4326)")` untuk geom. Buat migration SQL manual untuk indexes & constraints (Prisma gak generate GiST otomatis — tambah via `migrations/*.sql` raw).
  3. Buat `geo.service.js` helper: `toGeoJSON`, `fromPoint(lon,lat)`, `findNearbyStations(lon,lat,radiusM)`.
  4. Seed 2 stasiun (Lempuyangan, Tugu) + 6 lot dummy (mix resmi/swadaya) dengan geom valid + entrance_geom.
  5. Verifikasi `SELECT * FROM stations` dan `SELECT ST_AsGeoJSON(geom) FROM parking_lots`.
- Prompt for Dev Agent: "Buat Prisma schema untuk tabel stations, parking_lots, observations, walk_distances, staging_survey_activities sesuai struktur SQL §3.1. Kolom geom pakai Unsupported PostGIS geography. Buatkan migration dan seed script untuk 2 stasiun: Lempuyangan dan Tugu + 6 parking lots. Pastikan GiST indexes dan CHECK constraints ter-apply via raw SQL migration. Buat geo.service.js yang wrap $queryRaw untuk ST_AsGeoJSON dan ST_GeogFromText. Fix BUG-004/005/006: tambah migration baru, fix fromPoint param binding, fix seed ON CONFLICT."
- DoD:
  - [x] Migration init jalan bersih
  - [ ] `SELECT * FROM stations` return 2 row + GiST verified via `EXPLAIN` — **PENDING** (migration belum lengkap)
  - [ ] Seed lot punya `kapasitas >0` dan 6 lots — **PENDING** (baru 3)
- Issues: BUG-004, BUG-005, BUG-006, BUG-007, BUG-008

### Milestone B — Core REST API (Read-only) (Hari 3-4) — ⬜ TODO

**TASK-003 — Endpoint stations & parking lots** — Status: ⬜ Todo

- Objective: `GET /api/v1/stations` dan `GET /api/v1/parking/:id` return data sesuai FR-1, FR-3, <500ms.
- Checklist:
  - [ ] Query stations + join parking_lots via Prisma, convert geom ke GeoJSON pakai `ST_AsGeoJSON` via `geo.service.js`
  - [ ] Response detail lot: kapasitas, tarif, tipe, sumber_data, is_active, updated_at, GeoJSON point
  - [ ] Validasi `:id` numeric via Zod, 404 envelope kalau gak ada, filter `is_active=true` default
  - [ ] Tambah `GET /api/v1/stats` & `GET /api/v1/stations/search?q=` untuk FR-15/16
  - [ ] Pagination `meta: {count}` future-proof
- Technical Steps: (same as v2)
- Prompt for Dev Agent: "Implementasikan GET /api/v1/stations yang return GeoJSON FeatureCollection berisi semua stations dan nested parking_lots-nya (hanya is_active=true). Implementasikan GET /api/v1/parking/:id yang return detail satu parking lot termasuk kapasitas_motor, kapasitas_mobil, tarif, tipe, sumber_data, updated_at, GeoJSON. Gunakan Prisma + geo.service.js, validasi id numeric dengan Zod, return 404 envelope kalau tidak ditemukan. Tambahkan GET /api/v1/stats dan search."
- DoD:
  - [ ] Endpoint return GeoJSON valid untuk 2 stasiun seed; <500ms; `curl /api/v1/parking/999` 404 envelope
- Issues: — (belum mulai, block by TASK-002 fix)

### Milestone C — Analytics Microservice (Python) (Hari 4-6) — ⬜ TODO

**TASK-004 — Estimasi median + confidence level** — Status: ⬜ Todo | ⚠️ PRD deviation FR-5

- Objective: `POST /analyze/estimate` implementasi FR-5, FR-6 dengan cache, support `vehicle` param.
- Checklist:
  - [ ] Query `observations` untuk `lot_id` × `ISODOW` × `hour`, hitung `rasio = (jumlah_motor + jumlah_mobil)/(kapasitas_total)*100` + per-type `motor/motor_cap` & `mobil/mobil_cap`
  - [ ] Median via `numpy.median`, `last_updated = MAX(observed_at)`
  - [ ] Fallback ±1 jam: pilih window `n` terbanyak, tie → terdekat, set `fallback_used` & `fallback_hour`
  - [ ] Confidence `0→tidak_tersedia, 1-2→rendah, 3-9→sedang, ≥10→tinggi`
  - [ ] LRU TTL 10m `cache.py` key `(lot_id, day, hour, vehicle)`, invalidate on insert
  - [ ] Support `vehicle=all|motor|mobil` untuk FR-15
- Technical Steps: same + tambah per-vehicle
- Prompt for Dev Agent: "Buat FastAPI endpoint POST /analyze/estimate menerima {lot_id, day, hour, vehicle}. Query observations pada lot_id x ISODOW x hour. Hitung median rasio keterisian pakai numpy.median untuk all + per-type. Fallback ±1h. Return {estimasi_pct, estimasi_motor_pct, estimasi_mobil_pct, confidence_level, n_observasi, fallback_used, fallback_hour, last_updated}. LRU cache TTL 10m."
- DoD:
  - [ ] Unit test 15 obs median & confidence benar; edge 0 obs → tidak_tersedia; fallback test hour 8 → fallback 7
- Issues: Deviasi FR-5 agregat only → fix with per-type

**TASK-005 — Skor Prioritas Parkir (SPP)** — Status: ⬜ Todo | 🔴 PRD deviation FR-8

- Objective: `POST /analyze/spp` FR-8, **revert ke PRD global max** (bukan batch max).
- Checklist:
  - [ ] Ambil estimasi (reuse estimate.py + cache) & `jarak_meter` dari `walk_distances` per lot
  - [ ] **FIX:** `Skor_Jarak = (1 - jarak / jarak_maks_global) *100` di mana `jarak_maks_global = MAX(jarak_meter) dari seluruh walk_distances` (sesuai PRD `jarak_maks_dalam_dataset=250m`, bukan batch max v2). Simpan also `Skor_Jarak_batch` untuk comparison jika mau.
  - [ ] `SPP = 0.70*Skor_Kapasitas + 0.30*Skor_Jarak`, sort descending
  - [ ] Handle `tidak_tersedia` → `Skor_Kapasitas=0` + `warning: "data_terbatas"`
  - [ ] Fallback Haversine kalau `walk_distances` kosong
- Technical Steps: same, fix jarak_maks
- Prompt for Dev Agent: "Buat POST /analyze/spp menerima {lot_ids, day, hour, vehicle}. Untuk tiap lot_id ambil estimasi + jarak_meter dari walk_distances (fallback Haversine). Hitung Skor_Kapasitas=(1-estimasi_pct/100)*100, Skor_Jarak=(1-jarak/jarak_maks_global)*100 di mana jarak_maks_global adalah MAX dari seluruh walk_distances (bukan batch). SPP=0.70*K+0.30*J. Return ranked list dengan breakdown. Verifikasi PRD example A=32.0 B=42.0."
- DoD:
  - [ ] Verifikasi PRD lampiran A=32.0 B=42.0 match persis
- Issues: 🔴 BUG-SPP — blueprint v2 batch max vs PRD global max

**TASK-006 — Walk distance via OSRM + cache** — Status: ⬜ Todo

- Objective: Isi/refresh `walk_distances` via OSRM foot (FR-7).
- Checklist:
  - [ ] `walk.py` + `POST /analyze/walk/refresh` query `entrance_geom` fallback `geom`
  - [ ] Panggil OSRM `/route/v1/foot/{lon1},{lat1};{lon2},{lat2}?overview=false`, parse distance & duration
  - [ ] Upsert `ON CONFLICT (lot_id, station_id) DO UPDATE`
  - [ ] Fallback Haversine `ST_Distance` kalau OSRM timeout >3s, `metode='haversine_fallback'`
  - [ ] Manual trigger only (bukan cron)
- Prompt for Dev Agent: "Buat walk.py query parking_lots + stations entrance_geom, panggil OSRM public API /route/v1/foot, upsert walk_distances. Fallback Haversine, log warning. Tambah POST /analyze/walk/refresh."
- DoD:
  - [ ] Semua lot punya walk_distance; selisih Haversine ≤15% untuk 5 titik uji
- Issues: —

### Milestone D — Integrasi Estimate & Compare Endpoint (Node) (Hari 6-7) — ⬜ TODO

**TASK-007 — Endpoint estimate & compare di API Node** — Status: ⬜ Todo

- Objective: `GET /api/v1/parking/:id/estimate` dan `GET /api/v1/parking/compare` (FR-4, FR-9), <3s p95.
- Checklist:
  - [ ] Validasi `day` 1-7, `hour` 0-23, `vehicle` enum, `ids` max 3 via Zod
  - [ ] Proxy ke Python `/analyze/estimate` / `/analyze/spp` via `analyticsClient.js` timeout 2.5s, retry 1x backoff 300ms, circuit breaker 3 fails → open 30s
  - [ ] Gabung hasil analytics + data statis lot (nama, tarif, kapasitas, GeoJSON), 6 field wajib never optional
  - [ ] `Cache-Control: public, max-age=60` + `X-Request-Id` propagate
- Prompt for Dev Agent: "Implementasikan GET /api/v1/parking/:id/estimate?day=&hour=&vehicle= di Express yang memanggil analytics /analyze/estimate dengan analyticsClient (timeout 2.5s, retry, circuit breaker). Gabungkan dengan data lot. Implementasikan compare?ids=1,2,3&day=&hour=&vehicle= validate max 3. Pastikan 6 field estimasi selalu ada, propagate X-Request-Id, Cache-Control 60s."
- DoD:
  - [ ] Response 6 field wajib; p95 <3s; circuit breaker test: analytics down → 503
- Issues: — block by TASK-004/005

### Milestone E — AI Insight Integration (Hari 7-9) — ⬜ TODO

**TASK-008 — Gemini proxy dengan payload terstruktur** — Status: ⬜ Todo

- Objective: `POST /api/v1/ai/insight` FR-10, FR-11 (no raw data).
- Checklist:
  - [ ] Terima `{lot_ids: number[], day, hour, vehicle}` validasi 1-3 lot
  - [ ] Ambil estimate/spp reuse TASK-007 (bukan query observations langsung)
  - [ ] Payload terstruktur `{lots: [{nama, estimasi_pct, estimasi_motor_pct, estimasi_mobil_pct, confidence, jarak, tarif, spp, last_updated}], context: {day,hour,vehicle}}`
  - [ ] System prompt ketat anti-halu + `temperature 0.3`, `GEMINI_API_KEY` dari env
  - [ ] Rate limit 10/menit/IP + log prompt+response tanpa key
- Prompt for Dev Agent: "Implementasikan POST /api/v1/ai/insight menerima {lot_ids, day, hour, vehicle}. Panggil estimate/spp untuk payload terstruktur (jangan raw observations). System prompt larang halu + warning >48 jam. Panggil Gemini API temp 0.3. Return {narasi, payload_terpakai, warnings[]}. Rate limit 10/menit."
- DoD:
  - [ ] Data usang >48 jam → peringatan; Network tab no API key; log no raw observations
- Issues: —

**TASK-009 — Uji akurasi AI (20 pertanyaan)** — Status: ⬜ Todo

- Objective: NFR Akurasi AI ≥90% dari 20 uji.
- Checklist:
  - [ ] 20 skenario variasi lot/day/hour termasuk edge 0 obs, >48 jam usang, fallback_used
  - [ ] Script `tests/ai_accuracy.test.js` simpan `ai_test_results.json`
  - [ ] Checker otomatis flag angka halu (regex numbers vs payload)
  - [ ] Manual review + revisi prompt dengan few-shot
- Prompt for Dev Agent: "Buat test script 20 kombinasi ke /api/v1/ai/insight, simpan ai_test_results.json. Checker flag angka tidak ada di payload. Laporan markdown."
- DoD:
  - [ ] ≥18/20 lolos; `docs/ai_accuracy_report.md` ada
- Issues: —

### Milestone F — Data Ingestion Pipeline (Hari 9-11) — ⬜ TODO

**TASK-010 — CSV import endpoint** — Status: ⬜ Todo

- Objective: `POST /api/v1/data/import` FR-13, aman & idempoten.
- Checklist:
  - [ ] Multer `limits: {5MB, files:1}`, `csv-parse`, header wajib `lot_id, observed_at, jumlah_motor, jumlah_mobil`
  - [ ] Validasi row: `lot_id` exist & `is_active`, `jumlah>=0`, `observed_at` ISO & tidak future, `jumlah <= kapasitas*1.5` warning
  - [ ] `prisma.$transaction` + `createMany(skipDuplicates:true)` idempoten
  - [ ] Scoped `X-API-Key` `INTERNAL_API_KEY_CSV`
  - [ ] Invalidate cache Python per `lot_id`
  - [ ] Return `summary: {total, inserted, skipped_duplicate, rejected, errors[]}`
- Prompt for Dev Agent: "Implementasikan POST /api/v1/data/import via multer 5MB csv-parse, validasi row, transaction skipDuplicates, protect X-API-Key csv_import, return summary, invalidate cache."
- DoD:
  - [ ] CSV 50 baris mix valid/invalid/duplicate → summary akurat, invalid tidak masuk DB, duplicate skip, no key → 401
- Issues: —

**TASK-011 — Sinkronisasi MAPID Survey Activities** — Status: ⬜ Todo | ⏰ Deadline Hari 3 decide webhook vs polling

- Objective: `POST /api/v1/data/staging/sync` + ETL FR-14.
- Checklist:
  - [ ] Riset Hari 1-3 webhook vs polling, lock di ADR
  - [ ] `POST /api/v1/data/staging/sync` terima JSON array/single, simpan `status='pending'`, return 202
  - [ ] `processStaging()` cron 5m / `POST /data/staging/process`: match lot_id via exact ID → ILIKE nama → ST_Distance <50m; insert `sumber='mapid_apps'`; else `needs_review`/`rejected`
  - [ ] Scoped `INTERNAL_API_KEY_MAPID`
- Prompt for Dev Agent: "Implementasikan POST /api/v1/data/staging/sync simpan raw_payload pending 202. Fungsi processStaging cron 5 menit / trigger manual: match lot_id exact/ILIKE/geom 50m, insert observations, update promoted. No delete, needs_review untuk audit. Protect mapid_sync."
- DoD:
  - [ ] Dummy MAPID → staging → promoted kalau match; gagal match → needs_review; decision terdokumentasi Hari 3
- Issues: —

### Milestone G — Security, Performance & Deployment (Hari 11-14) — ⬜ TODO

**TASK-012 — Hardening keamanan** — Status: ⬜ Todo

- Objective: NFR Keamanan.
- Checklist:
  - [ ] Audit write endpoints `apiKeyAuth` scoped (csv vs mapid vs admin)
  - [ ] `.env` + `.env.example` tanpa value, `config/env.js` fail fast
  - [ ] Semua query Prisma parameterized, `grep queryRaw.*+` = 0
  - [ ] CORS whitelist `FRONTEND_URL`, `credentials:false`
  - [ ] Rate limit `/ai/insight` 10/menit + global 100/menit
  - [ ] `helmet`, hide `X-Powered-By`
- Prompt for Dev Agent: "Review codebase: no raw concat, no secret hardcoded, write protected apiKeyAuth scoped. Tambah helmet, CORS FRONTEND_URL, rate limit, env.js fail fast."
- DoD:
  - [ ] Checklist tercentang; `.env.example` ada; rate limit verified; no key → 401
- Issues: BUG-008 (env incomplete)

**TASK-013 — Docker Compose production + Nginx** — Status: ⬜ Todo

- Objective: Deploy VPS §9 PRD.
- Checklist:
  - [ ] `docker-compose.prod.yml` `restart: unless-stopped`, volume `pgdata`, healthcheck `pg_isready` + api/analytics
  - [ ] Nginx reverse proxy `domain/api/*` → `api:3000`, `X-Request-Id`, HTTPS Let's Encrypt, gzip
  - [ ] `NODE_ENV=production`, `LOG_LEVEL=info`
  - [ ] Load test `autocannon -c 20 -d 30 /api/v1/parking/1/estimate` p95 <3000ms p50 <800ms
  - [ ] Auto-restart test `docker kill api → 200 after 10s`
- Prompt for Dev Agent: "Finalisasi docker-compose.prod.yml restart unless-stopped healthcheck pgdata. nginx.conf reverse proxy SSL gzip X-Request-Id. Script autocannon p95 <3000ms."
- DoD:
  - [ ] `docker compose -f docker-compose.prod.yml up -d` HTTPS ok, auto-restart verified, p95 pass
- Issues: BUG-001, BUG-009

**TASK-014 — Observability & Runbook** — Status: ⬜ Todo

- Objective: Debug pas demo tanpa panic.
- Checklist:
  - [ ] Pino JSON + structlog include `request_id, lot_id, latency_ms`
  - [ ] `GET /health` detail `{db, analytics, cache_size, uptime}` / `GET /metrics`
  - [ ] `docs/runbook.md` re-seed, re-run walk, re-process staging, rotate key
- Prompt for Dev Agent: "Tambah Pino logger request_id, structlog, perluas /health detail, docs/runbook.md."
- DoD:
  - [ ] Logs JSON, `curl /health` detail, runbook ada
- Issues: —

---

## 5. Definition of Done — Ringkasan Backend v2.1

| Area | Kriteria | Status |
|---|---|---|
| DB Schema | 5 tabel + entrance_geom ter-migrate, PostGIS + GiST aktif, CHECK & UNIQUE ter-enforce, `EXPLAIN` pakai index | 🟡 BUG-004 open |
| Core API | `GET /api/v1/stations`, `/parking/:id` GeoJSON valid <500ms, envelope, 404, plus `/stats` & `/search` FR-15/16 | ⬜ Todo |
| Estimate/SPP | Match PRD example (A=32.0, B=42.0) **global max**, confidence akurat, fallback `fallback_hour`, cache HIT <50ms, per-vehicle | ⬜ Todo |
| Compare | Return ≤3 lot ranked SPP dengan breakdown, handle `tidak_tersedia` warning | ⬜ Todo |
| AI Insight | ≥90% dari 20 uji konsisten, peringatan usang/terbatas, API key never exposed, payload audit logged | ⬜ Todo |
| Data Pipeline | CSV idempoten + 5MB + validation, staging `needs_review` tidak hilang, scoped keys | ⬜ Todo |
| Security | Scoped write keys, no raw concat, Helmet, CORS whitelist, rate limit, env validated | 🟡 BUG-008 open |
| Deployment | Compose `unless-stopped` + healthcheck, Nginx HTTPS gzip, p95 <3s, auto-restart verified | 🟡 BUG-001/009 open |
| Observability | Request-id propagate Node→Python, structured logs, runbook | ⬜ Todo |

---

## 6. Catatan Risiko Spesifik Backend v2.1

- **R3 (halusinasi AI)** — mitigasi: `TASK-008` payload terstruktur + `temperature 0.3` + anti-halu prompt + halu-detector angka luar payload. Gemini never lihat raw observations.
- **R4 (constraint MAPID)** — **hard deadline Hari 3** decide webhook vs polling. TASK-011 async 202 + cron jadi webhook/polling tetap staging sama.
- **R1 (observasi <3)** — handle di `TASK-004` confidence `rendah` jujur, FE show badge `Data terbatas (n=2)`.
- **OSRM down** — fallback Haversine `TASK-006`, walk_distances tetap keisi.
- **Prisma+PostGIS friction** — `geo.service.js` wrapper + raw migration GiST, jangan scatter `ST_*` di controller.
- **NEW R-SPP:** Deviasi SPP batch vs global — fix di TASK-005 revert ke PRD global max.
- **NEW R-Vehicle:** FR-5/15 butuh per-type estimate — fix di TASK-004 tambah `vehicle` param.

---

## 7. Prioritization — Kalau Waktu Mepet

| Priority | TASK | Boleh di-cut? | Status now |
|---|---|---|---|
| P0 — Must | 001, 002, 003, 004, 005, 007, 010 | Tidak | 001/002 🟡, sisanya ⬜ |
| P1 — Should | 006 (Haversine dulu), 008, 012, 013 | Usahakan | ⬜ |
| P2 — Nice | 009 (10 test dulu), 011 manual, 014 | Cut H-2 | ⬜ |

> **Cut strategy:** OSRM → Haversine only, AI 20 → 10 test, MAPID sync → manual CSV import dulu. Core estimate/compare 100% jalan.

---

## 8. Next Actions — Untuk Scaffolding Task 1 & 2 (Before lanjut Task 3)

Prioritas fix bug scaffolding sebelum lanjut:

1. **[ ] BUG-001** Buat `docker-compose.yml` + `docker-compose.prod.yml` (TASK-001)
2. **[ ] BUG-004** Buat migration `20260901_add_indexes_checks` — GiST + CHECK + trigger (TASK-002)
3. **[ ] BUG-005** Fix `geo.service.js:6-14` param binding + whitelist (TASK-002)
4. **[ ] BUG-006** Fix `seed.js` — 6 lots + transaction + ON CONFLICT fix (TASK-002)
5. **[ ] BUG-002** Wire `app.js` routes + helmet/cors/env (TASK-001)
6. **[ ] BUG-008** Buat `.env.example` + `config/env.js` (TASK-002/012)

Checklist di atas bisa jadi kanban — centang `[x]` pas done, update tabel BUG menjadi `✅ Fixed`.

---

*End of Blueprint v2.1 — scaffolding audited, planning ready. Update daily via checklist & BUG registry.*
