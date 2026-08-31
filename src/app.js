require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const env = require('./config/env');

const app = express();
const prisma = new PrismaClient();

// Trust proxy for CapRover / Nginx (needed for rateLimit + X-Forwarded-For)
app.set('trust proxy', 1);

// Security headers
app.use(helmet());
app.disable('x-powered-by');

// CORS — whitelist FRONTEND_URL (comma-separated support)
const allowedOrigins = env.FRONTEND_URL.split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // Allow no-origin (curl, healthcheck, server-to-server)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return cb(null, true);
    return cb(null, false);
  },
  credentials: false,
}));

// Body parser
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request ID — generate + propagate to analytics
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.id);
  next();
});

// Structured logging with request_id
app.use(pinoHttp({
  level: env.LOG_LEVEL,
  customProps: (req) => ({ request_id: req.id }),
}));

// Rate limit — global + strict for AI
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down.' } },
});
app.use(globalLimiter);

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'AI Insight limited to 10 req/min per IP.' } },
});

// Health — reports db + ml + uptime, always 200/503 with envelope
// Supports both ML_SERVICE_URL (new) and ANALYTICS_URL (legacy alias) — see env.ML_URL
app.get('/health', async (req, res) => {
  let dbStatus = 'down';
  let mlStatus = 'down';
  const mlUrl = env.ML_URL || env.ML_SERVICE_URL || env.ANALYTICS_URL || 'http://ml:8000';

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'ok';
  } catch (e) {
    req.log.error({ err: e }, 'DB health check failed');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${mlUrl}/health`, {
      signal: controller.signal,
      headers: { 'x-request-id': req.id },
    });
    clearTimeout(timeout);
    if (response.ok) mlStatus = 'ok';
  } catch (e) {
    req.log.error({ err: e }, 'ML health check failed');
  }

  const isHealthy = dbStatus === 'ok' && mlStatus === 'ok';
  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    data: { db: dbStatus, ml: mlStatus, analytics: mlStatus, uptime: process.uptime() }, // analytics alias for backward compat
    meta: { request_id: req.id },
  });
});

// Placeholder routes — will be mounted as they are implemented (TASK-003 onwards)
// Mount with aiLimiter for /api/v1/ai/insight
app.use('/api/v1/ai', aiLimiter);

// TODO: Uncomment as routes are implemented
// app.use('/api/v1/stations', require('./routes/stations.routes'));
// app.use('/api/v1/parking', require('./routes/parking.routes'));
// app.use('/api/v1/ai', require('./routes/ai.routes'));
// app.use('/api/v1/data', require('./routes/data.routes'));
// app.use('/api/v1/stats', require('./routes/stats.routes'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
    meta: { request_id: req.id },
  });
});

// Error handler (must have 4 args)
app.use((err, req, res, _next) => {
  req.log.error({ err }, 'Unhandled error');
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal server error' },
    meta: { request_id: req.id },
  });
});

const PORT = env.PORT || 3000;

// Only listen if run directly (allows supertest import without binding)
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`✅ API server listening on port ${PORT} [${env.NODE_ENV}] FRONTEND_URL=${env.FRONTEND_URL}`);
  });

  // Graceful shutdown for deploy dev (CapRover sends SIGTERM)
  const shutdown = async () => {
    console.log('Shutting down...');
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = app;
