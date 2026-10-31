const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

test("index.html tem meta tags para partilha (Instagram/WhatsApp)", () => {
  const html = read("index.html");
  const tags = [
    'name="description"',
    'property="og:title"',
    'property="og:description"',
    'property="og:image"',
    'name="twitter:card"',
    'rel="icon"',
  ];
  for (const tag of tags) {
    assert.ok(html.includes(tag), `falta ${tag}`);
  }
  assert.ok(!/\btext-md\b/.test(html), "classe Tailwind inválida text-md");
});

test("robots.txt permite indexação e bloqueia painel/API", () => {
  const robots = read("robots.txt");
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /Disallow: \/painel-7f3a9c/);
  assert.match(robots, /Disallow: \/api\//);
});

test("vercel.json tem cabeçalhos de segurança", () => {
  const config = JSON.parse(read("vercel.json"));
  const keys = config.headers.flatMap((entry) => entry.headers.map((header) => header.key));
  const expected = [
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Strict-Transport-Security",
    "Permissions-Policy",
  ];
  for (const key of expected) {
    assert.ok(keys.includes(key), `falta ${key}`);
  }
});

test("ficheiros mortos foram removidos e favicon existe", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "app.js")));
  assert.ok(!fs.existsSync(path.join(ROOT, "styles.css")));
  assert.ok(fs.existsSync(path.join(ROOT, "favicon.svg")));
});
