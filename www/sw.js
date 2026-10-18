// Cache hors ligne (navigateur). Dans l'APK, les fichiers sont déjà embarqués.
const V = 'forestswing-v1', FILES = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icon.svg', 'js/main.js', 'js/math.js', 'js/settings.js', 'js/mesh.js', 'js/world.js', 'js/physics.js', 'js/gl.js', 'js/tracker-core.js', 'js/tracker.worker.js', 'js/camera.js', 'js/head.js', 'js/handmap.js', 'js/audio.js', 'js/net.js', 'js/hud.js', 'js/calibration.js'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => { if (e.request.method === 'GET') e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request))); });
