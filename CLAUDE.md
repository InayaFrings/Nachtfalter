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
2. `window.NF_BUILD='…'` (Zeile 6) auf einen neuen 12-stelligen Hex-Wert setzen und denselben Wert in `build.txt` schreiben. Sonst laden installierte Handy-Apps die neue Version nicht. (Die App fragt nur die winzige `build.txt` ab; erst wenn sie abweicht, wird die Seite selbst geprüft.)
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
- Eigener Nutzername über mehrere Geräte (seit v513): beim Umbenennen schreibt `claimHandle` `ht` (Zeitpunkt) nach `handles/<uid>` und merkt `u.handleTs`. `handleSync()` (in `nmWatch` und vor `publishProfile`) übernimmt einen neueren Namen von einem anderen Gerät; ein Gerät mit älterem Namen schreibt ihn nicht mehr zurück. Grund: ein zweites Gerät bzw. die Kontosicherung hatte den alten Namen wieder eingetragen.
- Name mit Fledermaus/Owner-Zeichen: `whoH(uid)` bzw. `markOf(uid)` (nutzt `hmark`). Neue Stellen, die Namen zeigen, bitte damit bauen.

## Verbindung und Kontosicherung (seit v385)

- iPhone/iPad: Firestore mit `experimentalForceLongPolling` (im Shim, beide Kopien). Dort riss die Streaming-Verbindung das Schreiben still ab, Lesen ging weiter. Der Schreib-Wächter baut die Verbindung nach dem Hintergrund oder bei hängenden Schreibvorgängen neu auf (`social.db.reconnect`, `social.db.pending`).
- Kontosicherung unter `data/users/<uid>`: Form v2 mit Stücken `nf2-<bereich>-<i>` und `nf-meta` = `{v:2, ks, h, ts}`. Geschrieben wird nur, was sich geändert hat (Prüfsumme `h`). Gespeichert wird erst nach erfolgreichem Laden (`cloud.loaded`), sonst überschreibt ein leerer Start den echten Stand. Die alte Form (`nf-0…`, `{n, ts}`) wird weiter gelesen.
- Seit v414: Vor dem Schreiben wird `nf-meta` gelesen und mit dessen Prüfsummen verglichen (nicht mit dem eigenen `CLAST`), sonst mischen sich Stücke mehrerer Geräte. Ist ein Bereich nicht lesbar, nimmt `cloudRead` ihn aus dem Gerätestand (nur bei gleichem Nutzername) oder der alten Form und schreibt danach alles neu (`CBAD`).
- Einstellungen → Nur für dich als Owner → Selbsttest (`diagRun`, seit v460 nur für Inaya) prüft auf der echten Seite Schreiben, Regeln, Lesebestätigung, Namen, Sprachspeicher, Mikrofon, Verschlüsselung und Netz.

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

## Neu laden: an derselben Stelle bleiben (seit v462)

- `navSave()` merkt nach jedem Zeichnen und beim Scrollen Ansicht, offenen Chat (auch Talks/Mitglieder/Helfer), Reiter, Scrollstelle und Zurück-Verlauf in `sessionStorage` (`nf-view`, je Browser-Tab). `navBoot()` stellt das vor dem ersten Zeichnen her, `navLive()` verbindet den Chat, sobald `socialStart` läuft. Links aus Mitteilungen/Einladungen (`?c=`, `?p=`, `einladung=`) gehen vor (`NAV_DEEP`).

## Schnelles Laden (seit v464)

- Firestore-Zwischenspeicher im Browser (`enablePersistence()` im Shim, beide Kopien; nur der erste Tab, weitere Tabs ohne Zwischenspeicher): Chats, Freunde, Mitteilungen und Nachrichten kommen nach dem Neuladen sofort vom Gerät. `signOut` löscht ihn (`clearPersistence`). Bei Listenern, die den ersten Stand anders behandeln (z. B. `ringWatch`), auf `q.metadata.fromCache` achten.
- `loadProf` nimmt erst den Zwischenspeicher, dann im Hintergrund den Server.
- Update-Prüfung über `build.txt` statt die ganze Seite (700 KB) bei jedem Öffnen neu zu laden. `claimHandle` schreibt `handles/<uid>` nur bei Änderung (jede Änderung lesen alle, die online sind).
- Seit v465: Letzter Stand je Konto in `localStorage nf-snap:<S.me>` (Chatliste, Freundeslisten, Mitteilungen, Story-Ringe (seit v466), Namen und Avatare der Beteiligten). Die Salon-Leiste Freunde/Öffentlich steht immer (auch vor der Verbindung), `loadPubFeed` nimmt erst den Zwischenspeicher. `snapLoad()` beim Start, `snapSave()` nach Änderungen (frühestens 3 s nach Verbindungsstart, höchstens alle 4 s). Bis dahin zeigen `notifs()`, Chatliste, `ntHead`, `nmOf`, `uidUser` diesen Stand. Leer-Hinweise („Noch keine …“) nur, wenn die Daten wirklich geladen sind (`CH.mraw`, `WL.ready`, `snapLive()`), sonst „Lädt …“. Beiträge zeigen vor der Verbindung gleich die neue Leiste (`piWaitHTML`), nie das alte Kommentarfeld.

## Kollektion tief sitzende Hosen, Taschen (seit v467)

- Tief sitzende Hosen `sag_*` über `isag()` (Bund `isagY`, Boxershorts `iboxer`, tieferer Schritt `idropFill`, Löcher `iholes`). Gürtel sitzen auf dem Bund der Hose: `IWAIST` (auch für `lw_*`), in `avatarI` über `XW`.
- Neue Gürtel/Ketten/Jacken/Schuhe siehe Block „Neue Kollektion“ vor `avatarI`. Farbvarianten = eigene IDs mit gleicher Zeichnung und anderer Startfarbe (`IBOTC`, `IJACKC`, `ISHOEC`), damit der Laden verschiedene Farben zeigt.
- Reiter „Taschen“: Accessoires mit `bag:1` (Filter `inSub`, Reiter-Kennung `topSub === 'tasche'`). Taschen am Körper (`IACC_BODY`) liegen über Jacke und Ketten und bleiben bei Posen am Rumpf; Schulter-Rucksäcke: Riemen vorn (`islingStrap`), Tasche seitlich hinter dem Körper (`IACC_BACK`, `isling`); in der Hand: `IACC_FRONT`.
- Keine echten Markennamen oder Logos im Laden (nur „im Stil von“), Kuscheltiere sind eigene Figuren.

## Profil teilen (seit v471)

- Knopf „Profil teilen“ in jedem Profilkopf (`pshBtnHTML`, unter den Knöpfen, mittig zwischen ihnen und dem Steckbrief: `.phead .pshbtn`), Fenster `pshPaint` in den Farben des Profils (`postTheme`), QR-Code aus eigenem Erzeuger `QR` (Fehlerkorrektur H, Avatar-Kopf in der Mitte), Link `profLink` = `noctibat.com/?u=<nutzername>`. Speichern als Bild `pshImage`.
- Unten im Fenster: „Teilen …“ (ohne Teilen-Menü: Link kopieren), „QR-Code scannen“ (`qrsOpen`: Kamera oder Foto, BarcodeDetector, sonst `vendor/jsqr-1.4.0.js` (Apache 2.0, wird erst dann geladen); öffnet nur Noctibat-Links), „QR-Code speichern“.
- Öffnen: `pushOpen` kann `?u=` (über `pshFind`), merkt den Link in `sessionStorage nf-open` bis nach dem Anmelden. Der alte `locRestore` greift nicht, wenn ein Link offen ist oder `navBoot` schon hergestellt hat.
- ACHTUNG beim Bearbeiten: viele Zeilen enthalten mehrere Anweisungen. Ein `//`-Kommentar mitten in der Zeile verschluckt den Rest (so fielen in v465–v470 Verschlüsselung, Anrufe, Uhr-Abgleich und Namen beim Start aus). In langen Zeilen nur `/* … */` verwenden.

## Gelesen-Stand über Geräte (seit v474)

- Glocke (`S.notifSeen`) und Chats (`S.seen`) zusätzlich in `data/users/<uid>/nf-seen` = `{n, c:{<cid>:ts}}`: nur vorwärts (`seenPush` mit merge, `seenApply` nimmt immer das Spätere), live über `seenWatch`. Beim Laden der Kontosicherung wird der Gerätestand nicht zurückgedreht (`seenMax`). Grund: ein länger offenes Gerät schrieb mit der Kontosicherung seinen älteren Gelesen-Stand zurück.
- Profil-Link SoundCloud (`PLINKS`, `plinkURL`): Name oder soundcloud.com-Link.

## Mindestalter (seit v477, ab v534 wieder 16)

- Registrieren ab 16 Jahren (`MIN_AGE`; v477–v533 kurz 12, seit v534 wegen der Horror-Teile wieder 16). Geprüft in `birthProblem` (Registrierung und Abfrage `birthView` für Konten ohne Geburtsdatum). Bestehende Konten unter 16 (`tooYoung`) sehen nur `youngView`: Konto bleibt gespeichert, Zugang ab dem 16. Geburtstag, das Datum lässt sich dort nicht neu eingeben. Die Owner-Kennung (`amOwner`) ist ausgenommen. Das Geburtsdatum bleibt privat, im Profil steht nur das Alter.

## Salon ohne Springen (seit v481)

- Der Salon zeichnet die Beiträge erst, wenn alle Quellen da sind (`feedWait`): Freunde (`FR.synced`, erster `syncFriends` mit frischem Serverstand, höchstens 1,5 s Warten), Öffentlich (`PUBF.ts`), Owner-Beiträge für alle (`OWNK`, `OWNR`). Vorher Platzhalter `FEED_SKEL`, höchstens 6 s (`FEEDW.max`). Danach einmal richtig sortiert, die alte Scrollstelle wird dann noch einmal hergestellt (`NAVR.lastY`).
- Freundesliste und `site/owner` kommen zuerst aus dem Zwischenspeicher, dann vom Server. `syncFriends` läuft nie doppelt (`FR.busy`/`FR.again`), `loadProf` startet je Profil nur eine Server-Abfrage gleichzeitig (`LPS`). Spart Lesevorgänge beim Start.

## Navigation am Handy (seit v483)

- Unten genau fünf, nur Symbole: Salon, Shop, Chat, Suche, Profil (`mobNav`). Shopping-Straße am Handy ohne Scrollen (`swFit`), am PC größer und untereinander. Oben drei: Mitteilungen, Minigames, Einstellungen (`mobTop`; Freundschaftsanfragen zählen bei der Glocke mit).
- Zimmer, Garderobe und Freundesliste über das eigene Profil: Zimmer-Reiter (`.proom`), Avatar-Karte „Dein Avatar“ (`.fullgo`) und Freundesanzahl (`data-act="fr-list"`, Handy: Freunde-Panel `fpOpen`, PC: Seite `friends`). Am PC bleibt die Seitenleiste mit allen Bereichen.

## Shopping, Nocti-Coins, Level und Geschenke (seit v482, überarbeitet v483)

- Alles kostet Coins: Kleidung inkl. Gesicht (Augen, Lippen, Make-up, Bart) und alle Möbel. Gratis sind nur „Keine …“ (`NC_FREE`), Haut und Figur. Als gekauft gilt nur, was man beim ersten Öffnen trägt bzw. im Zimmer stehen hat (Übernahme, s. u.), im Shop `ncHas`. Preise: Kleidung nach Abteilung (`NC_CATP`), Möbel nach Raum-Kategorie (`NC_FURP`), Exklusives (`nc_*`, `ex`) eigene Preise, Level-Teile (`lv`) nicht käuflich.
- PREISE: Liste `NC_PRICES` (Möbel als `m:<id>`, weil es Kleidung und Möbel mit gleicher ID gibt). Die Regeln lesen sie aus `site/prices`; die App trägt sie automatisch ein, sobald Inaya (Owner) Noctibat öffnet und die Liste abweicht. Ohne `site/prices` zeigt der Shop „öffnet in Kürze“.
- Bestand: Wer den Shop zum ersten Mal mit Wallet öffnet, bekommt einmalig alles ins Inventar, was im eigenen Profil getragen wird (`outfit`) bzw. im Zimmer steht (`rk` = Möbel als `m:<id>`, wird mit `publishProfile` geschrieben): op `keep`, Feld `kp`. Diese Teile stehen im Shop als „Gekauft“. Neue Mitglieder wählen bei der Anmeldung frei aus allen bisherigen Teilen, das Start-Outfit wird danach genauso übernommen.
- Startbonus 2000 Coins für alle (neue Wallets starten damit, alte bekommen einmal op `bonus`, Feld `wb`).
- Besitz: `ncOwns(id)`; vor der Übernahme bzw. ohne neue Regeln gilt Bisheriges wie früher als vorhanden. Garderobe und Zimmer-Menü zeigen nur Eigenes, Looks aus dem Lookbuch lassen Fremdes weg (`ncStrip`).
- Coins sieht man nur im Shop (und kurz in der Leiste nach einer Belohnung, `ncBar`). Level steht auf jedem Profil als Flügel-Abzeichen über dem Namen (`ncLvHTML` mit `lvEmblem`, mindestens 1, fremde Level aus `wallet/<uid>`); das eigene öffnet das Level-Fenster.
- Mall (`mallView`) nutzt die Abteilungen der Garderobe (`catTabs`), Möbelhaus (`moebelView`) die Raum-Kategorien. Karten nur mit Bild, Preis und Geschenk-Symbol. Antippen = anprobieren bzw. im Zimmer ansehen UND in die Tasche (nochmal antippen nimmt es heraus; je Abteilung ohne Mehrfachauswahl nur ein Teil). Farben in der Vorschau: Mall `colorPanel(…, 'nc-color')` auf `MTRY`, Möbelhaus `MSELC` (wird beim Aufstellen übernommen). Der Shop öffnet erst nach der Übernahme (`kp`); erkennt die App veraltete Regeln (Bonus/Übernahme abgelehnt), zeigt sie „öffnet in Kürze“ (`WAL.old`). Einkaufstasche `NCCART`, Kauf bis 12 Teile je Transaktion (op `buy` mit `its`). Shopping-Straße: der Avatar fliegt erst beim Antippen ins Bild (`swGo`).
- Coins vergeben (seit v514): Einstellungen → Nur für dich als Owner → „Coins vergeben“ (`coinGrantCard`, `coinGrant`): Nutzername + Anzahl, op `grant` in `wallet/<uid>`. Regeln: nur `isOwner()`, 1 bis 10.000 auf einmal, ändert nur `c` und `op`. Braucht die eingespielten Regeln ab v514.
- Tag = deutsche Zeit mit Sommerzeit (`ncDay`/`berlinOff`, in den Regeln `today()`/`berlinSummer()`), Wechsel um 00:00.
- Tägliche Belohnung nur im Level-Fenster (eigenes Level-Abzeichen antippen, `lvOpen`: XP bis zum nächsten Level), nicht mehr im Profil: 25 Coins + 20 XP, danach Leiste oben.
- Minigames: jedes Spiel einmal pro Tag 15 Coins + 10 XP (XP-Art `g`, ref = mem/ttt/hang/bat, Beleg `g:<spiel>`), danach Hinweis im Spiel.
- Weitere XP wie in v482 (Freundschaft, Beitrag, Like, Kommentar, Gruppen).
- Höchstens Level 50 (`LV_MAX`, Regeln `lvOk`); Level-Belohnungen bei 5, 10, 15, 20, 25, 30, 35, 40, 45, 50. Level-Fenster und Levelaufstieg in den Farben des eigenen Profils (`lvTheme`, Abzeichen `lvEmblem`).
- Mall sieht aus wie die Garderobe (gleiche `.wardrobe`-Aufteilung, keine rechte Spalte); Farbe in der Vorschau über den Farbpunkt am Teil (`itemColUI` mit `nc-color`), im Möbelhaus Farbpunkt am ausgewählten Möbel.
- Geschenke `gifts/<von>_<an>_<teil>_<zeit>` mit `k`: `buy` (im Shop für jemanden gekauft) oder `inv` (aus dem eigenen Bestand über das Plus im privaten Chat; das Teil verlässt das Inventar sofort, op `give`). Status `open` → `seen` (geöffnet) → `taken` (angenommen). Nachricht im Chat über `sendMsg` mit Feld `gift` (verschlüsselt, `e2Clean` lässt es durch), Karte `giftMsgHTML`. Getragenes und Möbel im Zimmer lassen sich nicht verschenken, Level-Teile auch nicht.

## @-Erwähnungen im Chat (seit v488)

- Im Chat-Feld (`#cm-in`) zeigt `@` Vorschläge aus den Mitgliedern des offenen Chats (`chMembers`), in Gruppen zuerst `@Alle` (englisch `@everyone`, beide werden erkannt: `CHM_ALL_RX`). Auswahl über `chMention`.
- Beim Senden schreibt `chMentNotify` je erwähnter Person ein Dokument nach `chats/ment_<uid>/m` (wie bei Kommentaren) mit `c` = Chat, `all` bei @Alle. In verschlüsselten Chats (`e2Chat`) ohne Nachrichtentext. Mitteilung in der Glocke, Antippen öffnet den Chat. In der Blase werden Erwähnungen hervorgehoben (`chMenHL`).

- Reiterleisten in Garderobe, Mall, Möbelhaus und Zimmer sind eine waagerechte Zeile mit eigenem Schieberegler darunter (`hslFit`, Auswahl `HSL_SEL`, Klasse `.hslbar`), sichtbar nur, wenn etwas übersteht. Möbel-Raster am Handy wie Garderobe und Mall mit drei Spalten.

- Chat (seit v493): Profilbilder an Nachrichten nur in Gruppen und nur bei den anderen (links, `bubbleHTML` mit `group`); im Privatchat keine, das eigene nie.
- Unterteile: Hosen, Röcke, Strumpfhosen, Socken, Overknees, Beinstulpen (`BOTTOM_SUB`, `legSub`). Schmuck: Armbänder und Handstulpen (inkl. Handschuhe, `sub:'stulpe'`, Reiter „Handstulpen“ seit v511) getrennt. Reiterleisten merken ihre Schiebe-Stelle (`HSLPOS`). Seit v497 im Schwarz-Weiß der Seite: Nocti-Coin silbern mit schwarzer Fledermaus (`NC_ICO`), Mall und Möbelhaus (`SW_MALL`, `SW_MOEB`) schwarz/grau mit weißen Linien und hellen Fenstern, Coin-Pillen und Shop-Rahmen über `currentColor` statt Lila. Die Seite soll nicht bunter werden.
- Möbelhaus: nichts vorausgewählt, nochmal antippen wählt ab, ausgewähltes Möbel in der Vorschau verschiebbar (`MSELPOS`, beim Aufstellen übernommen). Taschen-Markierung als Abzeichen auf dem Bild (`.ncbagb`).
- Seit v499 sieht man im Shop nur, was man auswählt: Mall probiert auf der nackten Figur an (`ncBare`: Körper, Haut, eigene Augen und Mund, keine Kleidung, Haare, Bart, Make-up, Schmuck; auch die Vorschaubilder). Augen/Mund abwählen = wieder die eigenen. Möbelhaus zeigt ein leeres Zimmer (eigene Tapete/Boden, ohne Avatar) mit den Möbeln aus der Tasche; Stelle und Farbe der nicht ausgewählten merkt `MSTASH`.

## Datenschutz / DSGVO (seit v500)

- Nichts Fremdes beim bloßen Aufrufen: Schriften selbst gehostet (`fonts/fonts.css`, nur Latein + Latein erweitert, Lizenzen in `fonts/LIZENZEN.txt`), Firebase-SDK in `vendor/firebase-10.14.1/`, Video-Bibliotheken in `vendor/` (Lizenzen `vendor/LIZENZEN.txt`). Alles mit absolutem Pfad (`/vendor/…`), damit auch `nachtfalter/` geht. Neue Bibliotheken bitte genauso in `vendor/` legen statt CDN.
- CSP erlaubt gstatic, apis.google.com und jsDelivr nicht mehr. Firebase Auth (compat) versucht beim Start einmal `apis.google.com/js/api.js` zu laden (nur für Popup-Anmeldung, die wir nicht nutzen); das blockiert die CSP absichtlich, die Meldung in der Konsole ist harmlos.
- GIFs (GIPHY) wie andere fremde Dienste erst nach Antippen (`extOk('giphy')`, Platzhalter `gifPh`, GIF-Suche `gifAsk`, Aktion `ext-giphy`).
- Datenschutzerklärung: `datenschutz.html` (eigene Seite, Schwarz-Weiß). Verlinkt auf Startseite, Registrierung und Einstellungen, aber nur mit `const DSE = true` (direkt nach `MUSIK`). Erst einschalten, wenn Name, Anschrift, E-Mail, Firestore-Standort, TURN-Anbieter, Aufsichtsbehörde und Datum eingetragen sind. Bei neuen Diensten oder Datenarten die Erklärung mit anpassen.

## Kleinigkeiten (v501)

- Profil-Zimmer: `.proom{isolation:isolate}`, damit „Zimmer betreten“ (z-index 2000) vor den Möbeln, aber unter der Leiste oben liegt.
- Beitragskopf: `@nutzername · Zeit` immer in einer Zeile (`.ph .meta` flex/nowrap, zu lange Namen mit „…“). Nutzernamen 3–20 Zeichen (`handleProblem`).
- Teilen-Fenster: Profilbilder ohne Rahmen (`frame:'none'` in `shGrid`), damit Namen lesbar bleiben.
- Freundschaftsanfrage ablehnen: abgelehnte (`S.ignoredReq`) zeigen auf Profil und in Listen keine Annehmen/Ablehnen-Knöpfe mehr.
- Geschenk-Arten als schwarz-weiße Linien-Symbole (`GF_WARD`, `GF_ROOM`).
- Emoji-Auswahl (seit v502) überall gleich: 4 × 4, im Formular direkt über der Schreibleiste und rechtsbündig mit ihr, also auf der Seite des Totenkopfs (seit v503; Bezug `.ptwrap` oder das Formular; `emoPick` → `emoDock`, `.emopop.dock`). Wird das Feld neu gezeichnet, hängt `emoKeep` (im MutationObserver) sie ans neue Feld; schneidet ein Rahmen ab, steht sie fest am Bildschirm über dem Feld. Große Textfelder (Gästebuch u. a., nicht Chat/Kommentar) bekommen den Totenkopf oben rechts im Feld (`.ptwrap`, in `addEmoButtons`).
- Möbelhaus (seit v502): Zimmer und Reiter in einer Karte, die beim Scrollen oben stehen bleibt (`.moebel .ncroom` sticky, `--railb` = Unterkante der Handy-Leiste, am PC 0).
- Minigames heißen Memory, Tic-Tac-Toe, Galgenmännchen, Fledermausjagd. Tic-Tac-Toe-Computer (`tttAI`) gewinnt immer, wenn er kann, wehrt zu 85 % ab und spielt zu 25 % einen zufälligen Zug (gute Spieler gewinnen etwa jedes dritte Spiel).
- Eigenes Gästebuch (seit v503): mit Verbindung dasselbe Formular wie bei Freunden (`rwall`: Textfeld mit Totenkopf, Foto, Video-Link, schreibt nach `chats/wall_<eigene uid>/m`). Das alte `wall`-Formular (lokal, `u.wall`) gibt es nur noch ohne Verbindung.

## Horror-Kollektion (seit v504, ab v536 entschärft, siehe unten)

- In der Hand (`IACC_FRONT`): `h_messer` (rechts), `h_axt` und `h_saege` (links). Masken unter Make-up (`cat:'face'`, `IMASK`): `m_blechbaer`, `m_blechhase`, `m_blechrabe` (kaputte Blech-Tiere), `m_clown` (stummer Clown); werden nach Lippen und Piercings, aber unter dem Pony gezeichnet, Grundfarbe über `makeC`. Lippen: `l_schnitt` (Schnitt-Grinsen, `ICUT`, wird immer gezeichnet). Make-up `zombiepop` (seit v505, `IMAKE.zombiepop` unter den Augen mit Maske für die Augenlöcher, schwarze Lippen und Kreuz im rechten Auge über `IZOMBIE_LIPS`/`IZOMBIE_EYE`).
- Blut und Organe (seit v506, `IACC_BODY`): `b_spritzer`, `b_flecken`, `b_getraenkt` (über jedem Outfit, nur innerhalb von Körper, Armen und Beinen über `iBloodClip`; Flecken aus `istain`/`iblob`, fest gesät mit `ihash`), `organe` (Darm hängt aus dem Bauch). Vorschaubild über `thumb` am Teil.
- Zombie-Haut, blaue Flecken, Wunden (seit v507): `z_haut` (färbt die Haut `ZSKIN`, Fäulnis `irot`, Gesicht `IZFACE`), `z_blau` (`ibruise`, Gesicht `IBRFACE`) liegen auf der Haut unter der Kleidung (`iSkinClip`; Arme extra nach dem Neuzeichnen der Arme, Teil `'arms'`). Wunden `w_schnitte`, `w_biss`, `w_klaffend` (`iwound`) liegen über der Kleidung wie das Blut, `w_kopf` im Gesicht (`IKOPFW`).
- Blutgetränkte Stulpen (seit v508): Arm `st_blut` (Schmuck → Handstulpen, `IARMB`), Bein `l_stulpen_blut` (Beinstulpen, `ILEGW`), Blut über `isoak`.
- Teile, die nach der Liste `HACC_C` dazukommen (Horror-Blöcke vor `avatarI`), bekommen ihre Startfarbe über die Schleife am Ende dieser Blöcke; sonst wären Accessoires schwarz statt Originalfarbe.
- Zwangsjacke (seit v510): Jacke `zwangsjacke` (`IJACK`) und Mini-Kleid `zwangskleid` (`ITOP`, Reiter Kleider). Gemeinsame Teile `izwAermel` (über die Hände, Riemen hängen herab), `izwKragen`, `izwRiemen`. Startfarbe Segeltuch `#ecebe4`.
- Kein eigener Horror-Reiter (v509 wieder entfernt): Horror-Teile stehen dort, wo sie hingehören (Accessoires, Make-up, Lippen, Stulpen …).
- Farben (seit v509): alle Horror-Teile über den normalen Farbpunkt frei wählbar. Blut/Wunden/Kopfwunde/Schnitt-Grinsen über `ibc` (ersetzt `IBLOOD`/`IBLOOD2`), Zombie-Haut = Hautton, blaue Flecken = Farbton des Flecks, Darm = Darmfarbe, Waffen = Griff/Kopf/Motor, Masken und Zombie-Make-up über `makeC`, Stulpen = Grundfarbe.
- Eigene Entwürfe: erinnern an Animatronic-Horror bzw. Horror-Clowns, aber ohne echte Namen, Figuren oder Erkennungszeichen (keine Hüte, Fliegen, Lätzchen, Augenklappen). Bitte so lassen.
- Preise stehen direkt am Teil (`nc`). Sie gelten erst, wenn Inaya Noctibat einmal öffnet (Abgleich `site/prices`); bis dahin sind die neuen Teile nicht kaufbar.
- Garderobe (seit v512): Lookbuch, Look speichern, Komplett ausziehen als drei gleiche Kacheln mit Symbol (`.ltools`/`.ltool`, Symbole `LT_SAVE`, `LT_UNDRESS`). Mall: „Komplett ausziehen“ als Pille über den Reitern (`.ltool.ltsm`, nur während der Anprobe, setzt `MTRY` zurück). Seit v547 stehen Coins und Einkaufstasche in der Mall oben im Kopf (`ncHead`) wie im Möbelhaus.

## Halloween-Möbel (seit v515)

- 14 Möbel `hw_*` (Block „Halloween- und Horror-Möbel“ vor `FURN_IDS.push`): Horrorclown-Pappaufsteller, Leichensack, abgetrennte Gliedmaßen, Fenster mit Mörder, kaputtes Kuscheltier, Köpfe in Gläsern, Krankenhausbett, zerfetztes Sofa, flackernde Glühbirne, Kürbislaterne, Grabstein mit Zombiehand, Blutlache, Blutschrift „HILF MIR“, rostiger Spind. Eigene Entwürfe.
- Wände und Böden (seit v518): Register `SURF[key] = {kind, name, base, tw, th, svg}` (`surfAdd`), zum Kaufen als Möbel `w_<key>`/`f_<key>` mit `surf` und `key`, Reiter „Wand“ und „Boden“ im Möbelhaus und im Zimmer-Editor (`surfGrid`, Karten mit Vorschau `surfPrev` wie im Zimmer). `wallBG`/`floorBG`/`wallCSS` zeichnen sie, `surfAvail` = gratis + gekauft. Schlüssel dürfen sich zwischen Wand und Boden NICHT überschneiden (sonst überschreibt einer den anderen). Möbel-IDs von Flächen dürfen auch kein bestehendes Möbelstück überschreiben: `surfAdd` weicht dann auf `sw_`/`sf_` aus (v520: `f_gitter` und `f_friedhof` sind Fenster, die Böden heißen `sf_gitter`/`sf_friedhof`). Im Möbelhaus merkt `MPREV` gewählte Wand/Boden für die Vorschau über Reiterwechsel hinweg. Apostrophe in Muster-SVGs werden für `url('…')` als %27 kodiert. Neue Tapete/Boden setzt die eigene Farbe zurück. Seit v519: Mustergröße relativ zum Zimmer (`tw / 7.6` %, Bezug 760 px), damit Handy und PC gleich aussehen; Vorschau (`surfPrev`) als normales `div` mit halb so großem Muster, NICHT als SVG-`foreignObject` (Safari am iPhone zeichnet das falsch). Prüfen am iPhone-Nachbau: Playwright-WebKit in `scratchpad/wk` (playwright-core 1.62.1 passt zu webkit-2336).
- Zimmerbuch (seit v516): wie das Lookbuch, aber für Zimmer. `u.roomsBook` (höchstens 20, im Profil als `rb` die letzten 12), Knopf `rbBtn` rechts gegenüber vom Lookbuch (`.lbrow`), Dialog `rbModal`. Im eigenen Zimmer nur beim Bearbeiten drei Kacheln wie in der Garderobe (`roomTools`; seit v517 nicht mehr in der Ansicht), seit v549 in derselben Reihenfolge wie dort: Zimmerbuch, Zimmer speichern, Komplett ausräumen (mit Rückfrage); Abstand zum Zimmer klein (`.rtools{margin:0}`, leere `.rselbar` ausgeblendet). Einrichten (`rbUse`) übernimmt nur Möbel, die man besitzt, und Tapete/Boden, die man hat.
- Zimmer bearbeiten (seit v517): unten „Abbrechen“ neben „Fertig“. `ROOM_UNDO` merkt Zimmer und `deko` beim Start des Bearbeitens (in `roomView`), `rcancel` stellt sie wieder her. `ncPlace` setzt `ROOM_UNDO` zurück, damit Neues aus dem Möbelhaus beim Abbrechen bleibt.
- Zimmer-Editor (seit v518): keine Namen mehr unter den Möbelbildern (nur `title`), kein „Tipp: Tippe ein Möbelstück …“. Spiegeln und Wegräumen als zwei Kacheln nebeneinander (`.rselbtns`). Ablagen (`rHostK`): Betten, Sofas, Schränke und Tische nehmen jedes Deko-Teil, Lampe, Tier und Kuscheltier auf, egal wie groß.
- Wand/Boden-Deko (seit v521): Einzelstücke wie Blut, Risse, Schimmel, Graffiti, Spinnweben liegen als eine Ebene `ov` über der ganzen Fläche (`ovSet`, Bildmaß Wand 1000×425, Boden 1000×200 = Seitenverhältnis im Zimmer, `0 0/100% 100% no-repeat`), das Grundmuster (`svg`) wiederholt sich darunter. Neue Flächen mit Deko bitte genauso bauen; nur echte Muster (Backstein, Kacheln, Parkett) wiederholen.
- Profilbanner (seit v521): Muster wie der Seitenhintergrund (`patternURL(b.pattern, hell/dunkel nach Bannerfarbe, .12)`), nicht mehr in Schriftfarbe.
- Organ-Lichterketten (seit v522): `hw_darmkette` (zwei Darm-Stränge kreuz und quer, 52 % breit) und `hw_organkette` (ein Strang), Wanddeko unter Lampen, Organe als leuchtende „Birnen“ (`hwGut`, `hwOrg`).

## Mitteilungen für Likes, Kommentare, Teilen (seit v523)

- Glocke (`notifsLive`) meldet von allen (nicht nur Freunden): Likes, Kommentare und Teilen eigener Beiträge (`pi_<owner>_<post>`, Arten `r`, `c`, `s` = Repost, `sd` = in Chat weitergeleitet über `shMark`), Kommentare, Likes und Weiterleitungen eigener Storys. Story-Likes liegen in `chats/sl_<owner>_<story>/m/<uid>`, Weiterleitungen in `chats/ssh_<owner>_<story>/m` (geschrieben in `st-sendgo`), beobachtet über `stNtWatch` (aus `ntWatch`).

## Einladen mit eigenem Link (seit v524)

- In der Suche (`findView`) als eigener Kasten unter der Suchkarte (seit v525) die Box `refBoxHTML` (Knöpfe „Teilen“ und „Kopieren“ unter dem Link; seit v526 gestaltet wie die Suchkarte mit Überschrift „Freunde einladen“, Fortschritt als 10 Fledermäuse `.refb`): eigener Link `noctibat.com/?ref=<uid>` (Teilen/Kopieren), Fortschritt bis 10, je 10 neue Konten 3000 Coins (`REF_N`, `REF_C`, Abholen `refClaim`, wallet op `ref`, Feld `rf` = schon abgeholte Belohnungen).
- `?ref=` wird in `sessionStorage nf-ref` gemerkt; bei der Registrierung schreibt der Shim `claimRef` in einem Batch `refd/<neu>` = {by, ts} und `refc/<einlader>.u.<neu>` = true. Regeln: nur neue Konten (noch kein Profil), jedes nur einmal (`refd` existiert danach), Einladende Person muss ein Profil haben. Shim-Änderung in beiden Kopien.
- Braucht die eingespielten Regeln ab v524.
- Beitrag von Juliet und Andy (seit v533, `HELPER_POSTS` `n-einladen`, `show.invite`): Kasten mit 10 Fledermäusen und `REF_C` Coins, Knopf „Jetzt Freunde einladen →“ (Aktion `ref-go`) öffnet die Suche, scrollt zum Kasten `.refcard` und hebt ihn kurz hervor (`.refhi`). Steht im Text fest „3000“: bei Änderung von `REF_C` den Text mit anpassen.
- Memory (seit v527): Kreuz und Totenkopf als dieselben Icons wie bei Tic-Tac-Toe (`memSym` → `TTT_X`/`TTT_O`), nicht als Emoji.
- Preise gestaffelt (seit v528): je Abteilung nach Aufwand der Zeichnung (`ncCx`: Länge der Zeichenfunktion in `NC_MAPS`, Augen über `ncEye`; Möbel: Länge des SVG), `ncTiers`: unterstes Viertel ×0,7, Mitte ×1, oberes ×1,5, Spitze ×2,2, auf 5 gerundet. Teile mit eigenem `nc` behalten ihren Preis. Mindestpreise `NC_MIN` (seit v529: Haare `back` nie unter 250, Grundpreis 300, also 250 bis 660). Gilt erst, wenn Inaya Noctibat öffnet (Abgleich `site/prices`).
- Galgenmännchen (seit v528): bekannte, kurze Wörter (Ø 5 Buchstaben). Tic-Tac-Toe-Computer: Abwehr 60 %, 40 % unbedachte Züge (normal gespielt gewinnt man etwa 4 von 10).

## Level-Belohnungen 25 und 45 (seit v530)

- Die Flügel (`nc_seraph`, `nc_rabenfl`) sind raus (Inaya mochte sie nicht), getragene werden beim Laden entfernt. Stattdessen Level 25 `nc_fledfreund` (kleine Fledermaus auf der rechten Schulter) und Level 45 `nc_katze` (Schattenkatze mit Mondhalsband neben den Füßen, `IACC_BACK`, Vorschau `thumb:'pet'` = eigener Ausschnitt in `IVIEWS`).
- `self.IACC_OVER`: Accessoires in Körper-Koordinaten, die über den Haaren liegen (in `avatarI` mit der Umkehrung von `B.head` an `headFront` gehängt).

## Halloween zum Verkleiden, Gehirn-Schädel, neue Kleider (seit v531)

- Kopfbedeckung `h_gehirn` (Offener Schädel mit Gehirn, `IBRAIN`, seit v532 unter Kopfbedeckung statt Accessoires; alte `acc.h_gehirn` wandern beim Laden nach `hacc`). Liegt über den Haaren, andere Hüte darüber. Farbe = Gehirn, Blut fest.
- Harmlose Halloween-Teile `hl_*`: Pullis `hl_kuerbis`, `hl_geist`, `hl_candy`, `hl_katze` (Grundform `ipulli`), Kleid `hl_hexenkleid`, Unterteile `hl_skelettleg`, `hl_kuerbisrock`, `hl_netzrock`, Kopfbedeckungen `hl_kmuetze` (Haare wie bei `muetze` abgeschnitten, `HATCLIP`), `hl_fledreif`, `hl_geistreif`, `hl_spinnreif`, `hl_minihut`. NICHT `hw_` nehmen: das sind Hosen bzw. Halloween-Möbel.
- Zwölf neue Kleider (alle mit „kleid“ in der ID → Reiter Kleider): süß `babydollkleid`, `lolitakleid`, `feenkleid` (NICHT „tuell…“ nennen, `isSkirt` hält das sonst für einen Rock); Gothic `korsettkleid`, `gothmaxikleid`; Trad Goth `tradgothkleid`, `batcavekleid`; `viktoriakleid`; elegant `abendkleid` (Beinschlitz über `ilegSlit`), `slipkleid`, `etuikleid`, `cocktailkleid`. Längen mini bis bodenlang.
- Zweite Farbe dieser Teile wird nicht automatisch auf Schwarz/Weiß gestellt (`self.MOTIF_KEEP`), außer man färbt das Teil selbst so, dass sie nicht mehr zu sehen wäre.
- Preise stehen am Teil (`nc`), wo die Staffel nach Zeichnungslänge zu niedrig wäre (Teile aus Hilfsfunktionen).

## Steckbrief von Andy und Juliet (seit v535)

- Helfer zeigen jetzt auch den Steckbrief: „Über mich“ kommt aus `steck` (nicht aus `about`, das sind Hausregeln bzw. „So geht’s“), dazu `music`, `films`, `hobbies`, `games2` aus `HELPERS`. `ensureHelpers` überträgt diese Felder bei jedem Start. Helfer-Texte im Steckbrief laufen über `tr()`, weil `.steck dd` sonst nicht übersetzt wird.

## Horror entschärft (seit v536)

- Grund: Noctibat ist ab 16, ohne Jugendschutzbeauftragten. Darum nichts Verstümmelndes, kein echtes Blutbad, nichts, was an Selbstverletzung erinnert. Bitte neue Teile in diesem Rahmen halten (gruselig ja, brutal nein).
- Gleiche IDs, neue Zeichnung und neuer Name, damit Gekauftes und Getragenes bleibt: `organe` = Krabbelnde Spinnen (der Darm bleibt weg, Inaya), `w_schnitte` = Mumien-Bandagen, `w_klaffend` = Skelett zum Aufmalen, `w_biss` = Vampirbiss (zwei Punkte am Hals), `w_kopf` = Frankenstein-Narbe (`IKOPFW`), `z_blau` = Blaue Flecken wieder wie vorher (seit v539; Inaya: nur blaue Flecken), Glitzer-Grusel-Make-up ist seit v539 ein eigenes Teil `z_glitzer` (nur Gesicht, `IGLITZ`, ohne eigene Farbe lila), `h_gehirn` = Gehirn-Haarreif (`IBRAIN`), `l_schnitt` = Genähtes Grinsen (`ICUT`, ohne Blut), `b_getraenkt` = Kunstblut-Kleckse, `b_spritzer`/`b_flecken` = Kunstblut ohne Laufspuren, Stulpen mit Kunstblut (`isoak` nur Spritzer). Messer, Axt, Kettensäge und Clown-Maske ohne Blut.
- Möbel: `hw_leichensack` = Ritualkreis mit Kerzen (seit v538, Mumie mochte Inaya nicht), `hw_glieder` = Haufen alter Puppen, `hw_moerder` = Fenster mit Geist, `hw_koepfe` = Hexenküchen-Gläser, `hw_bett` = Altes Krankenhausbett (Design wie vorher mit Gurten, ohne Blut, dafür aufgerissene Matratze mit herausstehender Sprungfeder, seit v537), `hw_lache` = Nebel am Boden, `hw_darmkette` = Kaputte Lichterkette, verknotet, `hw_organkette` = Kaputte Lichterkette (seit v542: Bögen zwischen Nägeln `hwSwag`, Birnen `hwBulb` warmweiß (`HWL_C`, nicht bunt), an/aus/flacker/kaputt, Knoten `hwKnot`, loses Ende mit Funken `hwSpark`); Sofa und Spind ohne Blut. Wand `blut` = Verwitterte Tapete, Boden `blutfliesen` = Rostige Fliesen, Kacheln und kaputter Boden ohne Blut.
- Blutschrift „HILF MIR“ (`hw_schrift`, mit `hwHand`/`hwDrips`) ist seit v538 wieder wie vorher: Inaya findet Blut allein ok, entschärft wird nur Verstümmelung, Organe, Wunden.
- Entfernt: `iwound`, `idrip`, `HW_WALL`, `ovSplat`. `IBLOOD`/`ibc`/`istain` gibt es weiter für Kunstblut.

## Wand voller Kreuze (seit v541)

- Wand-Deko `hw_kreuze` (180 Coins): 13 Kreuze in einem Teil, Formen über `HWX` (latein, lilie, orthodox, knospe, doppel, ankh, gotik, tau) und `hwCross(x, y, Größe, Form, Farbe, {ring, gem, wood, heart, fil})`, jedes an einem Nagel. Dunkle Kreuze bekommen einen helleren Rand.
- Seit v544 mehr Auswahl: `hw_kreuze_schwarz`, `hw_kreuze_gold`, `hw_kreuze_reihe`, `hw_kreuz_gross`, `hw_kreuz_rosenkranz`, `hw_kreuze_holz`.
- Kaputte Deckenlampe `hw_deckenlampe` (seit v542, 110 Coins, Lampe, oben an die Wand hängen): schiefer Schirm, flackernde zersplitterte Birne, herunterhängendes Kabel mit Funken.

## Kaputtes Arztzimmer (seit v545)

- `hw_instrtisch` (Instrumententisch, eine Rolle abgebrochen, Ablagefläche über „tisch“ in der ID, `rHostK`), `hw_medschrank` (Schrank mit gesprungener Glastür), `hw_infusion` (umgeknickter Infusionsständer, tropft), `hw_roentgen` (flackernder Röntgen-Leuchtkasten, Wand), `hw_sehtafel` (zerrissene Sehtafel, Wand). Rost über `hwRust`.
- Kein Rotes Kreuz als Zeichen (Emblem gesetzlich geschützt), stattdessen grünes Erste-Hilfe-Kreuz.

## Gästebuch-Feld wie die Kommentarleiste (seit v548)

- `rwFormHTML(ph)` (eigenes und fremdes Gästebuch): `.cform` wie unter Beiträgen im Salon: Plus = Foto, Ketten-Symbol = Video-Link (`data-act="rw-link"` klappt `#rw-url` auf), einzeiliges Textfeld (`.pcin.mlin`), Pfeil nur bei Inhalt, Totenkopf rechts. IDs `rw-in`, `rw-img`, `rw-url`, `rw-file` bleiben, der Absenden-Code (`rwall`) ist unverändert.
