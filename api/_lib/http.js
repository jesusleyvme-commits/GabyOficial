// Utilitários partilhados pelas funções em /api.
// Ficheiros/dirs prefixados com "_" não são publicados como rotas na Vercel.

const crypto = require("crypto");

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const ANGLE_BRACKETS = /[<>]/g;

const sanitize = (value, max = 200) =>
  String(value ?? "")
    .replace(CONTROL_CHARS, "")
    .replace(ANGLE_BRACKETS, "")
    .slice(0, max);

// Mantém objetos pequenos e previsíveis: serializa, corta a 2 KB e volta a ler.
function parseExtra(value) {
  if (!value || typeof value !== "object") return {};
  try {
    const parsed = JSON.parse(sanitize(JSON.stringify(value), 2000));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Upstash Redis não configurado");
  return { url: url.replace(/\/+$/, ""), token };
}

async function redisCommand(command, ...args) {
  const { url, token } = redisConfig();
  const path = [command, ...args.map((arg) => encodeURIComponent(arg))].join("/");
  const response = await fetch(`${url}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Redis ${response.status}`);
  const data = await response.json();
  return data.result;
}

// Envia vários comandos numa só viagem HTTP (menos latência que comandos soltos).
async function redisPipeline(commands) {
  const { url, token } = redisConfig();
  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!response.ok) throw new Error(`Redis ${response.status}`);
  return response.json();
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
}

function hashIp(ip) {
  if (!ip) return null;
  const salt = process.env.IP_SALT || "gaby-default-salt";
  return crypto.createHash("sha256").update(ip + salt).digest("hex").slice(0, 32);
}

module.exports = {
  sanitize,
  parseExtra,
  redisCommand,
  redisPipeline,
  clientIp,
  hashIp,
};
