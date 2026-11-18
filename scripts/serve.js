const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 100 * 1024;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
};

// Carrega .env.local / .env para desenvolvimento local (sem sobrescrever env vars).
function loadEnv(file) {
  try {
    const content = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch (error) {
    // Ficheiro opcional.
  }
}

loadEnv(".env.local");
loadEnv(".env");

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch (error) {
    return false;
  }
}

function sendFile(req, res, file) {
  const stat = fs.statSync(file);
  const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
  const headers = {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
  };

  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }
    headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
    headers["Content-Length"] = end - start + 1;
    res.writeHead(206, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(file, { start, end })
      .on("error", () => res.destroy())
      .pipe(res);
    return;
  }

  headers["Content-Length"] = stat.size;
  res.writeHead(200, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(file)
    .on("error", () => res.destroy())
    .pipe(res);
}

function json(res, code, data) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("body_too_large");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

async function handleApi(req, res, pathname, query) {
  const name = pathname.slice("/api/".length).replace(/[^a-z0-9-]/gi, "");
  const file = path.join(ROOT, "api", `${name}.js`);
  if (!name || !isFile(file)) {
    json(res, 404, { ok: false, error: "not_found" });
    return;
  }

  try {
    req.body = await readBody(req);
  } catch (error) {
    json(res, 413, { ok: false, error: "body_too_large" });
    return;
  }

  req.query = query;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
    return res;
  };

  try {
    await require(file)(req, res);
  } catch (error) {
    if (!res.headersSent) {
      json(res, 500, { ok: false, error: error.message });
    } else {
      res.end();
    }
  }
}

function resolveStaticPath(pathname) {
  const relative = path.normalize(pathname).replace(/^([/\\])+/, "");
  return path.resolve(ROOT, relative || "index.html");
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname, Object.fromEntries(url.searchParams));
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end("Method Not Allowed");
      return;
    }

    let file = resolveStaticPath(pathname);
    const relative = path.relative(ROOT, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, "index.html");
    }
    if (!isFile(file) && !path.extname(file) && isFile(`${file}.html`)) {
      file = `${file}.html`;
    }

    if (!isFile(file)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }

    sendFile(req, res, file);
  } catch (error) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
  }
});

server.listen(PORT, () => {
  console.log(`Servidor local em http://localhost:${PORT}`);
});
