// Réglages persistants (localStorage) + valeurs par défaut.
export const DEFAULTS = {
  sens: 1, handDist: 0.5, scale: 1, offX: 0, offY: 0, eyeH: 1.45, smooth: 0.5, dead: 0.008, depthGain: 0.9,
  ipd: 0.064, k1: 0.25, k2: 0.10, fov: 90, renderScale: 0.75, spawn: 0,
  facing: 'environment', deviceId: '', camW: 320, camH: 240, trackHz: 25, mirror: false, rot: 0,
  diag: false, sound: true, mono: false, calib: null, netUrl: '', room: 'foret', name: '',
};
const KEY = 'forestswing.settings.v1';
export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { /* ignore */ }
  return Object.assign({}, DEFAULTS, s);
}
export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
