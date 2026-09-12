-- =============================================================
-- CrowdPark AI — Database Schema for Supabase (PostGIS)
-- Deploy via: Supabase Dashboard → SQL Editor, or supabase db push
-- =============================================================

-- Enable PostGIS & pgcrypto extensions (pre-enabled on Supabase)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================
-- TABLE: stations
-- =============================================================
CREATE TABLE IF NOT EXISTS stations (
  id             SERIAL PRIMARY KEY,
  nama           TEXT NOT NULL,
  kota           TEXT NOT NULL,
  geom           GEOGRAPHY(Point, 4326),
  entrance_geom  GEOGRAPHY(Point, 4326),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- TABLE: parking_lots
-- =============================================================
CREATE TABLE IF NOT EXISTS parking_lots (
  id               SERIAL PRIMARY KEY,
  station_id       INT NOT NULL REFERENCES stations(id) ON DELETE RESTRICT,
  nama             TEXT NOT NULL,
  tipe             TEXT NOT NULL,
  kapasitas_motor  INT NOT NULL DEFAULT 0,
  kapasitas_mobil  INT NOT NULL DEFAULT 0,
  tarif_motor      INT,
  tarif_mobil      INT,
  jam_operasional  TEXT,
  geom             GEOGRAPHY(Point, 4326),
  sumber_data      TEXT,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- TABLE: observations (real-time occupancy data)
-- =============================================================
CREATE TABLE IF NOT EXISTS observations (
  id            BIGSERIAL PRIMARY KEY,
  lot_id        INT NOT NULL REFERENCES parking_lots(id) ON DELETE RESTRICT,
  observed_at   TIMESTAMPTZ NOT NULL,
  jumlah_motor  INT NOT NULL DEFAULT 0,
  jumlah_mobil  INT NOT NULL DEFAULT 0,
  sumber        TEXT NOT NULL,
  catatan       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (lot_id, observed_at, sumber)
);

-- =============================================================
-- TABLE: walk_distances (pre-computed walking distances)
-- =============================================================
CREATE TABLE IF NOT EXISTS walk_distances (
  id            SERIAL PRIMARY KEY,
  lot_id        INT NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  station_id    INT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  jarak_meter   NUMERIC NOT NULL,
  durasi_detik  INT,
  metode        TEXT NOT NULL DEFAULT 'osrm_foot',
  dihitung_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (lot_id, station_id)
);

-- =============================================================
-- TABLE: user_saved_spots (per-user saved parking)
-- Links to Supabase Auth uid
-- =============================================================
CREATE TABLE IF NOT EXISTS user_saved_spots (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lot_id     INT  NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  saved_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, lot_id)
);

-- =============================================================
-- TABLE: user_vehicles (per-user registered vehicles)
-- =============================================================
CREATE TABLE IF NOT EXISTS user_vehicles (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nama       TEXT NOT NULL,
  tipe       TEXT NOT NULL CHECK (tipe IN ('motor', 'mobil')),
  plat       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- SEED: Stasiun Yogyakarta (Tugu)
-- =============================================================
INSERT INTO stations (nama, kota, geom, entrance_geom)
VALUES (
  'Stasiun Yogyakarta',
  'Yogyakarta',
  ST_SetSRID(ST_MakePoint(110.3644, -7.7892), 4326),
  ST_SetSRID(ST_MakePoint(110.3644, -7.7892), 4326)
) ON CONFLICT DO NOTHING;

-- SEED: Parkir Timur Lempuyangan (referencing station id=1)
INSERT INTO parking_lots (station_id, nama, tipe, kapasitas_motor, kapasitas_mobil, tarif_motor, tarif_mobil, geom, jam_operasional, sumber_data)
VALUES (
  1,
  'Parkir Timur Lempuyangan',
  'Kantong parkir publik',
  250, 0,
  3000, NULL,
  ST_SetSRID(ST_MakePoint(110.3667, -7.7908), 4326),
  '24 jam',
  'survey_lapangan'
) ON CONFLICT DO NOTHING;

-- =============================================================
-- RLS (Row Level Security) Policies
-- =============================================================

-- parking_lots & stations: publicly readable
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE walk_distances ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_saved_spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_vehicles ENABLE ROW LEVEL SECURITY;

-- Public SELECT policies
CREATE POLICY "Public read stations"       ON stations       FOR SELECT USING (TRUE);
CREATE POLICY "Public read parking_lots"   ON parking_lots   FOR SELECT USING (TRUE);
CREATE POLICY "Public read observations"   ON observations   FOR SELECT USING (TRUE);
CREATE POLICY "Public read walk_distances" ON walk_distances FOR SELECT USING (TRUE);

-- user_saved_spots: only owner can read/write
CREATE POLICY "Users read own saved spots"
  ON user_saved_spots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own saved spots"
  ON user_saved_spots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own saved spots"
  ON user_saved_spots FOR DELETE USING (auth.uid() = user_id);

-- user_vehicles: only owner can read/write
CREATE POLICY "Users read own vehicles"
  ON user_vehicles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage own vehicles"
  ON user_vehicles FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================
-- HELPER VIEW: parking_lots_geojson (convenience for FE)
-- Returns geom as GeoJSON lon/lat for direct use
-- =============================================================
CREATE OR REPLACE VIEW parking_lots_geo AS
SELECT
  pl.id,
  pl.station_id,
  pl.nama,
  pl.tipe,
  pl.kapasitas_motor,
  pl.kapasitas_mobil,
  pl.tarif_motor,
  pl.tarif_mobil,
  pl.jam_operasional,
  pl.sumber_data,
  pl.is_active,
  pl.updated_at,
  ST_Y(pl.geom::geometry) AS lat,
  ST_X(pl.geom::geometry) AS lng,
  wd.jarak_meter,
  wd.durasi_detik
FROM parking_lots pl
LEFT JOIN walk_distances wd ON wd.lot_id = pl.id AND wd.station_id = pl.station_id
WHERE pl.is_active = TRUE;
