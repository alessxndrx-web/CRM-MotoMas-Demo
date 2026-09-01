# Integraciones con Meta — Lead Ads, WhatsApp y cuentas publicitarias

Estado: **Meta-1 y Meta-2 entregados** — el webhook, la captación de Lead Ads y
WhatsApp (entrantes, bienvenida automática, envíos y estados de entrega)
funcionan. Falta lo que sólo puedes hacer tú en el panel de Meta (§1 y §7),
conectar las páginas reales en el CRM (§4) y dar de alta el número emisor de
WhatsApp (§7.3).

Meta-3 añade el registro de **cuentas publicitarias** (§8) y Meta-4 el **tablero
de métricas** (§9): las dos son sólo consulta. **No crean campañas, no las
pausan, no cambian presupuestos y no gastan dinero.**

Lo que este documento **no** cubre porque todavía no existe: gestión de
plantillas de WhatsApp (crearlas y someterlas a aprobación) y cualquier operación
de escritura sobre Meta Ads.

---

## 0. Alcance real de la integración (revisado el 2026-09-01)

Al inspeccionar los paneles de Meta apareció algo que este documento daba por
sentado y **no era cierto**: los activos de MotoMas no cuelgan de un único
porfolio empresarial, sino de **cinco**.

| Porfolio | Activos | Business ID |
|---|---|---|
| **Motomas S.A Sucursales** | 7 | `1398827153319161` |
| GM MOTOS Taller Y Repuestos: Central | 8 | — |
| Motomás Nicaragua Sucursales | 0 (restringido para anuncios) | `1414077217221690` |
| Motomás Las Mercedes | 1 | — |
| Motomás Multicentro | 0 | — |

Importa porque **un Usuario del Sistema pertenece a un solo porfolio** y su token
sólo alcanza los activos de ése. `META_MARKETING_ACCESS_TOKEN` y
`META_PAGE_ACCESS_TOKEN` son una variable cada una: el código no contempla un
token por porfolio.

**Decisión tomada: se integra únicamente «Motomas S.A Sucursales».** Los otros
porfolios quedan fuera hasta que se decida si se consolidan los activos o si hay
que ampliar el código. Todo lo que sigue en este documento asume ese alcance.

Los identificadores reales, verificados uno por uno, están en
`docs/meta-ids.txt`, junto con los bloqueantes pendientes.

### Alta inicial de los activos

```
npm run prisma:seed:meta
```

`prisma/seed-meta.mjs` da de alta en la base de datos los 5 mapeos
página→sucursal y la cuenta publicitaria `act_1094612733171477`. Es idempotente
y **no contiene ni un solo secreto**: sólo identificadores públicos.

Hace lo mismo que el panel (§4 y §8.3), pero reproducible y revisable en Git. El
panel sigue siendo la herramienta de Marketing para el día a día.

Dos cosas que el seed **no** hace, a propósito:

- No mapea `GM Motos: Central ventas` (`1398779383323938`). Es otra marca, no
  una sucursal, y no hay ninguna equivalente en el CRM. Sus leads caen al andén
  hasta que el negocio decida dónde van.
- No llama al Graph API. Los metadatos de la cuenta publicitaria quedan vacíos
  hasta que alguien pulse «Actualizar» en el panel — que además es la única
  comprobación real de que el token llega a la cuenta.

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
| `META_MARKETING_ACCESS_TOKEN` | Token de Usuario del Sistema con `ads_read` (§8.1). |

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

---

## 8. Cuentas publicitarias (Meta-3)

Un **registro de conexión**: qué cuentas publicitarias sigue MotoMas, con sus
datos básicos leídos del Graph API.

No entra por el webhook. Lead Ads y WhatsApp *reciben* eventos que Meta empuja;
esto *consulta* con peticiones `GET`. Por eso vive en su propio módulo
(`src/server/meta-ads/`) y no toca la ruta del webhook.

**Alcance, explícito:** sólo lectura y conexión. Desde aquí **no** se crea
ninguna campaña, **no** se pausa ninguna, **no** se cambia ningún presupuesto y
**no** se gasta un córdoba. No existe una sola llamada de escritura a la
Marketing API en este código.

### 8.1 El token: `ads_read` y nada más

> ⚠️ **Corregido el 2026-09-01.** Este apartado decía que todas las cuentas
> cuelgan del mismo Business Manager. **No es así**: hay cinco porfolios (ver
> §0). Lo que sigue vale para las cuentas de «Motomas S.A Sucursales», que es el
> alcance acordado; las de los otros porfolios necesitarían otro token y el
> código no lo contempla.

Las cuentas del porfolio «Motomas S.A Sucursales» son del mismo negocio. Eso
permite algo que ahorra bastante trabajo: **un único token de Usuario del Sistema
las lee todas**, sin necesidad de montar un OAuth por cuenta.

1. **Business Manager → Configuración del negocio → Usuarios → Usuarios del
   sistema.** Usa el mismo Usuario del Sistema de WhatsApp (§7.2) o crea otro.
2. **Añadir activos → Cuentas publicitarias** → marca cada cuenta que MotoMas
   deba poder leer. Sin este paso el token no llega a la cuenta, por muy válido
   que sea, y el panel lo rechazará al conectarla.
3. **Generar token** → alcance: **`ads_read`**. Sólo ese.
4. Guárdalo en `META_MARKETING_ACCESS_TOKEN`.

> ⚠️ **No le des `ads_management`.**
>
> Es el permiso que permite crear campañas, pausarlas y mover presupuestos: un
> token con `ads_management` puede gastar dinero. Se pedirá más adelante, junto
> con topes de gasto duros, y no antes de que esos topes existan. Un token capaz
> de gastar sin nada que limite cuánto es un riesgo sin contrapartida.
>
> Esta decisión es de mínimo privilegio deliberado, no un descuido: el código de
> Meta-3 sólo hace `GET` y no funcionaría distinto con más permisos.

### 8.2 Dónde está el `act_` de una cuenta

El identificador tiene la forma literal **`act_` seguido de dígitos**, por
ejemplo `act_1234567890`, y **se pega con el prefijo**: es exactamente lo que el
Graph API espera como ruta del nodo.

Dónde encontrarlo:

- **Business Manager → Configuración del negocio → Cuentas → Cuentas
  publicitarias.** La columna del identificador muestra el número; el panel
  espera ese número con `act_` delante.
- O en el **Administrador de anuncios**: el selector de cuenta muestra el ID
  debajo del nombre, y aparece también en la URL como `act=1234567890`.

Si pegas sólo los dígitos, el panel te lo dice antes de intentar nada — no gasta
una consulta a Meta para confirmar algo que ya se ve mal escrito.

### 8.3 Cómo se usa el panel

**Panel → Marketing**, sección **Cuentas publicitarias de Meta**, debajo de los
mapeos de página. La ven Administrador y Marketing (`canManageMarketing`, la
misma puerta de Meta-1).

**Conectar** — pega el `act_…` y, si quieres, un nombre interno. Al pulsar
Conectar el servidor consulta el Graph API: ésa es la validación de verdad. Si
el token no llega a esa cuenta o la cuenta no existe, **no se guarda nada** y se
muestra qué hacer (concederle acceso al Usuario del Sistema).

**Actualizar** — vuelve a leer nombre, moneda y estado, y sella la fecha de
última consulta. Es un botón, no un trabajo programado: **no hay sincronización
automática**, y por eso la columna «Última consulta» dice «Sin resincronizar»
hasta que alguien lo pulse. Lo que ves entre pulsaciones es lo que Meta dijo al
conectar.

**Pausar / Reanudar** — el interruptor de seguimiento de MotoMas. Es
independiente del estado que Meta le dé a la cuenta: una cuenta ACTIVE en Meta
puede dejar de interesarnos, y una DISABLED puede seguir siendo relevante para
consultar su historial.

**Desconectar** — quita la fila del registro.

> **Desconectar NO revoca nada en Meta.** El Usuario del Sistema conserva
> exactamente el mismo acceso que tenía; lo único que cambia es que MotoMas deja
> de seguir la cuenta aquí. Revocar el acceso de verdad es un paso manual y
> aparte, en el Business Manager. El panel lo dice con estas mismas palabras
> debajo de la tabla.

### 8.4 Estados de la cuenta

`account_status` llega de Meta como un código numérico y se guarda tal cual:

| Código | Significado |
|---|---|
| 1 | Activa |
| 2 | Deshabilitada |
| 3 | Sin liquidar |
| 7 | Revisión de riesgo pendiente |
| 8 | Liquidación pendiente |
| 9 | Periodo de gracia |
| 100 | Cierre pendiente |
| 101 | Cerrada |

Sólo el 1 significa que la cuenta puede entregar anuncios. Un código que Meta
añada y no esté en la tabla se muestra como «Código N» en vez de inventarle una
etiqueta.

### 8.5 Verificación

```
npm run smoke:meta3
```

Necesita base de datos. El Graph API está simulado y **cuenta las llamadas**, que
es lo que permite demostrar que un identificador mal escrito se rechaza sin
gastar red. La validación, el orden de las comprobaciones, la unicidad y la
autorización son código real.

---

## 9. Tablero de métricas (Meta-4)

**Panel → Marketing**, debajo de las cuentas conectadas. Impresiones, clics,
gasto, CTR y CPC por cuenta, para uno de cinco periodos.

Sigue siendo **sólo lectura**: el mismo token `ads_read` de §8.1, una petición
`GET` más. Ni una llamada de escritura.

### 9.1 Por qué son fotos guardadas y no una consulta en vivo

> **Esto es lo más importante de esta sección. Si vas a "simplificar" algo, lee
> esto primero.**

La Marketing API limita la frecuencia de peticiones **con dureza**, y el límite
se calcula por app y por cuenta publicitaria. Un tablero que consultara a Meta en
cada carga tendría este comportamiento:

- con 14 cuentas conectadas, **14 peticiones por cada visita** a la pantalla;
- varias personas de Marketing mirándolo a la vez multiplican eso;
- al alcanzar el límite, Meta responde error durante una ventana de castigo, y
  el tablero deja de funcionar **justo cuando más se está mirando**.

Por eso existe `meta_ad_metric_snapshots`. El flujo es:

```
Botón «Actualizar»  →  GET /act_.../insights  →  se GUARDA una foto
Cargar la pantalla  →  se LEE la foto guardada  →  cero peticiones a Meta
```

`getLatestMetaAdMetrics()` **no tiene ninguna llamada de red**, y eso está
probado contando las llamadas al Graph API antes y después de invocarla
(`npm run smoke:meta4`). Si alguna vez alguien añade un `fetch` ahí, ha
convertido el tablero exactamente en lo que este diseño evita.

La contrapartida honesta: **lo que ves puede estar viejo**. Por eso cada fila
lleva su edad («actualizado hace X»); un número sin fecha invita a creer que es
de ahora mismo.

### 9.2 Es un historial, no una casilla de caché

Cada refresco **añade** una fila; no pisa la anterior. El tablero se queda con la
más reciente por (cuenta, periodo) y el resto queda como registro de qué dijo
Meta y cuándo — útil el día que alguien pregunte por qué el gasto de un mes
cambió después de que Meta reprocesara atribuciones.

Esa tabla **no tiene clave foránea** a `meta_ad_accounts`: guarda el `act_…` y no
el cuid del registro, para que desconectar una cuenta no borre la prueba de lo
que se gastó. Es la misma postura de `pos_sale_returns` y `meta_unmapped_leads`.
Que la cuenta exista hoy en el registro lo comprueba la aplicación, que es donde
esa regla puede decirlo en español.

### 9.3 Los cinco periodos

| En el panel | `date_preset` de Meta |
|---|---|
| Hoy | `today` |
| Últimos 7 días | `last_7d` |
| Últimos 30 días | `last_30d` |
| Este mes | `this_month` |
| Mes pasado | `last_month` |

Es un conjunto fijo y no un selector de fechas libre a propósito: cada
combinación (cuenta × periodo) es una foto guardada, y un rango libre
multiplicaría las fotos sin que nadie volviera a mirarlas.

El vocabulario del CRM se mantiene aparte del de Meta (`metaAdDatePresetApiValues`
en `src/server/meta-ads/shared.ts`): si Meta renombra un preset, se cambia esa
tabla y no las pantallas.

### 9.4 «Sin datos» no es «cero gasto»

Una cuenta que **nunca** se ha consultado para el periodo elegido muestra
**«Sin datos — actualizar»**, no una fila de ceros.

Son dos cosas distintas:

- **Sin foto** — no hemos preguntado. No sabemos nada.
- **Foto con ceros** — preguntamos, y Meta dijo que no hubo entrega en ese
  periodo.

Colapsarlas haría que una cuenta olvidada pareciera una cuenta que no gastó nada,
que es justo el error que hace tomar decisiones de presupuesto al revés.

En la misma línea: si no hubo clics, el **CPC queda vacío**, no en cero. Un coste
por clic sin clics no es cero — es nada.

### 9.5 «Actualizar todo»

Recorre las cuentas activas **una por una, en secuencia**. No es un `Promise.all`:
disparar una petición por cuenta a la vez es exactamente lo que los límites de
frecuencia castigan.

El fallo de una cuenta **no aborta las demás**. Si una perdió el acceso, el resto
se actualiza igual y el panel dice cuántas entraron y cuál falló, en vez de un
«falló» que ocultaría el avance.

**No hay ningún trabajo programado.** Refrescar lo dispara una persona, igual que
en §8.3. Si en el futuro se quiere automatizar, hay que decidir antes cada cuánto
sin acercarse al límite — y eso es una tarea aparte, no un `setInterval`.

### 9.6 Verificación

```
npm run smoke:meta4
```

Necesita base de datos. El Graph API está simulado y cuenta las llamadas, que es
lo que permite demostrar que la lectura del tablero no toca la red y que el fallo
de una cuenta no arrastra a las otras.
