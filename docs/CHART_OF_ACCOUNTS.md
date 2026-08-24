# MotoMas — Catálogo de cuentas (FF1.1)

Documento de arquitectura del catálogo de cuentas introducido por el Parche
FF1.1. Describe **qué existe, qué garantiza y qué NO hace todavía**.

> FF1.1 construye la infraestructura del plan de cuentas. **No** contabiliza,
> **no** mapea eventos a cuentas automáticamente, **no** implementa impuestos,
> POS ni facturación. El motor de contabilización sigue siendo FF1.4.

Documentos relacionados: [FINANCIAL_FOUNDATION.md](FINANCIAL_FOUNDATION.md)
(capa base FF1.0), [FINANCE_STABILIZATION_PLAN.md](FINANCE_STABILIZATION_PLAN.md)
(secuencia completa) y [ACCOUNTING_INTEGRATION_AUDIT.md](ACCOUNTING_INTEGRATION_AUDIT.md)
(auditoría 4.0S-A).

---

## 1. Por qué existe esta fase

El modelo `ChartAccount` existía desde el Parche 3.5B, pero era una lista plana
con jerarquía opcional. No podía responder preguntas que cualquier catálogo
empresarial necesita contestar:

| Pregunta | Antes de FF1.1 |
|---|---|
| ¿Esta cuenta admite movimientos o es un total? | No se sabía. Una cuenta de agrupación era un destino válido para una línea de asiento. |
| ¿En qué nivel de la jerarquía está? | Había que recorrer el árbol en cada lectura. |
| ¿Desde cuándo y hasta cuándo es válida? | No existía vigencia. |
| ¿Es una cuenta de la empresa o una propuesta de referencia? | No existía la distinción. |
| ¿Cómo se retira una cuenta sin borrarla? | Solo `isActive = false`; no había archivado. |

Además, la base de datos seguía con **cero cuentas**, que es el bloqueo
declarado de FF1.4: sin cuentas no puede existir ningún mapeo contable válido.

FF1.1 resuelve ambas cosas: convierte la tabla en una infraestructura de plan de
cuentas reutilizable y provee un catálogo **plantilla** de referencia que la
contabilidad de la empresa debe revisar y aprobar.

---

## 2. Ubicación y capas

```txt
src/server/finance/
  chart-of-accounts/
    shared.ts       # contratos puros: tipo, naturaleza, nivel, elegibilidad, DTO
    repository.ts   # acceso a datos ChartAccount (sin reglas, sin permisos)
    service.ts      # ciclo de vida autorizado, transaccional y auditado

src/server/contabilidad/
  actions.ts        # server actions: envoltorios finos sobre el servicio
  guards.ts         # invariantes de asientos, ahora sobre la regla compartida
  queries.ts        # lecturas por alcance del panel
  shared.ts         # re-exporta el vocabulario del catálogo (sin duplicarlo)

prisma/
  data/chart-of-accounts-template.mjs   # plantilla de referencia (239 cuentas)
  seed-chart-of-accounts.mjs            # siembra idempotente y no destructiva
```

**Regla de dependencia:** `finance` es la capa base. `contabilidad` la importa;
**nunca al revés**. Por eso el servicio autoriza con
`authorizeFinancialFoundation` y no con `authorizeContabilidad`.

**No hay implementación paralela.** El modelo, las acciones, las lecturas y el
panel que ya existían se extendieron. El vocabulario que estaba en
`contabilidad/shared.ts` (`AccountTypeValue`, `AccountNatureValue`, sus
etiquetas, el saneador de código y `ChartAccountDTO`) se movió a la capa base y
se **re-exporta** desde su ubicación anterior, así que ninguna importación
existente se rompió y sigue habiendo una sola definición.

---

## 3. Modelo

Columnas que FF1.1 agrega a `chart_accounts` (todas aditivas):

| Campo | Significado |
|---|---|
| `level` | Profundidad materializada (raíz = 1). La mantiene el servicio al crear y al mover. |
| `allowsPosting` | Si la cuenta admite movimientos directos o es de agrupación. |
| `origin` | `PLANTILLA` o `EMPRESA`. Procedencia, no estado. |
| `templateVersion` | Versión de la plantilla que generó la cuenta. |
| `approvedAt` / `approvedByUserId` | Acto explícito de adopción por la contabilidad de la empresa. |
| `requiresCostCenter` | Bandera declarativa para centros de costo (futuro). |
| `allowsBranchDetail` | Bandera declarativa para reportes por sucursal (futuro). |
| `effectiveFrom` / `effectiveTo` | Ventana de vigencia de la cuenta. |
| `archivedAt` / `archivedByUserId` | Retiro definitivo. Sustituye al borrado. |

Y un cambio de integridad: la clave foránea del árbol
(`chart_accounts_parent_id_fkey`) pasó de `ON DELETE SET NULL` a
`ON DELETE RESTRICT`. Con `SET NULL`, borrar una cuenta habría promovido en
silencio todo su subárbol al primer nivel, destruyendo la jerarquía sin un solo
error. Es la única sentencia no aditiva de la migración, y no toca datos.

### Por qué `archivedAt` y no un estado nuevo

Un enum de estado (`ACTIVA` / `INACTIVA` / `ARCHIVADA`) habría duplicado la
información que `isActive` ya lleva, y cada guardia existente habría necesitado
consultar dos columnas para decidir lo mismo. En su lugar, archivar **implica**
`isActive = false`, de modo que toda validación previa que ya miraba `isActive`
sigue rechazando una cuenta archivada sin haber sido modificada.

---

## 4. Jerarquía

- El nivel se deriva del padre (`hijo = padre + 1`) y se guarda; no se recalcula
  en cada lectura.
- El techo es **6 niveles** (`MAX_CHART_ACCOUNT_LEVEL`). Cubre la plantilla
  completa y acota el recorrido de `moveChartAccount`: un árbol corrompido fuera
  del servicio no puede convertir una validación en una recursión infinita.
- Mover una cuenta rechaza ciclos comprobando la cadena de ancestros del nuevo
  padre, y valida el techo contra el **descendiente más profundo**, no solo
  contra la cuenta movida.
- Al mover, todo el subárbol se re-nivela dentro de la misma transacción, en una
  sentencia por banda de profundidad.
- **Una cuenta que recibe una subcuenta deja de admitir movimientos**
  automáticamente. La alternativa —rechazar la subcuenta hasta que alguien edite
  el padre— convierte construir un árbol en una tarea de dos pasos por nodo. La
  degradación se rechaza si el padre ya tiene movimientos: convertirlo en
  agrupación dejaría historial contabilizado colgando de un total.
- El código **no** se valida contra el código del padre. Un catálogo de empresa
  puede numerar como quiera; la plantilla sí respeta el prefijo por convención.

---

## 5. Elegibilidad para recibir movimientos

Una sola función responde la pregunta en todo el sistema:
`describeChartAccountPostingBlock(cuenta, fecha)`. Devuelve el motivo del
rechazo o `null`, en este orden:

1. archivada,
2. de agrupación (`allowsPosting = false`),
3. inactiva,
4. de plantilla sin aprobar,
5. fuera de su ventana de vigencia en la fecha del movimiento.

La consumen tres lugares que antes respondían distinto:

- `assertChartAccountUsable` — al crear o editar una línea de asiento.
- `validateJournalEntryAccounts` — al contabilizar, revalidando todas las líneas.
- El mapeo contable (`validation.ts` y `upsertAccountMappingRule`) — una regla
  que apunte a una cuenta de agrupación construiría un asiento que el propio
  libro rechazaría.

La fecha que se evalúa es la **fecha del asiento**, no la del reloj: la vigencia
de una cuenta se juzga contra el movimiento que debe cubrir.

> La excepción de reversión (`assertReversalAccountExists`, Parche 4.0S-C2) se
> mantiene intacta: una reversión solo exige que la cuenta exista, porque debe
> reproducir las dimensiones contables históricas del asiento que corrige.

---

## 6. Ciclo de vida

```txt
                 crear
                   │
                   ▼
        ┌──────► ACTIVA ◄──────┐
        │          │           │
   activar     desactivar   restaurar (vuelve inactiva)
        │          │           │
        └─────► INACTIVA ──────┘
                   │
                archivar
                   ▼
              ARCHIVADA  ──► (solo restaurar)
```

Reglas:

- **Nada se elimina jamás.** No existe acción de borrado y no la habrá. La base
  de datos lo respalda: las claves foráneas del árbol, de las líneas de asiento
  y de las reglas de mapeo son `RESTRICT`.
- **El histórico no se reescribe.** Cambiar el tipo o la naturaleza de una
  cuenta que ya tiene líneas contabilizadas está prohibido: alteraría el
  significado de asientos ya emitidos. Se crea una cuenta nueva.
- **El código no se edita.** Identifica la cuenta en todo reporte, exportación y
  libro impreso; renumerar es una migración del catálogo, no la edición de un
  campo.
- Archivar exige motivo y que no queden subcuentas sin archivar.
- Restaurar exige motivo y devuelve la cuenta **inactiva**: corrige el archivado,
  no reabre la cuenta para movimientos.
- Reactivar exige que la cuenta padre esté activa y no archivada.

Cada operación corre dentro de `runFinancialTransaction` y escribe su evento de
auditoría en la misma transacción, con acciones propias:
`CHART_ACCOUNT_CREATED`, `CHART_ACCOUNT_UPDATED`, `CHART_ACCOUNT_STATUS_CHANGED`,
`CHART_ACCOUNT_ARCHIVED`, `CHART_ACCOUNT_RESTORED` y `CHART_ACCOUNT_APPROVED`.
Dominio: **CONTABILIDAD**.

---

## 7. Estrategia de plantilla

### Qué es

`prisma/data/chart-of-accounts-template.mjs` contiene **239 cuentas** de
referencia para una empresa comercial que vende motocicletas, repuestos y
servicios de taller: efectivo y bancos, cartera por línea de negocio, créditos
fiscales, inventarios por familia (motos nuevas, usadas, en tránsito, repuestos,
lubricantes, cascos, llantas, consignación, traslados entre sucursales), activo
fijo con sus depreciaciones acumuladas, proveedores, obligaciones laborales,
patrimonio, ingresos por línea, costos de venta y de taller, y gastos de venta,
administración, financieros y otros.

Distribución: 6 clases, 17 grupos, 100 cuentas de tercer nivel y 116 de cuarto;
193 admiten movimientos y 46 son de agrupación.

### Qué NO es

**No es el catálogo de MotoMas.** Es un punto de partida profesional y genérico.
El archivo lo dice en su encabezado, el script lo repite al ejecutarse, cada
cuenta queda marcada con `origin = PLANTILLA` y `templateVersion`, su
descripción lo declara, y el panel la muestra con la etiqueta
**«Plantilla sin aprobar»**.

### Aprobación

Una cuenta de plantilla es una **propuesta**: se ve, se puede renombrar,
desactivar o archivar, y **no recibe ningún movimiento** hasta que la
contabilidad de la empresa la apruebe explícitamente (`approvedAt`). La
aprobación se hace cuenta por cuenta o por lote desde
`/panel/contabilidad/catalogo-cuentas`, y queda auditada con su autor.

`origin` **no cambia** al aprobar. Es procedencia: el catálogo nunca pierde el
registro de qué cuentas vinieron de la plantilla y cuáles creó la empresa.

### Siembra

```bash
npm run prisma:deploy
npm run prisma:seed:cuentas
```

Es un script aparte de `prisma:seed` a propósito: el seed principal solo siembra
datos reales de la empresa y evita inventar información; esta plantilla es
justamente lo contrario. Garantías del script:

1. Aditivo y re-ejecutable: nunca borra ni desactiva.
2. Nunca toca una cuenta con `origin = EMPRESA`. Si la empresa ya usa ese
   código, el código es suyo.
3. Nunca revierte una decisión del contador: no modifica `approvedAt`,
   `isActive` ni `archivedAt`, y omite las cuentas de plantilla archivadas.
4. Solo actualiza estructura (nombre, clasificación, posición, banderas) cuando
   la versión de la plantilla cambia.

La derivación evita repetir datos: el tipo sale del primer dígito del código, la
naturaleza sale del tipo salvo `contra: true` (depreciaciones acumuladas,
devoluciones sobre ventas, pérdidas acumuladas), el nivel sale de los segmentos
del código y el padre es el código sin su último segmento. Un código inválido,
duplicado o con padre inexistente **aborta la siembra** en lugar de sembrar a
medias.

---

## 8. Reemplazo por el catálogo de la empresa

Tres caminos, todos soportados y ninguno destructivo:

1. **Adopción.** La contabilidad revisa la plantilla, renombra lo que
   corresponda, desactiva o archiva lo que sobra y aprueba el resto. Las cuentas
   conservan `origin = PLANTILLA` como trazabilidad.
2. **Convivencia.** La empresa crea sus propias cuentas (`origin = EMPRESA`)
   junto a las de plantilla que le sirven, y archiva el resto. Volver a correr
   la siembra respeta ambas decisiones.
3. **Reemplazo total.** La empresa siembra su catálogo y archiva la plantilla
   completa. Si un código coincide con uno de la empresa, el script se aparta y
   lo reporta.

Lo que **no** es un camino: borrar. Ni el script, ni el servicio, ni la base de
datos lo permiten.

---

## 9. Compatibilidad futura declarada

Dos banderas existen sin consumidor y eso es deliberado: agregarlas después,
sobre un catálogo poblado, exigiría una segunda migración y una decisión
retroactiva cuenta por cuenta.

- `requiresCostCenter` — la cuenta exigirá centro de costo cuando la dimensión
  exista. La plantilla la marca en cuentas de gasto y costo.
- `allowsBranchDetail` — la cuenta admite desglose por sucursal en reportes. La
  plantilla la desactiva en patrimonio: el capital de la empresa no se reparte
  por punto de venta.

**Ninguna consulta las lee todavía.** No hay modelo de centro de costo, no hay
dimensión de sucursal en `ChartAccount` (el catálogo es global por diseño) y no
hay reporte que agrupe por ellas.

---

## 10. Autorización

Sin cambios de acceso efectivo respecto a lo que ya existía:

| Rol | Catálogo |
|---|---|
| Administrador | lee y configura |
| Contador | lee y configura |
| Gerente | sin acceso al libro mayor, por tanto sin acceso al catálogo |
| Cajero, Vendedor, Marketing, Soporte Técnico | sin acceso |

`authorizeContabilidad("operate")` (el guardia anterior de estas acciones) y
`authorizeFinancialFoundation("configure")` (el del servicio) resuelven ambos a
Administrador y Contador con alcance contable global. La autorización se movió
junto a las reglas que protege; nadie ganó ni perdió permisos.

---

## 11. Lo que FF1.1 explícitamente NO hace

- No genera asientos ni contabiliza nada (FF1.4).
- No crea mapeos contables automáticos: la estructura de FF1.0 sigue vacía y su
  contenido es una decisión contable, no técnica.
- No implementa impuestos, tasas ni cálculo tributario. Los nombres fiscales de
  la plantilla (IVA, IR, INSS, INATEC, impuesto municipal) son **rótulos de
  cuenta**, no reglas.
- No implementa POS, facturación, tesorería ni integración bancaria.
- No implementa centros de costo ni reportes por sucursal: solo declara las
  banderas.
- No toca Caja, ventas, inventario ni el portal.
- No cambia la aritmética de cierre de caja (sigue pendiente, ver §13).
- No numera cuentas con el servicio de numeración de FF1.0: el código de una
  cuenta lo define el plan contable, no un contador secuencial.

---

## 12. Verificación pendiente

La migración `20260802120000_chart_of_accounts_foundation` se escribió a mano y
se contrastó contra la salida de `prisma migrate diff --from-empty` para
confirmar que nombres de columnas, tipos, valores por defecto, índices y claves
foráneas coinciden exactamente con el esquema objetivo.

**No se aplicó a ninguna base de datos**: la instancia PostgreSQL de desarrollo
no estaba disponible en la máquina de entrega (`localhost:15432` inalcanzable,
Docker detenido) — la misma situación de FF1.0. Antes de dar FF1.1 por cerrado
hay que ejecutar, en un entorno con la base alcanzable:

```bash
npx prisma migrate deploy
npx prisma migrate status
npm run prisma:seed:cuentas
```

Y un smoke `SMOKE-FF1.1` con base real que ejercite, como mínimo:

1. Siembra de la plantilla: 239 cuentas, jerarquía correcta, ninguna aprobada.
2. Re-ejecución de la siembra: cero cambios, ninguna decisión revertida.
3. Siembra con una cuenta `EMPRESA` del mismo código: se omite y se reporta.
4. Línea de asiento contra cuenta de agrupación: rechazada.
5. Línea de asiento contra cuenta de plantilla sin aprobar: rechazada.
6. Línea de asiento contra cuenta aprobada y activa: aceptada.
7. Contabilización tras desactivar una cuenta usada en el borrador: rechazada.
8. Cuenta fuera de la ventana de vigencia en la fecha del asiento: rechazada.
9. Mover una cuenta dentro de su propio subárbol: rechazado.
10. Mover un subárbol que excedería 6 niveles: rechazado.
11. Mover un subárbol válido: niveles recalculados en toda la rama.
12. Archivar una cuenta con subcuentas vivas: rechazado.
13. Cambiar el tipo de una cuenta con movimientos: rechazado.
14. Crear una subcuenta bajo una cuenta con movimientos: rechazado.
15. Backfill de la migración sobre un catálogo poblado: niveles y
    `allows_posting` correctos.

Siguiendo la metodología de los smokes 4.0S (aserciones explícitas, cero
fixtures remanentes).

---

## 13. Dependencias abiertas antes de FF1.4

1. **Aprobación del catálogo por el contador de la empresa.** Es la decisión que
   convierte la plantilla en el plan de cuentas de MotoMas. Bloqueante.
2. **Mapeo contable por evento**, decidido y firmado por contabilidad. La
   estructura existe desde FF1.0; el contenido no.
3. **Moneda funcional y política de tipo de cambio**, aún sin definir.
4. **Importe monetario en `Sale`**, requisito para integrar ventas y COGS.
5. **Movimientos de efectivo y aritmética de cierre de caja**, el trabajo que el
   plan de estabilización tenía numerado como FF1.1 y que sigue pendiente (ver
   la nota de numeración en
   [FINANCE_STABILIZATION_PLAN.md](FINANCE_STABILIZATION_PLAN.md)).
