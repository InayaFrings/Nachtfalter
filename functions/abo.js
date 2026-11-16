/* Noctibat-Abo über Stripe (v932)
   - aboCheckout (aufrufbar aus der App): startet eine Stripe-Bezahlseite für Plus oder Premium, monatlich oder jährlich.
     Unter 18 nur mit E-Mail-Adresse und Zustimmung eines Elternteils (die Eltern bezahlen, die Rechnung geht an sie).
     Ohne ausdrückliche Zustimmung zum sofortigen Start (Widerrufsrecht erlischt) geht nichts los. Jede Zustimmung wird in aboLog protokolliert.
   - aboWebhook (Stripe ruft auf): schreibt den Abo-Status nach subs/<uid> = {p, e, ps, src:'stripe', cy, ce, st, sid, cus}.
     Nur dieser Weg (Admin-SDK) darf subs schreiben, die Firestore-Regeln lassen sonst nur Inayas Test-Abo zu.
   - aboCancel / aboResume (aufrufbar): kündigt zum Ende des bezahlten Zeitraums bzw. nimmt die Kündigung zurück.
   - v1010: Erster Monat gratis (TRIAL_DAYS), einmal je Person: nicht, wenn es schon ein Live-Abo gab (subs/<uid> mit lv) oder aboCus/<uid>.tr gesetzt ist.
     Stripe verlangt trotzdem eine Zahlungsart; ohne Kündigung startet danach automatisch das bezahlte Abo. handles/<uid>.ab/ap schreibt der Webhook mit,
     damit andere Abo-Gestaltung sofort richtig sehen (auch bei Verlängerung oder Ablauf, wenn die App der Person zu ist).
   - v936: Abo-Werbebonus (refBonus, 500 Coins) und Sound-Bonus (sndBonus, 5 Coins je Benutzung, höchstens 300 am Tag), beides nur für Abonnenten.
   Einrichten (einmal, braucht ein Stripe-Konto eines Erwachsenen):
     firebase functions:secrets:set STRIPE_SECRET   (Geheimschlüssel sk_live_… bzw. zum Testen sk_test_…)
     firebase functions:secrets:set STRIPE_WHSEC    (Signatur-Geheimnis des Webhooks whsec_…)
     Webhook in Stripe: https://europe-west3-<projekt>.cloudfunctions.net/aboWebhook, Ereignisse customer.subscription.created/updated/deleted
   - v1018: Nocti-Coins kaufen (coinCheckout, einmalige Zahlung, COINS). Der Webhook schreibt die Coins bei checkout.session.completed bzw.
     checkout.session.async_payment_succeeded gut (einmal je Bezahlung, gemerkt in coinBuy/<session>). Diese zwei Ereignisse im Stripe-Webhook zusätzlich auswählen.
     Schneller zur Bezahlseite: {warm:1} weckt die Funktion schon beim Öffnen der Abo-Karte (kein Kaltstart beim Antippen), Abfragen laufen parallel.
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
const TRIAL_DAYS = 30;
/* v1018: Coin-Pakete (wie COIN_P in der App) */
const COINS = {c1: {n: 1000, ct: 99}, c3: {n: 3000, ct: 399}, c6: {n: 6000, ct: 699}};
const MAIL_RX = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

let STRIPE = null;
function stripe(){ const k = process.env.STRIPE_SECRET; if (!k) return null; if (!STRIPE) STRIPE = require('stripe')(k, {httpAgent: new (require('https').Agent)({keepAlive: true}), timeout: 20000, maxNetworkRetries: 1}); return STRIPE; } /* v1021: Verbindung offen halten */
/* v1021 (Inaya: Bezahlseite lädt ewig): Aufwecken öffnet schon die Verbindungen zu Firestore und Stripe (vorher dauerte der erste echte Aufruf trotzdem über 5 s) */
async function warmUp(uid){ const S = stripe(), t = Date.now(); await Promise.all([uid ? db.doc('aboCus/' + uid).get().catch(() => null) : db.doc('site/owner').get().catch(() => null), S ? S.customers.list({limit: 1}).catch(() => null) : null]); console.log('WARM', Date.now() - t, 'ms'); return {ok: true}; }
const err = (code, msg) => new functions.https.HttpsError(code, msg);
/* Live- oder Testschlüssel? Kunden und Abos aus der Sandbox gelten im Live-Betrieb nicht (und umgekehrt). Alte Einträge ohne lv stammen aus der Sandbox. */
const LIVE = () => /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET || '');
const sameMode = d => !!(d && d.lv) === LIVE();

/* Alter aus dem Geburtsdatum im Profil (bd = JJJJ-MM-TT); ohne Datum gilt die Person als minderjährig */
function ageOf(bd){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(bd || '')); if (!m) return 0;
  const now = new Date(), a = now.getFullYear() - +m[1]; return now.getMonth() + 1 < +m[2] || (now.getMonth() + 1 === +m[2] && now.getDate() < +m[3]) ? a - 1 : a; }
async function birthOf(uid){ try { const q = await db.collection('profiles').where(admin.firestore.FieldPath.documentId(), '==', uid).select('bd').get(); return q.empty ? '' : q.docs[0].get('bd') || ''; } catch { return ''; } } /* v1018: nur bd lesen, Profile sind bis 240 KB groß */

/* Laufzeit aus dem Stripe-Abo (neuere API-Versionen haben sie an den Positionen) */
function periodOf(sub){ const it = sub.items && sub.items.data && sub.items.data[0] || {};
  return {s: (it.current_period_start || sub.current_period_start || 0) * 1000, e: (it.current_period_end || sub.current_period_end || 0) * 1000,
    cy: (it.price && it.price.recurring && it.price.recurring.interval) === 'year' ? 'y' : 'm'}; }

/* Status nach subs/<uid>. Nur aktive bzw. zahlende Abos haben ein Ablaufdatum in der Zukunft. */
/* v1034: Bestes Abo einer Person. Stripe-Ereignisse kommen nicht immer der Reihe nach, und eine Person kann mehrere Abos haben (z. B. abgebrochene Bezahlseite = incomplete,
   altes gekündigtes Abo). Vorher schrieb jedes Ereignis blind sein eigenes Abo nach subs/<uid>, ein spätes oder fremdes Ereignis setzte ein laufendes Abo auf abgelaufen (Abzeichen und Funktionen weg).
   Jetzt fragt der Server Stripe nach allen Abos des Kunden mit dieser uid: ein laufendes (active, trialing, past_due) mit dem spätesten Ende gewinnt, sonst das neueste. */
const LIVE_ST = ['active', 'trialing', 'past_due'];
async function bestSub(S, cus, uid, fb){ if (!S || !cus) return fb; try { const r = await S.subscriptions.list({customer: cus, status: 'all', limit: 20});
    const all = (r.data || []).filter(x => (x.metadata || {}).uid === uid && PLANS[(x.metadata || {}).p]); if (!all.length) return fb;
    const lv = all.filter(x => LIVE_ST.includes(x.status)).sort((a, b) => periodOf(b).e - periodOf(a).e);
    return lv[0] || all.sort((a, b) => (b.created || 0) - (a.created || 0))[0]; } catch (e) { console.error('ABO bestSub', e && e.message); return fb; } }
async function writeSub(sub0, best = true){ const md0 = sub0.metadata || {}; if (!md0.uid || !PLANS[md0.p]) { console.warn('Abo ohne uid/p', sub0.id); return; }
  const sub = best ? await bestSub(stripe(), String(sub0.customer || ''), md0.uid, sub0) : sub0;
  if (sub.id !== sub0.id) console.log('ABO best', JSON.stringify({ev: sub0.id, st: sub0.status, best: sub.id, bst: sub.status}));
  const md = sub.metadata || {}, uid = md.uid, p = md.p;
  const per = periodOf(sub), live = ['active', 'trialing', 'past_due'].includes(sub.status);
  const e = live ? per.e : Math.min(per.e || Date.now(), (sub.ended_at || sub.canceled_at || Date.now() / 1000) * 1000);
  const tri = sub.status === 'trialing' || !!sub.trial_end;
  /* Gratis-Monat nur einmal je Konto: hat schon ein anderes Abo den Gratis-Monat bekommen (z. B. zwei Bezahlseiten gleichzeitig geöffnet), startet dieses sofort bezahlt */
  if (sub.status === 'trialing') { const kref = db.doc('aboCus/' + uid), kd = (await kref.get()).data() || {};
    if (kd.tr && kd.trs && kd.trs !== sub.id) { const S = stripe(); if (S) { console.warn('ABO zweiter Gratis-Monat', uid, sub.id); return writeSub(await S.subscriptions.update(sub.id, {trial_end: 'now'}), false); } }
    if (!kd.trs) await kref.set({tr: Date.now(), trs: sub.id}, {merge: true}); }
  await db.doc('subs/' + uid).set({p, e: Math.round(e), ps: Math.round(per.s), src: 'stripe', cy: per.cy, ce: !!sub.cancel_at_period_end, st: sub.status, sid: sub.id, cus: String(sub.customer || ''), lv: !!sub.livemode, tu: tri, te: sub.trial_end ? sub.trial_end * 1000 : 0, cr: (sub.created || 0) * 1000});
  await db.doc('handles/' + uid).set({ab: live ? Math.round(e) : 0, ap: live ? p : ''}, {merge: true}).catch(err => console.error('ABO handles', err));
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

/* Kunde je Person (server-intern, die Regeln lassen niemanden lesen) */
async function customerOf(S, uid, mail, k){ const kref = db.doc('aboCus/' + uid); let cus = k.exists && sameMode(k.data()) ? k.data().id : '';
  if (cus && mail && k.data().mail !== mail) { await S.customers.update(cus, {email: mail}); await kref.set({mail}, {merge: true}); }
  if (!cus) { const c = await S.customers.create({email: mail || undefined, metadata: {uid}}); cus = c.id; await kref.set({id: cus, mail, lv: LIVE()}); }
  return cus; }
exports.aboCheckout = fn.https.onCall(async (data, ctx) => {
  if (data && data.warm) return warmUp(ctx.auth && ctx.auth.uid); /* v1018: nur aufwecken */
  const T0 = Date.now();
  const uid = ctx.auth && ctx.auth.uid; if (!uid) throw err('unauthenticated', 'Bitte melde dich an.');
  const p = data && data.p, y = !!(data && data.y), en = data && data.lang === 'en';
  if (!PLANS[p]) throw err('invalid-argument', 'Unbekanntes Abo.');
  if (!(data && data.wv === true)) throw err('failed-precondition', 'Bitte bestätige den sofortigen Start.');
  const [cur, bd, k] = await Promise.all([db.doc('subs/' + uid).get(), birthOf(uid), db.doc('aboCus/' + uid).get()]); /* v1018: parallel */
  if (cur.exists && cur.data().src === 'stripe' && cur.data().e > Date.now() && sameMode(cur.data())) throw err('already-exists', 'Du hast schon ein Abo.');
  const adult = ageOf(bd) >= 18, pe = String(data && data.pe || '').trim().toLowerCase();
  if (!adult && !(data.pc === true && MAIL_RX.test(pe))) throw err('failed-precondition', 'Unter 18 braucht es die Zustimmung und E-Mail-Adresse eines Elternteils.');
  const mail = adult ? (ctx.auth.token.email || '') : pe, P = PLANS[p];
  const log = db.collection('aboLog').add({uid, p, y, wv: true, tw: data.tw === true, adult, pe: adult ? '' : pe, pc: adult ? false : true, ts: Date.now()});
  const S = stripe();
  if (!S) { await log; if (EMU) { console.log('ABO DRY checkout', JSON.stringify({uid, p, y, adult, mail})); return {url: SITE + '?abo=dry'}; } throw err('unavailable', 'Die Bezahlung ist noch nicht eingerichtet.'); }
  const cus = await customerOf(S, uid, mail, k);
  /* v1010: erster Monat gratis, nur wer noch nie ein Live-Abo hatte und noch keinen Gratis-Monat */
  const trial = !(k.exists && k.data().tr) && !(cur.exists && cur.data().src === 'stripe' && sameMode(cur.data()));
  const s = await S.checkout.sessions.create({mode: 'subscription', customer: cus, client_reference_id: uid, locale: en ? 'en' : 'de', payment_method_collection: 'always',
    line_items: [{quantity: 1, price_data: {currency: 'eur', unit_amount: y ? P.y : P.m, recurring: {interval: y ? 'year' : 'month'}, product_data: {name: P.n}}}],
    subscription_data: {metadata: {uid, p}, ...(trial ? {trial_period_days: TRIAL_DAYS, trial_settings: {end_behavior: {missing_payment_method: 'cancel'}}} : {})}, metadata: {uid, p, tr: trial ? '1' : ''},
    success_url: SITE + '?abo=ok', cancel_url: SITE + '?abo=x'});
  await log; console.log('ABO checkout', Date.now() - T0, 'ms');
  return {url: s.url, trial};
});

/* v1018: Nocti-Coins kaufen (einmalige Zahlung). Gleiche Regeln wie beim Abo: unter 18 nur mit Elternteil, Zustimmung zur sofortigen Lieferung (Widerrufsrecht erlischt). */
exports.coinCheckout = fn.https.onCall(async (data, ctx) => {
  if (data && data.warm) return warmUp(ctx.auth && ctx.auth.uid);
  const T0 = Date.now();
  const uid = ctx.auth && ctx.auth.uid; if (!uid) throw err('unauthenticated', 'Bitte melde dich an.');
  const ck = data && data.k, C = COINS[ck], en = data && data.lang === 'en'; if (!C) throw err('invalid-argument', 'Unbekanntes Paket.');
  if (!(data && data.wv === true)) throw err('failed-precondition', 'Bitte bestätige die sofortige Lieferung.');
  const [bd, k, w] = await Promise.all([birthOf(uid), db.doc('aboCus/' + uid).get(), db.doc('wallet/' + uid).get()]);
  if (!w.exists) throw err('failed-precondition', 'Öffne einmal den Shop, dann geht es.');
  const adult = ageOf(bd) >= 18, pe = String(data && data.pe || '').trim().toLowerCase();
  if (!adult && !(data.pc === true && MAIL_RX.test(pe))) throw err('failed-precondition', 'Unter 18 braucht es die Zustimmung und E-Mail-Adresse eines Elternteils.');
  const mail = adult ? (ctx.auth.token.email || '') : pe;
  const log = db.collection('aboLog').add({uid, coins: ck, wv: true, adult, pe: adult ? '' : pe, pc: adult ? false : true, ts: Date.now()});
  const S = stripe();
  if (!S) { await log; if (EMU) { console.log('COIN DRY checkout', JSON.stringify({uid, ck, adult})); return {url: SITE + '?coins=dry'}; } throw err('unavailable', 'Die Bezahlung ist noch nicht eingerichtet.'); }
  const cus = await customerOf(S, uid, mail, k);
  const s = await S.checkout.sessions.create({mode: 'payment', customer: cus, client_reference_id: uid, locale: en ? 'en' : 'de',
    line_items: [{quantity: 1, price_data: {currency: 'eur', unit_amount: C.ct, product_data: {name: C.n.toLocaleString('de-DE') + ' Nocti-Coins'}}}],
    metadata: {uid, coins: ck}, payment_intent_data: {metadata: {uid, coins: ck}},
    success_url: SITE + '?coins=ok', cancel_url: SITE + '?coins=x'});
  await log; console.log('COIN checkout', Date.now() - T0, 'ms');
  return {url: s.url};
});
/* Coins gutschreiben, einmal je Bezahlung */
async function coinCredit(cs){ const md = cs.metadata || {}, uid = md.uid, C = COINS[md.coins]; if (!uid || !C || cs.payment_status !== 'paid') return;
  const mark = db.doc('coinBuy/' + cs.id), wref = db.doc('wallet/' + uid);
  await db.runTransaction(async t => { const [m, w] = await Promise.all([t.get(mark), t.get(wref)]); if (m.exists) return; if (!w.exists) throw new Error('kein Wallet ' + uid);
    t.update(wref, {c: (w.data().c || 0) + C.n, op: {t: 'coinbuy', n: C.n, k: md.coins}}); t.set(mark, {uid, k: md.coins, n: C.n, ct: cs.amount_total || C.ct, lv: LIVE(), ts: Date.now()}); });
  console.log('COIN credit', JSON.stringify({uid, k: md.coins, s: cs.id})); }

exports.aboWebhook = fn.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('POST'); return; }
  const wh = process.env.STRIPE_WHSEC, S = stripe() || (EMU ? require('stripe')('sk_test_emulator') : null);
  if (!wh || !S) { res.status(503).send('nicht eingerichtet'); return; }
  let ev; try { ev = S.webhooks.constructEvent(req.rawBody, req.get('stripe-signature'), wh); } catch (e) { res.status(400).send('Signatur'); return; }
  try { if (/^customer\.subscription\.(created|updated|deleted)$/.test(ev.type)) await writeSub(ev.data.object);
    else if (/^checkout\.session\.(completed|async_payment_succeeded)$/.test(ev.type) && ev.data.object.mode === 'payment') await coinCredit(ev.data.object);
    res.json({ok: true}); }
  catch (e) { console.error('ABO webhook', e); res.status(500).send('Fehler'); }
});

async function mySub(ctx){ const uid = ctx.auth && ctx.auth.uid; if (!uid) throw err('unauthenticated', 'Bitte melde dich an.');
  const d = await db.doc('subs/' + uid).get(); if (!d.exists || d.data().src !== 'stripe' || !d.data().sid || !sameMode(d.data())) throw err('not-found', 'Kein Abo gefunden.');
  const S = stripe(); if (!S) throw err('unavailable', 'Die Bezahlung ist noch nicht eingerichtet.'); const b = await bestSub(S, d.data().cus, uid, null); return {S, sid: b && LIVE_ST.includes(b.status) ? b.id : d.data().sid}; } /* v1034: das laufende Abo kündigen, nicht ein altes */
/* v1034: Abo-Stand neu von Stripe holen (die App ruft das einmal je Sitzung, wenn ein Stripe-Abo abgelaufen aussieht oder nach der Rückkehr von der Bezahlseite) */
/* v1035: Kunden einer Person: aboCus, subs und zur Sicherheit die Stripe-Suche nach metadata.uid (falls aboCus/subs fehlen oder auf einen anderen Kunden zeigen) */
async function cusOf(S, uid, k, d){ const set = new Set(); if (k && k.exists && sameMode(k.data()) && k.data().id) set.add(k.data().id);
  if (d && d.exists && d.data().src === 'stripe' && sameMode(d.data()) && d.data().cus) set.add(d.data().cus);
  try { const r = await S.customers.search({query: `metadata['uid']:'${String(uid).replace(/'/g, '')}'`, limit: 10}); (r.data || []).forEach(c => set.add(c.id)); } catch (e) { console.error('ABO cus search', e && e.message); }
  return [...set]; }
/* v1035 (Inaya: Abo von @fynn.frings war weg): Abo frisch aus Stripe holen. Die Owner darf das für jedes Konto (data.uid) und bekommt den Stand zurück. */
exports.aboRefresh = fn.https.onCall(async (data, ctx) => { const me = ctx.auth && ctx.auth.uid; if (!me) throw err('unauthenticated', 'Bitte melde dich an.');
  let uid = me, own = false; if (data && data.uid && data.uid !== me) { const o = await db.doc('site/owner').get(); if (!(o.exists && o.data().uid === me)) throw err('permission-denied', 'Nur die Owner.'); uid = String(data.uid); own = true; }
  const S = stripe(); if (!S) return {ok: false, why: 'stripe'};
  const [k, d] = await Promise.all([db.doc('aboCus/' + uid).get(), db.doc('subs/' + uid).get()]);
  const cus = await cusOf(S, uid, k, d); if (!cus.length) { console.log('ABO refresh', JSON.stringify({uid, own, none: 'cus'})); return {ok: true, none: true, why: 'cus'}; }
  let best = null, n = 0; for (const c of cus) { const b = await bestSub(S, c, uid, null); if (!b) continue; n++;
    const bl = LIVE_ST.includes(b.status), cl = best && LIVE_ST.includes(best.status);
    if (!best || (bl && !cl) || (bl === cl && (bl ? periodOf(b).e > periodOf(best).e : (b.created || 0) > (best.created || 0)))) best = b; }
  if (!best) { console.log('ABO refresh', JSON.stringify({uid, own, cus, none: 'sub'})); return {ok: true, none: true, why: 'sub', cus: cus.length}; }
  if (!(k.exists && sameMode(k.data()) && k.data().id)) await db.doc('aboCus/' + uid).set({id: String(best.customer), lv: LIVE()}, {merge: true});
  await writeSub(best, false); const per = periodOf(best);
  console.log('ABO refresh', JSON.stringify({uid, own, st: best.status, sub: best.id}));
  return {ok: true, st: best.status, p: (best.metadata || {}).p, e: per.e, ce: !!best.cancel_at_period_end, tr: best.trial_end ? best.trial_end * 1000 : 0, n}; });

exports.aboCancel = fn.https.onCall(async (data, ctx) => { const {S, sid} = await mySub(ctx); await writeSub(await S.subscriptions.update(sid, {cancel_at_period_end: true})); return {ok: true}; });
exports.aboResume = fn.https.onCall(async (data, ctx) => { const {S, sid} = await mySub(ctx); await writeSub(await S.subscriptions.update(sid, {cancel_at_period_end: false})); return {ok: true}; });

