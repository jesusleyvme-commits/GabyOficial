const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

const handler = require(path.resolve(__dirname, "../api/stats.js"));

const events = [
  {
    ts: Date.UTC(2026, 9, 1, 10, 0, 0),
    event: "page_view",
    visitor: "v1",
    firstSeen: true,
    referrer: "",
    device: "desktop",
    locale: "pt-PT",
    geoTimezone: "Europe/Lisbon",
    country: "PT",
    city: "Lisbon",
    userAgent: "Mozilla/5.0 (Windows NT 10.0)",
  },
  {
    ts: Date.UTC(2026, 9, 1, 10, 1, 0),
    event: "cta_click",
    label: "Previews_Gratis",
    visitor: "v1",
    firstSeen: false,
    referrer: "https://instagram.com/",
    device: "mobile",
    locale: "pt-BR",
    geoTimezone: "Europe/Lisbon",
    country: "PT",
    city: "Lisbon",
    userAgent: "Mozilla/5.0 (iPhone)",
  },
  {
    ts: Date.UTC(2026, 9, 1, 10, 2, 0),
    event: "page_view",
    visitor: "v2",
    firstSeen: true,
    referrer: "",
    device: "mobile",
    locale: "pt-BR",
    geoTimezone: "America/Sao_Paulo",
    country: "BR",
    city: "Sao Paulo",
    userAgent: "Mozilla/5.0 (Linux; Android 14)",
  },
  {
    ts: Date.UTC(2026, 9, 1, 10, 3, 0),
    event: "time_on_page",
    visitor: "v2",
    firstSeen: true,
    extra: { seconds: 30 },
    referrer: "",
    device: "mobile",
    locale: "pt-BR",
    geoTimezone: "America/Sao_Paulo",
    country: "BR",
    city: "Sao Paulo",
    userAgent: "Mozilla/5.0 (Linux; Android 14)",
  },
];

global.fetch = async () => ({
  ok: true,
  json: async () => ({ result: events.map((event) => JSON.stringify(event)) }),
});

const makeRes = () => ({
  code: 200,
  body: null,
  setHeader() {},
  status(code) {
    this.code = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const call = async (headers) => {
  const res = makeRes();
  await handler({ headers }, res);
  return res;
};

test("sem credenciais devolve 401", async () => {
  const res = await call({});
  assert.equal(res.code, 401);
  assert.equal(res.body.ok, false);
});

test("credenciais erradas devolvem 401", async () => {
  const res = await call({ "x-dashboard-user": "gaby", "x-dashboard-pass": "errada" });
  assert.equal(res.code, 401);
});

test("credenciais por env vars funcionam e agregam os dados", async () => {
  process.env.DASHBOARD_USER = "tester";
  process.env.DASHBOARD_PASS = "segredo-forte";

  const res = await call({
    "x-dashboard-user": "tester",
    "x-dashboard-pass": "segredo-forte",
  });

  assert.equal(res.code, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.total, 4);
  assert.equal(res.body.uniqueVisitors, 2);
  assert.equal(res.body.returningVisitors, 1);
  assert.equal(res.body.avgTimeOnPage, 30);
  assert.equal(res.body.series.length, 1);
  assert.ok(res.body.referrers.some((item) => item.name === "instagram.com"));
  assert.ok(
    res.body.clicks.some(
      (item) => item.name === "cta_click:Previews_Gratis" && item.count === 1
    )
  );
});

test("as credenciais antigas deixam de funcionar quando há env vars", async () => {
  process.env.DASHBOARD_USER = "tester";
  process.env.DASHBOARD_PASS = "segredo-forte";

  const res = await call({
    "x-dashboard-user": "gaby",
    "x-dashboard-pass": "aec199ad244d5fb51348215a",
  });

  assert.equal(res.code, 401);
});
