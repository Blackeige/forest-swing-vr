// Test de fumée navigateur (Chromium headless, WebGL logiciel, caméra factice) — nécessite Playwright.
// Ne remplace PAS un test sur appareil Android réel.
import { createRequire } from 'node:module'; import { startServer } from '../scripts/dev-server.js'; import fs from 'node:fs';
const require = createRequire(import.meta.url); let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { try { ({ chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright')); } catch (e2) { console.log('playwright absent : test de fumée ignoré'); process.exit(0); } }
let err = 0; const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) err++; };
const { server, port } = await startServer({ port: 0, useHttps: false }); const base = `http://localhost:${port}`;
const out = process.env.SHOTS || '/tmp/shots'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 480 }, permissions: ['camera'] }); const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// --- 1. Mode secours, écran simple
await page.goto(base); await page.click('summary'); await page.check('#chkMono'); await page.click('#btnFallback'); await sleep(1500);
check(await page.evaluate(() => window.__fs.running && window.__fs.state === 'calib'), 'démarrage en mode secours -> écran de calibration (vérification)');
await page.screenshot({ path: `${out}/1-calibration.png` });
await page.evaluate(() => window.__fs.finishCalib()); await sleep(300); await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW');
const pos1 = await page.evaluate(() => ({ ...window.__fs.phys.pos })); check(Math.hypot(pos1.x, pos1.z) > 1.5, `le mode secours déplace le joueur (${Math.hypot(pos1.x, pos1.z).toFixed(1)} m)`);
await page.screenshot({ path: `${out}/2-jeu-mono.png` });
await page.keyboard.press('Space'); await sleep(450); const y = await page.evaluate(() => window.__fs.phys.pos.y); check(y > 0.3, `saut en jeu (y=${y.toFixed(2)})`);
const fps = await page.evaluate(() => window.__fs.fps); check(fps > 3, `boucle de rendu active (${fps.toFixed(0)} FPS en rendu logiciel)`);
await page.keyboard.press('KeyM'); await sleep(500); await page.screenshot({ path: `${out}/3-menu.png` });
// --- 2. Stéréo + distorsion + caméra factice + worker
await page.close(); const p2 = await ctx.newPage(); p2.on('pageerror', (e) => errors.push('p2:' + e.message)); await p2.goto(base); await p2.click('summary'); await p2.uncheck('#chkMono');
await p2.click('#btnPlay'); await sleep(4000);
const st = await p2.evaluate(() => { const g = window.__fs; return { cam: g.cam.state, err: g.cam.error, mode: g.tracker && g.tracker.mode, hz: g.tracker && g.tracker.hz, frames: g.tracker && g.tracker.frames, det: g.tracker && g.tracker.detectMs, state: g.state, step: g.calib.step, stereo: !g.S.mono }; });
check(st.cam === 'running', 'caméra getUserMedia démarrée (flux factice) : ' + st.cam + ' ' + st.err);
check(st.mode === 'worker' && st.frames > 10, `tracker dans un Worker, ${st.frames} résultats, ${st.hz && st.hz.toFixed(0)} Hz, détection ${st.det && st.det.toFixed(2)} ms`);
await p2.evaluate(() => { window.__fs.S.diag = true; window.__fs.tracker.preview = true; }); await sleep(800); await p2.screenshot({ path: `${out}/4-stereo-cardboard.png` });
// --- 3. Mapper : conversion 2D -> 3D
const m = await p2.evaluate(async () => { const { HandMapper } = await import('/js/handmap.js'); const S = { sens: 1, handDist: .5, scale: 1, offX: 0, offY: 0, depthGain: .9, mirror: false, dead: .008, smooth: .5, calib: { cx: .5, cy: .5, sx: .3, sy: .25, aRef: .03 } }; const h = new HandMapper(S); const a = h.map(.5, .5, .03, {}), b = h.map(.5, .75, .03, {}), c = h.map(.8, .5, .03, {}), d = h.map(.5, .5, .06, {}); return { a, b, c, d }; });
check(m.a.y > -0.6 && m.a.y < -0.3 && Math.abs(m.a.x) < 1e-6, 'centre de la plage -> main au repos devant le corps'); check(m.b.y < m.a.y - 0.8, 'main plus bas dans l\'image -> plus bas dans le monde'); check(m.c.x > 0.4, 'main à droite dans l\'image -> à droite'); check(m.d.z < m.a.z, 'aire plus grande (main plus proche) -> bras plus replié');
check(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close(); server.close(); process.exit(err ? 1 : 0);
