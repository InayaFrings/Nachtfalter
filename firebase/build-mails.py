# Noctibat: E-Mail-Vorlagen für Firebase Authentication bauen (v1017).
# Aufruf: python3 firebase/build-mails.py  → schreibt firebase/email-<art>[-en|-2sprachig].html
# Einspielen: Firebase-Konsole → Authentication → Vorlagen → (Art) → Stift → Nachricht = alles ab der ersten <table>-Zeile.
# Platzhalter von Firebase: %DISPLAY_NAME%, %EMAIL%, %LINK%, %APP_NAME%. Bilder liegen auf noctibat.com/pwa/mail/.
import os
IMG = 'https://www.noctibat.com/pwa/mail/'
F = "font-family:Arial,Helvetica,sans-serif"
SERIF = "font-family:Georgia,'Times New Roman',serif"
T = {
 'verify': {
  'de': dict(subj='Bestätige deine E-Mail für Noctibat', hi='Hey %DISPLAY_NAME%,', h='Nur noch ein Klick', p1='Willkommen bei Noctibat! Bestätige kurz, dass <b style="color:#ffffff">%EMAIL%</b> wirklich dir gehört. So kannst du dein Konto jederzeit zurückholen, falls du dein Passwort vergisst.', btn='E-Mail bestätigen', info='Nur wer Zugriff auf dieses Postfach hat, kann den Link öffnen.', alt='Der Knopf geht nicht? Dann öffne diesen Link:', no='Du hast kein Konto bei Noctibat angelegt? Dann ignorier diese E-Mail einfach. Ohne Bestätigung passiert nichts.', foot='Noctibat · ein Ort für Freunde'),
  'en': dict(subj='Confirm your email for Noctibat', hi='Hey %DISPLAY_NAME%,', h='Just one more click', p1='Welcome to Noctibat! Please confirm that <b style="color:#ffffff">%EMAIL%</b> really belongs to you. That way you can always get your account back if you forget your password.', btn='Confirm email', info='Only someone with access to this inbox can open the link.', alt='Button not working? Open this link instead:', no='You didn’t create a Noctibat account? Just ignore this email. Nothing happens without confirmation.', foot='Noctibat · a place for friends'),
  'img': 'hero-verify.jpg'},
 'passwort': {
  'de': dict(subj='Dein neues Passwort für Noctibat', hi='Hey %DISPLAY_NAME%,', h='Zeit für ein neues Passwort', p1='Jemand, hoffentlich du, möchte das Passwort für dein Noctibat-Konto <b style="color:#ffffff">%EMAIL%</b> ändern. Tipp auf den Knopf und such dir ein neues aus.', btn='Neues Passwort festlegen', info='Der Link gilt eine Stunde und funktioniert nur einmal.', alt='Der Knopf geht nicht? Dann öffne diesen Link:', no='Das warst nicht du? Dann ignorier diese E-Mail einfach. Dein Passwort bleibt, wie es ist.', foot='Noctibat · ein Ort für Freunde'),
  'en': dict(subj='Your new password for Noctibat', hi='Hey %DISPLAY_NAME%,', h='Time for a new password', p1='Someone, hopefully you, wants to change the password for your Noctibat account <b style="color:#ffffff">%EMAIL%</b>. Tap the button and pick a new one.', btn='Set new password', info='The link works for one hour and only once.', alt='Button not working? Open this link instead:', no='Wasn’t you? Just ignore this email. Your password stays the same.', foot='Noctibat · a place for friends'),
  'img': 'hero-reset.jpg'},
}
def block(t, top=True):
    return f'''      <tr><td style="padding:{'30' if top else '34'}px 32px 6px;{F};color:#f4f2ee">
        <p style="margin:0 0 8px;font-size:13px;line-height:1.4;color:#b9a6e8;letter-spacing:.14em;text-transform:uppercase;font-weight:bold">{t['hi']}</p>
        <h1 style="margin:0 0 16px;{SERIF};font-size:32px;line-height:1.2;font-weight:normal;color:#ffffff">{t['h']}</h1>
        <p style="margin:0 0 26px;font-size:17px;line-height:1.6;color:#e6e2ea">{t['p1']}</p>
      </td></tr>
      <tr><td align="center" style="padding:0 32px 22px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#f4f2ee" style="border-radius:999px;box-shadow:0 0 0 6px rgba(244,242,238,.08)">
          <a href="%LINK%" style="display:inline-block;padding:18px 34px;{F};font-size:18px;font-weight:bold;line-height:1;color:#0a0a0b;text-decoration:none;border-radius:999px">{t['btn']} &rarr;</a>
        </td></tr></table>
      </td></tr>
      <tr><td align="center" style="padding:0 32px 26px;{F}">
        <p style="margin:0;font-size:14px;line-height:1.5;color:#9a96a0">&#10022;&nbsp; {t['info']} &nbsp;&#10022;</p>
      </td></tr>
      <tr><td style="padding:0 32px 26px;{F}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f0e11;border:1px solid #2c2832;border-radius:14px"><tr><td style="padding:14px 16px">
          <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#9a96a0">{t['alt']}</p>
          <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all"><a href="%LINK%" style="color:#d8c8ff;text-decoration:underline">%LINK%</a></p>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:18px 32px 26px;border-top:1px solid #2c2832;{F}">
        <p style="margin:0;font-size:15px;line-height:1.6;color:#c9c5ce">{t['no']}</p>
      </td></tr>'''
def mail(kind, langs, comment):
    k = T[kind]; t0 = k[langs[0]]
    rows = block(k[langs[0]])
    for l in langs[1:]:
        rows += f'''
      <tr><td align="center" style="padding:6px 32px 0;{F};font-size:12px;letter-spacing:.2em;color:#6f6a76">&#10022; ENGLISH &#10022;</td></tr>
''' + block(k[l], False)
    foot = ' &nbsp;·&nbsp; '.join(k[l]['foot'] for l in langs) if len(langs) > 1 else t0['foot']
    return f'''<!-- {comment}
     Betreff: {' / '.join(k[l]['subj'] for l in langs)} · Absendername: Noctibat
     Gebaut mit firebase/build-mails.py (nicht von Hand ändern). -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0b" style="background:#0a0a0b;margin:0;padding:0">
  <tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#141216" style="max-width:560px;background:#141216;border:1px solid #2c2832;border-radius:22px;overflow:hidden">
      <tr><td align="center" background="{IMG}banner.png" bgcolor="#141216" style="background:#141216 url('{IMG}banner.png') center/cover;padding:22px 20px 18px">
        <img src="{IMG}logo.png" width="170" alt="Noctibat" style="display:block;width:170px;max-width:55%;height:auto;border:0">
      </td></tr>
      <tr><td style="padding:0;line-height:0;font-size:0"><img src="{IMG}{k['img']}" width="560" alt="" style="display:block;width:100%;max-width:560px;height:auto;border:0"></td></tr>
{rows}
      <tr><td align="center" style="padding:18px 20px 22px;background:#0f0e11;{SERIF};font-size:15px;color:#9a96a0">
        <a href="https://www.noctibat.com/" style="color:#9a96a0;text-decoration:none">&#10022; {foot} &#10022;</a>
      </td></tr>
    </table>
  </td></tr>
</table>
'''
D = os.path.dirname(os.path.abspath(__file__))
NAME = {'verify': 'E-Mail-Adresse bestätigen (Email address verification)', 'passwort': 'Passwort zurücksetzen (Password reset)'}
for kind in T:
    for suf, langs in [('', ['de']), ('-en', ['en']), ('-2sprachig', ['de', 'en'])]:
        open(os.path.join(D, f'email-{kind}{suf}.html'), 'w').write(mail(kind, langs, f'Noctibat: E-Mail „{NAME[kind]}“, {"+".join(langs)}. Einspielen: Firebase-Konsole → Authentication → Vorlagen → {NAME[kind]} → Stift.'))
print('ok')
