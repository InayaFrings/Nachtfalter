# Baut die öffentliche Version mit Firebase: public/index.html aus ../index.html.
# Aufruf: python3 build-firebase.py   (Konfiguration steht unten)
import pathlib, json
here = pathlib.Path(__file__).parent
CONFIG = {
  "apiKey": "AIzaSyBAN0OV756ln_ELGwTgcS6yvHYL3m_VeRQ",
  "authDomain": "nachtfalter-fe3d1.firebaseapp.com",
  "projectId": "nachtfalter-fe3d1",
  "storageBucket": "nachtfalter-fe3d1.firebasestorage.app",
  "messagingSenderId": "276441792597",
  "appId": "1:276441792597:web:aa561493db5fbfcd33d4dc",
}
V = '10.14.1'
app = (here.parent / 'index.html').read_text()
shim = (here / 'nf-firebase.js').read_text()
cfg = json.dumps({'config': CONFIG, 'ownerEmail': 'InayaFrings@gmail.com'})
libs = ''.join(f'<script src="https://www.gstatic.com/firebasejs/{V}/firebase-{m}-compat.js"></script>\n' for m in ('app', 'auth', 'firestore'))
head = f'''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Nachtfalter</title>
<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="pwa/icon-180.png"><link rel="icon" type="image/png" href="pwa/icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Nachtfalter"><meta name="apple-mobile-web-app-status-bar-style" content="black"><meta name="theme-color" content="#000000">
{libs}<script>window.NF_FIREBASE = {cfg};</script>
<script>{shim}</script>
<style>html,body{{margin:0}}</style></head><body>
'''
(here / 'index.html').write_text(head + app + '\n</body></html>\n')
print('ok', len(head + app))
