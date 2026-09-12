const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const env = require('../config/env');

const router = express.Router();

function apiKeyAuth(scope) {
  return (req, res, next) => {
    const key = req.headers['x-api-key'];
    let validKey;
    if (scope === 'csv_import') validKey = env.INTERNAL_API_KEY_CSV;
    else if (scope === 'mapid_sync') validKey = env.INTERNAL_API_KEY_MAPID;
    else if (scope === 'admin') validKey = env.INTERNAL_API_KEY_ADMIN;
    
    // Admin key valid untuk semua scope
    if (key && key === env.INTERNAL_API_KEY_ADMIN) return next();
    
    if (!key || key !== validKey) {
      return res.status(401).json({ 
        success: false, 
        error: { code: 'UNAUTHORIZED', message: 'Invalid or missing X-API-Key' } 
      });
    }
    next();
  };
}

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) cb(null, true);
    else cb(new Error('Only CSV files allowed'));
  }
});

// POST /import - CSV Import
router.post('/import', apiKeyAuth('csv_import'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: { message: 'No file uploaded' } });
  }

  try {
    const records = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length === 0) {
      return res.status(400).json({ success: false, error: { message: 'CSV is empty' } });
    }

    // Validate headers
    const headers = Object.keys(records[0]);
    const requiredHeaders = ['lot_id', 'observed_at', 'jumlah_motor', 'jumlah_mobil'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      return res.status(400).json({ success: false, error: { message: `Missing required headers: ${missingHeaders.join(', ')}` } });
    }

    const uniqueLotIds = [...new Set(records.map(r => parseInt(r.lot_id, 10)).filter(id => !isNaN(id)))];
    
    const validLots = await prisma.parking_lots.findMany({
      where: {
        id: { in: uniqueLotIds },
        is_active: true
      },
      select: { id: true, kapasitas_motor: true, kapasitas_mobil: true }
    });

    const validLotMap = new Map(validLots.map(l => [l.id, (l.kapasitas_motor || 0) + (l.kapasitas_mobil || 0)]));

    const validRows = [];
    const errors = [];
    const warnings = [];

    records.forEach((row, index) => {
      const rowNum = index + 2; // +1 for 0-index, +1 for header
      const lotId = parseInt(row.lot_id, 10);
      const jMotor = parseInt(row.jumlah_motor, 10);
      const jMobil = parseInt(row.jumlah_mobil, 10);
      
      let observedAt;
      try {
        observedAt = new Date(row.observed_at);
        if (isNaN(observedAt.getTime())) throw new Error();
      } catch (e) {
        errors.push({ row: rowNum, reason: 'Invalid observed_at date format' });
        return;
      }

      if (observedAt > new Date()) {
        errors.push({ row: rowNum, reason: 'observed_at cannot be in the future' });
        return;
      }

      if (isNaN(lotId) || lotId <= 0) {
        errors.push({ row: rowNum, reason: 'lot_id must be a positive integer' });
        return;
      }
      if (isNaN(jMotor) || jMotor < 0 || isNaN(jMobil) || jMobil < 0) {
        errors.push({ row: rowNum, reason: 'jumlah_motor and jumlah_mobil must be non-negative integers' });
        return;
      }

      if (!validLotMap.has(lotId)) {
        errors.push({ row: rowNum, reason: `lot_id ${lotId} not found or inactive` });
        return;
      }

      const kapasitas = validLotMap.get(lotId);
      if (kapasitas && (jMotor + jMobil) > kapasitas * 1.5) {
        warnings.push(`Row ${rowNum}: jumlah melebihi 1.5x kapasitas (lot_id: ${lotId})`);
      }

      validRows.push({
        lot_id: lotId,
        observed_at: observedAt,
        jumlah_motor: jMotor,
        jumlah_mobil: jMobil
      });
    });

    let inserted = 0;
    
    if (validRows.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const row of validRows) {
          const res = await tx.$executeRaw`
            INSERT INTO observations (lot_id, observed_at, jumlah_motor, jumlah_mobil, sumber)
            VALUES (${row.lot_id}, ${row.observed_at}, ${row.jumlah_motor}, ${row.jumlah_mobil}, 'csv_import')
            ON CONFLICT (lot_id, observed_at, sumber) DO NOTHING
          `;
          inserted += res;
        }
      });
    }

    // Fire and forget cache invalidation
    const mlUrl = env.ML_URL || 'http://ml:8000';
    fetch(`${mlUrl}/cache/invalidate`, { 
      method: 'POST', 
      body: JSON.stringify({ lot_ids: uniqueLotIds }), 
      headers: { 'Content-Type': 'application/json' } 
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          total: records.length,
          inserted: inserted,
          skipped_duplicate: validRows.length - inserted,
          rejected: errors.length,
          warnings
        },
        errors
      },
      meta: { request_id: req.id || 'N/A' }
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// POST /staging/sync - MAPID sync
router.post('/staging/sync', apiKeyAuth('mapid_sync'), async (req, res) => {
  try {
    const body = Array.isArray(req.body) ? req.body : [req.body];
    
    if (body.length === 0) {
      return res.status(400).json({ success: false, error: { message: 'Empty payload' } });
    }

    const payloadSchema = z.object({
      raw_payload: z.any() // At least raw_payload is expected by instruction, maybe allow other structures but keep raw_payload
    }).passthrough(); // Using passthrough so if the object itself is the raw_payload it can be adapted

    const validItems = [];
    for (const item of body) {
      // If item is not wrapped in raw_payload, we wrap it. Instructions say "setiap item harus punya minimal satu field (raw_payload)"
      if (item && item.raw_payload) {
        validItems.push({ raw_payload: item.raw_payload, status: 'pending' });
      } else {
        validItems.push({ raw_payload: item, status: 'pending' });
      }
    }

    const result = await prisma.staging_survey_activities.createMany({
      data: validItems
    });

    return res.status(202).json({
      success: true,
      data: { received: validItems.length, status: "pending" },
      meta: { request_id: req.id || 'N/A' }
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// ETL Logic function
async function processStaging(prisma) {
  const pendingRecords = await prisma.staging_survey_activities.findMany({
    where: { status: 'pending' },
    take: 100
  });

  let processed = 0;
  let promoted = 0;
  let needs_review = 0;

  for (const record of pendingRecords) {
    processed++;
    const payload = record.raw_payload || {};
    
    const lotId = payload.lot_id ? parseInt(payload.lot_id, 10) : null;
    const namaParkir = payload.nama_parkir || payload.name || null;
    const longitude = payload.longitude || payload.lng || null;
    const latitude = payload.latitude || payload.lat || null;
    
    const jMotor = parseInt(payload.jumlah_motor || payload.motor || 0, 10);
    const jMobil = parseInt(payload.jumlah_mobil || payload.mobil || 0, 10);
    const observedAt = payload.observed_at ? new Date(payload.observed_at) : (payload.timestamp ? new Date(payload.timestamp) : new Date());

    let matchedLotId = null;

    if (lotId && !isNaN(lotId)) {
      const lot = await prisma.parking_lots.findUnique({ where: { id: lotId } });
      if (lot) matchedLotId = lot.id;
    }

    if (!matchedLotId && namaParkir) {
      const lot = await prisma.$queryRaw`
        SELECT id FROM parking_lots WHERE nama ILIKE ${'%' + namaParkir + '%'} LIMIT 1
      `;
      if (lot && lot.length > 0) matchedLotId = lot[0].id;
    }

    if (!matchedLotId && longitude && latitude) {
      const lot = await prisma.$queryRaw`
        SELECT id FROM parking_lots 
        WHERE ST_DWithin(geom, ST_GeogFromText(${`POINT(${parseFloat(longitude)} ${parseFloat(latitude)})`}), 50)
        LIMIT 1
      `;
      if (lot && lot.length > 0) matchedLotId = lot[0].id;
    }

    if (matchedLotId) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            INSERT INTO observations (lot_id, observed_at, jumlah_motor, jumlah_mobil, sumber)
            VALUES (${matchedLotId}, ${observedAt}, ${jMotor}, ${jMobil}, 'mapid_apps')
            ON CONFLICT (lot_id, observed_at, sumber) DO NOTHING
          `;

          await tx.staging_survey_activities.update({
            where: { id: record.id },
            data: {
              status: 'promoted',
              lot_id: matchedLotId,
              processed: true,
              processed_at: new Date()
            }
          });
        });
        promoted++;
      } catch (e) {
        await prisma.staging_survey_activities.update({
          where: { id: record.id },
          data: {
            status: 'needs_review',
            error_reason: 'Error promoting to observations'
          }
        });
        needs_review++;
      }
    } else {
      await prisma.staging_survey_activities.update({
        where: { id: record.id },
        data: {
          status: 'needs_review',
          error_reason: 'No matching lot found'
        }
      });
      needs_review++;
    }
  }

  return { processed, promoted, needs_review };
}

// POST /staging/process - ETL trigger
router.post('/staging/process', apiKeyAuth('admin'), async (req, res) => {
  try {
    const summary = await processStaging(prisma);
    return res.status(200).json({
      success: true,
      data: summary,
      meta: { request_id: req.id || 'N/A' }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
});

module.exports = router;
