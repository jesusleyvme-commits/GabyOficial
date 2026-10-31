#!/usr/bin/env node
// Fixa as URLs absolutas do Open Graph depois de o domínio estar publicado.
//
// Uso:
//   npm run meta:fix -- https://teudominio.com
//   npm run meta:fix -- teudominio.com
//
// Depois valida com:
//   npm run meta:check -- https://teudominio.com

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INDEX = path.join(ROOT, "index.html");

function stampDomain(html, input) {
  let value = String(input || "").trim();
  if (!value) throw new Error("informa o domínio (ex.: https://teudominio.com)");
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;

  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error("usa http:// ou https://");
  const origin = `${url.protocol}//${url.host}`;
  const pageUrl = `${origin}/`;

  const absolute = (asset) => {
    const current = String(asset || "").trim();
    if (!current || /^(https?:|data:)/i.test(current)) return current;
    return `${origin}${current.startsWith("/") ? "" : "/"}${current}`;
  };

  const replaceAttr = (pattern, replacement) => {
    html = html.replace(pattern, (match, before, current, after) => before + replacement(current) + after);
  };

  replaceAttr(/(<meta\s+property="og:image"\s+content=")([^"]*)(")/, absolute);
  replaceAttr(/(<meta\s+name="twitter:image"\s+content=")([^"]*)(")/, absolute);
  replaceAttr(/(<meta\s+property="og:image:secure_url"\s+content=")([^"]*)(")/, absolute);

  if (/<meta\s+property="og:url"/.test(html)) {
    replaceAttr(/(<meta\s+property="og:url"\s+content=")([^"]*)(")/, () => pageUrl);
  } else if (/<meta\s+property="og:type"/.test(html)) {
    html = html.replace(
      /(<meta\s+property="og:type"[^>]*>)/,
      `$1\n    <meta property="og:url" content="${pageUrl}">`
    );
  }

  if (/<link\s+rel="canonical"/.test(html)) {
    replaceAttr(/(<link\s+rel="canonical"\s+href=")([^"]*)(")/, () => pageUrl);
  }

  return html;
}

function main() {
  const input = process.argv[2] || process.env.SITE_URL || "";
  const html = fs.readFileSync(INDEX, "utf8");
  const updated = stampDomain(html, input);

  if (updated === html) {
    console.log("Sem alterações: as URLs já estão absolutas para esse domínio.");
    return;
  }

  fs.writeFileSync(INDEX, updated, "utf8");
  console.log(`index.html atualizado com URLs absolutas para ${new URL(input.match(/^https?:\/\//i) ? input : `https://${input}`).origin}`);
  console.log("Agora corre: npm run meta:check -- " + input);
}

module.exports = { stampDomain };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[ERRO]  ${error.message}`);
    process.exit(1);
  }
}
