// Rasm yuklash (admin) va berish (sayt). Rasmlar Upstash Redis'da saqlanadi.
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

module.exports = async (req, res) => {
  const cfg = db();

  if (req.method === "GET") {
    const id = String((req.query && req.query.id) || "");
    if (!cfg || !/^[a-f0-9]{16}$/.test(id)) return res.status(404).end();
    let v;
    try { v = await redis(cfg, ["GET", "img:" + id]); } catch (e) { return res.status(502).end(); }
    const m = v && /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(v);
    if (!m) return res.status(404).end();
    res.setHeader("Content-Type", "image/" + m[1]);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.status(200).send(Buffer.from(m[2], "base64"));
  }

  if (req.method === "POST") {
    if (!isAdmin(req)) { await sleep(600); return res.status(401).json({ error: "parol" }); }
    if (!cfg) return res.status(500).json({ error: "Baza ulanmagan" });
    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
    const data = b && typeof b.data === "string" ? b.data : "";
    if (data.length > 700000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data))
      return res.status(400).json({ error: "Rasm noto'g'ri yoki juda katta" });
    const id = crypto.randomBytes(8).toString("hex");
    try { await redis(cfg, ["SET", "img:" + id, data]); }
    catch (e) { return res.status(500).json({ error: "Saqlanmadi" }); }
    return res.status(200).json({ url: "/api/img?id=" + id });
  }

  return res.status(405).json({ error: "method" });
};
