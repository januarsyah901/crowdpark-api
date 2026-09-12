const prisma = require('../lib/prisma');
const { z } = require('zod');

const searchSchema = z.object({
  q: z.string().min(2, 'Query must be at least 2 characters')
});

const idSchema = z.coerce.number().int().positive();

exports.getStations = async (req, res, next) => {
  try {
    const rawData = await prisma.$queryRaw`
      SELECT 
        s.id, s.nama, s.kota, 
        ST_AsGeoJSON(s.geom)::json as geom_json,
        ST_AsGeoJSON(s.entrance_geom)::json as entrance_geom_json,
        s.created_at,
        json_agg(
          json_build_object(
            'id', pl.id,
            'nama', pl.nama,
            'tipe', pl.tipe,
            'kapasitas_motor', pl.kapasitas_motor,
            'kapasitas_mobil', pl.kapasitas_mobil,
            'tarif_motor', pl.tarif_motor,
            'tarif_mobil', pl.tarif_mobil,
            'jam_operasional', pl.jam_operasional,
            'sumber_data', pl.sumber_data,
            'is_active', pl.is_active,
            'updated_at', pl.updated_at,
            'geom', ST_AsGeoJSON(pl.geom)::json
          ) ORDER BY pl.id
        ) FILTER (WHERE pl.id IS NOT NULL AND pl.is_active = true) as lots
      FROM stations s
      LEFT JOIN parking_lots pl ON pl.station_id = s.id AND pl.is_active = true
      GROUP BY s.id, s.nama, s.kota, s.geom, s.entrance_geom, s.created_at
      ORDER BY s.id
    `;

    const features = rawData.map(row => ({
      type: 'Feature',
      geometry: row.geom_json,
      properties: {
        id: row.id,
        nama: row.nama,
        kota: row.kota,
        entrance_geom: row.entrance_geom_json,
        created_at: row.created_at,
        lots: row.lots || []
      }
    }));

    res.json({
      success: true,
      data: {
        type: 'FeatureCollection',
        features
      },
      meta: { request_id: req.id }
    });
  } catch (err) {
    next(err);
  }
};

exports.searchStations = async (req, res, next) => {
  try {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
        meta: { request_id: req.id }
      });
    }

    const { q } = parsed.data;
    const queryStr = `%${q}%`;
    const stations = await prisma.$queryRaw`
      SELECT id, nama, kota 
      FROM stations 
      WHERE nama ILIKE ${queryStr} OR kota ILIKE ${queryStr}
      ORDER BY nama ASC
      LIMIT 10
    `;

    res.json({
      success: true,
      data: stations,
      meta: { request_id: req.id }
    });
  } catch (err) {
    next(err);
  }
};

exports.getStationById = async (req, res, next) => {
  try {
    const parsed = idSchema.safeParse(req.params.id);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'ID must be a positive integer' },
        meta: { request_id: req.id }
      });
    }

    const rawData = await prisma.$queryRaw`
      SELECT 
        s.id, s.nama, s.kota, 
        ST_AsGeoJSON(s.geom)::json as geom_json,
        ST_AsGeoJSON(s.entrance_geom)::json as entrance_geom_json,
        s.created_at,
        json_agg(
          json_build_object(
            'id', pl.id,
            'nama', pl.nama,
            'tipe', pl.tipe,
            'kapasitas_motor', pl.kapasitas_motor,
            'kapasitas_mobil', pl.kapasitas_mobil,
            'tarif_motor', pl.tarif_motor,
            'tarif_mobil', pl.tarif_mobil,
            'jam_operasional', pl.jam_operasional,
            'sumber_data', pl.sumber_data,
            'is_active', pl.is_active,
            'updated_at', pl.updated_at,
            'geom', ST_AsGeoJSON(pl.geom)::json
          ) ORDER BY pl.id
        ) FILTER (WHERE pl.id IS NOT NULL AND pl.is_active = true) as lots
      FROM stations s
      LEFT JOIN parking_lots pl ON pl.station_id = s.id AND pl.is_active = true
      WHERE s.id = ${parsed.data}
      GROUP BY s.id, s.nama, s.kota, s.geom, s.entrance_geom, s.created_at
    `;

    if (!rawData || rawData.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Station not found' },
        meta: { request_id: req.id }
      });
    }

    const row = rawData[0];
    const feature = {
      type: 'Feature',
      geometry: row.geom_json,
      properties: {
        id: row.id,
        nama: row.nama,
        kota: row.kota,
        entrance_geom: row.entrance_geom_json,
        created_at: row.created_at,
        lots: row.lots || []
      }
    };

    res.json({
      success: true,
      data: feature,
      meta: { request_id: req.id }
    });
  } catch (err) {
    next(err);
  }
};
