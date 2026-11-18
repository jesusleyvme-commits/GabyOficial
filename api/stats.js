// API de estatísticas do dashboard (protegida por usuário e senha)
// Env vars necessárias:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//   DASHBOARD_USER
//   DASHBOARD_PASS
//
// Acesso: GET /api/stats com headers "x-dashboard-user" e "x-dashboard-pass"

const crypto = require("crypto");
const { redisCommand } = require("./_lib/http");

const EVENTS_KEY = "gaby:events";

function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

const hostOf = (value) => {
  if (!value) return "direto";
  try {
    return new URL(value).hostname || "direto";
  } catch (error) {
    return "direto";
  }
};

const inc = (map, key, amount = 1) => {
  map[key] = (map[key] || 0) + amount;
};

const top = (map, limit = 10) =>
  Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));

const dayOf = (ts) =>
  Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : "desconhecido";

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const providedUser = req.headers["x-dashboard-user"] || "";
  const providedPass = req.headers["x-dashboard-pass"] || "";

  // Define DASHBOARD_USER e DASHBOARD_PASS nas env vars do projeto (Vercel).
  // Sem credenciais configuradas, o acesso fica sempre negado.
  const expectedUser = process.env.DASHBOARD_USER || "";
  const expectedPass = process.env.DASHBOARD_PASS || "";

  const authorized =
    expectedUser &&
    expectedPass &&
    safeEqual(providedUser, expectedUser) &&
    safeEqual(providedPass, expectedPass);

  if (!authorized) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  let events = [];
  try {
    const raw = await redisCommand("LRANGE", EVENTS_KEY, "0", "-1");
    events = (raw || [])
      .map((item) => {
        try {
          return JSON.parse(item);
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    res.status(200).json({ ok: false, error: error.message, events: [] });
    return;
  }

  const total = events.length;
  const visitors = new Set();
  const returning = new Set();
  const countries = {};
  const cities = {};
  const referrers = {};
  const devices = {};
  const locales = {};
  const timezones = {};
  const eventsByName = {};
  const eventsByLabel = {};
  const byDay = {};
  const platformCounts = {};
  const timeOnPage = [];
  let timeOnPageTotal = 0;

  const platformOf = (ua) => {
    if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
    if (/Android/i.test(ua)) return "Android";
    if (/Windows/i.test(ua)) return "Windows";
    if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
    if (/Linux/i.test(ua)) return "Linux";
    return "Outro";
  };

  for (const event of events) {
    if (event.visitor) visitors.add(event.visitor);
    if (event.firstSeen === false) returning.add(event.visitor || event.id);
    if (event.country) inc(countries, event.country);
    if (event.city) inc(cities, `${event.city} (${event.country || "?"})`);
    inc(referrers, hostOf(event.referrer));
    inc(devices, event.device || "desconhecido");
    inc(locales, event.locale || "desconhecido");
    inc(timezones, event.geoTimezone || event.clientTimezone || "desconhecido");
    inc(eventsByName, event.event || "unknown");
    if (event.label) inc(eventsByLabel, `${event.event}:${event.label}`);
    inc(byDay, dayOf(event.ts));
    inc(platformCounts, platformOf(event.userAgent || ""));

    if (event.event === "time_on_page" && event.extra && typeof event.extra.seconds === "number") {
      timeOnPage.push(event.extra.seconds);
      timeOnPageTotal += event.extra.seconds;
    }
  }

  const avgTime =
    timeOnPage.length > 0 ? Math.round(timeOnPageTotal / timeOnPage.length) : 0;

  const series = Object.keys(byDay)
    .sort()
    .map((day) => ({ day, count: byDay[day] }));

  const recent = events.slice(0, 50).map((event) => ({
    ts: event.ts,
    event: event.event,
    label: event.label,
    country: event.country,
    city: event.city,
    referrer: hostOf(event.referrer),
    device: event.device,
    locale: event.locale,
    timezone: event.geoTimezone || event.clientTimezone,
  }));

  res.status(200).json({
    ok: true,
    total,
    uniqueVisitors: visitors.size,
    returningVisitors: returning.size,
    avgTimeOnPage: avgTime,
    countries: top(countries),
    cities: top(cities),
    referrers: top(referrers),
    devices: top(devices),
    locales: top(locales),
    timezones: top(timezones),
    events: top(eventsByName),
    clicks: top(eventsByLabel),
    platforms: top(platformCounts),
    series,
    recent,
  });
};
