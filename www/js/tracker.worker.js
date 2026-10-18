// Worker : l'analyse d'image ne bloque jamais la boucle de rendu.
import { TrackerCore, drawFrame } from './tracker-core.js';
const core = new TrackerCore();
let oc = null, octx = null;
onmessage = (e) => {
  const m = e.data;
  if (m.type === 'frame') {
    const t0 = performance.now(); let rgba = m.rgba;
    if (m.bitmap) {
      if (!oc || oc.width !== m.w || oc.height !== m.h) { oc = new OffscreenCanvas(m.w, m.h); octx = oc.getContext('2d', { willReadFrequently: true }); }
      drawFrame(octx, m.bitmap, m.w, m.h, m.rot, m.mirror); m.bitmap.close(); rgba = octx.getImageData(0, 0, m.w, m.h).data;
    }
    const res = core.process(rgba, m.w, m.h, m.t); res.detectMs = performance.now() - t0; res.seq = m.seq;
    if (m.preview) res.mask = core.m1.slice(); // aperçu diagnostic (masque peau)
    postMessage({ type: 'result', res, w: m.w, h: m.h });
  } else if (m.type === 'refine') postMessage({ type: 'refined', r: core.refine() });
  else if (m.type === 'resetSkin') core.resetSkin();
  else if (m.type === 'setSkin') Object.assign(core.skin, m.skin);
};
