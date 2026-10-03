#!/usr/bin/env node
// A tiny static server for testing the website locally, close to how Vercel serves it: HTTP/1.1 with keep-alive, correct content
// types, folder index files, "/x" and "/x/" both work, and unknown paths give a real 404.
//   node serve.mjs [folder=../site] [port=4400]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] ?? path.join(here, '..', 'site'));
const port = Number(process.argv[3] ?? 4400);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json' };

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
  const tryFiles = [file, file + '.html', path.join(file, 'index.html')];
  const hit = tryFiles.find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  if (!hit) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h1>404</h1>'); return; }
  const body = fs.readFileSync(hit);
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(hit).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
  res.end(body);
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}/`));
