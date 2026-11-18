// API de tracking (Vercel Serverless Function)
// Recebe eventos do front-end, enriquece com geo/headers e guarda no Upstash Redis.
// Env vars necessárias:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//   IP_SALT (opcional, para anonimizar o IP)

const crypto = require("crypto");
const { sanitize, parseExtra, redisPipeline, clientIp, hashIp } = require("./_lib/http");

const EVENTS_KEY = "gaby:events";
const MAX_EVENTS = 10000;

// Limite simples por IP (por instância). Serve para travar spam básico.
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_KEYS = 5000;
const rateBuckets = new Map();

function isRateLimited(key) {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > RATE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;

  if (rateBuckets.size > RATE_MAX_KEYS) {
    for (const [bucketKey, value] of rateBuckets) {
      if (now - value.start > RATE_WINDOW_MS) rateBuckets.delete(bucketKey);
    }
  }

  return bucket.count > RATE_LIMIT;
}

const decode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
};

const PRIVATE_IP = /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1|f[cd][0-9a-f]{2}:|fe80:)/i;
const PRIVATE_172 = /^172\.(?:1[6-9]|2\d|3[01])\./;

// Fallback de geolocalização por IP (usado quando não há headers da Vercel).
// ipapi.co tem tier gratuito; em produção na Vercel os headers já trazem geo.
async function geoFromIp(ip) {
  if (!ip || PRIVATE_IP.test(ip) || PRIVATE_172.test(ip)) return {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
      headers: { "User-Agent": "gaby-landing/1.0" },
    });
    if (!response.ok) return {};
    const data = await response.json();
    return {
      country: data.country_code || "",
      region: data.region || "",
      city: data.city || "",
      latitude: data.latitude || "",
      longitude: data.longitude || "",
      timezone: data.timezone || "",
    };
  } catch (error) {
    return {};
  } finally {
    clearTimeout(timer);
  }
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

  const ip = clientIp(req);
  const ipHash = hashIp(ip);

  if (isRateLimited(ipHash || "anonimo")) {
    res.status(429).json({ ok: false, error: "rate_limited" });
    return;
  }

  const extra = parseExtra(body.extra);
  const eventName = sanitize(body.event || "unknown", 60);
  const contentName = typeof body.content_name === "string" ? body.content_name : "";
  // O front manda o rótulo do botão em `label`, `content_name` (só quando difere
  // do evento) ou `extra.label`. Isto evita poluir os cliques com page_view etc.
  const label =
    body.label ||
    extra.label ||
    (contentName && contentName !== body.event ? contentName : "");

  // Geo: prioriza headers da Vercel; se não existirem, tenta por IP.
  let geo = {
    country: req.headers["x-vercel-ip-country"] || "",
    region: decode(req.headers["x-vercel-ip-country-region"] || ""),
    city: decode(req.headers["x-vercel-ip-city"] || ""),
    latitude: req.headers["x-vercel-ip-latitude"] || "",
    longitude: req.headers["x-vercel-ip-longitude"] || "",
    timezone: req.headers["x-vercel-ip-timezone"] || "",
  };
  if (!geo.country) {
    geo = { ...geo, ...(await geoFromIp(ip)) };
  }

  const record = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    event: eventName,
    label: sanitize(label, 140),
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
    country: sanitize(geo.country || "", 8),
    region: sanitize(geo.region || "", 80),
    city: sanitize(geo.city || "", 80),
    latitude: sanitize(geo.latitude || "", 20),
    longitude: sanitize(geo.longitude || "", 20),
    geoTimezone: sanitize(geo.timezone || "", 60),
  };

  try {
    const results = await redisPipeline([
      ["LPUSH", EVENTS_KEY, JSON.stringify(record)],
      ["LTRIM", EVENTS_KEY, "0", String(MAX_EVENTS - 1)],
    ]);
    if (Array.isArray(results) && results.some((result) => result && result.error)) {
      throw new Error("Redis pipeline error");
    }
  } catch (error) {
    console.error("track_error", error.message);
    // Não rebenta a experiência do utilizador se o storage falhar.
    res.status(200).json({ ok: true, stored: false });
    return;
  }

  res.status(200).json({ ok: true });
};
