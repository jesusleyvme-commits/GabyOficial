// API de estatísticas do dashboard (protegida por usuário e senha)
// Env vars necessárias:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//
// Acesso: GET /api/stats com headers "x-dashboard-user" e "x-dashboard-pass"

const EVENTS_KEY = "gaby:events";

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

const dayOf = (ts) => new Date(ts).toISOString().slice(0, 10);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const providedUser =
    req.headers["x-dashboard-user"] ||
    (req.query && req.query.user) ||
    "";
  const providedPass =
    req.headers["x-dashboard-pass"] ||
    (req.query && req.query.pass) ||
    "";
  const expectedUser = "gaby";
  const expectedPass = "aec199ad244d5fb51348215a";

  if (providedUser !== expectedUser || providedPass !== expectedPass) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  let events = [];
  try {
    const raw = await redis("LRANGE", EVENTS_KEY, "0", "-1");
    events = (raw.result || [])
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
  const timeOnPage = [];

  events.forEach((event) => {
    if (event.visitor) {
      visitors.add(event.visitor);
    }
    if (event.firstSeen === false) {
      returning.add(event.visitor || event.id);
    }
    if (event.country) inc(countries, event.country);
    if (event.city) inc(cities, `${event.city} (${event.country || "?"})`);
    inc(referrers, hostOf(event.referrer));
    inc(devices, event.device || "desconhecido");
    inc(locales, event.locale || "desconhecido");
    inc(timezones, event.geoTimezone || event.clientTimezone || "desconhecido");
    inc(eventsByName, event.event || "unknown");
    if (event.label) inc(eventsByLabel, `${event.event}:${event.label}`);
    inc(byDay, dayOf(event.ts));

    if (event.event === "time_on_page" && event.extra && typeof event.extra.seconds === "number") {
      timeOnPage.push(event.extra.seconds);
    }
  });

  const avgTime =
    timeOnPage.length > 0
      ? Math.round(timeOnPage.reduce((a, b) => a + b, 0) / timeOnPage.length)
      : 0;

  const uaLabels = {};
  events.forEach((event) => {
    const ua = event.userAgent || "";
    let name = "Outro";
    if (/iPhone|iPad|iPod/i.test(ua)) name = "iOS";
    else if (/Android/i.test(ua)) name = "Android";
    else if (/Windows/i.test(ua)) name = "Windows";
    else if (/Mac OS X|Macintosh/i.test(ua)) name = "macOS";
    else if (/Linux/i.test(ua)) name = "Linux";
    inc(uaLabels, name);
  });

  const days = Object.keys(byDay).sort();
  const series = days.map((day) => ({ day, count: byDay[day] }));

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
    platforms: top(uaLabels),
    series,
    recent,
  });
};
