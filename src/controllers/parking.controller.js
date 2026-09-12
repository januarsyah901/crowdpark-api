const prisma = require('../lib/prisma');
const { z } = require('zod');

const idSchema = z.coerce.number().int().positive();

exports.getParkingLotById = async (req, res, next) => {
  try {
    const parsed = idSchema.safeParse(req.params.id);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'ID must be a positive integer' },
        meta: { request_id: req.id }
      });
    }

    const rows = await prisma.$queryRaw`
      SELECT 
        pl.*,
        ST_AsGeoJSON(pl.geom)::json as geom_json,
        s.nama as station_nama,
        s.kota as station_kota
      FROM parking_lots pl
      JOIN stations s ON s.id = pl.station_id
      WHERE pl.id = ${parsed.data}
    `;

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Parking lot not found' },
        meta: { request_id: req.id }
      });
    }

    res.json({
      success: true,
      data: rows[0],
      meta: { request_id: req.id }
    });
  } catch (err) {
    next(err);
  }
};

exports.getEstimate = (req, res, next) => {
  res.status(503).json({
    success: false,
    error: { code: 'SERVICE_UNAVAILABLE', message: 'ML service not yet connected. Akan diimplementasi TASK-007.' },
    meta: { request_id: req.id }
  });
};

exports.compareLots = (req, res, next) => {
  res.status(503).json({
    success: false,
    error: { code: 'SERVICE_UNAVAILABLE', message: 'ML service not yet connected. Akan diimplementasi TASK-007.' },
    meta: { request_id: req.id }
  });
};
