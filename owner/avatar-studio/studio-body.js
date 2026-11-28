/* Avatar Studio ohne KI: Körper auslesen, Kleidung, Augen, Make-up, Lippen und Haare im Browser zeichnen.
   Alles wird auf Grundlage der Figur berechnet: Umriss aus dem Bild, Licht und Schatten aus der Haut darunter. */

/* Gesicht, von Hand an den Figuren gemessen (Koordinaten im 900×1440-Bild) */
const FACE = {
 w: {cx: 445, top: 110, hl: 399, hr: 492, brow: 176, eyes: [[421, 192], [472.5, 192]], ir: 5.5, ew: 31, nose: [446, 217], mouth: [446, 232], mw: 29, mh: 10, ear: [177, 212]},
 m: {cx: 455, top: 57, hl: 406, hr: 504, brow: 126, eyes: [[434.5, 140], [479.5, 140]], ir: 4.6, ew: 28, nose: [456, 169], mouth: [455.5, 184], mw: 30, mh: 9, ear: [128, 162]},
};

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const mix = (a, b, t) => a + (b - a) * t;
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/* ---------- Körper auslesen ---------- */
function analyze(c, g) {
 const W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data;
 const A = new Uint8Array(W * H); for (let q = 0; q < W * H; q++) A[q] = d[q * 4 + 3] > 110 ? 1 : 0;
 const runs = []; let top = -1, bot = -1;
 for (let y = 0; y < H; y++) { const r = []; let s = -1;
  for (let x = 0; x <= W; x++) { const on = x < W && A[y * W + x]; if (on && s < 0) s = x; if (!on && s >= 0) { if (r.length && s - r[r.length - 1][1] < 4) r[r.length - 1][1] = x - 1; else r.push([s, x - 1]); s = -1; } }
  runs.push(r); if (r.length) { if (top < 0) top = y; bot = y; } }
 const FH = bot - top, F = FACE[g], cx = F.cx;
 const wid = y => runs[y].reduce((a, r) => a + r[1] - r[0] + 1, 0);
 /* Hals = schmalste Stelle unter dem Kinn */
 let neck = top + Math.round(.1 * FH), nw = 1e9; for (let y = F.mouth[1] + 10; y < top + .17 * FH; y++) { const r = runs[y].find(r => r[0] <= cx && r[1] >= cx); if (r && r[1] - r[0] < nw) { nw = r[1] - r[0]; neck = y; } }
 /* Schritt = erste Zeile unter der Hüfte, in der die Mitte leer ist */
 let crotch = top + Math.round(.466 * FH); for (let y = top + Math.round(.43 * FH); y < top + .5 * FH; y++) if (!A[y * W + Math.round(cx)] && !A[y * W + Math.round(cx) + 3] && !A[y * W + Math.round(cx) - 3]) { crotch = y; break; }
 /* Arme verfolgen: von der Stelle, an der sie sich vom Rumpf lösen, nach oben und unten */
 const arm = {L: new Array(H).fill(null), R: new Array(H).fill(null)};
 let sep = -1; for (let y = neck + 20; y < crotch; y++) if (runs[y].length >= 3) { sep = y; break; }
 let shoulder0 = neck + 20; for (let y = neck; y < (sep > 0 ? sep : crotch); y++) if (wid(y) > nw * 2.6) { shoulder0 = y; break; } /* Arme nur bis zur Schulter verfolgen */
 if (sep > 0) {
  for (const side of ['L', 'R']) {
   let last = null; const pick = r => side === 'L' ? r[0] : r[r.length - 1];
   for (let y = sep; y < bot; y++) { const r = runs[y]; if (!r.length) break;
    let a = pick(r);
    if (last && r.length < 3 && y > crotch - 10) { /* Hand berührt Bein: Breite vom letzten Stück übernehmen */
     const wdt = last[1] - last[0]; a = side === 'L' ? [r[0][0], r[0][0] + wdt] : [r[r.length - 1][1] - wdt, r[r.length - 1][1]]; }
    if (last && (Math.abs(a[0] - last[0]) > 25 && Math.abs(a[1] - last[1]) > 25)) break;
    arm[side][y] = a; last = a; }
   /* nach oben bis zur Schulter: Außenkante fortsetzen, Innenkante bis Rumpf */
   for (let y = sep - 1; y > shoulder0; y--) { const r = runs[y]; if (!r.length) break; const o = side === 'L' ? r[0][0] : r[r.length - 1][1], nx = arm[side][y + 1];
    if (!nx) break; const wdt = nx[1] - nx[0]; arm[side][y] = side === 'L' ? [o, o + wdt] : [o - wdt, o]; }
  }
 }
 let armEnd = sep; for (let y = sep; y < bot; y++) if (arm.L[y] || arm.R[y]) armEnd = y;
 /* Schulterlinie: erste Zeile unter dem Hals, die doppelt so breit wie der Hals ist */
 let shoulder = neck + 20; for (let y = neck; y < sep; y++) if (wid(y) > nw * 2.6) { shoulder = y; break; }
 return {W, H, A, runs, top, bot, FH, cx, neck, nw, crotch, sep, arm, armEnd, shoulder, d};
}

/* Licht und Schatten: Helligkeit der Haut, unter vorhandener Kleidung aus der Umgebung aufgefüllt */
function shadeMap(an) {
 const {W, H, d, A} = an, L = new Float32Array(W * H), Wt = new Float32Array(W * H);
 for (let q = 0, j = 0; q < W * H; q++, j += 4) { const l = .3 * d[j] + .59 * d[j + 1] + .11 * d[j + 2]; L[q] = l; Wt[q] = A[q] && l > 95 ? 1 : 0; }
 const blur = (src, r) => { const t = new Float32Array(W * H), o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * W + clamp(x, 0, W - 1)]; for (let x = 0; x < W; x++) { t[y * W + x] = s; s += src[y * W + clamp(x + r + 1, 0, W - 1)] - src[y * W + clamp(x - r, 0, W - 1)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[clamp(y, 0, H - 1) * W + x]; for (let y = 0; y < H; y++) { o[y * W + x] = s; s += t[clamp(y + r + 1, 0, H - 1) * W + x] - t[clamp(y - r, 0, H - 1) * W + x]; } }
  return o; };
 const LW = new Float32Array(W * H); for (let q = 0; q < W * H; q++) LW[q] = L[q] * Wt[q];
 const a1 = blur(LW, 2), b1 = blur(Wt, 2), a2 = blur(LW, 14), b2 = blur(Wt, 14);
 let sum = 0, n = 0; for (let q = 0; q < W * H; q++) if (Wt[q]) { sum += L[q]; n++; } const ref = sum / n * 1.08;
 const S = new Float32Array(W * H);
 for (let q = 0; q < W * H; q++) { if (!A[q]) continue; const v = b1[q] > 4 ? a1[q] / b1[q] : b2[q] > 1 ? a2[q] / b2[q] : ref; S[q] = clamp(v / ref, .35, 1.25); }
 return S;
}

/* ---------- Kleidung ---------- */
/* Maske je Teil: Funktion (x, y) -> 0..1 */
function garmentMask(an, kind) {
 const {W, H, A, runs, top, FH, neck, crotch, arm, shoulder, bot} = an, M = new Float32Array(W * H);
 const inArm = (y, x) => (arm.L[y] && x >= arm.L[y][0] - 1 && x <= arm.L[y][1] + 1) || (arm.R[y] && x >= arm.R[y][0] - 1 && x <= arm.R[y][1] + 1);
 const set = (y, x0, x1, v = 1) => { for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) if (A[y * W + x]) M[y * W + x] = Math.max(M[y * W + x], v); };
 if (kind === 'top') { /* Langarmshirt: Rundhals, Saum über der Hüfte, Ärmel bis zum Handgelenk */
  const hem = crotch - Math.round(.085 * FH), wrist = an.armEnd - Math.round(.055 * FH), nk = shoulder - Math.round(.012 * FH);
  for (let y = neck; y <= wrist; y++) for (const r of runs[y]) for (let x = r[0]; x <= r[1]; x++) {
   if (y <= hem) { const dx = (x - an.cx) / (an.nw * 1.25); const curve = nk + Math.max(0, 1 - dx * dx) * .02 * FH; if (y < curve && !inArm(y, x)) continue; M[y * W + x] = 1; }
   else if (inArm(y, x)) M[y * W + x] = 1; }
 }
 if (kind === 'pants' || kind === 'tights') { /* von der Taille bis zum Knöchel bzw. inkl. Füße */
  const waist = crotch - Math.round((kind === 'pants' ? .075 : .085) * FH), end = kind === 'pants' ? bot - Math.round(.045 * FH) : bot;
  for (let y = waist; y <= end; y++) for (const r of runs[y]) for (let x = r[0]; x <= r[1]; x++) if (!inArm(y, x)) M[y * W + x] = 1;
 }
 /* Kante weich */
 const O = new Float32Array(M); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const q = y * W + x; O[q] = (M[q] * 4 + M[q - 1] + M[q + 1] + M[q - W] + M[q + W]) / 8; }
 return O;
}

function renderGarment(ctx, an, S, kind, opt) {
 const {W, H} = an, M = garmentMask(an, kind), img = ctx.getImageData(0, 0, W, H), p = img.data, c = hex(opt.color);
 const dark = (c[0] + c[1] + c[2]) / 3 < 60, seed = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
 for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const q = y * W + x, m = M[q]; if (!m) continue; const j = q * 4, s = S[q];
  let a = m, col; const er = an.runs[y].find(r => x >= r[0] && x <= r[1]); const edge = er ? clamp(Math.min(x - er[0], er[1] - x) / 9, 0, 1) : 1; const s2 = s * (.78 + .22 * edge);
  if (opt.mesh || opt.fishnet) { const per = opt.fishnet ? 9 : 6, u = (x + y) % per, v = (x - y + 3000) % per, line = Math.min(u, per - u, v, per - v); const k = clamp(1.6 - line, 0, 1) * (opt.fishnet ? 1 : .85); a = m * k; if (opt.mesh) a = Math.max(a, m * .28); }
  if (opt.sheer) a = m * opt.sheer;
  /* Farbe mit Licht der Figur; dunkle Stoffe bekommen Glanzlichter */
  col = c.map(v => v * (dark ? .9 + (s2 - .85) * .9 : s2));
  if (dark) { const hl = Math.max(0, s - .92) * 140; col = col.map(v => v + hl); }
  else { const hl = Math.max(0, s - 1.02) * 80; col = col.map(v => v + hl); }
  if (opt.denim) { const n = (seed(x, y) - .5) * 18 + (((x + y * 2) % 4) < 1 ? -8 : 0); col = col.map(v => v + n); }
  for (let k = 0; k < 3; k++) p[j + k] = mix(p[j + k], clamp(col[k], 0, 255), a);
 }
 ctx.putImageData(img, 0, 0);
 /* Nähte und Details als Linien */
 if (kind === 'pants') { const {crotch, FH, runs, arm} = an, waist = crotch - Math.round(.075 * FH);
  ctx.save(); ctx.globalAlpha = .55; ctx.strokeStyle = opt.stitch || '#c9a25a'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
  /* Bund */ const r0 = runs[waist + 8].filter(r => r[1] - r[0] > 40)[0]; if (r0) { ctx.beginPath(); ctx.moveTo(r0[0] + 3, waist + 9); ctx.lineTo(r0[1] - 3, waist + 9); ctx.stroke();
   /* Taschen */ ctx.beginPath(); ctx.moveTo(r0[0] + 4, waist + 14); ctx.quadraticCurveTo(r0[0] + 22, waist + 18, r0[0] + 26, waist + 40); ctx.moveTo(r0[1] - 4, waist + 14); ctx.quadraticCurveTo(r0[1] - 22, waist + 18, r0[1] - 26, waist + 40); ctx.stroke(); }
  /* Außennähte an jedem Bein */
  ctx.beginPath(); for (let y = crotch + 5; y < an.bot - .05 * FH; y += 3) { const legs = runs[y].filter(r => !(arm.L[y] && r[0] <= arm.L[y][1] && r[1] >= arm.L[y][0]) && !(arm.R[y] && r[0] <= arm.R[y][1] && r[1] >= arm.R[y][0])); if (legs.length >= 2) { ctx.moveTo(legs[0][0] + 3, y); ctx.lineTo(legs[0][0] + 3, y + 2); ctx.moveTo(legs[legs.length - 1][1] - 3, y); ctx.lineTo(legs[legs.length - 1][1] - 3, y + 2); } } ctx.stroke();
  ctx.restore();
 }
}

/* ---------- Gesicht: Augen, Make-up, Lippen ---------- */
function recolorEyes(ctx, g, opt) {
 const F = FACE[g], r = F.ir * 1.08, c = hex(opt.color || '#888888');
 const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height), p = img.data, W = ctx.canvas.width;
 for (const [ex, ey] of F.eyes) for (let y = Math.floor(ey - r - 2); y <= ey + r + 2; y++) for (let x = Math.floor(ex - r - 2); x <= ex + r + 2; x++) {
  const dd = Math.hypot(x - ex, (y - ey) * 1.05) / r; if (dd > 1.05) continue; const j = (y * W + x) * 4, l = .3 * p[j] + .59 * p[j + 1] + .11 * p[j + 2];
  const edge = clamp((1.05 - dd) / .2, 0, 1);
  if (opt.white) { const pupil = dd < .3 ? .2 : 0; const v = mix(235, 120, pupil); for (let k = 0; k < 3; k++) p[j + k] = mix(p[j + k], v * (l > 200 ? 1 : .92), edge * .9); continue; }
  if (l > 185) continue; /* Glanzpunkt bleibt */
  const slit = opt.cat ? Math.abs(x - ex) < r * .16 && Math.abs(y - ey) < r * .85 : dd < .33;
  const base = slit ? .12 : clamp(.55 + (1 - dd) * .7, .5, 1.2);
  for (let k = 0; k < 3; k++) p[j + k] = mix(p[j + k], clamp(c[k] * base, 0, 255), edge * (slit ? .95 : .85));
 }
 ctx.putImageData(img, 0, 0);
}

function makeup(ctx, g, kind) {
 if (!kind) return; const F = FACE[g], ew = F.ew;
 ctx.save();
 for (const [i, [ex, ey]] of F.eyes.entries()) { const dir = i === 0 ? -1 : 1; /* außen */
  if (kind === 'smokey' || kind === 'emo' || kind === 'pastell') {
   const col = kind === 'pastell' ? 'rgba(150,110,200,' : kind === 'emo' ? 'rgba(120,10,30,' : 'rgba(15,10,18,';
   ctx.globalCompositeOperation = 'multiply';
   ctx.save(); ctx.translate(ex + dir * ew * .12, ey - ew * .1); ctx.scale(1, .62);
   const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, ew * .8);
   gr.addColorStop(0, col + (kind === 'pastell' ? '.5)' : '.8)')); gr.addColorStop(.5, col + '.4)'); gr.addColorStop(1, col + '0)');
   ctx.fillStyle = gr; ctx.fillRect(-ew, -ew, 2 * ew, 2 * ew); ctx.restore();
   if (kind === 'emo') { ctx.save(); ctx.translate(ex, ey + ew * .24); ctx.scale(1, .45); const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, ew * .5); g2.addColorStop(0, 'rgba(10,5,10,.45)'); g2.addColorStop(1, 'rgba(10,5,10,0)'); ctx.fillStyle = g2; ctx.fillRect(-ew, -ew, 2 * ew, 2 * ew); ctx.restore(); }
  }
  if (kind === 'winged' || kind === 'smokey' || kind === 'emo') { /* Lidstrich mit Flügel */
   ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(8,6,10,.92)';
   const x0 = ex - dir * ew * .5, x1 = ex + dir * ew * .55, yl = ey - F.ir * .9;
   ctx.beginPath(); ctx.moveTo(x0, yl + 1.2); ctx.quadraticCurveTo(ex, yl - F.ir * .55, x1, yl + .5);
   ctx.lineTo(x1 + dir * ew * (kind === 'winged' ? .42 : .3), yl - ew * (kind === 'winged' ? .32 : .2));
   ctx.lineTo(x1 - dir * 1.5, yl + 2.6); ctx.quadraticCurveTo(ex, yl + .3, x0, yl + 2.2); ctx.closePath(); ctx.fill();
  }
 }
 if (kind === 'blush' || kind === 'pastell') { ctx.globalCompositeOperation = 'multiply';
  for (const [ex, ey] of F.eyes) { const bx = ex + (ex < F.cx ? -1 : 1) * ew * .15, by = ey + ew * .9; const gr = ctx.createRadialGradient(bx, by, 1, bx, by, ew * .7); gr.addColorStop(0, 'rgba(230,120,150,.5)'); gr.addColorStop(1, 'rgba(230,120,150,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(bx, by, ew * .7, 0, 7); ctx.fill(); } }
 ctx.restore();
}

function lipColor(ctx, g, color, gloss) {
 if (!color) return; const F = FACE[g], c = hex(color), [mx, my] = F.mouth, W = ctx.canvas.width;
 const img = ctx.getImageData(0, 0, W, ctx.canvas.height), p = img.data;
 /* Lippen = rötlichere/dunklere Pixel in einer Ellipse um den Mund */
 let sl = 0, n = 0; for (let y = my - F.mh; y <= my + F.mh; y++) for (let x = mx - F.mw * .6; x <= mx + F.mw * .6; x++) { const j = (Math.round(y) * W + Math.round(x)) * 4; sl += .3 * p[j] + .59 * p[j + 1] + .11 * p[j + 2]; n++; }
 const avg = sl / n;
 for (let y = Math.floor(my - F.mh * 1.1); y <= my + F.mh * 1.1; y++) for (let x = Math.floor(mx - F.mw * .62); x <= mx + F.mw * .62; x++) {
  const e = Math.hypot((x - mx) / (F.mw * .56), (y - my) / (F.mh * .95)); if (e > 1.1) continue; const j = (y * W + x) * 4;
  const red = p[j] - (p[j + 1] + p[j + 2]) / 2, l = .3 * p[j] + .59 * p[j + 1] + .11 * p[j + 2];
  const lipness = clamp((red - 14) / 18, 0, 1) * clamp((1.1 - e) / .25, 0, 1); if (!lipness) continue;
  const sh = clamp(l / avg, .4, 1.4); for (let k = 0; k < 3; k++) { let v = c[k] * sh; if (gloss && l > avg * 1.08) v += (l - avg) * 1.4; p[j + k] = mix(p[j + k], clamp(v, 0, 255), lipness * .9); }
 }
 ctx.putImageData(img, 0, 0);
}
