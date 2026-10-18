// Assistant de calibration (< 20 s) : capteurs -> détection des mains -> plage de mouvement -> vérification.
// Étapes : sensors, hands, range, verify. (manual = écran de réglages manuels, géré par le jeu.)
import { DEFAULT_CALIB } from './handmap.js';

export class Calibration {
  constructor(game) { this.g = game; this.step = 'sensors'; this.t = 0; this.stable = 0; this.moved = false; this.still = 0; this.note = ''; this._reset(); }
  _reset() { this.minx = 9; this.maxx = -9; this.miny = 9; this.maxy = -9; this.areas = []; this.rt = 0; this.samples = 0; }
  begin(quick = false) {
    this.t = 0; this.stable = 0; this.moved = false; this.still = 0; this.note = ''; this._reset();
    this.step = (quick || !this.g.head.hasSensor) ? (this.g.fallback ? 'verify' : 'hands') : 'sensors';
    if (this.g.fallback) this.step = 'verify';
    this.g.invalidate();
  }
  go(step) { this.step = step; this.t = 0; this.stable = 0; this.note = ''; this._reset(); this.g.invalidate(); }
  update(dt) {
    const g = this.g, head = g.head, res = g.tracker && g.tracker.latest; this.t += dt; this._u = (this._u || 0) + dt; if (this._u > 0.25) { this._u = 0; g.invalidate(); }
    if (this.step === 'sensors') {
      if (head.hasSensor) {
        if (head.motion > 60) { this.moved = true; this.still = 0; } else if (this.moved) { this.still += dt; if (this.still > 1.2) { head.recenter(); this.go('hands'); return; } }
      } else if (this.t > 2) { this.note = 'Aucun capteur de mouvement : rotation au clavier / tactile.'; this.go('hands'); return; }
      if (this.t > 10) { head.recenter(); this.go('hands'); }
    } else if (this.step === 'hands') {
      const n = res ? res.hands.filter((h) => h.valid && h.lost === 0).length : 0; this.count = n;
      if (n > 0) { this.stable += dt; if (this.stable > 1.0 && !this._refining) { this._refining = true; g.tracker.refine().then(() => { this._refining = false; this.refined = true; }); } if (this.refined && this.stable > 1.6) { this.refined = false; this.go('range'); } } else this.stable = Math.max(0, this.stable - dt);
      if (this.t > 9 && !this.manualHint) { this.manualHint = true; g.invalidate(); }
    } else if (this.step === 'range') {
      this.rt += dt;
      if (res) for (const h of res.hands) if (h.valid && h.lost === 0) {
        this.minx = Math.min(this.minx, h.x); this.maxx = Math.max(this.maxx, h.x); this.miny = Math.min(this.miny, h.y); this.maxy = Math.max(this.maxy, h.y); this.areas.push(h.area); this.samples++;
      }
      if (this.rt > 6) {
        const sx = (this.maxx - this.minx) / 2, sy = (this.maxy - this.miny) / 2;
        if (this.samples >= 20 && (sx > 0.06 || sy > 0.06)) {
          this.areas.sort((a, b) => a - b);
          g.S.calib = { cx: (this.minx + this.maxx) / 2, cy: (this.miny + this.maxy) / 2, sx: Math.max(0.1, sx), sy: Math.max(0.1, sy), aRef: this.areas[this.areas.length >> 1] || DEFAULT_CALIB.aRef };
          g.save(); this.go('verify');
        } else if (this.rt > 12) { this.note = 'Mouvement insuffisant : essaie la calibration manuelle.'; g.S.calib = g.S.calib || { ...DEFAULT_CALIB }; this.go('verify'); }
        else this.note = 'Bouge un peu plus les mains (haut / bas / gauche / droite).';
      }
    }
  }
  draw(p) {
    const g = this.g; p.begin(); p.text('Calibration', 512, 54, 44, '#9ff0a8', 'center', '800'); const c = 512;
    const skip = () => p.button('skip', 'Passer', 40, 470, 220, 70, () => { if (this.step === 'verify') return; this.go(this.step === 'sensors' ? 'hands' : this.step === 'hands' ? 'range' : 'verify'); }, { size: 30 });
    const manual = () => p.button('manual', 'Manuel', 290, 470, 220, 70, () => g.openManual(), { size: 30 });
    if (this.step === 'sensors') {
      p.lines(['1/4  Place le téléphone dans le casque Cardboard', 'puis regarde droit devant toi.', g.head.hasSensor ? 'Capteurs détectés — bouge la tête puis reste immobile.' : 'Capteurs de mouvement indisponibles.'], c, 170, 34, 1.5, '#fff', 'center');
      p.button('next', 'Continuer', 780, 470, 220, 70, () => { g.head.recenter(); this.go('hands'); }, { primary: true }); skip();
    } else if (this.step === 'hands') {
      const camOk = g.cam && g.cam.ready;
      if (!camOk) { p.lines(['Caméra indisponible : ' + ((g.cam && g.cam.error) || 'non démarrée'), 'Utilise le mode de secours ou la calibration manuelle.'], c, 190, 32, 1.5, '#ffb0a0', 'center'); p.button('fb', 'Mode secours', 780, 470, 220, 70, () => g.useFallback(), { primary: true }); manual(); }
      else {
        p.lines(['2/4  Place tes mains devant la caméra', 'Elles sont détectées automatiquement.'], c, 170, 36, 1.5, '#fff', 'center');
        p.text(`Mains détectées : ${this.count || 0}`, c, 300, 40, this.count ? '#6fe07c' : '#ffd070', 'center'); p.bar(212, 350, 600, 24, this.stable / 1.6);
        skip(); manual(); if (this.manualHint) p.text('Rien ne se passe ? Essaie « Manuel ».', c, 430, 28, '#ffd070', 'center');
      }
    } else if (this.step === 'range') {
      p.lines(['3/4  Tends les bras dans une position confortable', 'puis bouge les mains : haut, bas, gauche, droite.'], c, 160, 34, 1.5, '#fff', 'center');
      p.bar(212, 330, 600, 28, this.rt / 6); p.text(this.note || `Plage mesurée…  échantillons : ${this.samples}`, c, 410, 28, this.note ? '#ffd070' : '#bfe', 'center'); skip(); manual();
    } else if (this.step === 'verify') {
      p.lines(['4/4  Vérifie : tes mains virtuelles suivent les tiennes ?', 'Pousse le sol pour tester le déplacement.'], c, 150, 32, 1.5, '#fff', 'center');
      if (this.note) p.text(this.note, c, 260, 26, '#ffd070', 'center');
      p.button('ok', 'Valider ✓', 760, 440, 230, 80, () => g.finishCalib(), { primary: true }); p.button('redo', 'Recommencer', 40, 440, 260, 80, () => { g.fallback ? g.useCamera() : this.begin(false); }, { size: 30 }); p.button('manual', 'Manuel', 330, 440, 200, 80, () => g.openManual(), { size: 30 });
    }
    p.end();
  }
}
