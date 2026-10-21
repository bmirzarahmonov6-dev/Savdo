// Oxirgi haqiqiy buyurtmalar ro'yxati (faqat mahsulot, hudud va vaqt; ism/telefon yo'q).
module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "method" });
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(200).json([]);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(["LRANGE", "recent", 0, 9]),
    });
    const j = await r.json();
    const now = Date.now();
    const out = (Array.isArray(j.result) ? j.result : [])
      .map((x) => { try { return JSON.parse(x); } catch { return null; } })
      .filter((x) => x && x.s && x.t && now - x.t < 72 * 36e5)
      .map((x) => ({ s: String(x.s), r: String(x.r || ""), t: Number(x.t) }));
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=20, stale-while-revalidate=60");
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json([]);
  }
};
