const prisma = require('../lib/prisma');

exports.getStats = async (req, res, next) => {
  try {
    const total_stations = await prisma.stations.count();
    
    const total_lots_active = await prisma.parking_lots.count({
      where: { is_active: true }
    });
    
    const lastUpdateQuery = await prisma.$queryRaw`
      SELECT MAX(observed_at) as last_updated FROM observations
    `;
    const last_updated = lastUpdateQuery[0]?.last_updated || null;

    const coverageQuery = await prisma.$queryRaw`
      SELECT 
        COUNT(DISTINCT lot_id) as active_lots_7d
      FROM observations
      WHERE observed_at >= NOW() - INTERVAL '7 days'
    `;
    
    // Explicit conversion since count from queryRaw comes back as BigInt sometimes in Prisma
    const active_lots_7d = coverageQuery[0]?.active_lots_7d 
      ? Number(coverageQuery[0].active_lots_7d) 
      : 0;
    
    let coverage_7d_pct = 0.0;
    if (total_lots_active > 0) {
      coverage_7d_pct = (active_lots_7d / total_lots_active) * 100;
    }

    const stationsSummaryQuery = await prisma.$queryRaw`
      SELECT 
        s.id,
        s.nama,
        COUNT(pl.id)::int as total_lots,
        COUNT(CASE WHEN pl.is_active = true THEN 1 END)::int as lots_active
      FROM stations s
      LEFT JOIN parking_lots pl ON pl.station_id = s.id
      GROUP BY s.id, s.nama
      ORDER BY s.id
    `;

    res.json({
      success: true,
      data: {
        total_stations,
        total_lots_active,
        last_updated,
        coverage_7d_pct: Math.round(coverage_7d_pct * 100) / 100,
        stations_summary: stationsSummaryQuery
      },
      meta: { request_id: req.id }
    });

  } catch (err) {
    next(err);
  }
};
