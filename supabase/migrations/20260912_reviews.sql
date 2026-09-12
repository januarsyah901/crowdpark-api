-- =============================================================
-- Migration & Seed: Parking Reviews
-- =============================================================

CREATE TABLE IF NOT EXISTS parking_reviews (
  id BIGSERIAL PRIMARY KEY,
  lot_id INT NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nama_reviewer TEXT NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  ulasan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE parking_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read reviews" 
  ON parking_reviews FOR SELECT USING (TRUE);

CREATE POLICY "Users insert own reviews" 
  ON parking_reviews FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

-- =============================================================
-- SEED DATA
-- =============================================================
TRUNCATE TABLE parking_reviews RESTART IDENTITY CASCADE;

INSERT INTO parking_reviews (lot_id, nama_reviewer, rating, ulasan, created_at) VALUES
-- Parkir Malioboro Mall (lot_id=1)
(1, 'Andi S.', 5, 'Lokasi sangat strategis untuk ke Malioboro. Tempat luas dan teduh.', NOW() - INTERVAL '2 days'),
(1, 'Rina M.', 4, 'Tarif lumayan standar mall, tapi aman karena di dalam gedung.', NOW() - INTERVAL '5 hours'),

-- Parkir Stasiun Tugu Resmi (lot_id=2)
(2, 'Budi Prasetyo', 4, 'Sangat dekat dengan pintu masuk. Kadang kalau jam sibuk agak susah cari slot kosong.', NOW() - INTERVAL '1 day'),
(2, 'Citra L.', 5, 'Aman buat titip inap motor saat ke luar kota pakai kereta.', NOW() - INTERVAL '3 hours'),

-- Parkir Jl. Perwakilan (lot_id=3)
(3, 'Joko W.', 3, 'Hanya parkir di pinggir jalan, lumayan jauh kalau jalan kaki bawa koper.', NOW() - INTERVAL '4 days'),

-- Parkir Abu Bakar Ali (lot_id=4)
(4, 'Siti N.', 5, 'Lahan luas, fasilitas lengkap ada toilet. Jarak jalan kaki masih oke.', NOW() - INTERVAL '1 week'),
(4, 'Arif Rahman', 4, 'Agak macet kalau keluar dari sini pas malam minggu.', NOW() - INTERVAL '2 days'),

-- Parkir Timur Lempuyangan (lot_id=6)
(6, 'Bagus P.', 5, 'Paling rekomen buat ke Lempuyangan. Dekat banget dan murah.', NOW() - INTERVAL '2 hours'),
(6, 'Dewi K.', 4, 'Sering penuh pas pagi hari, tapi bapak parkirnya ramah.', NOW() - INTERVAL '1 day'),

-- Parkir Selatan Lempuyangan (lot_id=7)
(7, 'Hendrik', 4, 'Alternatif kalau parkir timur penuh. Jalan kaki gak terlalu jauh kok.', NOW() - INTERVAL '3 days');

