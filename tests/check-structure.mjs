// Vérifie : fichiers requis, imports relatifs JS résolus, chemins référencés par index.html / sw.js, config Capacitor.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); let err = 0;
const bad = (m) => { console.error('  ✗ ' + m); err++; };
const ok = (m) => console.log('  ✓ ' + m);
const need = ['package.json', 'capacitor.config.json', 'www/index.html', 'www/sw.js', 'scripts/patch-android.mjs', 'scripts/build-apk.sh', 'scripts/dev-server.js', 'server/relay.js', 'android-overrides/MainActivity.java', 'android-overrides/AndroidManifest.snippet.xml', 'README.md'];
for (const f of need) fs.existsSync(path.join(root, f)) ? 0 : bad('fichier manquant : ' + f);
const jsDir = path.join(root, 'www/js'); let n = 0;
for (const f of fs.readdirSync(jsDir).filter((x) => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  for (const m of src.matchAll(/(?:from\s+|import\s*\(|new URL\()\s*['"](\.[^'"]+)['"]/g)) { n++; if (!fs.existsSync(path.resolve(jsDir, m[1]))) bad(`${f}: import introuvable ${m[1]}`); }
}
ok(`${n} imports relatifs vérifiés`);
const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="([^":]+)"/g)) if (!fs.existsSync(path.join(root, 'www', m[1]))) bad('index.html référence ' + m[1]);
for (const id of ['gl', 'start', 'btnPlay', 'btnFallback', 'msg', 'menuBtn', 'selFacing', 'chkMono', 'inpNet', 'inpRoom', 'inpName']) if (!html.includes(`id="${id}"`)) bad('id manquant dans index.html : ' + id);
const sw = fs.readFileSync(path.join(root, 'www/sw.js'), 'utf8');
for (const m of sw.matchAll(/'((?:js|css)\/[^']+|index\.html|icon\.svg|manifest\.webmanifest)'/g)) if (!fs.existsSync(path.join(root, 'www', m[1]))) bad('sw.js liste un fichier absent : ' + m[1]);
for (const f of fs.readdirSync(jsDir)) if (!sw.includes(`js/${f}`)) bad('sw.js ne met pas en cache js/' + f);
const cap = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
cap.webDir === 'www' ? ok('capacitor webDir = www') : bad('webDir incorrect');
const man = fs.readFileSync(path.join(root, 'android-overrides/AndroidManifest.snippet.xml'), 'utf8');
for (const p of ['android.permission.CAMERA', 'android.permission.MODIFY_AUDIO_SETTINGS', 'sensorLandscape']) man.includes(p) ? ok('manifeste : ' + p) : bad('manifeste : ' + p + ' absent');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const d of ['@capacitor/core', '@capacitor/cli', '@capacitor/android']) pkg.dependencies[d] ? ok('dépendance ' + d) : bad('dépendance manquante ' + d);
if (fs.existsSync(path.join(root, 'www/vendor')) || /unpkg|cdn\./.test(html)) bad('dépendance CDN détectée');
else ok('aucun CDN requis au démarrage');
process.exit(err ? 1 : 0);
