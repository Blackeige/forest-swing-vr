// Test réseau réel : relais WebSocket (sans dépendance) + 2 clients Net (WebSocket natif de Node 22) + interpolation.
import http from 'node:http';
import { attachRelay } from '../server/relay.js';
import { Net } from '../www/js/net.js';
let err = 0; const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) err++; };
const server = http.createServer(); attachRelay(server, '/ws'); await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `ws://127.0.0.1:${server.address().port}/ws`; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const a = new Net(), b = new Net(), c = new Net();
a.connect({ url, room: 'r1', name: 'A' }); b.connect({ url, room: 'r1', name: 'B' }); c.connect({ url, room: 'autre', name: 'C' }); await wait(300);
check(a.state === 'on' && b.state === 'on', 'connexion à la partie');
const hands = [{ wx: 1, wy: 1, wz: 1 }, { wx: 2, wy: 1, wz: 2 }];
for (let i = 0; i < 10; i++) { a.sendState(performance.now() + i * 100, { x: i, y: 0.5, z: 0 }, 0.3, hands); await wait(70); b.update(performance.now()); }
check(b.count === 1 && c.count === 0, 'B voit A, la salle « autre » est isolée');
const r = [...b.remote.values()][0]; check(r && r.name === 'A' && r.pos.x > 2 && r.pos.x < 10, `position interpolée de A chez B (x=${r.pos.x.toFixed(2)})`);
check(Math.abs(r.hands[1].x - 2) < 0.01, 'mains synchronisées');
a.disconnect(); await wait(200); b.update(performance.now()); check(b.count === 0, 'départ de A propagé');
b.disconnect(); c.disconnect(); await wait(50);
// robustesse : trame invalide / trop grosse ne plante pas le relais
const bad = new WebSocket(url); await new Promise((r) => (bad.onopen = r)); bad.send('{pas du json'); bad.send(JSON.stringify({ t: 'join', room: 'x', id: 'z' })); bad.send('x'.repeat(40000)); await wait(150);
const probe = new Net(); probe.connect({ url, room: 'x', name: 'P' }); await wait(200); check(probe.state === 'on', 'le relais survit aux trames invalides / trop grosses');
probe.disconnect(); server.close(); process.exit(err ? 1 : 0);
