// Locomotion « à la Gorilla Tag » : une main qui touche une surface reste ancrée, le corps se déplace
// à l'opposé du mouvement de la main ; au relâchement la vitesse est conservée (inertie).
// Repère local d'une main : x = droite, y = haut (relatif aux yeux), z = devant.
const G = 9.8, HAND_R = 0.11, MAX_V = 11, MAX_STEP = 0.35, HIST = 6;

export class Physics {
  constructor(world) {
    this.world = world; this.eyeH = 1.45;
    this.pos = { x: 0, y: 0.5, z: 0 }; this.vel = { x: 0, y: 0, z: 0 }; this.onGround = false;
    this.q = { nx: 0, ny: 1, nz: 0, bounce: 0 };
    this.hands = [this._hand(), this._hand()]; this.touching = 0; this.impact = 0;
  }
  _hand() { return { init: false, px: 0, py: 0, pz: 0, wx: 0, wy: 0, wz: 0, touch: false, hist: new Float32Array(HIST * 3), hi: 0, hn: 0, vx: 0, vy: 0, vz: 0 }; }
  teleport(x, y, z) { this.pos.x = x; this.pos.y = y; this.pos.z = z; this.vel.x = this.vel.y = this.vel.z = 0; for (const h of this.hands) { h.init = false; h.touch = false; h.hn = 0; } }
  step(dt, yaw, inp) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), p = this.pos, v = this.vel, q = this.q, eye = this.eyeH;
    let nT = 0, tvx = 0, tvy = 0, tvz = 0, released = false, rvx = 0, rvy = 0, rvz = 0;
    for (let i = 0; i < 2; i++) {
      const h = this.hands[i], d = inp[i], was = h.touch;
      if (!d.tracked || !h.init) { // pas de mouvement relatif tant que la main n'est pas suivie
        h.px = d.x; h.py = d.y; h.pz = d.z; h.init = d.tracked; h.touch = false;
        if (was) { released = true; rvx = h.vx; rvy = h.vy; rvz = h.vz; }
        h.wx = p.x + cy * d.x - sy * d.z; h.wy = p.y + eye + d.y; h.wz = p.z - sy * d.x - cy * d.z; continue;
      }
      let dx = d.x - h.px, dy = d.y - h.py, dz = d.z - h.pz; const m = Math.hypot(dx, dy, dz);
      if (m > MAX_STEP) { const k = MAX_STEP / m; dx *= k; dy *= k; dz *= k; }
      h.px = d.x; h.py = d.y; h.pz = d.z;
      const dwx = cy * dx - sy * dz, dwy = dy, dwz = -sy * dx - cy * dz;
      const hx = p.x + cy * d.x - sy * d.z, hy = p.y + eye + d.y, hz = p.z - sy * d.x - cy * d.z;
      const pen = this.world.sphereQuery(hx, hy, hz, HAND_R, q);
      let touch = false;
      if (pen > -0.012) {
        const away = dwx * q.nx + dwy * q.ny + dwz * q.nz; // > 0 : la main s'éloigne de la surface
        if (away <= 0.002) {
          touch = true;
          p.x -= dwx; p.y -= dwy; p.z -= dwz; // la main reste ancrée : le corps bouge à l'opposé
          const out = Math.min(Math.max(pen, 0), 0.08) * 0.6; p.x += q.nx * out; p.y += q.ny * out; p.z += q.nz * out;
          const k = 1 / dt, sx = -dwx * k, sy2 = -dwy * k, sz = -dwz * k;
          h.vx += (sx - h.vx) * 0.5; h.vy += (sy2 - h.vy) * 0.5; h.vz += (sz - h.vz) * 0.5;
          if (!was) this.impact = Math.max(this.impact, Math.min(1, Math.hypot(sx, sy2, sz) / 6));
        }
      }
      h.touch = touch;
      if (touch) { nT++; tvx += h.vx; tvy += h.vy; tvz += h.vz; } else if (was) { released = true; rvx = h.vx; rvy = h.vy; rvz = h.vz; h.vx = h.vy = h.vz = 0; }
      h.wx = p.x + cy * d.x - sy * d.z; h.wy = p.y + eye + d.y; h.wz = p.z - sy * d.x - cy * d.z;
    }
    this.touching = nT;
    if (nT > 0) { v.x = tvx / nT; v.y = tvy / nT; v.z = tvz / nT; } // suspendu / en appui : la vitesse suit les mains
    else {
      if (released) { v.x = rvx; v.y = rvy; v.z = rvz; }
      v.y -= G * dt; const dr = Math.exp(-0.12 * dt); v.x *= dr; v.z *= dr;
      if (this.onGround) { const f = Math.exp(-5 * dt); v.x *= f; v.z *= f; }
    }
    const sp = Math.hypot(v.x, v.y, v.z); if (sp > MAX_V) { const k = MAX_V / sp; v.x *= k; v.y *= k; v.z *= k; }
    if (nT === 0) { p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt; }
    this.collideBody(eye);
    if (p.y < -15) this.teleport(0, 0.5, 0);
  }
  collideBody(eye) {
    const p = this.pos, v = this.vel, q = this.q; this.onGround = false;
    const ys = [0.3, 0.85, eye - 0.05], rs = [0.3, 0.3, 0.2];
    for (let it = 0; it < 3; it++) for (let s = 0; s < 3; s++) {
      const pen = this.world.sphereQuery(p.x, p.y + ys[s], p.z, rs[s], q);
      if (pen > 0) {
        p.x += q.nx * pen; p.y += q.ny * pen; p.z += q.nz * pen;
        const vn = v.x * q.nx + v.y * q.ny + v.z * q.nz;
        if (vn < 0) { const e = (q.bounce > 0 && vn < -1) ? q.bounce : 0; v.x -= (1 + e) * vn * q.nx; v.y -= (1 + e) * vn * q.ny; v.z -= (1 + e) * vn * q.nz; if (vn < -3) this.impact = Math.max(this.impact, 0.5); }
        if (q.ny > 0.55) this.onGround = true;
      }
    }
  }
}
