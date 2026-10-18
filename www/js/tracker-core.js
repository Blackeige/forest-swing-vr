// Suivi de mains ultra léger (sans doigts, sans modèle) :
//  1. masque « peau » en YCbCr (plage adaptative, affinée à la calibration),
//  2. débruitage 4-voisins, composantes connexes (flood fill itératif, buffers réutilisés),
//  3. jusqu'à 2 mains = 2 plus grosses régions ; centre, aire, orientation grossière,
//  4. filtre alpha-bêta avec prédiction limitée et gestion des pertes (maintien puis dégradation).
// LIMITE : une détection couleur dépend de l'éclairage et du fond ; elle peut confondre des objets
// de teinte proche de la peau. Voir README (section Limites).

export function drawFrame(ctx, src, w, h, rot, mirror) {
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate((rot || 0) * Math.PI / 2); if (mirror) ctx.scale(-1, 1);
  const odd = (rot || 0) % 2 === 1, sw = odd ? h : w, sh = odd ? w : h;
  ctx.drawImage(src, -sw / 2, -sh / 2, sw, sh); ctx.restore();
}

const newBlob = () => ({ area: 0, cx: 0, cy: 0, ang: 0, seed: -1, minx: 0, maxx: 0, miny: 0, maxy: 0 });
const newTrack = () => ({ active: false, valid: false, lost: 99, x: 0.5, y: 0.5, vx: 0, vy: 0, area: 0, angle: 0, conf: 0 });

export class TrackerCore {
  constructor() {
    this.w = 0; this.h = 0; this.defaultSkin = { cbMin: 77, cbMax: 127, crMin: 133, crMax: 173, yMin: 35, yMax: 250 };
    this.skin = { ...this.defaultSkin };
    this.blobs = [newBlob(), newBlob(), newBlob(), newBlob()]; this.nb = 0;
    this.tracks = [newTrack(), newTrack()];
    this.minArea = 0.004; this.maxArea = 0.5; this.lostMax = 10; this.losses = 0; this.lastT = 0; this.last = null;
    this.A = 0.62; this.B = 0.22; this.gate = 0.32;
  }
  alloc(w, h) {
    this.w = w; this.h = h; const n = w * h;
    this.m0 = new Uint8Array(n); this.m1 = new Uint8Array(n); this.vis = new Uint8Array(n); this.stack = new Int32Array(n);
  }
  resetSkin() { this.skin = { ...this.defaultSkin }; }
  _mask(d, n) {
    const s = this.skin, m = this.m0; const { cbMin, cbMax, crMin, crMax, yMin, yMax } = s;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = d[p], g = d[p + 1], b = d[p + 2];
      const y = (77 * r + 150 * g + 29 * b) >> 8, cb = 128 + ((-43 * r - 85 * g + 128 * b) >> 8), cr = 128 + ((128 * r - 107 * g - 21 * b) >> 8);
      m[i] = (y >= yMin && y <= yMax && cb >= cbMin && cb <= cbMax && cr >= crMin && cr <= crMax) ? 1 : 0;
    }
    // Débruitage : on garde les pixels ayant au moins 2 voisins (4-connexité)
    const w = this.w, h = this.h, o = this.m1; o.fill(0);
    for (let y = 1; y < h - 1; y++) for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) if (m[i] && (m[i - 1] + m[i + 1] + m[i - w] + m[i + w]) >= 2) o[i] = 1;
  }
  _flood(seed, mask, vis, acc) {
    const w = this.w, h = this.h, st = this.stack; let sp = 0; st[sp++] = seed; vis[seed] = 1;
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, minx = w, maxx = 0, miny = h, maxy = 0;
    while (sp > 0) {
      const i = st[--sp], y = (i / w) | 0, x = i - y * w; n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (acc) acc(i);
      if (x > 0 && mask[i - 1] && !vis[i - 1]) { vis[i - 1] = 1; st[sp++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && !vis[i + 1]) { vis[i + 1] = 1; st[sp++] = i + 1; }
      if (y > 0 && mask[i - w] && !vis[i - w]) { vis[i - w] = 1; st[sp++] = i - w; }
      if (y < h - 1 && mask[i + w] && !vis[i + w]) { vis[i + w] = 1; st[sp++] = i + w; }
    }
    return { n, sx, sy, sxx, syy, sxy, minx, maxx, miny, maxy };
  }
  process(d, w, h, t) {
    if (w !== this.w || h !== this.h) this.alloc(w, h);
    this.last = d; const N = w * h; this._mask(d, N);
    const mask = this.m1, vis = this.vis; vis.fill(0); this.nb = 0; const B = this.blobs, minA = this.minArea * N, maxA = this.maxArea * N;
    for (let i = 0; i < N; i++) {
      if (!mask[i] || vis[i]) continue;
      const r = this._flood(i, mask, vis, null); if (r.n < minA || r.n > maxA) continue;
      // insertion triée (4 meilleures régions)
      let k = this.nb < 4 ? this.nb : 3; if (this.nb === 4 && r.n <= B[3].area) continue;
      while (k > 0 && B[k - 1].area < r.n) { Object.assign(B[k], B[k - 1]); k--; }
      const mx = r.sx / r.n, my = r.sy / r.n, u20 = r.sxx / r.n - mx * mx, u02 = r.syy / r.n - my * my, u11 = r.sxy / r.n - mx * my;
      Object.assign(B[k], { area: r.n, cx: mx / w, cy: my / h, ang: 0.5 * Math.atan2(2 * u11, u20 - u02), seed: i, minx: r.minx, maxx: r.maxx, miny: r.miny, maxy: r.maxy });
      if (this.nb < 4) this.nb++;
    }
    this._assign(t, Math.min(this.nb, 2), N);
    return this._result(t);
  }
  _assign(t, nb, N) {
    const T = this.tracks, B = this.blobs; let dt = this.lastT ? (t - this.lastT) / 1000 : 0.04; dt = Math.min(0.1, Math.max(0.01, dt)); this.lastT = t;
    const asg = [-1, -1], used = [false, false];
    // appariement glouton sur la distance à la position prédite
    const cand = [];
    for (let i = 0; i < 2; i++) if (T[i].active) for (let j = 0; j < nb; j++) {
      const px = T[i].x + T[i].vx * dt, py = T[i].y + T[i].vy * dt, dd = Math.hypot(B[j].cx - px, B[j].cy - py); if (dd < this.gate) cand.push([dd, i, j]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, i, j] of cand) if (asg[i] < 0 && !used[j]) { asg[i] = j; used[j] = true; }
    // blobs sans piste : on prend un emplacement libre (inactif d'abord)
    for (let j = 0; j < nb; j++) {
      if (used[j]) continue;
      const free = [0, 1].filter((i) => asg[i] < 0).sort((a, b) => (T[a].active - T[b].active) || (T[b].lost - T[a].lost));
      let slot = free[0]; if (slot === undefined) continue;
      if (free.length === 2 && !T[0].active && !T[1].active) { // deux emplacements vides : gauche/droite selon x
        const other = nb === 2 ? B[1 - j].cx : 0.5; slot = (nb === 2 ? B[j].cx <= other : B[j].cx < 0.5) ? 0 : 1;
      }
      asg[slot] = j; used[j] = true; T[slot].active = false; // saut : réinitialise la piste
    }
    for (let i = 0; i < 2; i++) {
      const tr = T[i], j = asg[i];
      if (j >= 0) {
        const b = B[j], ba = b.area / N;
        if (!tr.active) { tr.x = b.cx; tr.y = b.cy; tr.vx = tr.vy = 0; tr.area = ba; tr.conf = 0.3; } else {
          const px = tr.x + tr.vx * dt, py = tr.y + tr.vy * dt, rx = b.cx - px, ry = b.cy - py;
          tr.x = px + this.A * rx; tr.y = py + this.A * ry; tr.vx += this.B * rx / dt; tr.vy += this.B * ry / dt;
          const sp = Math.hypot(tr.vx, tr.vy); if (sp > 4) { tr.vx *= 4 / sp; tr.vy *= 4 / sp; }
          tr.area += 0.4 * (ba - tr.area);
        }
        tr.angle = b.ang; tr.lost = 0; tr.active = true; tr.valid = true; tr.conf = Math.min(1, tr.conf + 0.3);
      } else if (tr.active) {
        tr.lost++; tr.x += tr.vx * dt * 0.5; tr.y += tr.vy * dt * 0.5; tr.vx *= 0.6; tr.vy *= 0.6; tr.conf *= 0.75;
        if (tr.lost > this.lostMax) { if (tr.valid) this.losses++; tr.valid = false; tr.active = false; tr.conf = 0; }
      }
    }
  }
  _result(t) {
    return {
      t, hands: this.tracks.map((k) => ({ valid: k.valid, lost: k.lost, conf: k.conf, x: k.x, y: k.y, vx: k.vx, vy: k.vy, area: k.area, angle: k.angle })),
      losses: this.losses, nBlobs: this.nb, skin: this.skin,
    };
  }
  // Affine la plage de peau à partir des pixels des 2 plus grosses régions courantes.
  refine() {
    const d = this.last; if (!d || this.nb === 0) return { ok: false, samples: 0 };
    const vis = new Uint8Array(this.w * this.h), mask = this.m1; let n = 0, scb = 0, scr = 0, scb2 = 0, scr2 = 0;
    for (let j = 0; j < Math.min(this.nb, 2); j++) {
      this._flood(this.blobs[j].seed, mask, vis, (i) => {
        const p = i * 4, r = d[p], g = d[p + 1], b = d[p + 2], cb = 128 + ((-43 * r - 85 * g + 128 * b) >> 8), cr = 128 + ((128 * r - 107 * g - 21 * b) >> 8);
        n++; scb += cb; scr += cr; scb2 += cb * cb; scr2 += cr * cr;
      });
    }
    if (n < 30) return { ok: false, samples: n };
    const mcb = scb / n, mcr = scr / n, sdb = Math.sqrt(Math.max(0, scb2 / n - mcb * mcb)), sdr = Math.sqrt(Math.max(0, scr2 / n - mcr * mcr));
    const hb = Math.min(22, Math.max(7, 2.4 * sdb)), hr = Math.min(22, Math.max(8, 2.4 * sdr));
    Object.assign(this.skin, { cbMin: Math.round(mcb - hb), cbMax: Math.round(mcb + hb), crMin: Math.round(mcr - hr), crMax: Math.round(mcr + hr) });
    return { ok: true, samples: n, skin: this.skin };
  }
}
