/* Owner-Avatar-Studio (Kern): Grundfigur, Ebenen aus KI-Bildern, Frisuren-Blatt, ZIP. Aus der lokalen Werkstatt übernommen.
   Nutzt craft-prep.js (Standardfiguren), craft.js (FACE, analyze, Hilfsfunktionen), craft-face.js (faceBox, faceZones, faceLayer),
   craft-hair.js nicht. KI läuft nur über den Worker (/api/gen), kein Schlüssel im Browser. */
const WS = {W: 900, H: 1440};
const CATS = [
 {k: 'hair', n: 'Haare', z: 95, ex: 'lange glatte schwarze Haare mit geradem Pony'},
 {k: 'hat', n: 'Kopfbedeckung', z: 97, ex: 'schwarzer Spitzen-Haarreif mit Schleife', band: [0, .08]},
 {k: 'eyes', n: 'Augen', z: 87, face: 'eyes', ex: 'rote Schlangenaugen mit schmalen Pupillen'},
 {k: 'mk', n: 'Make-up', z: 86, face: 'mk', ex: 'schwarzer Smokey Eye mit Flügel-Eyeliner'},
 {k: 'mouth', n: 'Mund', z: 88, face: 'mouth', ex: 'schwarze matte Lippen'},
 {k: 'pierc', n: 'Piercing', z: 89, face: 'pierc', ex: 'zwei silberne Snakebites unter der Unterlippe'},
 {k: 'tattoo', n: 'Tattoo', z: 5, band: [.1, 1], ex: 'schwarzes Fledermaus-Tattoo auf dem Unterarm'},
 {k: 'legw', n: 'Strümpfe', z: 10, band: [.4, 1], ex: 'zerrissene schwarze Netzstrumpfhose'},
 {k: 'pants', n: 'Hose', z: 30, band: [.38, 1], ex: 'schwarze Skinny Jeans mit Kette', ex2: ['skirt', 'dress']},
 {k: 'skirt', n: 'Rock', z: 31, band: [.38, .72], ex: 'rot-schwarzer Karo-Faltenrock', ex2: ['pants', 'dress']},
 {k: 'shoes', n: 'Schuhe', z: 40, band: [.86, 1], ex: 'schwarze Plateau-Stiefel mit Schnallen'},
 {k: 'top', n: 'Oberteil', z: 50, band: [.115, .5], ex: 'schwarzes Netz-Langarmshirt', ex2: ['dress']},
 {k: 'dress', n: 'Kleid', z: 55, band: [.115, .8], ex: 'schwarzes Korsettkleid mit Spitze', ex2: ['top', 'pants', 'skirt']},
 {k: 'jacket', n: 'Jacke', z: 60, band: [.115, .58], ex: 'enge schwarze Nieten-Lederjacke'},
 {k: 'acc', n: 'Accessoire', z: 70, band: [.1, .9], ex: 'schwarz-weißer Nietengürtel mit Kette'},
 {k: 'jewel', n: 'Schmuck', z: 75, band: [.06, .4], ex: 'Silberkette mit gotischem Kreuz'},
];
const STYLES = ['Goth', 'Emo', 'Scene', 'Punk', 'Metal', 'Y2K', 'Visual Kei', 'Grunge', 'Pastel Goth', 'Cybergoth'];
const PIERC_AT = [['lip', 'Lippe'], ['nose', 'Nase'], ['brow', 'Augenbraue'], ['bridge', 'Nasenrücken']];
const catOf = k => CATS.find(c => c.k === k);

/* ---------- Speicher (IndexedDB) ---------- */
const wsDb = new Promise(res => { const r = indexedDB.open('nf-werkstatt', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
const kvGet = async k => { const db = await wsDb; if (!db) return null; return new Promise(r => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => r(q.result ?? null); q.onerror = () => r(null); }); };
const kvPut = async (k, v) => { const db = await wsDb; if (!db) return; return new Promise(r => { const t = db.transaction('kv', 'readwrite'); v === undefined ? t.objectStore('kv').delete(k) : t.objectStore('kv').put(v, k); t.oncomplete = r; t.onerror = r; }); };
const toCanvas = async src => { const i = await ld(src), c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); return c; };

/* ---------- Grundfigur ---------- */
/* Hochgeladenes Bild auf 900×1440 bringen und freistellen (Grün, echte Transparenz oder Eckfarbe) */
async function wsImportBase(file) {
 const url = URL.createObjectURL(file), im = await ld(url); URL.revokeObjectURL(url);
 const c = document.createElement('canvas'); c.width = WS.W; c.height = WS.H; const x = c.getContext('2d');
 const s = Math.min((WS.H - 80) / im.height, (WS.W - 40) / im.width); x.drawImage(im, (WS.W - im.width * s) / 2, WS.H - 40 - im.height * s, im.width * s, im.height * s);
 const d = x.getImageData(0, 0, WS.W, WS.H), p = d.data, W = WS.W, H = WS.H;
 const corner = [[5, 5], [W - 6, 5], [5, H - 6], [W - 6, H - 6]].map(([a, b]) => (b * W + a) * 4);
 const greenBg = corner.filter(j => p[j + 3] > 200 && p[j + 1] - Math.max(p[j], p[j + 2]) > 60).length >= 2;
 if (greenBg) { for (let j = 0; j < p.length; j += 4) { const k = p[j + 1] - Math.max(p[j], p[j + 2]); if (k > 60) p[j + 3] = 0; else if (k > 20) { p[j + 3] = Math.round(p[j + 3] * (60 - k) / 40); p[j + 1] = Math.max(p[j], p[j + 2]); } } }
 else if (corner.some(j => p[j + 3] > 200)) { /* Eckfarbe vom Rand aus wegfüllen */
  const bg = [0, 1, 2].map(k => corner.reduce((a, j) => a + p[j + k], 0) / 4), seen = new Uint8Array(W * H), st = [];
  for (let xx = 0; xx < W; xx++) st.push(xx, (H - 1) * W + xx); for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  while (st.length) { const q = st.pop(); if (seen[q]) continue; seen[q] = 1; const j = q * 4; if (p[j + 3] && Math.hypot(p[j] - bg[0], p[j + 1] - bg[1], p[j + 2] - bg[2]) > 40) continue; p[j + 3] = 0;
   const qx = q % W; if (qx > 0) st.push(q - 1); if (qx < W - 1) st.push(q + 1); if (q >= W) st.push(q - W); if (q < W * (H - 1)) st.push(q + W); } }
 x.putImageData(d, 0, 0); return c;
}
/* Gesicht aus drei Punkten (linkes Auge, rechtes Auge, Mund) ableiten */
function faceFrom(c, eL, eR, m) {
 const W = c.width, a = c.getContext('2d').getImageData(0, 0, W, c.height).data, ed = Math.hypot(eR[0] - eL[0], eR[1] - eL[1]), cx = (eL[0] + eR[0]) / 2, ey = (eL[1] + eR[1]) / 2;
 let top = 0; for (let y = 0; y < ey; y++) if (a[(y * W + Math.round(cx)) * 4 + 3] > 120) { top = y; break; }
 const row = Math.round(ey - ed * .35); let hl = cx, hr = cx; while (hl > 0 && a[(row * W + Math.round(hl)) * 4 + 3] > 100) hl--; while (hr < W - 1 && a[(row * W + Math.round(hr)) * 4 + 3] > 100) hr++;
 return {cx, top, hl, hr, brow: ey - ed * .33, eyes: [eL, eR], ir: ed * .11, ew: ed * .6, nose: [cx, (ey + m[1]) / 2 + ed * .08], mouth: m, mw: ed * .62, mh: ed * .2, ear: [ey - ed * .3, ey + ed * .35]};
}

/* ---------- Ebenen aus KI-Bildern ---------- */
/* Körper-Teile: was sich im Bereich der Kategorie gegenüber der Grundfigur geändert hat; Gesichtskern bleibt frei */
async function bodyLayer(base, genSrc, cat, g) {
 const W = WS.W, H = WS.H, b = await toCanvas(genSrc), B = document.createElement('canvas'); B.width = W; B.height = H; const bx = B.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(b, 0, 0, W, H);
 const pa = base.getContext('2d').getImageData(0, 0, W, H).data, D = bx.getImageData(0, 0, W, H), pb = D.data, F = FACE[g];
 let y0 = 0, y1 = H - 1; for (let y = 0; y < H; y++) { let on = false; for (let x = 0; x < W; x += 3) if (pa[(y * W + x) * 4 + 3] > 120) { on = true; break; } if (on) { y0 = y; break; } }
 for (let y = H - 1; y > 0; y--) { let on = false; for (let x = 0; x < W; x += 3) if (pa[(y * W + x) * 4 + 3] > 120) { on = true; break; } if (on) { y1 = y; break; } }
 const FH = y1 - y0, band = cat.k === 'hair' ? [0, .62] : (cat.band || [0, 1]), top = y0 + band[0] * FH, bot = y0 + band[1] * FH, soft = .015 * FH;
 let m = new Float32Array(W * H);
 for (let y = 0; y < H; y++) { const t = Math.min(1, Math.max(0, (y - top + soft) / soft), Math.max(0, (bot + soft - y) / soft)); if (!t) continue;
  for (let x = 0; x < W; x++) { const q = y * W + x, j = q * 4; if (pb[j + 1] - Math.max(pb[j], pb[j + 2]) > 60) continue;
   const d = pa[j + 3] < 30 ? 255 : Math.hypot(pa[j] - pb[j], pa[j + 1] - pb[j + 1], pa[j + 2] - pb[j + 2]); let v = t * clamp((d - 28) / 32, 0, 1);
   /* Gesichtskern (Augen bis Kinn) schützen, außer Haare dürfen über Stirn und Augen fallen */
   if (F) { const e = Math.hypot((x - F.cx) / (F.ew * 1.7), (y - (F.mouth[1] + F.nose[1]) / 2) / (F.ew * (cat.k === 'hair' ? .9 : 1.6))); if (e < 1) v *= clamp((e - .75) / .25, 0, 1); }
   m[q] = v; } }
 for (let pass = 0; pass < 3; pass++) { const n = new Float32Array(W * H); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const q = y * W + x; let mn = 1, mx = 0, s = 0; for (const o of [-W - 1, -W, -W + 1, -1, 0, 1, W - 1, W, W + 1]) { const v = m[q + o]; s += v; if (v < mn) mn = v; if (v > mx) mx = v; } n[q] = pass === 0 ? mn : pass === 1 ? mx : s / 9; } m = n; }
 for (let q = 0; q < W * H; q++) { pb[q * 4 + 3] = Math.round(255 * m[q]); const j = q * 4, mm = Math.max(pb[j], pb[j + 2]); if (pb[j + 1] > mm) pb[j + 1] = mm; }
 bx.putImageData(D, 0, 0); return B.toDataURL('image/png');
}
/* Gesichts-Teile: Ebene im Ausschnitt -> auf volle Größe setzen */
async function faceLayerFull(base, src, cat, g, at) {
 const it = {id: 'x', t: cat.face, z: at}, crop = await faceLayer(g, it, base, src), B = faceBox(g), o = document.createElement('canvas'); o.width = WS.W; o.height = WS.H;
 o.getContext('2d').drawImage(await ld(crop), B.x, B.y, B.S, B.S); return o.toDataURL('image/png');
}

/* ---------- KI ---------- */
/* Anbieter und Modell wählt die Seite (AV.provider, AV.model). Auf noctibat.com über die Cloud Function avGen (Owner-Prüfung auf dem Server),
   lokal (localhost:8787) über den Test-Worker /api/gen. */
const AV = {provider: 'cloudflare', model: 'flux-2-klein-4b', local: /^localhost$|^127\./.test(location.hostname)}; AV.api = location.port === '8787' ? '' : 'http://localhost:8787';
async function wsApi(body) {
 if (AV.local) { const r = await fetch(AV.api + '/api/gen', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({...body, model: 'klein'})});
  const j = await r.json().catch(() => ({error: 'net', msg: 'Keine Antwort vom Worker.'})); if (j.usage && window.wsUsage) wsUsage(j.usage); if (!r.ok || !j.image) throw j;
  return (j.image.startsWith('iVBOR') ? 'data:image/png;base64,' : 'data:image/jpeg;base64,') + j.image; }
 const r = await avCall('avGen', {provider: AV.provider, model: AV.model, prompt: body.prompt, images: body.refs || [], w: body.w, h: body.h, seed: body.seed});
 if (r.error) throw {error: r.error, msg: r.msg || 'Fehler bei der KI.', detail: r.error === 'aborted' ? '3030 flagged' : ''};
 return 'data:' + r.result.mime + ';base64,' + r.result.image;
}
async function wsGen(g, base, catK, text, at) {
 const cat = catOf(catK), onGreen = (src, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#00ff00'; x.fillRect(0, 0, w, h); x.drawImage(src, 0, 0, w, h); return c; };
 const retry = async body => { for (let i = 0; ; i++) { try { return await wsApi({...body, seed: 4711 + i * 1000 + Math.floor(Math.random() * 500)}); } catch (e) { if (i >= 2 || !/3030|flagged/.test(e.detail || '')) throw e; } } };
 if (cat.face) {
  const Bx = faceBox(g), OUT = 768, cr = document.createElement('canvas'); cr.width = cr.height = OUT; const cx = cr.getContext('2d'); cx.fillStyle = '#00ff00'; cx.fillRect(0, 0, OUT, OUT); cx.drawImage(base, Bx.x, Bx.y, Bx.S, Bx.S, 0, 0, OUT, OUT);
  const raw = await retry({model: 'klein', w: OUT, h: OUT, refs: [cr.toDataURL('image/jpeg', .95)], prompt: 'Edit image 1, a close-up of the face of a semi-realistic glossy 3D game character. Keep everything exactly the same: same face, features, skin, lighting, rendering style, framing, plain green background. Only add or change this (' + cat.n + '): ' + text + '. Do not change anything else.'});
  return {raw, layer: await faceLayerFull(base, raw, cat, g, at)};
 }
 const ref = onGreen(base, 640, 1024).toDataURL('image/jpeg', .92);
 const what = cat.k === 'hair' ? 'Add this hairstyle to the bald head, natural hairline, hair in the same semi-realistic glossy rendering style: ' + text : cat.k === 'tattoo' ? 'Add this tattoo on the skin: ' + text : 'Add this item to the person, tailored and fitted to the body (' + cat.n + '): ' + text;
 const raw = await retry({model: 'klein', w: 640, h: 1024, refs: [ref], prompt: 'Edit image 1. ' + what + '. Keep everything else exactly the same: same person, same face, same body shape, same pose, same skin tone, the rest of the outfit unchanged, same framing and size, plain flat chroma key green background.'});
 return {raw, layer: await bodyLayer(base, raw, cat, g)};
}

/* Frisuren-Blatt: Karo/Hintergrund heraus, Komponenten, Gesichtsloch -> Augenhöhe und Gesichtsbreite */
async function importWigs(file) {
 const url = URL.createObjectURL(file), im = await ld(url); URL.revokeObjectURL(url); const W = im.width, H = im.height, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
 const p = x.getImageData(0, 0, W, H).data, L = q => .3 * p[q * 4] + .59 * p[q * 4 + 1] + .11 * p[q * 4 + 2], A = new Float32Array(W * H);
 const transp = p[3] < 250; for (let q = 0; q < W * H; q++) A[q] = transp ? p[q * 4 + 3] / 255 : clamp((188 - L(q)) / 95, 0, 1);
 const lab = new Int32Array(W * H).fill(-1), comps = [];
 for (let s = 0; s < W * H; s++) { if (lab[s] >= 0 || A[s] < .3) continue; const st = [s]; lab[s] = comps.length; let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  while (st.length) { const q = st.pop(); n++; const qx = q % W, qy = (q / W) | 0; if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
   for (const o of [-1, 1, -W, W]) { const r = q + o; if (r >= 0 && r < W * H && lab[r] < 0 && A[r] >= .3 && Math.abs((r % W) - qx) <= 1) { lab[r] = comps.length; st.push(r); } } }
  comps.push({n, x0, x1, y0, y1, i: comps.length}); }
 const big = comps.filter(b => b.n > 2500 && b.x1 - b.x0 < W * .3); const g = ST.g, F = FACE[g], hw = F.hr - F.hl, ey = (F.eyes[0][1] + F.eyes[1][1]) / 2; let k = 0;
 for (const b of big) { const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1, o = document.createElement('canvas'); o.width = w; o.height = h; const ox = o.getContext('2d'), od = ox.createImageData(w, h), q = od.data;
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const s = (y + b.y0) * W + xx + b.x0, j = s * 4, kk = (y * w + xx) * 4, a = A[s]; if (a <= 0 || (lab[s] >= 0 && lab[s] !== b.i)) continue;
   for (let ch = 0; ch < 3; ch++) q[kk + ch] = transp ? p[j + ch] : clamp((p[j + ch] - (1 - a) * 225) / Math.max(a, .08), 0, 255); q[kk + 3] = Math.round(255 * a); }
  if (!transp) { const seen = new Uint8Array(w * h), st = [], Ls = i => { const s = ((i / w | 0) + b.y0) * W + (i % w) + b.x0; return L(s); }, sd = i => { if (i >= 0 && i < w * h && !seen[i] && Ls(i) > 105) { seen[i] = 1; st.push(i); } };
   for (let xx = 0; xx < w; xx++) { sd(xx); sd((h - 1) * w + xx); } for (let y = 0; y < h; y++) { sd(y * w); sd(y * w + w - 1); }
   const cxw = Math.round(w / 2); for (let y = Math.round(h * .3); y < h * .7; y++) if (q[(y * w + cxw) * 4 + 3] < 40) { sd(y * w + cxw); break; }
   while (st.length) { const v = st.pop(); q[v * 4 + 3] = 0; const vx = v % w; if (vx > 0) sd(v - 1); if (vx < w - 1) sd(v + 1); sd(v - w); sd(v + w); } }
  ox.putImageData(od, 0, 0);
  const cxw = Math.round(w / 2); let best = {y: -1, wd: 0, l: 0, r: 0};
  for (let y = Math.round(h * .12); y < h * .8; y++) { if (q[(y * w + cxw) * 4 + 3] > 60) continue; let l = cxw, r = cxw; while (l > 0 && q[(y * w + l) * 4 + 3] < 120) l--; while (r < w - 1 && q[(y * w + r) * 4 + 3] < 120) r++; if (l <= 0 || r >= w - 1) continue; if (r - l > best.wd) best = {y, wd: r - l, l, r}; }
  if (best.y < 0 || best.wd < w * .2) continue; const s = hw * .86 / best.wd, full = document.createElement('canvas'); full.width = WS.W; full.height = WS.H;
  full.getContext('2d').drawImage(o, F.cx - (best.l + best.r) / 2 * s, ey - best.y * s, w * s, h * s);
  const it = {id: 'h' + Date.now().toString(36) + k, g, cat: 'hair', name: 'Frisur aus Blatt ' + (++k), text: 'aus Frisuren-Blatt', layer: full.toDataURL('image/png')}; it.thumb = await thumbOf(it); ST.items.push(it); }
 save(); return k;
}


/* ---------- Paket (ZIP ohne Kompression) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) { /* files: [{name, data: Uint8Array}] */
 const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
 for (const f of files) { const nm = enc.encode(f.name), cr = crc32(f.data), h = new DataView(new ArrayBuffer(30));
  h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true); h.setUint32(14, cr, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, nm.length, true);
  parts.push(new Uint8Array(h.buffer), nm, f.data);
  const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, cr, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
  cen.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + f.data.length; }
 const cs = cen.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
 return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], {type: 'application/zip'});
}
const dataBytes = u => { const b = atob(u.split(',')[1]), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
