// Écrivain de maillage : triangles non indexés, 9 floats / sommet (pos, normale, couleur).
export class MeshWriter {
  constructor(cap = 4096, fixed = false) { this.a = new Float32Array(cap * 9); this.n = 0; this.fixed = fixed; }
  reset() { this.n = 0; }
  _need(v) {
    if ((this.n + v) * 9 <= this.a.length) return true;
    if (this.fixed) return false;
    const b = new Float32Array(Math.max(this.a.length * 2, (this.n + v) * 9)); b.set(this.a); this.a = b; return true;
  }
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, r, g, bl) {
    if (!this._need(3)) return; const a = this.a; let o = this.n * 9;
    a[o++] = ax; a[o++] = ay; a[o++] = az; a[o++] = nx; a[o++] = ny; a[o++] = nz; a[o++] = r; a[o++] = g; a[o++] = bl;
    a[o++] = bx; a[o++] = by; a[o++] = bz; a[o++] = nx; a[o++] = ny; a[o++] = nz; a[o++] = r; a[o++] = g; a[o++] = bl;
    a[o++] = cx; a[o++] = cy; a[o++] = cz; a[o++] = nx; a[o++] = ny; a[o++] = nz; a[o++] = r; a[o++] = g; a[o++] = bl;
    this.n += 3;
  }
  quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, col) {
    this.tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, col[0], col[1], col[2]);
    this.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, nx, ny, nz, col[0], col[1], col[2]);
  }
  // Boîte orientée : centre + 3 demi-axes (vecteurs).
  boxBasis(cx, cy, cz, ux, uy, uz, vx, vy, vz, wx, wy, wz, col) {
    const f = [[ux, uy, uz, vx, vy, vz, wx, wy, wz], [vx, vy, vz, wx, wy, wz, ux, uy, uz], [wx, wy, wz, ux, uy, uz, vx, vy, vz]];
    for (const [ax, ay, az, bx, by, bz, qx, qy, qz] of f) {
      const l = Math.hypot(ax, ay, az) || 1, nx = ax / l, ny = ay / l, nz = az / l;
      for (const s of [1, -1]) {
        const ox = cx + ax * s, oy = cy + ay * s, oz = cz + az * s;
        this.quad(ox - bx - qx, oy - by - qy, oz - bz - qz, ox + bx - qx, oy + by - qy, oz + bz - qz,
          ox + bx + qx, oy + by + qy, oz + bz + qz, ox - bx + qx, oy - by + qy, oz - bz + qz, nx * s, ny * s, nz * s, col);
      }
    }
  }
  box(cx, cy, cz, sx, sy, sz, col, yaw = 0) { // sx.. = tailles complètes
    const c = Math.cos(yaw), s = Math.sin(yaw);
    this.boxBasis(cx, cy, cz, c * sx / 2, 0, -s * sx / 2, 0, sy / 2, 0, s * sz / 2, 0, c * sz / 2, col);
  }
  // Boîte allongée entre deux points (bras), section carrée de demi-côté t.
  limb(x0, y0, z0, x1, y1, z1, t, col) {
    let dx = x1 - x0, dy = y1 - y0, dz = z1 - z0; const l = Math.hypot(dx, dy, dz); if (l < 1e-4) return;
    dx /= l; dy /= l; dz /= l;
    let ux = 0, uy = 1, uz = 0; if (Math.abs(dy) > 0.95) { ux = 1; uy = 0; }
    let vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux; const vl = Math.hypot(vx, vy, vz);
    vx = vx / vl * t; vy = vy / vl * t; vz = vz / vl * t;
    let wx = dy * vz - dz * vy, wy = dz * vx - dx * vz, wz = dx * vy - dy * vx; const wl = Math.hypot(wx, wy, wz);
    wx = wx / wl * t; wy = wy / wl * t; wz = wz / wl * t;
    this.boxBasis((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, dx * l / 2, dy * l / 2, dz * l / 2, vx, vy, vz, wx, wy, wz, col);
  }
  topQuad(x, z, w, d, y, col) { this.quad(x - w / 2, y, z - d / 2, x + w / 2, y, z - d / 2, x + w / 2, y, z + d / 2, x - w / 2, y, z + d / 2, 0, 1, 0, col); }
}
