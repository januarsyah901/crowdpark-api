import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lot_id, day, hour, vehicle = "all" } = await req.json();

    if (!lot_id || day === undefined || hour === undefined) {
      return new Response(
        JSON.stringify({ error: "lot_id, day, and hour are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: lot, error: dbErr } = await supabase
      .from("parking_lots_geo")
      .select("*")
      .eq("id", lot_id)
      .single();

    if (dbErr || !lot) {
      return new Response(
        JSON.stringify({ error: "Parking lot not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ML_URL = Deno.env.get("ML_SERVICE_URL") || "http://ml:8000";
    let mlResult: any = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const mlRes = await fetch(`${ML_URL}/analyze/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lot_id, day, hour, vehicle }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (mlRes.ok) mlResult = await mlRes.json();
    } catch {
      // ML unavailable fallback
    }

    const estimasiPct = mlResult?.estimasi_motor_pct ?? null;
    const openSlots = estimasiPct !== null
      ? Math.max(0, Math.floor(lot.kapasitas_motor * (1 - estimasiPct / 100)))
      : lot.kapasitas_motor;

    const result = {
      id: lot.id.toString(),
      name: lot.nama,
      address: lot.tipe,
      lat: lot.lat,
      lng: lot.lng,
      openSlots,
      totalSlots: lot.kapasitas_motor,
      rate: lot.tarif_motor ? `Rp ${lot.tarif_motor.toLocaleString("id-ID")}` : "Gratis",
      driveMinutes: 10,
      distanceKm: 8,
      walkMinutes: lot.durasi_detik ? Math.ceil(lot.durasi_detik / 60) : 3,
      rating: 4.5,
      reviews: 142,
      confidence: mlResult?.confidence_level === "tinggi" ? 90
        : mlResult?.confidence_level === "sedang" ? 70 : 50,
      mlFallback: !mlResult,
    };

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
