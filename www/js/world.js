// Map procédurale originale (forêt stylisée) : maillage statique + colliders AABB.
import { MeshWriter } from './mesh.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const tint = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

export const SPAWNS = [[0, 0.5, 0], [-22, 0.5, -22], [24, 0.5, 18], [0, 8.6, -34]];
export const SKY = [0.55, 0.76, 0.95];

export class World {
  constructor() {
    this.mesh = new MeshWriter(40000);
    this.c = new Float32Array(600 * 6); this.bounce = new Float32Array(600); this.n = 0;
    this.build();
  }
  addCol(x0, y0, z0, x1, y1, z1, bounce = 0) {
    const o = this.n * 6; this.c[o] = x0; this.c[o + 1] = y0; this.c[o + 2] = z0; this.c[o + 3] = x1; this.c[o + 4] = y1; this.c[o + 5] = z1;
    this.bounce[this.n++] = bounce;
  }
  solid(cx, cy, cz, sx, sy, sz, col, bounce = 0) { // cy = centre
    this.mesh.box(cx, cy, cz, sx, sy, sz, col);
    this.addCol(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, bounce);
  }
  build() {
    const r = rng(1337), m = this.mesh;
    const grass = [0.36, 0.62, 0.28], stone = [0.62, 0.62, 0.6], rock = [0.5, 0.48, 0.46], bark = [0.42, 0.28, 0.18], leaf = [0.2, 0.5, 0.22], wood = [0.7, 0.5, 0.3];
    // Sol : tuiles décoratives + un collider unique
    for (let x = -64; x < 64; x += 4) for (let z = -64; z < 64; z += 4) m.topQuad(x + 2, z + 2, 4, 4, 0, tint(grass, 0.85 + r() * 0.3));
    this.addCol(-70, -6, -70, 70, 0, 70);
    // Falaises périphériques (empêchent de quitter la map)
    const cl = [0.45, 0.4, 0.38];
    this.solid(0, 9, -68, 140, 18, 4, cl); this.solid(0, 9, 68, 140, 18, 4, cl); this.solid(-68, 9, 0, 4, 18, 132, cl); this.solid(68, 9, 0, 4, 18, 132, cl);
    // Place de départ
    this.solid(0, 0.2, 0, 10, 0.4, 10, stone);
    for (const [px, pz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) this.solid(px, 2, pz, 0.7, 4, 0.7, tint(stone, 0.9));
    // Tours à escalader (autour de la place)
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + 0.3, x = Math.cos(a) * 20, z = Math.sin(a) * 20, h = 8 + i * 1.5;
      this.solid(x, h / 2, z, 3, h, 3, tint(rock, 0.9 + r() * 0.2));
      this.solid(x, h + 0.25, z, 4.4, 0.5, 4.4, tint(wood, 1));
    }
    // Mur d'escalade nord + marches
    this.solid(0, 5, -34, 14, 10, 2, tint(rock, 1.05));
    for (let i = 0; i < 5; i++) this.solid(-5 + i * 2.5, 1 + i * 1.7, -31.4, 1.4, 0.6, 1.4, wood);
    this.solid(0, 10.2, -37, 14, 0.5, 8, wood); // plateau du sommet
    // Parcours de plateformes en spirale
    for (let i = 0; i < 14; i++) {
      const a = i * 0.55, rad = 12 + i * 1.1, h = 1.5 + i * 0.9;
      this.solid(Math.cos(a) * rad + 22, h, Math.sin(a) * rad - 8, 2.6, 0.5, 2.6, tint(wood, 0.9 + (i % 3) * 0.1));
    }
    // Trampolines (rebond)
    for (const [x, z] of [[8, 8], [-9, 6], [14, -12], [-18, 12], [30, 28]]) this.solid(x, 0.15, z, 4, 0.3, 4, [0.95, 0.5, 0.15], 1.1);
    // Rochers
    for (let i = 0; i < 40; i++) {
      const x = (r() - 0.5) * 110, z = (r() - 0.5) * 110; if (Math.hypot(x, z) < 8) continue;
      const s = 0.8 + r() * 2.2; this.solid(x, s * 0.4, z, s * 1.4, s * 0.8, s * 1.1, tint(rock, 0.8 + r() * 0.4));
    }
    // Arbres : tronc solide + houppier décoratif
    for (let i = 0; i < 85; i++) {
      const x = (r() - 0.5) * 118, z = (r() - 0.5) * 118; if (Math.hypot(x, z) < 9) continue;
      const h = 5 + r() * 4;
      this.solid(x, h / 2, z, 0.6, h, 0.6, tint(bark, 0.85 + r() * 0.3));
      const lc = tint(leaf, 0.8 + r() * 0.4);
      m.box(x, h + 0.6, z, 3.6, 1.6, 3.6, lc, r()); m.box(x, h + 1.9, z, 2.6, 1.4, 2.6, tint(lc, 1.08), r()); m.box(x, h + 3, z, 1.5, 1.2, 1.5, tint(lc, 1.15), r());
    }
    // Nuages décoratifs
    for (let i = 0; i < 14; i++) m.box((r() - 0.5) * 160, 38 + r() * 12, (r() - 0.5) * 160, 10 + r() * 10, 1.5, 6 + r() * 6, [1, 1, 1], r());
  }
  // Sphère contre AABB : renvoie la pénétration (>0 = chevauchement) ou -9 ; remplit out {nx,ny,nz,bounce}.
  sphereQuery(cx, cy, cz, r, out) {
    const a = this.c, r2 = (r + 0.012) * (r + 0.012); let best = -9;
    for (let i = 0, n = this.n; i < n; i++) {
      const o = i * 6;
      const px = cx < a[o] ? a[o] : cx > a[o + 3] ? a[o + 3] : cx, py = cy < a[o + 1] ? a[o + 1] : cy > a[o + 4] ? a[o + 4] : cy, pz = cz < a[o + 2] ? a[o + 2] : cz > a[o + 5] ? a[o + 5] : cz;
      const dx = cx - px, dy = cy - py, dz = cz - pz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      let pen, nx, ny, nz;
      if (d2 > 1e-10) { const d = Math.sqrt(d2); pen = r - d; nx = dx / d; ny = dy / d; nz = dz / d; } else {
        const e = [cx - a[o], a[o + 3] - cx, cy - a[o + 1], a[o + 4] - cy, cz - a[o + 2], a[o + 5] - cz];
        let k = 0; for (let j = 1; j < 6; j++) if (e[j] < e[k]) k = j;
        pen = e[k] + r; nx = ny = nz = 0; const s = (k & 1) ? 1 : -1; if (k < 2) nx = -s; else if (k < 4) ny = -s; else nz = -s;
      }
      if (pen > best) { best = pen; out.nx = nx; out.ny = ny; out.nz = nz; out.bounce = this.bounce[i]; }
    }
    return best;
  }
  floorHeightAt(x, y, z) { // plus haute surface de collider sous (x,y,z)
    let h = 0; const a = this.c;
    for (let i = 0; i < this.n; i++) { const o = i * 6; if (x >= a[o] && x <= a[o + 3] && z >= a[o + 2] && z <= a[o + 5] && a[o + 4] <= y + 0.3 && a[o + 4] > h) h = a[o + 4]; }
    return h;
  }
}
