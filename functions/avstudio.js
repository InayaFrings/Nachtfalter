/* Noctibat: KI für das Owner-Avatar-Studio (/owner/avatar-studio/, Inaya 2026-11-28)
   - avGen (aufrufbar): erzeugt bzw. bearbeitet ein Bild mit einem austauschbaren Anbieter. Nur die Owner darf es benutzen,
     geprüft hier auf dem Server (bestätigte Owner-E-Mail wie isOwner() in den Regeln, oder site/owner.uid). Andere bekommen permission-denied.
   - avModels (aufrufbar, nur Owner): welche Anbieter eingerichtet sind (ohne Schlüssel).
   Schlüssel stehen nie im Browser. Alle Anbieter-Schlüssel liegen in EINEM Secret als JSON, z. B.:
     firebase functions:secrets:set AV_PROVIDERS
     {"cloudflare": {"account": "<Account-ID>", "token": "<API-Token mit Workers AI>"}, "bfl": {"key": "<BFL API-Key>"}}
   Weitere Anbieter: Eintrag im Secret + Adapter unten in PROVIDERS. Fällt einer aus, springt der nächste eingerichtete ein (keine eigene Grenze). Jeder Aufruf wird in avstudio/log/l protokolliert (nur Owner lesbar). */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const db = admin.firestore();
const REGION = 'europe-west3';
const EMU = !!process.env.FUNCTIONS_EMULATOR;
const OWNER_EMAIL = 'inayafrings@gmail.com';
const fn = functions.region(REGION).runWith({maxInstances: 3, memory: '512MB', timeoutSeconds: 150, secrets: EMU ? [] : ['AV_PROVIDERS']});

function keys() { try { return JSON.parse(process.env.AV_PROVIDERS || '{}'); } catch { return {}; } }

async function isOwner(ctx) {
 const a = ctx.auth; if (!a) return false;
 const em = String(a.token.email || '').toLowerCase(); if (em === OWNER_EMAIL && a.token.email_verified !== false) return true;
 try { const o = await db.doc('site/owner').get(); return o.exists && o.data().uid === a.uid; } catch { return false; }
}
const fail = (code, msg) => { throw new functions.https.HttpsError(code, msg); };
const b64 = s => String(s || '').replace(/^data:image\/[a-z]+;base64,/, '');
const mimeOf = s => s.startsWith('iVBOR') ? 'image/png' : s.startsWith('UklG') ? 'image/webp' : 'image/jpeg';
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Anbieter ---------- */
const PROVIDERS = {
 /* Cloudflare Workers AI (FLUX.2 Klein/Dev): multipart, bis 4 Referenzbilder, Bild kommt als base64 */
 cloudflare: {
  models: {'flux-2-klein-4b': '@cf/black-forest-labs/flux-2-klein-4b', 'flux-2-klein-9b': '@cf/black-forest-labs/flux-2-klein-9b', 'flux-2-dev': '@cf/black-forest-labs/flux-2-dev'},
  async run(k, model, {prompt, images, w, h, seed}) {
   if (!k.account || !k.token) fail('failed-precondition', 'Cloudflare ist nicht eingerichtet (AV_PROVIDERS.cloudflare).');
   const form = new FormData(); form.append('prompt', prompt); form.append('width', String(w)); form.append('height', String(h)); if (Number.isInteger(seed)) form.append('seed', String(seed));
   images.forEach((im, i) => form.append('input_image_' + i, new Blob([Buffer.from(b64(im), 'base64')], {type: mimeOf(b64(im))}), 'ref' + i));
   const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${k.account}/ai/run/${this.models[model]}`, {method: 'POST', headers: {Authorization: 'Bearer ' + k.token}, body: form});
   const j = await r.json().catch(() => ({}));
   if (!j.success) { const m = (j.errors || []).map(e => e.message).join('; ') || ('HTTP ' + r.status); if (/4006|free allocation/i.test(m)) fail('resource-exhausted', 'Cloudflare: Tageskontingent aufgebraucht.'); if (/3030|flagged/i.test(m)) fail('aborted', 'Vom Sicherheitsfilter des Anbieters blockiert.'); fail('internal', 'Cloudflare: ' + m.slice(0, 300)); }
   return j.result.image;
  }},
 /* Black Forest Labs API: Anfrage, dann Ergebnis abholen (polling_url), Bild per URL */
 bfl: {
  models: {'flux-2-pro': 'flux-2-pro', 'flux-2-max': 'flux-2-max', 'flux-2-flex': 'flux-2-flex', 'flux-2-klein-9b': 'flux-2-klein-9b', 'flux-2-klein-4b': 'flux-2-klein-4b'},
  async run(k, model, {prompt, images, w, h, seed}) {
   if (!k.key) fail('failed-precondition', 'Black Forest Labs ist nicht eingerichtet (AV_PROVIDERS.bfl).');
   const body = {prompt, width: w, height: h, output_format: 'png'}; if (Number.isInteger(seed)) body.seed = seed;
   images.forEach((im, i) => { body[i ? 'input_image_' + (i + 1) : 'input_image'] = b64(im); });
   const r = await fetch('https://api.bfl.ai/v1/' + this.models[model], {method: 'POST', headers: {'x-key': k.key, 'Content-Type': 'application/json', accept: 'application/json'}, body: JSON.stringify(body)});
   const j = await r.json().catch(() => ({})); if (!r.ok || !j.polling_url) fail(r.status === 402 ? 'resource-exhausted' : 'internal', 'BFL: ' + String(j.detail || j.error || r.status).slice(0, 300));
   for (let i = 0; i < 120; i++) { await sleep(i < 10 ? 500 : 1000);
    const p = await (await fetch(j.polling_url, {headers: {'x-key': k.key, accept: 'application/json'}})).json().catch(() => ({}));
    if (p.status === 'Ready') { const img = await fetch(p.result.sample); return Buffer.from(await img.arrayBuffer()).toString('base64'); }
    if (['Error', 'Failed'].includes(p.status)) fail('internal', 'BFL: ' + JSON.stringify(p.details || p.status).slice(0, 200));
    if (p.status === 'Content Moderated' || p.status === 'Request Moderated') fail('aborted', 'Vom Sicherheitsfilter des Anbieters blockiert.'); }
   fail('deadline-exceeded', 'BFL: keine Antwort in der Zeit.');
  }},
};

exports.avModels = fn.https.onCall(async (data, ctx) => {
 if (!await isOwner(ctx)) fail('permission-denied', 'Nur für die Owner.');
 const k = keys(); return {providers: Object.entries(PROVIDERS).map(([id, p]) => ({id, ready: !!k[id], models: Object.keys(p.models)}))};
});

exports.avGen = fn.https.onCall(async (data, ctx) => {
 if (!await isOwner(ctx)) fail('permission-denied', 'Nur für die Owner.');
 const d = data || {}, prov = PROVIDERS[d.provider]; if (!prov) fail('invalid-argument', 'Unbekannter Anbieter.');
 const model = prov.models[d.model] ? d.model : Object.keys(prov.models)[0];
 const prompt = String(d.prompt || '').slice(0, 3000).trim(); if (!prompt) fail('invalid-argument', 'Kein Prompt.');
 const images = (Array.isArray(d.images) ? d.images : []).slice(0, 4).filter(s => typeof s === 'string' && s.length < 6e6);
 const w = Math.min(2048, Math.max(256, (d.w | 0) || 768)), h = Math.min(2048, Math.max(256, (d.h | 0) || 1024));
 /* Keine eigene Grenze. Klappt der gewählte Anbieter nicht (Kontingent, Störung, Filter, Zeitüberschreitung),
    springt automatisch der nächste eingerichtete Anbieter mit seinem Standardmodell ein. */
 const K = keys(), order = [[d.provider, model], ...Object.keys(PROVIDERS).filter(p => p !== d.provider && K[p]).map(p => [p, Object.keys(PROVIDERS[p].models)[0]])];
 const t0 = Date.now(); let image, err, used;
 for (const [p, m] of order) { if (!K[p]) { err = err || new functions.https.HttpsError('failed-precondition', p + ' ist nicht eingerichtet.'); continue; }
  try { image = await PROVIDERS[p].run(K[p], m, {prompt, images, w, h, seed: Number.isInteger(d.seed) ? d.seed : undefined}); used = [p, m]; err = null; break; }
  catch (e) { err = e; const c = e.code || ''; if (['invalid-argument', 'permission-denied'].includes(c)) break; } }
 await db.collection('avstudio/log/l').add({ts: Date.now(), provider: used ? used[0] : d.provider, model: used ? used[1] : model, wanted: d.provider + '/' + model, prompt: prompt.slice(0, 500), n: images.length, ms: Date.now() - t0, ok: !err, err: err ? String(err.message).slice(0, 200) : null}).catch(() => {});
 if (err) throw err instanceof functions.https.HttpsError ? err : new functions.https.HttpsError('internal', String(err.message || err).slice(0, 300));
 return {image, mime: mimeOf(image), provider: used[0], model: used[1], fallback: used[0] !== d.provider, ms: Date.now() - t0};
});
