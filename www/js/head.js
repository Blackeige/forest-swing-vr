// Suivi de tête par capteurs (DeviceOrientation = gyroscope + accéléromètre fusionnés par l'OS).
// Indépendant du tracking des mains. Repli clavier/souris quand aucun capteur n'est disponible.
import { DEG, quat, qMul, qAxis, qEulerYXZ, qRot } from './math.js';

const Q1 = { x: -Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }; // -90° autour de X (le téléphone regarde « devant »)
export class Head {
  constructor() {
    this.q = quat(); this.raw = quat(); this.yawOffset = 0; this.trim = 0; this.hasSensor = false; this.events = 0;
    this.motion = 0; this.manualYaw = 0; this.manualPitch = 0; this.permission = 'unknown'; this._prev = null; this._t = 0; this._tmp = quat(); this._tq = quat(); this._f = { x: 0, y: 0, z: 0 };
  }
  async requestPermission() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') this.permission = await DeviceOrientationEvent.requestPermission();
      else this.permission = 'granted';
    } catch (e) { this.permission = 'denied'; }
    return this.permission;
  }
  start() {
    const h = (e) => this._on(e);
    window.addEventListener('deviceorientation', h, true); this._h = h;
  }
  _screenAngle() { return ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * DEG; }
  _on(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    this.hasSensor = true; this.events++;
    const q = this._tmp; qEulerYXZ(q, e.beta * DEG, e.alpha * DEG, -e.gamma * DEG);
    qMul(q, q, Q1); qAxis(this._tq, 0, 0, 1, -this._screenAngle()); qMul(q, q, this._tq);
    const now = performance.now();
    if (this._prev) { // vitesse angulaire approximative (°/s), pour détecter « téléphone mis dans le casque »
      const dot = Math.abs(q.x * this._prev.x + q.y * this._prev.y + q.z * this._prev.z + q.w * this._prev.w), ang = 2 * Math.acos(Math.min(1, dot)) / DEG, dt = (now - this._t) / 1000;
      if (dt > 0 && dt < 0.5) this.motion += (ang / dt - this.motion) * 0.2;
    }
    this._prev = this._prev || quat(); Object.assign(this._prev, q); this._t = now; Object.assign(this.raw, q);
  }
  yawOf(q) { const f = qRot(q, 0, 0, -1, this._f); return Math.atan2(-f.x, -f.z); }
  recenter() { // la direction actuelle devient « devant »
    const base = this.hasSensor ? this.raw : this.q; this.yawOffset = -this.yawOf(this.hasSensor ? base : quat()) ; this.manualYaw = 0;
  }
  update() {
    const out = this.q;
    if (this.hasSensor) { qAxis(this._tq, 0, 1, 0, this.yawOffset + this.trim); qMul(out, this._tq, this.raw); }
    else qEulerYXZ(out, this.manualPitch, this.manualYaw + this.trim, 0);
    return out;
  }
  get yaw() { return this.yawOf(this.q); }
}
