#!/usr/bin/env node
// Valida a pré-visualização de links na Meta (Instagram/Facebook/WhatsApp).
//
// Uso:
//   npm run meta:check -- https://teudominio.com
//   npm run meta:check -- --local            (valida index.html localmente)
//   SITE_URL=https://teudominio.com npm run meta:check
//
// Simula o crawler facebookexternalhit e verifica OG, robots.txt, imagem, etc.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const META_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function parseMeta(html) {
  const tags = {};
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const get = (attr) => {
      const match = tag.match(new RegExp(`${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
      return match ? match[1] ?? match[2] : null;
    };
    const key = get("property") || get("name");
    const content = get("content");
    if (key && content !== null) tags[key.toLowerCase()] = content;
  }
  return tags;
}

function imageSize(buffer) {
  if (buffer.length > 24 && buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), type: "png" };
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buffer.length) {
      if (buffer[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buffer[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: buffer.readUInt16BE(i + 7), height: buffer.readUInt16BE(i + 5), type: "jpeg" };
      }
      i += 2 + buffer.readUInt16BE(i + 2);
    }
  }
  return null;
}

function parseRobots(text) {
  const groups = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current) {
      current.rules.push({ type: field, path: value });
    }
  }
  return groups;
}

function isAllowed(robotsText, agent, targetPath) {
  const groups = parseRobots(robotsText);
  const name = agent.toLowerCase();
  const specific = groups.filter((group) =>
    group.agents.some((candidate) => candidate !== "*" && name.includes(candidate))
  );
  const rules = (specific.length ? specific : groups.filter((group) => group.agents.includes("*")))
    .flatMap((group) => group.rules);

  let best = null;
  for (const rule of rules) {
    if (rule.path === "") continue;
    if (!targetPath.startsWith(rule.path)) continue;
    const length = rule.path.length;
    if (!best || length > best.length || (length === best.length && rule.type === "allow")) {
      best = { length, allow: rule.type === "allow" };
    }
  }
  return best ? best.allow : true;
}

function localFileFor(urlPath) {
  const clean = decodeURIComponent(String(urlPath).split("?")[0]);
  const file = path.join(ROOT, clean.replace(/^\/+/, ""));
  return file.startsWith(ROOT) ? file : null;
}

function report(items) {
  const order = { ok: 0, warn: 1, error: 2 };
  const labels = { ok: "[OK]   ", warn: "[AVISO]", error: "[ERRO] " };
  items
    .slice()
    .sort((a, b) => order[a.level] - order[b.level])
    .forEach((item) => console.log(`${labels[item.level]} ${item.message}`));
  const count = (level) => items.filter((item) => item.level === level).length;
  console.log(
    `\nResumo: ${count("ok")} ok, ${count("warn")} aviso(s), ${count("error")} erro(s).`
  );
  return count("error");
}

async function fetchResource(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": META_UA, accept: "*/*" },
  });
  return response;
}

async function checkImage(items, imageUrl, expectedWidth, expectedHeight, baseUrl) {
  let buffer = null;
  let contentType = "";

  if (/^https?:\/\//i.test(imageUrl)) {
    try {
      const response = await fetchResource(imageUrl);
      if (!response.ok) {
        items.push({ level: "error", message: `og:image devolve HTTP ${response.status}` });
        return;
      }
      contentType = response.headers.get("content-type") || "";
      buffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      items.push({ level: "error", message: `og:image não abriu: ${error.message}` });
      return;
    }
  } else {
    const file = localFileFor(imageUrl);
    if (!file || !fs.existsSync(file)) {
      items.push({ level: "error", message: `og:image local não encontrado: ${imageUrl}` });
      return;
    }
    buffer = fs.readFileSync(file);
    contentType = file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  }

  if (contentType && !contentType.startsWith("image/")) {
    items.push({ level: "error", message: `og:image não é imagem (Content-Type: ${contentType})` });
  } else {
    items.push({ level: "ok", message: `og:image responde como imagem (${contentType || "desconhecido"})` });
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    items.push({ level: "error", message: `og:image tem ${(buffer.length / 1048576).toFixed(1)} MB (limite ~8 MB)` });
  } else {
    items.push({ level: "ok", message: `og:image tem ${(buffer.length / 1024).toFixed(0)} KB (limite 8 MB)` });
  }

  const size = imageSize(buffer);
  if (!size) {
    items.push({ level: "warn", message: "não foi possível ler as dimensões do og:image" });
    return;
  }

  items.push({ level: "ok", message: `og:image tem ${size.width}x${size.height}` });

  const width = Number(expectedWidth) || 0;
  const height = Number(expectedHeight) || 0;
  if (width && height && (size.width !== width || size.height !== height)) {
    items.push({
      level: "warn",
      message: `og:image:width/height (${width}x${height}) não batem com a imagem real (${size.width}x${size.height})`,
    });
  }

  const ratio = size.width / size.height;
  if (ratio < 1.7 || ratio > 2.1) {
    items.push({
      level: "warn",
      message: `proporção ${ratio.toFixed(2)}:1 — a Meta recomenda 1.91:1 (ex.: 1200x630) para não cortar`,
    });
  } else {
    items.push({ level: "ok", message: `proporção ${ratio.toFixed(2)}:1 adequada para a Meta` });
  }
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  const localFlag = process.argv.includes("--local");
  const target = args[0] || process.env.SITE_URL || "";
  const localMode = localFlag || !/^https?:\/\//i.test(target);

  const items = [];
  let html = "";
  let baseUrl = "";
  let finalUrl = "";

  if (localMode) {
    html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    baseUrl = "local";
    finalUrl = process.env.SITE_URL || "local:index.html";
    items.push({
      level: "warn",
      message: "modo local: URLs relativas não podem ser validadas como a Meta exige (usa a URL publicada no fim)",
    });
  } else {
    try {
      const response = await fetchResource(target);
      finalUrl = response.url || target;
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        items.push({ level: "error", message: `a página devolveu HTTP ${response.status}` });
      } else {
        items.push({ level: "ok", message: `página respondeu HTTP ${response.status}` });
      }
      if (!contentType.includes("text/html")) {
        items.push({ level: "error", message: `Content-Type inesperado: ${contentType || "vazio"}` });
      } else {
        items.push({ level: "ok", message: `Content-Type: ${contentType}` });
      }
      html = await response.text();
      baseUrl = new URL(finalUrl).origin;
    } catch (error) {
      console.error(`[ERRO]  não foi possível abrir ${target}: ${error.message}`);
      process.exit(1);
    }
  }

  if (!/^https:\/\//i.test(finalUrl) && !localMode) {
    items.push({ level: "warn", message: "a página não está em HTTPS (a Meta pode recusar o link)" });
  } else if (!localMode) {
    items.push({ level: "ok", message: "a página está em HTTPS" });
  }

  const meta = parseMeta(html);

  for (const key of ["og:title", "og:description", "og:type", "og:image"]) {
    if (meta[key]) items.push({ level: "ok", message: `tem ${key}` });
    else items.push({ level: "error", message: `falta ${key}` });
  }
  for (const key of ["og:url", "og:site_name", "og:image:width", "og:image:height", "twitter:card"]) {
    if (meta[key]) items.push({ level: "ok", message: `tem ${key}` });
    else items.push({ level: "warn", message: `recomendado: ${key} em falta` });
  }

  if ((meta["robots"] || "").toLowerCase().includes("noindex")) {
    items.push({ level: "error", message: "a página tem meta robots noindex (a Meta não mostra prévia)" });
  } else {
    items.push({ level: "ok", message: "a página permite indexação (sem noindex)" });
  }

  for (const key of ["og:image", "og:url", "twitter:image"]) {
    const value = meta[key];
    if (!value) continue;
    if (/^https?:\/\//i.test(value)) {
      items.push({ level: "ok", message: `${key} é URL absoluta` });
    } else {
      items.push({
        level: localMode ? "warn" : "error",
        message: `${key} precisa de ser URL absoluta (agora: ${value})`,
      });
    }
  }

  if (meta["og:title"] && meta["og:title"].length > 95) {
    items.push({ level: "warn", message: "og:title com mais de 95 caracteres pode ser cortado" });
  }
  if (meta["og:description"] && meta["og:description"].length > 200) {
    items.push({ level: "warn", message: "og:description com mais de 200 caracteres pode ser cortado" });
  }

  if (meta["og:image"]) {
    const imageUrl = localMode
      ? new URL(meta["og:image"], "http://local").pathname
      : /^https?:\/\//i.test(meta["og:image"])
        ? meta["og:image"]
        : new URL(meta["og:image"], baseUrl).href;
    await checkImage(items, imageUrl, meta["og:image:width"], meta["og:image:height"], baseUrl);
  }

  const robotsUrl = localMode ? null : `${baseUrl}/robots.txt`;
  try {
    const robotsText = localMode
      ? fs.existsSync(path.join(ROOT, "robots.txt"))
        ? fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8")
        : ""
      : await fetchResource(robotsUrl).then((response) => (response.ok ? response.text() : ""));
    if (!robotsText) {
      items.push({ level: "warn", message: "robots.txt não encontrado (não bloqueia, mas é recomendado)" });
    } else {
      for (const agent of ["facebookexternalhit", "meta-externalagent", "WhatsApp"]) {
        if (isAllowed(robotsText, agent, "/")) {
          items.push({ level: "ok", message: `robots.txt permite ${agent}` });
        } else {
          items.push({ level: "error", message: `robots.txt bloqueia ${agent}` });
        }
      }
    }
  } catch (error) {
    items.push({ level: "warn", message: `não foi possível ler robots.txt: ${error.message}` });
  }

  const placeholders = [];
  if (/G-XXXXXXXXXX/.test(html)) placeholders.push("GA4");
  if (/000000000000000/.test(html)) placeholders.push("Meta Pixel");
  if (/XXXXXXXXXXXXXXX/.test(html)) placeholders.push("TikTok Pixel");
  if (/SEU_CODIGO_AQUI/.test(html)) placeholders.push("verificação de domínio Meta");
  if (placeholders.length) {
    items.push({
      level: "warn",
      message: `placeholders por preencher: ${placeholders.join(", ")} (não impede a prévia)`,
    });
  }

  console.log(`\nValidação Meta/Open Graph — ${finalUrl}\n`);
  const errors = report(items);
  process.exit(errors > 0 ? 1 : 0);
}

module.exports = { parseMeta, imageSize, parseRobots, isAllowed, localFileFor };

if (require.main === module) {
  main().catch((error) => {
    console.error(`[ERRO]  ${error.message}`);
    process.exit(1);
  });
}
