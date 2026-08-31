const { PrismaClient } = require('@prisma/client');
const geo = require('../src/services/geo.service');

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS postgis;`;

  // Ensure unique index exists for ON CONFLICT (idempotent seed for deploy dev)
  await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS idx_stations_nama_unique ON stations (nama);`;

  // Insert stations idempotently — use ON CONFLICT (nama) after index exists
  // Use transaction for atomicity
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO stations (nama, kota, geom, entrance_geom)
      VALUES 
        ('Stasiun Lempuyangan', 'Yogyakarta', ${geo.fromPoint(110.3756, -7.7900)}, ${geo.fromPoint(110.3753, -7.7905)}),
        ('Stasiun Tugu', 'Yogyakarta', ${geo.fromPoint(110.3622, -7.7895)}, ${geo.fromPoint(110.3628, -7.7890)})
      ON CONFLICT (nama) DO UPDATE SET kota = EXCLUDED.kota, entrance_geom = EXCLUDED.entrance_geom;
    `;

    const lempuyangan = await tx.stations.findFirst({ where: { nama: 'Stasiun Lempuyangan' }});
    const tugu = await tx.stations.findFirst({ where: { nama: 'Stasiun Tugu' }});

    // 6 lots total: 3 per stasiun, mix resmi/swadaya, sesuai observasi lapangan PRD
    if (lempuyangan) {
      await tx.$executeRaw`
        INSERT INTO parking_lots (station_id, nama, tipe, kapasitas_motor, kapasitas_mobil, tarif_motor, tarif_mobil, jam_operasional, geom, sumber_data, is_active)
        VALUES 
          (${lempuyangan.id}, 'Parkir Resmi Lempuyangan Utara', 'resmi', 300, 50, 3000, 5000, '06:00-22:00', ${geo.fromPoint(110.3760, -7.7901)}, 'survei_tim', true),
          (${lempuyangan.id}, 'Parkir Swadaya Lempuyangan Timur (405m)', 'swadaya', 480, 64, 5000, 10000, '24 jam', ${geo.fromPoint(110.3770, -7.7902)}, 'mapid_apps', true),
          (${lempuyangan.id}, 'Parkir Swadaya Lempuyangan Selatan', 'swadaya', 120, 20, 3000, null, '06:00-20:00', ${geo.fromPoint(110.3750, -7.7910)}, 'survei_tim', true)
        ON CONFLICT DO NOTHING;
      `;
    }

    if (tugu) {
      await tx.$executeRaw`
        INSERT INTO parking_lots (station_id, nama, tipe, kapasitas_motor, kapasitas_mobil, tarif_motor, tarif_mobil, jam_operasional, geom, sumber_data, is_active)
        VALUES 
          (${tugu.id}, 'Parkir Resmi Tugu VIP', 'resmi', 300, 150, 5000, 10000, '06:00-23:00', ${geo.fromPoint(110.3630, -7.7892)}, 'survei_tim', true),
          (${tugu.id}, 'Parkir Swadaya Malioboro Perwakilan (124m)', 'swadaya', 250, 0, 5000, null, '24 jam', ${geo.fromPoint(110.3615, -7.7885)}, 'survei_tim', true),
          (${tugu.id}, 'Parkir Paralel Malioboro Selatan DPRD (142m)', 'swadaya', 0, 25, null, 10000, '08:00-21:00', ${geo.fromPoint(110.3620, -7.7900)}, 'survei_tim', true)
        ON CONFLICT DO NOTHING;
      `;
    }
  });

  // Seed observations dummy for testing estimate (Hari 4-6 will add real data)
  // Only if no observations exist (idempotent)
  const count = await prisma.observations.count();
  if (count === 0) {
    const lots = await prisma.parking_lots.findMany({ select: { id: true, kapasitas_motor: true, kapasitas_mobil: true }});
    // Generate 12 observations per lot for Monday 08:00 (confidence tinggi) to verify pipeline
    const obsRows = [];
    for (const lot of lots) {
      for (let i = 0; i < 12; i++) {
        const totalCap = lot.kapasitas_motor + lot.kapasitas_mobil;
        const jitter = Math.floor(Math.random() * (totalCap * 0.3));
        const occupied = Math.floor(totalCap * 0.6 + jitter - totalCap * 0.15);
        const motor = Math.min(lot.kapasitas_motor, Math.floor(occupied * 0.7));
        const mobil = Math.min(lot.kapasitas_mobil, occupied - motor);
        // Monday 2026-08-25 is Monday, create observed_at around 08:00
        const date = new Date(Date.UTC(2026, 7, 25 + Math.floor(i/4), 8, 0, 0));
        obsRows.push({ lot_id: lot.id, observed_at: date, jumlah_motor: motor, jumlah_mobil: mobil, sumber: 'survei_tim' });
      }
    }
    // Use raw for bulk insert with parameterized values
    for (const row of obsRows) {
      await prisma.$executeRaw`INSERT INTO observations (lot_id, observed_at, jumlah_motor, jumlah_mobil, sumber) VALUES (${row.lot_id}, ${row.observed_at}, ${row.jumlah_motor}, ${row.jumlah_mobil}, ${row.sumber}) ON CONFLICT (lot_id, observed_at, sumber) DO NOTHING;`;
    }
    console.log(`Seeded ${obsRows.length} dummy observations`);
  }
  
  console.log('Seed completed: 2 stations, 6 lots, observations if empty.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
