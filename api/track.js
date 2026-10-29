// API de tracking (Vercel Serverless Function)
// Recebe eventos do front-end, enriquece com geo/headers e guarda no Upstash Redis.
// Env vars necessárias:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//   IP_SALT (opcional, para anonimizar o IP)

const crypto = require("crypto");

const EVENTS_KEY = "gaby:events";
const MAX_EVENTS = 10000;

const sanitize = (value, max = 200) =>
  String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .slice(0, max);

const decode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
};

async function redis(command, ...args) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Upstash Redis não configurado");

  const path = [command, ...args.map((a) => encodeURIComponent(a))].join("/");
  const response = await fetch(`${url}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Redis ${response.status}`);
  return response.json();
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      body = {};
    }
  }
  if (!body || typeof body !== "object") body = {};

  const forwarded = String(req.headers["x-forwarded-for"] || "");
  const ip = forwarded.split(",")[0].trim();
  const salt = process.env.IP_SALT || "gaby-default-salt";
  const ipHash = ip
    ? crypto.createHash("sha256").update(ip + salt).digest("hex").slice(0, 32)
    : null;

  const extra =
    body.extra && typeof body.extra === "object"
      ? JSON.parse(sanitize(JSON.stringify(body.extra), 2000))
      : {};

  const record = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    event: sanitize(body.event || "unknown", 60),
    label: sanitize(body.label || "", 140),
    visitor: sanitize(body.visitor || "", 64),
    firstSeen: Boolean(body.firstSeen),
    page: sanitize(body.page || "", 500),
    referrer: sanitize(body.referrer || "", 500),
    locale: sanitize(body.locale || "", 20),
    language: sanitize(body.language || "", 80),
    clientTimezone: sanitize(body.timezone || "", 60),
    screen: sanitize(body.screen || "", 20),
    viewport: sanitize(body.viewport || "", 20),
    device: sanitize(body.device || "", 20),
    connection: sanitize(body.connection || "", 20),
    extra,
    ipHash,
    userAgent: sanitize(req.headers["user-agent"] || "", 320),
    country: sanitize(req.headers["x-vercel-ip-country"] || "", 8),
    region: sanitize(decode(req.headers["x-vercel-ip-country-region"] || ""), 80),
    city: sanitize(decode(req.headers["x-vercel-ip-city"] || ""), 80),
    latitude: sanitize(req.headers["x-vercel-ip-latitude"] || "", 20),
    longitude: sanitize(req.headers["x-vercel-ip-longitude"] || "", 20),
    geoTimezone: sanitize(req.headers["x-vercel-ip-timezone"] || "", 60),
  };

  try {
    await redis("LPUSH", EVENTS_KEY, JSON.stringify(record));
    await redis("LTRIM", EVENTS_KEY, "0", String(MAX_EVENTS - 1));
  } catch (error) {
    console.error("track_error", error.message);
    // Não rebenta a experiência do utilizador se o storage falhar.
    res.status(200).json({ ok: true, stored: false });
    return;
  }

  res.status(200).json({ ok: true });
};
