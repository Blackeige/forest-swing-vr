// Conversion des positions 2D détectées en positions virtuelles 3D (repère local : x droite, y haut/yeux, z devant).
// ATTENTION : la profondeur est une ESTIMATION (taille apparente de la main), pas une mesure.
// y et x viennent de la plage de mouvement calibrée ; z de l'évolution de l'aire de la région détectée.
import { clamp } from './math.js';

export const DEFAULT_CALIB = { cx: 0.5, cy: 0.5, sx: 0.3, sy: 0.25, aRef: 0.03 };
const REST = [{ x: -0.22, y: -0.55, z: 0.45 }, { x: 0.22, y: -0.55, z: 0.45 }];

export class HandMapper {
  constructor(settings) {
    this.s = settings;
    this.hands = [this._h(0), this._h(1)]; this.out = [{ x: 0, y: 0, z: 0, tracked: false }, { x: 0, y: 0, z: 0, tracked: false }];
    this.raw = [null, null]; this.rawT = 0;
  }
  _h(i) { return { x: REST[i].x, y: REST[i].y, z: REST[i].z, tx: REST[i].x, ty: REST[i].y, tz: REST[i].z, tracked: false, valid: false, lastX: REST[i].x, lastY: REST[i].y }; }
  get calib() { return this.s.calib || DEFAULT_CALIB; }
  // Projette (x,y,aire) image -> local. Étapes : mirroir, décalage, échelle, sensibilité.
  map(x, y, area, out) {
    const s = this.s, c = this.calib; if (s.mirror) x = 1 - x;
    const u = clamp((x - c.cx) / c.sx * s.sens, -1.25, 1.25), v = clamp(-(y - c.cy) / c.sy * s.sens, -1.25, 1.25);
    const ar = Math.sqrt(Math.max(area, 1e-5) / Math.max(c.aRef, 1e-5));
    out.x = s.offX + u * 0.55 * s.scale; out.y = s.offY - 0.45 + v * 0.95 * s.scale;
    out.z = clamp(s.handDist + (1 - ar) * s.depthGain * 0.5, 0.12, 0.9); return out;
  }
  // Appelé à chaque nouveau résultat du tracker (~20-30 Hz).
  feed(res) {
    this.rawT = performance.now();
    for (let i = 0; i < 2; i++) {
      const r = res.hands[i], h = this.hands[i]; h.valid = r.valid; h.lost = r.lost;
      if (!r.valid) continue;
      this.map(r.x, r.y, r.area, this._t || (this._t = { x: 0, y: 0, z: 0 }));
      const t = this._t, dz = this.s.dead;
      // zone morte : on ignore les micro-mouvements autour de la dernière cible
      if (Math.hypot(t.x - h.tx, t.y - h.ty, t.z - h.tz) > dz || !h.tracked) { h.tx = t.x; h.ty = t.y; h.tz = t.z; }
      // vitesse (m/s) estimée pour la prédiction limitée
      const k = 1 / Math.max(r.area, 1e-5); h.vx = (this.s.mirror ? -r.vx : r.vx) / this.calib.sx * 0.55 * this.s.scale * this.s.sens; h.vy = -r.vy / this.calib.sy * 0.95 * this.s.scale * this.s.sens; void k;
    }
  }
  // Appelé à chaque frame de rendu : lissage temporel + prédiction (<= 50 ms) + maintien en cas de perte.
  update(dt) {
    const tau = 0.01 + this.s.smooth * 0.11, a = 1 - Math.exp(-dt / tau), age = (performance.now() - this.rawT) / 1000;
    for (let i = 0; i < 2; i++) {
      const h = this.hands[i], o = this.out[i];
      if (h.valid && h.lost <= 3) {
        const p = Math.min(0.05, Math.max(0, 0.05 - age * 0.5)); // prédiction limitée, qui s'éteint si les données vieillissent
        h.x += (h.tx + (h.vx || 0) * p - h.x) * a; h.y += (h.ty + (h.vy || 0) * p - h.y) * a; h.z += (h.tz - h.z) * a; h.tracked = true;
      } else if (h.valid) { h.tracked = false; } // perte temporaire : la main est gelée, sans impulsion physique
      else { // perte longue : retour doux vers la position de repos (jamais de saut brutal)
        const b = 1 - Math.exp(-dt / 0.35); h.x += (REST[i].x - h.x) * b; h.y += (REST[i].y - h.y) * b; h.z += (REST[i].z - h.z) * b; h.tracked = false;
      }
      o.x = h.x; o.y = h.y; o.z = h.z; o.tracked = h.tracked;
    }
    return this.out;
  }
  // Mode de secours : positions locales directes (souris / tactile / clavier).
  setDirect(i, x, y, z, tracked) { const h = this.hands[i], o = this.out[i]; h.x = h.tx = x; h.y = h.ty = y; h.z = h.tz = z; h.tracked = h.valid = tracked; o.x = x; o.y = y; o.z = z; o.tracked = tracked; }
}

// Simulation de marche à quatre pattes pour tester sans caméra (touche W) et « claque » de saut (Espace).
export class FallbackSim {
  constructor() { this.phase = 0; this.slam = -1; this.walk = 0; this.out = [{ x: 0, y: 0, z: 0, tracked: false }, { x: 0, y: 0, z: 0, tracked: false }]; }
  trigger(slam) { if (slam) this.slam = 0; }
  update(dt, walking, back) {
    const o = this.out;
    if (this.slam >= 0) { // les deux mains montent puis frappent le sol : propulsion vers le haut
      this.slam += dt; const t = this.slam; let y;
      if (t < 0.3) y = -0.5 + 0.6 * (t / 0.3); else if (t < 0.6) y = 0.1 - 1.85 * ((t - 0.3) / 0.3); else y = -1.75 + 1.25 * Math.min(1, (t - 0.6) / 0.5);
      if (t > 1.1) this.slam = -1;
      for (let i = 0; i < 2; i++) { o[i].x = i ? 0.22 : -0.22; o[i].y = y; o[i].z = 0.35; o[i].tracked = true; }
      return o;
    }
    if (!walking) { for (let i = 0; i < 2; i++) o[i].tracked = false; this.phase = 0; return o; }
    this.phase += dt * 8 * (back ? -1 : 1);
    for (let i = 0; i < 2; i++) {
      const ph = ((this.phase + i * Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI), stance = ph < Math.PI, f = (ph % Math.PI) / Math.PI;
      o[i].x = i ? 0.22 : -0.22; o[i].tracked = true;
      if (stance) { o[i].y = -1.5; o[i].z = 0.6 - 0.95 * f; } else { o[i].y = -0.85; o[i].z = -0.35 + 0.95 * f; }
    }
    return o;
  }
}
