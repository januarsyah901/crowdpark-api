const { z } = require('zod');

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL required'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ML_SERVICE_URL: z.string().url().default('http://ml:8000'),
  ANALYTICS_URL: z.string().url().optional(), // alias for ML_SERVICE_URL (backward compat with old deploys)
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  GEMINI_API_KEY: z.string().optional(),
  INTERNAL_API_KEY_CSV: z.string().min(1).default('dev_csv_key'),
  INTERNAL_API_KEY_MAPID: z.string().min(1).default('dev_mapid_key'),
  INTERNAL_API_KEY_ADMIN: z.string().min(1).default('dev_admin_key'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

let env;
try {
  env = envSchema.parse(process.env);
} catch (e) {
  console.error('❌ Invalid environment variables:', e.errors || e.message);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
  // In development, allow missing optional keys but warn
  env = envSchema.parse({ ...process.env, GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'dummy' });
}

// Resolve ML service URL with fallback (supports both new and old env var)
env.ML_URL = env.ML_SERVICE_URL || env.ANALYTICS_URL || 'http://ml:8000';
env.ANALYTICS_URL_RESOLVED = env.ML_URL; // alias for legacy code

module.exports = env;
