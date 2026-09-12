-- =============================================================
-- CrowdPark AI — Sample Seed Data
-- Studi Kasus: Stasiun Tugu & Lempuyangan, Yogyakarta
-- Jalankan setelah migration 20260911_init.sql
-- =============================================================

-- Pastikan tidak ada duplikat
TRUNCATE TABLE observations RESTART IDENTITY CASCADE;
TRUNCATE TABLE walk_distances RESTART IDENTITY CASCADE;
TRUNCATE TABLE parking_lots RESTART IDENTITY CASCADE;
TRUNCATE TABLE stations RESTART IDENTITY CASCADE;

-- =============================================================
-- STATIONS
-- =============================================================

INSERT INTO stations (id, nama, kota, geom, entrance_geom) VALUES
(
  1,
  'Stasiun Yogyakarta',
  'Yogyakarta',
  ST_SetSRID(ST_MakePoint(110.36440, -7.78921), 4326),
  ST_SetSRID(ST_MakePoint(110.36440, -7.78921), 4326)
),
(
  2,
  'Stasiun Lempuyangan',
  'Yogyakarta',
  ST_SetSRID(ST_MakePoint(110.37184, -7.78564), 4326),
  ST_SetSRID(ST_MakePoint(110.37184, -7.78564), 4326)
);

-- Reset sequence
SELECT setval('stations_id_seq', 2);

-- =============================================================
-- PARKING LOTS
-- Sekitar Stasiun Tugu (station_id=1) dan Lempuyangan (station_id=2)
-- =============================================================

INSERT INTO parking_lots (
  id, station_id, nama, tipe,
  kapasitas_motor, kapasitas_mobil,
  tarif_motor, tarif_mobil,
  jam_operasional, geom, sumber_data, is_active
) VALUES

-- Sekitar Stasiun Tugu
(
  1, 1,
  'Parkir Malioboro Mall',
  'Gedung parkir komersial',
  300, 120,
  3000, 5000,
  '08:00-22:00',
  ST_SetSRID(ST_MakePoint(110.36611, -7.79223), 4326),
  'survey_lapangan',
  TRUE
),
(
  2, 1,
  'Parkir Stasiun Tugu (Resmi)',
  'Kantong parkir resmi pengelola',
  200, 60,
  5000, 10000,
  '05:00-23:00',
  ST_SetSRID(ST_MakePoint(110.36355, -7.78875), 4326),
  'survey_lapangan',
  TRUE
),
(
  3, 1,
  'Parkir Jl. Perwakilan Selatan',
  'Parkir tepi jalan swadaya',
  150, 0,
  2000, NULL,
  '24 jam',
  ST_SetSRID(ST_MakePoint(110.36511, -7.79350), 4326),
  'survey_lapangan',
  TRUE
),
(
  4, 1,
  'Parkir Abu Bakar Ali',
  'Kantong parkir pemkot',
  500, 80,
  2000, 3000,
  '06:00-22:00',
  ST_SetSRID(ST_MakePoint(110.36815, -7.79137), 4326),
  'survey_lapangan',
  TRUE
),
(
  5, 1,
  'Parkir DPRD DIY',
  'Parkir sisi selatan badan jalan',
  0, 40,
  NULL, 2000,
  '06:00-22:00',
  ST_SetSRID(ST_MakePoint(110.36602, -7.79468), 4326),
  'survey_lapangan',
  TRUE
),

-- Sekitar Stasiun Lempuyangan
(
  6, 2,
  'Parkir Timur Lempuyangan',
  'Kantong parkir publik',
  250, 0,
  3000, NULL,
  '24 jam',
  ST_SetSRID(ST_MakePoint(110.37280, -7.78615), 4326),
  'survey_lapangan',
  TRUE
),
(
  7, 2,
  'Parkir Selatan Lempuyangan',
  'Parkir swadaya warga',
  180, 20,
  2000, 3000,
  '05:30-22:00',
  ST_SetSRID(ST_MakePoint(110.37135, -7.78756), 4326),
  'survey_lapangan',
  TRUE
),
(
  8, 2,
  'Parkir Barat Lempuyangan',
  'Parkir tepi jalan swadaya',
  120, 0,
  2000, NULL,
  '24 jam',
  ST_SetSRID(ST_MakePoint(110.37020, -7.78580), 4326),
  'survey_lapangan',
  TRUE
);

SELECT setval('parking_lots_id_seq', 8);

-- =============================================================
-- WALK DISTANCES (jarak jalan kaki ke pintu stasiun)
-- =============================================================

INSERT INTO walk_distances (lot_id, station_id, jarak_meter, durasi_detik, metode) VALUES
-- Sekitar Tugu
(1, 1, 412,  299, 'osrm_foot'),  -- Malioboro Mall
(2, 1,  85,   61, 'osrm_foot'),  -- Parkir Resmi Tugu
(3, 1, 510,  368, 'osrm_foot'),  -- Jl. Perwakilan
(4, 1, 630,  454, 'osrm_foot'),  -- Abu Bakar Ali
(5, 1, 720,  518, 'osrm_foot'),  -- DPRD DIY
-- Sekitar Lempuyangan
(6, 2, 165,  119, 'osrm_foot'),  -- Timur Lempuyangan
(7, 2, 280,  202, 'osrm_foot'),  -- Selatan Lempuyangan
(8, 2, 195,  140, 'osrm_foot');  -- Barat Lempuyangan

-- =============================================================
-- OBSERVATIONS — Data historis keterisian
-- Snapshot di berbagai jam dan hari
-- =============================================================

-- Helper: tanggal referensi Senin s.d. Minggu minggu lalu
-- lot_id=1 (Malioboro Mall) — ramai siang dan sore
INSERT INTO observations (lot_id, observed_at, jumlah_motor, jumlah_mobil, sumber) VALUES
-- Senin
(1, '2026-09-07 07:00:00+07', 80,  30, 'survey_lapangan'),
(1, '2026-09-07 09:00:00+07', 140, 50, 'survey_lapangan'),
(1, '2026-09-07 12:00:00+07', 220, 90, 'survey_lapangan'),
(1, '2026-09-07 15:00:00+07', 255, 105,'survey_lapangan'),
(1, '2026-09-07 18:00:00+07', 280, 115,'survey_lapangan'),
(1, '2026-09-07 20:00:00+07', 200, 80, 'survey_lapangan'),
-- Sabtu (padat)
(1, '2026-09-06 09:00:00+07', 210, 100,'survey_lapangan'),
(1, '2026-09-06 12:00:00+07', 290, 118,'survey_lapangan'),
(1, '2026-09-06 15:00:00+07', 300, 120,'survey_lapangan'),
(1, '2026-09-06 18:00:00+07', 295, 119,'survey_lapangan'),
-- Minggu
(1, '2026-08-31 10:00:00+07', 240, 108,'survey_lapangan'),
(1, '2026-08-31 14:00:00+07', 298, 119,'survey_lapangan');

-- lot_id=2 (Parkir Resmi Tugu) — padat di jam keberangkatan pagi dan sore
INSERT INTO observations (lot_id, observed_at, jumlah_motor, jumlah_mobil, sumber) VALUES
(2, '2026-09-07 06:00:00+07', 60,  20, 'survey_lapangan'),
(2, '2026-09-07 07:30:00+07', 130, 45, 'survey_lapangan'),
(2, '2026-09-07 09:00:00+07', 170, 55, 'survey_lapangan'),
(2, '2026-09-07 12:00:00+07', 140, 40, 'survey_lapangan'),
(2, '2026-09-07 16:00:00+07', 160, 48, 'survey_lapangan'),
(2, '2026-09-07 18:30:00+07', 190, 58, 'survey_lapangan'),
(2, '2026-09-07 20:00:00+07', 100, 25, 'survey_lapangan'),
(2, '2026-09-06 08:00:00+07', 120, 38, 'survey_lapangan'),
(2, '2026-09-06 13:00:00+07', 165, 50, 'survey_lapangan'),
(2, '2026-09-06 18:00:00+07', 195, 59, 'survey_lapangan'),
(2, '2026-09-05 07:30:00+07', 125, 40, 'survey_lapangan'),
(2, '2026-09-05 17:00:00+07', 180, 55, 'survey_lapangan');

-- lot_id=3 (Jl. Perwakilan Selatan) — relatif kosong, hanya motor
INSERT INTO observations (lot_id, observed_at, jumlah_motor, jumlah_mobil, sumber) VALUES
(3, '2026-09-07 08:00:00+07', 40,  0, 'survey_lapangan'),
(3, '2026-09-07 12:00:00+07', 90,  0, 'survey_lapangan'),
(3, '2026-09-07 17:00:00+07', 130, 0, 'survey_lapangan'),
(3, '2026-09-07 20:00:00+07', 110, 0, 'survey_lapangan'),
(3, '2026-09-06 10:00:00+07', 70,  0, 'survey_lapangan'),
(3, '2026-09-06 16:00:00+07', 140, 0, 'survey_lapangan'),
(3, '2026-09-06 19:00:00+07', 148, 0, 'survey_lapangan'),
(3, '2026-09-05 08:00:00+07', 35,  0, 'survey_lapangan'),
(3, '2026-09-05 17:00:00+07', 120, 0, 'survey_lapangan'),
(3, '2026-09-04 12:00:00+07', 80,  0, 'survey_lapangan');

-- lot_id=4 (Abu Bakar Ali) — kapasitas besar, padat di malam hari wisata
INSERT INTO observations (lot_id, observed_at, jumlah_motor, jumlah_mobil, sumber) VALUES
(4, '2026-09-07 09:00:00+07', 100, 20, 'survey_lapangan'),
(4, '2026-09-07 13:00:00+07', 250, 55, 'survey_lapangan'),
(4, '2026-09-07 17:00:00+07', 400, 70, 'survey_lapangan'),
(4, '2026-09-07 19:00:00+07', 490, 78, 'survey_lapangan'),
(4, '2026-09-06 10:00:00+07', 180, 35, 'survey_lapangan'),
(4, '2026-09-06 14:00:00+07', 350, 65, 'survey_lapangan'),
(4, '2026-09-06 18:00:00+07', 480, 79, 'survey_lapangan'),
(4, '2026-09-06 20:00:00+07', 495, 80, 'survey_lapangan'),
(4, '2026-09-05 17:30:00+07', 420, 72, 'survey_lapangan'),
(4, '2026-09-04 18:00:00+07', 380, 68, 'survey_lapangan');

-- lot_id=5 (DPRD DIY) — hanya mobil, jarang diisi
INSERT INTO observations (lot_id, observed_at, jumlah_motor, jumlah_mobil, sumber) VALUES
(5, '2026-09-07 09:00:00+07', 0,  8,  'survey_lapangan'),
(5, '2026-09-07 14:00:00+07', 0,  18, 'survey_lapangan'),
(5, '2026-09-07 18:00:00+07', 0,  30, 'survey_lapangan'),
(5, '2026-09-06 10:00:00+07', 0,  15, 'survey_lapangan'),
(5, '2026-09-06 19:00:00+07', 0,  38, 'survey_lapangan'),
(5, '2026-09-05 18:00:00+07', 0,  25, 'survey_lapangan');

-- lot_id=6 (Timur Lempuyangan) — sering padat pagi karena perbaikan jalan
INSERT INTO observations (lot_id, observed_at, jumlah_motor, jumlah_mobil, sumber) VALUES
(6, '2026-09-07 06:30:00+07', 120, 0, 'survey_lapangan'),
(6, '2026-09-07 08:00:00+07', 200, 0, 'survey_lapangan'),
(6, '2026-09-07 10:00:00+07', 240, 0, 'survey_lapangan'),
(6, '2026-09-07 13:00:00+07', 170, 0, 'survey_lapangan'),
(6, '2026-09-07 17:00:00+07', 245, 0, 'survey_lapangan'),
(6, '2026-09-06 07:30:00+07', 180, 0, 'survey_lapangan'),
(6, '2026-09-06 11:00:00+07', 230, 0, 'survey_lapangan'),
(6, '2026-09-06 16:00:00+07', 248, 0, 'survey_lapangan'),
(6, '2026-09-05 08:00:00+07', 160, 0, 'survey_lapangan'),
(6, '2026-09-05 17:30:00+07', 238, 0, 'survey_lapangan'),
(6, '2026-09-04 07:00:00+07', 145, 0, 'survey_lapangan'),
(6, '2026-09-04 16:00:00+07', 220, 0, 'survey_lapangan');

-- lot_id=7 (Selatan Lempuyangan)
INSERT INTO observations (lot_id, observed_at, jumlah_motor, jumlah_mobil, sumber) VALUES
(7, '2026-09-07 07:00:00+07', 50,  5,  'survey_lapangan'),
(7, '2026-09-07 09:00:00+07', 100, 10, 'survey_lapangan'),
(7, '2026-09-07 13:00:00+07', 135, 15, 'survey_lapangan'),
(7, '2026-09-07 17:00:00+07', 160, 19, 'survey_lapangan'),
(7, '2026-09-06 08:00:00+07', 80,  8,  'survey_lapangan'),
(7, '2026-09-06 15:00:00+07', 140, 17, 'survey_lapangan'),
(7, '2026-09-06 19:00:00+07', 175, 20, 'survey_lapangan'),
(7, '2026-09-05 09:00:00+07', 95,  9,  'survey_lapangan'),
(7, '2026-09-05 16:30:00+07', 150, 16, 'survey_lapangan'),
(7, '2026-09-04 10:00:00+07', 70,  7,  'survey_lapangan');

-- lot_id=8 (Barat Lempuyangan)
INSERT INTO observations (lot_id, observed_at, jumlah_motor, jumlah_mobil, sumber) VALUES
(8, '2026-09-07 07:30:00+07', 30,  0, 'survey_lapangan'),
(8, '2026-09-07 10:00:00+07', 65,  0, 'survey_lapangan'),
(8, '2026-09-07 14:00:00+07', 88,  0, 'survey_lapangan'),
(8, '2026-09-07 18:00:00+07', 115, 0, 'survey_lapangan'),
(8, '2026-09-06 09:00:00+07', 50,  0, 'survey_lapangan'),
(8, '2026-09-06 14:00:00+07', 95,  0, 'survey_lapangan'),
(8, '2026-09-06 18:00:00+07', 118, 0, 'survey_lapangan'),
(8, '2026-09-05 08:30:00+07', 40,  0, 'survey_lapangan'),
(8, '2026-09-05 17:00:00+07', 105, 0, 'survey_lapangan'),
(8, '2026-09-04 11:00:00+07', 60,  0, 'survey_lapangan');
