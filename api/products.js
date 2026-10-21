// Mahsulotlar ro'yxati: sayt o'qiydi (GET), admin.html saqlaydi (POST, parol bilan).
// Kerak: Upstash Redis (Vercel Storage orqali ulanadi) va ADMIN_PASSWORD o'zgaruvchisi.
const crypto = require("crypto");

function db() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
async function redis(cfg, cmd) {
  const r = await fetch(cfg.url, {
    method: "POST",
    headers: { Authorization: "Bearer " + cfg.token, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || "redis");
  return j.result;
}
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
function isAdmin(req) {
  const p = process.env.ADMIN_PASSWORD, g = req.headers["x-admin-password"];
  if (!p || !g) return false;
  return crypto.timingSafeEqual(sha(p), sha(g));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const num = (v) => { v = Math.round(Number(v)); return v > 0 && v < 1e9 ? v : 0; };

function clean(list) {
  return list.slice(0, 200).map((x) => {
    x = x || {};
    const m = /(\d{3,12})\s*\/?\s*$/.exec(str(x.oqim, 200));
    const im = str(x.im, 500);
    return {
      n: str(x.n, 120),
      c: str(x.c, 40),
      p: num(x.p),
      o: num(x.o),
      e: str(x.e, 8),
      im: /^(https?:\/\/|\/)/.test(im) ? im : "",
      d: str(x.d, 1000),
      f: (Array.isArray(x.f) ? x.f : []).slice(0, 12).map((t) => str(t, 120)).filter(Boolean),
      oqim: m ? "https://alijahon.uz/oqim/" + m[1] : "",
      hit: !!x.hit,
      active: x.active !== false,
    };
  }).filter((x) => x.n);
}

module.exports = async (req, res) => {
  const cfg = db();
  const hasPw = !!req.headers["x-admin-password"];

  if (req.method === "GET") {
    if (hasPw && !isAdmin(req)) { await sleep(600); return res.status(401).json({ error: "parol" }); }
    if (!cfg) {
      if (hasPw) return res.status(500).json({ error: "Baza (Upstash) ulanmagan" });
      return res.status(200).json(null);
    }
    let data = null;
    try { const raw = await redis(cfg, ["GET", "products"]); data = raw ? JSON.parse(raw) : null; }
    catch (e) {
      if (hasPw) return res.status(500).json({ error: "Baza xatosi" });
      return res.status(200).json(null);
    }
    if (hasPw) { res.setHeader("Cache-Control", "no-store"); return res.status(200).json({ items: data }); }
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=5, stale-while-revalidate=30");
    return res.status(200).json(Array.isArray(data) ? data.filter((x) => x.active !== false) : null);
  }

  if (req.method === "POST") {
    if (!isAdmin(req)) { await sleep(600); return res.status(401).json({ error: "parol" }); }
    if (!cfg) return res.status(500).json({ error: "Baza (Upstash) ulanmagan" });
    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
    if (!b || !Array.isArray(b.items)) return res.status(400).json({ error: "bad" });
    const items = clean(b.items);
    try { await redis(cfg, ["SET", "products", JSON.stringify(items)]); }
    catch (e) { return res.status(500).json({ error: "Saqlanmadi" }); }
    return res.status(200).json({ ok: true, count: items.length });
  }

  return res.status(405).json({ error: "method" });
};
