/* Nachtfalter auf eigener Webseite mit Firebase: bildet window.claude.use('db' | 'user' | 'room') auf
   Firebase Auth + Firestore ab, damit der Seiten-Code derselbe bleibt wie in der Claude-Version.
   Dazu NF_AUTH für Registrieren, Anmelden und „Passwort vergessen“ per E-Mail.
   Braucht window.NF_FIREBASE = {config, ownerEmail} und die Firebase-compat-Skripte (app, auth, firestore). */
(function(){
  const C = window.NF_FIREBASE;
  if (!C || !window.firebase) return;
  /* Mehrere Accounts wie bei Insta (Inaya, 2026-10-12): jeder gespeicherte Account hat einen eigenen Platz (eigene Firebase-App mit eigener Anmeldung).
     nf-acct = aktiver Platz ('' = Standard), nf-accts = Liste zum Anzeigen (keine Passwörter, die Anmeldung verwaltet Firebase selbst). */
  const LS = {get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }};
  const SLOT = /^[a-z0-9]{1,16}$/.test(LS.get('nf-acct') || '') ? LS.get('nf-acct') : '';
  const appOf = sl => sl ? (firebase.apps.find(a => a.name === 'nf-' + sl) || firebase.initializeApp(C.config, 'nf-' + sl)) : (firebase.apps.find(a => a.name === '[DEFAULT]') || firebase.initializeApp(C.config));
  const app = appOf(SLOT);
  const auth = app.auth(), fs = app.firestore();
  const accts = () => { try { const l = JSON.parse(LS.get('nf-accts') || '[]'); return Array.isArray(l) ? l.filter(x => x && typeof x.slot === 'string' && x.uid) : []; } catch { return []; } };
  const saveAccts = l => LS.set('nf-accts', JSON.stringify(l.slice(0, 8)));
  const go = sl => { LS.set('nf-acct', sl || null); location.reload(); };
  async function dropSlot(sl){ // Anmeldung auf diesem Platz beenden und den zwischengespeicherten Stand löschen
    try { const a = appOf(sl); await a.auth().signOut(); if (sl) await a.delete(); } catch {}
    LS.set('nachtfalter-v2' + (sl ? ':' + sl : ''), null); }
  // iPhone/iPad (Inaya, 2026-10-14): Die Streaming-Verbindung verlor dort das Schreiben still (Lesen ging weiter). Long Polling ist robuster.
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  fs.settings({ignoreUndefinedProperties: true, merge: true, ...(IOS ? {experimentalForceLongPolling: true, experimentalAutoDetectLongPolling: false} : {})});
  // Zwischenspeicher im Browser (Inaya, 2026-10-15): Nach dem Neuladen kommen Chats, Freunde, Mitteilungen und Nachrichten sofort vom Gerät,
  // der Server gleicht im Hintergrund ab (spart auch Lesevorgänge). Mehrere Tabs teilen ihn. Beim Abmelden wird er gelöscht.
  const CACHE = fs.enablePersistence().then(() => true).catch(() => false); // nur ein Tab nutzt den Zwischenspeicher, weitere Tabs laufen ohne (die Mehr-Tab-Abstimmung der Bibliothek stürzte in Tests gelegentlich ab)
  auth.languageCode = 'de';
  let user = null;
  const ready = new Promise(res => { const off = auth.onAuthStateChanged(u => { user = u; off(); res(); }); });
  auth.onAuthStateChanged(u => { user = u; });

  /* ---------- Datenbank: Firestore hat schon dieselbe Form (collection/doc/where/orderBy/onSnapshot) ---------- */
  const db = {collection: p => fs.collection(p), doc: p => fs.doc(p), batch: () => fs.batch(), runTransaction: f => fs.runTransaction(f),
    lp: IOS, // Verbindungsart (für den Selbsttest)
    reconnect: async () => { try { await fs.disableNetwork(); } catch {} try { await fs.enableNetwork(); } catch {} }, // hängende Verbindung neu aufbauen; wartende Schreibvorgänge gehen danach raus
    pending: ms => Promise.race([fs.waitForPendingWrites().then(() => true), new Promise(r => setTimeout(() => r(false), ms))])}; // Transaktionen: Plätze in Anrufen (Inaya, 2026-10-13)

  /* ---------- Wer ist angemeldet ---------- */
  const me = {
    async id(){ await ready; return user ? user.uid : null; },
    async isOwner(){ await ready; return !!(user && user.email && C.ownerEmail && user.email.toLowerCase() === C.ownerEmail.toLowerCase()); },
    async me(){ await ready; return user ? {id: user.uid} : null; },
    canEdit: () => false
  };

  /* ---------- Räume: Anwesenheit als kleine Dokumente mit Herzschlag ---------- */
  const STALE = 300000; // Online-Anzeige (Inaya, 2026-10-14): Herzschlag alle 2 Minuten statt alle 25 Sekunden, das Tageskontingent war aufgebraucht
  function mkRoom(name){
    const key = Math.random().toString(36).slice(2, 10);
    const coll = fs.collection('presence').doc(name.replace(/[\/]/g, '_')).collection('p');
    let state = {}, beat = null, unsub = null, peersCb = null, last = [];
    const write = () => user && coll.doc(key).set({...state, by: user.uid, t: Date.now()}).catch(() => {});
    function listen(){
      if (unsub) return;
      if (Math.random() < 0.2) coll.where('t', '<', Date.now() - 3600000).limit(30).get().then(q => q.docs.forEach(d => d.ref.delete().catch(() => {}))).catch(() => {}); // liegengebliebene Einträge abgestürzter Geräte wegräumen
      unsub = coll.where('t', '>', Date.now() - STALE).onSnapshot(snap => { // nur aktuelle, nicht jedes Mal alle alten Einträge lesen
        const now = Date.now();
        last = snap.docs.map(d => ({peer: d.id, by: d.data().by, presence: d.data()})).filter(p => now - (p.presence.t || 0) < STALE);
        peersCb && peersCb({peers: last, joined: [], left: [], updated: []});
      }, () => {});
    }
    const refresh = setInterval(() => { if (peersCb && last.length) { const now = Date.now(); const f = last.filter(p => now - (p.presence.t || 0) < STALE); if (f.length !== last.length) { last = f; peersCb({peers: f, joined: [], left: [], updated: []}); } } }, 15000);
    const bye = () => { if (beat) coll.doc(key).delete().catch(() => {}); };
    addEventListener('pagehide', bye);
    // App im Hintergrund (iPhone: App gewechselt, Bildschirm aus) = offline, sofort abmelden; beim Zurückkommen sofort wieder online (Inaya, 2026-10-13)
    const vis = () => { if (!beat) return; if (document.visibilityState === 'hidden') { clearInterval(beat); beat = 1; coll.doc(key).delete().catch(() => {}); } else { write(); clearInterval(beat); beat = setInterval(write, 120000); } };
    document.addEventListener('visibilitychange', vis);
    return {
      name,
      async presence(p){ state = {...state, ...p}; await write(); if (!beat || beat === 1) beat = setInterval(write, 120000); listen(); },
      onPeers(fn){ peersCb = fn; listen(); return () => { peersCb = null; }; },
      emit(){}, on(){ return () => {}; },
      async leave(){ clearInterval(beat); clearInterval(refresh); removeEventListener('pagehide', bye); document.removeEventListener('visibilitychange', vis); if (beat) { beat = null; await coll.doc(key).delete().catch(() => {}); } if (unsub) { unsub(); unsub = null; } },
      async join(n){ return mkRoom(n); }
    };
  }
  let lobby = null;

  window.claude = {use: async n => {
    await ready;
    if (!user) return null;
    if (n === 'db') return db;
    if (n === 'user') return me;
    if (n === 'room') return lobby || (lobby = mkRoom('lobby'));
    return null;
  }};

  /* ---------- Konto ---------- */
  const de = e => {
    const c = (e && e.code) || '';
    if (c.includes('email-already-in-use')) return 'Mit dieser E-Mail gibt es schon ein Konto. Melde dich stattdessen an.';
    if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found') || c.includes('invalid-login')) return 'E-Mail oder Passwort stimmen nicht.';
    if (c.includes('invalid-email')) return 'Das ist keine gültige E-Mail-Adresse.';
    if (c.includes('weak-password')) return 'Das Passwort ist zu kurz. Nimm mindestens 6 Zeichen.';
    if (c.includes('too-many-requests')) return 'Zu viele Versuche. Warte kurz und probier es dann nochmal.';
    if (c.includes('requires-recent-login')) return 'Bitte melde dich einmal neu an und versuch es dann nochmal.';
    if (c.includes('network')) return 'Keine Verbindung. Prüf dein Internet und probier es nochmal.';
    return 'Das hat gerade nicht geklappt. Probier es gleich nochmal.';
  };
  const back = () => location.origin + location.pathname;
  window.NF_AUTH = {
    ready,
    resetViaMail: true, // Firebase zeigt die Seite zum neuen Passwort selbst an
    email: () => user ? user.email : null,
    async signUp(email, pw){ try { const r = await auth.createUserWithEmailAndPassword(email, pw); user = r.user; return {ok: true, needsConfirm: false}; } catch (e) { return {error: de(e)}; } },
    async signIn(email, pw){ try { const r = await auth.signInWithEmailAndPassword(email, pw); user = r.user; return {ok: true}; } catch (e) { return {error: de(e)}; } },
    async signOut(){ try { await auth.signOut(); } catch {} user = null; try { if (await CACHE) { await fs.terminate(); await fs.clearPersistence(); } } catch {} }, // Zwischenspeicher dieses Kontos vom Gerät löschen
    async resetPw(email){ try { await auth.sendPasswordResetEmail(email, {url: back()}); return {ok: true}; } catch (e) { return e && e.code && e.code.includes('user-not-found') ? {ok: true} : {error: de(e)}; } },
    async updatePw(pw){ try { await auth.currentUser.updatePassword(pw); return {ok: true}; } catch (e) { return {error: de(e)}; } },
    async updateEmail(email){ try { await auth.currentUser.verifyBeforeUpdateEmail(email, {url: back()}); return {ok: true}; } catch (e) { return {error: de(e)}; } },
    async reauth(pw){ try { await auth.currentUser.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(auth.currentUser.email, pw)); return {ok: true}; } catch (e) { return {error: de(e)}; } },
    async deleteUser(){ try { await auth.currentUser.delete(); user = null; return {ok: true}; } catch (e) { return {error: de(e)}; } },
    // Nutzername → E-Mail fürs Anmelden (geht auch ohne Anmeldung, aber nur einzeln)
    async lookup(h){ try { const d = await fs.doc('logins/' + h).get(); return {d: d.exists ? d.data() : null}; } catch (e) { return e && e.code === 'permission-denied' ? {old: true} : {error: true}; } }, // seit 2026-10-15 nur noch verschlüsselte Einträge (v:2), alte mit offener E-Mail sind gesperrt
    // Einmal-Einladungslinks: vor der Anmeldung prüfen, direkt nach dem Registrieren verbrauchen
    async checkInvite(t){ try { const d = await fs.doc('invites/' + t).get(); return {ok: d.exists && !d.data().usedBy}; } catch (e) { return {error: true}; } },
    async claimRef(r){ try { const uid = auth.currentUser.uid; if (!r || r === uid) return {ok: false}; const b = fs.batch(); b.set(fs.doc('refd/' + uid), {by: r, ts: Date.now()}); b.set(fs.doc('refc/' + r), {u: {[uid]: true}}, {merge: true}); await b.commit(); return {ok: true}; } catch (e) { return {error: true}; } }, // Einladen mit eigenem Link (Inaya, 2026-10-17)
    async claimInvite(t){ try { const uid = auth.currentUser.uid; await fs.doc('invites/' + t).update({usedBy: uid, usedTs: Date.now()}); await fs.doc('members/' + uid).set({inv: t, ts: Date.now()}); return {ok: true}; } catch (e) { return {error: true}; } },
    // Mehrere Accounts
    slot: SLOT,
    accounts: accts,
    remember(info){ // Anzeige-Daten des angemeldeten Accounts merken (Name, Bild, Farben)
      if (!user) return; const l0 = accts();
      l0.filter(x => x.uid === user.uid && x.slot !== SLOT).forEach(x => dropSlot(x.slot)); // derselbe Account doppelt: nur einmal behalten
      const l = l0.filter(x => x.uid !== user.uid || x.slot === SLOT), e = {...info, slot: SLOT, uid: user.uid, ts: Date.now()}, i = l.findIndex(x => x.slot === SLOT);
      if (i < 0) l.push(e); else l[i] = e; saveAccts(l); },
    switchTo(sl){ if (sl === SLOT || !accts().some(x => x.slot === sl)) return; go(sl); },
    addNew(){ if (accts().length >= 8) return false; let sl; do { sl = 'a' + Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 4); } while (accts().some(x => x.slot === sl)); go(sl); return true; },
    async remove(sl){ if (sl === SLOT) return; saveAccts(accts().filter(x => x.slot !== sl)); await dropSlot(sl); },
    forget(){ const l = accts().filter(x => x.slot !== SLOT); saveAccts(l); LS.set('nf-acct', l[0] ? l[0].slot || null : null); }, // nach Abmelden: zum nächsten gespeicherten Account
    back(){ const l = accts().filter(x => x.slot !== SLOT); return l[0] || null; }, // beim Hinzufügen: zurück zum vorherigen Account
    onRecovery(){},
    get recovering(){ return false; }
  };
})();
