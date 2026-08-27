/* Production static-site entrypoint for Vercel's Node preset.
 * The local Edge TTS helper deliberately lives in tools/ and is not deployed. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const aiHandler = require('./api/ai.js');

const assetRoot = path.resolve(process.cwd(), 'dist', 'client');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp'
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

function prepareFunctionResponse(res) {
  res.status = function status(code) {
    res.statusCode = code;
    return res;
  };
  res.json = function json(payload) {
    if (!res.hasHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(payload));
  };
}

function handleAi(req, res) {
  prepareFunctionResponse(res);
  if (req.method !== 'POST') return aiHandler(req, res);

  let rawBody = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    rawBody += chunk;
    if (rawBody.length > 1024 * 1024) req.destroy();
  });
  req.on('end', () => {
    try {
      req.body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      req.body = {};
    }
    Promise.resolve(aiHandler(req, res)).catch((error) => {
      console.error('AI handler failed', error);
      if (!res.writableEnded) send(res, 500, 'Internal Server Error');
    });
  });
}

const server = http.createServer((req, res) => {
  if (new URL(req.url, 'http://localhost').pathname === '/api/ai') {
    return handleAi(req, res);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return send(res, 405, 'Method Not Allowed');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Bad Request');
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(assetRoot, relativePath);
  if (!filePath.startsWith(assetRoot + path.sep)) return send(res, 403, 'Forbidden');

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) return send(res, 404, 'Not Found');

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentTypes[extension] || 'application/octet-stream',
      'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).on('error', () => send(res, 500, 'Internal Server Error')).pipe(res);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log('KOTOBA static server ready');
});
