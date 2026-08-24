# Integraciones con Meta — Lead Ads y WhatsApp

Estado: **Meta-1 y Meta-2 entregados** — el webhook, la captación de Lead Ads y
WhatsApp (entrantes, bienvenida automática, envíos y estados de entrega)
funcionan. Falta lo que sólo puedes hacer tú en el panel de Meta (§1 y §7),
conectar las páginas reales en el CRM (§4) y dar de alta el número emisor de
WhatsApp (§7.3).

Lo que este documento **no** cubre porque todavía no existe: gestión de
plantillas (crearlas y someterlas a aprobación) y cualquier cosa de Meta Ads
(campañas, métricas, presupuestos, pagos).

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
| **Webhooks** | Recibir la entrega de cada lead y cada mensaje de WhatsApp. |
| **Inicio de sesión con Facebook** | Sólo para poder generar el token de página. |
| **WhatsApp** | Mensajería por WhatsApp Cloud API (ver §7). |

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
- **Campos a suscribir:** `leadgen` (bajo el objeto **Página**) y `messages`
  (bajo el objeto **Cuenta de WhatsApp Business**). Ningún otro campo se procesa
  hoy.

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
| `WHATSAPP_ACCESS_TOKEN` | Token del Usuario del Sistema (§7.2). |
| `WHATSAPP_PHONE_NUMBER_ID` | Id numérico del número emisor (§7.3). |

Si falta `META_APP_SECRET`, el webhook rechaza **todas** las entregas con 401. Es
deliberado: sin poder verificar la firma, aceptar una entrega sería aceptar
cualquier cosa que llegue a esa URL.

---

## 3. Qué hace el webhook con Lead Ads

`GET /api/webhooks/meta` — el saludo de suscripción. Devuelve `hub.challenge` en
texto plano si `hub.mode=subscribe` y el token coincide; 403 en cualquier otro
caso.

`POST /api/webhooks/meta` — cada entrega:

1. Verifica `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo con
   `META_APP_SECRET`, comparación en tiempo constante). **401 antes de tocar la
   base de datos** si no cuadra.
2. Reparte por producto. Los dos entran por la MISMA URL y la MISMA firma:
   - `object: "page"` + `field: "leadgen"` → Lead Ads, lo que sigue en esta
     sección.
   - `object: "whatsapp_business_account"` + `field: "messages"` → WhatsApp
     (§7).
   Cualquier otra forma se registra y responde 200 sin procesar — Meta reintenta
   con insistencia ante cualquier otra respuesta.
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

---

## 7. WhatsApp (Meta-2)

Entra por el **mismo** webhook y la **misma** firma que Lead Ads. No hay una
segunda URL ni un segundo secreto.

### 7.1 Qué suscribir

En el panel de Meta, producto **WhatsApp** → **Configuration** → **Webhooks**:

- **URL de devolución de llamada:** la misma, `https://TU-DOMINIO/api/webhooks/meta`
- **Token de verificación:** el mismo `META_WEBHOOK_VERIFY_TOKEN`
- **Campo a suscribir:** **`messages`**, y sólo ese.

Un detalle que confunde: `messages` es el campo de **las dos cosas**. Los
mensajes que escribe el cliente y las devoluciones de estado de lo que enviamos
llegan con `"field": "messages"`; lo que las distingue es si el `value` trae un
arreglo `messages` o uno `statuses`. Suscribir sólo `messages` basta para recibir
ambas.

### 7.2 Token del Usuario del Sistema

No uses un token personal: caduca al cambiar la contraseña y WhatsApp deja de
responder sin aviso.

1. **Business Manager → Configuración del negocio → Usuarios → Usuarios del
   sistema** → crea uno (rol Administrador).
2. **Añadir activos** → la cuenta de WhatsApp Business, con control total.
3. **Generar token** → elige la app → permisos:
   - `whatsapp_business_messaging` (enviar y recibir)
   - `whatsapp_business_management` (leer la configuración del número)
4. Elige caducidad **Nunca** y guárdalo en `WHATSAPP_ACCESS_TOKEN`.

### 7.3 El número emisor — pendiente

**WhatsApp Manager → API Setup → «Phone number ID».** Es un identificador
numérico, **no** el número de teléfono.

Todavía no está dado de alta, así que `WHATSAPP_PHONE_NUMBER_ID` está vacío. Con
la variable vacía:

- **Recibir sigue funcionando**: los mensajes entrantes se registran igual.
- **Enviar falla de forma explícita**, con el mensaje
  `WHATSAPP_PHONE_NUMBER_ID no configurado`, y **no deja ninguna fila** en la
  bitácora. No revienta ni se queda callado.

### 7.4 La ventana de servicio de 24 horas

Es política de plataforma de Meta, no una regla de este CRM:

- **Dentro** de las 24 h del último mensaje del cliente → se puede enviar texto
  libre.
- **Fuera** → sólo una plantilla aprobada. Meta rechaza el texto libre por su
  cuenta.

El CRM comprueba la ventana **en el servidor** antes de gastar la llamada, y
devuelve un error propio (`fuera-de-ventana`) para poder ofrecer la plantilla en
pantalla en vez de mostrar el error críptico de Meta.

La ventana se calcula desde la **bitácora de mensajes** (`whatsapp_messages`): el
`created_at` del último ENTRANTE. No hay ningún campo «visto por última vez» que
pudiera desviarse de lo que realmente pasó en la conversación.

**El CRM nunca cambia un texto libre por una plantilla por su cuenta.** Mandar
algo distinto de lo que el vendedor escribió sería peor que no mandar nada.

### 7.5 Plantillas

Este parche **no** gestiona plantillas: no las crea ni las somete a aprobación.
Eso se hace en el **WhatsApp Manager**.

Las plantillas que el CRM puede enviar están declaradas en
`src/server/whatsapp/shared.ts` → `WHATSAPP_APPROVED_TEMPLATES`. Hoy contiene una
sola:

```ts
export const WHATSAPP_APPROVED_TEMPLATES = {
  hello_world: { language: "en_US" },
};
```

⚠️ `hello_world` es la plantilla de muestra que Meta crea ya aprobada en toda
cuenta nueva. Está como **marcador de posición**: sirve para comprobar que el
camino funciona de punta a punta y **hay que sustituirla** por la plantilla de
apertura real en español en cuanto esté aprobada. El nombre y el idioma tienen
que coincidir **exactamente** con lo registrado en el WhatsApp Manager.

Un nombre que no esté en esa lista se rechaza **sin llamar a Meta**, en vez de
intentarlo con un nombre adivinado.

### 7.6 La respuesta automática de primer contacto

Cuando alguien escribe por **primera vez** —no hay ningún mensaje anterior de ese
teléfono en la bitácora— el CRM responde una sola vez, automáticamente. Del
segundo mensaje en adelante no responde nadie más que una persona.

**Dónde se edita el texto:**

```
src/server/whatsapp/shared.ts  →  WHATSAPP_WELCOME_MESSAGE_ES
```

Es una constante suelta precisamente para que cambiar la redacción sea editar esa
línea, sin tocar ninguna lógica. El texto actual es **provisional**, no la
redacción final del negocio:

> «Gracias por escribir a MotoMas. En breve te atiende alguien de nuestro
> equipo.»

Si el envío de la bienvenida falla, se registra en el log y **la entrega
responde 200 igual**: Meta reenviaría el mismo mensaje entrante, y el cliente
acabaría con la conversación duplicada por culpa de un saludo.

### 7.7 Dónde se ve la conversación

**Panel → Leads** y **Panel → Clientes**: cada fila tiene un botón de WhatsApp
que abre el hilo. Dentro se ve la conversación en orden, el estado de cada
mensaje enviado, y el cuadro de texto — deshabilitado con su explicación cuando
la ventana de 24 h está cerrada, con el botón de plantilla en su lugar.

Lo pueden usar Administrador, Gerente y Vendedor (`canOperateCrm`): escribirle a
un cliente es operar el CRM. Cajero y Contador no.

### 7.8 Qué se registra y qué no

| Situación | ¿Deja fila? |
|---|---|
| Mensaje entrante | Siempre, aunque su teléfono no coincida con ningún lead ni cliente |
| Envío aceptado por Meta | Sí, con su `wa_message_id` |
| Envío que salió y Meta rechazó | Sí, como `FALLIDO`, sin `wa_message_id` |
| Envío rechazado antes de salir (fuera de ventana, sin número, plantilla no aprobada) | **No** |

Un envío que nunca llegó a Meta no tiene `wa_message_id` y no hay nada que
correlacionar después; guardarlo llenaría el hilo de mensajes que el cliente
nunca pudo recibir.

### 7.9 Estados de entrega

`sent` → `ENVIADO`, `delivered` → `ENTREGADO`, `read` → `LEIDO`, `failed` →
`FALLIDO`. Un estado que Meta añada en el futuro y no conozcamos se registra y no
toca la fila.

Los estados sólo **avanzan**: Meta puede entregar las devoluciones desordenadas,
y un `sent` que llega después de un `delivered` no hace retroceder lo que se
muestra. `FALLIDO` es terminal.

Una devolución de estado para un `wa_message_id` que no está en la bitácora —por
ejemplo, un mensaje enviado antes de que esta funcionalidad existiera— se
registra y se ignora. No se crea una fila a partir de un estado: sería inventar
un mensaje del que no se conoce ni el texto ni el destinatario.

### 7.10 Verificación

```
npm run smoke:meta2
```

Necesita base de datos. La API de WhatsApp está simulada; la ventana, la
idempotencia, el emparejamiento por teléfono y el reparto del webhook son código
real.
