// Ommaviy hisoblagich: bugun (Toshkent vaqti) nechta buyurtma muvaffaqiyatli yuborilgan.
// Faqat umumiy son qaytadi (ism/telefon yo'q). stats:<kun> kalitidagi "...:ok" qiymatlari yig'iladi.
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
  if (req.method !== "GET") return res.status(405).json({ error: "method" });
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(200).json({ n: 0 });
  try {
    const day = new Date(Date.now() + 5 * 36e5).toISOString().slice(0, 10);
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(["HGETALL", "stats:" + day]),
    });
    const j = await r.json();
    let h = j && j.result, n = 0, pairs = [];
    if (Array.isArray(h)) for (let k = 0; k + 1 < h.length; k += 2) pairs.push([h[k], h[k + 1]]);
    else if (h && typeof h === "object") pairs = Object.entries(h);
    pairs.forEach(([f, v]) => { if (String(f).split(":")[1] === "ok") n += Number(v) || 0; });
    return res.status(200).json({ n });
  } catch (e) {
    return res.status(200).json({ n: 0 });
  }
};
