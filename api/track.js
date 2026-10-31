// API de tracking (Vercel Serverless Function)
// Recebe eventos do front-end, enriquece com geo/headers e guarda no Upstash Redis.
// Env vars necessárias:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//   IP_SALT (opcional, para anonimizar o IP)

const crypto = require("crypto");

const EVENTS_KEY = "gaby:events";
const MAX_EVENTS = 10000;

// Limite simples por IP (por instância). Serve para travar spam básico.
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60 * 1000;
const rateBuckets = new Map();

function isRateLimited(key) {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > RATE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;

  if (rateBuckets.size > 5000) {
    for (const [bucketKey, value] of rateBuckets) {
      if (now - value.start > RATE_WINDOW_MS) rateBuckets.delete(bucketKey);
    }
  }

  return bucket.count > RATE_LIMIT;
}

function parseExtra(value) {
  if (!value || typeof value !== "object") return {};
  try {
    const parsed = JSON.parse(sanitize(JSON.stringify(value), 2000));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

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

// Fallback de geolocalização por IP (usado quando não há headers da Vercel).
// ipapi.co tem tier gratuito; em produção na Vercel os headers já trazem geo.
async function geoFromIp(ip) {
  if (!ip || /^(127\.|10\.|192\.168\.|::1|0\.0\.0\.0)/.test(ip)) return {};
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
      headers: { "User-Agent": "gaby-landing/1.0" },
    });
    clearTimeout(timer);
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
  }
}

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

  if (isRateLimited(ipHash || "anonimo")) {
    res.status(429).json({ ok: false, error: "rate_limited" });
    return;
  }

  const extra = parseExtra(body.extra);
  // O front manda o rótulo do botão em `label`, `content_name` ou `extra.label`.
  const label = body.label || body.content_name || extra.label || "";

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
    const fallback = await geoFromIp(ip);
    geo = { ...geo, ...fallback };
  }

  const record = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    event: sanitize(body.event || "unknown", 60),
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
