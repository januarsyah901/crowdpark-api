-- CreateTable
CREATE TABLE "stations" (
    "id" SERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "kota" TEXT NOT NULL,
    "geom" geography(Point,4326) NOT NULL,
    "entrance_geom" geography(Point,4326),
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_lots" (
    "id" SERIAL NOT NULL,
    "station_id" INTEGER NOT NULL,
    "nama" TEXT NOT NULL,
    "tipe" TEXT NOT NULL,
    "kapasitas_motor" INTEGER NOT NULL DEFAULT 0,
    "kapasitas_mobil" INTEGER NOT NULL DEFAULT 0,
    "tarif_motor" INTEGER,
    "tarif_mobil" INTEGER,
    "jam_operasional" TEXT,
    "geom" geography(Point,4326) NOT NULL,
    "sumber_data" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observations" (
    "id" BIGSERIAL NOT NULL,
    "lot_id" INTEGER NOT NULL,
    "observed_at" TIMESTAMPTZ NOT NULL,
    "jumlah_motor" INTEGER NOT NULL DEFAULT 0,
    "jumlah_mobil" INTEGER NOT NULL DEFAULT 0,
    "sumber" TEXT NOT NULL,
    "catatan" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "walk_distances" (
    "id" SERIAL NOT NULL,
    "lot_id" INTEGER NOT NULL,
    "station_id" INTEGER NOT NULL,
    "jarak_meter" DECIMAL(65,30) NOT NULL,
    "durasi_detik" INTEGER,
    "metode" TEXT NOT NULL DEFAULT 'osrm_foot',
    "dihitung_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "walk_distances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_survey_activities" (
    "id" BIGSERIAL NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "lot_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_reason" TEXT,
    "processed" BOOLEAN DEFAULT false,
    "received_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ,

    CONSTRAINT "staging_survey_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "observations_lot_id_observed_at_sumber_key" ON "observations"("lot_id", "observed_at", "sumber");

-- CreateIndex
CREATE UNIQUE INDEX "walk_distances_lot_id_station_id_key" ON "walk_distances"("lot_id", "station_id");

-- AddForeignKey
ALTER TABLE "parking_lots" ADD CONSTRAINT "parking_lots_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "parking_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_distances" ADD CONSTRAINT "walk_distances_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "parking_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_distances" ADD CONSTRAINT "walk_distances_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_survey_activities" ADD CONSTRAINT "staging_survey_activities_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "parking_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
