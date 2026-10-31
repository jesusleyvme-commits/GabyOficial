const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
process.env.IP_SALT = "test-salt";

const handler = require(path.resolve(__dirname, "../api/track.js"));

let calls = [];
global.fetch = async (url) => {
  calls.push(String(url));
  return { ok: true, json: async () => ({ result: 1 }) };
};

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

const request = (body, ip, extraHeaders = {}) => {
  const res = makeRes();
  const req = {
    method: "POST",
    headers: {
      "x-forwarded-for": ip,
      "x-vercel-ip-country": "PT",
      "user-agent": "node-test",
      ...extraHeaders,
    },
    body,
  };
  return handler(req, res).then(() => res);
};

const lastRecord = () => {
  const pushes = calls.filter((url) => url.includes("/LPUSH/"));
  assert.ok(pushes.length > 0, "nada foi gravado no Redis");
  const encoded = pushes[pushes.length - 1].split("/LPUSH/gaby%3Aevents/")[1];
  return JSON.parse(decodeURIComponent(encoded));
};

test("GET devolve 405", async () => {
  const res = makeRes();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.code, 405);
  assert.equal(res.body.ok, false);
});

test("label vem de content_name (formato usado pelo index.html)", async () => {
  calls = [];
  const res = await request(
    { event: "cta_click", content_name: "Previews_Gratis", visitor: "v1", firstSeen: true },
    "1.1.1.1"
  );
  assert.equal(res.code, 200);
  assert.equal(lastRecord().label, "Previews_Gratis");
});

test("label vem de extra.label quando não há content_name", async () => {
  calls = [];
  await request(
    { event: "cta_click", extra: { label: "Acesso_VIP_Privado" }, visitor: "v1" },
    "2.2.2.2"
  );
  assert.equal(lastRecord().label, "Acesso_VIP_Privado");
});

test("page_view não ganha label com o próprio nome do evento", async () => {
  calls = [];
  await request({ event: "page_view", content_name: "page_view" }, "4.4.4.4");
  assert.equal(lastRecord().label, "");
});

test("extra inválido ou demasiado grande não rebenta o endpoint", async () => {
  calls = [];
  const res = await request(
    { event: "page_view", extra: { note: "a".repeat(3000) } },
    "3.3.3.3"
  );
  assert.equal(res.code, 200);
  assert.deepEqual(lastRecord().extra, {});
});

test("rate-limit devolve 429 depois de 120 eventos do mesmo IP", async () => {
  calls = [];
  let last;
  for (let i = 0; i < 121; i += 1) {
    last = await request({ event: "page_view" }, "9.9.9.9");
  }
  assert.equal(last.code, 429);
  assert.equal(last.body.error, "rate_limited");
});
