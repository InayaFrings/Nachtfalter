/* Noctibat-Abo über Stripe (v932)
   - aboCheckout (aufrufbar aus der App): startet eine Stripe-Bezahlseite für Plus oder Premium, monatlich oder jährlich.
     Unter 18 nur mit E-Mail-Adresse und Zustimmung eines Elternteils (die Eltern bezahlen, die Rechnung geht an sie).
     Ohne ausdrückliche Zustimmung zum sofortigen Start (Widerrufsrecht erlischt) geht nichts los. Jede Zustimmung wird in aboLog protokolliert.
   - aboWebhook (Stripe ruft auf): schreibt den Abo-Status nach subs/<uid> = {p, e, ps, src:'stripe', cy, ce, st, sid, cus}.
     Nur dieser Weg (Admin-SDK) darf subs schreiben, die Firestore-Regeln lassen sonst nur Inayas Test-Abo zu.
   - aboCancel / aboResume (aufrufbar): kündigt zum Ende des bezahlten Zeitraums bzw. nimmt die Kündigung zurück.
   - v936: Abo-Werbebonus (refBonus, 500 Coins) und Sound-Bonus (sndBonus, 5 Coins je Benutzung, höchstens 300 am Tag), beides nur für Abonnenten.
   Einrichten (einmal, braucht ein Stripe-Konto eines Erwachsenen):
     firebase functions:secrets:set STRIPE_SECRET   (Geheimschlüssel sk_live_… bzw. zum Testen sk_test_…)
     firebase functions:secrets:set STRIPE_WHSEC    (Signatur-Geheimnis des Webhooks whsec_…)
     Webhook in Stripe: https://europe-west3-<projekt>.cloudfunctions.net/aboWebhook, Ereignisse customer.subscription.created/updated/deleted
   Lokal im Emulator ohne STRIPE_SECRET: aboCheckout gibt nur eine Test-Adresse zurück (DRY). */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const db = admin.firestore();
const REGION = 'europe-west3';
const SITE = 'https://www.noctibat.com/';
const EMU = !!process.env.FUNCTIONS_EMULATOR;
const SECRETS = EMU ? [] : ['STRIPE_SECRET', 'STRIPE_WHSEC'];
const fn = functions.region(REGION).runWith({maxInstances: 5, memory: '256MB', timeoutSeconds: 30, secrets: SECRETS});

/* Preise in Cent, wie in der App (ABO_P). Bei Änderung beide Stellen anpassen. */
const PLANS = {plus: {n: 'Noctibat Plus', m: 199, y: 1999}, premium: {n: 'Noctibat Premium', m: 1499, y: 14999}};
const MAIL_RX = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

let STRIPE = null;
function stripe(){ const k = process.env.STRIPE_SECRET; if (!k) return null; if (!STRIPE) STRIPE = require('stripe')(k); return STRIPE; }
const err = (code, msg) => new functions.https.HttpsError(code, msg);
/* Live- oder Testschlüssel? Kunden und Abos aus der Sandbox gelten im Live-Betrieb nicht (und umgekehrt). Alte Einträge ohne lv stammen aus der Sandbox. */
const LIVE = () => /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET || '');
const sameMode = d => !!(d && d.lv) === LIVE();

/* Alter aus dem Geburtsdatum im Profil (bd = JJJJ-MM-TT); ohne Datum gilt die Person als minderjährig */
function ageOf(bd){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(bd || '')); if (!m) return 0;
  const now = new Date(), a = now.getFullYear() - +m[1]; return now.getMonth() + 1 < +m[2] || (now.getMonth() + 1 === +m[2] && now.getDate() < +m[3]) ? a - 1 : a; }
async function birthOf(uid){ try { const p = await db.doc('profiles/' + uid).get(); return p.exists ? p.data().bd || '' : ''; } catch { return ''; } }

/* Laufzeit aus dem Stripe-Abo (neuere API-Versionen haben sie an den Positionen) */
function periodOf(sub){ const it = sub.items && sub.items.data && sub.items.data[0] || {};
  return {s: (it.current_period_start || sub.current_period_start || 0) * 1000, e: (it.current_period_end || sub.current_period_end || 0) * 1000,
    cy: (it.price && it.price.recurring && it.price.recurring.interval) === 'year' ? 'y' : 'm'}; }

/* Status nach subs/<uid>. Nur aktive bzw. zahlende Abos haben ein Ablaufdatum in der Zukunft. */
async function writeSub(sub){ const md = sub.metadata || {}, uid = md.uid, p = md.p; if (!uid || !PLANS[p]) { console.warn('Abo ohne uid/p', sub.id); return; }
  const per = periodOf(sub), live = ['active', 'trialing', 'past_due'].includes(sub.status);
  const e = live ? per.e : Math.min(per.e || Date.now(), (sub.ended_at || sub.canceled_at || Date.now() / 1000) * 1000);
  await db.doc('subs/' + uid).set({p, e: Math.round(e), ps: Math.round(per.s), src: 'stripe', cy: per.cy, ce: !!sub.cancel_at_period_end, st: sub.status, sid: sub.id, cus: String(sub.customer || ''), lv: !!sub.livemode});
  console.log('ABO', JSON.stringify({uid, p, st: sub.status, e: new Date(e).toISOString(), ce: !!sub.cancel_at_period_end}));
  if (live) await refBonus(uid).catch(err => console.error('ABO refBonus', err)); }

/* v936: Abo-Werbebonus. Wer über den eigenen Link eingeladen hat (refd/<neu>.by) und selbst ein Abo hat, bekommt einmal je Freund 500 Coins,
   sobald der Freund ein Abo abschließt. Gemerkt in aboRef/<freund> (nur Server). */
const live = s => s.exists && s.data().e > Date.now();
async function earns(uid){ if (live(await db.doc('subs/' + uid).get())) return true; try { const o = await db.doc('site/owner').get(); return o.exists && o.data().uid === uid; } catch { return false; } } /* Owner verdient auch ohne Abo */
async function refBonus(uid){ const r = await db.doc('refd/' + uid).get(); const by = r.exists ? r.data().by : ''; if (!by || by === uid) return;
  if (!await earns(by)) return;
  const mark = db.doc('aboRef/' + uid), wref = db.doc('wallet/' + by);
  await db.runTransaction(async t => { const [m, w] = await Promise.all([t.get(mark), t.get(wref)]); if (m.exists || !w.exists) return;
    t.update(wref, {c: (w.data().c || 0) + 500, op: {t: 'refabo', n: 500, from: uid}}); t.set(mark, {by, ts: Date.now()}); });
  console.log('ABO refBonus', JSON.stringify({by, uid})); }

/* v936: Sound-Bonus. Wird ein Noctibat-Sound in einem Beitrag oder einer Story benutzt (chats/snd_<musiker>_<k>/m/<autor>_<id>), bekommt die Musikerin
   bzw. der Musiker 5 Coins, höchstens 300 am Tag (deutsche Zeit, Feld sb = {d, n}), nur mit Abo und nicht für eigene Beiträge. */
const BTZ = new Intl.DateTimeFormat('en-US', {timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'});
function berlinDay(ms = Date.now()){ const p = Object.fromEntries(BTZ.formatToParts(new Date(ms)).map(x => [x.type, x.value])), o = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - (ms - ms % 1000); return Math.floor((ms + o) / 864e5); }
exports.sndBonus = fn.firestore.document('chats/{cid}/m/{mid}').onCreate(async (snap, ctx) => { const cid = ctx.params.cid; if (!cid.startsWith('snd_')) return;
  const mu = cid.split('_')[1], by = (snap.data() || {}).by; if (!mu || !by || by === mu || !ctx.params.mid.startsWith(by + '_')) return;
  if (!await earns(mu)) return;
  const day = berlinDay(), wref = db.doc('wallet/' + mu);
  await db.runTransaction(async t => { const w = await t.get(wref); if (!w.exists) return; const sb = w.data().sb && w.data().sb.d === day ? w.data().sb.n || 0 : 0; if (sb + 5 > 300) return;
    t.update(wref, {c: (w.data().c || 0) + 5, sb: {d: day, n: sb + 5}, op: {t: 'snd', n: 5}}); }); });

exports.aboCheckout = fn.https.onCall(async (data, ctx) => {
  const uid = ctx.auth && ctx.auth.uid; if (!uid) throw err('unauthenticated', 'Bitte melde dich an.');
  const p = data && data.p, y = !!(data && data.y), en = data && data.lang === 'en';
  if (!PLANS[p]) throw err('invalid-argument', 'Unbekanntes Abo.');
  if (!(data && data.wv === true)) throw err('failed-precondition', 'Bitte bestätige den sofortigen Start.');
  const cur = await db.doc('subs/' + uid).get();
  if (cur.exists && cur.data().src === 'stripe' && cur.data().e > Date.now() && sameMode(cur.data())) throw err('already-exists', 'Du hast schon ein Abo.');
  const bd = await birthOf(uid), adult = ageOf(bd) >= 18, pe = String(data && data.pe || '').trim().toLowerCase();
  if (!adult && !(data.pc === true && MAIL_RX.test(pe))) throw err('failed-precondition', 'Unter 18 braucht es die Zustimmung und E-Mail-Adresse eines Elternteils.');
  const mail = adult ? (ctx.auth.token.email || '') : pe, P = PLANS[p];
  await db.collection('aboLog').add({uid, p, y, wv: true, adult, pe: adult ? '' : pe, pc: adult ? false : true, ts: Date.now()});
  const S = stripe();
  if (!S) { if (EMU) { console.log('ABO DRY checkout', JSON.stringify({uid, p, y, adult, mail})); return {url: SITE + '?abo=dry'}; } throw err('unavailable', 'Die Bezahlung ist noch nicht eingerichtet.'); }
  /* Kunde je Person merken (server-intern, die Regeln lassen niemanden lesen) */
  const kref = db.doc('aboCus/' + uid), k = await kref.get(); let cus = k.exists && sameMode(k.data()) ? k.data().id : '';
  if (cus && mail && k.data().mail !== mail) { await S.customers.update(cus, {email: mail}); await kref.set({mail}, {merge: true}); }
  if (!cus) { const c = await S.customers.create({email: mail || undefined, metadata: {uid}}); cus = c.id; await kref.set({id: cus, mail, lv: LIVE()}); }
  const s = await S.checkout.sessions.create({mode: 'subscription', customer: cus, client_reference_id: uid, locale: en ? 'en' : 'de',
    line_items: [{quantity: 1, price_data: {currency: 'eur', unit_amount: y ? P.y : P.m, recurring: {interval: y ? 'year' : 'month'}, product_data: {name: P.n}}}],
    subscription_data: {metadata: {uid, p}}, metadata: {uid, p},
    success_url: SITE + '?abo=ok', cancel_url: SITE + '?abo=x'});
  return {url: s.url};
});

exports.aboWebhook = fn.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('POST'); return; }
  const wh = process.env.STRIPE_WHSEC, S = stripe() || (EMU ? require('stripe')('sk_test_emulator') : null);
  if (!wh || !S) { res.status(503).send('nicht eingerichtet'); return; }
  let ev; try { ev = S.webhooks.constructEvent(req.rawBody, req.get('stripe-signature'), wh); } catch (e) { res.status(400).send('Signatur'); return; }
  try { if (/^customer\.subscription\.(created|updated|deleted)$/.test(ev.type)) await writeSub(ev.data.object); res.json({ok: true}); }
  catch (e) { console.error('ABO webhook', e); res.status(500).send('Fehler'); }
});

async function mySub(ctx){ const uid = ctx.auth && ctx.auth.uid; if (!uid) throw err('unauthenticated', 'Bitte melde dich an.');
  const d = await db.doc('subs/' + uid).get(); if (!d.exists || d.data().src !== 'stripe' || !d.data().sid || !sameMode(d.data())) throw err('not-found', 'Kein Abo gefunden.');
  const S = stripe(); if (!S) throw err('unavailable', 'Die Bezahlung ist noch nicht eingerichtet.'); return {S, sid: d.data().sid}; }
exports.aboCancel = fn.https.onCall(async (data, ctx) => { const {S, sid} = await mySub(ctx); await writeSub(await S.subscriptions.update(sid, {cancel_at_period_end: true})); return {ok: true}; });
exports.aboResume = fn.https.onCall(async (data, ctx) => { const {S, sid} = await mySub(ctx); await writeSub(await S.subscriptions.update(sid, {cancel_at_period_end: false})); return {ok: true}; });

