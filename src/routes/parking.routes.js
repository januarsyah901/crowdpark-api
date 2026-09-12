const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { Prisma } = require('@prisma/client');
const { z } = require('zod');

async function callML(endpoint, payload, requestId) {
  const env = require('../config/env');
  const ML_URL = env.ML_URL || 'http://ml:8000';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${ML_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-request-id': requestId || '' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw Object.assign(new Error('ML error'), { status: res.status, code: 'ML_ERROR' });
    return res.json();
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw Object.assign(new Error('ML service timeout'), { status: 503, code: 'ML_TIMEOUT' });
    throw e;
  }
}

const compareSchema = z.object({
  ids: z.string().transform((val) => {
    const arr = val.split(',').map(Number);
    if (arr.some(isNaN) || arr.some(n => n <= 0)) throw new Error('Invalid IDs');
    return arr;
  }).refine(val => val.length >= 1 && val.length <= 3, { message: 'Must provide 1 to 3 IDs' }),
  day: z.coerce.number().int().min(1).max(7),
  hour: z.coerce.number().int().min(0).max(23),
  vehicle: z.enum(['all', 'motor', 'mobil']).default('all')
});

const estimateSchema = z.object({
  day: z.coerce.number().int().min(1).max(7),
  hour: z.coerce.number().int().min(0).max(23),
  vehicle: z.enum(['all', 'motor', 'mobil']).default('all')
});

// GET /compare (HARUS SEBELUM /:id)
router.get('/compare', async (req, res, next) => {
  try {
    const validation = compareSchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    const { ids, day, hour, vehicle } = validation.data;
    const requestId = req.headers['x-request-id'];

    const lotsRaw = await prisma.$queryRaw`
      SELECT id, nama, tipe, kapasitas_motor, kapasitas_mobil, tarif_motor, tarif_mobil, sumber_data, ST_AsGeoJSON(geom) as geom_geojson
      FROM parking_lots
      WHERE id IN (${Prisma.join(ids)})
    `;
    
    const lotMap = {};
    lotsRaw.forEach(lot => {
      lotMap[lot.id] = lot;
    });

    const missingIds = ids.filter(id => !lotMap[id]);
    if (missingIds.length > 0) {
      return res.status(404).json({ success: false, message: `Lots not found: ${missingIds.join(',')}` });

    }

    let mlResponse;
    try {
      mlResponse = await callML('/analyze/spp', { lot_ids: ids, day, hour, vehicle }, requestId);
    } catch (e) {
      if (e.code === 'ML_TIMEOUT' || e.code === 'ML_ERROR') {
         return res.status(503).json({ success: false, error: { code: 'ML_UNAVAILABLE', message: 'ML service is currently unavailable' }});
      }
      throw e;
    }

    const results = mlResponse.map(mlResult => {
      const lotStatic = lotMap[mlResult.lot_id];
      return {
        ...mlResult,
        nama: lotStatic.nama,
        tipe: lotStatic.tipe,
        kapasitas_motor: lotStatic.kapasitas_motor,
        kapasitas_mobil: lotStatic.kapasitas_mobil,
        tarif_motor: lotStatic.tarif_motor,
        tarif_mobil: lotStatic.tarif_mobil,
        sumber_data: lotStatic.sumber_data,
        geojson: lotStatic.geom_geojson ? JSON.parse(lotStatic.geom_geojson) : null
      };
    });

    res.set('Cache-Control', 'public, max-age=60');
    if (requestId) res.set('X-Request-Id', requestId);
    
    return res.json({ success: true, data: { results } });
  } catch (error) {
    next(error);
  }
});

// GET /:id/estimate
router.get('/:id/estimate', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const validation = estimateSchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    const { day, hour, vehicle } = validation.data;
    const requestId = req.headers['x-request-id'];

    const lotsRaw = await prisma.$queryRaw`
      SELECT id, nama, tipe, kapasitas_motor, kapasitas_mobil, tarif_motor, tarif_mobil, sumber_data, ST_AsGeoJSON(geom) as geom_geojson
      FROM parking_lots
      WHERE id = ${id}
    `;

    if (lotsRaw.length === 0) {
      return res.status(404).json({ success: false, message: 'Lot not found' });
    }

    const lotStatic = lotsRaw[0];

    let mlResult;
    try {
      mlResult = await callML('/analyze/estimate', { lot_id: id, day, hour, vehicle }, requestId);
    } catch (e) {
      if (e.code === 'ML_TIMEOUT' || e.code === 'ML_ERROR') {
        return res.status(503).json({ success: false, error: { code: 'ML_UNAVAILABLE', message: 'ML service is currently unavailable' }});
      }
      throw e;
    }

    const result = {
      nama: lotStatic.nama,
      tipe: lotStatic.tipe,
      kapasitas_motor: lotStatic.kapasitas_motor,
      kapasitas_mobil: lotStatic.kapasitas_mobil,
      tarif_motor: lotStatic.tarif_motor,
      tarif_mobil: lotStatic.tarif_mobil,
      sumber_data: lotStatic.sumber_data,
      geojson: lotStatic.geom_geojson ? JSON.parse(lotStatic.geom_geojson) : null,
      estimasi_pct: mlResult.estimasi_pct,
      estimasi_motor_pct: mlResult.estimasi_motor_pct,
      estimasi_mobil_pct: mlResult.estimasi_mobil_pct,
      confidence_level: mlResult.confidence_level,
      n_observasi: mlResult.n_observasi,
      fallback_used: mlResult.fallback_used,
      fallback_hour: mlResult.fallback_hour,
      last_updated: mlResult.last_updated
    };

    res.set('Cache-Control', 'public, max-age=60');
    
    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// GET /
router.get('/', async (req, res, next) => {
  try {
    const lotsRaw = await prisma.$queryRaw`
      SELECT id, nama, tipe, kapasitas_motor, kapasitas_mobil, tarif_motor, tarif_mobil, ST_AsGeoJSON(geom) as geom_geojson, is_active
      FROM parking_lots
    `;
    
    const lots = lotsRaw.map(lot => {
      lot.geojson = lot.geom_geojson ? JSON.parse(lot.geom_geojson) : null;
      delete lot.geom_geojson;
      return lot;
    });

    res.set('Cache-Control', 'public, max-age=60');
    return res.json({ success: true, data: lots });
  } catch (error) {
    next(error);
  }
});

// GET /:id
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const lotsRaw = await prisma.$queryRaw`
      SELECT id, nama, tipe, kapasitas_motor, kapasitas_mobil, tarif_motor, tarif_mobil, jam_operasional, sumber_data, ST_AsGeoJSON(geom) as geom_geojson, is_active
      FROM parking_lots
      WHERE id = ${id}
    `;

    if (lotsRaw.length === 0) {
      return res.status(404).json({ success: false, message: 'Lot not found' });
    }

    const lotStatic = lotsRaw[0];
    lotStatic.geojson = lotStatic.geom_geojson ? JSON.parse(lotStatic.geom_geojson) : null;
    delete lotStatic.geom_geojson;

    return res.json({ success: true, data: lotStatic });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
