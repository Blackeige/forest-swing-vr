// Applique les réglages Android (permissions, paysage, immersif, MainActivity) au projet généré par `cap add android`.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), app = path.join(root, 'android/app/src/main');
const manifestPath = path.join(app, 'AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) { console.error('android/ introuvable : lance d\'abord `npx cap add android`.'); process.exit(1); }
let m = fs.readFileSync(manifestPath, 'utf8'); const add = [];
const lines = [['android.permission.CAMERA', '<uses-permission android:name="android.permission.CAMERA" />'], ['android.permission.MODIFY_AUDIO_SETTINGS', '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />'], ['android.permission.WAKE_LOCK', '<uses-permission android:name="android.permission.WAKE_LOCK" />'], ['android.permission.INTERNET', '<uses-permission android:name="android.permission.INTERNET" />'],
  ['android.hardware.camera"', '<uses-feature android:name="android.hardware.camera" android:required="false" />'], ['sensor.gyroscope', '<uses-feature android:name="android.hardware.sensor.gyroscope" android:required="false" />'], ['sensor.accelerometer', '<uses-feature android:name="android.hardware.sensor.accelerometer" android:required="false" />']];
for (const [key, l] of lines) if (!m.includes(key)) add.push('    ' + l);
if (add.length) m = m.replace('</manifest>', add.join('\n') + '\n</manifest>');
if (!m.includes('screenOrientation')) m = m.replace('<activity', '<activity\n            android:screenOrientation="sensorLandscape"');
fs.writeFileSync(manifestPath, m);
// MainActivity (immersif + permission caméra au démarrage)
const javaDir = path.join(app, 'java/app/forestswing/vr'); fs.mkdirSync(javaDir, { recursive: true });
fs.copyFileSync(path.join(root, 'android-overrides/MainActivity.java'), path.join(javaDir, 'MainActivity.java'));
console.log('Projet Android patché : permissions caméra/audio, paysage, immersif.');
