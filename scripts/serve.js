// Petit serveur statique pour essayer l'application en local : npm run local
// (sert seulement les fichiers de _site/ ; les calculs se font dans le navigateur)
const http = require('http');
const fs = require('fs');
const path = require('path');

const site = path.join(__dirname, '..', '_site');
const port = Number(process.env.PORT) || 8100;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(site, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(site) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('Introuvable'); return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Générateur QDNB : http://localhost:${port}`));
