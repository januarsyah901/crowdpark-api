const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');

const env = require('../config/env');

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

async function callMLEstimate(payload, requestId) {
  const ML_URL = env.ML_URL || 'http://ml:8000';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${ML_URL}/analyze/estimate`, {
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

const insightSchema = z.object({
  lot_ids: z.array(z.number().int().positive()).min(1).max(3),
  day: z.number().int().min(1).max(7),
  hour: z.number().int().min(0).max(23),
  vehicle: z.enum(['all', 'motor', 'mobil']).default('all'),
});

router.post('/insight', aiLimiter, async (req, res, next) => {
  try {
    const GEMINI_API_KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return res.status(503).json({ success: false, error: { code: 'AI_UNAVAILABLE', message: 'AI service configuration is missing' }});
    }

    const validation = insightSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    const { lot_ids, day, hour, vehicle } = validation.data;
    const requestId = req.headers['x-request-id'] || 'req-' + Date.now();

    const lots = await prisma.parking_lots.findMany({
      where: { id: { in: lot_ids } },
      select: {
        id: true,
        nama: true,
        tipe: true,
        tarif_motor: true,
        tarif_mobil: true,
      }
    });

    const lotMap = {};
    lots.forEach(lot => { lotMap[lot.id] = lot; });

    const walkDists = await prisma.walk_distances.findMany({
      where: { lot_id: { in: lot_ids } }
    });
    const distMap = {};
    walkDists.forEach(wd => {
        if (!distMap[wd.lot_id]) distMap[wd.lot_id] = wd;
    });

    const warnings = [];
    const structuredLots = [];
    
    for (const lot_id of lot_ids) {
      const lot = lotMap[lot_id];
      if (!lot) continue;

      let estimate;
      try {
        estimate = await callMLEstimate({ lot_id, day, hour, vehicle }, requestId);
      } catch (err) {
        estimate = {
          estimasi_pct: null,
          estimasi_motor_pct: null,
          estimasi_mobil_pct: null,
          confidence_level: 'tidak_tersedia',
          n_observasi: 0,
          last_updated: null
        };
      }

      if (estimate.last_updated) {
        const lastUpdatedDate = new Date(estimate.last_updated);
        const now = new Date();
        const diffHours = (now - lastUpdatedDate) / (1000 * 60 * 60);
        if (diffHours > 48 && !warnings.includes("Data usang >48 jam")) {
          warnings.push("Data usang >48 jam");
        }
      }

      structuredLots.push({
        nama: lot.nama,
        tipe: lot.tipe,
        estimasi_pct: estimate.estimasi_pct,
        estimasi_motor_pct: estimate.estimasi_motor_pct,
        estimasi_mobil_pct: estimate.estimasi_mobil_pct,
        confidence_level: estimate.confidence_level,
        n_observasi: estimate.n_observasi,
        jarak_meter: distMap[lot_id]?.jarak_meter ? parseFloat(distMap[lot_id].jarak_meter) : null,
        tarif_motor: lot.tarif_motor,
        tarif_mobil: lot.tarif_mobil,
        last_updated: estimate.last_updated,
      });
    }

    const structuredPayload = {
      lots: structuredLots,
      context: { day, hour, vehicle }
    };

    const systemPrompt = `Kamu adalah asisten parkir yang membantu pengguna memilih tempat parkir terbaik di Yogyakarta.
ATURAN KETAT:
1. Hanya sebut angka yang ada dalam data yang diberikan. JANGAN mengarang angka.
2. Jika confidence_level = 'tidak_tersedia' atau n_observasi = 0, katakan data belum tersedia.
3. Jika last_updated lebih dari 48 jam yang lalu, tambahkan peringatan bahwa data mungkin tidak akurat.
4. Berikan rekomendasi yang spesifik berdasarkan estimasi keterisian dan jarak.
5. Gunakan bahasa Indonesia yang natural, tidak formal berlebihan.
6. Batas respons: 3-4 kalimat singkat.`;

    const userPrompt = JSON.stringify(structuredPayload);

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const geminiBody = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 512 }
    };

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody)
    });

    if (!geminiRes.ok) {
        throw new Error(`Gemini API error: ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json();
    const narasi = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Maaf, saya tidak dapat memberikan insight saat ini.';

    console.log(JSON.stringify({
      request_id: requestId,
      lot_ids,
      prompt_length: userPrompt.length,
      response_length: narasi.length
    }));

    return res.json({
      success: true,
      data: {
        narasi,
        payload_terpakai: structuredPayload,
        warnings: warnings.length > 0 ? warnings : undefined
      },
      meta: { request_id: requestId }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
