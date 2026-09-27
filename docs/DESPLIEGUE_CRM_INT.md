# Despliegue y recuperación — CRM-INT1 + CRM-INT2

Procedimiento para llevar a producción los parches CRM-INT1 (flujo lead →
crédito, catálogo, comprobantes del cliente, marketing multisucursal) y CRM-INT2
(auditoría: identidad, permisos, atribución, conciliación, visión POS). **Van
juntos**: CRM-INT2 corrige defectos de CRM-INT1 que no deben llegar solos a
producción (sobre todo las concesiones globales de Marketing).

Nada de esto se ejecuta automáticamente. Cada paso que toca producción lo hace
una persona con autorización explícita. Las pruebas de este documento se
hicieron en una base **desechable** (`motomas_ensayo`), nunca en la de
producción.

---

## 0. Qué cambia en la base

| Migración | Qué hace | Destructiva |
|---|---|---|
| `20260927000000_crm_int1_flujo_catalogo_marketing` | Columnas nuevas (`leads.first_assigned_at`, `assigned_at`, `motorcycle_catalog_models.version`, `source`/`uploaded_by_customer_id` en comprobantes y archivos); tablas nuevas (`lead_assignments`, `marketing_campaign_branches`, `marketing_campaign_models`, `marketing_campaign_lead_reports` y eventos, `user_permission_grants`); relleno de sucursales y modelos de campaña; `uploaded_by_id` pasa a anulable con CHECK de un único autor; **se reemplaza** el índice único `reservation_payment_proofs_reservation_id_key` por dos índices únicos parciales (uno pendiente y uno aprobado por reserva). | No borra datos. Quita un índice único (ver §3). |
| `20260928000000_crm_int2_identidad_permisos` | Valor nuevo de enum `MARKETING_GESTIONAR_INTEGRACIONES`; **borra** las concesiones que CRM-INT1 sembró (`id LIKE 'mig%' AND granted_by_id IS NULL`). | Borra sólo esas filas, que la propia CRM-INT1 creó. |

Rellenos que **no** se hacen, a propósito:

- Fechas de asignación de leads históricos: quedan `NULL` («fecha no
  registrada»). No se sabe cuándo se asignaron y no se inventa.
- Historial de asignaciones (`lead_assignments`): empieza vacío.
- Modelo del catálogo de unidades históricas: se concilia a mano desde
  `/panel/catalogo-motos` (ver §7).
- Modelo de campañas cuyo `motorcycle_slug` no coincide exactamente con un slug
  del catálogo: la campaña queda sin modelo.

Ensayo (`motomas_ensayo`, datos históricos escritos con el cliente Prisma de
`13d3ecb`): sucursales de campaña rellenadas desde `target_branch_id`
(incluida una sucursal inactiva), modelo sólo por slug exacto, comprobante
histórico con `source = PANEL`, CHECK y únicos parciales aceptados, CRM-INT2
borró las 2 concesiones sembradas y **conservó** la creada por un
Administrador. `prisma migrate diff` contra `schema.prisma` sólo muestra la
deriva previa de `pos_sales_operator_id_idx` y `pos_sales_warehouse_id_idx`,
ajena a estos parches.

---

## 1. Registrar lo que hay en producción

En el servidor, antes de tocar nada:

```bash
git rev-parse HEAD                      # commit desplegado
git status --short | head               # debe estar limpio
```

```sql
SELECT migration_name, finished_at
  FROM _prisma_migrations
 ORDER BY finished_at DESC NULLS FIRST
 LIMIT 5;
-- La última debe ser 20260904000000_user_notifications.
-- Una fila con finished_at NULL es una migración fallida: detenerse.
```

Anotar el commit y la última migración en la bitácora del despliegue: son el
punto al que se vuelve.

## 2. Respaldo, y verificarlo

```bash
STAMP=$(date +%Y%m%d-%H%M)
pg_dump -Fc -d "$DATABASE_URL" -f "motomas-$STAMP.dump"
pg_restore -l "motomas-$STAMP.dump" | wc -l          # lista legible = archivo íntegro
sha256sum "motomas-$STAMP.dump" > "motomas-$STAMP.dump.sha256"
```

Copiar el respaldo **fuera del servidor** antes de seguir. Un respaldo que sólo
existe en la máquina que se va a tocar no es un respaldo.

Los comprobantes y documentos viven en `stored_files` (bytes en PostgreSQL), así
que el respaldo los incluye. Su tamaño:

```sql
SELECT pg_size_pretty(pg_total_relation_size('stored_files'));
```

## 3. Ensayar la restauración

Restaurar el respaldo en una base **nueva y desechable** del mismo servidor de
PostgreSQL (nunca sobre la de producción) y comparar:

```bash
createdb motomas_restauracion
pg_restore --no-owner -d motomas_restauracion "motomas-$STAMP.dump"
```

```sql
-- Ejecutar en las dos bases; los resultados deben ser idénticos.
SELECT (SELECT count(*) FROM _prisma_migrations),
       (SELECT count(*) FROM customers),
       (SELECT count(*) FROM leads),
       (SELECT count(*) FROM reservation_payment_proofs),
       (SELECT sum(length(data)) FROM stored_files),
       (SELECT md5(string_agg(checksum_sha256 || id, ',' ORDER BY id)) FROM stored_files),
       (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'),
       (SELECT count(*) FROM pg_constraint WHERE contype = 'c');
```

En el ensayo de CRM-INT2 las ocho cifras coincidieron. Después:
`dropdb motomas_restauracion`.

## 4. Comprobar compatibilidad antes de migrar

```bash
npx prisma migrate status        # sólo deben faltar las dos migraciones CRM-INT
```

Diagnóstico informativo (no bloquea; sirve de línea base):

```sql
-- Usuarios de Marketing: tras el despliegue quedarán en sólo lectura.
SELECT email, is_active FROM users WHERE role = 'MARKETING';
-- Unidades que habrá que conciliar con el catálogo.
SELECT count(*) FROM motorcycle_units WHERE catalog_model_id IS NULL;
-- Campañas con sucursal (se copiarán a marketing_campaign_branches).
SELECT count(*) FROM marketing_campaigns WHERE target_branch_id IS NOT NULL;
-- Clientes que comparten teléfono o cédula: ahora la pantalla pedirá decidir.
SELECT count(*) FROM (SELECT phone_normalized FROM customers GROUP BY 1 HAVING count(*) > 1) t;
SELECT count(*) FROM (SELECT cedula_normalized FROM customers
                       WHERE cedula_normalized IS NOT NULL GROUP BY 1 HAVING count(*) > 1) t;
```

Si `stored_files` o `reservation_payment_proofs` tuvieran filas con
`uploaded_by_id IS NULL` **antes** de migrar, la CHECK de CRM-INT1 fallaría: con
el esquema anterior esa columna era obligatoria, así que no debería haber
ninguna.

## 5. Desplegar la base

Con la aplicación anterior **detenida** (ver §6 sobre por qué):

```bash
npx prisma migrate deploy
```

Duración esperada: segundos. Lo más pesado es validar las CHECK sobre
`stored_files` (recorre la tabla; no lee los bytes) y crear los índices
parciales de `reservation_payment_proofs`, que es una tabla pequeña. Añadir
columnas anulables no reescribe tablas.

Si falla a mitad: **no** intentar arreglar el estado a mano. Ir a §10, caso A.

## 6. Desplegar la aplicación

Construir y arrancar el commit que contiene CRM-INT1 y CRM-INT2
(`npm ci && npm run build && npm start`, o el procedimiento del VPS en
`docs/meta-produccion-runbook.txt`).

**Detener la versión anterior antes de migrar**, y no convivir: la aplicación
anterior crea campañas escribiendo sólo `target_branch_id`, sin fila en
`marketing_campaign_branches`, y la nueva las leería como «todas las
sucursales». Si por cualquier motivo convivieron (despliegue gradual, rollback y
vuelta), ejecutar tras arrancar la nueva:

```sql
INSERT INTO marketing_campaign_branches (campaign_id, branch_id)
SELECT c.id, c.target_branch_id
  FROM marketing_campaigns c
 WHERE c.target_branch_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM marketing_campaign_branches b WHERE b.campaign_id = c.id)
ON CONFLICT DO NOTHING;
```

Es idempotente (probado: la segunda ejecución inserta 0 filas) y sólo toca
campañas **sin ninguna** fila de sucursal, así que no altera campañas
multisucursal. Una campaña que la versión anterior **editó** (cambiando su
`target_branch_id`) conserva sus filas antiguas: revisarla a mano.

## 7. Verificación posterior (sólo lectura)

**No ejecutar `npm run smoke:*` ni `npm run e2e:*` contra producción**: crean y
borran datos. Se ejecutan contra una copia (la base de §3 sirve).

En producción, con un usuario Administrador:

1. `/panel/marketing/vision` carga; la sección «Repuestos (POS)» aparece aparte
   de «Motocicletas».
2. `/panel/catalogo-motos` carga y muestra «Unidades sin modelo del catálogo»
   con el mismo total que la consulta de §4.
3. `/panel/configuracion` → «Permisos de Marketing»: ningún usuario tiene
   concesiones.
4. `/panel/reservas` abre una reserva con comprobante y lo muestra.
5. `/panel/leads` → ficha de un lead sin convertir → «Convertir en cliente» no
   se pulsa: sólo se comprueba que la ficha carga.

```sql
SELECT migration_name FROM _prisma_migrations
 WHERE migration_name LIKE '%crm_int%' AND finished_at IS NOT NULL;   -- 2 filas
SELECT count(*) FROM user_permission_grants WHERE id LIKE 'mig%';     -- 0
SELECT count(*) FROM marketing_campaigns c
 WHERE c.target_branch_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM marketing_campaign_branches b
                    WHERE b.campaign_id = c.id AND b.branch_id = c.target_branch_id);  -- 0
```

## 8. Flujos críticos, y el paso que no es técnico

**Marketing queda en sólo lectura.** Es el comportamiento pedido, no un fallo:
un Administrador entra en Configuración → «Permisos de Marketing» y concede a
cada persona lo que le corresponda (campañas, reporte de leads, integración con
Meta), por sucursal o para todas. Hasta entonces nadie de Marketing crea ni edita
campañas ni toca la integración de Meta.

Comunicar antes del despliegue a Ventas:

- Registrar un cliente o convertir un lead cuyo **teléfono** ya existe ahora
  enseña las coincidencias y pide decidir («Vincular» o «Es otra persona»). Con
  **cédula** válida coincidente se vincula solo, y nunca se crea un duplicado.
- Un Vendedor que choca con un cliente de otra sucursal ve los datos
  enmascarados y debe pedir a su Líder o Gerente que decida.
- Registrar una unidad exige elegir el modelo del catálogo.

Flujos a verificar por el negocio en las primeras horas: un alta de cliente, una
conversión de lead, una reserva con comprobante del portal (subir no aparta la
unidad; verificarlo sí), y la edición de una campaña por un usuario de
Marketing con concesión.

## 9. Vigilar

Primeras 48 horas:

- Registros de la aplicación: `No se pudo convertir el lead`, `No se pudo
  registrar el cliente`, `No se pudo revisar el comprobante`, `Error converting
  field` (éste sólo aparecería si alguien arrancara la versión anterior).
- Esperas por candados de identidad (deberían ser de milisegundos):

  ```sql
  SELECT pid, wait_event_type, wait_event, now() - query_start AS espera, left(query, 80)
    FROM pg_stat_activity
   WHERE wait_event_type = 'Lock' AND wait_event = 'advisory';
  ```

- Decisiones de identidad tomadas a mano:

  ```sql
  SELECT action, count(*) FROM user_audit_logs
   WHERE action IN ('CUSTOMER_CREATED_DESPITE_MATCH', 'LEAD_CONVERTED_DESPITE_MATCH',
                    'LEAD_LINKED_TO_CUSTOMER', 'UNIT_CATALOG_LINKED')
     AND created_at > now() - interval '2 days'
   GROUP BY 1;
  ```

- Crecimiento de `stored_files` (ver `docs/ALMACENAMIENTO_ARCHIVOS.md`).

## 10. Recuperación

### Lo que el ensayo demostró sobre volver atrás

Se ejecutó el cliente Prisma de `13d3ecb` contra la base ya migrada:

| Operación de la versión anterior | Resultado |
|---|---|
| Leer una reserva con su comprobante histórico | Funciona |
| Subir un comprobante desde el panel | Funciona |
| Crear una campaña con sucursal | Funciona, **pero sin fila** en `marketing_campaign_branches` (ver §6) |
| Dar de alta una unidad sin modelo | Funciona (la regla nueva vive en la aplicación) |
| Asignar un lead | Funciona, sin historial ni fecha |
| Leer comprobantes cuando existe **uno subido por un cliente** (`uploaded_by_id` NULL) | **Falla**: `Error converting field "uploadedById" of expected non-nullable type "String"` — la pantalla de reservas deja de cargar |
| Leer una reserva con **dos comprobantes** (rechazado + pendiente) | No falla, pero **enseña el rechazado** y no permite revisar el pendiente |

Es decir: **la aplicación se puede revertir mientras nadie haya subido un
comprobante desde el portal ni haya un segundo comprobante en una reserva.**
Después, revertir sólo la aplicación rompe Reservas.

```sql
-- ¿Sigue siendo posible revertir sólo la aplicación?
SELECT (SELECT count(*) FROM reservation_payment_proofs WHERE uploaded_by_id IS NULL) AS del_portal,
       (SELECT count(*) FROM (SELECT reservation_id FROM reservation_payment_proofs
                               GROUP BY 1 HAVING count(*) > 1) t)          AS reservas_con_varios;
-- Las dos a 0: se puede. Cualquiera > 0: no.
```

### Caso A — la migración falla

Aplicación anterior sin arrancar. Restaurar el respaldo de §2 sobre una base
nueva, apuntar `DATABASE_URL` a ella y arrancar la versión anterior (commit de
§1). No se pierde nada: no hubo escrituras. Conservar la base fallida para
diagnóstico.

### Caso B — la aplicación nueva falla y la consulta de arriba da 0 y 0

Revertir **sólo la aplicación** al commit de §1. La base se queda migrada: la
versión anterior funciona sobre ella (tabla de arriba). Al volver a desplegar la
nueva, ejecutar el SQL de §6. Las concesiones de Marketing que un Administrador
haya dado se conservan.

### Caso C — la aplicación nueva falla y ya hay comprobantes del portal o reservas con varios

**Corregir hacia adelante.** Revertir la aplicación rompe Reservas, y restaurar
el respaldo **pierde todo lo registrado desde el despliegue** (clientes, leads,
reservas, comprobantes, ventas). Restaurar sólo con autorización explícita de
la dirección, sabiendo qué se pierde, y después de exportar lo creado desde la
hora del respaldo.

### Lo que no tiene vuelta atrás sin respaldo

- Las concesiones sembradas por CRM-INT1 y borradas por CRM-INT2: no deben
  volver (era el defecto). Si hiciera falta, un Administrador concede desde la
  pantalla.
- El índice único `reservation_payment_proofs_reservation_id_key`: no puede
  recrearse en cuanto una reserva tiene dos comprobantes.
