// Petites fonctions mathématiques sans allocation (matrices 4x4 colonne-major, quaternions {x,y,z,w}).
export const DEG = Math.PI / 180;
const _t = new Float32Array(16);
export const mat4 = () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
export function mat4Mul(o, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    for (let r = 0; r < 4; r++) _t[c * 4 + r] = a[r] * b0 + a[4 + r] * b1 + a[8 + r] * b2 + a[12 + r] * b3;
  }
  o.set(_t); return o;
}
export function mat4Perspective(o, fovy, aspect, n, f) {
  const t = 1 / Math.tan(fovy / 2); o.fill(0);
  o[0] = t / aspect; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o;
}
export function mat4Translate(o, x, y, z) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; o[12] = x; o[13] = y; o[14] = z; return o; }
// Inverse d'une pose rigide (quaternion q, position p) = matrice de vue.
export function mat4View(o, q, p) {
  const { x, y, z, w } = q, xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  const c0x = 1 - 2 * (yy + zz), c0y = 2 * (xy + wz), c0z = 2 * (xz - wy);
  const c1x = 2 * (xy - wz), c1y = 1 - 2 * (xx + zz), c1z = 2 * (yz + wx);
  const c2x = 2 * (xz + wy), c2y = 2 * (yz - wx), c2z = 1 - 2 * (xx + yy);
  o[0] = c0x; o[1] = c1x; o[2] = c2x; o[3] = 0; o[4] = c0y; o[5] = c1y; o[6] = c2y; o[7] = 0;
  o[8] = c0z; o[9] = c1z; o[10] = c2z; o[11] = 0;
  o[12] = -(c0x * p.x + c0y * p.y + c0z * p.z); o[13] = -(c1x * p.x + c1y * p.y + c1z * p.z); o[14] = -(c2x * p.x + c2y * p.y + c2z * p.z); o[15] = 1;
  return o;
}
// Panneau plan face à l'utilisateur : position, yaw autour de Y, échelle x/y.
export function mat4Panel(o, px, py, pz, yaw, sx, sy) {
  const c = Math.cos(yaw), s = Math.sin(yaw); o.fill(0);
  o[0] = c * sx; o[2] = -s * sx; o[5] = sy; o[8] = s; o[10] = c; o[12] = px; o[13] = py; o[14] = pz; o[15] = 1; return o;
}
export const quat = () => ({ x: 0, y: 0, z: 0, w: 1 });
export function qMul(o, a, b) {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  o.x = x; o.y = y; o.z = z; o.w = w; return o;
}
export function qAxis(o, ax, ay, az, ang) { const s = Math.sin(ang / 2); o.x = ax * s; o.y = ay * s; o.z = az * s; o.w = Math.cos(ang / 2); return o; }
const _qa = quat(), _qb = quat(), _qc = quat();
// q = Ry(y) * Rx(x) * Rz(z)
export function qEulerYXZ(o, x, y, z) {
  qAxis(_qa, 0, 1, 0, y); qAxis(_qb, 1, 0, 0, x); qAxis(_qc, 0, 0, 1, z);
  qMul(o, _qa, _qb); return qMul(o, o, _qc);
}
export function qRot(q, x, y, z, out) {
  const tx = 2 * (q.y * z - q.z * y), ty = 2 * (q.z * x - q.x * z), tz = 2 * (q.x * y - q.y * x);
  out.x = x + q.w * tx + (q.y * tz - q.z * ty); out.y = y + q.w * ty + (q.z * tx - q.x * tz); out.z = z + q.w * tz + (q.x * ty - q.y * tx); return out;
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
