const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  parseMeta,
  imageSize,
  isAllowed,
} = require(path.resolve(__dirname, "../scripts/meta-check.js"));

const ROOT = path.resolve(__dirname, "..");

test("parseMeta extrai propriedades Open Graph e meta name", () => {
  const html =
    '<meta property="og:title" content="Gaby">' +
    '<meta name="description" content="cantanho">';
  assert.deepEqual(parseMeta(html), {
    "og:title": "Gaby",
    description: "cantanho",
  });
});

test("imageSize lê as dimensões da imagem OG (1200x630)", () => {
  const buffer = fs.readFileSync(path.join(ROOT, "assets/og.jpg"));
  assert.deepEqual(imageSize(buffer), { width: 1200, height: 630, type: "jpeg" });
});

test("robots.txt permite o crawler da Meta e bloqueia a API", () => {
  const robots = fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8");
  assert.equal(isAllowed(robots, "facebookexternalhit/1.1", "/"), true);
  assert.equal(isAllowed(robots, "meta-externalagent/1.1", "/"), true);
  assert.equal(isAllowed(robots, "WhatsApp/2.23", "/"), true);
  assert.equal(isAllowed(robots, "outro-bot", "/api/track"), false);
});

test("meta:check em modo local não devolve erros", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts/meta-check.js"), "--local"],
    { encoding: "utf8", env: { ...process.env, SITE_URL: "" } }
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
