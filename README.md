# CrowdPark AI Backend (Supabase Serverless)

Repository ini memuat konfigurasi, skema migrasi database, dan Supabase Edge Functions untuk sistem CrowdPark AI.

Arsitektur monolitik Express.js lama telah diarsipkan ke branch `legacy-express`. Implementasi aktif saat ini sepenuhnya berjalan di atas layanan serverless Supabase.

## Struktur Direktori

```text
be/
├── supabase/
│   ├── config.toml           # Konfigurasi proyek Supabase
│   ├── functions/            # Supabase Edge Functions (Deno runtime)
│   │   ├── ai-insight/       # Agregasi data dan pemanggilan Gemini API
│   │   └── parking-estimate/ # Estimasi keterisian dan integrasi model ML
│   └── migrations/           # Skrip migrasi SQL PostgreSQL dan PostGIS
│       ├── 20260911_init.sql
│       ├── 20260912_seed_sample.sql
│       └── 20260912_reviews.sql
├── .env.example              # Template variabel lingkungan
└── README.md
```

## Panduan Penggunaan

### 1. Migrasi Database
Skrip SQL di `supabase/migrations/` dapat dijalankan langsung melalui SQL Editor pada Dashboard Supabase atau menggunakan Supabase CLI:

```bash
supabase db push
```

### 2. Deployment Edge Functions
Kedua fungsi Deno di-deploy ke cloud Supabase (region `ap-southeast-1`):

```bash
supabase functions deploy parking-estimate
supabase functions deploy ai-insight
```

### 3. Konfigurasi Secret
Pastikan variabel rahasia pada Edge Functions telah diatur:

```bash
supabase secrets set GEMINI_API_KEY=kunci_gemini_anda
supabase secrets set ML_SERVICE_URL=url_service_ml_anda
```

## Arsip Versi Sebelumnya
Kode monolitik Express.js dan Prisma tersimpan aman di branch `legacy-express`.
