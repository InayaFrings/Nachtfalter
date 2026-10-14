/* Noctibat: Push-Mitteilungen (Inaya, 2026-10-14)
   Läuft als Firebase Cloud Functions (braucht den Blaze-Tarif). Verschickt Mitteilungen über Firebase Cloud Messaging an die Geräte,
   deren Schlüssel unter data/users/<uid>/nf-push gespeichert sind (nur die Person selbst kann dort schreiben).
   - Anrufe: rings/<uid>/r/<id> neu → „Anna ruft an“
   - Nachrichten: chats/<cid>/m/<id> neu → an alle anderen Mitglieder, außer wer gerade online ist. Verschlüsselte Chats: nur „Neue Nachricht“, nie Inhalt.
   - Gästebuch: chats/wall_<uid>/m/<id> neu → an die Person, der das Gästebuch gehört
   - Freundschaftsanfragen: friends/<uid> geändert → an neu hinzugefügte Personen */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
const REGION = 'europe-west3'; // Frankfurt
const SITE = 'https://www.noctibat.com/';
const DRY = process.env.NF_PUSH_DRY === '1' || !!process.env.FUNCTIONS_EMULATOR; // lokal testen: nur protokollieren, nichts verschicken
const fn = functions.region(REGION).runWith({maxInstances: 5, memory: '256MB', timeoutSeconds: 30});

async function nameOf(uid){
  try { const h = await db.doc('handles/' + uid).get(); if (h.exists && h.data().n) return h.data().n; } catch {}
  try { const p = await db.doc('profiles/' + uid).get(); if (p.exists && p.data().name) return p.data().name; } catch {}
  return 'Jemand';
}
// Wer die App gerade offen hat, bekommt keine Mitteilung (sieht es ja schon)
async function onlineOf(uids){
  const on = new Set(); if (!uids.length) return on; const now = Date.now();
  for (let i = 0; i < uids.length; i += 30) {
    try { const q = await db.collection('presence/lobby/p').where('by', 'in', uids.slice(i, i + 30)).get();
      q.docs.forEach(d => { const x = d.data(); if (now - (+x.t || 0) < 300000) on.add(x.by); }); } catch {}
  }
  return on;
}
async function sendTo(uid, pref, msg){
  const ref = db.doc(`data/users/${uid}/nf-push`), d = await ref.get(); if (!d.exists) return;
  const x = d.data() || {}, prefs = x.prefs || {}; if (prefs[pref] === false) return;
  const toks = Object.entries(x.tokens || {}).filter(([, v]) => v && v.t); if (!toks.length) return;
  const data = {title: String(msg.title || 'Noctibat').slice(0, 120), body: String(msg.body || '').slice(0, 240), link: msg.link || SITE, tag: msg.tag || '', kind: msg.kind || ''};
  if (DRY) { console.log('PUSH', JSON.stringify({to: uid, pref, n: toks.length, ...data})); return; }
  const r = await admin.messaging().sendEachForMulticast({tokens: toks.map(([, v]) => v.t), data,
    webpush: {headers: {Urgency: msg.kind === 'call' ? 'high' : 'normal', TTL: String(msg.ttl || 86400)}, fcmOptions: {link: data.link}}});
  // abgelaufene Geräte-Schlüssel entfernen
  const dead = {}; r.responses.forEach((s, i) => { const c = s.error?.code || ''; if (!s.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(c)) dead[`tokens.${toks[i][0]}`] = admin.firestore.FieldValue.delete(); });
  if (Object.keys(dead).length) await ref.update(dead).catch(() => {});
}

exports.pushCall = fn.firestore.document('rings/{uid}/r/{rid}').onCreate(async (snap, ctx) => {
  const r = snap.data() || {}; if (!r.from || !r.cid) return;
  const [who, chat] = await Promise.all([nameOf(r.from), db.doc('chats/' + r.cid).get()]);
  const c = chat.exists ? chat.data() : {};
  await sendTo(ctx.params.uid, 'calls', {kind: 'call', ttl: 45, tag: 'call-' + ctx.params.rid,
    title: `${who} ruft an`, body: (r.kind === 'video' ? 'Videoanruf' : 'Anruf') + (c.group ? ` in „${c.name || 'Gruppe'}“` : '') + ' · tippen zum Annehmen',
    link: SITE + '?c=' + encodeURIComponent(r.cid)});
});

exports.pushMsg = fn.firestore.document('chats/{cid}/m/{mid}').onCreate(async (snap, ctx) => {
  const m = snap.data() || {}, cid = ctx.params.cid, mid = ctx.params.mid;
  if (!m.from || mid.startsWith('r_') || m.kind === 'react' || /^(zimmer_|pimg_)/.test(cid)) return; // Reaktionen, Zimmer, Bilder: keine Mitteilung
  if (Date.now() - (+m.ts || Date.now()) > 600000) return; // alte Nachrichten (z. B. Verlauf übertragen) nicht melden
  const who = await nameOf(m.from);
  if (cid.startsWith('wall_')) { const owner = cid.slice(5); if (owner === m.from) return;
    return sendTo(owner, 'gb', {tag: 'gb-' + owner, title: `${who} hat dir ins Gästebuch geschrieben`, body: String(m.text || '').slice(0, 140), link: SITE + '?p=' + encodeURIComponent(owner)}); }
  const chat = await db.doc('chats/' + cid).get(); if (!chat.exists) return;
  const c = chat.data(), to = (c.members || []).filter(u => u && u !== m.from); if (!to.length) return;
  const on = await onlineOf(to);
  const what = m.e2e ? 'Neue Nachricht' // verschlüsselt: der Server kennt den Inhalt nicht
    : m.text ? String(m.text).slice(0, 140) : m.audio?.voice ? '🎤 Sprachnachricht' : m.audio ? '🎵 Musik' : m.img ? '📷 Foto' : m.clip ? '🎬 Video' : m.stk ? 'Sticker' : m.gif ? 'GIF' : m.post ? '🖼 Beitrag' : m.story ? '📖 Story' : 'Neue Nachricht';
  const title = c.group ? `${who} in „${c.name || 'Gruppe'}“` : who;
  await Promise.all(to.filter(u => !on.has(u)).map(u => sendTo(u, 'msgs', {tag: 'chat-' + cid, title, body: what, link: SITE + '?c=' + encodeURIComponent(cid)}).catch(e => console.error('push', u, e.message))));
});

exports.pushFriend = fn.firestore.document('friends/{uid}').onWrite(async (ch, ctx) => {
  const before = new Set((ch.before.exists && ch.before.data().list) || []), after = (ch.after.exists && ch.after.data().list) || [];
  const added = after.filter(u => !before.has(u) && u !== ctx.params.uid); if (!added.length) return;
  const who = await nameOf(ctx.params.uid);
  for (const u of added.slice(0, 10)) {
    const theirs = await db.doc('friends/' + u).get(); const mutual = theirs.exists && (theirs.data().list || []).includes(ctx.params.uid);
    await sendTo(u, 'friends', {tag: 'fr-' + ctx.params.uid, title: mutual ? `${who} hat deine Freundschaftsanfrage angenommen` : `${who} möchte mit dir befreundet sein`, body: '', link: SITE + '?p=' + encodeURIComponent(ctx.params.uid)}).catch(() => {});
  }
});
