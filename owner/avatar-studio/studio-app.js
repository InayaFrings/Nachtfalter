/* Owner-Avatar-Studio: Bedienung. Links Bibliothek, Mitte Vorschau, rechts Bearbeiten, darunter KI mit Verlauf (am Handy als Reiter). */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const ST = {g: 'w', assets: [], full: {}, wear: {w: {}, m: {}}, sel: null, cats: [], styles: [...STYLES], filt: {cat: '', style: '', fav: false, q: '', both: false},
 gen: {cat: 'hair', text: '', styles: [], at: 'lip'}, hist: [], busy: false, base: {}, mark: null, mtab: 'p-lib', models: []};
const PATTERNS = {'': 'Kein Muster', streifen: 'Streifen', karo: 'Karo', leo: 'Leo', netz: 'Netz', sterne: 'Sterne', nieten: 'Nieten'};
const cvs = $('cv'), ctx = cvs.getContext('2d');
const thumbOf = async () => '', save = () => {}; /* vom Frisuren-Import (studio-core) erwartet, hier ohne Wirkung */
const catOf2 = k => ST.cats.find(c => c.k === k) || catOf(k) || {k, n: k, z: 65};
function setStatus(t, err) { $('status').textContent = t || ''; $('status').className = 'status' + (err ? ' err' : ''); }
window.wsUsage = u => { $('usage').textContent = `heute ca. ${u.used} / ${u.limit}`; };
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- Muster (Kacheln) ---------- */
function patTile(k, col) { const c = document.createElement('canvas'); c.width = c.height = 24; const x = c.getContext('2d'); x.fillStyle = x.strokeStyle = col || '#000';
 if (k === 'streifen') { x.fillRect(0, 0, 24, 8); } if (k === 'karo') { x.globalAlpha = .55; x.fillRect(0, 0, 24, 6); x.fillRect(0, 12, 24, 3); x.fillRect(0, 0, 6, 24); x.fillRect(12, 0, 3, 24); }
 if (k === 'leo') { x.globalAlpha = .8; for (const [a, b, r] of [[5, 5, 3], [17, 9, 2.5], [9, 17, 3], [20, 20, 2]]) { x.beginPath(); x.ellipse(a, b, r, r * .8, .5, 0, 7); x.lineWidth = 1.6; x.stroke(); } }
 if (k === 'netz') { x.lineWidth = 1.2; x.beginPath(); x.moveTo(0, 0); x.lineTo(24, 24); x.moveTo(24, 0); x.lineTo(0, 24); x.stroke(); }
 if (k === 'sterne') { x.font = '12px sans-serif'; x.fillText('★', 3, 13); x.fillText('★', 14, 23); }
 if (k === 'nieten') { x.fillStyle = '#d9d9d9'; for (const [a, b] of [[6, 6], [18, 18]]) { x.beginPath(); x.arc(a, b, 2.4, 0, 7); x.fill(); } }
 return c; }

/* ---------- Zeichnen ---------- */
async function fullOf(a) { if (ST.full[a.id]) return ST.full[a.id]; const img = await STORE.loadImg(a.id); if (!img) return null; return ST.full[a.id] = await fullLayer(a, img); }
async function renderAsset(x, a) {
 const L = await fullOf(a); if (!L) return; const t = a.tf || {}, cx = (a.ox || 0) + (a.w || WS.W) / 2, cy = (a.oy || 0) + (a.h || WS.H) / 2;
 let src = L; if (a.pat && a.pat.k) { const o = document.createElement('canvas'); o.width = WS.W; o.height = WS.H; const ox = o.getContext('2d'); ox.drawImage(L, 0, 0);
  ox.globalCompositeOperation = 'source-atop'; ox.globalAlpha = (a.pat.o ?? 60) / 100; ox.fillStyle = ox.createPattern(patTile(a.pat.k, a.pat.c), 'repeat'); ox.fillRect(0, 0, WS.W, WS.H); src = o; }
 x.save(); x.translate(cx + (t.x || 0), cy + (t.y || 0)); x.rotate((t.r || 0) * Math.PI / 180); x.scale(t.s || 1, t.s || 1); x.translate(-cx, -cy);
 const c = a.col || {}; x.filter = `hue-rotate(${c.hue || 0}deg) saturate(${c.sat ?? 100}%) brightness(${c.bri ?? 100}%)`; x.drawImage(src, 0, 0); x.restore();
}
const zOf = a => a.z ?? catOf2(a.cat).z;
async function composite(x, g, wornIds) {
 const worn = wornIds.map(id => ST.assets.find(a => a.id === id)).filter(Boolean).sort((a, b) => zOf(a) - zOf(b));
 for (const a of worn.filter(a => a.behind)) await renderAsset(x, a);
 x.drawImage(ST.base[g], 0, 0);
 for (const a of worn.filter(a => !a.behind)) await renderAsset(x, a);
}
let drawing = 0;
async function draw() { const my = ++drawing, g = ST.g; if (!ST.base[g]) return;
 const off = document.createElement('canvas'); off.width = WS.W; off.height = WS.H; const ox = off.getContext('2d'); await composite(ox, g, Object.values(ST.wear[g]));
 if (my !== drawing) return; ctx.clearRect(0, 0, WS.W, WS.H); ctx.drawImage(off, 0, 0);
 if (ST.mark) { ctx.fillStyle = '#0ff'; for (const p of ST.mark) { ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 7); ctx.fill(); } }
 fit(); const F = FACE[g]; cvs.style.setProperty('--zo', `${F.cx / WS.W * 100}% ${(F.brow + 12) / WS.H * 100}%`); }
function fit() { const st = $('stage'), sw = st.clientWidth, sh = st.clientHeight, k = Math.min(sw / WS.W, sh / WS.H) * .98;
 Object.assign(cvs.style, {width: WS.W * k + 'px', height: WS.H * k + 'px', left: (sw - WS.W * k) / 2 + 'px', top: (sh - WS.H * k) / 2 + 'px'}); }
addEventListener('resize', fit);
async function thumbFor(a) { const c = document.createElement('canvas'); c.width = c.height = 150; const x = c.getContext('2d'), g = a.g, cat = catOf2(a.cat);
 const comp = document.createElement('canvas'); comp.width = WS.W; comp.height = WS.H; const cx = comp.getContext('2d'); if (a.behind) await renderAsset(cx, a); cx.drawImage(ST.base[g], 0, 0); if (!a.behind) await renderAsset(cx, a);
 if (cat.face) { const B = faceBox(g); x.drawImage(comp, B.x, B.y, B.S, B.S, 0, 0, 150, 150); }
 else if (['hair', 'hat'].includes(a.cat) || (cat.band && cat.band[1] <= .2)) { const F = FACE[g], S = (F.hr - F.hl) * 3.2; x.drawImage(comp, F.cx - S / 2, F.top - S * .18, S, S, 0, 0, 150, 150); }
 else x.drawImage(comp, 0, 0, WS.W, WS.H, 28, 0, 94, 150);
 return c.toDataURL('image/jpeg', .8); }

/* ---------- Speichern ---------- */
async function addAsset(meta, layerUrl) { const cr = await cropLayer(layerUrl), a = {tf: {}, col: {}, pat: {k: ''}, fav: false, ts: Date.now(), ...meta, ox: cr.ox, oy: cr.oy, w: cr.w, h: cr.h};
 ST.full[a.id] = await fullLayer(a, cr.img); ST.assets.push(a); a.thumb = await thumbFor(a); await STORE.saveAsset(a, cr.img); return a; }
let saveT = {}; function saveMetaSoon(a) { clearTimeout(saveT[a.id]); saveT[a.id] = setTimeout(async () => { a.thumb = await thumbFor(a); STORE.saveAsset(a); paintLib(); }, 700); }
const saveCfg = () => STORE.saveCfg({cats: ST.cats.filter(c => c.custom), styles: ST.styles, wear: ST.wear});

/* ---------- Bibliothek (links) ---------- */
function paintLib() {
 const f = ST.filt, list = ST.assets.filter(a => (f.both || a.g === ST.g) && (!f.cat || a.cat === f.cat) && (!f.style || a.style === f.style) && (!f.fav || a.fav) && (!f.q || (a.name + ' ' + (a.prompt || '')).toLowerCase().includes(f.q.toLowerCase()))).sort((a, b) => b.ts - a.ts);
 const cats = [...CATS, ...ST.cats.filter(c => c.custom)];
 $('p-lib').innerHTML = `<h2>Bibliothek</h2>
  <input type="text" id="q" placeholder="Suchen …" value="${esc(f.q)}">
  <div class="chips"><button class="chip${!f.cat ? ' on' : ''}" data-fcat="">Alle</button>${cats.map(c => `<button class="chip${f.cat === c.k ? ' on' : ''}" data-fcat="${c.k}">${esc(c.n)}</button>`).join('')}</div>
  <div class="chips"><select id="fstyle"><option value="">Alle Stile</option>${ST.styles.map(s => `<option${f.style === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
   <button class="chip${f.fav ? ' on' : ''}" data-ffav="1">★ Favoriten</button><button class="chip${f.both ? ' on' : ''}" data-fboth="1">Beide Figuren</button></div>
  ${list.length ? `<div class="lib">${list.map(a => `<button class="it${ST.wear[a.g][a.cat] === a.id ? ' on' : ''}${ST.sel === a.id ? ' sel' : ''}" data-a="${a.id}"><img alt="" src="${a.thumb || ''}"><b>${esc(a.name)}</b>${a.fav ? '<span class="fav">★</span>' : ''}</button>`).join('')}</div>` : '<p class="note">Noch nichts hier. Erstelle Teile im KI-Bereich, lade ein eigenes Bild oder ein Frisuren-Blatt hoch.</p>'}
  <div class="chips"><button class="btn" data-act="newcat">+ Kategorie</button><button class="btn" data-act="newstyle">+ Stil</button></div>`;
}
/* ---------- Bearbeiten (rechts) ---------- */
function paintEdit() {
 const a = ST.assets.find(x => x.id === ST.sel); if (!a) { $('p-edit').innerHTML = '<h2>Bearbeiten</h2><p class="note">Wähle links ein Teil aus. Hier kannst du es umbenennen, verschieben, vergrößern, drehen, umfärben, mit Muster versehen, als Variante speichern oder per KI ändern.</p>'; return; }
 const t = a.tf || {}, c = a.col || {}, p = a.pat || {}, worn = ST.wear[a.g][a.cat] === a.id, cats = [...CATS, ...ST.cats.filter(x => x.custom)];
 const rng = (k, lab, min, max, v, step = 1) => `<label class="f">${lab}<input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-k="${k}"></label>`;
 $('p-edit').innerHTML = `<h2>Bearbeiten</h2>
  <img alt="" src="${a.thumb || ''}" style="width:120px;border-radius:10px;background:#121114;justify-self:center">
  <label class="f">Name<input type="text" id="e-name" value="${esc(a.name)}"></label>
  <label class="f">Kategorie<select id="e-cat">${cats.map(x => `<option value="${x.k}"${x.k === a.cat ? ' selected' : ''}>${esc(x.n)}</option>`).join('')}</select></label>
  <label class="f">Stil<select id="e-style"><option value="">–</option>${ST.styles.map(s => `<option${a.style === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
  <div class="chips"><button class="btn" data-act="wear">${worn ? 'Ausziehen' : 'Anziehen'}</button><button class="btn" data-act="fav">${a.fav ? '★ Favorit' : '☆ Favorit'}</button><button class="btn" data-act="behind">${a.behind ? 'Hinter dem Körper' : 'Vor dem Körper'}</button></div>
  <h2>Ebene</h2><div class="chips"><button class="btn" data-act="zdown">Nach hinten</button><button class="btn" data-act="zup">Nach vorn</button><span class="note" style="align-self:center">Ebene ${zOf(a)}</span></div>
  <h2>Position und Form</h2>${rng('tf.x', 'Links/Rechts', -200, 200, t.x || 0)}${rng('tf.y', 'Hoch/Runter', -300, 300, t.y || 0)}${rng('tf.s', 'Größe', .5, 1.6, t.s || 1, .01)}${rng('tf.r', 'Drehen', -45, 45, t.r || 0)}
  <h2>Farbe</h2>${rng('col.hue', 'Farbton', -180, 180, c.hue || 0)}${rng('col.sat', 'Sättigung', 0, 250, c.sat ?? 100)}${rng('col.bri', 'Helligkeit', 30, 180, c.bri ?? 100)}
  <h2>Muster</h2><label class="f">Muster<select id="e-pat">${Object.entries(PATTERNS).map(([k, n]) => `<option value="${k}"${(p.k || '') === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
  ${rng('pat.o', 'Deckkraft', 10, 100, p.o ?? 60)}<label class="f">Musterfarbe<input type="color" id="e-patc" value="${p.c || '#000000'}"></label>
  <div class="chips"><button class="btn" data-act="reset">Zurücksetzen</button><button class="btn" data-act="variant">Als Variante speichern</button></div>
  <h2>Mit KI ändern</h2><textarea id="e-ai" placeholder="z. B. länger, mit silbernen Schnallen, in Dunkelrot …"></textarea><button class="go" data-act="aiedit"${ST.busy ? ' disabled' : ''}>Ändern lassen (als neue Variante)</button>
  <button class="btn red" data-act="del">Löschen</button>`;
}
/* ---------- KI (unten) ---------- */
function paintAI() {
 const G = ST.gen, cats = [...CATS, ...ST.cats.filter(c => c.custom)], cat = catOf2(G.cat);
 $('p-ai').innerHTML = `<h2>Mit KI erstellen</h2>
  <div class="chips">${cats.map(c => `<button class="chip${c.k === G.cat ? ' on' : ''}" data-gcat="${c.k}">${esc(c.n)}</button>`).join('')}</div>
  ${G.cat === 'pierc' ? `<div class="chips">${PIERC_AT.map(([k, n]) => `<button class="chip${k === G.at ? ' on' : ''}" data-gat="${k}">${n}</button>`).join('')}</div>` : ''}
  <textarea id="g-txt" placeholder="z. B. ${esc(cat.ex || 'beschreibe das Teil')}">${esc(G.text)}</textarea>
  <div class="chips">${ST.styles.map(s => `<button class="chip${G.styles.includes(s) ? ' on' : ''}" data-gsty="${esc(s)}">${esc(s)}</button>`).join('')}</div>
  <button class="go" id="gen"${ST.busy ? ' disabled' : ''}>Erzeugen und anziehen</button>
  <div class="chips"><button class="btn" data-act="upel">Eigenes Bild als Teil hochladen</button></div>
  <h2>Verlauf</h2><div class="hist">${ST.hist.length ? ST.hist.map((h, i) => `<div>${h.thumb ? `<img alt="" src="${h.thumb}">` : ''}<span style="flex:1">${esc(catOf2(h.cat).n)} · ${esc(h.text).slice(0, 80)}${h.err ? ` · <span style="color:#ff9a9a">${esc(h.err)}</span>` : ''}</span><button class="btn" data-hist="${i}">Nochmal</button></div>`).join('') : '<p class="note">Noch nichts erzeugt.</p>'}</div>`;
}
function paintFig() {
 $('p-fig').innerHTML = `<h2>Grundfigur (${ST.g === 'w' ? 'Frau' : 'Mann'})</h2>
  <div class="chips"><button class="btn" data-act="upbase">Eigene Figur hochladen</button><button class="btn" data-act="mark">Gesicht markieren</button><button class="btn" data-act="resetbase">Standard</button></div>
  <p class="note">Die Grundfiguren sind die Vorlage: Die KI zeichnet jedes Teil auf diese Figur, Gesicht, Körper und Pose bleiben.</p>
  <h2>Frisuren-Blatt</h2><button class="btn" data-act="wigs">Blatt mit Frisuren hochladen</button>`;
 $('p-out').innerHTML = `<h2>Export für Noctibat</h2><p class="note">${ST.assets.length} Teile. Das ZIP enthält die Grundfiguren, jedes Teil als Original-Ebene und fertig angepasst (Position, Farbe, Muster) in 900 × 1440, dazu liste.json.</p><button class="go" data-act="zip">ZIP herunterladen</button>`;
}
function paintAll() { paintLib(); paintEdit(); paintAI(); paintFig();
 document.querySelectorAll('#gender button').forEach(b => b.classList.toggle('on', b.dataset.g === ST.g));
 document.querySelectorAll('#mtabs button').forEach(b => b.classList.toggle('on', b.dataset.p === ST.mtab));
 document.querySelectorAll('.grid>.card.mob').forEach(p => p.classList.toggle('show', p.id === ST.mtab)); }

/* ---------- Aktionen ---------- */
function wearToggle(a, on) { const w = ST.wear[a.g]; if (on === false || (on === undefined && w[a.cat] === a.id)) { if (w[a.cat] === a.id) delete w[a.cat]; }
 else { w[a.cat] = a.id; (catOf2(a.cat).ex2 || []).forEach(k => delete w[k]); } saveCfg(); }
async function runGen(src) {
 const g = ST.g, base = ST.base[g]; if (ST.busy || !base) return; const G = src || {cat: ST.gen.cat, at: ST.gen.at, text: [ST.gen.text.trim(), ...ST.gen.styles].filter(Boolean).join(', ') || catOf2(ST.gen.cat).ex || ''};
 if (!G.text) { setStatus('Bitte beschreibe das Teil.', true); return; }
 ST.busy = true; $('stage').classList.add('load'); paintAI(); paintEdit(); setStatus(''); const t0 = Date.now(), h = {...G};
 try { const r = await wsGen(g, base, catOf(G.cat) ? G.cat : (catOf2(G.cat).like || 'acc'), G.text, G.at);
  const a = await addAsset({id: uid('a'), g, cat: G.cat, name: (ST.gen.text.trim() || catOf2(G.cat).n).slice(0, 40), style: ST.gen.styles[0] || '', prompt: G.text, at: G.at, behind: false}, r.layer);
  wearToggle(a, true); ST.sel = a.id; h.thumb = a.thumb; setStatus(`Fertig in ${((Date.now() - t0) / 1000).toFixed(1)} s.`); }
 catch (e) { h.err = (e && e.msg) || String(e); setStatus(h.err, true); if (e && e.detail) console.warn(e.detail); }
 ST.hist.unshift(h); ST.hist = ST.hist.slice(0, 40); ST.busy = false; $('stage').classList.remove('load'); paintAll(); draw();
}
/* Teil mit KI ändern: Figur + Teil als Vorlage, Ergebnis als neue Variante */
async function aiEdit(a, text) {
 if (ST.busy || !text) return; const g = a.g, base = ST.base[g]; ST.busy = true; $('stage').classList.add('load'); paintEdit(); const t0 = Date.now();
 try { const comp = document.createElement('canvas'); comp.width = WS.W; comp.height = WS.H; const cx = comp.getContext('2d'); if (a.behind) await renderAsset(cx, a); cx.drawImage(base, 0, 0); if (!a.behind) await renderAsset(cx, a);
  const cat = catOf(a.cat) ? a.cat : (catOf2(a.cat).like || 'acc'), r = await wsGen(g, comp, cat, 'change the existing ' + catOf2(a.cat).n + ' like this: ' + text, a.at);
  const lay = catOf2(a.cat).face ? r.layer : await bodyLayer(base, r.raw, catOf2(cat), g);
  const v = await addAsset({id: uid('a'), g, cat: a.cat, name: (a.name + ' · ' + text).slice(0, 40), style: a.style, prompt: a.prompt + ' | ' + text, at: a.at, behind: a.behind, parent: a.id}, lay);
  wearToggle(v, true); ST.sel = v.id; setStatus(`Variante fertig in ${((Date.now() - t0) / 1000).toFixed(1)} s.`); }
 catch (e) { setStatus((e && e.msg) || String(e), true); }
 ST.busy = false; $('stage').classList.remove('load'); paintAll(); draw();
}
async function uploadElement(file) {
 const g = ST.g, url = URL.createObjectURL(file), im = await ld(url); URL.revokeObjectURL(url);
 const c = document.createElement('canvas'); c.width = WS.W; c.height = WS.H; const x = c.getContext('2d');
 /* Ebene im Format der Figur (z. B. aus dem Export): 1:1 übernehmen, sonst mittig auf den Oberkörper setzen */
 const same = Math.abs(im.width / im.height - WS.W / WS.H) < .01; const s = same ? WS.W / im.width : Math.min(WS.W * .6 / im.width, WS.H * .5 / im.height, 1);
 if (same) x.drawImage(im, 0, 0, WS.W, WS.H); else x.drawImage(im, (WS.W - im.width * s) / 2, WS.H * .3, im.width * s, im.height * s);
 const d = x.getImageData(0, 0, WS.W, WS.H), p = d.data; if (!same && p[(Math.round(WS.H * .3) * WS.W + Math.round((WS.W - im.width * s) / 2) + 2) * 4 + 3] > 200) { /* undurchsichtig: Grün bzw. Eckfarbe herausnehmen */
  for (let j = 0; j < p.length; j += 4) { const k = p[j + 1] - Math.max(p[j], p[j + 2]); if (k > 60) p[j + 3] = 0; } x.putImageData(d, 0, 0); }
 const a = await addAsset({id: uid('u'), g, cat: ST.gen.cat, name: file.name.replace(/\.[a-z]+$/i, '').slice(0, 40), style: '', prompt: 'hochgeladen', behind: false}, c.toDataURL('image/png'));
 wearToggle(a, true); ST.sel = a.id; ST.mtab = 'p-edit'; paintAll(); draw(); setStatus('Hochgeladen. Mit Position und Größe anpassen oder per KI ändern.');
}
async function makeZip() {
 setStatus('ZIP wird gebaut …'); const files = [], list = [], enc = new TextEncoder();
 for (const g of ['w', 'm']) files.push({name: `grundfigur-${g}.png`, data: dataBytes(ST.base[g].toDataURL('image/png'))});
 for (const a of ST.assets) { const L = await fullOf(a); if (!L) continue; const fin = document.createElement('canvas'); fin.width = WS.W; fin.height = WS.H; await renderAsset(fin.getContext('2d'), a);
  const base = `teile/${a.g}/${a.cat}-${a.id}`; files.push({name: base + '-original.png', data: dataBytes(L.toDataURL('image/png'))}, {name: base + '.png', data: dataBytes(fin.toDataURL('image/png'))});
  list.push({datei: base + '.png', original: base + '-original.png', figur: a.g === 'w' ? 'Frau' : 'Mann', kategorie: catOf2(a.cat).n, cat: a.cat, name: a.name, stil: a.style, favorit: !!a.fav, beschreibung: a.prompt, ebene: zOf(a), hinterKoerper: !!a.behind, variantVon: a.parent || null, form: a.tf, farbe: a.col, muster: a.pat}); }
 files.push({name: 'liste.json', data: enc.encode(JSON.stringify({leinwand: [WS.W, WS.H], gesicht: FACE, kategorien: [...CATS, ...ST.cats.filter(c => c.custom)].map(c => ({k: c.k, n: c.n, ebene: c.z})), teile: list}, null, 1))});
 const el = document.createElement('a'); el.href = URL.createObjectURL(zip(files)); el.download = 'noctibat-avatar-studio.zip'; el.click(); setStatus('ZIP heruntergeladen.');
}

/* ---------- Ereignisse ---------- */
$('gender').onclick = e => { const b = e.target.closest('button'); if (!b) return; ST.g = b.dataset.g; ST.sel = null; paintAll(); draw(); };
$('mtabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; ST.mtab = b.dataset.p; paintAll(); };
$('zoom').onclick = () => { $('stage').classList.toggle('zoom'); $('zoom').textContent = $('stage').classList.contains('zoom') ? 'Ganz' : 'Gesicht'; };
$('undress').onclick = () => { ST.wear[ST.g] = {}; saveCfg(); paintAll(); draw(); };
$('model').onchange = e => { const [p, m] = e.target.value.split('|'); AV.provider = p; AV.model = m; localStorage.setItem('nf-avmodel', e.target.value); };
document.addEventListener('input', e => { const t = e.target, a = ST.assets.find(x => x.id === ST.sel);
 if (t.id === 'q') { ST.filt.q = t.value; clearTimeout(ST.qt); ST.qt = setTimeout(() => { paintLib(); const q = $('q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); }
 if (t.id === 'g-txt') ST.gen.text = t.value;
 if (a && t.dataset.k) { const [o, k] = t.dataset.k.split('.'); a[o] = a[o] || {}; a[o][k] = +t.value; draw(); saveMetaSoon(a); }
 if (a && t.id === 'e-name') { a.name = t.value; saveMetaSoon(a); }
 if (a && t.id === 'e-patc') { a.pat = {...a.pat, c: t.value}; draw(); saveMetaSoon(a); } });
document.addEventListener('change', e => { const t = e.target, a = ST.assets.find(x => x.id === ST.sel);
 if (t.id === 'fstyle') { ST.filt.style = t.value; paintLib(); }
 if (a && t.id === 'e-cat') { const w = ST.wear[a.g]; if (w[a.cat] === a.id) delete w[a.cat]; a.cat = t.value; wearToggle(a, true); saveMetaSoon(a); paintAll(); draw(); }
 if (a && t.id === 'e-style') { a.style = t.value; saveMetaSoon(a); }
 if (a && t.id === 'e-pat') { a.pat = {...a.pat, k: t.value}; draw(); saveMetaSoon(a); } });
document.addEventListener('click', async e => { const t = e.target.closest('[data-a],[data-fcat],[data-ffav],[data-fboth],[data-gcat],[data-gat],[data-gsty],[data-hist],[data-act],#gen'); if (!t) return; const a = ST.assets.find(x => x.id === ST.sel);
 if (t.dataset.a !== undefined) { const it = ST.assets.find(x => x.id === t.dataset.a); if (ST.sel === it.id || ST.wear[it.g][it.cat] !== it.id) wearToggle(it); if (it.g !== ST.g) ST.g = it.g; ST.sel = it.id; paintAll(); draw(); return; }
 if (t.dataset.fcat !== undefined) { ST.filt.cat = t.dataset.fcat; paintLib(); return; }
 if (t.dataset.ffav) { ST.filt.fav = !ST.filt.fav; paintLib(); return; } if (t.dataset.fboth) { ST.filt.both = !ST.filt.both; paintLib(); return; }
 if (t.dataset.gcat) { ST.gen.cat = t.dataset.gcat; ST.gen.text = ''; paintAI(); return; } if (t.dataset.gat) { ST.gen.at = t.dataset.gat; paintAI(); return; }
 if (t.dataset.gsty) { const s = t.dataset.gsty; ST.gen.styles = ST.gen.styles.includes(s) ? ST.gen.styles.filter(x => x !== s) : [...ST.gen.styles, s]; paintAI(); return; }
 if (t.dataset.hist !== undefined) { runGen(ST.hist[+t.dataset.hist]); return; }
 if (t.id === 'gen') { runGen(); return; }
 const act = t.dataset.act;
 if (act === 'wear' && a) { wearToggle(a); paintAll(); draw(); }
 if (act === 'fav' && a) { a.fav = !a.fav; saveMetaSoon(a); paintAll(); }
 if (act === 'behind' && a) { a.behind = !a.behind; saveMetaSoon(a); paintEdit(); draw(); }
 if ((act === 'zup' || act === 'zdown') && a) { a.z = zOf(a) + (act === 'zup' ? 1 : -1); saveMetaSoon(a); paintEdit(); draw(); }
 if (act === 'reset' && a) { a.tf = {}; a.col = {}; a.pat = {k: ''}; saveMetaSoon(a); paintEdit(); draw(); }
 if (act === 'variant' && a) { const L = await fullOf(a), v = await addAsset({...a, id: uid('a'), name: (a.name + ' (Variante)').slice(0, 40), parent: a.id, ts: Date.now(), tf: {...a.tf}, col: {...a.col}, pat: {...a.pat}}, L.toDataURL('image/png')); ST.sel = v.id; wearToggle(v, true); paintAll(); draw(); setStatus('Variante gespeichert.'); }
 if (act === 'aiedit' && a) aiEdit(a, ($('e-ai').value || '').trim());
 if (act === 'del' && a && confirm(`„${a.name}“ endgültig löschen?`)) { await STORE.deleteAsset(a.id); ST.assets = ST.assets.filter(x => x !== a); for (const g of ['w', 'm']) for (const k in ST.wear[g]) if (ST.wear[g][k] === a.id) delete ST.wear[g][k]; ST.sel = null; saveCfg(); paintAll(); draw(); }
 if (act === 'newcat') { const n = prompt('Name der neuen Kategorie:'); if (!n) return; const at = prompt('Wo am Körper? kopf, gesicht, oberkoerper, beine, fuesse oder ganz', 'oberkoerper') || 'ganz';
  const pre = {kopf: {like: 'hat', z: 96}, gesicht: {like: 'mk', z: 86, face: 'mk'}, oberkoerper: {like: 'top', z: 58}, beine: {like: 'pants', z: 32}, fuesse: {like: 'shoes', z: 41}, ganz: {like: 'acc', z: 70}}[at.toLowerCase()] || {like: 'acc', z: 70};
  ST.cats.push({k: 'c_' + Date.now().toString(36), n: n.slice(0, 30), custom: 1, ...pre, band: catOf(pre.like).band}); saveCfg(); paintAll(); }
 if (act === 'newstyle') { const n = prompt('Neuer Stil:'); if (n && !ST.styles.includes(n)) { ST.styles.push(n.slice(0, 24)); saveCfg(); paintAll(); } }
 if (act === 'upel') $('f-el').click(); if (act === 'upbase') $('f-base').click(); if (act === 'wigs') $('f-wigs').click();
 if (act === 'mark') { ST.mark = []; $('stage').classList.add('mark'); $('hint').textContent = 'Tippe auf das linke Auge (vom Betrachter aus).'; draw(); }
 if (act === 'resetbase' && confirm('Grundfigur auf deine Standard-Figur zurücksetzen?')) { await STORE.saveBase(ST.g, null); location.reload(); }
 if (act === 'zip') makeZip(); });
cvs.addEventListener('click', async e => { if (!ST.mark) return; const r = cvs.getBoundingClientRect(); ST.mark.push([(e.clientX - r.left) / r.width * WS.W, (e.clientY - r.top) / r.height * WS.H]);
 if (ST.mark.length < 3) { $('hint').textContent = ['', 'Tippe auf das rechte Auge.', 'Tippe auf die Mitte des Mundes.'][ST.mark.length]; draw(); return; }
 FACE[ST.g] = faceFrom(ST.base[ST.g], ...ST.mark); await STORE.saveFace(ST.g, FACE[ST.g]); ST.mark = null; $('stage').classList.remove('mark'); setStatus('Gesicht gespeichert.'); draw(); });
$('f-base').onchange = async e => { const f = e.target.files[0]; if (!f) return; const c = await wsImportBase(f); ST.base[ST.g] = c; await STORE.saveBase(ST.g, c.toDataURL('image/png'), FACE[ST.g]); e.target.value = '';
 ST.mark = []; $('stage').classList.add('mark'); $('hint').textContent = 'Neue Figur. Tippe auf das linke Auge (vom Betrachter aus).'; draw(); };
$('f-el').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) uploadElement(f); };
$('f-wigs').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; setStatus('Frisuren werden ausgeschnitten …');
 const before = new Set(ST.items ? ST.items.map(i => i.id) : []); ST.items = []; const n = await importWigs(f);
 for (const it of ST.items) await addAsset({id: uid('h'), g: it.g, cat: 'hair', name: it.name, style: '', prompt: 'aus Frisuren-Blatt', behind: false}, it.layer);
 ST.items = []; setStatus(n + ' Frisuren in der Bibliothek.'); ST.filt.cat = 'hair'; paintAll(); };

/* ---------- Start ---------- */
(async () => {
 const ok = await avLogin();
 if (!ok) { $('gate').hidden = false; $('gate').innerHTML = fbUser ? '<h2>Kein Zugang</h2><p class="note">Das Avatar-Studio ist nur für die Owner von Noctibat.</p>' : '<h2>Bitte anmelden</h2><p class="note">Melde dich zuerst auf <a href="/" style="color:inherit">noctibat.com</a> an und öffne dann diese Seite erneut.</p>'; return; }
 $('app').hidden = false; setStatus('Lädt …');
 ST.items = []; /* importWigs schreibt hierher */
 const def = await crPrep(); for (const g of ['w', 'm']) { const b = await STORE.loadBase(g); ST.base[g] = b && b.img ? await toCanvas(b.img) : def[g]; if (b && b.face) FACE[g] = b.face; }
 const cfg = await STORE.loadCfg(); ST.cats = (cfg.cats || []).map(c => ({...c, custom: 1})); if (cfg.styles) ST.styles = cfg.styles; if (cfg.wear) ST.wear = {w: {}, m: {}, ...cfg.wear};
 ST.assets = await STORE.listAssets();
 /* Modelle */
 let opts = [['cloudflare|flux-2-klein-4b', 'Cloudflare · FLUX.2 Klein 4B']];
 if (!AV.local) { const r = await avCall('avModels'); if (r.ok) opts = r.result.providers.flatMap(p => p.models.map(m => [p.id + '|' + m, (p.id === 'bfl' ? 'Black Forest Labs' : 'Cloudflare') + ' · ' + m + (p.ready ? '' : ' (nicht eingerichtet)')])); }
 $('model').innerHTML = opts.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join(''); const pref = localStorage.getItem('nf-avmodel'); if (pref && opts.some(o => o[0] === pref)) $('model').value = pref; $('model').dispatchEvent(new Event('change'));
 if (AV.local) fetch(AV.api + '/api/usage').then(r => r.json()).then(wsUsage).catch(() => {});
 setStatus(''); paintAll(); await draw();
 for (const a of ST.assets) if (!a.thumb) { a.thumb = await thumbFor(a); }
 paintLib();
})();
