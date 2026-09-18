#!/usr/bin/env bash
# Diagnóstico de MotoMas en producción. SOLO LECTURA: no cambia nada.
# Ningún comando imprime el valor de un secreto.
cd /srv/motomas/CRM-MotoMas-Demo 2>/dev/null || { echo "NO existe /srv/motomas/CRM-MotoMas-Demo"; exit 1; }
echo "===== 1. INTEGRIDAD DEL CODIGO (deben ser 1,1,1) ====="
for v in META_APP_SECRET META_WEBHOOK_VERIFY_TOKEN META_PAGE_ACCESS_TOKEN; do
  printf '%-28s %s\n' "$v" "$(grep -c "requiredEnv(\"$v\")" src/server/meta/webhook.ts)"
done
echo "===== 2. COMMIT DESPLEGADO ====="
git log --oneline -1; echo "cambios locales: $(git status --porcelain | wc -l)"
echo "===== 3. VARIABLES (nombre + longitud, NUNCA el valor) ====="
for k in DATABASE_URL SESSION_SECRET META_APP_SECRET META_WEBHOOK_VERIFY_TOKEN \
         META_PAGE_ACCESS_TOKEN WHATSAPP_ACCESS_TOKEN WHATSAPP_PHONE_NUMBER_ID \
         META_MARKETING_ACCESS_TOKEN; do
  v=$(grep -E "^$k=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
  if   [ -z "$(grep -E "^$k=" .env 2>/dev/null)" ]; then printf '%-28s AUSENTE\n' "$k"
  elif [ -z "$v" ]; then printf '%-28s VACIA\n' "$k"
  else printf '%-28s ok (%s car.)\n' "$k" "${#v}"; fi
done
echo "===== 4. PERMISOS / GIT ====="
ls -l .env 2>/dev/null | awk '{print $1,$3,$4,$NF}'
git check-ignore -v .env 2>/dev/null || echo "OJO: .env NO ignorado"
echo "===== 5. PM2 ====="
pm2 jlist 2>/dev/null | python3 -c "import sys,json;[print(f\"{p['name']}: {p['pm2_env']['status']}, reinicios={p['pm2_env']['restart_time']}\") for p in json.load(sys.stdin)]" 2>/dev/null || pm2 status
echo "===== 6. WEBHOOK LOCAL (sin token: se espera 403) ====="
curl -s -o /dev/null -w "GET  local -> %{http_code}\n" "http://127.0.0.1:3000/api/webhooks/meta"
curl -s -o /dev/null -w "POST local -> %{http_code}\n" -X POST "http://127.0.0.1:3000/api/webhooks/meta" -H 'content-type: application/json' -d '{}'
echo "===== 7. NGINX ====="
sudo nginx -t 2>&1 | tail -2; ls /etc/nginx/sites-enabled/
echo "===== 8. TAILSCALE FUNNEL ====="
tailscale funnel status 2>&1 | head -15
echo "===== 9. BASE DE DATOS ====="
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\$queryRaw\`select 1\`.then(()=>p.branch.count()).then(n=>console.log('conexion OK, sucursales:',n)).catch(e=>console.log('ERROR:',e.message.split('\n')[0])).finally(()=>p.\$disconnect());" 2>&1 | tail -3
echo "===== 10. MAPEOS META EN BD ====="
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();Promise.all([p.metaPageBranch.count(),p.metaAdAccount.count(),p.metaUnmappedLead.count(),p.lead.count({where:{metaLeadgenId:{not:null}}})]).then(([a,b,c,d])=>console.log('paginas mapeadas:',a,'| cuentas ads:',b,'| leads en anden:',c,'| leads de Meta:',d)).catch(e=>console.log('ERROR:',e.message.split('\n')[0])).finally(()=>p.\$disconnect());" 2>&1 | tail -3
echo "===== FIN ====="
