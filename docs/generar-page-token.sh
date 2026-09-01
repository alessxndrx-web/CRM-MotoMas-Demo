#!/usr/bin/env bash
# Genera el META_PAGE_ACCESS_TOKEN definitivo y lo escribe en el .env.
#
# QUE HACE, en orden:
#   1. Te pide el token CORTO de usuario del Graph API Explorer (no se ve al pegar).
#   2. Lo canjea por un token de usuario de LARGA duracion.
#   3. Con ese, pide el token de PAGINA (que asi sale permanente).
#   4. Lo verifica contra /debug_token: tipo PAGE, sin caducidad, con leads_retrieval.
#   5. Solo si pasa las tres, lo escribe en el .env.
#
# NUNCA imprime un token. Ni el que pegas, ni los intermedios, ni el final.
#
# USO:   bash docs/generar-page-token.sh [PAGE_ID]
#        Por defecto usa Motomás Masaya (1156085857594722).
set -euo pipefail

PAGE_ID="${1:-1156085857594722}"
APP_ID="1576525380862276"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
API="https://graph.facebook.com/v21.0"

[ -f "$ENV_FILE" ] || { echo "No encuentro $ENV_FILE"; exit 1; }
APP_SECRET=$(grep -E '^META_APP_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
[ -n "$APP_SECRET" ] || { echo "META_APP_SECRET no esta en $ENV_FILE"; exit 1; }

echo "Pagina destino: $PAGE_ID"
echo
echo "Pega el token de USUARIO del Graph API Explorer y pulsa Enter."
echo "(no veras nada mientras pegas: es intencionado)"
printf '> '
read -rs USER_TOKEN; echo
[ -n "$USER_TOKEN" ] || { echo "Vacio. Nada que hacer."; exit 1; }

echo "[1/4] Canjeando por token de larga duracion..."
LONG=$(curl -s -G "$API/oauth/access_token" \
  --data-urlencode "grant_type=fb_exchange_token" \
  --data-urlencode "client_id=$APP_ID" \
  --data-urlencode "client_secret=$APP_SECRET" \
  --data-urlencode "fb_exchange_token=$USER_TOKEN" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('access_token','')) if 'error' not in d else (sys.stderr.write('  ERROR: '+d['error']['message']+'\n'),sys.exit(1))")
[ -n "$LONG" ] || { echo "  No se pudo canjear."; exit 1; }
echo "  ok"

echo "[2/4] Pidiendo el token de la pagina..."
PAGE_TOKEN=$(curl -s -G "$API/me/accounts" \
  --data-urlencode "fields=id,name,access_token" --data-urlencode "limit=100" \
  --data-urlencode "access_token=$LONG" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
if 'error' in d: sys.stderr.write('  ERROR: '+d['error']['message']+'\n'); sys.exit(1)
pages=d.get('data',[])
sys.stderr.write('  paginas accesibles: '+str(len(pages))+'\n')
for p in pages: sys.stderr.write('    - '+p['name']+' ('+p['id']+')\n')
m=[p for p in pages if p['id']=='$PAGE_ID']
if not m: sys.stderr.write('  ERROR: la pagina $PAGE_ID no esta entre las accesibles.\n'); sys.exit(1)
print(m[0]['access_token'])
")
[ -n "$PAGE_TOKEN" ] || { echo "  No se obtuvo token de pagina."; exit 1; }
echo "  ok"

echo "[3/4] Verificando contra Meta..."
VERDICT=$(curl -s -G "$API/debug_token" \
  --data-urlencode "input_token=$PAGE_TOKEN" \
  --data-urlencode "access_token=$APP_ID|$APP_SECRET" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
if 'error' in d: print('FAIL|'+d['error']['message']); sys.exit()
x=d.get('data',{}); sc=x.get('scopes',[]); prob=[]
print('  valido :', x.get('is_valid'))
print('  tipo   :', x.get('type'))
print('  caduca :', 'NUNCA' if x.get('expires_at')==0 else str(x.get('expires_at')))
print('  pagina :', x.get('profile_id'))
for n in ['leads_retrieval','pages_show_list','pages_manage_metadata']:
    ok = n in sc; print('   ',n,'->','SI' if ok else 'NO')
    if not ok: prob.append(n)
if not x.get('is_valid'): prob.append('token invalido')
if x.get('type')!='PAGE': prob.append('no es token de PAGINA')
if x.get('expires_at') not in (0,None): prob.append('caduca')
print('VERDICT|'+('OK' if not prob else 'FAIL: '+', '.join(prob)))
")
echo "$VERDICT" | grep -v '^VERDICT|'
RESULT=$(echo "$VERDICT" | grep '^VERDICT|' | cut -d'|' -f2)

if [ "$RESULT" != "OK" ]; then
  echo
  echo "NO se escribe nada en el .env. Motivo: $RESULT"
  echo "Revisa que el consentimiento incluyera la pagina y los tres permisos."
  exit 1
fi

echo "[4/4] Escribiendo META_PAGE_ACCESS_TOKEN en el .env..."
cp -a "$ENV_FILE" "${ENV_FILE}.bak-$(date +%Y%m%d-%H%M%S)"
python3 - "$ENV_FILE" "$PAGE_TOKEN" <<'PY'
import sys,io,re
f,v=sys.argv[1],sys.argv[2]
s=io.open(f,encoding="utf-8",newline="").read()
eol="\r\n" if "\r\n" in s else "\n"
if re.search(r'(?m)^META_PAGE_ACCESS_TOKEN=', s):
    s=re.sub(r'(?m)^META_PAGE_ACCESS_TOKEN=.*$', 'META_PAGE_ACCESS_TOKEN="'+v+'"', s, count=1)
else:
    if not s.endswith(eol): s+=eol
    s+='META_PAGE_ACCESS_TOKEN="'+v+'"'+eol
io.open(f,"w",encoding="utf-8",newline="").write(s)
PY
chmod 600 "$ENV_FILE"
echo "  escrito (${#PAGE_TOKEN} caracteres). Backup junto al .env."
echo
echo "LISTO. Si esto lo corriste en el servidor:  pm2 restart motomas --update-env"
