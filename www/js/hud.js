// Panneaux 2D (canvas -> texture) pour menus, calibration et diagnostic, avec boutons activables au regard.
import { mat4 } from './math.js';

export class Panel {
  constructor(pw, ph, mw, mh) {
    this.c = document.createElement('canvas'); this.c.width = pw; this.c.height = ph; this.g = this.c.getContext('2d');
    this.pw = pw; this.ph = ph; this.mw = mw; this.mh = mh; this.btns = []; this.hover = null; this.visible = false; this.headLocked = false;
    this.model = mat4(); this.tex = null; this.dirtyTex = true; this.opacity = 1;
    this.cx = 0; this.cy = 0; this.cz = 0; this.yaw = 0; // ancrage monde
  }
  begin(bg = true) {
    const g = this.g; g.clearRect(0, 0, this.pw, this.ph); this.btns.length = 0;
    if (bg) { g.fillStyle = 'rgba(8,22,14,0.86)'; this.rr(0, 0, this.pw, this.ph, 28); g.fill(); g.strokeStyle = 'rgba(140,230,150,0.5)'; g.lineWidth = 4; g.stroke(); }
  }
  end() { this.dirtyTex = true; }
  rr(x, y, w, h, r) { const g = this.g; g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  text(s, x, y, size = 36, color = '#fff', align = 'left', weight = '600') {
    const g = this.g; g.font = `${weight} ${size}px system-ui, sans-serif`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y);
  }
  lines(arr, x, y, size = 34, lh = 1.4, color = '#fff', align = 'left') { arr.forEach((l, i) => this.text(l, x, y + i * size * lh, size, color, align, '500')); }
  bar(x, y, w, h, p, color = '#6fe07c') {
    const g = this.g; g.fillStyle = 'rgba(255,255,255,0.15)'; this.rr(x, y, w, h, h / 2); g.fill(); g.fillStyle = color; this.rr(x, y, Math.max(h, w * Math.min(1, Math.max(0, p))), h, h / 2); g.fill();
  }
  button(id, label, x, y, w, h, fn, opt = {}) {
    const g = this.g, hov = this.hover === id && !opt.disabled; this.btns.push({ id, x, y, w, h, fn, disabled: !!opt.disabled });
    g.fillStyle = opt.disabled ? 'rgba(80,80,80,0.5)' : hov ? '#6fe07c' : opt.primary ? 'rgba(60,150,80,0.95)' : 'rgba(40,70,50,0.95)'; this.rr(x, y, w, h, 18); g.fill();
    g.strokeStyle = hov ? '#fff' : 'rgba(140,230,150,0.6)'; g.lineWidth = hov ? 5 : 2; g.stroke();
    this.text(label, x + w / 2, y + h / 2 + 2, opt.size || 34, hov ? '#062010' : opt.disabled ? '#999' : '#fff', 'center', '700');
  }
  hit(u, v) { // u,v en [0,1], v vers le bas
    const px = u * this.pw, py = v * this.ph;
    for (const b of this.btns) if (!b.disabled && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    return null;
  }
}

// Réticule (point de regard) avec anneau de progression du « dwell ».
export class Reticle extends Panel {
  constructor() { super(96, 96, 0.07, 0.07); this.headLocked = true; this.p = -1; }
  draw(progress, hot) {
    const g = this.g; g.clearRect(0, 0, 96, 96); g.lineWidth = 8; g.strokeStyle = hot ? '#6fe07c' : 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(48, 48, hot ? 22 : 12, 0, Math.PI * 2); g.stroke();
    if (progress > 0) { g.strokeStyle = '#6fe07c'; g.lineWidth = 10; g.beginPath(); g.arc(48, 48, 36, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); g.stroke(); }
    this.dirtyTex = true;
  }
}
