// Test du suivi de mains sur des images synthétiques (disques « peau » sur fond vert), incluant perte et reprise.
import { TrackerCore } from '../www/js/tracker-core.js';
const W = 160, H = 120; let err = 0;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) err++; };
function frame(blobs, noise = 0) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { d[i * 4] = 40; d[i * 4 + 1] = 110; d[i * 4 + 2] = 50; d[i * 4 + 3] = 255; }
  for (const [cx, cy, r] of blobs) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) { const i = (y * W + x) * 4; d[i] = 224 + (noise ? (Math.random() * 6 | 0) : 0); d[i + 1] = 172; d[i + 2] = 105; }
  return d;
}
const t = new TrackerCore(); let ts = 0, res;
for (let i = 0; i < 6; i++) res = t.process(frame([[40, 60, 14], [120, 60, 14]], true), W, H, (ts += 40));
const v = res.hands.filter((h) => h.valid); check(v.length === 2, '2 mains détectées');
check(res.hands[0].x < 0.5 && res.hands[1].x > 0.5, 'identités gauche/droite stables (x gauche < 0.5 < x droite)');
check(Math.abs(res.hands[0].x - 40 / W) < 0.02 && Math.abs(res.hands[1].y - 0.5) < 0.02, 'centres estimés précis');
// mouvement : main droite descend de 3 px/frame
let r2; for (let i = 0; i < 10; i++) r2 = t.process(frame([[40, 60, 14], [120, 60 + i * 3, 14]]), W, H, (ts += 40));
check(r2.hands[1].vy > 0.1, 'vitesse estimée (vy > 0) pour la main en mouvement : ' + r2.hands[1].vy.toFixed(2));
check(Math.abs(r2.hands[1].y - (60 + 27) / H) < 0.06, 'suivi de la position en mouvement');
// perte temporaire : la main droite disparaît 4 frames
let rl; const keep = r2.hands[1].y; for (let i = 0; i < 4; i++) rl = t.process(frame([[40, 60, 14]]), W, H, (ts += 40));
check(rl.hands[1].valid && rl.hands[1].lost === 4, 'perte temporaire gérée (valide, lost=4)');
check(Math.abs(rl.hands[1].y - keep) < 0.12, 'position gelée sans saut pendant la perte');
const rb = t.process(frame([[40, 60, 14], [120, 87, 14]]), W, H, (ts += 40));
check(rb.hands[1].valid && rb.hands[1].lost === 0 && rb.hands[0].valid, 'reprise du suivi sans changer d\'identité');
for (let i = 0; i < 14; i++) rl = t.process(frame([[40, 60, 14]]), W, H, (ts += 40));
check(!rl.hands[1].valid && rl.losses >= 1, 'perte longue : main invalidée et comptée (' + rl.losses + ')');
// affinage de la teinte de peau
for (let i = 0; i < 3; i++) t.process(frame([[80, 60, 16]], true), W, H, (ts += 40)); const rf = t.refine();
check(rf.ok && rf.samples > 300, 'affinage de la plage de peau (' + rf.samples + ' échantillons)');
// pas de fausse détection sur un fond non-peau
const t2 = new TrackerCore(); const rn = t2.process(frame([]), W, H, 40); check(rn.hands.every((h) => !h.valid), 'aucune fausse détection sur fond vert');
// performance
const f = frame([[40, 60, 14], [120, 60, 14]]), t3 = new TrackerCore(); const a = performance.now(); for (let i = 0; i < 200; i++) t3.process(f, W, H, i * 40); const ms = (performance.now() - a) / 200;
check(ms < 5, `temps de détection 160x120 : ${ms.toFixed(2)} ms/image (Node, pas un téléphone)`);
process.exit(err ? 1 : 0);
