import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callMLEstimate(
  mlUrl: string,
  payload: object
): Promise<Record<string, unknown> | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${mlUrl}/analyze/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { lot_ids, day, hour, vehicle = "motor" } = body;

    if (!Array.isArray(lot_ids) || lot_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "lot_ids array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const ML_URL = Deno.env.get("ML_SERVICE_URL") || "http://ml:8000";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: lots } = await supabase
      .from("parking_lots_geo")
      .select("*")
      .in("id", lot_ids);

    if (!lots || lots.length === 0) {
      return new Response(
        JSON.stringify({ error: "No parking lots found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mlResults = await Promise.all(
      lots.map((lot: any) =>
        callMLEstimate(ML_URL, { lot_id: lot.id, day, hour, vehicle })
      )
    );

    const structuredLots = lots.map((lot: any, i: number) => {
      const ml = mlResults[i];
      const estimasiPct = ml?.estimasi_motor_pct ?? null;
      const openSlots = estimasiPct !== null
        ? Math.max(0, Math.floor(lot.kapasitas_motor * (1 - estimasiPct / 100)))
        : null;

      return {
        id: lot.id,
        nama: lot.nama,
        tipe: lot.tipe,
        lat: lot.lat,
        lng: lot.lng,
        kapasitas_motor: lot.kapasitas_motor,
        kapasitas_mobil: lot.kapasitas_mobil,
        tarif_motor: lot.tarif_motor
          ? `Rp ${lot.tarif_motor.toLocaleString("id-ID")}`
          : "Gratis",
        jarak_meter: lot.jarak_meter ? parseFloat(lot.jarak_meter) : null,
        durasi_detik: lot.durasi_detik,
        estimasi_pct: estimasiPct,
        open_slots: openSlots,
        confidence_level: ml?.confidence_level ?? "tidak_tersedia",
        n_observasi: ml?.n_observasi ?? 0,
        last_updated: ml?.last_updated ?? null,
      };
    });

    structuredLots.sort((a, b) => {
      const slotA = a.open_slots ?? a.kapasitas_motor;
      const slotB = b.open_slots ?? b.kapasitas_motor;
      if (slotB !== slotA) return slotB - slotA;
      return (a.jarak_meter ?? 9999) - (b.jarak_meter ?? 9999);
    });

    let narasi = "Data parkir sedang diperbarui. Silakan cek kembali beberapa saat lagi.";

    if (GEMINI_API_KEY) {
      const systemPrompt = `Kamu adalah asisten parkir CrowdPark yang membantu pengguna memilih tempat parkir terbaik di Yogyakarta.
ATURAN KETAT:
1. Hanya sebut angka yang ada dalam data yang diberikan. JANGAN mengarang angka.
2. Jika confidence_level = 'tidak_tersedia' atau n_observasi = 0, katakan data belum tersedia.
3. Berikan rekomendasi spesifik berdasarkan slot tersisa dan jarak jalan kaki.
4. Gunakan bahasa Indonesia yang natural, singkat, dan to the point.
5. Batas respons: 3-4 kalimat.`;

      const userPrompt = JSON.stringify({ lots: structuredLots, context: { day, hour, vehicle } });

      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: [{ parts: [{ text: userPrompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
            }),
          }
        );
        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          narasi = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? narasi;
        }
      } catch {
        // Gemini fallback below
      }
    } else if (structuredLots.length > 0) {
      const top = structuredLots[0];
      const slotInfo = top.open_slots !== null ? `~${top.open_slots} slot` : "slot tersedia";
      const walkInfo = top.durasi_detik ? `${Math.ceil(top.durasi_detik / 60)} menit jalan kaki` : "dekat stasiun";
      narasi = `${top.nama} adalah pilihan terbaik saat ini dengan ${slotInfo} dan ${walkInfo} ke pintu stasiun.`;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          narasi,
          lots: structuredLots,
          context: { day, hour, vehicle },
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
