// Serveur de développement : fichiers statiques de www/ + relais multijoueur (/ws).
// getUserMedia / capteurs exigent un contexte sécurisé : HTTPS sur le réseau local (certificat auto-signé généré avec openssl).
// Usage : npm run dev   (PORT=8443 HTTP=1 pour forcer http://localhost)
import http from 'node:http'; import https from 'node:https'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { attachRelay } from '../server/relay.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), www = path.join(root, 'www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png' };
const handler = (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(www, p); if (!f.startsWith(www) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); fs.createReadStream(f).pipe(res);
};
export function startServer({ port = Number(process.env.PORT || 8443), useHttps = !process.env.HTTP } = {}) {
  let server, secure = false;
  if (useHttps) {
    const dir = path.join(root, '.dev-cert'), key = path.join(dir, 'key.pem'), crt = path.join(dir, 'cert.pem');
    try {
      if (!fs.existsSync(crt)) { fs.mkdirSync(dir, { recursive: true }); execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '365', '-subj', '/CN=forest-swing-dev'], { stdio: 'ignore' }); }
      server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, handler); secure = true;
    } catch (e) { console.warn('openssl indisponible : repli en HTTP (la caméra ne marchera que sur localhost).'); }
  }
  if (!server) server = http.createServer(handler);
  attachRelay(server, '/ws');
  return new Promise((resolve) => server.listen(port, '0.0.0.0', () => resolve({ server, secure, port: server.address().port })));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { secure, port } = await startServer(); const proto = secure ? 'https' : 'http';
  console.log(`Forest Swing VR — ${proto}://localhost:${port}`);
  for (const l of Object.values(os.networkInterfaces()).flat()) if (l && l.family === 'IPv4' && !l.internal) console.log(`  sur le téléphone : ${proto}://${l.address}:${port}   (accepte l'avertissement de certificat)   multijoueur : ${secure ? 'wss' : 'ws'}://${l.address}:${port}/ws`);
}
