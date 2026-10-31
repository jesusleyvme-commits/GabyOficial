const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 3000;

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
  ".txt": "text/plain; charset=utf-8",
};

function sendFile(res, file) {
  const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "X-Content-Type-Options": "nosniff" });
  fs.createReadStream(file).pipe(res);
}

async function handleApi(req, res, pathname, query) {
  const name = pathname.slice("/api/".length).replace(/[^a-z0-9-]/gi, "");
  const file = path.join(ROOT, "api", `${name}.js`);
  if (!name || !fs.existsSync(file)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  let body = {};
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch (error) {
      body = {};
    }
  }

  req.body = body;
  req.query = query;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
    return res;
  };

  try {
    await require(file)(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: error.message }));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith("/api/")) {
    await handleApi(req, res, pathname, Object.fromEntries(url.searchParams));
    return;
  }

  const relative = path.normalize(pathname).replace(/^([/\\])+/, "");
  let file = path.join(ROOT, relative || "index.html");
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, "index.html");
  }
  if (!fs.existsSync(file) && !path.extname(file) && fs.existsSync(`${file}.html`)) {
    file = `${file}.html`;
  }

  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
    return;
  }

  sendFile(res, file);
});

server.listen(PORT, () => {
  console.log(`Servidor local em http://localhost:${PORT}`);
});
