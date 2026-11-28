/* Avatar Studio: Gesichts-Teile (Augen, Make-up, Münder, Piercings) per KI auf einem vergrößerten Gesichtsausschnitt.
   Danach wird nur übernommen, was sich im Bereich des Teils wirklich geändert hat (weiche Kante), alles andere bleibt Original. */
const FITEMS = [
 {id: 'e_katze', t: 'eyes', n: 'Schlangenaugen', p: 'both irises become yellow-green snake eyes with thin vertical slit pupils'},
 {id: 'e_herz', t: 'eyes', n: 'Herzpupillen', p: 'both pupils become small dark red heart shapes inside soft pink irises'},
 {id: 'e_hetero', t: 'eyes', n: 'Heterochromie', p: 'heterochromia: the iris on the left side of the image becomes icy blue, the iris on the right side becomes bright green'},
 {id: 'e_neon', t: 'eyes', n: 'Neonaugen', p: 'both irises become glowing neon violet with a soft glow'},
 {id: 'e_schleier', t: 'eyes', n: 'Verschleiert', p: 'milky white blind contact lenses covering both irises and pupils'},
 {id: 'mk_tradgoth', t: 'mk', n: 'Tradgoth', p: 'traditional goth makeup: sharp black eyeliner drawn into dramatic pointed wings around both eyes and dark grey shaded eyelids'},
 {id: 'smokey', t: 'mk', n: 'Smokey Eye', p: 'black smoky eye makeup softly blended all around both eyes'},
 {id: 'mk_darkglam', t: 'mk', n: 'Dark Glam', p: 'dark glam eye makeup: deep burgundy and black eyeshadow on both eyelids with sharp winged eyeliner and a little silver glitter'},
 {id: 'mk_pastell', t: 'mk', n: 'Pastell', p: 'pastel goth makeup: soft lilac and pink eyeshadow on both eyelids, thin black winged eyeliner and light pink blush on both cheeks'},
 {id: 'mk_grunge', t: 'mk', n: 'Grunge', p: 'grunge makeup: messy smudged black eyeliner all around both eyes, smudged under the eyes'},
 {id: 'l_schwarz', t: 'mouth', n: 'Schwarze Lippen', p: 'matte black lipstick on the lips, same lip shape'},
 {id: 'l_fang', t: 'mouth', n: 'Kleine Reißzähne', p: 'lips slightly parted showing two small pointed white vampire fangs'},
 {id: 'l_leicht', t: 'mouth', n: 'Leicht geöffnet', p: 'lips slightly parted, showing a little of the white upper teeth'},
 {id: 'l_frech', t: 'mouth', n: 'Frech', p: 'a cheeky closed-mouth smirk with one corner of the mouth raised'},
 {id: 'l_zunge', t: 'mouth', n: 'Zunge raus', p: 'mouth slightly open with the pink tongue sticking out playfully'},
 {id: 'p_snake', t: 'pierc', z: 'lip', n: 'Snakebites', p: 'two small silver ball stud piercings below the lower lip, one near each corner of the mouth (snakebites)'},
 {id: 'p_septum', t: 'pierc', z: 'nose', n: 'Septum', p: 'a small thin silver septum ring hanging from the middle of the nose'},
 {id: 'p_nase', t: 'pierc', z: 'nose', n: 'Nostril', p: 'a tiny silver stud piercing on the nostril on the left side of the image'},
 {id: 'p_augenbraue', t: 'pierc', z: 'brow', n: 'Eyebrow', p: 'a small silver eyebrow piercing with two small balls at the outer end of the eyebrow on the right side of the image'},
 {id: 'p_bridge', t: 'pierc', z: 'bridge', n: 'Bridge', p: 'a small horizontal silver barbell bridge piercing on the bridge of the nose between the eyes'},
];

/* Ausschnitt um das Gesicht (im 900×1440-Bild) */
function faceBox(g) { const F = FACE[g], hw = F.hr - F.hl, S = Math.round(hw * 1.75), cy = (F.brow + F.mouth[1]) / 2 + hw * .05; return {x: Math.round(F.cx - S / 2), y: Math.round(cy - S / 2), S}; }

/* Bereich je Teil: Liste von Ellipsen [cx, cy, rx, ry] im Bildkoordinatensystem */
function faceZones(g, it) {
 const F = FACE[g], ew = F.ew, [mx, my] = F.mouth, E = F.eyes;
 if (it.t === 'eyes') return E.map(([x, y]) => [x, y, ew * .55, ew * .34]);
 if (it.t === 'mk') { const z = E.map(([x, y]) => [x + (x < F.cx ? -1 : 1) * ew * .12, y - ew * .1, ew * 1.05, ew * .8]); if (it.id === 'mk_pastell') E.forEach(([x, y]) => z.push([x + (x < F.cx ? -1 : 1) * ew * .1, y + ew * 1.0, ew * .6, ew * .45])); return z; }
 if (it.t === 'mouth') return [[mx, my + F.mh * .5, F.mw * .85, F.mh * 2.1]];
 if (it.z === 'lip') return [[mx, my + F.mh * 1.1, F.mw * .75, F.mh * 1.1]];
 if (it.z === 'nose') return [[F.nose[0], F.nose[1] + 2, ew * .55, ew * .4]];
 if (it.z === 'brow') return E.map(([x]) => [x + (x < F.cx ? -1 : 1) * ew * .45, F.brow, ew * .55, ew * .35]);
 if (it.z === 'bridge') return [[F.cx, (E[0][1] + F.brow) / 2, ew * .45, ew * .35]];
 return [];
}

async function genFace(id, g, base) {
 const it = FITEMS.find(i => i.id === id), B = faceBox(g), OUT = 768;
 const crop = document.createElement('canvas'); crop.width = crop.height = OUT; const cx = crop.getContext('2d');
 cx.fillStyle = '#00ff00'; cx.fillRect(0, 0, OUT, OUT); cx.imageSmoothingQuality = 'high'; cx.drawImage(base, B.x, B.y, B.S, B.S, 0, 0, OUT, OUT);
 const prompt = 'Edit image 1, a close-up of a face of a semi-realistic 3D game character. Keep everything exactly the same: same face, same features, same skin, same lighting, same rendering style, same framing, bald head, plain green background. Only change this: ' + it.p + '. Do not change anything else.';
 let res, err;
 for (let i = 0; i < 3; i++) { const r = await fetch('/api/gen', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({model: 'klein', seed: 4711 + i * 1000, w: OUT, h: OUT, refs: [crop.toDataURL('image/jpeg', .95)], prompt})});
  const j = await r.json().catch(() => ({})); if (j.image) { res = 'data:image/jpeg;base64,' + j.image; break; } err = j; if (j.error === 'quota' || !/3030|flagged/.test(j.detail || '')) break; }
 if (!res) throw err || {msg: 'Fehler'};
 return {raw: res, layer: await faceLayer(g, it, base, res)};
}

/* Nur Geändertes im Bereich übernehmen; Ergebnis ist eine Ebene in Größe des Ausschnitts (Lage = faceBox) */
async function faceLayer(g, it, base, src) {
 const B = faceBox(g), im = await ld(src), S = B.S;
 const a = document.createElement('canvas'); a.width = a.height = S; const ax = a.getContext('2d'); ax.drawImage(base, B.x, B.y, S, S, 0, 0, S, S);
 const b = document.createElement('canvas'); b.width = b.height = S; const bx = b.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(im, 0, 0, S, S);
 const pa = ax.getImageData(0, 0, S, S).data, B2 = bx.getImageData(0, 0, S, S), pb = B2.data, Z = faceZones(g, it);
 let m = new Float32Array(S * S);
 const thr = it.t === 'pierc' ? [22, 30] : it.t === 'eyes' ? [14, 22] : [12, 24];
 for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const q = y * S + x, j = q * 4, X = x + B.x, Y = y + B.y;
  let z = 0; for (const [zx, zy, rx, ry] of Z) { const dd = Math.hypot((X - zx) / rx, (Y - zy) / ry); z = Math.max(z, clamp((1 - dd) / .3, 0, 1)); } if (!z) continue;
  const d = Math.hypot(pa[j] - pb[j], pa[j + 1] - pb[j + 1], pa[j + 2] - pb[j + 2]); m[q] = z * clamp((d - thr[0]) / thr[1], 0, 1); }
 /* Maske etwas erweitern und weich machen */
 for (let pass = 0; pass < 2; pass++) { const n = new Float32Array(S * S); for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) { const q = y * S + x; let mx = 0, s = 0;
  for (const o of [-S - 1, -S, -S + 1, -1, 0, 1, S - 1, S, S + 1]) { const v = m[q + o]; s += v; if (v > mx) mx = v; } n[q] = pass === 0 ? mx : s / 9; } m = n; }
 /* Zonenrand bleibt weich */
 for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const q = y * S + x, X = x + B.x, Y = y + B.y; let z = 0; for (const [zx, zy, rx, ry] of Z) z = Math.max(z, clamp((1 - Math.hypot((X - zx) / rx, (Y - zy) / ry)) / .3, 0, 1)); m[q] *= z; pb[q * 4 + 3] = Math.round(255 * m[q]); }
 bx.putImageData(B2, 0, 0); return b.toDataURL('image/png');
}
