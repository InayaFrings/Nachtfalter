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
- Neue Geräte fragen selbst nach dem Verlauf (`e2AutoAsk`), eigene Geräte geben ihn automatisch frei (`e2AutoGo`, Feld `x`), kein Code-Vergleich mehr (seit v438).
- Konto-Schlüssel (seit v438): öffentlich als Pseudo-Gerät `profiles/<uid>/e2ee/nfkonto1` (`E2A_DEV`), dadurch wird jede Nachricht auch dafür verpackt. Privat mit dem Passwort verschlüsselt (PBKDF2-SHA256 310.000, AES-GCM) unter `data/users/<uid>/nf-e2acct`. Entsperrt beim Anmelden (`e2aRemember`), danach still an die eigenen anderen Geräte weitergegeben (`e2aShare` → `data/users/<uid>/nf-e2ak-<gerät>`, mit deren Geräteschlüssel verpackt, `e2aWatchShare`). Keine Passwort-Abfrage im Alltag; nur beim Abmelden ohne Konto-Schlüssel kommt einmal „Bevor du dich abmeldest“ (`e2aAsk(true, true)`, `doLogout`). Passwort-Wechsel verschlüsselt neu (`e2aRepass`). Alte Nachrichten verpackt `e2aMigrate` EINMAL je Gerät nach (je Chat höchstens 300, Feld `x`). `e2Cek` probiert erst den Geräteschlüssel, dann den Konto-Schlüssel.
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

## Fremde Dienste und Musik (seit v423)

- Spotify ist seit v424 komplett raus (Links sind normale Links). YouTube, TikTok, Instagram, SoundCloud usw. laden erst nach Antippen (`extOk`/`extAllow`, je Dienst in `localStorage` `nf-ext`). Platzhalter: `extPh`, YouTube-Vorschaubilder nur über `ytImg`. Neue Einbindungen fremder Dienste bitte genauso absichern.
- 30-Sekunden-Hörproben (iTunes/Deezer) zeigen ihre Quelle mit Link (`muSrcHTML`, Feld `lk` aus der Suche).
- MP3-Upload nur in privaten Chats/Gruppen und in Beiträgen für Freunde (`chPubNow`, Prüfung beim Posten).
- Seit v426 ist Musik ganz ausgeschaltet: Schalter `const MUSIK = false` (direkt nach `KEY` in `index.html`). Aus heißt: keine Hörproben (`stMuPv`/`stAuPlay`), keine Musik-Knöpfe in Beitrag, Editor, Story und Profil, keine MP3s; alte MP3-Nachrichten zeigen einen Hinweis. Daten bleiben gespeichert. Sprachnachrichten sind nicht betroffen.
- Seit v427 sind normale Links nur noch Pillen (`linkPill`: eigenes Symbol + Seitenname), ohne fremde Vorschaubilder, ohne Google-Favicon, ohne microlink. Kurzlinks (vm.tiktok.com usw.) werden erst nach Antippen über noembed aufgelöst (`ext-short`).

## Sicherheit: Bilder, Links, E-Mail-Adressen (seit v456)

- Profil-, Titel- und Gruppenbilder kommen von anderen Leuten: nur über `safePic()` zeigen (echte Rasterbilder als `data:image/(jpeg|png|webp|gif);base64,…`, kein SVG). `remoteUser` säubert `pic`/`cover` schon beim Einlesen.
- Jede Bild- oder Videoquelle im HTML mit `esc()` einsetzen, CSS-Hintergründe mit `url('${cssUrl(…)}')`, Links aus fremden Daten über `safeHref()` (nur http/https). Nie `src="${wert}"` ohne `esc`.
- `firestore.rules`: `picOk` prüft `pic` und `cover` in `profiles/<uid>`. Achtung: `match /x/{id}/{rest=**}` trifft auch das Dokument selbst (Regeln v2), darum für Unterordner `{sub}/{rest=**}` nehmen.
- `logins/<nutzername>` = `{uid, v:2, s, iv, c, ts}`: E-Mail nur verschlüsselt (PBKDF2 aus dem Passwort + AES-GCM, `lgSeal`/`lgOpen`). Die Regeln geben nur `v:2` heraus und lehnen offene E-Mails ab. Geschrieben beim Anmelden und nach Passwortwechsel (`lgSoon`), beim Umbenennen wandert der Eintrag mit (`claimHandle`). Alte Einträge: Hinweis „einmal mit E-Mail anmelden“.

## Sprachnachrichten spulen (seit v457)

- Tippen, Ziehen (Finger oder Maus) und Pfeiltasten auf der Wellenform (`.vmw`) springen an jede Stelle (`vmSeek`, Ziehen über `VMDRAG`). Als Länge gilt notfalls `m.audio.d`, `vmFixDur` ermittelt bei WebM-Aufnahmen ohne Längenangabe (`duration = Infinity`) die echte Länge.

## Sprachen: Deutsch und Englisch (seit v459)

- `LANG` (`de`/`en`) kommt aus dem Konto (`me().lang`, wandert mit der Kontosicherung) und vom Gerät (`localStorage nf-lang`; vor dem Anmelden: Browsersprache). Wählbar auf der Startseite, bei der Registrierung (`#reg-lang`) und in den Einstellungen (Karte „Sprache“). Wechsel über `setLang()`.
- Die Sprache ändert nur die Anzeige. Nie Inhalte, Profile, Gruppen oder Funktionen nach Sprache oder Land filtern.
- Der Code schreibt weiter deutsch. `i18nRun`/`i18nNode` übersetzt nach jedem Zeichnen Textknoten und Attribute (placeholder, title, aria-label, alt) über das Wörterbuch `I18N_EN` (zwischen `// I18N_EN_START` und `// I18N_EN_END`). Texte mit Namen/Zahlen als Muster mit `{0}`, `{1}` …; zusammengesetzte Beschriftungen („Farbe: Weiß“) werden in Teilen übersetzt.
- Was Menschen schreiben, bleibt unübersetzt: Bereiche mit `data-raw` oder den Klassen in `I18N_SKIP` (Beiträge, Nachrichten, Kommentare, Namen, Steckbrief …). Neue Stellen mit Nutzertext bitte mit `data-raw` markieren.
- Texte, die im Code in Nutzerbereichen landen (z. B. System-Hinweise im Chat), mit `tr('…')` übersetzen; gespeicherte App-Hinweise in Nachrichten über `sysTr` (`SYS_MSG`). Zeiten: `ago()`/`ntAgo()` können Englisch, Datum mit `LOC()`.
- NEUE TEXTE: deutsch in den Code, die englische Fassung in `I18N_EN` ergänzen. Auf der Seite zeigt `i18nMissing()`, was beim Anschauen noch deutsch geblieben ist.
- Push-Mitteilungen vom Server: `functions/index.js` (`TXT.de`/`TXT.en`), Sprache steht in `data/users/<uid>/nf-push` (`lang`).
