// Accès caméra (getUserMedia) + client du tracker (worker, avec repli sur le thread principal).
import { TrackerCore, drawFrame } from './tracker-core.js';

export class CameraSource {
  constructor() {
    this.video = document.createElement('video'); this.video.setAttribute('playsinline', ''); this.video.muted = true; this.video.autoplay = true;
    this.stream = null; this.state = 'inactive'; this.error = ''; this.devices = []; this.label = '';
  }
  get ready() { return this.state === 'running' && this.video.readyState >= 2 && this.video.videoWidth > 0; }
  async listDevices() {
    try { this.devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch (e) { this.devices = []; }
    return this.devices;
  }
  async start(s) {
    this.stop(); this.state = 'requesting'; this.error = '';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.state = 'error'; this.error = window.isSecureContext ? 'getUserMedia indisponible' : 'contexte non sécurisé (HTTPS requis)'; throw new Error(this.error);
    }
    const base = { width: { ideal: s.camW }, height: { ideal: s.camH }, frameRate: { ideal: 30, max: 30 } };
    const tries = [];
    if (s.deviceId) tries.push({ video: { ...base, deviceId: { exact: s.deviceId } } });
    tries.push({ video: { ...base, facingMode: { ideal: s.facing } } }, { video: true });
    let last;
    for (const c of tries) {
      try { this.stream = await navigator.mediaDevices.getUserMedia(c); break; } catch (e) { last = e; if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) break; }
    }
    if (!this.stream) { this.state = 'error'; this.error = (last && last.name) || 'échec caméra'; throw last || new Error(this.error); }
    this.video.srcObject = this.stream;
    try { await this.video.play(); } catch (e) { /* lecture auto bloquée : le flux reste exploitable */ }
    const tr = this.stream.getVideoTracks()[0]; this.label = tr ? tr.label : ''; tr && (tr.onended = () => { this.state = 'error'; this.error = 'flux interrompu'; });
    this.state = 'running'; await this.listDevices(); return this;
  }
  stop() {
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null; this.video.srcObject = null; if (this.state !== 'error') this.state = 'inactive';
  }
}

const TIERS = [[160, 120], [120, 90], [80, 60]]; // résolutions d'analyse (la capture reste en 320x240 par défaut)

export class HandTracker {
  constructor(cam, settings) {
    this.cam = cam; this.s = settings; this.worker = null; this.core = null; this.tier = 0; this.inflight = 0; this.seq = 0; this.running = false;
    this.latest = null; this.onResult = null; this.preview = false; this.mask = null; this.mw = 0; this.mh = 0;
    this.hz = 0; this.detectMs = 0; this.latency = 0; this.losses = 0; this.frames = 0; this.mode = 'idle';
    this._lastRes = 0; this._cycle = 0; this._fast = 0; this._refine = null; this._ctx = null;
  }
  start() {
    if (this.running) return; this.running = true;
    const ok = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function';
    if (ok) {
      try {
        this.worker = new Worker(new URL('./tracker.worker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => this._msg(e.data); this.worker.onerror = () => this._fallback(); this.mode = 'worker';
      } catch (e) { this._fallback(); }
    } else this._fallback();
    this._tick();
  }
  _fallback() { if (this.worker) { this.worker.terminate(); this.worker = null; } this.core = this.core || new TrackerCore(); this.mode = 'main'; this.inflight = 0; }
  stop() { this.running = false; clearTimeout(this._to); if (this.worker) { this.worker.terminate(); this.worker = null; } this.mode = 'idle'; }
  _msg(m) {
    if (m.type === 'result') this._result(m.res);
    else if (m.type === 'refined' && this._refine) { this._refine(m.r); this._refine = null; }
  }
  _result(res) {
    const now = performance.now(); this.inflight = Math.max(0, this.inflight - 1);
    const dt = now - this._lastRes; this._lastRes = now; if (dt > 0 && dt < 1000) this.hz += (1000 / dt - this.hz) * 0.15;
    this.detectMs += (res.detectMs - this.detectMs) * 0.2; this.latency += ((now - res.t) - this.latency) * 0.2; this.losses = res.losses; this.frames++;
    if (res.mask) { this.mask = res.mask; const t = TIERS[this.tier]; this.mw = t[0]; this.mh = t[1]; }
    this.latest = res; if (this.onResult) this.onResult(res);
  }
  refine() { // affine la plage de peau (async)
    return new Promise((resolve) => {
      if (this.worker) { this._refine = resolve; this.worker.postMessage({ type: 'refine' }); setTimeout(() => { if (this._refine === resolve) { this._refine = null; resolve({ ok: false }); } }, 600); } else resolve(this.core ? this.core.refine() : { ok: false });
    });
  }
  resetSkin() { if (this.worker) this.worker.postMessage({ type: 'resetSkin' }); else if (this.core) this.core.resetSkin(); }
  _tick() {
    if (!this.running) return;
    const period = 1000 / this.s.trackHz, t0 = performance.now();
    this._pump().catch(() => { this.inflight = Math.max(0, this.inflight - 1); });
    // fréquence adaptative : on réduit la résolution si le cycle dépasse le budget, on l'augmente si large marge
    const budget = period; this._cycle += ((this.detectMs + this.latency * 0.3) - this._cycle) * 0.1;
    if (this._cycle > budget * 0.9 && this.tier < TIERS.length - 1) { this.tier++; this._cycle = 0; this._fast = 0; }
    else if (this.detectMs < budget * 0.25 && this.tier > 0 && ++this._fast > 120) { this.tier--; this._fast = 0; }
    this._to = setTimeout(() => this._tick(), Math.max(4, period - (performance.now() - t0)));
  }
  async _pump() {
    const cam = this.cam; if (!cam.ready || this.inflight > 0 || document.hidden) return;
    const [w, h] = TIERS[this.tier], t = performance.now(), s = this.s;
    if (this.worker) {
      this.inflight++;
      let bmp; try { bmp = await createImageBitmap(cam.video, { resizeWidth: w, resizeHeight: h, resizeQuality: 'low' }); } catch (e) { bmp = await createImageBitmap(cam.video); }
      this.worker.postMessage({ type: 'frame', bitmap: bmp, w, h, t, rot: s.rot, mirror: s.mirror, preview: this.preview, seq: ++this.seq }, [bmp]);
    } else if (this.core) { // repli : traitement sur le thread principal (plus lent)
      if (!this._ctx || this._ctx.canvas.width !== w) { const c = document.createElement('canvas'); c.width = w; c.height = h; this._ctx = c.getContext('2d', { willReadFrequently: true }); }
      drawFrame(this._ctx, cam.video, w, h, s.rot, s.mirror); const d = this._ctx.getImageData(0, 0, w, h).data;
      this.inflight++; const res = this.core.process(d, w, h, t); res.detectMs = performance.now() - t; if (this.preview) res.mask = this.core.m1.slice(); this._result(res);
    }
  }
}
