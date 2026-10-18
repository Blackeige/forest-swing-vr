// Multijoueur extensible : transport WebSocket (relais fourni dans server/) ou BroadcastChannel (onglets locaux).
// Le solo reste entièrement jouable sans aucune connexion.
const SEND_HZ = 15, INTERP_DELAY = 120, TIMEOUT = 5000;
const r2 = (v) => Math.round(v * 100) / 100;

export class Net {
  constructor() {
    this.id = Math.random().toString(36).slice(2, 10); this.state = 'off'; this.error = ''; this.remote = new Map(); this.ws = null; this.bc = null; this.room = ''; this._last = 0; this.name = '';
  }
  get count() { return this.remote.size; }
  connect({ url, room, name }) {
    this.disconnect(); this.room = room || 'foret'; this.name = name || ('Singe-' + this.id.slice(0, 3)); this.state = 'connecting'; this.error = '';
    if (url === 'local') {
      if (typeof BroadcastChannel === 'undefined') { this.state = 'error'; this.error = 'BroadcastChannel indisponible'; return; }
      this.bc = new BroadcastChannel('forestswing:' + this.room); this.bc.onmessage = (e) => this._recv(e.data); this.state = 'on'; return;
    }
    try {
      const ws = this.ws = new WebSocket(url);
      ws.onopen = () => { this.state = 'on'; ws.send(JSON.stringify({ t: 'join', room: this.room, id: this.id, name: this.name })); };
      ws.onmessage = (e) => { try { this._recv(JSON.parse(e.data)); } catch (err) { /* message invalide ignoré */ } };
      ws.onerror = () => { this.state = 'error'; this.error = 'connexion impossible'; };
      ws.onclose = () => { if (this.state === 'on' || this.state === 'connecting') this.state = this.state === 'connecting' ? 'error' : 'off'; this.remote.clear(); };
    } catch (e) { this.state = 'error'; this.error = String(e.message || e); }
  }
  disconnect() {
    if (this.ws) { try { this.ws.close(); } catch (e) { /* ignore */ } this.ws = null; }
    if (this.bc) { this.bc.postMessage({ t: 'l', id: this.id }); this.bc.close(); this.bc = null; }
    this.remote.clear(); this.state = 'off';
  }
  _send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); else if (this.bc) this.bc.postMessage(o); }
  // État local : position du joueur, yaw, mains (monde) — appelé chaque frame, émis à 15 Hz.
  sendState(now, pos, yaw, hands) {
    if (this.state !== 'on' || now - this._last < 1000 / SEND_HZ) return; this._last = now;
    this._send({ t: 's', id: this.id, n: this.name, p: [r2(pos.x), r2(pos.y), r2(pos.z)], y: r2(yaw), h: [[r2(hands[0].wx), r2(hands[0].wy), r2(hands[0].wz)], [r2(hands[1].wx), r2(hands[1].wy), r2(hands[1].wz)]] });
  }
  _recv(m) {
    if (!m || m.id === this.id) return;
    if (m.t === 'l') { this.remote.delete(m.id); return; }
    if (m.t !== 's' || !Array.isArray(m.p)) return;
    let r = this.remote.get(m.id); if (!r) { r = { id: m.id, name: m.n || '?', buf: [], pos: { x: 0, y: 0, z: 0 }, yaw: 0, hands: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], seen: 0 }; this.remote.set(m.id, r); }
    const now = performance.now(); r.seen = now; r.name = m.n || r.name; r.buf.push({ t: now, p: m.p, y: m.y, h: m.h }); if (r.buf.length > 8) r.buf.shift();
  }
  // Interpolation : on rejoue les états avec un léger retard pour lisser les paquets irréguliers.
  update(now) {
    for (const [id, r] of this.remote) {
      if (now - r.seen > TIMEOUT) { this.remote.delete(id); continue; }
      const T = now - INTERP_DELAY, b = r.buf; let i = b.length - 1; while (i > 0 && b[i - 1].t > T) i--;
      const a = b[Math.max(0, i - 1)], c = b[Math.min(b.length - 1, i)], k = c.t > a.t ? Math.min(1, Math.max(0, (T - a.t) / (c.t - a.t))) : 1;
      r.pos.x = a.p[0] + (c.p[0] - a.p[0]) * k; r.pos.y = a.p[1] + (c.p[1] - a.p[1]) * k; r.pos.z = a.p[2] + (c.p[2] - a.p[2]) * k;
      let dy = c.y - a.y; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; r.yaw = a.y + dy * k;
      for (let h = 0; h < 2; h++) for (let j = 0; j < 3; j++) { const v = a.h[h][j] + (c.h[h][j] - a.h[h][j]) * k; if (j === 0) r.hands[h].x = v; else if (j === 1) r.hands[h].y = v; else r.hands[h].z = v; }
    }
  }
}
