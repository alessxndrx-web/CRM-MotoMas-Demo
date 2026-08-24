# Integraciones con Meta — Lead Ads

Estado: **Meta-1 entregado** — el webhook y la captación de Lead Ads funcionan.
Falta lo que sólo puedes hacer tú en el panel de Meta (§1) y conectar las páginas
reales en el CRM (§4).

Lo que este documento **no** cubre porque todavía no existe: envío de WhatsApp,
respuestas automáticas y cualquier cosa de Meta Ads (campañas, métricas,
presupuestos, pagos).

---

## 1. Lo que tienes que hacer en el panel de Meta

Nada de esto lo puede hacer el CRM por ti: son permisos y suscripciones que
requieren tu cuenta.

### 1.1 Crear la app

1. Entra a <https://developers.facebook.com/apps> → **Crear app**.
2. Tipo de app: **Negocios** (Business).
3. Vincúlala a tu **Business Manager** (el mismo que administra las páginas de
   MotoMas).

### 1.2 Productos que hay que activar

| Producto | Para qué |
|---|---|
| **Webhooks** | Recibir la entrega de cada lead. |
| **Inicio de sesión con Facebook** | Sólo para poder generar el token de página. |

*No* hace falta activar «Marketing API» para esta funcionalidad: Lead Ads llega
por Webhooks, no por la API de anuncios.

### 1.3 Permisos que hay que solicitar

| Permiso | Para qué |
|---|---|
| `leads_retrieval` | Leer las respuestas del formulario del lead. **Es el imprescindible.** |
| `pages_show_list` | Listar las páginas y saber su `page_id`. |
| `pages_manage_metadata` | Suscribir la página al webhook. |

Los tres pasan por **App Review** antes de funcionar con páginas que no sean de
prueba. Mientras la app esté en modo desarrollo funcionan sólo con páginas donde
tu usuario sea administrador — suficiente para probar.

### 1.4 Suscribir el webhook

En **Webhooks → Página → Suscribirse a este objeto**:

- **URL de devolución de llamada:**
  `https://TU-DOMINIO/api/webhooks/meta`
- **Token de verificación:** exactamente el valor de `META_WEBHOOK_VERIFY_TOKEN`
  de tu `.env`. Si no coinciden, Meta rechaza la suscripción y **no da un mensaje
  de error útil**; el problema es siempre este campo o la URL.
- **Campo a suscribir:** `leadgen`. Sólo ese. Ningún otro campo se procesa hoy.

Meta llama a la URL con un `GET` en ese momento y espera que le devuelvas su
`hub.challenge`. Eso ya está implementado; si el token es correcto, funciona a la
primera.

Después, en la sección **Páginas**, suscribe cada página de MotoMas a la app.

### 1.5 Token de página de larga duración

1. **Graph API Explorer** → elige tu app → elige la página → pide los permisos de
   §1.3 → **Generate Access Token**.
2. Ese token es de corta duración. Canjéalo por uno de larga duración
   (`/oauth/access_token?grant_type=fb_exchange_token`) o usa el token de página
   permanente que devuelve `/me/accounts` con un token de usuario de larga
   duración.
3. Guárdalo en `META_PAGE_ACCESS_TOKEN`.

---

## 2. Variables de entorno

Las tres están documentadas en `.env.example`. **Ninguna se guarda en la base de
datos** y ninguna va al control de versiones: se leen con `process.env` en el
punto de uso, igual que `SESSION_SECRET`.

| Variable | De dónde sale |
|---|---|
| `META_APP_SECRET` | Panel de Meta → Configuración → Básica → Clave secreta. |
| `META_WEBHOOK_VERIFY_TOKEN` | La eliges tú; tiene que ser idéntica en el panel de Meta. |
| `META_PAGE_ACCESS_TOKEN` | El token de página de larga duración de §1.5. |

Si falta `META_APP_SECRET`, el webhook rechaza **todas** las entregas con 401. Es
deliberado: sin poder verificar la firma, aceptar una entrega sería aceptar
cualquier cosa que llegue a esa URL.

---

## 3. Qué hace el webhook, en orden

`GET /api/webhooks/meta` — el saludo de suscripción. Devuelve `hub.challenge` en
texto plano si `hub.mode=subscribe` y el token coincide; 403 en cualquier otro
caso.

`POST /api/webhooks/meta` — cada entrega:

1. Verifica `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo con
   `META_APP_SECRET`, comparación en tiempo constante). **401 antes de tocar la
   base de datos** si no cuadra.
2. Toma sólo los cambios de campo `leadgen`. Cualquier otro (mensajes de
   WhatsApp, etc.) se registra y responde 200 sin procesar — Meta reintenta con
   insistencia ante cualquier otra respuesta.
3. Por cada lead va al **Graph API** a buscar las respuestas.
   **El payload del webhook NO trae el nombre, el teléfono ni el correo**, sólo
   identificadores. Tratarlo como si los trajera crea leads vacíos sin que nada
   falle.
4. Busca la página en el mapeo (§4):
   - **Mapeada y activa** → crea el `Lead` en esa sucursal.
   - **Sin mapear, o mapeada pero inactiva** → guarda el lead en el andén
     («Leads pendientes de sucursal») con sus respuestas ya traídas. **Nunca se
     descarta y nunca se le adivina una sucursal.**

Idempotencia: la misma `leadgen_id` entregada dos veces no crea un segundo
`Lead` ni una segunda fila en el andén. Meta reenvía ante cualquier respuesta que
no sea 200, así que esto ocurre de verdad.

### Mapeo de campos

| Campo del formulario de Meta | Campo de `Lead` | Normalización |
|---|---|---|
| `full_name` | `name` | `sanitizeText` |
| `phone_number` | `phone` | `normalizePhone` (sólo dígitos) |
| `email` | `email` | minúsculas, sin espacios |
| cualquier otro | — | se registra en el log y se omite |

`originChannel` sale de `platform`: `ig` → **Instagram Ads**, cualquier otro →
**Facebook Ads**. Son valores que la taxonomía del CRM ya tenía.

`utmSource` / `utmCampaign` se quedan en `null` a propósito. `campaign_id` y
`campaign_name` de Meta son de Meta Ads: no son UTMs y no corresponden a las
campañas de `MarketingCampaign`. Rellenarlos ensuciaría la atribución.

---

## 4. Cómo usar el panel de mapeo

**Panel → Marketing**, sección **Meta Lead Ads**. Sólo la ven Administrador y
Marketing.

### Conectar una página

1. Consigue el `page_id` numérico de la página (Graph API Explorer, o
   **Configuración de la página → Información → ID de la página**).
2. **Conectar página** → pega el ID, ponle un nombre reconocible y elige la
   sucursal que atiende sus leads.
3. Déjala **Activa**.

Desde ese momento, todo lead de esa página nace directamente como `Lead` de esa
sucursal.

### Resolver los leads que quedaron esperando

Los leads que llegaron antes de conectar la página aparecen en **Leads pendientes
de sucursal**. Elige la sucursal en cada fila y pulsa **Crear lead**.

Es manual y una fila a la vez, a propósito: **conectar una página nueva no
reprocesa el andén.** Si tienes 40 pendientes de la misma página, hay que
resolverlos uno por uno. Automatizarlo es una tarea futura razonable, no está
hecho.

### Desactivar o eliminar una página

- **Desactivar** deja de enrutar leads nuevos a esa sucursal (pasan al andén).
- **Eliminar** quita el mapeo.

Ninguna de las dos toca los `Lead` que ya se crearon: nacen con su `branchId`
copiado, no con una referencia al mapeo, justamente para que desconectar una
página no reescriba historia.

---

## 5. Limitaciones conocidas

1. **Un lead resuelto a mano queda como «Facebook Ads»**, aunque hubiera venido
   de Instagram. El andén guarda `field_data` crudo y no la plataforma, así que
   al resolver se usa el valor por defecto de Lead Ads. Sólo afecta a la etiqueta
   de canal de los leads que pasaron por el andén.
2. **Un formulario sin `full_name` o sin `phone_number` no puede crear un
   `Lead`** — son obligatorios en la base. Ese lead queda en el andén marcado
   «Falta nombre/teléfono» y el botón de resolver queda deshabilitado: la acción
   no puede inventar los datos que el formulario no preguntó. **Al diseñar tus
   formularios en Meta, incluye siempre nombre y teléfono.**
3. **Sin reconciliación automática** del andén (§4).
4. **Una página apunta a una sola sucursal.** Si una página llega a atender
   varias, es otra decisión y otra tabla.
5. La versión del Graph API está fijada en `src/server/meta/ingest.ts`
   (`GRAPH_API_VERSION`). Al subirla, revisa la forma de `field_data`.

---

## 6. Verificación

```
npm run smoke:meta
```

Necesita base de datos y al menos dos sucursales activas. Construye peticiones
HTTP reales contra los handlers de la ruta (saludo, firma manipulada, página
mapeada, sin mapear, inactiva, reenvíos, evento ajeno, resolución manual y CRUD
con su puerta de permiso). El Graph API está simulado; el resto es código real.
