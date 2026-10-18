// Sons 100 % procédurés (WebAudio) : vent, oiseaux, impacts de mains. Aucun fichier externe, donc aucune licence.
export class GameAudio {
  constructor() { this.ctx = null; this.on = true; this.master = null; }
  start() {
    if (this.ctx) { this.ctx.resume && this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC(); this.master = c.createGain(); this.master.gain.value = this.on ? 0.7 : 0; this.master.connect(c.destination);
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; const g = c.createGain(); g.gain.value = 0.05;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.12; const lg = c.createGain(); lg.gain.value = 0.03; lfo.connect(lg); lg.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.master); src.start(); lfo.start();
    this._bird = setInterval(() => this.bird(), 2500 + Math.random() * 2000);
  }
  setEnabled(v) { this.on = v; if (this.master) this.master.gain.value = v ? 0.7 : 0; }
  suspend() { this.ctx && this.ctx.suspend && this.ctx.suspend(); }
  resume() { this.ctx && this.ctx.resume && this.ctx.resume(); }
  bird() {
    const c = this.ctx; if (!c || !this.on || c.state !== 'running') return; const t = c.currentTime, o = c.createOscillator(), g = c.createGain(), f = 1800 + Math.random() * 1600;
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.08); o.frequency.exponentialRampToValueAtTime(f * 1.1, t + 0.16);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.04, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.25);
  }
  thud(v = 0.5) {
    const c = this.ctx; if (!c || !this.on || c.state !== 'running') return; const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); g.gain.setValueAtTime(0.35 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2);
  }
}
