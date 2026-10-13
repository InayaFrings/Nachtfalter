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

## Veröffentlichen

1. `index.html` bearbeiten.
2. `window.NF_BUILD='…'` (Zeile 5) auf einen neuen 12-stelligen Hex-Wert setzen. Sonst laden installierte Handy-Apps die neue Version nicht.
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

## Lokal testen

Mit dem Firebase-Emulator (Auth + Firestore, Projekt `demo-noctibat`). Dazu einen kleinen Server, der `index.html` ausliefert und im Shim nach `const auth = app.auth(), fs = app.firestore();` die Aufrufe `auth.useEmulator(...)` und `fs.useEmulator(...)` einsetzt. So entstehen nie Daten im echten Projekt.
