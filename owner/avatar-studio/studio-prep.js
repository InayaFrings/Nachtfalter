/* Avatar Studio ohne KI – Vorbereitung der Grundfiguren aus Inayas Vorlage (vorlage-inaya-3.webp).
   Figuren in voller Auflösung ausschneiden und Hautton angleichen (wie in v1 des Studios: Ziel = Hautton des Mannes mit KI-Haaren). */
const CR = {W: 900, H: 1440};
/* Ziel-Hautton (Mittelwert/Streuung der Hautpixel), gemessen am Mann, der Inaya gefallen hat */
const SKIN_T = {mean: [182.72, 168.64, 177.65], sd: [23.02, 22.64, 23.54]};
const ld = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
const isGreen = (p, j) => p[j + 1] - Math.max(p[j], p[j + 2]) > 60;

async function crPrep() {
 const im = await ld(window.AV_BASE || 'vorlage.webp'), w = im.width, h = im.height;
 const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
 const p = x.getImageData(0, 0, w, h).data;
 const col = new Array(w).fill(0); for (let q = 0; q < w * h; q++) if (!isGreen(p, q * 4)) col[q % w]++;
 let split = w / 2, best = 1e9; for (let xx = Math.round(w * .4); xx < w * .6; xx++) if (col[xx] < best) { best = col[xx]; split = xx; }
 const box = (a, b) => { let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; for (let yy = 0; yy < h; yy++) for (let xx = a; xx < b; xx++) if (!isGreen(p, (yy * w + xx) * 4)) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; } return {x0, x1, y0, y1}; };
 const B = {m: box(0, split), w: box(split, w)};
 const out = {};
 for (const g of ['w', 'm']) {
  const b = B[g], o = document.createElement('canvas'); o.width = CR.W; o.height = CR.H; const y = o.getContext('2d');
  const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
  y.drawImage(c, b.x0, b.y0, bw, bh, Math.round(CR.W / 2 - bw / 2), CR.H - 50 - bh, bw, bh);
  const d = y.getImageData(0, 0, CR.W, CR.H), q = d.data;
  /* Hautton angleichen */
  let n = 0; const s = [0, 0, 0], s2 = [0, 0, 0];
  for (let j = 0; j < q.length; j += 4) { if (!q[j + 3] || isGreen(q, j)) continue; const mx = Math.max(q[j], q[j + 1], q[j + 2]), mn = Math.min(q[j], q[j + 1], q[j + 2]); if (mx < 120 || mx - mn > 60) continue; n++; for (let k = 0; k < 3; k++) { s[k] += q[j + k]; s2[k] += q[j + k] * q[j + k]; } }
  const mean = s.map(v => v / n), sd = s2.map((v, k) => Math.sqrt(v / n - mean[k] * mean[k]));
  for (let j = 0; j < q.length; j += 4) {
   if (!q[j + 3] || isGreen(q, j)) { q[j + 3] = 0; continue; }
   { const kk = q[j + 1] - Math.max(q[j], q[j + 2]); if (kk > 20) q[j + 3] = Math.round(255 * (60 - kk) / 40); } /* weiche Kante */
   const mx = Math.max(q[j], q[j + 1], q[j + 2]), wt = Math.max(0, Math.min(1, (mx - 70) / 60)); if (!wt) continue;
   for (let k = 0; k < 3; k++) { const nv = (q[j + k] - mean[k]) * (SKIN_T.sd[k] / sd[k]) + SKIN_T.mean[k]; q[j + k] = Math.max(0, Math.min(255, q[j + k] * (1 - wt) + nv * wt)); }
  }
  /* Kante: grünen Saum entfärben */
  for (let j = 0; j < q.length; j += 4) if (q[j + 3]) { const m2 = Math.max(q[j], q[j + 2]); if (q[j + 1] > m2 + 6) q[j + 1] = m2 + 6; }
  y.putImageData(d, 0, 0);
  out[g] = o;
 }
 return out;
}
