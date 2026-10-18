// Test de la locomotion : collisions, poussée du sol, saut, escalade, rebond, mains non suivies.
import { World } from '../www/js/world.js';
import { Physics } from '../www/js/physics.js';
import { FallbackSim } from '../www/js/handmap.js';
let err = 0; const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) err++; };
const world = new World(); const DT = 1 / 90;
const mk = () => { const p = new Physics(world); p.teleport(0, 0.4, 0); return p; };
const idle = [{ x: -0.22, y: -0.55, z: 0.45, tracked: false }, { x: 0.22, y: -0.55, z: 0.45, tracked: false }];
const run = (p, secs, fn, yaw = 0) => { for (let i = 0; i < secs / DT; i++) p.step(DT, yaw, fn(i * DT)); };
check(world.n > 100 && world.n < 600, `${world.n} colliders, ${world.mesh.n} sommets statiques`);
// 1. gravité + sol : le joueur ne traverse pas le sol
let p = mk(); p.teleport(8, 3, -8); run(p, 2, () => idle); check(Math.abs(p.pos.y) < 0.01 && p.onGround, `atterrit sur le sol (y=${p.pos.y.toFixed(2)})`);
// 2. marche à quatre pattes simulée -> avance vers -z (devant, yaw 0)
p = mk(); const sim = new FallbackSim(); const z0 = p.pos.z; run(p, 3, (t) => sim.update(DT, true, false), 0);
check(z0 - p.pos.z > 2, `la locomotion pousse le joueur vers l'avant (${(z0 - p.pos.z).toFixed(1)} m en 3 s)`);
// 3. direction : yaw 90° (regard vers -x)
p = mk(); const sim2 = new FallbackSim(); run(p, 3, () => sim2.update(DT, true, false), Math.PI / 2); check(-p.pos.x > 2 && Math.abs(p.pos.z) < 0.7, `avance dans la direction du regard (x=${p.pos.x.toFixed(1)}, z=${p.pos.z.toFixed(1)})`);
// 4. saut en poussant le sol avec les deux bras
p = mk(); const sim3 = new FallbackSim(); run(p, 0.3, () => idle); sim3.trigger(true); let maxY = 0; run(p, 1.2, () => { const o = sim3.update(DT, false, false); maxY = Math.max(maxY, p.pos.y); return o; }); check(maxY > 0.8 && maxY < 5, `saut : hauteur max ${maxY.toFixed(2)} m (plage plausible 0.8-5 m)`);
// 5. aucune impulsion quand les mains ne sont pas suivies
p = mk(); run(p, 2, () => idle); check(Math.hypot(p.pos.x, p.pos.z) < 0.05, 'mains non suivies : pas de déplacement parasite');
// 6. pas de traversée de mur : fonce contre la falaise est (x=66)
p = mk(); p.teleport(60, 0.4, 0); p.vel.x = 13; run(p, 2, () => idle, 0); check(p.pos.x < 66, `mur infranchissable (x=${p.pos.x.toFixed(2)})`);
// 7. escalade : main collée à la tour, descente de la main => le joueur monte
const tx = Math.cos(0.3) * 20, tz = Math.sin(0.3) * 20; p = mk(); p.teleport(tx - 3, 0.4, tz); let y0 = p.pos.y;
// face à la tour (yaw tel que devant = +x) : forward=(-sin,-cos) => yaw=-90°
const yawT = -Math.PI / 2; let climbed = 0;
for (let cycle = 0; cycle < 6; cycle++) { run(p, 0.01, () => idle, yawT); }
p.teleport(tx - 1.9, 0.4, tz); // collé à la face de la tour
for (let c = 0; c < 6; c++) { // main gauche : lever, accrocher (z=0.35 -> au contact), tirer vers le bas
  run(p, 0.25, (t) => [{ x: -0.1, y: 0.3 + 0 * t, z: 0.5, tracked: true }, { x: 0.1, y: -0.5, z: 0.3, tracked: false }], yawT);
  run(p, 0.5, (t) => [{ x: -0.1, y: 0.3 - 0.9 * Math.min(1, t / 0.5), z: 0.5, tracked: true }, { x: 0.1, y: -0.5, z: 0.3, tracked: false }], yawT);
}
check(p.pos.y > y0 + 0.8 || p.pos.y > 1.0, `escalade : hauteur atteinte ${p.pos.y.toFixed(2)} m`); void climbed;
// 8. trampoline : rebond supérieur à zéro
p = mk(); p.teleport(8, 4, 8); let bounced = 0, last = 0; run(p, 3, () => { bounced = Math.max(bounced, p.vel.y > 2 && last < 0 ? p.vel.y : 0); last = p.vel.y; return idle; }); check(bounced > 4, `rebond sur trampoline (vitesse ${bounced.toFixed(1)} m/s)`);
// 9. stabilité numérique
p = mk(); const sim4 = new FallbackSim(); run(p, 20, () => sim4.update(DT, true, false), 0.7); check(Number.isFinite(p.pos.x + p.pos.y + p.pos.z) && Math.abs(p.pos.y) < 60, 'simulation stable sur 20 s');
process.exit(err ? 1 : 0);
