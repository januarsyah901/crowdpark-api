# Runbook — CrowdPark AI Backend

> Versi: 2.1 | Terakhir diupdate: 2 Sep 2026

Panduan operasional untuk debugging, maintenance, dan recovery di production.

---

## Quick Reference

| Aksi | Command |
|---|---|
| Status semua service | `docker compose ps` |
| Lihat log api | `docker compose logs -f api --tail=100` |
| Lihat log ml | `docker compose logs -f ml --tail=100` |
| Restart api | `docker compose restart api` |
| Health check | `curl http://localhost:3000/health` |
| Masuk psql | `docker compose exec db psql -U crowdpark -d crowdpark` |

---

## 1. Re-Seed Database

Jalankan seed ulang (idempotent, aman diulang):

```bash
docker compose exec api npx prisma db seed
```

Kalau seed error karena stations sudah ada, aman — seed pakai `ON CONFLICT DO UPDATE`.

Verifikasi hasil:

```sql
SELECT id, nama, kota FROM stations;
SELECT id, station_id, nama, tipe, kapasitas_motor, kapasitas_mobil FROM parking_lots;
SELECT COUNT(*) FROM observations;
```

---

## 2. Re-Run Walk Distances (OSRM/Haversine)

Trigger kalkulasi ulang walk_distances via API:

```bash
curl -X POST http://localhost:8000/analyze/walk/refresh
```

Verifikasi:

```sql
SELECT pl.nama, wd.jarak_meter, wd.metode 
FROM walk_distances wd
JOIN parking_lots pl ON pl.id = wd.lot_id;
```

---

## 3. Re-Process Staging MAPID

Trigger ETL manual dari staging → observations:

```bash
curl -X POST http://localhost:3000/api/v1/data/staging/process \
  -H "X-API-Key: $INTERNAL_API_KEY_ADMIN"
```

Cek status staging:

```sql
SELECT status, COUNT(*) FROM staging_survey_activities GROUP BY status;
SELECT id, raw_payload, error_reason FROM staging_survey_activities 
WHERE status = 'needs_review' LIMIT 10;
```

---

## 4. CSV Import Data

```bash
curl -X POST http://localhost:3000/api/v1/data/import \
  -H "X-API-Key: $INTERNAL_API_KEY_CSV" \
  -F "file=@/path/to/data.csv"
```

Format CSV yang valid:

```csv
lot_id,observed_at,jumlah_motor,jumlah_mobil,catatan
1,2026-09-01T08:00:00Z,150,20,survei pagi
2,2026-09-01T08:00:00Z,200,15,
```

---

## 5. Rotate API Keys

1. Generate key baru: `openssl rand -hex 32`
2. Update di `.env` atau CapRover Dashboard → App Config → Environment Variables
3. Restart api: `docker compose restart api`

Keys yang perlu dirotate:
- `INTERNAL_API_KEY_CSV` — untuk CSV import
- `INTERNAL_API_KEY_MAPID` — untuk MAPID sync
- `INTERNAL_API_KEY_ADMIN` — untuk ETL trigger

---

## 6. Debug Estimate/SPP

Cek ML service langsung:

```bash
# Test estimate
curl -X POST http://localhost:8000/analyze/estimate \
  -H "Content-Type: application/json" \
  -d '{"lot_id": 1, "day": 1, "hour": 8, "vehicle": "all"}'

# Test SPP
curl -X POST http://localhost:8000/analyze/spp \
  -H "Content-Type: application/json" \
  -d '{"lot_ids": [1, 2, 3], "day": 1, "hour": 8, "vehicle": "all"}'
```

Kalau ML down, api return 503 `ML_UNAVAILABLE`. Restart ML:

```bash
docker compose restart ml
```

---

## 7. Database Recovery

Backup:

```bash
docker compose exec db pg_dump -U crowdpark crowdpark > backup_$(date +%Y%m%d).sql
```

Restore:

```bash
cat backup_20260901.sql | docker compose exec -T db psql -U crowdpark crowdpark
```

Reset total (HATI-HATI — hapus semua data):

```bash
docker compose down -v
docker compose up -d
docker compose exec api npx prisma migrate deploy
docker compose exec api npx prisma db seed
```

---

## 8. Common Errors

| Error | Penyebab | Fix |
|---|---|---|
| `ML_CIRCUIT_OPEN` | ML service down 3x berturut-turut | Restart `docker compose restart ml`, tunggu 30s |
| `GEMINI_API_KEY not set` | Env var kosong | Set di env vars |
| `DB health check failed` | DB belum ready | `docker compose restart db api` |
| Migration gagal boot | Migration pending | `docker compose exec api npx prisma migrate deploy` |
| `PostGIS extension not found` | DB baru tanpa PostGIS | Masuk psql: `CREATE EXTENSION postgis;` |

---

## 9. Verifikasi GiST Indexes

```sql
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE tablename IN ('stations', 'parking_lots', 'observations')
ORDER BY tablename;

-- Test EXPLAIN pakai GiST
EXPLAIN SELECT * FROM parking_lots 
WHERE ST_DWithin(geom, ST_GeogFromText('POINT(110.37 -7.79)'), 500);
-- Harus ada "Index Scan using idx_parking_geom"
```

---

*Update runbook ini setiap ada prosedur baru.*
