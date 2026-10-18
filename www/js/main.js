// Forest Swing VR — point d'entrée : boucle de rendu (indépendante), physique à pas fixe, tracking asynchrone.
import { Renderer } from './gl.js';
import { World, SPAWNS, SKY } from './world.js';
import { Physics } from './physics.js';
import { Head } from './head.js';
import { CameraSource, HandTracker } from './camera.js';
import { HandMapper, FallbackSim, DEFAULT_CALIB } from './handmap.js';
import { Calibration } from './calibration.js';
import { Panel, Reticle } from './hud.js';
import { MeshWriter } from './mesh.js';
import { GameAudio } from './audio.js';
import { Net } from './net.js';
import { loadSettings, saveSettings, DEFAULTS } from './settings.js';
import { DEG, mat4, mat4Panel, mat4View, qRot, clamp } from './math.js';

const $ = (id) => document.getElementById(id);
const S = loadSettings();
const PAGES = [
  { title: 'Mains', rows: [['sens', 'Sensibilité', 0.5, 2.5, 0.1, 1], ['handDist', 'Distance des mains', 0.3, 0.9, 0.05, 2], ['scale', 'Échelle des mouvements', 0.6, 2, 0.1, 1], ['offX', 'Décalage horizontal', -0.3, 0.3, 0.02, 2], ['offY', 'Décalage vertical', -0.5, 0.5, 0.02, 2], ['eyeH', 'Hauteur du joueur (m)', 1, 1.9, 0.05, 2], ['smooth', 'Lissage', 0, 1, 0.1, 1], ['dead', 'Zone morte (m)', 0, 0.05, 0.004, 3], ['depthGain', 'Gain de profondeur', 0, 2, 0.1, 1]] },
  { title: 'Vue', rows: [['ipd', 'Écart des yeux (m)', 0.05, 0.075, 0.002, 3], ['k1', 'Distorsion k1', 0, 0.6, 0.02, 2], ['k2', 'Distorsion k2', 0, 0.4, 0.02, 2], ['fov', 'Champ de vision (°)', 70, 110, 2, 0], ['renderScale', 'Résolution du rendu', 0.5, 1, 0.05, 2], ['trackHz', 'Fréquence tracking (Hz)', 10, 30, 5, 0], ['rot', 'Rotation image caméra', 0, 3, 1, 0], ['spawn', 'Position de départ', 0, 3, 1, 0]] },
  { title: 'Options' },
];

const game = {
  S, state: 'boot', fallback: false, head: new Head(), cam: new CameraSource(), tracker: null, mapper: new HandMapper(S), sim: new FallbackSim(),
  audio: new GameAudio(), net: new Net(), uiDirty: true, page: 0, toast: '', toastT: 0, fps: 0, frameMs: 0, renderMs: 0, running: false,
  save() { saveSettings(S); }, invalidate() { this.uiDirty = true; },
};
window.__fs = game; // accès de diagnostic / tests
const canvas = $('gl'); let R, world, phys;
try { R = new Renderer(canvas); world = new World(); R.uploadStatic(world.mesh.a, world.mesh.n); phys = new Physics(world); } catch (e) { $('msg').textContent = 'Erreur WebGL : ' + e.message; throw e; }
R.fogCol = SKY; game.R = R; game.world = world; game.phys = phys;
const calib = game.calib = new Calibration(game);
const menu = new Panel(1024, 576, 1.6, 0.9), status = new Panel(640, 320, 0.7, 0.35), reticle = new Reticle();
status.headLocked = true; mat4Panel(status.model, 0, -0.5, -1.0, 0, 0.6, 0.3); mat4Panel(reticle.model, 0, 0, -1.5, 0, 0.07, 0.07);
const panels = [menu, status, reticle];
const dyn = new MeshWriter(5000, true), viewA = mat4(), viewB = mat4(), tmpV = { x: 0, y: 0, z: 0 }, camL = { x: 0, y: 0, z: 0 }, camR = { x: 0, y: 0, z: 0 };
const views = [{ view: viewA, cam: camL, eyeX: 0 }, { view: viewB, cam: camR, eyeX: 0 }], mono = [{ view: viewA, cam: camL, eyeX: 0 }], frameDesc = { stereo: true, fov: 90, views, panels, k1: 0.25, k2: 0.1 };
const rv = { x: 0, y: 0, z: 0 }, gz = { x: 0, y: 0, z: 0 };

// ---------- Utilitaires UI ----------
game.toastMsg = (t, s = 3) => { game.toast = t; game.toastT = s; };
function placeMenu() {
  const q = game.head.q, yaw = game.head.yaw, e = eyePos();
  menu.yaw = yaw; menu.cx = e.x - Math.sin(yaw) * 1.5; menu.cy = e.y; menu.cz = e.z - Math.cos(yaw) * 1.5; mat4Panel(menu.model, menu.cx, menu.cy, menu.cz, yaw, menu.mw, menu.mh); void q;
}
function eyePos() { return { x: phys.pos.x, y: phys.pos.y + S.eyeH, z: phys.pos.z }; }
game.setState = (st) => {
  const prev = game.state; game.state = st; menu.visible = st !== 'play' && st !== 'boot'; reticle.visible = menu.visible; menu.hover = null; dwell = 0;
  if (menu.visible && (prev === 'play' || prev === 'boot')) placeMenu(); game.invalidate();
};
game.openMenu = () => game.setState('menu');
game.openManual = () => { game.page = 0; game.manual = true; game.setState('settings'); };
game.finishCalib = () => { game.save(); game.manual = false; game.setState('play'); game.audio.start(); game.toastMsg('Pousse le sol ! Tap écran = menu', 5); };
game.useFallback = () => { game.fallback = true; if (game.tracker) game.tracker.stop(); game.cam.stop(); calib.go('verify'); calib.note = 'Mode secours : tactile/souris = mains, W = avancer, Espace = sauter.'; if (game.state === 'boot') { game.setState('calib'); } };
game.useCamera = async () => { game.fallback = false; await startCamera(); calib.begin(false); };
async function startCamera() {
  try { await game.cam.start(S); if (!game.tracker) { game.tracker = new HandTracker(game.cam, S); game.tracker.onResult = (r) => game.mapper.feed(r); } game.tracker.preview = S.diag; game.tracker.start(); }
  catch (e) { game.camError = (e && e.name) || String(e); game.toastMsg('Caméra : ' + game.camError, 5); }
}
game.restartCamera = async () => { if (!game.fallback) await startCamera(); };

// ---------- Réticule / interaction au regard ----------
let dwell = 0, mouse = { x: 0, y: 0, in: false };
function gazeRay() {
  const q = game.head.q; qRot(q, 0, 0, -1, gz);
  if (S.mono && mouse.in) { const r = qRot(q, 1, 0, 0, rv), th = Math.tan(frameDesc.fov / 2), asp = canvas.width / canvas.height; const up = qRot(q, 0, 1, 0, tmpV);
    gz.x += rv.x * mouse.x * th * asp + up.x * mouse.y * th; gz.y += rv.y * mouse.x * th * asp + up.y * mouse.y * th; gz.z += rv.z * mouse.x * th * asp + up.z * mouse.y * th; void r; }
  return gz;
}
function hoverUpdate(dt) {
  if (!menu.visible) return;
  const e = eyePos(), d = gazeRay(), yaw = menu.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), den = d.x * fx + d.z * fz; let b = null;
  if (den > 0.05) {
    const t = ((menu.cx - e.x) * fx + (menu.cz - e.z) * fz) / den, hx = e.x + d.x * t, hy = e.y + d.y * t, hz = e.z + d.z * t;
    const u = ((hx - menu.cx) * Math.cos(yaw) + (hz - menu.cz) * -Math.sin(yaw)) / menu.mw + 0.5, v = 0.5 - (hy - menu.cy) / menu.mh;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) b = menu.hit(u, v);
  }
  const id = b ? b.id : null; game.hoverBtn = b;
  if (id !== menu.hover) { menu.hover = id; dwell = 0; game.invalidate(); }
  if (b) { dwell += dt; if (dwell >= 1.1) { dwell = -0.7; activate(b); } } else dwell = 0;
  reticle.draw(dwell > 0 ? dwell / 1.1 : 0, !!b);
}
function activate(b) { if (b && b.fn) { b.fn(); game.invalidate(); } }

// ---------- Écrans ----------
function drawMenu(p) {
  p.begin(); p.text('Pause', 512, 50, 44, '#9ff0a8', 'center', '800');
  const L = 60, Rr = 532, W = 432, H = 78, y = (i) => 96 + i * 88, nm = game.net;
  p.button('resume', 'Reprendre', L, y(0), W, H, () => game.setState('play'), { primary: true });
  p.button('recal', 'Recalibrer (rapide)', Rr, y(0), W, H, () => { game.setState('calib'); calib.begin(true); }, { size: 30 });
  p.button('set', 'Réglages', L, y(1), W, H, () => { game.page = 0; game.manual = false; game.setState('settings'); });
  p.button('recenter', 'Recentrer la vue', Rr, y(1), W, H, () => { game.head.recenter(); game.toastMsg('Vue recentrée', 2); });
  p.button('diag', 'Diagnostic : ' + (S.diag ? 'OUI' : 'NON'), L, y(2), W, H, () => { S.diag = !S.diag; if (game.tracker) game.tracker.preview = S.diag; game.save(); });
  p.button('snd', 'Son : ' + (S.sound ? 'OUI' : 'NON'), Rr, y(2), W, H, () => { S.sound = !S.sound; game.audio.setEnabled(S.sound); game.save(); });
  p.button('mode', game.fallback ? 'Utiliser la caméra' : 'Mode secours', L, y(3), W, H, () => { if (game.fallback) game.useCamera().then(() => game.setState('calib')); else { game.useFallback(); game.setState('play'); } }, { size: 30 });
  p.button('net', nm.state === 'on' ? `Multi : en ligne (${nm.count})` : nm.state === 'error' ? 'Multi : ' + nm.error : 'Multijoueur : connecter', Rr, y(3), W, H, () => { if (nm.state === 'on') nm.disconnect(); else nm.connect({ url: S.netUrl || 'local', room: S.room, name: S.name }); }, { size: 28 });
  p.button('quit', 'Quitter', L, y(4), W, 72, () => location.reload(), { size: 30 }); p.end();
}
const fmt = (v, d) => Number(v).toFixed(d);
function drawSettings(p) {
  p.begin(); const pg = PAGES[game.page]; p.text(`Réglages — ${pg.title}`, 512, 44, 40, '#9ff0a8', 'center', '800');
  if (pg.rows) pg.rows.forEach(([k, label, mn, mx, st, dec], i) => {
    const col = i % 2, row = (i / 2) | 0, x = 30 + col * 490, y = 90 + row * 78;
    p.text(label, x, y + 12, 24, '#cfe', 'left', '500'); p.text(fmt(S[k], dec), x + 262, y + 46, 32, '#fff', 'center', '700');
    p.button(k + '-', '−', x, y + 22, 90, 54, () => { S[k] = clamp(Math.round((S[k] - st) / st * 1000) / 1000 * st, mn, mx); game.save(); }, { size: 36 });
    p.button(k + '+', '+', x + 345, y + 22, 90, 54, () => { S[k] = clamp(Math.round((S[k] + st) / st * 1000) / 1000 * st, mn, mx); game.save(); }, { size: 36 });
  });
  else {
    const tg = (id, label, x, y, fn) => p.button(id, label, x, y, 460, 70, fn, { size: 28 });
    tg('mir', 'Image miroir : ' + (S.mirror ? 'OUI' : 'NON'), 30, 110, () => { S.mirror = !S.mirror; game.save(); });
    tg('fac', 'Caméra : ' + (S.facing === 'environment' ? 'arrière' : 'avant'), 520, 110, () => { S.facing = S.facing === 'environment' ? 'user' : 'environment'; S.deviceId = ''; game.save(); game.restartCamera(); });
    tg('dev', `Caméra suivante (${game.cam.devices.length} trouvée(s))`, 30, 200, () => { const d = game.cam.devices; if (d.length > 1) { const i = d.findIndex((x) => x.deviceId === S.deviceId); S.deviceId = d[(i + 1) % d.length].deviceId; game.save(); game.restartCamera(); } });
    tg('mono', 'Affichage : ' + (S.mono ? 'écran simple' : 'Cardboard (2 yeux)'), 520, 200, () => { S.mono = !S.mono; game.save(); });
    tg('skin', 'Réinitialiser la peau', 30, 290, () => { if (game.tracker) game.tracker.resetSkin(); game.toastMsg('Teinte de peau réinitialisée', 2); });
    tg('def', 'Valeurs par défaut', 520, 290, () => { for (const k of Object.keys(DEFAULTS)) if (!['facing', 'deviceId', 'netUrl', 'room', 'name'].includes(k)) S[k] = DEFAULTS[k]; game.save(); });
    p.text('Le mode « écran simple » sert au test hors casque.', 512, 400, 24, '#9bb', 'center', '500');
  }
  p.button('prev', '◀', 30, 490, 120, 66, () => { game.page = (game.page + PAGES.length - 1) % PAGES.length; }, { size: 36 });
  p.button('next', '▶', 170, 490, 120, 66, () => { game.page = (game.page + 1) % PAGES.length; }, { size: 36 });
  p.button('back', game.manual ? 'Valider ✓' : 'Retour', 700, 490, 290, 66, () => { game.save(); if (game.manual) { game.manual = false; game.setState('calib'); calib.go('verify'); } else game.setState('menu'); }, { primary: true, size: 32 });
  p.end();
}
let previewCv = null, previewImg = null;
function drawStatus(now) {
  const p = status; p.begin(true); let y = 36;
  if (game.toastT > 0) { p.text(game.toast, 320, y, 28, '#ffe28a', 'center', '700'); y += 48; }
  if (S.diag) {
    const t = game.tracker, c = game.cam, hands = t && t.latest ? t.latest.hands.filter((h) => h.valid).length : 0;
    const L = [`FPS ${game.fps.toFixed(0)}   rendu CPU ${game.renderMs.toFixed(1)} ms`, `Tracking ${t ? t.hz.toFixed(0) : 0} Hz   détection ${t ? t.detectMs.toFixed(1) : 0} ms`,
      `Caméra : ${c.state}${c.error ? ' (' + c.error + ')' : ''}${t ? ' [' + t.mode + ']' : ''}`, `Mains : ${hands}   pertes : ${t ? t.losses : 0}   latence ${t ? t.latency.toFixed(0) : 0} ms`,
      `Tête : ${game.head.hasSensor ? 'capteurs' : 'clavier'}   multi : ${game.net.state} (${game.net.count})`];
    L.forEach((l, i) => p.text(l, 18, y + i * 34, 24, '#cfe', 'left', '500'));
    if (t && t.mask && t.mw) { // aperçu du masque de peau + positions des mains
      if (!previewCv || previewCv.width !== t.mw) { previewCv = document.createElement('canvas'); previewCv.width = t.mw; previewCv.height = t.mh; previewImg = previewCv.getContext('2d').createImageData(t.mw, t.mh); }
      const d = previewImg.data, m = t.mask; for (let i = 0; i < m.length; i++) { const o = i * 4, v = m[i] ? 255 : 30; d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255; }
      previewCv.getContext('2d').putImageData(previewImg, 0, 0); p.g.drawImage(previewCv, 440, y + 150 - 10, 180, 135);
      if (t.latest) t.latest.hands.forEach((h, i) => { if (h.valid) { p.g.fillStyle = i ? '#4cf' : '#fc4'; p.g.fillRect(440 + h.x * 180 - 5, y + 140 + h.y * 135 - 5, 10, 10); } });
    }
  }
  p.end(); void now;
}

// ---------- Entrées ----------
const keys = {};
addEventListener('keydown', (e) => {
  if (e.repeat) return; keys[e.code] = true;
  if (e.code === 'KeyR') game.head.recenter(); else if (e.code === 'KeyM') { game.state === 'play' ? game.openMenu() : game.state === 'menu' && game.setState('play'); }
  else if (e.code === 'KeyC') { game.setState('calib'); calib.begin(true); } else if (e.code === 'KeyG') { S.diag = !S.diag; if (game.tracker) game.tracker.preview = S.diag; }
  else if (e.code === 'Space') { game.sim.trigger(true); e.preventDefault(); } else if (e.code === 'Enter' && game.hoverBtn) activate(game.hoverBtn);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
const pointers = new Map();
canvas.addEventListener('pointermove', (e) => { mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = 1 - (e.clientY / innerHeight) * 2; mouse.in = true; if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX / innerWidth, y: e.clientY / innerHeight }); });
canvas.addEventListener('pointerdown', (e) => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = 1 - (e.clientY / innerHeight) * 2; mouse.in = true;
  if (game.state === 'boot') return;
  if (game.hoverBtn && menu.visible) { activate(game.hoverBtn); return; }
  if (game.state === 'play' && !game.fallback) { game.openMenu(); return; }
  pointers.set(e.pointerId, { x: e.clientX / innerWidth, y: e.clientY / innerHeight }); try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
const up = (e) => pointers.delete(e.pointerId); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
$('menuBtn').addEventListener('click', () => { game.state === 'play' ? game.openMenu() : game.state === 'menu' && game.setState('play'); });

function fallbackHands(dt) {
  const walking = keys.KeyW || keys.ArrowUp && keys.ShiftLeft, back = keys.KeyS, sim = game.sim.update(dt, !!(walking || back), !!back);
  const M = game.mapper; let pt0 = null, pt1 = null;
  for (const p of pointers.values()) { if (p.x < 0.5) pt0 = p; else pt1 = p; }
  for (let i = 0; i < 2; i++) {
    if (sim[i].tracked) { M.setDirect(i, sim[i].x, sim[i].y, sim[i].z, true); continue; }
    const p = i ? pt1 : pt0;
    if (p) M.setDirect(i, (p.x - 0.5) * 1.2, -0.45 - (p.y - 0.5) * 2.1, 0.45, true); else { const h = M.hands[i]; M.setDirect(i, h.x, h.y, h.z, false); }
  }
}

// ---------- Boucle principale ----------
let last = 0, acc = 0, fpsT = 0, fpsN = 0, uiT = 0, stT = 0, netT = 0; const STEP = 1 / 90;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
  R.setSize(innerWidth * dpr * (S.mono ? 1 : 0.9), innerHeight * dpr * (S.mono ? 1 : 0.9), S.mono ? 1 : S.renderScale);
}
addEventListener('resize', resize); if (screen.orientation) screen.orientation.addEventListener('change', resize);

function drawAvatars() {
  dyn.reset(); const m = dyn, P = phys.pos, yaw = game.head.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), eh = S.eyeH;
  const skin = [0.85, 0.62, 0.35], dark = [0.3, 0.22, 0.16];
  // corps local (torse + ombre) et mains virtuelles
  m.box(P.x - fx * 0.12, P.y + eh - 0.55, P.z - fz * 0.12, 0.42, 0.6, 0.24, dark, -yaw);
  m.box(P.x, world.floorHeightAt(P.x, P.y + 0.4, P.z) + 0.02, P.z, 0.8, 0.02, 0.8, [0.12, 0.28, 0.12]);
  for (let i = 0; i < 2; i++) {
    const o = game.mapper.out[i], wx = P.x + rx * o.x - fx * -o.z * 0 + fx * o.z, wy = P.y + eh + o.y, wz = P.z + rz * o.x + fz * o.z, sgn = o.x >= 0 ? 1 : -1;
    const col = o.tracked ? skin : [0.5, 0.5, 0.5], sx = P.x + rx * 0.2 * sgn, sy = P.y + eh - 0.25, sz = P.z + rz * 0.2 * sgn;
    m.box(wx, wy, wz, 0.17, 0.17, 0.17, col, -yaw); m.limb(sx, sy, sz, wx, wy, wz, 0.035, dark);
  }
  for (const r of game.net.remote.values()) { // autres joueurs
    const hue = (parseInt(r.id.slice(0, 3), 36) % 360) / 360, c = [0.4 + 0.5 * Math.abs(Math.sin(hue * 6.28)), 0.4 + 0.5 * Math.abs(Math.sin(hue * 6.28 + 2)), 0.4 + 0.5 * Math.abs(Math.sin(hue * 6.28 + 4))], q = r.pos, ry = r.yaw;
    const eyeY = q.y + 1.45; m.box(q.x, eyeY - 0.55, q.z, 0.45, 0.6, 0.26, c, -ry); m.box(q.x, eyeY, q.z, 0.28, 0.28, 0.28, [0.85, 0.7, 0.5], -ry);
    m.box(q.x, world.floorHeightAt(q.x, q.y + 0.4, q.z) + 0.02, q.z, 0.8, 0.02, 0.8, [0.12, 0.28, 0.12]);
    for (let i = 0; i < 2; i++) { const h = r.hands[i], s = i ? 1 : -1; m.limb(q.x + Math.cos(ry) * 0.25 * s, eyeY - 0.3, q.z - Math.sin(ry) * 0.25 * s, h.x, h.y, h.z, 0.04, c); m.box(h.x, h.y, h.z, 0.17, 0.17, 0.17, [0.9, 0.7, 0.5]); }
  }
  R.uploadDynamic(m.a, m.n);
}

function frame(now) {
  requestAnimationFrame(frame); if (!game.running) return;
  const t0 = performance.now(); const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
  fpsN++; fpsT += dt; if (fpsT >= 0.5) { game.fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
  // tête
  const hd = game.head; if (!hd.hasSensor) { const k = 1.6 * dt; if (keys.ArrowLeft) hd.manualYaw += k; if (keys.ArrowRight) hd.manualYaw -= k; if (keys.ArrowUp && !keys.ShiftLeft) hd.manualPitch = Math.min(1.4, hd.manualPitch + k); if (keys.ArrowDown) hd.manualPitch = Math.max(-1.4, hd.manualPitch - k); }
  if (keys.KeyQ) hd.trim += dt; if (keys.KeyE) hd.trim -= dt; hd.update();
  // mains
  if (game.fallback) fallbackHands(dt); else game.mapper.update(dt);
  // physique à pas fixe (actif en jeu, et pendant l'étape de vérification de la calibration)
  phys.eyeH = S.eyeH; const live = game.state === 'play' || (game.state === 'calib' && calib.step === 'verify');
  if (live) { acc += dt; let n = 0; while (acc >= STEP && n++ < 4) { phys.step(STEP, hd.yaw, game.mapper.out); acc -= STEP; } if (n >= 4) acc = 0; if (phys.impact > 0.25) { game.audio.thud(phys.impact); } phys.impact = 0; } else acc = 0;
  if (game.state === 'calib') calib.update(dt);
  // multi
  game.net.update(now); game.net.sendState(now, phys.pos, hd.yaw, phys.hands);
  // UI
  if (game.toastT > 0) { game.toastT -= dt; if (game.toastT <= 0) game.invalidate(); }
  hoverUpdate(dt); status.visible = S.diag || game.toastT > 0; reticle.visible = menu.visible;
  if (now - uiT > 90 && game.uiDirty && menu.visible) { uiT = now; game.uiDirty = false; (game.state === 'calib' ? calib.draw(menu) : game.state === 'settings' ? drawSettings(menu) : drawMenu(menu)); }
  if (status.visible && now - stT > 250) { stT = now; drawStatus(now); } void netT;
  // rendu
  const e = eyePos(), q = hd.q, st = !S.mono; frameDesc.stereo = st; frameDesc.fov = (st ? S.fov : 75) * DEG; frameDesc.k1 = S.k1; frameDesc.k2 = S.k2; resizeIfNeeded();
  if (st) {
    qRot(q, 1, 0, 0, rv); const h = S.ipd / 2;
    camL.x = e.x - rv.x * h; camL.y = e.y - rv.y * h; camL.z = e.z - rv.z * h; camR.x = e.x + rv.x * h; camR.y = e.y + rv.y * h; camR.z = e.z + rv.z * h;
    views[0].eyeX = -h; views[1].eyeX = h; mat4View(viewA, q, camL); mat4View(viewB, q, camR); frameDesc.views = views;
  } else { camL.x = e.x; camL.y = e.y; camL.z = e.z; mat4View(viewA, q, camL); frameDesc.views = mono; }
  drawAvatars(); R.render(frameDesc); game.renderMs += (performance.now() - t0 - game.renderMs) * 0.1; game.frameMs = dt * 1000;
}
let rsKey = '';
function resizeIfNeeded() { const k = `${innerWidth}x${innerHeight}:${S.mono}:${S.renderScale}`; if (k !== rsKey) { rsKey = k; resize(); } }

// ---------- Démarrage / cycle de vie ----------
async function enterImmersive() {
  try { const el = document.documentElement; if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' }); } catch (e) { /* refusé : on continue */ }
  try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) { /* non supporté */ }
  try { if (navigator.wakeLock) game.wake = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ }
}
async function begin(fallback) {
  $('msg').textContent = ''; S.facing = $('selFacing').value; S.mono = $('chkMono').checked; S.netUrl = $('inpNet').value.trim(); S.room = $('inpRoom').value.trim() || 'foret'; S.name = $('inpName').value.trim(); game.save();
  await enterImmersive(); await game.head.requestPermission(); game.head.start(); game.audio.on = S.sound; game.audio.start();
  $('start').style.display = 'none'; $('menuBtn').style.display = 'block'; resize();
  phys.teleport(...SPAWNS[S.spawn % SPAWNS.length]); game.running = true; last = 0;
  if (fallback) { game.fallback = true; game.setState('calib'); calib.go('verify'); calib.note = 'Mode secours : tactile/souris = mains, W = avancer, Espace = sauter.'; }
  else { game.setState('calib'); calib.begin(false); startCamera().then(() => { if (game.camError) game.invalidate(); }); }
  if (S.netUrl && S.netUrl !== 'off') game.net.connect({ url: S.netUrl, room: S.room, name: S.name });
}
$('btnPlay').addEventListener('click', () => begin(false)); $('btnFallback').addEventListener('click', () => begin(true));
$('selFacing').value = S.facing; $('chkMono').checked = S.mono; $('inpNet').value = S.netUrl; $('inpRoom').value = S.room; $('inpName').value = S.name;
document.addEventListener('visibilitychange', () => { // cycle de vie : on libère caméra et audio en arrière-plan
  if (document.hidden) { game.audio.suspend(); if (!game.fallback) game.cam.stop(); } else if (game.running) { game.audio.resume(); if (!game.fallback) startCamera(); }
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.Capacitor) navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne optionnel */ });
requestAnimationFrame(frame);
void DEFAULT_CALIB;
