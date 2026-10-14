# Noctibat

Soziale Website „für den Zirkel“ von Inaya, live unter https://www.noctibat.com (GitHub Pages aus `main`, Root). Sprache in Code-Kommentaren und Oberfläche: Deutsch, per Du.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `index.html` | Die ganze App (HTML, CSS, JS in einer Datei, inklusive eingebettetem Firebase-Shim) |
| `nachtfalter/index.html` | Identische Kopie von `index.html` (alte Adresse), immer mitkopieren |
| `firebase/nf-firebase.js` | Quelle des Shims (`window.claude.use('db'/'user'/'room')` → Firebase). Steht eingebettet auch in `index.html`, beide gleich halten |
| `firebase/firestore.rules` | Firestore-Regeln. Werden **nicht** automatisch eingespielt: Inaya kopiert sie in der Firebase-Konsole unter Firestore → Regeln |
| `vendor/hpke-core-1.9.0.min.js` | hpke-js (RFC 9180), gebündelt, für die Ende-zu-Ende-Verschlüsselung |
| `pwa/`, `manifest.webmanifest` | Icons und PWA-Manifest |
| `nf-push-sw.js` | Service Worker nur für Push-Mitteilungen (kein Zwischenspeicher) |
| `functions/` | Cloud Functions für Push-Mitteilungen (braucht Blaze). Einspielen: `firebase deploy --only functions` |

## Veröffentlichen

1. `index.html` bearbeiten.
2. `window.NF_BUILD='…'` (Zeile 6) auf einen neuen 12-stelligen Hex-Wert setzen. Sonst laden installierte Handy-Apps die neue Version nicht.
3. `cp index.html nachtfalter/index.html`
4. Commit `vNNN: …` und Push auf `main` (live nach etwa 30 Sekunden).

Die Content-Security-Policy steht als `<meta>` im `<head>`. Wer ein neues externes Skript einbindet, muss dessen Host dort bei `script-src` ergänzen, sonst blockiert der Browser es.

## Ende-zu-Ende-Verschlüsselung (seit v374)

- Gilt für private Chats (`dm_<uid>_<uid>`) und private Gruppen (`g…` mit `pub:false`). Öffentliche Gruppen, Zimmer, Gästebuch und Kommentare sind nicht verschlüsselt.
- HPKE (DHKEM P-256, HKDF-SHA256, AES-256-GCM, Auth-Modus) über `vendor/hpke-core`. Jedes Gerät hat ein eigenes Schlüsselpaar. Der private Schlüssel ist nicht exportierbar und liegt nur in IndexedDB (`nf-e2ee`). Öffentliche Schlüssel liegen unter `profiles/<uid>/e2ee/<gerät>`.
- Nachrichten-Dokument: `{from, ts, e2e:1, sd, iv, c (Bytes), k:{<uid>_<gerät>: enc.ct}, x?}`. Kein `text` im Klartext, `lastText` ist nur `🔒`.
- Medien (Sprachnachrichten, MP3, Videos) werden vor dem Hochladen mit eigenem Schlüssel verschlüsselt (`mk`/`miv` stehen nur in der verschlüsselten Nachricht).
- Neue Geräte lesen alte Nachrichten erst nach Freigabe von einem bisherigen Gerät (Einstellungen → Verschlüsselung, Code-Vergleich, Feld `x`).
- Code: Abschnitt „Ende-zu-Ende-Verschlüsselung“ vor `sendMsg` in `index.html`. Nie Klartext an Firestore schicken, wenn `e2Chat(cid)` wahr ist.

## Reaktionen und Antworten im Chat (seit v375)

- Reaktion = eigenes Dokument `chats/<cid>/m/r_<nachricht>_<uid>` mit `{kind:'react', to, e}` (e = Schlüssel aus `EMOS`). In verschlüsselten Chats verschlüsselt wie eine Nachricht. `chSplit()` nimmt Reaktionen aus `CH.msgs` heraus und legt sie in `CH.rx` ab.
- Antwort = Feld `re:{id, from, t}` in der Nachricht. Das Zitat springt per `msgJump`, ältere Nachrichten lädt `chMore()` nach (`CH.lim`).
- Bedienung: Symbole neben der Blase (Desktop beim Überfahren, Handy immer), wischen nach rechts = antworten, nach links = reagieren.

## Lesebestätigungen (seit v376)

- Jedes Mitglied schreibt seinen Lesestand nach `chats/<cid>/rd/<uid>` = `{ts}` (`rdMark()`), gelesen wird er live über `rdWatch()`. Angezeigt wird er nur unter der letzten eigenen Nachricht: im privaten Chat „Gelesen“, in Gruppen bis zu drei Profilbilder und „+N“.

## Anrufe und Talks (seit v378)

- WebRTC direkt zwischen den Geräten (jeder mit jedem), Firestore nur für den Verbindungsaufbau. Code: Abschnitt „Anrufe und Talks“ vor `bubbleHTML` in `index.html`.
- Raum = `chats/<cid>/talk/<id>` mit Plätzen `p:{<uid>:{t:Herzschlag, s:Sitzung}}`, Signale unter `…/sig` (an eine Person, nach dem Lesen gelöscht), Mikro/Kamera unter `…/st/<uid>`, Klingeln unter `rings/<uid>/r/<cid>~<id>`.
- Private Chats und Gruppen nutzen die Räume `audio`/`video`. Öffentliche Gruppen zeigen sie als Standard-Talks „Audiochat“/„Videochat“ (feste IDs, werden ergänzt, wenn sie fehlen).
- Öffentliche Gruppen haben eine eigene Talk-Seite (`CH.mode = 'talks'`, `talksPanelHTML`), geöffnet über das Talk-Symbol im Chat-Kopf (`tkBtnHTML`, Zahl = Leute in Talks). Im Chat selbst steht nur ein Hinweis (`tkHintHTML`), wenn jemand in einem Talk ist.
- Eigene Talks erstellt jedes Mitglied (`by` = eigene UID, `def:0`, ID `t…`). Umbenennen und löschen dürfen der Admin (`createdBy`) und wer den Talk erstellt hat (`tkMay`), Standard-Talks sind nicht löschbar.
- Plätze: privat 2, sonst 9 je Raum, durchgesetzt in `callJoin` (Transaktion) und in `firestore.rules`. Plätze ohne Herzschlag seit 45 s darf jedes Mitglied freigeben (`gone`).
- Zeiten für Plätze und Klingeln immer mit `srvNow()` (Geräteuhr + Abstand zur Serverzeit aus `clkSync()`), nie mit `Date.now()`: sonst verbinden sich Geräte mit falsch gehender Uhr nicht.
- Klingeln: Das Gerät der angerufenen Person schickt das Signal `ringing` zurück (Anrufer sieht „Ruft an …“ → „Klingelt …“). Ohne Antwort nach 45 s steht „Verpasst“, im privaten Chat landet „📞 Verpasster Anruf“. Schlägt das Schreiben des Klingelns fehl, kommt eine Meldung (vorher still verschluckt). Einstellungen → Anrufe zeigt Inaya, ob die eingespielten Regeln aktuell sind (`rulesCheck`).
- Ohne geöffnete App klingelt nichts: Push im Hintergrund bräuchte einen Server (Cloud Functions, Blaze-Tarif) und ist nicht eingebaut.
- Pro Paar bietet nur die Seite mit der kleineren UID an (`pr.init`), Signale werden streng nacheinander verarbeitet. Ohne TURN-Server (Einstellungen → Anrufe, `site/rtc`) klappen manche Mobilfunknetze nicht.
- Die Oberfläche nutzt `themeStyle` und `chBg` des Chats, es gibt kein eigenes Farbsystem.

## Lokal testen

Mit dem Firebase-Emulator (Auth + Firestore, Projekt `demo-noctibat`). Dazu einen kleinen Server, der `index.html` ausliefert und im Shim nach `const auth = app.auth(), fs = app.firestore();` die Aufrufe `auth.useEmulator(...)` und `fs.useEmulator(...)` einsetzt. So entstehen nie Daten im echten Projekt.

## Namen und Owner-Zeichen (seit v382)

- `handles/<uid>` = `{h: Nutzername, n: Anzeigename}` (immer mit `merge`). Alle hören live auf die ganze Sammlung (`nmWatch`), Umbenennungen sind sofort überall sichtbar. Namen über `chatWho`/`nmOf` holen, nie gespeicherte Kopien anzeigen.
- Name mit Fledermaus/Owner-Zeichen: `whoH(uid)` bzw. `markOf(uid)` (nutzt `hmark`). Neue Stellen, die Namen zeigen, bitte damit bauen.

## Verbindung und Kontosicherung (seit v385)

- iPhone/iPad: Firestore mit `experimentalForceLongPolling` (im Shim, beide Kopien). Dort riss die Streaming-Verbindung das Schreiben still ab, Lesen ging weiter. Der Schreib-Wächter baut die Verbindung nach dem Hintergrund oder bei hängenden Schreibvorgängen neu auf (`social.db.reconnect`, `social.db.pending`).
- Kontosicherung unter `data/users/<uid>`: Form v2 mit Stücken `nf2-<bereich>-<i>` und `nf-meta` = `{v:2, ks, h, ts}`. Geschrieben wird nur, was sich geändert hat (Prüfsumme `h`). Gespeichert wird erst nach erfolgreichem Laden (`cloud.loaded`), sonst überschreibt ein leerer Start den echten Stand. Die alte Form (`nf-0…`, `{n, ts}`) wird weiter gelesen.
- Seit v414: Vor dem Schreiben wird `nf-meta` gelesen und mit dessen Prüfsummen verglichen (nicht mit dem eigenen `CLAST`), sonst mischen sich Stücke mehrerer Geräte. Ist ein Bereich nicht lesbar, nimmt `cloudRead` ihn aus dem Gerätestand (nur bei gleichem Nutzername) oder der alten Form und schreibt danach alles neu (`CBAD`).
- Einstellungen → Selbsttest (`diagRun`) prüft auf der echten Seite Schreiben, Regeln, Lesebestätigung, Namen, Sprachspeicher, Mikrofon, Verschlüsselung und Netz.

## Firebase-Kontingent (seit v387)

- Der kostenlose Tarif (Spark) erlaubt pro Tag 20.000 Schreib- und 50.000 Lesevorgänge (Reset 9 Uhr deutscher Zeit). Am 14.10.2026 war es aufgebraucht: dann scheitert jedes Schreiben still (die Firestore-Bibliothek versucht es endlos), Lesen kann weiterlaufen. Selbsttest und `quotaCheck()` zeigen das an.
- Sparsam bleiben: Online-Herzschlag alle 2 Minuten, Freundesprofile alle 10 Minuten, Chats laden zuerst 60 Nachrichten („Ältere Nachrichten laden“), Kontosicherung nur Geändertes, Profil nur bei Änderung, kein automatisches Neuverbinden (liest alles neu).

## Push-Mitteilungen (seit v388)

- Einstellungen → Mitteilungen: Erlaubnis, Geräte-Schlüssel (FCM) nach `data/users/<uid>/nf-push` = `{tokens:{<id>:{t, ts, dev}}, prefs:{calls, msgs, friends, gb}}`. Der öffentliche Web-Push-Schlüssel (VAPID) steht in `site/push`, Inaya trägt ihn in den Einstellungen ein.
- `functions/index.js` (1. Generation, europe-west3): `pushCall` (rings), `pushMsg` (chats/*/m, nicht an Leute, die gerade online sind; verschlüsselt nur „Neue Nachricht“), `pushFriend` (friends). Im Emulator wird nur protokolliert (`PUSH {…}`).
- Antippen öffnet `?c=<chat>` bzw. `?p=<person>` (`pushOpen`).
