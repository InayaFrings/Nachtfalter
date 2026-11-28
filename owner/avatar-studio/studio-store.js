/* Owner-Avatar-Studio: Anmeldung, Server-Aufrufe und Speicher.
   Auf noctibat.com: Firebase (Anmeldung wie Noctibat, Firestore avstudio/… nur für die Owner lesbar/schreibbar laut Regeln).
   Lokal (localhost): IndexedDB im Browser, kein Konto nötig, KI über den Test-Worker. */
const FB = {config: {apiKey: 'AIzaSyBAN0OV756ln_ELGwTgcS6yvHYL3m_VeRQ', authDomain: 'nachtfalter-fe3d1.firebaseapp.com', projectId: 'nachtfalter-fe3d1', storageBucket: 'nachtfalter-fe3d1.firebasestorage.app', messagingSenderId: '276441792597', appId: '1:276441792597:web:aa561493db5fbfcd33d4dc'}, owner: 'inayafrings@gmail.com'};
let fbAuth = null, fbDb = null, fbUser = null;

/* Anmeldung abwarten; true = Owner */
async function avLogin() {
 if (AV.local) return true;
 const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FB.config); fbAuth = app.auth(); fbDb = app.firestore();
 fbUser = await new Promise(r => { const off = fbAuth.onAuthStateChanged(u => { off(); r(u); }); });
 return !!fbUser && String(fbUser.email || '').toLowerCase() === FB.owner;
}
/* Aufrufbare Cloud Function mit dem Anmelde-Schlüssel (wie NF_AUTH.call in Noctibat) */
async function avCall(name, data) {
 if (!fbUser) return {error: 'unauthenticated', msg: 'Nicht angemeldet.'};
 try { const r = await fetch(`https://europe-west3-${FB.config.projectId}.cloudfunctions.net/${name}`, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + await fbUser.getIdToken()}, body: JSON.stringify({data: data || {}})});
  const j = await r.json().catch(() => ({})); return j.error ? {error: String(j.error.status || 'error').toLowerCase().replace(/_/g, '-'), msg: j.error.message || ''} : {ok: true, result: j.result};
 } catch (e) { return {error: 'unavailable', msg: 'Server nicht erreichbar.'}; }
}

/* ---------- Speicher ---------- */
const CHUNK = 700000;
const STORE = {
 async listAssets() { if (AV.local) return (await kvGet('av:list')) || [];
  const q = await fbDb.collection('avstudio/lib/a').get(); return q.docs.map(d => ({...d.data(), id: d.id})); },
 async loadImg(id) { if (AV.local) return kvGet('av:img:' + id);
  const q = await fbDb.collection(`avstudio/lib/a/${id}/c`).get(); return q.docs.sort((a, b) => +a.id - +b.id).map(d => d.data().d).join(''); },
 async saveAsset(meta, img) { const {thumbBig, ...m} = meta;
  if (AV.local) { const l = (await kvGet('av:list')) || [], i = l.findIndex(x => x.id === m.id); if (i >= 0) l[i] = m; else l.push(m); await kvPut('av:list', l); if (img) await kvPut('av:img:' + m.id, img); return; }
  const ref = fbDb.doc('avstudio/lib/a/' + m.id);
  if (img) { const parts = []; for (let i = 0; i < img.length; i += CHUNK) parts.push(img.slice(i, i + CHUNK)); const b = fbDb.batch(); parts.forEach((d, i) => b.set(ref.collection('c').doc(String(i)), {d})); m.n = parts.length; await b.commit(); }
  const {id, ...rest} = m; await ref.set(rest, {merge: true}); },
 async deleteAsset(id) { if (AV.local) { await kvPut('av:list', ((await kvGet('av:list')) || []).filter(x => x.id !== id)); await kvPut('av:img:' + id, undefined); return; }
  const ref = fbDb.doc('avstudio/lib/a/' + id), c = await ref.collection('c').get(); const b = fbDb.batch(); c.docs.forEach(d => b.delete(d.ref)); b.delete(ref); await b.commit(); },
 async saveBase(g, img, face) { if (AV.local) { await kvPut('av:base:' + g, img === null ? undefined : {img, face}); return; }
  const ref = fbDb.doc('avstudio/base/b/' + g); if (img === null) { const c = await ref.collection('c').get(); const b = fbDb.batch(); c.docs.forEach(d => b.delete(d.ref)); b.delete(ref); await b.commit(); return; }
  const parts = []; for (let i = 0; i < img.length; i += CHUNK) parts.push(img.slice(i, i + CHUNK)); const b = fbDb.batch(); parts.forEach((d, i) => b.set(ref.collection('c').doc(String(i)), {d})); b.set(ref, {face, n: parts.length, ts: Date.now()}); await b.commit(); },
 async saveFace(g, face) { if (AV.local) { const v = await kvGet('av:base:' + g); if (v) await kvPut('av:base:' + g, {...v, face}); return; } await fbDb.doc('avstudio/base/b/' + g).set({face}, {merge: true}); },
 async loadBase(g) { if (AV.local) return kvGet('av:base:' + g);
  const ref = fbDb.doc('avstudio/base/b/' + g), d = await ref.get(); if (!d.exists) return null; const c = await ref.collection('c').get();
  return {img: c.docs.sort((a, b) => +a.id - +b.id).map(x => x.data().d).join(''), face: d.data().face}; },
 async loadCfg() { if (AV.local) return (await kvGet('av:cfg')) || {}; const d = await fbDb.doc('avstudio/cfg').get(); return d.exists ? d.data() : {}; },
 async saveCfg(c) { if (AV.local) return kvPut('av:cfg', c); return fbDb.doc('avstudio/cfg').set(c); },
 async loadLog() { if (AV.local) return []; try { const q = await fbDb.collection('avstudio/log/l').orderBy('ts', 'desc').limit(30).get(); return q.docs.map(d => d.data()); } catch { return []; } },
};

/* Ebene auf den sichtbaren Bereich zuschneiden (spart Speicher) und zurück auf volle Größe */
async function cropLayer(src) {
 const c = await toCanvas(src), W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = -1, y1 = -1;
 for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
 if (x1 < 0) return {img: src, ox: 0, oy: 0, w: W, h: H};
 const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext('2d').drawImage(c, -x0, -y0); return {img: o.toDataURL('image/png'), ox: x0, oy: y0, w: o.width, h: o.height};
}
async function fullLayer(meta, img) { const o = document.createElement('canvas'); o.width = WS.W; o.height = WS.H; o.getContext('2d').drawImage(await ld(img), meta.ox || 0, meta.oy || 0); return o; }
