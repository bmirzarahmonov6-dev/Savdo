// Admin uchun statistika: kunlar bo'yicha lidlar (faqat admin paroli bilan).
const crypto = require("crypto");

function db() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
function isAdmin(req) {
  const p = process.env.ADMIN_PASSWORD, g = req.headers["x-admin-password"];
  if (!p || !g) return false;
  return crypto.timingSafeEqual(sha(p), sha(g));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "method" });
  if (!isAdmin(req)) { await sleep(600); return res.status(401).json({ error: "parol" }); }
  const cfg = db();
  if (!cfg) return res.status(500).json({ error: "Baza ulanmagan" });

  let n = parseInt(req.query && req.query.days, 10) || 120;
  n = Math.max(1, Math.min(n, 366));
  const base = Date.now() + 5 * 36e5; // Toshkent vaqti
  const dates = [];
  for (let i = 0; i < n; i++) dates.push(new Date(base - i * 864e5).toISOString().slice(0, 10));

  let arr;
  try {
    const r = await fetch(cfg.url + "/pipeline", {
      method: "POST",
      headers: { Authorization: "Bearer " + cfg.token, "Content-Type": "application/json" },
      body: JSON.stringify(dates.map((d) => ["HGETALL", "stats:" + d])),
    });
    arr = await r.json();
    if (!r.ok || !Array.isArray(arr)) throw new Error("redis");
  } catch (e) { return res.status(502).json({ error: "Baza xatosi" }); }

  const days = {};
  arr.forEach((it, i) => {
    let h = it && it.result, pairs = [];
    if (Array.isArray(h)) for (let k = 0; k + 1 < h.length; k += 2) pairs.push([h[k], h[k + 1]]);
    else if (h && typeof h === "object") pairs = Object.entries(h);
    const o = {};
    pairs.forEach(([f, v]) => {
      const [stream, kind] = String(f).split(":");
      if (!stream || (kind !== "ok" && kind !== "fail")) return;
      (o[stream] = o[stream] || { ok: 0, fail: 0 })[kind] = Number(v) || 0;
    });
    if (Object.keys(o).length) days[dates[i]] = o;
  });
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ days });
};
