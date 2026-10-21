// Vercel funksiyasi: formadan lidni alijahon.uz API'ga yuboradi.
// API kalit kodda emas, Vercel Environment Variables'da saqlanadi: ALIJAHON_KEY

const API_URL = "https://alijahon.uz/api/new-order/";

// Statistika: kunlik hisoblagich (Upstash). Xato bo'lsa ham lid yuborishga ta'sir qilmaydi.
async function track(stream, ok) {
  try {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return;
    const day = new Date(Date.now() + 5 * 36e5).toISOString().slice(0, 10); // Toshkent vaqti
    await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(["HINCRBY", "stats:" + day, stream + ":" + (ok ? "ok" : "fail"), 1]),
    });
  } catch (e) {}
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  const full_name = String(b.full_name || "").trim().slice(0, 100);
  const phone_number = String(b.phone_number || "").replace(/[^\d+]/g, "").slice(0, 16);
  const stream = String(b.stream || "").replace(/\D/g, "").slice(0, 12);
  if (full_name.length < 2 || phone_number.replace(/\D/g, "").length < 12 || !stream)
    return res.status(400).json({ error: "invalid" });

  const key = process.env.ALIJAHON_KEY;
  if (!key) return res.status(500).json({ error: "ALIJAHON_KEY yo'q" });

  const payload = { full_name, phone_number, stream };

  // Avtorizatsiya sxemasi hujjatda ko'rsatilmagan: 401/403 bo'lsa keyingisini sinaydi.
  // Ishlagani javobdagi "auth" maydonida ko'rinadi; keyin faqat shuni qoldirish mumkin.
  const schemes = [
    { name: "Token", h: { Authorization: "Token " + key } },
    { name: "Bearer", h: { Authorization: "Bearer " + key } },
    { name: "X-API-Key", h: { "X-API-Key": key } },
    { name: "body", h: {}, body: { ...payload, api_key: key } },
  ];

  let last = "";
  for (const sc of schemes) {
    try {
      const r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sc.h },
        body: JSON.stringify(sc.body || payload),
      });
      const text = await r.text();
      last = text;
      if (r.status !== 401 && r.status !== 403) {
        await track(stream, r.ok);
        return res.status(r.ok ? 200 : 502).json({ ok: r.ok, auth: sc.name, upstream: safe(text) });
      }
    } catch (e) {
      await track(stream, false);
      return res.status(502).json({ ok: false, error: "network" });
    }
  }
  await track(stream, false);
  return res.status(502).json({ ok: false, error: "auth", upstream: safe(last) });
};

function safe(t) { try { return JSON.parse(t); } catch { return String(t).slice(0, 300); } }
