/* Nachtfalter auf eigener Webseite mit Firebase: bildet window.claude.use('db' | 'user' | 'room') auf
   Firebase Auth + Firestore ab, damit der Seiten-Code derselbe bleibt wie in der Claude-Version.
   Dazu NF_AUTH für Registrieren, Anmelden und „Passwort vergessen“ per E-Mail.
   Braucht window.NF_FIREBASE = {config, ownerEmail} und die Firebase-compat-Skripte (app, auth, firestore). */
(function(){
  const C = window.NF_FIREBASE;
  if (!C || !window.firebase) return;
  firebase.initializeApp(C.config);
  const auth = firebase.auth(), fs = firebase.firestore();
  fs.settings({ignoreUndefinedProperties: true, merge: true});
  auth.languageCode = 'de';
  let user = null;
  const ready = new Promise(res => { const off = auth.onAuthStateChanged(u => { user = u; off(); res(); }); });
  auth.onAuthStateChanged(u => { user = u; });

  /* ---------- Datenbank: Firestore hat schon dieselbe Form (collection/doc/where/orderBy/onSnapshot) ---------- */
  const db = {collection: p => fs.collection(p), doc: p => fs.doc(p)};

  /* ---------- Wer ist angemeldet ---------- */
  const me = {
    async id(){ await ready; return user ? user.uid : null; },
    async isOwner(){ await ready; return !!(user && user.email && C.ownerEmail && user.email.toLowerCase() === C.ownerEmail.toLowerCase()); },
    async me(){ await ready; return user ? {id: user.uid} : null; },
    canEdit: () => false
  };

  /* ---------- Räume: Anwesenheit als kleine Dokumente mit Herzschlag ---------- */
  const STALE = 70000;
  function mkRoom(name){
    const key = Math.random().toString(36).slice(2, 10);
    const coll = fs.collection('presence').doc(name.replace(/[\/]/g, '_')).collection('p');
    let state = {}, beat = null, unsub = null, peersCb = null, last = [];
    const write = () => user && coll.doc(key).set({...state, by: user.uid, t: Date.now()}).catch(() => {});
    function listen(){
      if (unsub) return;
      unsub = coll.onSnapshot(snap => {
        const now = Date.now();
        last = snap.docs.map(d => ({peer: d.id, by: d.data().by, presence: d.data()})).filter(p => now - (p.presence.t || 0) < STALE);
        peersCb && peersCb({peers: last, joined: [], left: [], updated: []});
      }, () => {});
    }
    const refresh = setInterval(() => { if (peersCb && last.length) { const now = Date.now(); const f = last.filter(p => now - (p.presence.t || 0) < STALE); if (f.length !== last.length) { last = f; peersCb({peers: f, joined: [], left: [], updated: []}); } } }, 15000);
    const bye = () => { if (beat) coll.doc(key).delete().catch(() => {}); };
    addEventListener('pagehide', bye);
    return {
      name,
      async presence(p){ state = {...state, ...p}; await write(); if (!beat) beat = setInterval(write, 25000); listen(); },
      onPeers(fn){ peersCb = fn; listen(); return () => { peersCb = null; }; },
      emit(){}, on(){ return () => {}; },
      async leave(){ clearInterval(beat); clearInterval(refresh); removeEventListener('pagehide', bye); if (beat) { beat = null; await coll.doc(key).delete().catch(() => {}); } if (unsub) { unsub(); unsub = null; } },
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
    async signOut(){ try { await auth.signOut(); } catch {} user = null; },
    async resetPw(email){ try { await auth.sendPasswordResetEmail(email, {url: back()}); return {ok: true}; } catch (e) { return e && e.code && e.code.includes('user-not-found') ? {ok: true} : {error: de(e)}; } },
    async updatePw(pw){ try { await auth.currentUser.updatePassword(pw); return {ok: true}; } catch (e) { return {error: de(e)}; } },
    async updateEmail(email){ try { await auth.currentUser.verifyBeforeUpdateEmail(email, {url: back()}); return {ok: true}; } catch (e) { return {error: de(e)}; } },
    async reauth(pw){ try { await auth.currentUser.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(auth.currentUser.email, pw)); return {ok: true}; } catch (e) { return {error: de(e)}; } },
    async deleteUser(){ try { await auth.currentUser.delete(); user = null; return {ok: true}; } catch (e) { return {error: de(e)}; } },
    // Nutzername → E-Mail fürs Anmelden (geht auch ohne Anmeldung, aber nur einzeln)
    async lookup(h){ try { const d = await fs.doc('logins/' + h).get(); return {email: d.exists ? d.data().email : null}; } catch (e) { return {error: true}; } },
    // Einmal-Einladungslinks: vor der Anmeldung prüfen, direkt nach dem Registrieren verbrauchen
    async checkInvite(t){ try { const d = await fs.doc('invites/' + t).get(); return {ok: d.exists && !d.data().usedBy}; } catch (e) { return {error: true}; } },
    async claimInvite(t){ try { const uid = auth.currentUser.uid; await fs.doc('invites/' + t).update({usedBy: uid, usedTs: Date.now()}); await fs.doc('members/' + uid).set({inv: t, ts: Date.now()}); return {ok: true}; } catch (e) { return {error: true}; } },
    onRecovery(){},
    get recovering(){ return false; }
  };
})();
