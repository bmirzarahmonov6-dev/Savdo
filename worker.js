// Cloudflare Worker: saytdagi formadan lidni alijahon.uz API'ga yuboradi.
// API kalit kodda EMAS, Worker "Secrets"da saqlanadi (ALIJAHON_KEY).
// Sozlash: Worker → Settings → Variables and Secrets:
//   ALIJAHON_KEY  (Secret)  — kabinetdagi API kalit
//   ALLOWED_ORIGIN (Text)   — saytingiz manzili, masalan https://sizningsayt.uz

const API_URL = "https://alijahon.uz/api/new-order/";

export default {
  async fetch(req, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ error: "method" }, 405);

    let b;
    try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }

    const full_name = String(b.full_name || "").trim().slice(0, 100);
    const phone_number = String(b.phone_number || "").replace(/[^\d+]/g, "").slice(0, 16);
    const stream = String(b.stream || "").replace(/\D/g, "").slice(0, 12);
    if (full_name.length < 2 || phone_number.replace(/\D/g, "").length < 12 || !stream)
      return json({ error: "invalid" }, 400);

    const payload = { full_name, phone_number, stream };
    const key = env.ALIJAHON_KEY;

    // Avtorizatsiya sxemasi hujjatda ko'rsatilmagan — 401/403 bo'lsa keyingisini sinaydi.
    // Qaysi biri ishlasa, javobdagi "auth" maydonida ko'rinadi; keyin faqat shuni qoldiring.
    const schemes = [
      { name: "Token", h: { Authorization: "Token " + key } },
      { name: "Bearer", h: { Authorization: "Bearer " + key } },
      { name: "X-API-Key", h: { "X-API-Key": key } },
      { name: "body", h: {}, body: { ...payload, api_key: key } },
    ];

    let last;
    for (const sc of schemes) {
      const r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sc.h },
        body: JSON.stringify(sc.body || payload),
      });
      const text = await r.text();
      last = { status: r.status, text };
      if (r.status !== 401 && r.status !== 403) {
        return json({ ok: r.ok, auth: sc.name, upstream: safe(text) }, r.ok ? 200 : 502);
      }
    }
    return json({ ok: false, error: "auth", upstream: safe(last.text) }, 502);
  },
};

function safe(t) { try { return JSON.parse(t); } catch { return t.slice(0, 300); } }
