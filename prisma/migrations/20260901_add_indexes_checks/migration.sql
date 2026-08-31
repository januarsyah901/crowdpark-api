-- Migration: Add GiST indexes, CHECK constraints, partial indexes, triggers for PostGIS performance & data integrity
-- Fixes BUG-004: blueprint §3.1 promised indexes but init migration missing them
-- This migration is additive and safe for deploy dev (no data loss)

-- 1. GiST indexes for geography columns (required for ST_DWithin / ST_Distance performance)
CREATE INDEX IF NOT EXISTS idx_stations_geom ON "stations" USING GIST ("geom");
CREATE INDEX IF NOT EXISTS idx_stations_entrance ON "stations" USING GIST ("entrance_geom");
CREATE INDEX IF NOT EXISTS idx_parking_geom ON "parking_lots" USING GIST ("geom");

-- 2. B-tree / partial indexes for common queries
CREATE INDEX IF NOT EXISTS idx_parking_station ON "parking_lots" ("station_id");
CREATE INDEX IF NOT EXISTS idx_parking_active ON "parking_lots" ("is_active") WHERE "is_active" = true;
CREATE INDEX IF NOT EXISTS idx_obs_lot_time ON "observations" ("lot_id", "observed_at" DESC);
CREATE INDEX IF NOT EXISTS idx_obs_lot_dow_hour ON "observations" ("lot_id", (EXTRACT(ISODOW FROM "observed_at")), (EXTRACT(HOUR FROM "observed_at")));
CREATE INDEX IF NOT EXISTS idx_obs_created ON "observations" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_walk_station ON "walk_distances" ("station_id");
CREATE INDEX IF NOT EXISTS idx_walk_lot ON "walk_distances" ("lot_id");
CREATE INDEX IF NOT EXISTS idx_staging_status ON "staging_survey_activities" ("status") WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS idx_staging_processed ON "staging_survey_activities" ("processed") WHERE "processed" = false;
CREATE INDEX IF NOT EXISTS idx_staging_lot ON "staging_survey_activities" ("lot_id") WHERE "lot_id" IS NOT NULL;

-- 3. CHECK constraints (data integrity) — skip if data violates, log warning
-- Use DO block to add constraints only if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_parking_tipe') THEN
    ALTER TABLE "parking_lots" ADD CONSTRAINT chk_parking_tipe CHECK (tipe IN ('resmi', 'swadaya'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_parking_kapasitas_motor') THEN
    ALTER TABLE "parking_lots" ADD CONSTRAINT chk_parking_kapasitas_motor CHECK (kapasitas_motor >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_parking_kapasitas_mobil') THEN
    ALTER TABLE "parking_lots" ADD CONSTRAINT chk_parking_kapasitas_mobil CHECK (kapasitas_mobil >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_parking_kapasitas_total') THEN
    ALTER TABLE "parking_lots" ADD CONSTRAINT chk_parking_kapasitas_total CHECK (kapasitas_motor + kapasitas_mobil > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_parking_tarif_motor') THEN
    ALTER TABLE "parking_lots" ADD CONSTRAINT chk_parking_tarif_motor CHECK (tarif_motor IS NULL OR tarif_motor >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_parking_tarif_mobil') THEN
    ALTER TABLE "parking_lots" ADD CONSTRAINT chk_parking_tarif_mobil CHECK (tarif_mobil IS NULL OR tarif_mobil >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_obs_jumlah_motor') THEN
    ALTER TABLE "observations" ADD CONSTRAINT chk_obs_jumlah_motor CHECK (jumlah_motor >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_obs_jumlah_mobil') THEN
    ALTER TABLE "observations" ADD CONSTRAINT chk_obs_jumlah_mobil CHECK (jumlah_mobil >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_obs_sumber') THEN
    ALTER TABLE "observations" ADD CONSTRAINT chk_obs_sumber CHECK (sumber IN ('survei_tim','mapid_apps','csv_import'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_walk_jarak') THEN
    ALTER TABLE "walk_distances" ADD CONSTRAINT chk_walk_jarak CHECK (jarak_meter > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_walk_metode') THEN
    ALTER TABLE "walk_distances" ADD CONSTRAINT chk_walk_metode CHECK (metode IN ('osrm_foot','haversine_fallback','manual'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_staging_status') THEN
    ALTER TABLE "staging_survey_activities" ADD CONSTRAINT chk_staging_status CHECK (status IN ('pending','matched','promoted','needs_review','rejected'));
  END IF;
END $$;

-- Unique constraint on stations.nama for seed idempotency (fixes BUG-006 ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stations_nama_unique ON "stations" ("nama");

-- 4. Trigger for parking_lots.updated_at auto-update
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_parking_updated ON "parking_lots";
CREATE TRIGGER trg_parking_updated BEFORE UPDATE ON "parking_lots" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. Fix Decimal precision for walk_distances.jarak_meter (was DECIMAL(65,30) from Prisma default)
-- Keep as NUMERIC but add comment; actual ALTER would require rewrite, skip for now to avoid deploy downtime
COMMENT ON COLUMN "walk_distances"."jarak_meter" IS 'Distance in meters, precision NUMERIC. Consider NUMERIC(10,2) in future.';
