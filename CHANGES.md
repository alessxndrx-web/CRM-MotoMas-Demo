# MotoMas - Registro de cambios

## Parche 1.0 - Fase 0

- Se separaron las dos experiencias principales del proyecto:
  Portal Cliente publico y Centro de Operaciones privado bajo `/panel`.
- `RootLayout` quedo limitado a infraestructura global compartida.
- `PortalLayout` quedo con navegacion publica.
- `OperationsLayout` quedo con navegacion interna de `/panel`.
- Las rutas internas quedaron agrupadas bajo `/panel`.
- Los modulos futuros del Centro de Operaciones quedaron como placeholders.

## Parche 1.1 - Fase 1

- Se implemento el Portal Cliente publico para las rutas `/`, `/catalogo`
  y `/motocicletas/[slug]`.
- Se agrego un catalogo publico independiente del inventario operativo en
  `src/data/catalog/motorcycles.ts`.
- Se incorporaron imagenes reales del archivo `Catalogo motomas.zip` en
  `public/catalog/motorcycles`.
- Se actualizo el Home publico con hero, accesos a catalogo, solicitud de
  informacion, consulta de expediente, motocicletas destacadas y proceso de
  atencion.
- Se actualizo `/catalogo` para mostrar tarjetas con imagen, nombre, marca,
  categoria, descripcion corta y acciones publicas.
- Se actualizo `/motocicletas/[slug]` para mostrar detalle publico con imagenes,
  descripcion, colores y ficha tecnica usando solo informacion proporcionada.
- No se agregaron precios, stock operativo, vendedores, reportes, login interno,
  formularios funcionales ni leads.

## Parche 1.2 - Solicitud de informacion publica + creacion de Lead

- Se implemento `/solicitar-informacion` como formulario publico funcional del
  Portal Cliente.
- Se agregaron datos base para sucursales, canales de origen y estructura de lead
  en `src/data/operations/leads.ts`.
- Se agrego una capa de tipos del portal en `src/features/portal/types.ts`.
- Se agrego un servicio cliente para guardar leads publicos en `localStorage`
  usando la clave `motomas-public-leads-v1`.
- El formulario captura nombre, telefono, correo opcional, moto de interes,
  sucursal deseada y canal de origen.
- Los leads se crean con estado `Nuevo Lead`, sucursal seleccionada y
  `vendedorAsignado: null`.
- Los botones existentes de solicitud desde Home, catalogo y detalle mantienen la
  conexion hacia `/solicitar-informacion`; cuando llega `?moto=...`, la moto se
  preselecciona.
- Tras enviar, el portal muestra codigo de solicitud, sucursal que dara
  seguimiento y aviso de que no implica aprobacion de credito, reserva ni
  disponibilidad.
- No se implementaron bandeja interna de leads, asignacion a vendedores,
  clientes, expedientes, creditos, inventario, traslados, ventas ni reportes.

## Parche 1.3 - Bandeja interna de Leads para Gerente

- Se implemento `/panel/leads` como primera vista operativa real del Centro de
  Operaciones.
- La bandeja lee leads desde `localStorage` usando la clave existente
  `motomas-public-leads-v1`.
- Se ampliaron los estados permitidos de lead a `Nuevo Lead`, `Asignado`,
  `Contactado`, `Interesado` y `Descartado`.
- Se agregaron vendedores demo para asignacion manual: Roberto, Maria y Jose.
- Se agregaron leads demo cuando hay pocos datos disponibles, sin asignar leads
  automaticamente.
- Se agregaron filtros por sucursal, estado y busqueda por nombre o telefono.
- Se agregaron metricas rapidas para leads nuevos, asignados, contactados e
  interesados.
- Se agrego panel de detalle basico del lead con acciones para asignar vendedor
  y cambiar estado.
- Se mantuvo compatibilidad con leads existentes creados en el Portal Cliente.
- No se implementaron clientes, expedientes, creditos, inventario, traslados,
  ventas ni reportes.

## Parche 1.4 - Consulta publica de solicitud / expediente

- Se implemento `/consultar-expediente` como pantalla funcional del Portal
  Cliente para consultar solicitudes por codigo o telefono.
- La consulta lee las solicitudes publicas guardadas con la clave existente
  `motomas-public-leads-v1`.
- Se muestra nombre, codigo, telefono, motocicleta de interes, sucursal, canal,
  estado publico, fecha de creacion, asesor si existe y proximo paso.
- Se agrego una linea de progreso visual con los pasos Solicitud recibida,
  En revision por sucursal, Asesor asignado, Contacto realizado e Interesado.
- Se mapearon los estados internos actuales a lenguaje publico de solicitud,
  asesor, sucursal, proceso y seguimiento.
- Se agrego mensaje claro cuando no se encuentra una solicitud con los datos
  ingresados.
- Se agrego acceso visible desde el Home y desde la confirmacion de
  `/solicitar-informacion`; el header publico ya mantenia acceso a consulta.
- No se tocaron modulos de `/panel` ni se implementaron clientes internos,
  expedientes reales, creditos, reservas, entregas, inventario, traslados,
  ventas ni reportes.

## Parche 2.0 - Sesion interna demo por rol y sucursal

- Se agrego una sesion interna demo con `localStorage` usando la clave
  `motomas-demo-session-v1`.
- Se crearon usuarios internos demo para Vendedor, Gerente y Administrador, sin
  incluir Cliente dentro del login operativo.
- `/panel` ahora permite iniciar sesion demo y redirige segun rol: Vendedor y
  Gerente hacia leads, Administrador hacia dashboard.
- `OperationsShell` muestra la sesion activa, separa el alcance por rol y filtra
  la navegacion interna segun permisos basicos.
- Se agrego un dashboard interno sensible a rol: vendedor, gerente o
  administrador global.
- `/panel/leads` ahora filtra por sesion: el Gerente ve leads de su sucursal, el
  Vendedor ve solo leads asignados a el y el Administrador ve la operacion
  global como supervision.
- La asignacion operativa de leads quedo orientada al Gerente de sucursal,
  reutilizando la logica existente y manteniendo compatibilidad con
  `motomas-public-leads-v1`.
- Se agrego carga de trabajo de vendedores para el Gerente.
- Se agrego registro manual de lead para el Vendedor, asignado automaticamente a
  su usuario y sucursal, con estado inicial `Asignado`.
- Se agregaron observacion inicial y seguimiento opcional al registro de lead sin
  crear cliente formal, expediente, credito ni venta.
- No se tocaron rutas del Portal Cliente ni se implementaron clientes,
  expedientes, creditos, traslados, ventas ni reportes nuevos.

## Parche 2.1 - Conversion de Lead a Cliente + Expediente basico

- Se agrego persistencia local para clientes en `motomas-customers-v1`.
- Se agrego persistencia local para expedientes basicos en
  `motomas-customer-files-v1`.
- Se extendio el modelo de lead con estado `Expediente` y referencias a
  `clienteId`, `expedienteId` y `numeroExpediente`.
- En `/panel/leads`, el Vendedor puede crear expediente desde leads asignados en
  estado `Contactado` o `Interesado`.
- Al crear expediente, se crea el cliente si no existe o se reutiliza por
  telefono para evitar duplicados.
- El cliente conserva sucursal origen, lead origen e historial de interacciones.
- El expediente conserva numero, cliente, lead, moto de interes, sucursal,
  vendedor, estado, fecha y observaciones.
- Se implemento `/panel/clientes` con lista, busqueda por nombre o telefono,
  detalle, historial y expedientes relacionados.
- Se implemento `/panel/expedientes` con lista basica de expedientes, cliente,
  moto, sucursal, vendedor, estado y fecha.
- `/consultar-expediente` muestra el numero de expediente cuando el proceso ya
  fue convertido desde el Centro de Operaciones.
- No se implementaron creditos, reservas, inventario, traslados, ventas ni
  reportes avanzados.

## Parche 2.2 - Inventario por sucursal + trazabilidad de unidades

- Se implemento `/panel/inventario` como modulo operativo interno, sin exponer
  inventario en el Portal Cliente.
- Se agrego inventario simulado basado unicamente en los modelos reales del
  catalogo publico.
- Se agregaron unidades individuales con id, modelo, VIN, chasis, motor, color
  si existe, sucursal actual, estado, fecha de actualizacion e historial de
  movimientos.
- Se agrego persistencia local con la clave `motomas-inventory-units-v1`.
- Se agrego vista agregada por modelo con conteos por sucursal y totales.
- Se agrego vista de unidades con VIN, modelo, sucursal actual, estado, color,
  chasis y motor.
- Se agregaron filtros por modelo, sucursal, estado y busqueda por VIN, chasis
  o motor.
- Se aplico alcance por rol: Vendedor consulta inventario, Gerente ve unidades
  de su sucursal y disponibilidad general, Administrador ve inventario global.
- La estructura queda preparada para trazabilidad y futuros traslados sin crear
  traslados funcionales todavia.
- No se implementaron creditos, ventas, reportes avanzados ni cambios en el
  Portal Cliente.

## Parche 2.3 - Traslados entre sucursales

- Se implemento `/panel/traslados` como modulo operativo para ordenes de
  traslado entre sucursales.
- Se agrego persistencia local de traslados con la clave
  `motomas-transfer-orders-v1`.
- Las solicitudes usan unidades existentes de `motomas-inventory-units-v1` y
  solo permiten seleccionar unidades en estado `Disponible`.
- El Vendedor puede crear solicitudes hacia su sucursal con origen, destino,
  unidad, modelo, VIN, solicitante y motivo.
- Se agregaron estados de traslado: `Pendiente`, `Aprobado`, `En transito`,
  `Recibido` y `Cancelado`.
- El Gerente puede aprobar, marcar en transito y confirmar recepcion de
  traslados relacionados con su sucursal.
- Al marcar en transito, la unidad cambia a estado `En transito` y conserva
  registro de origen, destino y referencia del traslado.
- Al confirmar recepcion, la unidad cambia a la sucursal destino, vuelve a
  estado `Disponible` y registra movimiento en su historial.
- Se agrego vista de ordenes con estado, origen, destino, modelo, VIN, fechas,
  responsable y acciones segun estado.
- El Administrador puede ver todas las ordenes de traslado sin operar el flujo
  de aprobacion en esta fase.
- Se habilito el acceso de Vendedor a `Traslados` en la navegacion interna para
  que pueda solicitar movimientos.
- No se tocaron rutas del Portal Cliente ni se implementaron creditos, ventas,
  reservas o reportes avanzados.

## Parche 2.4 - Reservas de unidades

- Se implemento `/panel/reservas` como modulo operativo para reservar unidades
  disponibles.
- Se agrego persistencia local de reservas con la clave
  `motomas-reservations-v1`.
- Las reservas usan unidades existentes de `motomas-inventory-units-v1` y solo
  permiten seleccionar unidades en estado `Disponible`.
- El Vendedor puede crear reservas propias para un cliente manual o expediente
  existente de la operacion.
- Al crear reserva, la unidad cambia a estado `Reservada` y registra movimiento
  de tipo `Reserva` en su historial.
- Se agregaron estados de reserva: `Activa`, `Cancelada` y `Completada`.
- El Vendedor puede cancelar reservas propias activas; al cancelar, la unidad
  vuelve a estado `Disponible` y se registra el movimiento en historial.
- El Gerente puede consultar reservas de su sucursal sin cancelar reservas de
  vendedores.
- El Administrador puede consultar todas las reservas.
- Se agrego vista de reservas con cliente o expediente, modelo, VIN, sucursal,
  vendedor, estado, fecha y acciones segun rol y estado.
- Se agrego acceso a `Reservas` en la navegacion interna del Centro de
  Operaciones.
- No se tocaron rutas del Portal Cliente ni se implementaron creditos, ventas o
  reportes avanzados.

# CHANGES

## Parche 2.4.1 - Integracion y consistencia entre Leads, Clientes, Expedientes, Reservas e Inventario

- Se unifico el alcance por rol para leads, clientes, expedientes, reservas,
  traslados e inventario en `src/features/operations/services/operation-scope-service.ts`.
- `/panel/clientes` ahora muestra clientes segun relacion real con leads y
  expedientes del usuario o sucursal.
- `/panel/expedientes` ahora filtra expedientes por rol y sucursal manteniendo
  consistencia con leads asignados y expedientes creados.
- `/panel/leads` reutiliza la logica compartida de alcance del vendedor y
  muestra acceso directo al modulo de expedientes cuando el lead ya fue
  convertido.
- `/panel/reservas` ahora limita expedientes disponibles segun el alcance del
  usuario y mantiene la asociacion correcta con expediente y unidad.
- `/panel/dashboard` ahora usa datos reales de `localStorage` para mostrar
  metricas de leads, clientes, expedientes, reservas, traslados e inventario
  segun el rol activo.
- Se valido que la conversion Lead -> Cliente -> Expediente mantiene
  reutilizacion por telefono y visibilidad operativa coherente.
- Se valido que crear y cancelar reservas cambia el estado de la unidad entre
  `Reservada` y `Disponible`.
- Se valido que aprobar, despachar y recibir traslados actualiza la sucursal
  actual, el estado de la unidad y el historial de movimientos.
- No se implementaron creditos, ventas, migracion a base de datos ni cambios
  de diseno en Portal Cliente o Centro de Operaciones.

## Parche 2.5 - Ventas internas basicas

- Se implemento `/panel/ventas` como modulo operativo para registrar ventas
  internas desde reserva activa, expediente existente o cliente existente.
- Se agrego persistencia local de ventas con la clave `motomas-sales-v1`.
- Se agrego modelo de venta con numero, cliente, expediente opcional, reserva
  opcional, unidad, modelo, VIN, sucursal, vendedor, tipo de venta, estado,
  fecha y observaciones.
- Al completar una venta, la unidad cambia a estado `Vendida` y registra un
  movimiento de tipo `Venta` en el historial de inventario.
- Si la venta viene desde una reserva activa, la reserva cambia a estado
  `Completada` y conserva historial de la accion.
- Se bloquea la venta de unidades `Vendida`, `Entregada` o `En transito`.
- Si una unidad esta `Reservada`, solo puede venderse desde su reserva activa
  vinculada.
- Se evita duplicar ventas para la misma unidad.
- Se aplico alcance por rol: el Vendedor ve sus ventas, el Gerente ve ventas de
  su sucursal y el Administrador ve todas las ventas.
- Se mantuvo compatibilidad con reservas, expedientes, inventario y sesiones
  demo existentes.
- No se implementaron creditos, entregas, Portal Cliente ni base de datos real.

## Parche 1.5 - Portal Cliente: Mi Proceso, Mi Reserva y Mi Entrega

- Se agrego una capa compartida de consulta publica para buscar por codigo de
  solicitud, numero de expediente o telefono.
- `/consultar-expediente` ahora muestra una vista general del proceso con datos
  basicos, moto de interes, sucursal, estado, expediente, asesor, proximo paso
  y linea de progreso.
- `/mi-reserva` ahora muestra reserva activa, completada o cancelada cuando
  existe, con modelo, VIN parcial, sucursal, fecha, estado de reserva y estado
  de unidad.
- `/mi-entrega` ahora muestra el estado publico de entrega segun venta, reserva
  e inventario: entrega aun no programada, proceso de entrega en preparacion o
  entregada.
- `/mi-credito` queda como vista informativa limpia porque creditos siguen
  pausados; si existe expediente, indica que el proceso comercial esta activo.
- Se agrego navegacion clara entre Mi proceso, Mi reserva, Mi entrega y Mi
  credito conservando los parametros de consulta.
- La confirmacion de `/solicitar-informacion` ahora enlaza a las consultas
  publicas relacionadas usando el codigo de solicitud.
- Se mantuvo el lenguaje publico: solicitud, expediente, asesor, sucursal,
  reserva, entrega, seguimiento y proximo paso.
- No se expone inventario operativo, stock por sucursal, reportes, panel interno
  ni datos de otros clientes.
- No se implementaron creditos, rediseño visual, cambios en `/panel` ni base de
  datos real.

## Parche 1.5.1 - Validaciones del formulario publico y cedula

- Se agrego el campo `cedula` al modelo de lead publico manteniendo
  compatibilidad con solicitudes anteriores sin cedula.
- `/solicitar-informacion` ahora solicita numero de cedula y muestra ayuda con
  el formato `Ejemplo: 001-010101-0000A`.
- Se agregaron validaciones por campo para nombre, telefono, cedula, correo,
  moto de interes, sucursal y canal de origen.
- El telefono solo permite numeros, se limita a 8 digitos y se guarda solo con
  digitos.
- La cedula acepta formato con guiones `001-010101-0000A` o sin guiones
  `0010101010000A`, convierte la letra final a mayuscula y se guarda
  sanitizada.
- El nombre es obligatorio, queda limitado a 80 caracteres y no permite
  numeros.
- El correo sigue siendo opcional, pero si se completa debe tener formato valido
  y no superar 120 caracteres.
- La moto de interes, sucursal y canal se validan contra las listas existentes
  del catalogo, sucursales y canales permitidos.
- Los errores se muestran debajo de cada campo y el formulario no guarda la
  solicitud mientras existan errores.
- `/consultar-expediente` muestra la cedula registrada y usa `No registrado`
  para solicitudes anteriores sin cedula.
- No se tocaron modulos de `/panel`, creditos, ventas ni base de datos real.

## Parche 1.5.2 - Cierre logico del Portal Cliente

- Se amplio la consulta publica para buscar por codigo de solicitud, numero de
  expediente, telefono o cedula.
- Se mantuvo compatibilidad con solicitudes anteriores sin cedula, mostrandolas
  sin bloquear la consulta publica.
- La navegacion entre Mi proceso, Mi reserva, Mi entrega y Mi credito conserva
  el parametro de busqueda usado, incluida la cedula.
- El header publico conserva los parametros publicos permitidos al navegar entre
  Mi credito, Mi reserva y Mi entrega.
- Se ajustaron mensajes visibles para solicitud no encontrada, sin reserva
  activa, entrega aun no programada y credito pendiente de habilitar.
- Se mantuvo lenguaje publico orientado a solicitud, expediente, asesor,
  sucursal, seguimiento, proximo paso, reserva y entrega.
- Se verifico que las vistas publicas no expongan ids internos, stock operativo,
  inventario por sucursal, reportes, panel interno ni terminos tecnicos de
  almacenamiento.
- No se tocaron modulos de `/panel`, creditos reales, rediseno visual ni base de
  datos real.

## Parche 2.6 - Entrega de unidad

- Se agrego el estado `Entregada` al modelo de ventas y el campo
  `fechaEntrega`, manteniendo compatibilidad con ventas anteriores sin fecha de
  entrega.
- Se agrego el movimiento de inventario tipo `Entrega` para registrar
  trazabilidad cuando una unidad se entrega.
- En `/panel/ventas`, el Vendedor responsable puede marcar como entregada una
  venta en estado `Completada`.
- Al marcar entrega, la venta cambia a `Entregada`, la unidad cambia a
  `Entregada`, se guarda la fecha de entrega y se registra el movimiento en el
  historial de la unidad.
- `/panel/ventas` ahora muestra ventas completadas y entregadas, fecha de venta
  y fecha de entrega cuando existe.
- `/panel/inventario` refleja la unidad con estado `Entregada` usando la
  persistencia existente `motomas-inventory-units-v1`.
- `/mi-entrega` muestra `Motocicleta entregada`, modelo, sucursal y fecha de
  entrega cuando la venta ya fue entregada.
- Se mantiene el alcance por rol: Vendedor opera sus ventas, Gerente consulta
  entregas de su sucursal y Administrador conserva vista global.
- No se implementaron creditos, rediseno del Portal Cliente ni base de datos
  real.

## Parche 2.7 - Revision integral del flujo demo y limpieza de datos

- Se revisaron las transiciones entre solicitudes, clientes, expedientes,
  reservas, traslados, ventas, entregas e inventario local.
- La conversion a cliente ahora compara telefono y cedula normalizados, por lo
  que una cedula con o sin guiones reutiliza el mismo cliente existente.
- La creacion de expediente es idempotente por solicitud: si ya existe, se
  reutiliza en vez de crear un expediente duplicado.
- Una reserva se bloquea cuando la unidad tiene un traslado activo y su
  cancelacion no puede liberar una unidad cuyo estado ya no es `Reservada`.
- Una venta respeta la reserva activa de la unidad y solo permite completar una
  venta desde la reserva correspondiente del Vendedor responsable.
- La consulta publica reconoce cedulas de clientes ya convertidos y conserva la
  busqueda por codigo de solicitud, expediente y telefono.
- El dashboard interno incorpora ventas dentro de las metricas filtradas por
  rol y sucursal.
- `/panel/configuracion` mantiene el reinicio restringido a Administrador: borra
  las transacciones locales demo, cierra la sesion y restaura el inventario demo
  base para iniciar un nuevo recorrido.
- El `RootLayout` deja de depender de fuentes remotas durante el build y usa
  pilas tipograficas locales equivalentes, preservando los tokens visuales.
- Se conservaron los mensajes vacios de leads, clientes, expedientes, reservas,
  ventas y traslados, sin agregar modulos ni cambios de diseno.
- No se implementaron creditos ni se migro a una base de datos real.

## Parche 3.0 - Preparacion para base de datos real

- Se agrego `DATABASE_PLAN.md` con el modelo relacional recomendado, entidades,
  relaciones, tablas futuras, restricciones e implementacion gradual.
- Se centralizaron las ocho claves activas de persistencia en
  `src/shared/persistence/storage-keys.ts`, conservando exactamente los valores
  ya usados por la demo.
- Se agrego una abstraccion tipada de `localStorage` en
  `src/shared/persistence/local-storage-adapter.ts`, sin conectarla todavia a
  una base de datos ni cambiar el comportamiento actual.
- Se agregaron contratos base para repositorios de leads, clientes, expedientes,
  inventario, traslados, reservas y ventas en
  `src/shared/persistence/repository-types.ts`.
- Los modelos y servicios existentes siguen exponiendo sus constantes de clave
  para preservar compatibilidad con datos locales y evitar un refactor amplio.
- El reinicio interno de datos demo ahora reutiliza la lista centralizada de
  claves persistentes.
- No se agregaron dependencias, credenciales, APIs, backend, Prisma, Supabase,
  PostgreSQL ni cambios de interfaz. `localStorage` sigue siendo la
  persistencia activa.

## Parche 3.1 - Diseno Prisma/PostgreSQL para MotoMas

- Se agrego `prisma/schema.prisma` como borrador de diseno relacional para
  PostgreSQL, sin instalar Prisma, ejecutar comandos ni crear una conexion.
- El esquema modela usuarios, roles, sucursales, leads, clientes,
  interacciones, expedientes, catalogo, unidades, movimientos, traslados,
  reservas, ventas y actividad operativa.
- Se agregaron enums para roles, estados de lead, unidad, traslado, reserva,
  venta, tipo de venta y movimientos de inventario.
- Se definieron relaciones e indices para trazabilidad de unidades, alcance por
  sucursal, asignacion de usuarios y el flujo lead -> cliente -> expediente ->
  reserva -> venta -> entrega.
- Se agrego `PRISMA_PLAN.md` con el mapeo de claves locales, orden de migracion,
  riesgos y limites de la siguiente fase.
- No se tocaron UI, Portal Cliente, panel, servicios de `localStorage`,
  dependencias, credenciales, `.env`, API routes ni datos existentes.

## Parche 2.8 - Seguimientos y actividades comerciales

- Se agrego persistencia local de actividades con la clave
  `motomas-activities-v1`, centralizada en `storage-keys.ts` e incluida en el
  reinicio interno de datos demo.
- Se creo el modelo de actividad con tipo, estado, prioridad, fechas, resultado,
  responsable, sucursal y referencias opcionales a lead, cliente y expediente.
- Se implemento `/panel/actividades` con pendientes, completadas, filtros por
  estado, tipo, prioridad, sucursal y vendedor, mas busqueda por contacto,
  telefono, expediente o contenido de actividad.
- Leads, clientes y expedientes ahora muestran historial, proxima accion y
  controles para registrar actividades dentro del flujo comercial.
- Las actividades de un lead convertido siguen visibles desde el cliente y el
  expediente relacionados.
- Se aplico alcance por rol: Vendedor administra sus actividades, Gerente ve y
  da seguimiento a las de su sucursal y Administrador conserva vista global.
- El dashboard agrega metricas de actividades pendientes hoy, vencidas,
  seguimientos completados y proximas citas segun el alcance de sesion.
- No se tocaron Portal Cliente, creditos, Prisma, PostgreSQL, dependencias ni
  el comportamiento existente de inventario, reservas, traslados, ventas o
  entregas.

## Parche 2.8.1 - Marketing, campanas y reportes comerciales

- Se agrego persistencia local de campanas con la clave
  `motomas-marketing-campaigns-v1` centralizada en `storage-keys.ts`.
- Se implementaron `/panel/marketing` y `/panel/reportes` con atribucion de
  solicitudes, filtros por rol, metricas y barras HTML/CSS.
- El formulario publico conserva `campaignId` y UTM sin mostrarlos al cliente.
- Gerente ve solo datos de su sucursal, Administrador ve todo y Vendedor no ve
  Marketing ni Reportes.
- Se documento la futura integracion Meta Lead Ads en `PRISMA_PLAN.md`, sin
  backend, webhook, credenciales, Prisma ni base de datos real.

## Parche 2.9 - Compatibilidad y mejoras de actividades comerciales

- `fechaProgramada` ahora es opcional en el modelo, el servicio y los
  formularios de actividades, para conservar notas y contactos historicos sin
  fecha agendada.
- El historial comercial mantiene actividades sin fecha y distingue la ultima
  actividad completada de la proxima accion programada.
- Desde clientes se pueden registrar Nota, Llamada, WhatsApp manual, Visita y
  Seguimiento sin obligar una fecha programada.
- Los vencimientos, las proximas acciones y las proximas citas solo consideran
  actividades pendientes con fecha programada valida.
- El dashboard tolera actividades sin fecha y agrega la metrica de actividades
  pendientes con prioridad Alta dentro del alcance del rol.
- `/panel/actividades` incorpora filtro por fecha seguro y mantiene visibles
  las actividades sin fecha cuando no se aplica ese filtro.
- `/panel/reportes` incorpora conteos de actividades por tipo, vendedor y
  sucursal, ademas de completadas, vencidas, prioridad Alta y WhatsApp manual.
- Se documento que la futura tabla de actividades debe conservar la fecha de
  agenda como campo opcional.
- Build validado con `npm.cmd run build`.

## Parche 2.10 - Proforma unica dentro del expediente

- Se agrego persistencia local de proformas con la clave
  `motomas-quotes-v1`, centralizada para mantener compatibilidad con el reinicio
  de datos demo.
- Cada expediente puede conservar una sola proforma comercial editable; no se
  crean proformas duplicadas para el mismo expediente.
- La proforma se administra dentro del detalle de `/panel/expedientes`, sin
  agregar una navegacion ni un modulo principal adicional para Vendedor.
- Se incorporaron campos para moto cotizada, forma de pago, precio referencial,
  prima, plazo, cuota estimada, moneda, vencimiento y observaciones, sin
  inventar precios ni datos financieros.
- Se agregaron estados Borrador, Emitida, Aceptada, Vencida y Cancelada. La
  fecha de vencimiento muestra visualmente una proforma emitida como vencida.
- Crear o emitir una proforma registra una actividad comercial completada en
  el historial relacionado del expediente.
- La proforma no reserva unidades, no crea ventas, no aprueba creditos y no
  reemplaza al expediente ni a la facturacion legal.
- Dashboard y reportes incorporan metricas de proformas filtradas por rol y
  sucursal: emitidas, aceptadas, vencidas y monto referencial cotizado.
- Se actualizo el diseno futuro de base de datos con la tabla `quotes` y su
  relacion unica con el expediente, sin instalar Prisma ni ejecutar migraciones.
- Build validado con `npm.cmd run build`.

## Parche 2.11 - Documentos del expediente

- Se agrego persistencia local documental con la clave
  `motomas-expedient-documents-v1`, incluida en las claves centralizadas de la
  demo.
- Se incorporo el checklist Documentos del expediente dentro de
  `/panel/expedientes`, sin crear un modulo principal separado para Vendedor.
- El checklist puede inicializar los documentos base: Cedula, Comprobante de
  ingresos, Recibo de servicios, Constancia laboral y Referencia personal.
- Se permite agregar Documento adicional y administrar estados Pendiente,
  Recibido, Revisado y Rechazado con observaciones de hasta 300 caracteres.
- Rechazar un documento requiere una observacion; las acciones incluyen marcar
  recibido, revisado, rechazado, volver a pendiente y editar observacion.
- Los cambios a Recibido, Revisado o Rechazado registran una actividad comercial
  completada en el historial del expediente.
- Se agregaron metricas documentales por alcance de rol al dashboard y reportes
  de estado, expedientes pendientes o listos, y rechazos por sucursal y vendedor.
- El checklist no adjunta archivos, no bloquea reservas o ventas, no aprueba
  creditos y no modifica el Portal Cliente.
- Se documento la futura tabla `customer_file_documents` y sus campos de
  adjuntos futuros, sin instalar Prisma ni ejecutar migraciones.
- Build validado con `npm.cmd run build`.

## Parche 2.12 - Vitrina dinamica de motocicletas en home

- Se reemplazo la cuadrícula estatica de motocicletas destacadas en `/` por una
  vitrina dinamica que usa exclusivamente los modelos e imagenes del catalogo
  existente.
- La vitrina muestra una motocicleta por vez, con avance automatico, controles
  anterior/siguiente e indicadores de posicion manuales.
- La imagen y el nombre de cada modelo enlazan a la solicitud publica con la
  motocicleta preseleccionada mediante `?moto=<slug>`.
- Se agrego una accion principal Solicitar informacion junto a la imagen y una
  accion secundaria Ver detalles hacia la ficha publica existente.
- La presentacion adopta una superficie clara y comercial dentro del Portal
  Cliente, sin alterar la navegacion, datos, `/catalogo`, detalle de moto ni
  modulos de `/panel`.
- Se mantiene un fallback visual seguro si un modelo no tiene imagen y el texto
  de informacion pendiente cuando falte una descripcion corta.
- Build validado con `npm.cmd run build`.

## Parche 2.12.1 - Ajuste visual de vitrina dinamica

- Se elimino la superficie blanca/gris que rodeaba la moto en la vitrina de la
  home y se integro el carrusel al fondo premium del Portal Cliente.
- La motocicleta activa ahora ocupa el centro de la vitrina con mayor escala,
  profundidad y sombra ambiental discreta, sin crear una tarjeta plana detras.
- En escritorio se agregaron motos laterales parcialmente visibles con escala,
  opacidad y transformaciones CSS para reforzar el efecto de showroom digital.
- Se conservaron la rotacion automatica, controles manuales, indicadores y los
  enlaces existentes hacia solicitud de informacion y detalle de cada moto.
- En movil se mantiene solo la moto protagonista y controles contenidos para
  evitar desbordamiento horizontal.
- No se modificaron el catalogo, las fichas de motos, datos, solicitudes ni el
  Centro de Operaciones.
- Build validado con `npm.cmd run build`.

## Parche 2.13 - Creditos manuales por expediente

- Se agrego persistencia local de seguimiento de credito con la clave
  `motomas-credit-applications-v1`, incluida en las claves centralizadas y el
  reinicio interno de datos demo.
- Cada expediente puede tener un solo seguimiento de credito editable, con
  financiera opcional, tipo de financiamiento, estado manual, montos, prima,
  plazo, cuota estimada, moneda, documentos pendientes y observaciones.
- El seguimiento se administra dentro del detalle de `/panel/expedientes`; no
  reserva unidades, no genera una venta, no aprueba creditos automaticamente y
  no se conecta a financieras externas.
- Se agrega una alerta cuando el expediente tiene documentos pendientes o
  rechazados y se conserva el control documental existente.
- Crear o cambiar el estado de un seguimiento registra una actividad comercial
  completada vinculada al expediente.
- Dashboard y reportes incluyen metricas de creditos en revision,
  documentacion pendiente, aprobados, rechazados y montos solicitados bajo el
  alcance de rol y sucursal.
- La navegacion de Creditos se limita a Gerente y Administrador; Vendedor opera
  el seguimiento desde sus expedientes.
- Se actualizo el diseno futuro de persistencia con `credit_applications`, sin
  instalar Prisma, ejecutar migraciones, crear APIs ni cambiar la demo activa.
- Build validado con `npm.cmd run build`.

## Parche 2.14 - Rollback de refactor visual

- Se revirtieron los cambios visuales recientes que alteraban la composicion
  estable del Portal Cliente.
- Se restauraron la estructura anterior de home, header, vitrina, catalogo y
  componentes visuales compartidos.
- Se conservaron intactos los modulos funcionales, rutas, persistencia local,
  modelos de datos y reglas comerciales previas.
- Build validado con `npm.cmd run build`.

## Parche 2.15 - Consolidacion del flujo de creditos manuales

- Se formalizo la regla de un solo seguimiento manual de credito activo por
  expediente, con financiera editable y sin solicitudes simultaneas por
  financiera en esta fase.
- Se implemento `/panel/creditos` como vista consolidada para Gerente y
  Administrador, con metricas por estado, filtros de estado, sucursal,
  vendedor, financiera y busqueda, mas acceso al expediente relacionado.
- Vendedor conserva la gestion del credito desde sus propios expedientes y no
  recibe navegacion al modulo consolidado.
- `/mi-credito` muestra solo el estado publico, documentacion pendiente y el
  proximo paso; no expone montos, financiera, observaciones ni datos internos.
- Se alinearon PROJECT_RULES, FLOWS, ROLES, DATABASE_PLAN, PRISMA_PLAN,
  PROJECT_AUDIT y el borrador Prisma con la regla actual y una futura
  ampliacion multi-financiera sujeta a aprobacion.
- No se agregaron APIs bancarias, multiples solicitudes por expediente,
  reservas o ventas automaticas, backend, Prisma instalado ni base de datos
  real.
- Build validado con `npm.cmd run build`.

## Parche 2.16 - Gestion operativa de vendedores

- Se cerro el placeholder de `/panel/vendedores` con una vista de supervision
  demo disponible para Gerente y Administrador.
- La vista reutiliza los vendedores demo existentes, sin crear persistencia,
  usuarios reales, contrasenas ni cambios a la sesion interna.
- Se agregaron filtros por sucursal, estado visual y busqueda por nombre; el
  Gerente solo ve vendedores de su sucursal y el Administrador conserva la
  vista global.
- Cada vendedor muestra leads asignados, actividades pendientes y vencidas,
  expedientes, reservas activas, ventas completadas y creditos en seguimiento.
- El detalle incorpora leads por estado, ultimas actividades, expedientes
  relacionados, resumen de creditos y rendimiento comercial basico.
- Reportes ya contaba con cortes por vendedor de leads, actividades, ventas,
  creditos y documentos rechazados; se mantuvo sin refactor adicional.
- Vendedor no recibe navegacion ni acceso operativo a la supervision de
  vendedores.
- Esta vista es de supervision demo; la gestion real de usuarios queda para
  una futura autenticacion y base de datos centralizadas.
- Build validado con `npm.cmd run build`.

## Parche 2.17 - Estabilizacion UI/copy por secciones

- Se corrigieron acentos y ortografia visibles en Portal Cliente y Centro de
  Operaciones, sin modificar enums, rutas ni logica comercial.
- Se unificaron textos de navegacion, botones, labels, placeholders, badges y
  encabezados relacionados con catalogo, solicitud, sesion, operacion,
  creditos, documentacion y transito.
- Se mejoraron estados vacios de leads, clientes, expedientes, actividades,
  inventario, traslados, reservas, ventas, creditos, vendedores, documentos,
  proformas y reportes con contexto y siguiente accion.
- Se retiro nomenclatura tecnica visible de Configuracion; el reinicio demo
  conserva exactamente el mismo comportamiento.
- No se redisenaron home, hero, vitrina, layouts, servicios, persistencia,
  permisos, calculos ni componentes estructurales.
- Build validado con `npm.cmd run build`.

## Parche 2.18 - Showroom dinamico MotoMas en Home

- Se reemplazo la vitrina anterior de la Home por un carrusel showroom aislado
  en `motomas-showroom-carousel.tsx`; la vitrina previa queda sin uso.
- El nuevo showroom usa los PNG locales sin fondo entregados para los cinco
  modelos reales del catalogo, con un mapeo claro por `slug` sin alterar los
  datos de `/catalogo`.
- Se incorporo una moto central protagonista, motos laterales parciales en
  escritorio, perspectiva, escala, opacidad, transiciones suaves y sombra de
  piso sin contenedores blancos detras de las unidades.
- La escena adopta identidad MotoMas oscura con acentos azul y naranja, luces
  de profundidad y controles de anterior, siguiente, indicadores y autoplay.
- Cada modelo conserva enlaces hacia solicitar informacion con moto
  preseleccionada y hacia su detalle publico existente.
- En movil se ocultan las motos laterales y se mantienen la moto principal,
  texto, acciones e indicadores sin desbordamiento horizontal.
- No se modificaron catalogo, detalle, formularios, persistencia, panel ni
  modulos operativos.
- Build validado con `npm.cmd run build`.

## Parche 2.18.1 - Hero Showroom MotoMas en Home

- Se reemplazaron el hero superior anterior, las cards de acceso y la vitrina
  separada por un unico Hero Showroom como primer bloque de la Home.
- La composicion se ajusto a una escena de showroom: moto central protagonista,
  motos laterales parciales en escritorio, controles a los lados e indicadores
  inferiores con autoplay.
- El Hero ocupa el viewport inicial en escritorio y conserva una composicion
  controlada en tablet y movil, donde se ocultan los laterales para evitar
  desbordamiento horizontal.
- Se integraron los assets locales MotoMas: motos transparentes por `slug` y
  una version transparente y recortada del logo entregado para eliminar su
  fondo blanco continuo.
- Se mantuvieron fondo oscuro, profundidad, sombra de piso y acentos azul y
  naranja sin cards rigidas ni superficies blancas detras de las motos.
- Se conservaron los enlaces de solicitud con moto preseleccionada y detalle
  publico, sin modificar catalogo, formularios, persistencia ni panel.
- Build validado con `npm.cmd run build`.

## Parche 2.18.2 - Ajuste de composicion del Hero Showroom

- Se elimino el texto decorativo innecesario `SHOWROOM MOTOMAS` para dejar una
  jerarquia mas limpia centrada en el modelo destacado.
- Se alinearon la moto protagonista y las motos laterales sobre una misma base
  visual usando anclajes inferiores y origen de transformacion inferior.
- Se normalizo la escala: la moto activa conserva protagonismo y nitidez,
  mientras las laterales reducen tamano, opacidad e intrusion visual.
- Se ajustaron el bloque de texto, los controles y la decoracion de fondo para
  mejorar legibilidad y reducir ruido sin cambiar la composicion general.
- Se conservaron los botones Solicitar informacion y Ver detalles con accion
  principal naranja y accion secundaria azul/oscura.
- Se mantiene el comportamiento responsive: en movil solo aparece la moto
  principal, sin desbordamiento horizontal.
- Build validado con `npm.cmd run build`.

## Parche 2.18.3 - Suelo falso y ambiente del Hero Showroom

- Se agrego un suelo falso tipo showroom con capas CSS en perspectiva, integrado
  al fondo oscuro sin superficies planas, tarjetas ni nuevos assets.
- Se incorporo una sombra ambiental eliptica y un halo controlado bajo la moto
  protagonista para reforzar el efecto de apoyo visual.
- Se reforzo la profundidad del Hero con reflejos sutiles a nivel de suelo y
  acentos azul/naranja de baja intensidad.
- Se conservaron la alineacion de las motos, los controles, los enlaces y el
  comportamiento responsive; en movil las capas se simplifican sin desborde.
- Build validado con `npm.cmd run build`.

## Parche 2.18.4 - Animacion fluida del Hero Showroom

- Se reemplazo el intercambio de una sola imagen por capas persistentes para
  los estados activa, anterior, siguiente y ocultas del carrusel.
- La moto entrante ahora se desplaza hacia el centro mientras aumenta escala,
  opacidad y nitidez; la saliente se reduce y se mueve hacia su lateral.
- Se aplicaron transiciones CSS de 700 ms con curva suave para transformacion,
  opacidad y desenfoque, evitando desmontajes visuales bruscos.
- Se conservaron autoplay, controles, indicadores sincronizados y enlaces de
  solicitud y detalle; los controles ahora anuncian modelo anterior/siguiente.
- En movil las motos no activas permanecen ocultas visualmente con una
  transicion de fade/scale, sin laterales ni desbordamiento horizontal.
- Build validado con `npm.cmd run build`.

## Parche 2.18.5 - Correccion visual del Hero Showroom

- Se hicieron mas visibles las motos laterales en escritorio mediante mayor
  escala, opacidad y una posicion mas cercana al escenario central.
- La animacion de cambio ahora usa una duracion de 1200 ms y una curva suave
  para reforzar la entrada lateral hacia el centro.
- Se reforzo el suelo tipo garaje/showroom con plano oscuro, reticula tenue en
  perspectiva, linea de horizonte, brillo de ruedas y sombra ambiental.
- Se agrego un marco angular de profundidad con acentos azul y naranja detras
  de la moto protagonista, junto con halos y lineas de fondo mas perceptibles.
- Se conservaron la composicion de texto, controles, indicadores, enlaces y el
  comportamiento responsive: en movil no se muestran laterales ni hay desborde.
- Build validado con `npm.cmd run build`.

## Parche 2.18.6 - Assets de fondo y suelo para Hero Showroom

- Se extrajeron e incorporaron los assets entregados en
  `public/motomas/hero/background.webp` y `public/motomas/hero/floor.webp`.
- El Hero usa `background.webp` como capa de escenario y `floor.webp` como
  capa inferior independiente, sin modificar ni reemplazar las motos locales.
- Se conservaron overlays suaves para legibilidad, linea de horizonte y sombras
  de contacto para que el carrusel se integre visualmente al suelo.
- Se mantuvieron el carrusel dinamico, autoplay, controles, indicadores,
  enlaces, motos laterales y comportamiento responsive existentes.
- No se modificaron catalogo, detalle de motos, formularios, persistencia ni
  modulos del Centro de Operaciones.
- Build validado con `npm.cmd run build`.

## Parche 2.18.7 - Pulido premium del Hero Showroom

- Se mejoro la integracion visual entre moto, fondo y suelo con un halo tenue
  detras del modelo activo, sombras de contacto por unidad y reflejo controlado.
- Se ajustaron la opacidad del suelo, el degradado inferior y la linea de
  horizonte para una lectura mas natural de showroom oscuro.
- Las motos laterales conservan sus posiciones y animacion aprobadas, pero
  reducen brillo, saturacion y contraste para integrarse sin competir.
- Se mejoro el balance del fondo mediante overlays de legibilidad y se pulieron
  el bloque de texto, los botones, flechas e indicadores.
- Se conserva responsive sin desbordamiento y la animacion existente mantiene
  sin cambios su duracion, easing, autoplay, estados y estructura de slides.
- Build validado con `npm.cmd run build`.

## Parche 2.18.8 - Reconstruccion visual del Hero Showroom

- Se completo la reconstruccion interna del Hero en capas de escenario,
  atmosfera, suelo, marco, plataforma, motos, texto, controles e indicadores.
- El fondo se integra como escenario con vignette y halo central, mientras
  `floor.webp` se une gradualmente mediante mascara superior y degradados.
- La moto central conserva mayor protagonismo sobre una plataforma
  central-derecha, con sombra bajo chasis, sombras especificas bajo ruedas y
  reflejo ambiental alineado al piso.
- Las motos laterales permanecen parciales y visibles en escritorio, con menor
  escala, contraste y nitidez para reforzar profundidad sin competir.
- Se incorporo un marco angular azul/naranja sutil detras del escenario y se
  reforzo el contraste localizado del bloque de texto.
- Los botones, controles, indicadores, enlaces y comportamiento responsive se
  conservaron; la animacion mantiene estados, autoplay, duracion y easing.
- Build validado con `npm.cmd run build`.

## Parche 2.18.9 - Reconstruccion del Hero Showroom como escena integrada

- Se reconstruyo internamente el Hero Showroom como una escena por capas:
  fondo, atmosfera, marco, suelo, plataforma, motos, texto, controles e
  indicadores.
- Se agrego calibracion visual por `slug` para ajustar escala,
  desplazamiento, baseline y sombras de cada PNG sin modificar los datos del
  catalogo.
- La moto central gana protagonismo con mayor escala, posicion central-derecha,
  sombras bajo chasis y sombras especificas bajo rueda delantera y trasera.
- El fondo se trata como escenario mediante `background.webp`, overlays, halo y
  vignette; `floor.webp` se integra con mascara, degradados y reticula de
  perspectiva.
- Las motos laterales permanecen visibles y naturales, con menor escala,
  contraste, saturacion y nitidez para no competir con la protagonista.
- Se incorporo un marco angular azul/naranja mas fiel a la referencia visual,
  sin crear assets nuevos ni modificar el catalogo.
- Se conservaron carrusel, autoplay, controles, indicadores, enlaces,
  responsive y rutas existentes.
- Build validado con `npm.cmd run build`.

## Parche 2.19 - Rol Contador y base contable

- Se agrego el rol interno `Contador` separado del flujo comercial y con ruta
  inicial en `/panel/contabilidad`.
- Se agrego acceso contable bajo `/panel/contabilidad` y subrutas para diarios,
  comprobantes, documentos, gastos, inventario, planilla y reportes.
- Se incorporo un dashboard contable con metricas de diarios, comprobantes,
  documentos, inventario con costo, gastos, planilla y saldo minimo.
- Se agrego persistencia demo separada para diarios, comprobantes, documentos,
  gastos, planilla e inventario contable con costos.
- Se implementaron diarios contables con columnas basadas en la plantilla
  "Diarios JUNIO 2026".
- Se implementaron comprobantes de ingreso, egreso, cheque, transferencia,
  reembolso y ajuste.
- Se agregaron gastos por categorias operativas y documentos contables base:
  Factura, Nota de Debito, Nota de Credito y Recibo Oficial de Caja.
- Se agrego inventario contable con item/modelo, sucursal, cantidad, costo
  unitario, costo total, saldo minimo, estado de saldo y ultimo movimiento.
- Se agrego planilla salarial basica con empleado, cargo, sucursal, salario,
  comisiones, bonos, deducciones, anticipos, neto a pagar, periodo, estado y
  observaciones.
- Se aplico regla de costos: Contador y Administrador ven costos globales,
  Gerente ve costos solo de su sucursal y Vendedor no ve costos.
- El Contador queda bloqueado fuera de rutas contables y no puede crear leads,
  asignar leads, gestionar vendedores, reservas, traslados ni ventas.
- No se tocaron Portal Cliente, Home, Hero Showroom, catalogo, formularios
  publicos, Prisma, dependencias ni persistencias comerciales.
- Build validado con `npm.cmd run build`.

## Parche 2.19.1 - QA de permisos y navegacion del rol Contador

- Se reviso el acceso exclusivo del Contador a `/panel/contabilidad` y sus
  subrutas, manteniendo bloqueo para rutas comerciales.
- Se ajusto la navegacion y el copy de sesion para que el Contador se presente
  como area contable separada, no como Administrador comercial.
- Se valido que el Vendedor no vea menus contables, no entre a contabilidad y
  no vea costos.
- Se reforzo la visibilidad de costos: Contador y Administrador ven alcance
  global; Gerente ve inventario y reportes contables solo de su sucursal.
- Se ajustaron reportes contables para que el Gerente no reciba diarios,
  comprobantes ni documentos globales sin sucursal.
- Se revisaron diarios, comprobantes, documentos, gastos, inventario contable
  y planilla; documentos muestra los tipos base Factura, Nota de Debito, Nota
  de Credito y Recibo Oficial de Caja.
- Se corrigieron textos visibles, acentos, estados de saldo y mensajes de
  alcance sin cambiar rutas, persistencia ni logica comercial.
- Se actualizaron `ROLES.md`, `FLOWS.md` y `ARCHITECTURE.md` con el QA de
  permisos contables.
- Build validado con `npm.cmd run build`.

## Parche 2.20 - Documentos contables base y formatos oficiales

- Se mejoro `/panel/contabilidad/documentos` con listado, filtros por tipo,
  estado y sucursal, y preview visual tipo documento.
- Se amplio la estructura demo de documentos contables para Factura, Nota de
  Debito, Nota de Credito y Recibo Oficial de Caja.
- Cada documento conserva numero, fecha, cliente/proveedor, RUC o cedula,
  sucursal, concepto, documento origen, subtotal, retenciones, abono, total,
  estado, observaciones, creado por, revisado por, fecha de revision y motivo
  de anulacion interna si aplica.
- Se agregaron estados internos Borrador, Emitido, Revisado, Contabilizado y
  Anulado sin implementar anulacion fiscal real.
- Se agrego `buildMotorcycleInvoiceDescription` para generar la descripcion de
  factura de motocicleta con orden fijo: MARCA, MODELO, CHASIS, MOTOR, COLOR,
  AÑO, CASCO, PÓLIZA y CILINDRAJE.
- El preview muestra encabezado, datos de tercero, sucursal, documento origen,
  conceptos, descripcion de motocicleta cuando aplica, retenciones, abono,
  total, observaciones y trazabilidad de revision.
- Se documento la separacion futura entre Caja y Contabilidad: Caja emitira en
  un parche posterior; Contabilidad revisa, contabiliza y concilia.
- Se mantuvieron permisos del Parche 2.19.1 y no se tocaron Portal Cliente,
  Home, Hero Showroom, catalogo, formularios publicos, Prisma, dependencias ni
  logica comercial.
- Build validado con `npm.cmd run build`.

## Parche 2.21 - Rol Caja y emision operativa de documentos

- Se agrego el rol interno `Cajero` separado del flujo comercial y de
  Contabilidad completa.
- Se agrego el area `/panel/caja` con subrutas de facturacion, recibos, notas y
  cierres diarios.
- Se implemento facturacion operativa demo con items, subtotal, abono,
  retencion 1%, retencion 2%, total, forma de pago, banco, referencia,
  observaciones y descripcion de motocicleta con el orden contable aprobado.
- Se implementaron recibos oficiales de caja demo, notas de debito, notas de
  credito y cierre diario de caja base.
- Se agregaron persistencias demo `motomas-cashier-invoices-v1`,
  `motomas-cashier-receipts-v1`, `motomas-cashier-notes-v1` y
  `motomas-cashier-closures-v1`.
- Los documentos emitidos por Caja se sincronizan como documentos contables
  internos para revision en `motomas-accounting-documents-v1`.
- Se mantuvo la separacion: Caja emite documentos operativos; Contabilidad
  revisa, contabiliza y concilia.
- El Cajero no ve leads, ventas comerciales, reservas, traslados, inventario con
  costos, Contabilidad completa, Portal Cliente, catalogo publico, Prisma ni
  dependencias nuevas.
- Administrador conserva acceso global y Contador conserva acceso contable.
- Build validado con `npm.cmd run build`.

## Parche 2.21.1 - QA de permisos y sincronizacion Caja -> Contabilidad

- Se revisaron los permisos del rol `Cajero` para mantenerlo limitado a
  `/panel/caja`, facturacion, recibos, notas y cierres.
- Se corrigio la navegacion principal del shell interno para que el logo lleve
  a la ruta inicial de cada rol y no envie a Cajero o Contador a rutas
  comerciales restringidas.
- Se valido que Vendedor no ve Caja ni Contabilidad, Cajero no entra a
  Contabilidad completa ni costos, Contador conserva acceso contable y
  Administrador mantiene vista global.
- Se reviso la sincronizacion Caja -> Contabilidad: facturas, recibos y notas
  emitidas por Caja se reflejan como documentos internos en
  `motomas-accounting-documents-v1`.
- Se agregaron acciones contables para marcar documentos como revisados o
  contabilizados desde Contabilidad; Caja no puede ejecutar esas acciones.
- Se ajustaron calculos demo para retencion 1%, retencion 2%, abonos y totales
  en Caja y documentos contables base.
- Se valido que la factura de motocicleta reutiliza
  `buildMotorcycleInvoiceDescription` con orden fijo y no depende de escritura
  manual.
- Se actualizaron `ROLES.md`, `FLOWS.md` y `ARCHITECTURE.md` con el QA final de
  permisos y flujo documental.
- Build validado con `npm.cmd run build`.

## Parche 2.22 - Flujo de revisión, contabilización y conciliación

- Se completaron los estados documentales internos: Borrador, Emitido,
  Revisado, Contabilizado, Conciliado y Anulado.
- Se agregó trazabilidad compatible a documentos contables: creación, revisión,
  contabilización, conciliación, anulación interna, motivo y observaciones
  contables.
- `/panel/contabilidad/documentos` ahora permite a Contador/Administrador
  marcar documentos como Revisado, Contabilizado, Conciliado o Anulado con
  motivo, respetando la secuencia de estados.
- Caja conserva solo la emisión operativa; no puede revisar, contabilizar ni
  conciliar documentos.
- Se agregaron filtros contables por tipo, estado, sucursal, origen, período y
  búsqueda por número, tercero, RUC/cédula, documento origen o concepto.
- Se agregó indicador de comprobante relacionado o pendiente de comprobante.
- Se reforzó la base de conciliación interna con banco, referencia, forma de
  pago, fecha de conciliación y observación contable, sin bancos reales.
- Caja puede cerrar cierres abiertos y Contabilidad puede marcar cierres
  cerrados como Revisado por Contabilidad desde reportes contables.
- `/panel/contabilidad/reportes` agrega métricas de documentos emitidos,
  revisados, contabilizados, conciliados, anulados, pendientes, retenciones,
  abonos, recibido y cierres de caja.
- Se conservaron permisos por rol: Cajero limitado a Caja, Contador/Admin con
  acciones contables, Gerente filtrado por sucursal y Vendedor sin Caja ni
  Contabilidad.
- No se tocaron Portal Cliente, Home, Hero Showroom, catálogo, formularios,
  Prisma, dependencias ni flujos comerciales.
- Build validado con `npm.cmd run build`.

## Parche 2.22.1 - QA del flujo documental Caja → Contabilidad

- Se valido la secuencia de estados documentales: Borrador, Emitido, Revisado,
  Contabilizado, Conciliado y Anulado.
- Se restringio la creacion manual de documentos contables a Borrador o Emitido;
  Revisado, Contabilizado, Conciliado y Anulado quedan solo como acciones
  contables autorizadas.
- Se reforzo que Caja emite documentos y cierres, pero no revisa, contabiliza
  ni concilia; Contador y Administrador conservan esas acciones.
- Se valido la trazabilidad documental de creacion, revision, contabilizacion,
  conciliacion, anulacion interna, motivo y observaciones contables.
- Se reviso la sincronizacion Caja → Contabilidad para facturas, recibos,
  notas de debito y notas de credito con datos fiscales demo, abonos,
  retenciones, total, origen y observaciones.
- Se ajusto el reporte contable para separar subtotal documental, abonos,
  retenciones y total documental, evitando mezclarlo con el total recibido de
  cierres de caja.
- Se mantuvo el indicador de comprobante relacionado o pendiente de
  comprobante, sin generar contabilidad automatica compleja.
- Se revisaron cierres de caja: Caja puede cerrar y Contabilidad puede marcar
  como Revisado por Contabilidad desde reportes.
- Se corrigieron textos visibles y estados vacios puntuales en reportes de
  cierres.
- Se actualizaron `ROLES.md` y `FLOWS.md` con el QA del flujo documental.
- Build validado con `npm.cmd run build`.

## Parche 2.23 - Contabilidad avanzada inspirada en Alegra

- Se reorganizo el rol Contador como workspace contable avanzado, manteniendo
  la separacion Caja emite / Contabilidad revisa.
- Se agrego dashboard contable avanzado con pendientes de revision,
  contabilizacion, conciliacion, ingresos, egresos, retenciones, abonos,
  inventario valorizado, cierres de caja pendientes, planilla y alertas.
- Se agregaron rutas y vistas demo para catalogo de cuentas, bancos,
  conciliacion interna, cierres contables y terceros.
- Se agregaron persistencias demo `motomas-accounting-chart-accounts-v1`,
  `motomas-accounting-banks-v1`,
  `motomas-accounting-reconciliations-v1`,
  `motomas-accounting-closures-v1` y
  `motomas-accounting-third-parties-v1`.
- Se mejoraron diarios con estado contable, resumen Debe/Haber y validacion
  visual de descuadre.
- Se ampliaron comprobantes y gastos con estructura contable para cuenta,
  banco, referencia, debe, haber, subtotal, retenciones y total demo.
- Documentos contables quedan orientados a revision y registro manual
  secundario; Caja conserva la emision operativa.
- Se ampliaron reportes contables con conciliacion bancaria, bancos, cierres
  contables, saldos, pendientes, retenciones, abonos y accion preparada de
  exportacion.
- Se conservaron permisos por rol: Contador/Admin con area contable completa,
  Cajero limitado a Caja, Gerente filtrado por sucursal y Vendedor sin Caja,
  Contabilidad ni costos.
- No se tocaron Portal Cliente, Home, Hero Showroom, catalogo, formularios
  publicos, Prisma, dependencias, DGI, PDF ni bancos reales.
- Build validado con `npm.cmd run build`.

## Patch 2.23.1 - Accounting UX redesign and workflow cleanup

- Se reorganizo visualmente el workspace de Contabilidad con navegacion interna
  agrupada por resumen, operacion diaria, documentos, control contable, soporte
  y analisis.
- El dashboard contable ahora prioriza pendientes de revision,
  contabilizacion y conciliacion, con cola documental y alertas de control.
- `/panel/contabilidad/documentos` queda enfocado en revision: resumen de
  estados, filtros, lista de documentos, preview y acciones por estado.
- El registro manual de documentos paso a una accion secundaria plegable para
  ajustes o documentos no emitidos por Caja.
- Los formularios contables clave incorporan secciones visuales para mejorar
  jerarquia sin cambiar campos, calculos ni persistencia.
- Las tablas contables mejoran legibilidad con cabeceras mas claras, montos
  alineados y badges para estados.
- Se redujo el uso visual de rojo en metricas y graficas, reservandolo para
  alertas o estados de riesgo.
- Se conservaron permisos, flujo Caja -> Contabilidad, estados documentales,
  buildMotorcycleInvoiceDescription y restricciones por rol.
- Build validado con `npm.cmd run build`.

## Patch 2.24 - Seller workflow simplification and productivity UX

- Se aclaro la experiencia del rol Vendedor como workspace comercial diario,
  no como panel administrativo generico.
- Se simplifico la navegacion del Vendedor a Inicio, Mis leads, Clientes,
  Expedientes, Actividades, Inventario, Reservas y Ventas.
- El dashboard del Vendedor queda enfocado en "Mi trabajo de hoy", con resumen
  de leads asignados, seguimientos, actividades, expedientes, reservas y ventas
  en proceso.
- `/panel/leads` prioriza la cola de leads del Vendedor, con registro manual
  como accion secundaria y acciones comerciales de siguiente paso.
- `/panel/clientes` mejora la lectura tipo Customer 360 con identidad,
  historial, interacciones, expedientes, actividades, reservas y ventas.
- `/panel/expedientes` mejora la jerarquia del caso comercial con resumen,
  proforma, documentos, credito, reserva, venta y actividades.
- `/panel/actividades` organiza la agenda por Vencidas, Hoy, Proximas y
  Completadas, con foco en cliente, relacion y proxima accion.
- El inventario para Vendedor queda como consulta comercial de disponibilidad,
  ocultando costos y priorizando modelo, sucursal, unidades, color y accion.
- Reservas y Ventas agregan guia para preferir expediente, reserva activa y
  unidad disponible sin cambiar reglas de negocio.
- Se mejoraron estados vacios y copy en espanol para evitar mensajes genericos
  como "sin registros".
- Se conservaron los limites de permisos del Vendedor: sin Caja, Contabilidad,
  costos, reportes globales, Vendedores ni configuracion global.
- Gerente y Administrador conservaron su comportamiento existente.
- Build validado con `npm.cmd run build`.

## Patch 2.25 - Manager branch supervision and decision workflow UX

- Se aclaro la experiencia del Gerente como centro de supervision y decision
  de sucursal.
- El dashboard del Gerente queda enfocado en decisiones y carga de trabajo con
  el titulo "Operacion de sucursal".
- Se agrego una cola de decisiones para asignar leads, revisar carga alta,
  traslados, reservas en riesgo, actividades vencidas, inventario bajo y ventas
  pendientes.
- Se mejoraron la carga y rendimiento de vendedores con leads activos,
  contactos, seguimientos, reservas, ventas del mes, conversion y estado de
  workload.
- `/panel/leads` mejora la asignacion con leads pendientes visibles, filtros,
  panel de carga comercial y recomendacion de vendedor.
- Inventario agrega supervision por sucursal con disponibles, reservadas, en
  transito, vendidas, alertas de bajo stock y oportunidad de traslado.
- Traslados muestra mayor visibilidad del flujo Solicitud -> Aprobado ->
  En transito -> Recibido.
- Reservas agrega visibilidad de riesgos como reservas sin expediente, activas
  y canceladas o completadas.
- Ventas agrega lectura de progresion comercial Reserva/Expediente -> Venta ->
  Entrega.
- Actividades agrega supervision de vencidas por vendedor, hoy, proximas y
  completadas.
- Se preservo el alcance del Gerente por sucursal.
- Se preservo la visibilidad global del Administrador.
- Se preservo el flujo simplificado del Vendedor del Patch 2.24.
- Build validado con `npm.cmd run build`.

## Patch 2.26 - Cashier workflow and operational UX refactor

Includes:
- clearer Cashier role experience
- simplified Cashier navigation
- cash shift dashboard improvements
- document emission workflow improvements
- invoice composer organized by sections
- receipt workflow improvements
- debit and credit note workflow improvements
- cash closure UX improvements
- document preview and totals clarity
- retention 1%, retention 2%, abono and total clarity
- Caja emits / Contabilidad reviews separation preserved
- Cashier permission boundaries preserved
- Seller, Manager, Admin and Accounting behavior preserved
- build validated

Detalle:

- Se aclaro la experiencia del Cajero como estacion de caja operativa, rapida y
  segura, distinta de Vendedor, Gerente, Administrador y Contador.
- La navegacion de Caja quedo enfocada en Caja (dashboard), Facturacion,
  Recibos, Notas y Cierres, con iconos y estado activo consistentes.
- El dashboard de `/panel/caja` se reorganizo como jornada de caja: estado del
  turno (Abierto/Cerrado con sucursal, cajero, fecha y hora), resumen de la
  jornada (facturas, recibos, notas, total recibido, abonos, retencion 1%,
  retencion 2%, diferencia y desglose por forma de pago), cola de trabajo con
  acciones principales y documentos recientes, y actividad reciente.
- Se agrego calculo del turno vigente a partir de los cierres de la jornada y
  campos demo opcionales `horaApertura`/`horaCierre` en el cierre, sin tocar
  Prisma ni la base de datos futura.
- Los composers de Factura, Recibo y Nota se reorganizaron por secciones
  numeradas (cliente/documento origen, concepto/items, pago/abono/retenciones)
  con un panel de vista previa en vivo que muestra tercero, sucursal, totales,
  retenciones, descripcion de motocicleta y trazabilidad.
- Facturacion, Recibos y Notas mejoran sus listas con busqueda y filtros por
  estado, forma de pago y sucursal; Notas separa claramente Nota de Debito y
  Nota de Credito.
- Cierres muestra el estado del turno, sugerencia de totales de la jornada,
  totales por forma de pago, totales de documentos, retenciones, diferencia,
  observaciones, accion de cerrar caja y estado de revision contable de solo
  lectura. El Cajero no puede marcar un cierre como revisado por Contabilidad.
- Se conservaron las claves de `localStorage`, la sincronizacion Caja ->
  Contabilidad, `buildMotorcycleInvoiceDescription` y el orden obligatorio de la
  descripcion de motocicleta.
- Se conservaron las formulas: retencion 1% = subtotal * 0.01, retencion 2% =
  subtotal * 0.02 y total = subtotal - abono - retenciones aplicadas.
- Se redujo el uso de rojo para acciones normales y seguras de Caja usando un
  estilo primario azul; el rojo queda reservado para acciones destructivas.
- Se preservaron los limites de permisos: Caja emite y prepara/cierra caja pero
  no contabiliza, concilia ni ve costos; el Vendedor no accede a Caja; el
  Contador conserva la revision de documentos emitidos por Caja; Gerente y
  Administrador conservan su comportamiento.
- Build validado con `npm.cmd run build`.

## Patch 2.27 - Accounting final workflow and UX cleanup

Includes:
- clearer Accountant role experience
- accounting dashboard focused on review, accounting and reconciliation
- improved accounting work queue
- improved document review workflow
- manual document registration kept secondary
- journal entries readability improvements
- voucher workflow improvements
- expense accounting improvements
- inventory accounting visibility improvements
- payroll clarity improvements
- banks and reconciliation UX improvements
- cash closure review improvements
- third party and reports UX improvements
- Caja emits / Contabilidad reviews separation preserved
- Accountant permission boundaries preserved
- Seller, Manager, Admin and Cashier behavior preserved
- build validated

Detalle:

- Se aclaro la experiencia del Contador como centro de control contable, no como
  una coleccion de tablas y formularios.
- La navegacion contable se afino con etiquetas orientadas a la mision:
  Revisión de documentos, Asientos contables y Plan de cuentas, y se retiro una
  navegacion oculta muerta. El acento visual paso de rojo excesivo a azul; el
  rojo queda reservado para anulacion interna.
- `/panel/contabilidad` se reorganizo como control center con jerarquia:
  1) trabajo critico (documentos por revisar, por contabilizar y por conciliar,
  cierres de caja por revisar, asientos descuadrados, comprobantes por
  contabilizar, gastos por revisar y planilla por preparar, con enlaces a cada
  seccion), 2) resumen financiero del periodo (ingresos, gastos, retencion 1%,
  retencion 2%, anticipos/abonos, valor de inventario, planilla y diferencias de
  cierre), 3) salud contable (documentacion, plan de cuentas, conciliacion,
  cierres, control interno e inventario), 4) acciones rapidas y 5) actividad
  contable reciente.
- `/panel/contabilidad/documentos` se mantiene orientado a revision: contadores
  de estado, filtros, listado con badge de estado por color, panel de revision
  contable (Revisar, Contabilizar, Conciliar y Anulacion interna), preview con
  trazabilidad, origen Caja, forma de pago, banco/referencia, retenciones y
  total. El registro manual sigue siendo secundario y colapsable.
- `/panel/contabilidad/diarios` agrega filtros por periodo, estado, cuenta,
  banco y busqueda, mas un indicador de balance Cuadrado/Descuadrado sobre el
  conjunto filtrado.
- `/panel/contabilidad/reportes` agrega un catalogo de reportes con tarjetas
  (titulo, descripcion, alcance, valor y acciones Ver detalle / Exportar
  preparada) sobre el detalle grafico existente.
- Las acciones de exportacion sin implementacion real quedan como acciones
  preparadas y deshabilitadas, sin simular una descarga inexistente.
- Se conservaron permisos (Contador y Administrador escriben; Gerente consulta
  costos/reportes de su sucursal; Vendedor y Cajero sin costos), estados
  documentales, la secuencia Revisado -> Contabilizado -> Conciliado, la
  anulacion interna con motivo, la sincronizacion Caja -> Contabilidad,
  `buildMotorcycleInvoiceDescription`, el orden de descripcion de motocicleta y
  las claves de `localStorage`.
- El Cajero sigue emitiendo pero no puede contabilizar, conciliar ni marcar la
  revision contable de cierres. Seller, Manager, Admin y Cajero conservan su
  comportamiento previo.
- No se implemento PDF, DGI, conexion bancaria real, impuestos legales
  automaticos ni cambios de base de datos o Prisma.
- Build validado con `npm.cmd run build`.

## Patch 2.28 - Admin global supervision and configuration UX cleanup

Includes:
- clearer Administrator global supervision experience
- Admin dashboard focused on company-wide decisions and alerts
- global branch performance improvements
- seller and branch supervision improvements
- operational alert visibility improvements
- configuration page organization improvements
- report center organization improvements
- global scope context clarified
- destructive admin actions visually separated
- Admin global access preserved
- Manager branch scope preserved
- Seller, Cashier and Accounting role boundaries preserved
- build validated

Detalle:

- Se aclaro la experiencia del Administrador como centro de supervision global y
  configuracion, distinto de Vendedor y Cajero.
- El dashboard de Administrador se reorganizo como "Supervisión global" con la
  bajada "Control general de sucursales, operación comercial, inventario,
  vendedores y alertas del sistema". Secciones: 1) resumen global (sucursales,
  leads activos, leads sin asignar, clientes, expedientes, reservas activas,
  ventas del mes, inventario disponible, traslados pendientes y entregas
  pendientes), 2) cola global de decisiones con enlaces a cada modulo,
  3) desempeño por sucursal (tabla comparativa con leads, reservas, ventas,
  disponibles, traslados, vencidas, conversion y estado), 4) supervision de
  vendedores (destacados y los que requieren atencion), 5) alertas operativas y
  6) actividad reciente.
- El gran bloque "Alcance de esta sesión" se reemplazo por un chip de contexto
  "Administrador · Vista global"; el rol y la sucursal ya aparecen en el topbar
  y el shell.
- `/panel/configuracion` se reorganizo como area administrativa controlada:
  usuarios y roles (conteo demo), sucursales, reglas de negocio, alcances de
  datos del sistema (alcance tecnico con etiquetas de negocio, no claves crudas),
  y notas de auditoria/seguridad. La accion destructiva de reinicio quedo aislada
  en una "Zona peligrosa" roja con advertencia fuerte y confirmacion REINICIAR;
  la logica de reinicio no cambio.
- `/panel/reportes` gano jerarquia por secciones (Captación de leads, Ventas e
  inventario, Actividad comercial, Proformas, Créditos, Documentación y
  Tendencia y embudo) y una bajada especifica para vista global de Administrador.
- La supervision de vendedores (`/panel/vendedores`) conserva su vista global
  para Administrador y el alcance por sucursal para Gerente.
- Se preservaron los permisos: Administrador global; Gerente por sucursal;
  Vendedor simplificado sin costos; Cajero aislado en Caja; Contador aislado en
  Contabilidad; Vendedor y Cajero sin costos. No se removieron accesos del
  Administrador.
- No se toco Portal Cliente, Home, Hero Showroom, catalogo publico, formularios
  publicos, Prisma ni dependencias. No se creo un rol nuevo, no se implemento
  autenticacion, base de datos, PDF ni DGI, y no se removieron claves de
  `localStorage`.
- Build validado con `npm.cmd run build`.

## Patch 2.29 - Accounting exports to Excel and PDF

Includes:
- reusable accounting export helpers
- Excel-compatible CSV export for accounting data
- print-ready PDF export workflow
- accounting document export
- invoice and cashier-originated document export from Accounting
- journal entry export
- voucher export
- expense export
- inventory accounting export with permission safeguards
- payroll export
- bank and reconciliation export
- cash closure export
- accounting report export
- consistent export toolbar UX
- Spanish export labels and helper text
- protected internal keys and restricted cost data
- Caja emits / Contabilidad reviews separation preserved
- Accounting permissions preserved
- build validated

Detalle:

- Se agregaron dos utilidades reutilizables sin nuevas dependencias:
  `src/shared/lib/export-utils.ts` (CSV compatible con Excel con BOM UTF-8,
  vista imprimible en HTML para PDF via dialogo de impresion del navegador,
  formateo de moneda/fecha/porcentaje/estado, manejo seguro de errores) y
  `src/shared/lib/accounting-export-utils.ts` (columnas y builders especificos
  por seccion contable).
- `package.json` no tenia libreria de XLSX ni PDF instalada, por lo que se
  eligio CSV compatible con Excel para "Exportar Excel" y una vista imprimible
  de navegador para "Exportar PDF"; no se instalo ninguna dependencia nueva.
- `/panel/contabilidad/documentos` agrega Exportar Excel/PDF para la lista
  filtrada (numero, tipo, fecha, tercero, RUC/cedula, sucursal, origen, estado,
  forma de pago, banco, referencia, subtotal, abono, retencion 1%, retencion
  2%, total, revisado/contabilizado/conciliado por, observaciones) con
  resumen de filtros y totales en el PDF. El documento seleccionado (Factura,
  Recibo Oficial de Caja, Nota de Debito o Nota de Credito, incluyendo los
  sincronizados desde Caja) puede exportarse individualmente a PDF con
  encabezado MotoMas, trazabilidad y la descripcion de motocicleta cuando
  aplica, preservando el orden fijo de `buildMotorcycleInvoiceDescription`
  (no se modifico esa funcion).
- `/panel/contabilidad/diarios` agrega Exportar Excel/PDF sobre los asientos
  filtrados, con total debe, total haber, diferencia e indicador
  Cuadrado/Descuadrado en el PDF.
- `/panel/contabilidad/comprobantes`, `/panel/contabilidad/gastos` y
  `/panel/contabilidad/planilla` agregan Exportar Excel/PDF con las columnas
  y totales solicitados.
- `/panel/contabilidad/inventario` agrega Exportar Excel/PDF respetando el
  mismo enmascarado de costos ("Restringido") que ya usaba la tabla en
  pantalla; el Vendedor y el Cajero no llegan a esta seccion (bloqueo de ruta
  ya existente), por lo que nunca ven el boton de exportacion de costos.
- `/panel/contabilidad/bancos`, `/panel/contabilidad/conciliacion` y
  `/panel/contabilidad/terceros` agregan Exportar Excel/PDF sobre sus listados.
- `/panel/contabilidad/cierres` agrega una tabla y exportacion de "Cierres de
  caja" que cruza cada cierre con las facturas, recibos y notas de Caja
  emitidos el mismo dia/sucursal (misma logica de coincidencia que ya usaba el
  propio modulo de Caja) para calcular Facturas, Recibos, Notas, Retencion 1%
  y Retencion 2% por cierre; no se modifico el modulo de Caja ni su logica de
  emision.
- `/panel/contabilidad/reportes` agrega Exportar Excel/PDF para el catalogo de
  reportes y sus metricas clave; el boton "Exportar" deshabilitado por tarjeta
  (dejado preparado en el Parche 2.27) se reemplazo por la exportacion real a
  nivel de catalogo.
- Cada boton de exportacion usa un componente compartido con texto de ayuda
  ("Compatible con Excel (.csv)" / "Se abrira una vista imprimible para
  guardar como PDF") y un manejo de errores seguro: si la exportacion falla o
  el navegador bloquea la ventana emergente, se muestra un aviso breve sin
  romper la pagina.
- El PDF imprimible siempre incluye encabezado MotoMas, titulo del documento,
  fecha/hora de generacion, rol y alcance de sesion, y el pie "Documento
  generado desde MotoMas - Portal de Operaciones"; no expone claves de
  `localStorage` ni identificadores tecnicos internos.
- Se preservaron los permisos existentes: Contador y Administrador exportan
  con acceso global; Gerente exporta solo inventario y reportes de su
  sucursal (las demas secciones ya estaban bloqueadas para Gerente desde el
  Parche 2.27); Vendedor y Cajero no acceden a ninguna exportacion contable
  porque las rutas ya estaban restringidas para esos roles.
- No se cambio el flujo de estados documentales (Borrador -> Emitido ->
  Revisado -> Contabilizado -> Conciliado -> Anulado), la sincronizacion Caja
  -> Contabilidad, las formulas de retencion/total, ni ninguna clave de
  `localStorage`. No se instalaron dependencias, no se conecto DGI ni bancos
  reales, y no se toco Portal Cliente, Home, Hero Showroom, catalogo publico,
  formularios publicos ni Prisma.
- Build validado con `npm.cmd run build`.

## Patch 3.0 - Production foundation: database, auth, users, branches and inventory movements

Includes:
- PostgreSQL/Prisma production foundation
- real login flow
- role-aware session and redirects
- protected internal panel routes
- user creation rules by role
- Admin user management for all roles and branches
- Manager user creation limited to Seller users in own branch
- branch-scoped data access helpers
- motorcycle inventory registration in database
- motorcycle ingress workflow
- motorcycle egress workflow
- inventory movement history
- duplicate chassis validation
- branch-based inventory filtering
- Seller and Cashier cost restrictions preserved
- current role UX patches preserved
- documentation updated
- build validated

Detalle:

- Se instalaron `prisma` y `@prisma/client` (v6) y se ejecuto `prisma generate`.
  Se reescribio `prisma/schema.prisma` como esquema de produccion enfocado en
  este parche: `Branch`, `User` (con `passwordHash` y enum `UserRole` =
  ADMIN/GERENTE/VENDEDOR/CAJERO/CONTADOR), `MotorcycleCatalogModel`,
  `MotorcycleUnit`, `InventoryMovement` y `UserAuditLog`, con sus enums de
  estado y de tipo de movimiento.
- Se agrego `.env.example` con `DATABASE_URL` y `SESSION_SECRET`, scripts
  `prisma:generate`, `prisma:migrate`, `prisma:seed` y `db:setup` en
  `package.json`, y un seed idempotente `prisma/seed.mjs` (3 sucursales, 5
  usuarios de desarrollo, catalogo y unidades demo con su movimiento de
  ingreso). Las migraciones y el seed NO se ejecutaron en este entorno porque
  no hay una instancia PostgreSQL/`DATABASE_URL`; se documentan los comandos.
- Login real: `/login` con formulario profesional; accion de servidor
  `loginAction` que valida credenciales, firma una cookie de sesion
  (HMAC-SHA256 con Web Crypto, apta para middleware Edge) y refleja la sesion en
  el `localStorage` existente para no romper los paneles actuales. `logoutAction`
  limpia la cookie. Contraseñas con `scrypt` de Node (sin dependencias nuevas);
  nunca se guardan en texto plano.
- `middleware.ts` protege `/panel/:path*`: sin sesion valida redirige a
  `/login`. El indice `/panel` y `/login` redirigen segun el rol
  (ADMIN/GERENTE -> dashboard, VENDEDOR -> leads, CAJERO -> `/panel/caja`,
  CONTADOR -> `/panel/contabilidad`).
- Fallback de desarrollo: cuando no hay `DATABASE_URL`, el login funciona con 5
  cuentas de desarrollo mapeadas a las identidades demo existentes
  (admin/gerente/vendedor/cajero/contador @motomas.local, contraseña
  `Motomas.2026`), para que la demo siga siendo navegable sin base de datos. Con
  base de datos configurada, los usuarios provienen de la tabla `users`.
- Helpers de acceso reutilizables (`src/server/auth/access.ts`):
  `getCurrentUserSession`, `requireAuth`, `requireRole`, `canAccessBranch`,
  `getBranchScopeForUser`, `canCreateUserRole`, `canCreateUserInBranch`,
  `canViewCosts`, `canManageInventory`, `canRegisterMotorcycleIngress`,
  `canRegisterMotorcycleEgress`. La autorizacion se decide en el servidor.
- Gestion de usuarios en `/panel/configuracion` (ahora accesible a
  Administrador y Gerente): el Administrador crea cualquier rol y sucursal; el
  Gerente solo crea Vendedores y con la sucursal fija a la suya. Vendedor,
  Cajero y Contador no gestionan usuarios. La creacion se persiste en la base de
  datos y registra un `UserAuditLog`; en modo demo la lista es de solo lectura.
- Inventario real en `/panel/inventario/movimientos` (Gerente y Administrador):
  registro de ingreso (crea unidad AVAILABLE + movimiento INGRESO) y egreso
  (actualiza estado/fecha de salida + movimiento segun motivo), con validacion
  de chasis duplicado, bloqueo de egreso para unidades ya dadas de baja,
  historial de movimientos y filtrado por sucursal (Administrador global,
  Gerente su sucursal). El Vendedor solo consulta disponibilidad en
  `/panel/inventario` (sin costos ni gestion) y el Cajero no gestiona inventario.
- Estrategia de migracion: no se migraron todos los modulos. El inventario de
  motocicletas (unidades y movimientos), los usuarios y las sucursales usan la
  base de datos cuando esta configurada; el resto de modulos CRM/contables sigue
  en `localStorage`. La consulta comercial de inventario en `/panel/inventario`
  permanece en `localStorage`.
- Se preservaron las experiencias de rol de los Parches 2.24-2.29, el Portal
  Cliente, Home, Hero Showroom, catalogo publico y formularios publicos. No se
  removieron claves de `localStorage`. No se implemento pagos, DGI, PDF ni
  integracion bancaria.
- Build validado con `npm.cmd run build`. Migraciones/seed pendientes de
  ejecutar en un entorno con PostgreSQL: `npm run prisma:migrate` y
  `npm run prisma:seed`.

## Patch 3.0.1 - Validacion de entorno y Prisma (bring-up de base de datos)

Validacion de entorno (honesta, sin inventar credenciales):

- `.env`: NO existe en este entorno. Solo esta presente `.env.example`.
- `DATABASE_URL`: NO configurado (ni en `.env` ni como variable de entorno).
- `SESSION_SECRET`: NO configurado.
- `npx prisma generate`: OK. Se regenero Prisma Client v6.19.3 desde
  `prisma/schema.prisma` sin errores de esquema ni de importacion.

Estado de la base de datos:

- Migracion PENDIENTE. Motivo: falta `DATABASE_URL` y no hay una instancia
  PostgreSQL accesible en este entorno. No se ejecuto `prisma migrate` para no
  inventar credenciales ni una conexion.
- Seed PENDIENTE por el mismo motivo. `prisma/seed.mjs` es idempotente y esta
  listo para ejecutarse cuando exista la base de datos.

Para completar el bring-up en un entorno con PostgreSQL:

```txt
1) Copiar .env.example a .env y definir:
   - DATABASE_URL (cadena de conexion PostgreSQL real)
   - SESSION_SECRET (valor aleatorio largo; ejemplo:
     node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
2) npx prisma generate
3) npx prisma migrate dev --name init
4) npx prisma db seed        # o: npm run prisma:seed
5) npm.cmd run build
```

No se ejecutaron migraciones ni seed en este parche; no se reclama su
validacion. No se modifico UI, reglas de negocio ni permisos, y no se migraron
modulos CRM. El fallback de desarrollo (login sin base de datos) se conserva.

## Patch 3.0.1A - Local PostgreSQL and environment bootstrap

Includes:
- local PostgreSQL Docker container prepared
- local `.env` created from `.env.example`
- `DATABASE_URL` configured for local development
- `SESSION_SECRET` generated locally
- `.env` ignored by git (confirmed, no `.gitignore` changes needed)
- PostgreSQL readiness checked
- migrations not run yet
- seed not run yet
- no secrets committed or documented

Detalle:

- Docker Desktop no estaba en ejecucion; se inicio y se espero a que el daemon
  respondiera.
- Se creo el contenedor `motomas-postgres` (Postgres 16) con un volumen
  nombrado persistente `motomas-postgres-data`, usuario `motomas`, base de
  datos `motomas_db`.
- **Desviacion de puerto documentada**: el puerto host recomendado `5432` (y
  tambien `5433`) no pudo enlazarse porque este equipo Windows tiene un rango de
  puertos TCP excluido por el sistema (Hyper-V/WSL) que cubre `5243-5942`. Se
  uso el puerto host **`15432`** en su lugar (el contenedor sigue escuchando en
  `5432` internamente). `DATABASE_URL` en `.env` local apunta a
  `localhost:15432`. Esta es una particularidad de este entorno Windows, no un
  cambio de las credenciales o del nombre de la base de datos solicitados.
- Se genero `SESSION_SECRET` localmente con `node crypto` (48 bytes
  aleatorios, base64url) y se escribio en `.env`. El valor no se imprimio en la
  consola ni se documenta aqui.
- `.env` ya estaba cubierto por `.gitignore` (linea existente); se confirmo con
  `git check-ignore -v .env`. No fue necesario modificar `.gitignore`.
- Validacion ejecutada: `docker ps` muestra el contenedor `Up`; `docker exec
  motomas-postgres pg_isready -U motomas -d motomas_db` respondio
  `accepting connections`.
- No se ejecuto `prisma migrate` ni `prisma db seed` en esta fase, tal como se
  solicito. No se probo autenticacion ni UI.
- Estas credenciales son **solo para desarrollo local** y no deben usarse en
  produccion.

Comandos para la siguiente fase (migracion y seed):

```txt
npx prisma migrate dev --name init
npx prisma db seed
```

## Patch 3.0.1B - Prisma migration and seed validation

Includes:
- Prisma generate validated
- local PostgreSQL connection validated
- migration executed or confirmed up to date
- seed executed
- seed idempotency verified by execution
- branches verified
- development users verified
- motorcycle catalog verified
- motorcycle units verified
- inventory ingress movements verified
- no production credentials documented
- auth smoke test pending
- inventory permission smoke test pending

Detalle:

- `.env` presente; `DATABASE_URL` y `SESSION_SECRET` confirmados presentes
  (solo se valido la clave, nunca el valor).
- Contenedor `motomas-postgres`: `Up`, puerto host `15432` (ver Patch 3.0.1A
  para la desviacion de puerto). `pg_isready` respondio
  `accepting connections`.
- `npx prisma generate`: OK, Prisma Client v6.19.3 regenerado sin errores.
- No existia `prisma/migrations`; se ejecuto `npx prisma migrate dev --name
  init`. La migracion `20260708165039_init` se aplico correctamente y
  `npx prisma migrate status` confirmo "Database schema is up to date!". No
  hubo que corregir el esquema; no se destruyo ningun dato (la base de datos
  estaba vacia).
- `npx prisma db seed` se ejecuto **dos veces** consecutivas para validar
  idempotencia. Ambas ejecuciones terminaron sin error
  ("The seed command has been executed.").
- Verificacion de registros con un script temporal de Prisma Client
  (`prisma/_verify-seed.mjs`, creado, ejecutado y **eliminado** al finalizar,
  segun lo solicitado). Conteos despues de la segunda ejecucion del seed
  (sin duplicados):
  - Sucursales: 3 (`plaza-inter`, `rubenia`, `masaya`)
  - Usuarios: 5, uno por rol (ADMIN, GERENTE, VENDEDOR, CAJERO, CONTADOR),
    todos `isActive=true`
  - Catalogo de motocicletas: 3 modelos (Bajaj Boxer CT 100, Bajaj Dominar
    250, Bajaj Pulsar NS200)
  - Unidades de motocicleta: 3, todas en estado `AVAILABLE`
  - Movimientos de inventario tipo `INGRESO`: 3 (uno por unidad)
- La igualdad de conteos entre la primera y la segunda ejecucion del seed
  confirma que `upsert`/`findUnique`+`create` evitan duplicados en
  sucursales, usuarios, catalogo y unidades.
- No se documentan ni se imprimen credenciales de produccion. La contraseña
  de desarrollo de las cuentas sembradas es la ya documentada en ROLES.md y
  en `prisma/seed.mjs` (solo para desarrollo local).
- Pendiente explicito: no se probo autenticacion (`/login`, cookies de
  sesion, redirecciones por rol) ni la interfaz de usuario en esta fase. Eso
  corresponde a la siguiente fase (Patch 3.0.1C o smoke test de auth).

## Patch 3.0.2A - Motorcycle catalog from provided assets

Includes:
- motorcycle catalog expanded using only user-provided assets
- motorcycle names derived from provided file names or existing repo data
- public catalog updated
- motorcycle detail routes prepared for new slugs
- public request motorcycle selector updated if applicable
- Prisma seed catalog updated if supported by available fields
- public catalog remains independent from operational inventory
- internal stock, chassis, engine, VIN and costs remain hidden
- no invented motorcycle data
- seed idempotency preserved
- build validated

Detalle:

- Se agregaron al catalogo publico las motocicletas detectadas en `Fotos.zip`:
  Boxer 150, CT 125, Pulsar 150, Pulsar N150, Pulsar N160, Pulsar NS125FI,
  Pulsar NS125LS, Pulsar NS125UG, Pulsar NS160 y Pulsar NS200FI.
- Los nombres se derivaron unicamente de los nombres de archivo provistos. No se
  agregaron precios, stock, especificaciones tecnicas, anio, cilindrada,
  categoria, colores ni descripciones.
- Las imagenes provistas se copiaron a `public/catalog/motorcycles` y se
  agregaron entradas minimas en `public/motos` con `info.json` limitado al
  nombre del modelo.
- `/catalogo`, `/motocicletas/[slug]` y el selector de
  `/solicitar-informacion` quedan cubiertos por el arreglo publico de catalogo y
  sus slugs estables.
- El seed de Prisma agrega los nuevos modelos de catalogo con `isActive=true`
  por defecto, `imageUrl` publico y marca neutral pendiente, porque el esquema
  requiere `brand` pero la marca no fue provista.
- No se agregaron unidades de inventario para los nuevos modelos. El inventario
  operativo demo queda limitado a los modelos ya existentes para no inventar
  stock, VIN, chasis, motor, costos ni disponibilidad.
- La idempotencia del seed se conserva mediante `upsert` por slug.
- Validacion ejecutada: `npx prisma generate`, `npx prisma db seed` y
  `npm.cmd run build`.

## Patch 3.0.2B - Real branch catalog from provided TXT

Includes:
- real MotoMas branches loaded from user-provided TXT
- branch names derived only from provided TXT
- stable branch codes generated only when required
- Prisma seed updated with idempotent branch upserts
- public request branch selector updated if applicable
- internal branch selectors updated where applicable
- Admin global branch visibility preserved
- Manager branch scope preserved
- user creation branch restrictions preserved
- no invented branch addresses, phones or metadata
- no database reset
- build validated

Detalle:

- Se leyo `C:\Users\lesli\Desktop\Sucursales Motomas.txt` y se detectaron
  unicamente estos nombres de sucursal: Bello Horizonte, Bonanza, Ciudad
  Sandino, Masaya, Mercedes, Central, Multicentro, Rosita, Suburbana, Granada,
  Carretera Masaya y Coyotepe.
- Los codigos requeridos por Prisma y por los selectores se generaron desde el
  nombre exacto de cada sucursal: minusculas, sin acentos, espacios a guiones y
  sin caracteres inseguros.
- `prisma/seed.mjs` ahora siembra las sucursales reales mediante `upsert` por
  `code`, marca `isActive=true` y no agrega direcciones, telefonos, encargados,
  horarios, regiones ni coordenadas.
- El seed conserva filas existentes: no elimina sucursales demo/legacy, no
  resetea la base de datos y no reasigna usuarios existentes porque el `upsert`
  de usuarios ya no sobreescribe `branchId`.
- En bases nuevas, los usuarios y unidades demo iniciales quedan vinculados a
  sucursales reales disponibles en el seed. En bases existentes, las unidades
  ya sembradas se omiten por chasis y mantienen su sucursal actual.
- `src/data/operations/leads.ts` usa las sucursales reales para el selector
  publico de solicitud y para selectores internos compartidos. Las sucursales
  demo anteriores quedan solo como compatibilidad de datos locales existentes.
- Se actualizaron usuarios demo, leads demo, fallback de login de desarrollo,
  asignacion de vendedores por sucursal y el catalogo local antiguo de
  `src/lib/motomas-data.ts` para usar codigos de sucursal reales donde se
  muestran en selectores o filtros.
- La visibilidad global del Administrador sigue usando todas las sucursales
  reales; el Gerente sigue bloqueado a su propia sucursal; Vendedor, Cajero y
  Contador conservan sus limites existentes.
- Sucursales demo/legacy detectadas y preservadas para limpieza manual futura:
  Plaza Inter, Rubenia, Carretera Norte y El Coyotepe.
- Validacion ejecutada: `npx prisma generate`, `npx prisma db seed` y
  `npm.cmd run build`.

## Patch 3.0.3A - Production data audit and customer/inventory separation report

Includes:
- remaining demo data sources audited
- Prisma seed data reviewed
- localStorage/static demo data reviewed
- customer persistence status documented
- motorcycle inventory persistence status documented
- motorcycle catalog vs inventory separation verified
- customer vs inventory separation risks documented
- no data deleted
- no business logic changed
- build validated

Detalle:

- Se agrego una seccion de auditoria en `PROJECT_AUDIT.md` para separar datos
  reales a preservar, fixtures sembrados por Prisma, datos demo estaticos,
  inicializadores de `localStorage` y candidatos de limpieza.
- `prisma/seed.mjs` sigue sembrando usuarios de desarrollo, modelos de
  catalogo y tres unidades fisicas demo con chasis/motor `CH-DEMO-*` y
  `EN-DEMO-*`. Las sucursales reales y las entradas de catalogo creadas desde
  assets provistos se mantienen como fuentes reales a preservar.
- Se documento que clientes, leads, expedientes, reservas, ventas, documentos,
  creditos, actividades, Caja y Contabilidad siguen usando `localStorage` o
  datos estaticos frontend.
- Se documento que el inventario de motocicletas tiene una parte respaldada en
  base de datos (`MotorcycleUnit` e `InventoryMovement`) para
  `/panel/inventario/movimientos`, mientras la consulta comercial historica
  de `/panel/inventario` todavia usa `motomas-inventory-units-v1`.
- Se verifico la separacion estructural entre catalogo publico
  (`MotorcycleCatalogModel`) y unidades fisicas (`MotorcycleUnit`), con
  referencia opcional por `catalogModelId`.
- Se verifico que `MotorcycleUnit` no contiene datos de cliente, que no existe
  modelo Prisma `Customer` aun, y que los registros locales de cliente no
  contienen VIN, chasis, motor, costos ni inventario fisico por sucursal.
- Se identifico como riesgo pendiente que reservas y ventas locales relacionan
  cliente y unidad por referencias (`clienteId`, `clienteNombre`, `unidadId`)
  mientras los modulos CRM sigan en `localStorage`.
- No se elimino informacion, no se reseteo la base de datos, no se modificaron
  reglas de negocio y no se redisenaron pantallas.

## Patch 3.0.3B - Production seed cleanup and demo data removal

Includes:
- demo physical motorcycle units removed from production seed
- real branch catalog preserved
- user-provided motorcycle catalog preserved
- production seed no longer creates fake inventory units
- bootstrap Admin strategy prepared with environment variables
- development-only fallback users isolated from production
- demo localStorage/static data identified and gated or left empty where safe
- legacy/demo branches removed from production selectors where safe
- customer and inventory separation preserved
- customer database migration documented as pending
- no invented production data
- no database reset
- build validated

Detalle:

- `prisma/seed.mjs` fue limpiado para preservar solo datos base seguros:
  sucursales reales, modelos de catalogo y un Admin bootstrap opcional desde
  variables de entorno. Ya no crea usuarios demo ni unidades fisicas demo.
- El Admin bootstrap se crea solo si existen `MOTOMAS_ADMIN_NAME`,
  `MOTOMAS_ADMIN_EMAIL` y `MOTOMAS_ADMIN_PASSWORD`. Si faltan, el seed muestra
  una advertencia clara y no crea usuarios silenciosamente.
- Las unidades fisicas con chasis/motor `CH-DEMO-*` y `EN-DEMO-*` fueron
  retiradas del seed. El seed no crea inventario fisico porque no se
  proporcionaron chasis, motor, sucursal, modelo y fecha de ingreso reales.
- El seed no borra filas existentes. Si una base ya contiene usuarios de
  desarrollo o unidades demo de parches anteriores, se reportan como limpieza
  manual pendiente para evitar romper referencias historicas.
- Se agrego `src/shared/lib/demo-mode.ts` para aislar datos demo. En produccion
  los lectores locales no auto-generan leads, inventario, Caja ni Contabilidad
  demo cuando el almacenamiento esta vacio.
- `src/features/operations/services/leads-service.ts`,
  `inventory-service.ts`, `cashier-service.ts` y `accounting-service.ts`
  conservan registros existentes de `localStorage`, pero dejan estado inicial
  vacio cuando el modo demo no esta habilitado.
- `src/features/operations/services/demo-data-reset-service.ts` ya no limpia
  claves de negocio en produccion/default; solo opera cuando el modo demo esta
  habilitado.
- `src/server/auth/user-store.ts` limita el fallback de usuarios de desarrollo
  a entornos sin `DATABASE_URL` y con `NODE_ENV !== "production"`.
- `.env.example` documenta las variables del Admin bootstrap y el flag
  `NEXT_PUBLIC_MOTOMAS_ENABLE_DEMO_DATA`; no se modifico `.env`.
- Las sucursales reales siguen siendo las opciones activas. Las sucursales
  legacy/demo quedan solo como compatibilidad de datos antiguos o fixtures demo
  aislados.
- Se preservo la separacion entre `MotorcycleCatalogModel` y `MotorcycleUnit`.
  El catalogo publico no crea unidades, ingreso de inventario crea solo unidad
  fisica + movimiento, y los clientes no crean inventario.
- La migracion de clientes, leads, expedientes, reservas, ventas, traslados,
  Caja y Contabilidad a PostgreSQL queda documentada como pendiente.

## Patch 3.1A - CRM core Prisma models

Includes:
- Customer model added
- Lead model added
- Expediente/CustomerFile model added
- CRM status enums added
- branch and user relations prepared
- customer/inventory separation preserved
- migration generated
- Prisma generate validated

Details:
- New models `Customer`, `Lead`, `CustomerFile` (Expediente) and `Activity`
  added to `prisma/schema.prisma`, mapped to tables `customers`, `leads`,
  `customer_files` and `activities`.
- New enums `LeadStatus`, `CustomerFileStatus`, `ActivityType`,
  `ActivityStatus` and `ActivityPriority` mirror the existing localStorage
  statuses so migrated demo records keep their meaning.
- Branch relation on every model (`branchId`) for branch-scoped access. User
  relations for `Lead.createdBy` / `Lead.assignedSeller`, `CustomerFile.seller`
  and `Activity.user`; all optional with `ON DELETE SET NULL`.
- `Lead.trackingCode` is a unique public tracking code; `CustomerFile.fileNumber`
  is unique. Lead converts to a Customer through an optional `customerId`.
- Every model has `createdAt` / `updatedAt` timestamps.
- Customer (a person) and MotorcycleUnit (a physical unit) remain strictly
  separate; no relation was added between them.
- Reservations, Sales, Transfers, Caja and Contabilidad were NOT migrated and
  remain on localStorage. No existing model was removed and the database was
  not reset.
- `npx prisma generate` validated. Migration `20260708183522_crm_core`
  generated and applied to the local `motomas-postgres` container; the
  migration only creates the four new tables and their foreign keys (no drop or
  change to existing tables).

## Patch 3.1B - CRM core database actions

Includes:
- database-backed public lead creation action
- role-scoped lead queries
- lead assignment action
- lead status update action
- customer creation and listing actions
- expediente creation and listing actions
- branch-scoped CRM access preserved
- customer/inventory separation preserved
- build validated

Details:
- New server-only CRM data layer under `src/server/crm/`:
  - `shared.ts` — client-safe CRM DTOs, enum value unions, status/label maps and
    `normalizePhone` / `normalizeCedula` / `sanitizeText` helpers. No database
    import so client components can reuse the shapes.
  - `queries.ts` — role-scoped reads: `listLeads`, `listCustomers`,
    `listCustomerFiles` and `getCustomerFileDetail`. Each resolves the caller's
    CRM scope into a Prisma `where`, so branch/personal visibility is enforced in
    the database layer, not only in the UI.
  - `actions.ts` (`"use server"`) — `createPublicLeadAction`, `assignLeadAction`,
    `updateLeadStatusAction`, `createCustomerAction` and `createExpedienteAction`.
- Access helpers added to `src/server/auth/access.ts`: `canOperateCrm` (Admin,
  Manager, Seller only), `canAssignLeads` (Admin, Manager) and
  `getCrmScopeForUser` returning a `global` / `branch` / `personal` `CrmScope`.
  Reuses `getBranchScopeForUser` / `canAccessBranch` for branch checks and
  `getCurrentUserSession` / `requireAuth` for the session.
- Role filtering: Admin sees global CRM data; Manager sees only their branch;
  Seller sees leads assigned to or created by them and customers/expedientes
  linked to them. Cashier and Accountant cannot operate the CRM
  (`canOperateCrm` returns false). The public lead action requires no login.
- `createPublicLeadAction` generates a unique `trackingCode` (SOL-YYYYMMDD-XXXX)
  and creates a `NUEVO_LEAD` scoped to the chosen branch. `assignLeadAction`
  sets the seller (Manager limited to sellers of the lead's branch) and moves a
  `NUEVO_LEAD` to `ASIGNADO`. `updateLeadStatusAction` validates the target
  status against the enum and enforces scope. `createCustomerAction` normalizes
  phone/cedula and reuses an existing customer with the same normalized
  phone/cedula instead of duplicating it. `createExpedienteAction` generates a
  unique `fileNumber` (EXP-YYYYMMDD-XXXX), links the lead when provided and
  advances that lead to `EXPEDIENTE`.
- All actions guard on `isDatabaseConfigured()` and re-check the session
  server-side. No UI, Portal Cliente or panel was redesigned; reservations,
  sales, transfers, Caja and Contabilidad were not migrated; no inventory costs
  are exposed; a lead never creates a MotorcycleUnit; the database was not reset.
- Build validated with `npm.cmd run build` (compiled successfully, no lint or
  type errors).

## Patch 3.1C - CRM core UI database connection

Includes:
- public lead form connected to database
- public tracking connected to database where possible
- internal leads connected to database
- internal customers connected to database
- internal expedientes connected to database
- role-scoped CRM views preserved
- localStorage fallback reduced/documented
- build validated

Details:
- `/solicitar-informacion` (`src/features/portal/components/lead-request-form.tsx`)
  now calls `createPublicLeadAction` (Patch 3.1B) before saving to
  `localStorage`. Both records share the same tracking code: the client passes
  the database `trackingCode` into `savePublicLead` via a new optional
  `idOverride` param in `src/features/portal/services/lead-service.ts`. If the
  database is not configured or the call fails, the form still saves to
  `localStorage` exactly as before (unchanged fallback behavior) and generates
  its own local code. This keeps `/consultar-expediente`, `/mi-reserva`,
  `/mi-entrega` and `/mi-credito` working unchanged, since they still resolve
  by the (now shared) code from `localStorage` — no changes were needed there.
- `/panel/leads`, `/panel/clientes` and `/panel/expedientes` were converted
  from plain client pages into async server components. Each calls
  `requireAuth()`, resolves the caller's `CrmScope` via `getCrmScopeForUser`
  (Patch 3.1B) and, only when the caller can operate the CRM
  (`canOperateCrm`) and the database is configured, fetches role-scoped data
  through `listLeads` / `listCustomers` / `listCustomerFiles`
  (`src/server/crm/queries.ts`) and renders a new "Base de datos" section
  above the existing page content.
- New additive, read/act client panels (do not replace or read from the
  existing localStorage components):
  - `src/features/operations/modules/leads-db/leads-db-panel.tsx` — lists
    database leads scoped by role; Manager/Admin get an inline assign-to-seller
    control (`assignLeadAction`, sellers fetched via the existing
    `listUsers` from `src/server/auth/user-store.ts`, filtered to the lead's
    branch); Manager/Seller get an inline status control (`updateLeadStatusAction`).
    Admin remains supervision-only for status, matching the existing
    localStorage leads inbox behavior (`canChangeLeadStatus` there already
    excludes Administrador) — this patch does not grant Admin new editing
    power beyond what the existing UI already allows for parity roles.
  - `src/features/operations/modules/customers-db/customers-db-panel.tsx` —
    read-only scoped list of database customers.
  - `src/features/operations/modules/customer-files-db/customer-files-db-panel.tsx`
    — read-only scoped list of database expedientes.
- This mirrors the existing, already-shipped pattern of `/panel/inventario`
  (localStorage) coexisting with `/panel/inventario/movimientos` (database):
  the database-backed section is additive and visible on the same route, while
  the full existing localStorage-driven bandeja/list/detail (manual lead
  registration, activities, lead → customer/expediente conversion, quotes,
  documents, credit follow-up) keeps working exactly as before. Reservations,
  sales, transfers, quotes, documents and credit follow-ups all key off the
  localStorage customer/expediente ids, so those flows are unaffected.
- `assignLeadAction` and `updateLeadStatusAction` now call `revalidatePath("/panel/leads")`
  so the new section reflects changes immediately after a `router.refresh()`
  from the client panel.
- Cashier and Accountant never see the new database sections (`canOperateCrm`
  gates rendering before any query runs); they keep seeing only the existing
  localStorage-driven page, unchanged.
- No inventory, Caja, Contabilidad, reservations, sales or transfers code was
  touched. No inventory costs are exposed. No physical `MotorcycleUnit` is
  created from a lead. No existing `localStorage` key was deleted. The
  database was not reset.
- Verified: `npx tsc --noEmit` clean; `npm.cmd run build` compiled
  successfully with `/panel/leads`, `/panel/clientes`, `/panel/expedientes`
  and `/solicitar-informacion` building as dynamic routes; a local dev-server
  smoke test confirmed the public request page renders, unauthenticated
  `/panel/leads` correctly redirects to `/login`, and `/consultar-expediente`
  renders, all with no server errors against the local `motomas-postgres`
  database (14 branches, 5 users, 0 leads at test time). Full authenticated
  click-through of the new database sections was not performed in this pass
  because it would require either real login credentials this agent does not
  have or resetting an existing account's password, which was out of scope for
  this patch — recommended as a quick manual follow-up.

## Patch 3.1D - CRM core authenticated smoke test and DB-primary cleanup

Includes:
- seeded user availability verified
- authenticated CRM smoke test performed where possible
- public database-backed lead creation verified
- tracking code generation verified
- role-scoped lead visibility verified
- lead assignment verified
- lead status update verified
- customer creation verified
- duplicate customer prevention verified
- expediente creation verified
- customer/inventory separation verified
- DB-backed CRM sections clarified as primary where safe
- remaining localStorage CRM dependencies documented
- build validated

Details:
- Confirmed all 5 seeded database users exist and are active:
  `admin@motomas.local` (ADMIN), `gerente@motomas.local` (GERENTE, branch
  `plaza-inter`), `vendedor@motomas.local` (VENDEDOR, branch `plaza-inter`),
  `cajero@motomas.local` (CAJERO, branch `plaza-inter`),
  `contador@motomas.local` (CONTADOR, no branch).
- Confirmed the documented dev password (`Motomas.2026`, from ROLES.md /
  `login-form.tsx`) verifies against all 5 stored password hashes using the
  app's own `verifyPassword` (scrypt) algorithm — i.e. login is functionally
  available for all 5 roles. No password was changed and no secret was
  printed; a temporary read-only check script was used and deleted
  immediately after (per the existing no-permanent-scaffolding convention
  from Patch 3.0.1B).
- No browser-automation tool (Playwright/Puppeteer/Cypress) is available in
  this environment, and the login form invokes `loginAction` as a Next.js
  Server Action through the RSC fetch protocol, which cannot be reliably
  replayed with raw HTTP/curl. In place of a browser-driven click-through,
  a temporary smoke-test script exercised the real `motomas-postgres`
  database directly, mirroring the exact business rules read from
  `src/server/auth/access.ts` and `src/server/crm/{actions,queries}.ts`. All
  17 checks passed: Cajero/Contador blocked from CRM; Admin/Gerente can
  assign, Vendedor cannot; public lead created with a valid
  `SOL-YYYYMMDD-XXXXXXXX` tracking code; Gerente (branch scope) and Admin
  (global scope) see the lead, Vendedor (personal scope) does not until
  assigned; Gerente assigns the lead to a same-branch Vendedor; Vendedor then
  sees it and both Vendedor and Gerente can progress its status
  (`NUEVO_LEAD` → `ASIGNADO` → `CONTACTADO` → `INTERESADO`); a customer is
  created and a second attempt with the same phone reuses the existing row
  instead of duplicating it; an expediente is created linking the correct
  `customerId`/`leadId`, generates a valid `EXP-YYYYMMDD-XXXXXXXX` file
  number, and advances the lead to `EXPEDIENTE`; no `MotorcycleUnit` row was
  created by any of the above. All test rows (lead, customer, expediente)
  were deleted at the end of the script; no pre-existing data was modified.
- DB-primary cleanup: the three "Base de datos" panels
  (`leads-db-panel.tsx`, `customers-db-panel.tsx`,
  `customer-files-db-panel.tsx`) now label themselves "fuente principal"
  (primary source) for new leads/customers/expedientes. Each of
  `/panel/leads`, `/panel/clientes` and `/panel/expedientes`
  (`src/app/(operations)/panel/{leads,clientes,expedientes}/page.tsx`) now
  renders a `LegacyDivider` — a plain text/badge divider, no layout or
  behavior change — above the pre-existing localStorage-driven
  component, labeling it "Temporal, pendiente de migración". The divider only
  appears when the database section is actually shown (database configured
  and the role can operate the CRM), so the localStorage view is never
  mislabeled as temporary when it is still the only working path (e.g.
  `DATABASE_URL` not configured). No existing localStorage flow, key, or
  component was deleted or modified.
- Remaining localStorage CRM dependencies (unchanged from Patch 3.1C, listed
  here again for this patch's audit trail): manual lead registration,
  follow-up notes, activity history, lead → customer/expediente conversion,
  customer interaction history, proformas, document checklists, credit
  follow-ups, and the entire public process lookup
  (`/consultar-expediente`, `/mi-reserva`, `/mi-entrega`, `/mi-credito`) via
  `findPublicProcess`. Reservations, sales, transfers, Caja and Contabilidad
  remain fully untouched and localStorage-only.
- Confirmed via schema read and the smoke test: `Customer` and
  `MotorcycleUnit` remain fully separate models with no relation between
  them; no CRM action creates or references a `MotorcycleUnit`.
- No `.env` file was modified. No secret, password, or credential value was
  printed at any point. No reservation, sale, transfer, Caja or Contabilidad
  code was touched. No inventory cost is exposed by any CRM view (`canViewCosts`
  is untouched and unrelated to the CRM access predicates). The database was
  not reset.
- Verified: `npx tsc --noEmit` clean; `npm.cmd run build` compiled
  successfully with no errors or warnings.

## Patch 3.2A - Operations Prisma models for reservations, sales and transfers

Includes:
- Reservation model added
- Sale model added
- TransferOrder model added
- operation status enums added
- Customer/File/Unit relations prepared
- branch relations prepared
- user audit relations prepared
- customer and inventory separation preserved
- reservations, sales and transfers migration started
- UI not connected yet
- Prisma generate validated
- migration generated

Details:
- New models in `prisma/schema.prisma` (tables `reservations`, `sales`,
  `transfer_orders`): `Reservation`, `Sale`, `TransferOrder`. Delivery is
  represented on `Sale` (`SaleStatus.ENTREGADA` + `deliveredAt`), matching the
  current flow; no separate Delivery model was added.
- New enums: `ReservationStatus` (ACTIVA, CANCELADA, COMPLETADA), `SaleType`
  (CONTADO, FINANCIAMIENTO_EXTERNO), `SaleStatus` (COMPLETADA, ENTREGADA),
  `TransferStatus` (PENDIENTE, APROBADO, EN_TRANSITO, RECIBIDO, CANCELADO).
  Values mirror the current localStorage statuses.
- `Reservation` links `Customer` + optional `CustomerFile` + `MotorcycleUnit` +
  `Branch` + seller (`User`), with `reservedAt` / `cancelledAt` / `completedAt`.
- `Sale` links `Customer` + optional `CustomerFile` + optional `Reservation` +
  `MotorcycleUnit` + `Branch` + seller (`User`). `motorcycleUnitId` is unique
  (no double-sale) and `reservationId` is unique (one sale per reservation).
- `TransferOrder` links `MotorcycleUnit` + origin `Branch` + destination
  `Branch`, with requested/approved/dispatched/received/cancelled user and
  timestamp fields and the requested→approved→in-transit→received→cancelled
  status set. Single unit per order, matching the current flow.
- Back-relations added to `Branch`, `User`, `MotorcycleUnit`, `Customer` and
  `CustomerFile`. `Customer` and `MotorcycleUnit` remain separate models with
  no relation between them; no cost fields on any new model.
- "One active reservation per unit" and "sold/delivered/exited units cannot be
  reserved" are documented as service-layer rules for a later patch (a plain
  DB unique on unit id would wrongly block historical cancelled reservations).
- `npx prisma generate` validated. Migration `20260708193916_operations_core`
  generated and applied to the local `motomas-postgres` container; it only
  creates the 3 new tables + 4 enums and their foreign keys (no drop or change
  to existing tables). Database not reset. No UI, server action, Caja,
  Contabilidad, public portal or localStorage key was touched.

## Patch 3.2B - Operations database actions and business rules

Includes:
- reservation database queries and actions
- sale database queries and actions
- transfer database queries and actions
- role-scoped operations access
- active reservation validation
- duplicate sale prevention
- unit status transitions for reservations, sales and delivery
- transfer requested/approved/in-transit/received workflow
- inventory movement creation for reservation, sale, delivery and transfers
- Prisma transactions for multi-write operations
- customer and inventory separation preserved
- UI not connected yet
- build validated

Details:
- New server-only module `src/server/operations/`:
  - `shared.ts` - client-safe DTOs, status/type value unions and label maps for
    reservations, sales and transfers (mirrors the Patch 3.2A Prisma enums).
  - `queries.ts` - role-scoped reads `listReservations`, `listSales`,
    `listTransfers`. Each resolves the caller scope into a Prisma `where`
    (Admin global; Manager branch; Seller personal/own records). Transfers are
    branch-visible when the branch is origin OR destination.
  - `actions.ts` (`"use server"`) - `createReservation`, `cancelReservation`,
    `completeReservation`, `createSale`, `markSaleDelivered`, `createTransfer`,
    `approveTransfer`, `dispatchTransfer`, `receiveTransfer`, `cancelTransfer`.
- Access helpers added to `src/server/auth/access.ts`: `canManageReservations`,
  `canManageSales`, `canManageTransfers` (Admin/Manager/Seller),
  `canApproveTransfers` (Admin/Manager only) and `getOperationsScopeForUser`
  (reuses the CRM scope shape). Cashier and Accountant are blocked from all
  operations actions and queries.
- Business rules enforced:
  - Reservation links Customer + MotorcycleUnit (CustomerFile optional). Unit
    must be AVAILABLE with no existing ACTIVA reservation; create sets unit
    RESERVED and writes a RESERVA movement. Cancel sets CANCELADA and returns
    the unit to AVAILABLE only if still RESERVED and no sale exists. A Seller
    may only reserve for customers/expedientes linked to them.
  - Sale links Customer + MotorcycleUnit (CustomerFile/Reservation optional).
    Unit must be AVAILABLE or RESERVED and not already sold (unique
    `motorcycle_unit_id`). A RESERVED unit can only be sold through its active
    reservation, and a passed reservation must match the same customer + unit.
    Create sets unit SOLD, writes a VENTA movement and marks a linked
    reservation COMPLETADA. Delivery sets sale ENTREGADA + unit DELIVERED and
    writes an ENTREGA movement.
  - Transfer links MotorcycleUnit + origin/destination branch (must differ);
    unit must be AVAILABLE and belongs to the origin branch. Lifecycle
    PENDIENTE -> APROBADO -> EN_TRANSITO -> RECIBIDO with per-step user/date
    stamps. Dispatch sets unit IN_TRANSFER + TRASLADO_SALIDA movement; receive
    moves the unit to the destination branch, sets AVAILABLE + TRASLADO_ENTRADA
    movement. Cancel is allowed only before RECIBIDO and restores an in-transit
    unit to its origin (AVAILABLE) with an AJUSTE movement. Only Admin/Manager
    approve/dispatch/receive/cancel; the actor must be involved with the origin
    or destination branch.
- Prisma `$transaction` wraps every multi-write flow (reservation+unit+movement;
  sale+unit+movement+reservation update; transfer step+unit+movement) so unit
  status, movement history and the operation row stay consistent.
- Customer and MotorcycleUnit remain separate; reservations/sales link them at
  the transaction level only. No action creates a MotorcycleUnit. No cost field
  is read or written; Caja, Contabilidad, the public portal and localStorage
  keys are untouched. UI is not connected yet.
- Verified: `npx prisma generate` OK; `npx tsc --noEmit` clean; `npm.cmd run
  build` compiled successfully. A temporary smoke-test script exercised the full
  reservation/sale/delivery/transfer logic against the local `motomas-postgres`
  database (10/10 checks passed: unit-status transitions, RESERVA/VENTA/ENTREGA/
  TRASLADO movements, double-active-reservation block, unique duplicate-sale
  block, transfer branch move) and was deleted after use; all test rows were
  cleaned up.

## Patch 3.2C - Operations UI database connection

Includes:
- database-backed reservations section connected
- database-backed sales section connected
- database-backed transfers section connected
- DB-backed operations marked as primary source where safe
- legacy localStorage sections preserved temporarily
- reservation creation/cancel actions exposed where safe
- sale creation/delivery actions exposed where safe
- transfer request/approval/dispatch/receive/cancel actions exposed where safe
- role-scoped operations UI preserved
- Cashier and Accountant blocked from operations actions
- Seller and Cashier cost restrictions preserved
- build validated

Details:
- `/panel/reservas`, `/panel/ventas` and `/panel/traslados`
  (`src/app/(operations)/panel/{reservas,ventas,traslados}/page.tsx`) converted
  from plain client pages into async server components, following the exact
  pattern from Patch 3.1C: `requireAuth()`, then (only when the database is
  configured and the role may operate that module) fetch role-scoped data via
  `src/server/operations/queries.ts` and render a "Base de datos (fuente
  principal)" section above the pre-existing localStorage-driven panel, with a
  `LegacyDivider` labeling the old section "Temporal, pendiente de migración".
  The divider only renders when the database section is actually shown, so the
  localStorage view is never mislabeled when `DATABASE_URL` is absent.
- New additive client panels (do not replace or read the existing localStorage
  components):
  - `src/features/operations/modules/reservations-db/reservations-db-panel.tsx`
    - lists scoped reservations (customer, expediente, unit, branch, seller,
      status, reserved date); a collapsible form creates a reservation
      (`createReservation`) from a customer + optional expediente + an
      AVAILABLE unit in scope; an active reservation without a sale can be
      cancelled (`cancelReservation`).
  - `src/features/operations/modules/sales-db/sales-db-panel.tsx` - lists
    scoped sales (customer, expediente, linked reservation, unit, branch,
    seller, type, status, sale/delivery dates); a collapsible form creates a
    sale (`createSale`) either from an active unsold reservation (customer/unit
    locked to the reservation, preserving the server rule that a reserved unit
    can only sell through its own reservation) or directly from a customer +
    AVAILABLE unit; a completed sale can be marked delivered
    (`markSaleDelivered`).
  - `src/features/operations/modules/transfers-db/transfers-db-panel.tsx` -
    lists scoped transfers (unit, origin/destination branch, status, requested
    by/date, approved/dispatched/received names); a collapsible form requests a
    transfer (`createTransfer`) from an AVAILABLE unit to a destination branch;
    row actions approve/dispatch/receive/cancel (`approveTransfer`,
    `dispatchTransfer`, `receiveTransfer`, `cancelTransfer`) only render for
    roles that pass `canApproveTransfers`.
- Role scope, unchanged from Patch 3.2B and re-verified here: Admin sees the
  global list and every action; Manager sees/operates only their branch;
  Seller sees/operates only their own records and may request (not approve)
  transfers; Cashier and Accountant never see any of these three database
  sections (`canManageReservations` / `canManageSales` /
  `canManageTransfers` gate rendering before any query runs). No `canViewCosts`
  logic was touched and no cost field is read by any new query or panel.
- Selectors reuse existing scoped queries — no new broad/unscoped fetch was
  added: `listCustomers` / `listCustomerFiles` (`@/server/crm/queries`,
  Patch 3.1B) for the customer/expediente pickers, `getInventoryData`
  (`@/server/inventory/queries`, Patch 3.0) filtered to `status === "AVAILABLE"`
  for the unit pickers, and the existing static `desiredBranches` list for the
  transfer destination-branch picker.
- No inventory, Caja, Contabilidad or public-portal code was touched. No
  `MotorcycleUnit` is created by any of these panels (units come only from
  inventory ingress). No `localStorage` key was deleted; the existing
  `ReservationsPanel`, `SalesPanel` and `TransfersPanel` components are
  unmodified and keep working exactly as before for both database-configured
  and database-absent environments.
- Prisma schema was not modified (Patch 3.2A models were sufficient); no
  migration was run.
- Verified: `npx prisma generate` OK (no schema change); `npx tsc --noEmit`
  clean; `npm.cmd run build` compiled successfully with `/panel/reservas`,
  `/panel/ventas` and `/panel/traslados` building as dynamic routes.

## Patch 3.3A - Expediente support Prisma models

Includes:
- proforma/quote model added
- expediente document checklist model added
- manual credit follow-up model added
- expediente-centered relations prepared
- branch and user relations prepared
- support status enums added
- Activity model reviewed and not duplicated (already sufficient)
- customer and inventory separation preserved
- no UI connected yet
- no server actions created yet
- Prisma generate validated
- migration generated

Details:
- New models in `prisma/schema.prisma`: `Quote` (table `quotes`),
  `ExpedienteDocument` (table `expediente_documents`), `CreditApplication`
  (table `credit_applications`). They migrate the localStorage keys
  `motomas-quotes-v1`, `motomas-expedient-documents-v1` and
  `motomas-credit-applications-v1`.
- New enums: `QuoteStatus` (BORRADOR, EMITIDA, ANULADA),
  `ExpedienteDocumentType` (CEDULA, INGRESOS, SERVICIOS, CONSTANCIA,
  REFERENCIA, OTRO), `ExpedienteDocumentStatus` (PENDIENTE, RECIBIDO, REVISADO,
  RECHAZADO) and `CreditStatus` (PENDIENTE, EN_REVISION, APROBADO, RECHAZADO,
  CANCELADO).
- The Patch 3.1A `Activity` model was reviewed and reused as-is: it already
  supports expediente follow-ups (has `customerFileId`, `leadId`, `customerId`,
  `branchId`, `userId`, type/status/priority and scheduled/completed
  timestamps). No new activity/follow-up model was added.
- All three models are centered on `CustomerFile`/Expediente. `Quote` and
  `CreditApplication` use `customerFileId @unique` to enforce the current
  one-proforma / one-active-credit-follow-up-per-expediente rule;
  `ExpedienteDocument` is one row per checklist item (not unique). Optional
  `customerId` on `Quote`/`CreditApplication`, `branchId` on all three for
  branch-scoped filtering, and optional User relations for
  `createdBy` (quote, credit) and `reviewedBy` (document). Timestamps on all.
- Customer and MotorcycleUnit separation preserved: `Quote` stores the quoted
  motorcycle as text (`motorcycleModel`) and none of these models relate to
  `MotorcycleUnit`; no inventory is created or reserved. Money fields
  (`price`, `downPayment`, `estimatedPayment`, `amount`) are commercial
  customer-facing figures on the proforma/credit follow-up, not inventory
  acquisition costs — inventory-cost visibility rules are unaffected. No upload,
  PDF or bank-integration field was added.
- `npx prisma generate` validated. Migration `20260708202124_expediente_support`
  generated and applied to the local `motomas-postgres` container; it only
  creates the 3 new tables and 4 enums with their foreign keys (no drop or
  change to existing tables). Database not reset. No UI, server action, Caja,
  Contabilidad, public portal or localStorage key was touched.

## Patch 3.P1 - Public Client Portal presentation UI refactor

Includes:
- full public portal visual refactor
- premium light customer-facing design
- improved public header and footer
- showroom-style homepage hero
- improved customer trust sections
- improved customer process section
- improved client tools section
- improved catalog layout
- improved motorcycle detail pages
- improved public request form UX
- improved tracking pages
- mobile-first responsive refinements
- no invented motorcycle data
- no internal stock/cost data exposed
- internal operations panel untouched
- build validated

Details:
- New portal-scoped light UI kit `src/features/portal/components/ui.tsx`
  (PortalCard, PortalBadge, PortalSectionHeader + button/input/select class
  helpers). The shared dark `@/components/ui/*` primitives were left untouched
  because they are used by the internal `/panel`; the portal now has its own
  premium light look (white/soft-gray surfaces, blue primary actions, MotoMas
  orange accent, dark readable slate typography, soft shadows).
- New shared public components: `public-header.tsx` (sticky light header with
  desktop nav + accessible mobile hamburger menu, preserves tracking query
  params on Mi crédito/reserva/entrega links), `public-footer.tsx`,
  `mobile-sticky-cta.tsx` (mobile-only "Solicitar información" bar), and
  `showroom-hero.tsx` (controlled featured-model showroom with a manual model
  strip — no auto-rotating carousel). `portal-shell.tsx` now composes these and
  sets the light theme; the header runs inside a Suspense boundary.
- Homepage rebuilt as `public-home.tsx`: showroom hero (5 featured models that
  have transparent showroom assets), trust signals, step-by-step customer
  process, client tools grid, branch service-points strip (existing real branch
  names only, no addresses/phones invented), and a final conversion CTA.
- Catalog (`/catalogo`) and `motorcycle-public-card.tsx` restyled to a polished
  light grid (image-forward cards, "Ver modelo" + "Solicitar información"),
  omitting missing fields instead of showing placeholders. Motorcycle detail
  (`/motocicletas/[slug]`) restyled with large image, real specs only when
  present, "Cómo sigue tu proceso" and "También puedes consultar" sections, and
  primary/secondary CTAs.
- Public request form (`/solicitar-informacion`) restyled into 4 clear grouped
  steps (Datos del cliente, Moto de interés, Sucursal, Contacto y envío) with a
  prominent tracking-code success state. All existing behavior preserved
  verbatim: database-backed lead creation via `createPublicLeadAction`,
  localStorage fallback via `savePublicLead`, shared tracking code (idOverride)
  and all validation/sanitization. Shared dark inputs were swapped for
  light-themed native inputs keeping every handler.
- Tracking pages (`/consultar-expediente`, `/mi-credito`, `/mi-reserva`,
  `/mi-entrega`) restyled via `public-process-lookup.tsx`: customer-friendly
  copy, clear progress stepper, next-step callout and a friendly not-found empty
  state. No internal terminology, no cost/private data, no localStorage/dev
  wording; all lookup logic unchanged.
- Mobile-first: sticky light header with hamburger, mobile sticky CTA with
  bottom page padding so content is never covered, responsive grids that stack,
  horizontal-scroll contained to the hero model strip, no horizontal overflow.
- Internal `/panel`, operations modules, Caja, Contabilidad, Prisma schema,
  auth and role permissions were not touched. No motorcycle data, prices,
  specs, stock, colors or branch contact data were invented. No dependencies
  installed, no assets generated, no `.env` change.
- Build validated: `npm.cmd run build` compiled successfully.

## Patch 3.1G - Next.js Proxy auth migration

Includes:
- auth protection migrated from middleware convention to proxy convention
  (`src/middleware.ts` removed, `src/proxy.ts` added with exported `proxy`
  function; `config.matcher` preserved as `["/panel/:path*"]`)
- /panel route protection preserved
- /login authenticated redirect preserved (handled in `src/app/login/page.tsx`)
- role redirects preserved (`getDefaultRouteForSession`)
- Edge/Proxy-safe session verification preserved (Web Crypto only, no Prisma,
  server actions, Node crypto/fs/path or database helpers)
- conflicting middleware/proxy setup avoided (single proxy file, no middleware)
- build validated

## Patch 3.P2B - Seller presentation navigation and legacy session bridge fix

Includes:
- Root cause fixed: `readDemoSession()` re-derived the mirrored session by
  looking up `userId` in the fixed `demoInternalUsers` list. A real database
  user id never appears there, so every authenticated session looked
  logged-out to the legacy `localStorage`-driven panels — collapsing the
  Seller's sidebar navigation to nothing and showing "Sesión interna
  requerida" on Leads (local section), Clientes, Expedientes, Actividades,
  Inventario, Reservas, Ventas, Traslados and the dashboard. Fixed by trusting
  the already-complete `DemoSession` shape written by `SessionBridge`
  (`src/features/operations/services/session-service.ts`) instead of
  cross-checking it against the demo user table.
- Seller navigation restored for the intended commercial workspace (Inicio,
  Leads, Clientes, Expedientes, Actividades, Inventario, Reservas, Ventas);
  Caja, Contabilidad, Reportes, Vendedores and Configuración remain hidden for
  Vendedor, unchanged from prior patches.
- Seller role redirect reviewed and fixed: `getDefaultRouteForSession` now
  sends Vendedor to `/panel/dashboard` (its existing role-aware "Mi trabajo de
  hoy" view) instead of `/panel/leads`.
- Real login already bridges into the legacy session format expected by
  unmigrated Seller panels via the existing `SessionBridge` component and the
  `motomas-demo-session-v1` key; no new or incompatible format was introduced.
- Logout already cleared both the real auth cookie (`logoutAction`) and the
  legacy `localStorage` mirror (`clearDemoSession`) in `OperationsShell`; no
  change needed.
- Confusing "Sesión interna requerida" wording and stray "demo" references
  removed from the Seller-reachable panels (leads, clientes, expedientes,
  reservas, ventas, inventario, actividades, dashboard, traslados) and
  replaced with plain "Inicia sesión para continuar" copy.
- Technical migration dividers ("Bandeja local · Temporal, pendiente de
  migración" and similar) extracted into a shared
  `LegacySectionDivider` component and hidden by default behind
  `NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS=true`; Seller-facing pages show
  a business-friendly label instead.
- Database-backed empty states ("Aún no hay ... en la base de datos para este
  alcance") reworded to match the friendly copy already used by the
  legacy/local panels, across leads, clientes, expedientes, reservas, ventas
  and traslados.
- DB-backed and legacy Seller modules can now be presented as one operational
  experience without exposing migration status by default.
- Seller permission boundaries preserved: no changes to `access.ts`,
  role-scoped queries, or the existing Caja/Contabilidad/Reportes/Vendedores
  client-side guards; Vendedor and Cajero still never see costs.
- No new modules migrated, no Prisma schema changes, no migrations run.
- Build validated with `npm.cmd run build`. Manual validation limited by this
  environment: no reachable Postgres instance and no headless-browser tooling
  available, so the redirect/auth/route-protection behavior was verified with
  a signed session cookie via `curl` (confirms `/login` → `/panel/dashboard`
  redirect for Vendedor, and that dashboard/inventario/actividades render
  `200` for an authenticated Seller session); full click-through with a real
  `vendedor@motomas.local` database login was not exercised in this session.

## Patch 3.P2 - Global presentation bridge and unified role experience

Includes:
- Legacy session bridge already applies to every role (Admin, Gerente,
  Vendedor, Cajero, Contador): `SessionBridge` mirrors the real authenticated
  session into `motomas-demo-session-v1` for any role, and the Patch 3.P2B fix
  to `readDemoSession()` (stop re-deriving the user from the fixed
  `demoInternalUsers` table) is what actually makes that mirror usable after a
  real database login, for all five roles — not just Vendedor.
- Logout (`OperationsShell`) already cleared both the real cookie
  (`logoutAction`) and the legacy mirror (`clearDemoSession`) for every role.
  Extended the same real+legacy cleanup to the Configuración "Reiniciar datos
  internos" danger-zone action, which previously only wiped `localStorage` and
  claimed to close the session without ever calling `logoutAction()` — after a
  reset the real cookie stayed valid and `SessionBridge` silently repopulated
  the mirror on the next navigation. It now calls `logoutAction()` and
  redirects to `/login`.
- Role navigation verified against the target module lists for Admin,
  Gerente, Vendedor, Cajero and Contador: `OperationsShell`'s
  `operationsNavItems` already matched for Admin/Gerente/Vendedor; Caja's
  `CashierShell` and Contabilidad's `AccountingShell` already carry their own
  internal sub-navigation (Facturación/Recibos/Notas/Cierres and the full
  accounting group list) — nothing needed to change there.
- New `PrimarySectionBadge`, `PrimarySectionDescription` and
  `SectionUnavailableNotice` helpers added to `legacy-section-divider.tsx`,
  shared by the database-backed panels for leads, clientes, expedientes,
  reservas, ventas and traslados, plus `/panel/inventario/movimientos` and
  user management. They replace the "Base de datos (fuente principal)" badge
  and "...mientras se completa su migración" copy with business-friendly text
  by default, keeping the precise technical wording available behind
  `NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS=true`.
- Extracted the flag itself into `src/shared/feature-flags.ts`
  (`SHOW_TECHNICAL_LABELS`) so Caja, Contabilidad, Configuración and the DB
  panels all gate on the same source.
- Removed remaining "Sesión interna requerida" / "demo" wording from Caja,
  Contabilidad and Configuración (previously left alone because they weren't
  reachable by Seller): cashier-panel, accounting-panel and settings-panel now
  say "Inicia sesión para continuar" and drop the bare word "demo" from
  dashboard subtitles, bank/voucher placeholder defaults, the accounting
  document origin value (`"Contabilidad demo"` → `"Contabilidad"`, a typed
  value rendered directly as a badge), Vendedores supervision copy and
  Marketing's subtitle.
- Configuración's audit/business-rule copy reworded to be both accurate and
  presentable: it no longer claims "no hay autenticación real" (false since
  the Patch 3.0 cookie auth), and the fully technical explanation (HMAC
  cookie, which keys live in `localStorage`) moved behind the same
  `NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS` flag instead of always
  showing.
- DB-backed and legacy sections keep coexisting exactly as before (no
  localStorage keys removed, no fallback behavior changed) — only the labels
  presented around them changed.
- Empty states reworded to drop "en la base de datos" across leads, clientes,
  expedientes, reservas, ventas and traslados DB panels (continuation of
  Patch 3.P2B, now also covering traslados).
- Role permission boundaries untouched: `access.ts` predicates, CRM/operations
  scope functions and the existing Caja/Contabilidad/Reportes/Vendedores
  client-side role guards were not modified. Costs remain hidden from Vendedor
  and Cajero.
- No new modules migrated, no Prisma schema changes, no migrations run, no
  `.env` changes, no dependencies installed.
- Build validated with `npm.cmd run build`. Manual validation: signed-cookie
  `curl` checks against a running dev server confirm the `/login` redirect for
  all five roles (ADMIN/VENDEDOR → `/panel/dashboard`, GERENTE → `/panel/leads`
  unchanged, CAJERO → `/panel/caja`, CONTADOR → `/panel/contabilidad`) and that
  each role's non-DB-dependent home route returns `200`. This sandbox has no
  reachable Postgres instance, so `/panel/leads`-style DB-backed pages and
  `/panel/configuracion` (which lists real users) return `500` here — a
  pre-existing environment limitation, not caused by this patch. No headless
  browser was available to click through a real `admin/gerente/vendedor/
  cajero/contador@motomas.local` login end-to-end in this session.

## Parche 3.P3B - Rediseno visual del login

- Se creo `docs/UI_REFACTOR_PLAN.md` (fase 3.P3A) con la direccion visual
  completa del refactor UI: sistema de color claro, tipografia, blueprints de
  login/shell/Contabilidad/Caja, reglas de forms/tablas y secuencia de parches.
- Login redisenado a dos columnas: panel de marca oscuro con la animacion
  `/assets/login/motorcycle-loading.webm` (autoplay, muted, loop, playsInline,
  fallback si el video falla y oculto con `prefers-reduced-motion`) y columna
  de acceso clara con tarjeta blanca.
- Nuevo componente `src/features/operations/components/login-visual.tsx`.
- `login-form.tsx` conserva la logica de autenticacion intacta (loginAction,
  saveDemoSession, redirects); solo cambio el markup: labels arriba, primario
  azul, acento naranja de marca, avisos de cuentas de desarrollo re-estilizados.
- Sin cambios en primitivos compartidos (`src/components/ui/`), `globals.css`,
  auth, server actions, datos ni claves de localStorage.
- Build validado con `npm.cmd run build` (50 rutas, TypeScript sin errores).

## Patch 3.P3C - Light operations foundation and grouped shell

Includes:
- operations visual foundation moved toward professional light theme:
  `globals.css` ahora define fondo gris suave (#f4f5f7), texto slate, seleccion
  azul neutra, scrollbar neutro y soporte global de `prefers-reduced-motion`.
- shared UI primitives refactored for light interface: Button (primario azul,
  secundario blanco/borde, ghost, danger rojo solo destructivo, sin glows),
  Card (blanca, borde slate, rounded-xl, shadow-sm), Badge (tonos legibles
  blue/emerald/amber/red/slate/orange/indigo + alias legacy red/green/yellow/
  blue/gray), Input (fondo blanco, borde slate, focus azul). APIs compatibles.
- new shared presentation primitives en `src/components/ui/`: PageHeader,
  StatCard, EmptyState, FormSection + Field, SectionTabs, SubSidebar,
  DataTableShell (para 3.P3D/3.P3E).
- grouped operations sidebar implemented: Inicio / Gestion Comercial /
  Operacion / Supervision / Sistema / Finanzas, con iconos Lucide, activo
  azul con indicador naranja izquierdo, labels de grupo compactos.
- operations header improved: breadcrumb de seccion + titulo, chips de rol y
  sucursal, acceso a cerrar sesion; se elimino la campana decorativa.
- mobile navigation improved: drawer lateral con overlay (se cierra al navegar)
  en lugar del scroll horizontal de pildoras; sin overflow horizontal.
- technical navigation wording removed: "Altas y bajas (BD)" ahora se muestra
  como "Movimientos de inventario" (solo label); se elimino el badge
  "Privado /panel"; pantallas de restriccion de Contador/Cajero re-tematizadas
  en claro con boton primario azul.
- barrido mecanico de utilidades oscuras en los modulos de operaciones
  (33 archivos, ~1,890 reemplazos): zinc->slate, superficies #141414/white-alpha
  -> blanco/slate-50, estados translucidos -> tintes claros (-50/-200/-700),
  focus rojo -> azul, botones primarios rojos -> azules, sombras glow ->
  shadow-sm; el preview contable estilo documento conserva su banda oscura con
  texto claro y acento naranja.
- route paths preserved; role permissions preserved (filtro por rol identico,
  Vendedor sin Traslados, Contador/Cajero aislados); login/auth/data logic
  untouched; claves de localStorage intactas; portal publico sin cambios de
  logica (ya era claro y usa primitivos propios).
- build validated: `npm.cmd run build` (50 rutas, TypeScript sin errores).
- pendiente de verificacion visual manual: /panel/dashboard, /panel/leads,
  /panel/inventario, /panel/reservas, /panel/ventas, /panel/caja,
  /panel/contabilidad y ancho movil (drawer).

## Patch 3.P3B.1 - Branded loading experience and login visual polish

Includes:
- login visual panel updated with motorcycle background image
  (`/assets/login/login-image.jpg`) bajo overlay azul oscuro degradado, con
  acento naranja sutil (halo difuminado + linea inferior naranja/azul).
- real MotoMas logo integrated into login branding
  (`/assets/login/logo-motomas.png`) en el hero y en el encabezado movil del
  formulario. El asset es PNG opaco sin canal alfa, por lo que se monta sobre
  una placa blanca redondeada de forma intencional en fondos oscuros.
- fake decorative login icons removed or minimized: se elimino el icono
  placeholder `Bike` del hero y del formulario movil; solo permanece un
  `ShieldCheck` pequeno en la linea de acceso seguro.
- Motorcycle Loading.webm moved to branded loading feedback usage: el video
  salio del login y ahora alimenta el estado de carga interno. El WEBM es VP8
  con canal alfa (AlphaMode=1), por lo que compone limpio sobre fondo claro.
- reusable internal loading screen added: `src/components/ui/brand-loading.tsx`
  (`BrandLoading`), con `role="status"`, `aria-live="polite"`, mensaje
  configurable, fallback a placa de marca estatica si el video falla y bajo
  `prefers-reduced-motion` (variantes `motion-safe`).
- operations route loading state added: `src/app/(operations)/panel/loading.tsx`
  usa el patron nativo de Next.js y renderiza dentro del OperationsShell, de
  modo que la navegacion interna conserva sidebar y header mientras carga.
- auth logic preserved: `loginAction`, `saveDemoSession`, redirects por rol,
  manejo de contrasena y el puente de sesion quedaron intactos; solo cambio
  markup/clases.
- database logic preserved; sin dependencias nuevas; portal publico sin tocar.
- build validated: `npm.cmd run build` (50 rutas, TypeScript sin errores).

## Patch 3.P3D - Finance layouts, admin supervision UX and brand personality polish

Includes:
- Contabilidad reorganized with proper sidebar/sub-navigation: sub-sidebar fija
  de 220px (>= xl) sticky bajo el header, agrupada en Resumen / Documentos /
  Operación diaria / Control contable / Soporte / Análisis; por debajo de xl
  colapsa a un rail de tabs horizontal scrolleable.
- accounting option grid removed from main content: la Card-grilla de 13
  enlaces que se renderizaba encima de cada página contable fue eliminada, junto
  con la card "Alcance de sesión" (el dato ya vive en el header del shell).
- accounting dashboard made more professional and compact: 4 status cards con
  franja de acento (azul / naranja si requieren atención) -> "Requiere atención"
  (solo pendientes reales, con estado vacío propio) -> cola documental ->
  cierres pendientes -> actividad reciente -> cifras del periodo -> accesos
  rápidos degradados a enlaces secundarios. Se retiró el bloque azul gigante y
  las tarjetas "Salud contable" / "Trabajo crítico".
- Caja layout polished as an operational workstation: encabezado con regla de
  marca y tabs subrayados (estilo SectionTabs) en vez de píldoras; turno,
  totales del día, acciones rápidas, documentos recientes y cierre del turno se
  conservan. Cifras en `tabular-nums`, `rounded-2xl` -> `rounded-xl`,
  `font-black` -> `font-semibold`. Caja no imita a Contabilidad.
- Admin/owner UX shifted toward supervision and control: para Administrador el
  sidebar reordena y reetiqueta los grupos a Panel general / Supervisión
  comercial / Operación / Finanzas / Registros comerciales / Configuración.
  Ningún ítem se agrega ni se quita; solo cambian etiqueta y orden.
- role-aware copy improved for Admin, Cajero y Contador: nuevo helper de
  presentación `src/features/operations/lib/role-copy.ts`. Admin lee
  "Supervisa la operación de caja, revisa cierres y consulta los documentos
  emitidos" y "Consulta el estado contable, cierres, documentos y reportes
  financieros"; Cajero y Contador conservan lenguaje de ejecución. El shell
  añade una línea de contexto por rol bajo el título de página.
- light theme enriched with MotoMas brand personality: canvas `.app-canvas` con
  dos tintes radiales muy suaves (azul/naranja), `.nav-surface` para el sidebar
  (blanco con leve tinte navy), `.brand-rule` naranja->azul en el borde superior
  del sidebar, el header y los encabezados de Caja/Contabilidad; marcador activo
  naranja de 4px; encabezados de card con fondo `slate-50/80`; status cards con
  franja de acento lateral. Sin glow, sin glassmorphism, sin volver al tema
  oscuro.
- login visual adjusted while final transparent logo is pending: se retiró el
  PNG opaco `logo-motomas.png` del hero y del encabezado móvil del formulario
  (necesitaba una placa blanca para no verse mal). En su lugar,
  `BrandWordmark` (texto "MotoMas" con acento naranja + regla de marca). Se
  conserva la foto de fondo y el overlay; sin iconos falsos, sin assets externos.
- technical wording kept hidden: se eliminaron las rutas técnicas visibles
  ("/panel/contabilidad", "/panel/caja") de la copy del dashboard y la frase
  "Sin facturación fiscal, PDF ni DGI" del encabezado de Caja. Sin "BD",
  "base de datos", "localStorage", "migración", "demo" ni "fuente principal" en
  las áreas tocadas.
- business logic preserved: cálculos de caja, retenciones, cierres, filtros por
  sucursal, exportadores CSV/PDF y estados de documento sin cambios.
- auth and database logic untouched: Prisma, seeds, server actions, queries,
  middleware, helpers de rol, `loginAction`, SessionBridge, redirects por rol y
  claves de localStorage intactos. Reglas de acceso preservadas: Contador y
  Cajero siguen aislados, Gerente mantiene su vista contable limitada
  (Inventario contable + Reportes), Vendedor sigue sin Traslados.
- build validated: `npm.cmd run build` (50 rutas, TypeScript sin errores).
- pendiente de verificación visual manual: /login, /panel/dashboard (Admin),
  /panel/caja (Admin y Cajero), /panel/contabilidad (Admin y Contador),
  /panel/contabilidad/documentos, /diarios, /reportes y ancho móvil.

## Patch 3.P3D.1 - Finance navigation placement and internal brand depth

Includes:
- accounting sub-navigation moved away from second-left-sidebar layout: el grid
  pasó de `xl:grid-cols-[220px_minmax(0,1fr)]` a
  `xl:grid-cols-[minmax(0,1fr)_236px]` y el `<aside>` se renderiza después del
  contenido, eliminando el efecto de doble sidebar
  (sidebar global | rail contable | contenido).
- accounting navigation converted into right contextual rail: 236px, sticky bajo
  el header (`top-24`), superficie `.rail-surface` (más clara que el sidebar
  global, sin `shadow-sm`), encabezado "Módulo contable" con regla de marca,
  labels de grupo en `slate-400` y marcador activo naranja de 4px. Se conservan
  los seis grupos (Resumen / Documentos / Operación diaria / Control contable /
  Soporte / Análisis) y el filtrado por rol Gerente.
- responsive: por debajo de `xl` el rail colapsa al strip horizontal de tabs
  scrolleable ya existente, contenido dentro de su propio `overflow-x-auto`, por
  lo que la página no genera scroll horizontal propio.
- main accounting content hierarchy improved: el split interno del dashboard
  (`Requiere atención` + `Cola documental` | `Cierres pendientes` +
  `Actividad reciente`) pasó de `xl:` a `2xl:`, igual que las grillas de status
  cards y cifras del periodo, porque el rail ya reclama el borde derecho en
  `xl`. "Requiere atención" queda central y recibe una franja superior de acento
  (naranja con pendientes, esmeralda sin ellos).
- internal operations UI enriched with stronger MotoMas brand personality:
  canvas más profundo (`--background` `#eef1f6` -> `#e9edf4`) con tintes
  radiales navy/naranja; `.nav-surface` con más carga navy; nuevas utilidades
  `.card-header-tint` (banda de encabezado azul->transparente, reemplaza los
  rellenos planos `bg-slate-50/80`), `.header-tint` (gradiente de marca
  restringido para encabezados de módulo y del shell) y `.rail-surface`.
- light theme kept professional without returning to dark dashboard: sin glow,
  sin glassmorphism, sin neón, sin superficies negras. Solo tintes de baja
  opacidad, reglas de 1-2px y acentos naranja.
- Caja and Contabilidad visual depth improved: el encabezado de Caja usa
  `.header-tint`; `DaySummary` pasa de card plana a card con banda de encabezado
  y cuerpo `p-6`; los cinco encabezados de card del dashboard contable usan la
  banda tintada.
- role-aware finance UX preserved: `role-copy.ts` sin cambios; Admin sigue en
  lenguaje de supervisión, Contador en ejecución contable, Cajero en operación.
- technical wording kept hidden: sin "BD", "base de datos", "localStorage",
  "migración", "Temporal", "demo", "sesión demo" ni "fuente principal" en las
  áreas tocadas.
- business logic preserved: cálculos, filtros por sucursal, exportadores y
  estados de documento sin cambios.
- auth and database logic untouched: Prisma, seeds, server actions, queries,
  middleware, helpers de rol, SessionBridge, `loginAction` y claves de
  localStorage intactos. Login sin rediseñar en este parche.
- build validated: `npm.cmd run build` (50 rutas, TypeScript sin errores).
- pendiente de verificación visual manual: /panel/contabilidad (Admin y
  Contador), /panel/contabilidad/documentos, /diarios, /reportes, /panel/caja,
  /panel/dashboard y ancho móvil.



## Patch 3.P4A - Public client portal premium UI refactor

Includes:
- public portal header redesigned: el logo pasa de `motomas-logo.png` (opaco,
  h-9) a `motomas-logo-transparent.png` a h-11/h-12, extraído a un componente
  servidor `portal-logo.tsx` (antes el header cliente arrastraba el footer y el
  shell a la frontera de cliente). Header sticky con `brand-rule` naranja->azul
  en el borde superior, `backdrop-blur`, marcador activo naranja subrayado
  (`aria-current="page"`), breakpoint del menú movido de `lg` a `xl` porque los
  6 enlaces + CTA no caben a 1024px. Menú móvil con grupo "Seguimiento de
  solicitud", barra naranja en el activo y `aria-expanded`/`aria-controls`.
- homepage showroom experience improved: el hero usa los assets
  `/motomas/hero/background.webp` y `floor.webp`, que existían y no se usaban
  (backdrop al 7% de opacidad, plancha de piso al 25%). Al cambiar de modelo, la
  moto y su pie de foto se remontan por `key={slug}` y reproducen
  `animate-hero-swap` (300ms). Miniaturas con lift al hover y subrayado naranja
  en la activa. Trust signals, pasos del proceso, herramientas del cliente y CTA
  final con `reveal-on-scroll` y `hover-lift`.
- catalog page visually polished: encabezado full-width `PortalPageHeader` con
  el conteo real de modelos; grilla de 3 -> 4 columnas en `xl`; card más
  compacta (imagen 4:3 -> 16:11, `line-clamp-3` -> `line-clamp-2`, marca movida
  a un chip sobre la imagen), zoom de imagen al hover, regla naranja que se
  revela en el borde inferior y CTAs de ancho igual. Sin precios ni stock.
- motorcycle detail page improved: hero de detalle sobre una banda blanca con
  `brand-rule` y tintes de marca; imagen y identidad comparten la banda; título
  a `lg:text-5xl` con regla naranja; galería secundaria con `reveal-on-scroll`.
  Solo datos existentes (`brand`, `description`, `technicalSpecs`).
- request form UI improved: `PortalPageHeader` full-width; el aside "Qué pasa
  después" queda `lg:sticky`; los pasos del formulario ganan una regla inferior
  y un acento naranja; el estado de éxito entra con `animate-fade-up`. Sin
  tocar `createPublicLeadAction` ni el fallback.
- client tracking pages redesigned into a consistent status center experience:
  las cuatro rutas comparten ahora encabezado full-width + tabs horizontales
  (Mi proceso / Mi reserva / Mi entrega / Mi crédito) que antes vivían en una
  card suelta bajo el formulario. Columna izquierda `lg:sticky` con el
  formulario único; columna derecha con el resultado o el estado vacío. El
  estado vacío dejó de ser una card corta flotando en blanco: ahora tiene
  cabecera tintada + "Datos que puedes usar" + "Próximos pasos" con enlace a
  solicitar información.
- shared portal components added or improved: nuevo `portal-logo.tsx`
  (`PortalLogo`) y nuevo `PortalPageHeader` en `ui.tsx`, adoptado por catálogo,
  formulario y las 4 rutas de seguimiento. `PortalSectionHeader` gana la regla
  naranja; `PortalBadge` y `labelClass` pierden `font-bold`/`tracking-[0.1em]`.
- premium MotoMas light brand system applied to public pages: canvas
  `.portal-canvas` (blanco roto con lavado navy/naranja), reglas de marca en
  header, footer y encabezados de página, acento naranja en activos y CTAs
  azules.
- subtle animations and interaction polish added: solo CSS, sin dependencias
  nuevas. `portal-fade-up` (280ms), `portal-fade-in` (240ms),
  `portal-hero-swap` (300ms), `.hover-lift` (180ms) y `.reveal-on-scroll` con
  `animation-timeline: view()` detrás de `@supports` (mejora progresiva: los
  navegadores sin soporte muestran el contenido en su sitio). Los botones ganan
  un lift de 2px con `motion-reduce:hover:translate-y-0`. El bloque global de
  `prefers-reduced-motion` anula todo y además neutraliza `.hover-lift:hover`.
- mobile responsiveness improved: menú a `xl`, columnas de seguimiento apiladas,
  CTAs a ancho completo, tabs y grillas con scroll contenido.
- public technical wording kept hidden: sin "Base de datos", "localStorage",
  "pendiente de migración", "Temporal", "demo", "fuente principal" ni rutas
  técnicas en la copy visible del portal.
- business logic preserved: `createPublicLeadAction`, `findPublicProcess`, el
  fallback local y los datos del catálogo sin cambios. No se inventaron
  modelos, precios, specs, colores ni sucursales.
- database/auth/internal panel logic untouched: Prisma, seeds, server actions,
  queries, middleware, helpers de rol, SessionBridge y el panel interno
  intactos. `globals.css` solo recibió utilidades nuevas con prefijo de portal.
- build validated: `npm.cmd run build` (50 rutas, TypeScript sin errores) y
  smoke test HTTP: las 8 rutas del portal devuelven 200 y los assets nuevos
  (logo transparente, background.webp, floor.webp) resuelven 200.
- pendiente de verificación visual manual: /, /catalogo,
  /motocicletas/[slug], /solicitar-informacion, /consultar-expediente,
  /mi-credito, /mi-reserva, /mi-entrega en 375px, 768px y 1440px.

## Patch 3.P4B - Public portal responsive QA and final polish

Includes:
- public portal responsive QA completed: se auditaron las 8 rutas del portal.
  La QA se hizo por análisis estático + inspección de los assets reales y del
  HTML/CSS servido, no con un navegador; los anchos de 375/768/1440px siguen sin
  verificación ocular.
- mobile/tablet/desktop layout issues fixed:
  - **Logo débil (causa real encontrada):** `motomas-logo-transparent.png` es un
    lienzo de 500x500 con la obra de arte de solo 362x298 centrada (57% del PNG
    es padding vacío), así que a `h-12` el logo visible medía ~29px. Se cambió a
    `motomas-logo-mark.png`, que contiene la misma obra recortada (378x314, 91%
    de relleno): misma altura de header, logo ~60% más grande. Se añadieron
    `width`/`height` intrínsecos para reservar espacio y evitar CLS.
  - **Recorte de fotos (causa real encontrada):** 7 de las 15 imágenes del
    catálogo son casi cuadradas (0.96–1.10 de aspecto) y el marco era 16:11
    (1.45) con `object-cover`, recortando ~31% de su altura. Las cards y el hero
    de detalle pasan a marco 4:3 con `object-contain` sobre una plancha
    degradada, más `p-3`/`p-4`, de modo que ninguna moto se corta. La galería
    secundaria del detalle recibe el mismo tratamiento.
  - **CTA desbordada en catálogo:** con `xl:grid-cols-4` las cards miden ~280px,
    lo que dejaba ~115px por botón — insuficiente para "Solicitar información".
    Los dos CTAs pasan de fila `flex-1` a `grid gap-2` apilado.
  - **Cards de distinta altura:** el wrapper `reveal-on-scroll` se había
    convertido en el grid item, dejando la card sin estirar. Se movió la clase a
    la propia card (nuevo prop `className`) y se le añadió `h-full`.
  - **Footer tapado por la CTA fija móvil:** el `pb-24` vivía en `<main>`, pero
    el footer es hermano, así que la última fila quedaba debajo de la barra fija.
    El padding se movió a la última fila del footer (`pb-24 lg:pb-5`).
  - **Título del hero en móvil:** `text-4xl` con `leading-[1.05]` a 375px pasa a
    `text-3xl leading-[1.1]` (sm+ sin cambios).
- header and mobile menu polished: logo legible (ver arriba), estado activo con
  subrayado naranja y `aria-current`, menú móvil con `aria-expanded`/
  `aria-controls`. Se añadió `scroll-padding-top: 6rem` para que los anclajes no
  queden bajo el header sticky.
- home/showroom layout polished: h1 escalado en móvil; miniaturas y hero sin
  cambios de layout (las animaciones usan `transform`/`translate`/`opacity`, que
  no provocan reflow ni layout shift).
- catalog and motorcycle detail pages polished: ver recorte de fotos, CTAs y
  altura de cards. Sin precios, specs ni stock inventados.
- request form layout polished: la CTA fija móvil ahora se oculta en
  `/solicitar-informacion` (`usePathname`), donde solo tapaba el formulario al
  que apuntaba. `createPublicLeadAction` y el fallback intactos.
- client tracking pages spacing and balance improved: se conservan el encabezado
  full-width, los tabs scrolleables y la columna sticky de 3.P4A; el footer ya no
  queda tapado en móvil.
- portal animations reviewed and reduced-motion behavior preserved:
  - **Conflicto real corregido:** `.reveal-on-scroll` animaba `transform` con
    `animation-timeline: view()`. Una animación de timeline está siempre "en
    curso", así que su `transform` anulaba de forma permanente el
    `transform: translateY(-3px)` de `.hover-lift` en los elementos que usaban
    ambas clases (cards de catálogo, trust signals, herramientas del cliente):
    el hover lift estaba muerto. Nuevo keyframe `portal-reveal` que anima la
    propiedad independiente `translate`, que compone con `transform` en vez de
    competir.
  - Verificado en el CSS servido: `.hover-lift:hover{transform:none}` queda
    dentro de `@media (prefers-reduced-motion:reduce)`, no fuera.
  - Sin dependencias nuevas; ninguna animación supera 320ms.
- public technical wording kept hidden: verificado sobre el HTML servido de las
  8 rutas — cero coincidencias de "Base de datos", "localStorage", "pendiente de
  migración", "Temporal", "fuente principal", "sesión demo" ni "(BD)".
- business logic preserved; database/auth/internal panel logic untouched.
- build validated: `npm.cmd run build` (50 rutas, TypeScript sin errores). Smoke
  test HTTP con servidor limpio: las 8 rutas devuelven 200, el asset del logo
  resuelve 200, y el HTML servido confirma logo-mark, `object-contain`, cards
  `h-full`, footer con `pb-24` y ausencia de la CTA fija en el formulario.
- pendiente de verificación visual manual: /, /catalogo, /motocicletas/[slug],
  /solicitar-informacion y las 4 rutas de seguimiento en 375px, 768px y 1440px.



## Patch 3.3A/3.3B - Expediente support database layer

Includes:
- expediente support schema reviewed: los modelos `Quote`, `ExpedienteDocument`
  y `CreditApplication` ya existían (migración `20260708202124_expediente_support`),
  igual que `Activity`. **No se creó ningún modelo nuevo.** `Activity` se reutiliza
  tal cual para actividades/seguimientos. No se añadió `CreditFollowUp`: el
  seguimiento de crédito actual no tiene historial, solo estado + observaciones +
  documentos pendientes, todo lo cual ya vive en `CreditApplication`.
- missing expediente support models added if needed: ninguno. Lo que sí faltaba
  era **paridad de enums y campos** con los datos locales que este layer deberá
  absorber. El comentario del schema afirmaba que los valores reflejaban los
  estados actuales, y no era cierto:
  - `QuoteStatus` tenía 3 valores (BORRADOR/EMITIDA/ANULADA) frente a los 5
    reales (Borrador/Emitida/Aceptada/Vencida/Cancelada). Ahora:
    BORRADOR, EMITIDA, ACEPTADA, VENCIDA, CANCELADA (mapeo 1:1).
  - `ExpedienteDocumentType` tenía 6 de los 7 tipos reales; se añadió `LICENCIA`.
  - `CreditStatus` tenía 5 de los 7 estados reales; se añadieron
    `DOCUMENTACION_PENDIENTE` y `PREAPROBADO`.
  - `Quote` ganó `quoteNumber` (único), `saleType` (reutiliza el enum `SaleType`
    existente), `issuedAt` y `expiresAt`.
  - `CreditApplication` reemplazó `creditType String?` por
    `financingType CreditFinancingType?` (nuevo enum de 3 valores, espejo de
    `creditFinancingTypes`) y ganó `requestedAt` / `resolvedAt`.
  Las 4 tablas estaban vacías (0 filas) y ningún código las usaba, por lo que el
  cambio no borró ni migró datos. `branches` (14) y `users` (5) intactos.
- Prisma migration applied if schema changed: sí ->
  `20260709160515_expediente_support_parity`. Nota: `prisma migrate dev` es
  interactivo y falla en este entorno (pide confirmar el drop del valor de enum
  `ANULADA`), así que la migración se generó con `prisma migrate diff` y se
  aplicó con `prisma migrate deploy`. El nombre lleva sufijo `_parity` porque
  `expediente_support` ya existe como migración previa.
- server DTOs, queries and actions added for expediente support:
  - `src/server/expedientes/shared.ts` — tipos client-safe, uniones de enum,
    labels, `canTransitionQuote`, `buildDocumentProgress` y validadores
    (`sanitizeMoney`, `sanitizeTermMonths`, `isSupportedCurrency`). El dinero se
    expone como `number | null`; nunca un `Prisma.Decimal`.
  - `src/server/expedientes/queries.ts` — `listQuotes`, `getQuoteForFile`,
    `listExpedienteDocuments`, `listCreditApplications`,
    `getCreditApplicationForFile`, `getExpedienteSupport` (payload combinado) y
    `canAccessCustomerFile`.
  - `src/server/expedientes/actions.ts` — `saveQuoteAction`,
    `changeQuoteStatusAction`, `seedExpedienteChecklistAction` (en transacción,
    idempotente), `addExpedienteDocumentAction`,
    `updateExpedienteDocumentAction`, `saveCreditApplicationAction`,
    `changeCreditStatusAction`.
- role-scoped access preserved: nuevos helpers en `src/server/auth/access.ts`
  (`canOperateExpedientes`, `canReviewExpedienteDocuments`,
  `getExpedienteScopeForUser`) que reutilizan las reglas CRM existentes. Admin
  global, Gerente por sucursal, Vendedor solo sus expedientes
  (`customerFile.sellerId`). **Cajero y Contador bloqueados**; no existe
  excepción de solo lectura para Contador (revisa documentos contables en
  Contabilidad, no expedientes comerciales). Solo Admin/Gerente pueden marcar
  REVISADO/RECHAZADO. El filtro de alcance se aplica en el `where` de Prisma
  contra el `CustomerFile` dueño, no en la UI. La sucursal **siempre** se deriva
  de `customerFile.branchId` y nunca del payload del cliente.
- Customer and MotorcycleUnit separation preserved: ninguna acción crea Customer
  ni MotorcycleUnit; el proforma guarda `motorcycleModel` como texto y no
  referencia unidades físicas. Sin campos de costo en ningún DTO.
- Caja/Contabilidad/public tracking untouched.
- localStorage fallback preserved: `storage-keys.ts`, `quote-service.ts`,
  `session-bridge.tsx` y los servicios locales sin cambios. **El layer no está
  conectado a la UI todavía** (igual que 3.2A/3.2B): es solo servidor.
- build validated: `npm.cmd run build` (50 rutas, TypeScript sin errores) y
  `npx tsc --noEmit` limpio. Verificación contra la base real: el filtro de
  alcance devuelve 2/1/1 para Admin/Gerente/Vendedor, un Vendedor no ve
  expedientes de otra sucursal (0 filas), y los valores nuevos de enum
  (`DOCUMENTACION_PENDIENTE`, `FINANCIERA_EXTERNA`, `LICENCIA`, `ACEPTADA`)
  persisten. Fixtures de prueba eliminados; la base quedó como estaba.

## Patch 3.3C - Expediente support UI database connection

Includes:
- expediente support UI connected to PostgreSQL-backed server layer:
  `/panel/expedientes` acepta `?expediente=<id>`. La página resuelve el alcance
  en el servidor con `getExpedienteScopeForUser` + `getExpedienteSupport`, así
  que un id fuera de alcance devuelve `null` y no renderiza nada — la URL nunca
  se confía. Al seleccionar una fila del listado de registros se muestra el
  nuevo `ExpedienteSupportPanel` con Proforma, Documentos y Crédito.
- quote/proforma UI connected to DB actions: `saveQuoteAction` (crea/actualiza,
  una proforma por expediente por el `@unique` en `customerFileId`) y
  `changeQuoteStatusAction`. La UI solo ofrece las transiciones válidas
  (BORRADOR -> EMITIDA/CANCELADA; EMITIDA -> ACEPTADA/VENCIDA/CANCELADA) y pasa a
  vista de solo lectura cuando la proforma está cerrada. Se muestran
  `quoteNumber`, tipo de venta, moneda, precio, prima, plazo, cuota estimada,
  vencimiento y estado. El modelo sigue siendo texto libre; no se vincula a una
  `MotorcycleUnit` ni se inventan precios ni especificaciones.
- document checklist UI connected to DB actions: `seedExpedienteChecklistAction`
  (botón "Preparar lista de documentos" cuando el expediente no tiene lista),
  `addExpedienteDocumentAction` y `updateExpedienteDocumentAction`. Barra de
  progreso alimentada por `buildDocumentProgress`. Los 7 tipos están
  disponibles, incluido `LICENCIA`.
- credit application UI connected to DB actions: `saveCreditApplicationAction` y
  `changeCreditStatusAction`. Se muestran financiera, tipo de financiamiento,
  monto, prima, plazo, cuota estimada, moneda, requisitos pendientes y
  observaciones. El selector de estado incluye `DOCUMENTACION_PENDIENTE` y
  `PREAPROBADO`; cuando el seguimiento llega a un estado terminal la UI lo marca
  como cerrado. No se inventó historial de crédito (no existe `CreditFollowUp`).
- `/panel/creditos`: nueva sección `CreditsDbPanel` con el listado de
  seguimientos de crédito del alcance; cada fila enlaza al expediente dueño,
  donde se edita. La ruta **mantiene su regla previa** (solo Admin/Gerente): el
  `CreditsPanel` legado ya bloqueaba a Vendedor, así que la sección nueva usa el
  mismo gate y no amplía permisos.
- activity/follow-up DB connection added where supported: **no se conectó.**
  `src/server/crm` expone actividades solo como lectura anidada dentro de
  `getCustomerFileDetail`; no existe `listActivities(scope)` ni ninguna acción
  de escritura sobre `Activity`. Construirlas quedaría fuera del alcance de este
  parche, así que `/panel/actividades` sigue 100% sobre el servicio local. Ver
  "siguiente parche".
- legacy localStorage fallback preserved: `CustomerFilesList`, `CreditsPanel`,
  `customer-file-quote-panel`, `customer-file-documents-panel` y
  `customer-file-credit-panel` permanecen intactos y siguen renderizandose
  debajo del
  divisor. `storage-keys.ts`, `quote-service.ts` y `session-bridge.tsx` sin
  cambios. Si `DATABASE_URL` no está configurado, las secciones nuevas muestran
  el aviso genérico y el flujo local sigue usable.
- technical migration wording kept hidden: los textos "Base de datos" /
  "fuente principal" solo existen tras `SHOW_TECHNICAL_LABELS`
  (`NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS`, apagado por defecto). La copy
  visible usa Registros, Proforma, Documentos, Crédito, Seguimiento.
- role-scoped access preserved: el filtro vive en el `where` de Prisma contra el
  `CustomerFile` dueño, no en la UI. Admin global, Gerente por sucursal,
  Vendedor solo sus expedientes. Cajero y Contador bloqueados por
  `canOperateExpedientes` (y por el shell). Las acciones vuelven a validar rol,
  alcance y enums, y derivan la sucursal de `customerFile.branchId`.
- document review permissions preserved: `canReview` solo oculta las opciones
  REVISADO/RECHAZADO para Vendedor; `updateExpedienteDocumentAction` las rechaza
  igualmente en el servidor.
- Customer and MotorcycleUnit separation preserved; sin exposición de costos
  (ningún DTO de este layer contiene costos de inventario).
- Caja/Contabilidad/public tracking untouched.
- UI design system preserved: `Card`, `Badge`, `Button`, `Input`, `FormSection`,
  `Field` y las utilidades de marca existentes (`brand-rule`,
  `card-header-tint`). Sin rediseño ni lenguaje visual nuevo.
- build validated: `npx prisma generate`, `npx tsc --noEmit` (limpio),
  `npm.cmd run build` (50 rutas, sin errores) y `eslint` sin hallazgos nuevos.
  Verificación contra la base real: para un expediente propio del Vendedor el
  payload devuelve proforma EMITIDA + 2 documentos (1 revisado) + crédito
  DOCUMENTACION_PENDIENTE; el mismo Vendedor obtiene `null` en un expediente de
  otra sucursal; Gerente ve el suyo y no el de otra sucursal; Admin ve todo.
  Fixtures eliminados; la base quedó como estaba.
- schema y migraciones NO modificadas en este parche (los cambios pendientes en
  `prisma/` provienen de 3.3A/3.3B, aún sin commitear).

## Patch 3.3C.1 - Activity DB actions and UI connection

Includes:
- Activity model reviewed and reused where possible: **el esquema no cambió.**
  `model Activity` ya traía `type`, `status`, `priority`, `branchId`, `userId`,
  `leadId`, `customerId`, `customerFileId`, `description`, `result`,
  `scheduledAt`, `completedAt` y timestamps, con índices en
  `[branchId, status]`, `[userId, status]` y `[scheduledAt]`. No hay campo
  `title`: el texto visible es `description` y el cierre usa `result`, igual que
  el servicio local. No se agregó ninguna columna ni migración.
- database-backed Activity DTOs, queries and actions added:
  - `src/server/crm/shared.ts` (donde ya vivían `ActivityDTO` y los labels) suma
    los arrays de enum `activityTypeValues` / `activityStatusValues` /
    `activityPriorityValues`, sus type guards, `resolvedActivityStatuses`, el DTO
    de lista `ActivityListItemDTO` (sucursal, responsable, cliente y expediente
    relacionados) y los helpers puros `isActivityOverdue` y
    `buildActivitySummary`.
  - `src/server/expedientes/queries.ts` suma `listActivities(scope, filters?)`,
    `listActivitiesForCustomerFile(scope, customerFileId)`,
    `getActivityById(scope, activityId)`, `canAccessActivity` y
    `resolveBranchIdByCode`. `getExpedienteSupport` ahora devuelve además
    `activities`.
  - `src/server/expedientes/actions.ts` suma `createActivityAction`,
    `updateActivityAction`, `completeActivityAction`, `cancelActivityAction` y
    `rescheduleActivityAction`.
- role-scoped access preserved: el filtro vive en el `where` de Prisma, no en la
  UI. Admin global; Gerente por `branchId`; Vendedor solo actividades asignadas a
  él (`userId`) o colgadas de un expediente propio (`customerFile.sellerId`) o de
  un lead asignado/creado por él. Los `filters` opcionales se combinan con `AND`
  sobre el filtro de alcance, así que nunca pueden ampliarlo.
- create/update/complete/cancel/reschedule activity actions added: todas llaman
  `requireAuth`, validan el rol con `canOperateActivities`, revalidan el alcance
  contra la actividad con `canAccessActivity`, validan los enums, sanitizan el
  texto (`sanitizeText`, 500 caracteres) y rechazan una actividad ya cerrada
  (`COMPLETADA` / `CANCELADA`). `scheduledAt` sigue siendo opcional al crear,
  conservando la regla del Parche 2.9. Cada acción hace `revalidatePath` de
  `/panel/actividades` y `/panel/expedientes`.
- branch never trusted from the client: si la actividad cuelga de un expediente,
  la sucursal sale de `customerFile.branchId`; si es una actividad suelta, sale
  de la sesión. `branchCode` del payload solo se honra para un rol global
  (Administrador), que es el único sin sucursal propia. La actividad se asigna
  siempre al usuario que la crea; no se agregó reasignación a otro vendedor.
- Cajero y Contador bloqueados de actividades comerciales por
  `canOperateActivities` (= `canOperateCrm`), tanto en la página como dentro de
  cada acción; no hay excepción de solo lectura.
- `/panel/actividades` connected to DB-backed activities: nueva sección
  `ActivitiesDbPanel` con `StatCard` de Pendientes, Vencidas, Próximas acciones y
  Completadas; formulario Registrar actividad (tipo, prioridad, descripción,
  fecha programada, expediente relacionado opcional); filtros de presentación por
  estado, tipo, prioridad y búsqueda; y por fila Completar, Cancelar y
  reprogramar. El selector de expediente solo ofrece expedientes ya dentro del
  alcance. `now` se resuelve en el servidor y se pasa al cliente para que el
  conteo de Vencidas no difiera entre el render del servidor y el del cliente.
- expediente activity/follow-up section connected: `ExpedienteSupportPanel` suma
  la sección Seguimiento con las actividades del expediente seleccionado, el
  registro de una actividad desde ese contexto (la sucursal se deriva del
  expediente en el servidor) y las acciones Completar y Cancelar.
- legacy localStorage fallback preserved: `ActivitiesPanel`,
  `activity-service.ts`, `activity-relationship-panel.tsx`, `storage-keys.ts` y
  `session-bridge.tsx` quedaron intactos y el panel local sigue renderizándose
  debajo del divisor. Si `DATABASE_URL` no está configurado, la sección nueva
  muestra el aviso genérico y el flujo local sigue usable. No se borró ninguna
  clave de `localStorage`.
- technical migration wording kept hidden: "Base de datos", "fuente principal" y
  "Temporal, pendiente de migración" solo existen tras `SHOW_TECHNICAL_LABELS`
  (`NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS`, apagado por defecto). La copy
  visible usa Actividades, Seguimiento, Próximas acciones, Vencidas, Pendientes y
  Completadas.
- UI design system preserved: `Card`, `Badge`, `Button`, `Input`, `FormSection`,
  `Field`, `EmptyState` y `StatCard` existentes. Sin rediseño ni lenguaje visual
  nuevo; `/panel/actividades` conserva el `PageHeader` del panel local.
- sin exposición de costos: ningún DTO de esta capa contiene costos de
  inventario. Customer y MotorcycleUnit siguen separados; ninguna acción crea
  Customer ni MotorcycleUnit.
- Caja/Contabilidad/public tracking untouched.
- build validated: `npx prisma generate`, `npx tsc --noEmit` (limpio),
  `npm.cmd run build` (48 rutas, sin errores) y `eslint` sin hallazgos nuevos.
  **La verificación contra la base real quedó pendiente:** el servidor PostgreSQL
  (`localhost:15432`) no estaba levantado durante este parche, así que los smoke
  checks por rol (Admin global, Gerente por sucursal, Vendedor solo su alcance,
  Cajero y Contador bloqueados) están cubiertos por el `where` de Prisma y por
  las validaciones de las acciones, pero no se ejecutaron contra datos reales. No
  se crearon fixtures.

## Patch 3.3D - Expediente full database smoke test

Includes:
- local PostgreSQL connectivity verified: `npx prisma migrate status` confirma
  base `motomas_db` en `localhost:15432`, 5 migraciones encontradas y
  `Database schema is up to date!`. No se imprimió `DATABASE_URL` ni
  `SESSION_SECRET`, no se modificó `.env` y no se reinició la base.
- Prisma migration status verified: sin migraciones pendientes; no se cambió el
  esquema en este parche. El seed ya estaba aplicado (5 usuarios, 14 sucursales),
  así que no se volvió a ejecutar `prisma db seed`.
- full expediente smoke fixtures created and cleaned up: la suite corrió contra
  las server actions reales, a través de un route handler temporal
  (`/api/smoke-3-3d`) y cookies de sesión firmadas de verdad, de modo que
  `requireAuth`, `access.ts`, las queries y las acciones se ejercitaron tal como
  en producción. Fixtures: 1 Customer `SMOKE-3-3D`, 2 Leads
  (`SMOKE-LEAD-3-3D`, `SMOKE-LEAD-3-3D-OTHER`), 6 expedientes
  (`SMOKE-EXPEDIENTE-3-3D-1..3`, `-OUT`, `-LEAD`, `-LEAD-OTHER`), proformas
  `SMOKE-QUOTE-3-3D`, actividades `SMOKE-ACTIVITY-3-3D` y una actividad de otra
  sucursal para pruebas negativas. **Resultado: 267 checks, 0 fallos.**
- Admin expediente support scope verified: 82/82. Lee y escribe expedientes de
  cualquier sucursal, incluido `-OUT` en Granada.
- Gerente branch scope verified: 81/81. Opera Plaza Inter y no alcanza `-OUT`
  (lectura `null`, escritura rechazada).
- Vendedor own-scope restrictions verified: 84/84. Alcanza sus expedientes y el
  convertido desde su lead; **no** alcanza el expediente de otra sucursal ni el
  convertido desde el lead de otro vendedor (lectura `null` y escritura
  rechazada). No puede marcar documentos REVISADO ni RECHAZADO.
- Cajero and Contador blocked from commercial expediente support: 6/6 cada uno.
  `canOperateExpedientes` y `canOperateActivities` en `false`; `saveQuoteAction`,
  `seedExpedienteChecklistAction`, `saveCreditApplicationAction` y
  `createActivityAction` devuelven "No tienes permiso para esta operación."
- quote/proforma create-update-status workflow verified: `saveQuoteAction` crea
  una sola proforma por expediente (`count === 1`), el segundo guardado
  actualiza y preserva `id` y `quoteNumber`; `saleType`, `currency`, `price`,
  `downPayment`, `termMonths` y `estimatedPayment` persisten. Transiciones
  válidas BORRADOR -> EMITIDA (sella `issuedAt`), EMITIDA -> ACEPTADA,
  EMITIDA -> VENCIDA y EMITIDA -> CANCELADA. Rechazadas: BORRADOR -> ACEPTADA,
  ACEPTADA -> VENCIDA, estado inexistente y edición de una proforma cerrada.
  `motorcycleModel` sigue siendo texto y no se creó ninguna `MotorcycleUnit`.
- document checklist idempotency and review permissions verified:
  `seedExpedienteChecklistAction` crea 5 filas y ejecutarlo dos veces no
  duplica; con `LICENCIA` y `OTRO` quedan los 7 tipos. Tipo inválido rechazado.
  Admin/Gerente marcan REVISADO y RECHAZADO y sellan `reviewedBy`/`reviewedAt`;
  el Vendedor recibe "No tienes permiso" y ningún documento queda con revisor.
  `buildDocumentProgress` coincide con el conteo manual, incluido
  `reviewedPercent`.
- credit application create-update-status workflow verified:
  `saveCreditApplicationAction` crea y actualiza un solo seguimiento por
  expediente; persisten financiera, `financingType`, monto, prima, plazo, cuota,
  moneda, requisitos pendientes y observaciones. Estados
  DOCUMENTACION_PENDIENTE -> PREAPROBADO -> APROBADO sellan `resolvedAt`, y un
  seguimiento cerrado rechaza cambios posteriores de estado; RECHAZADO
  verificado en su propio expediente. Estado inválido rechazado. No se inventó
  historial: no existe `CreditFollowUp`.
- activity create-update-complete-cancel-reschedule workflow verified:
  `createActivityAction` deriva sucursal, `customerId` y `leadId` del
  expediente y asigna la actividad al usuario que la crea;
  `listActivitiesForCustomerFile` devuelve solo las del expediente pedido;
  `updateActivityAction` cambia tipo, prioridad, descripción y fecha;
  `rescheduleActivityAction` mueve la fecha; `completeActivityAction` sella
  COMPLETADA con `completedAt` y `result`; `cancelActivityAction` sella
  CANCELADA. Una actividad cerrada rechaza completar, actualizar, reprogramar y
  cancelar de nuevo. `isActivityOverdue` y `buildActivitySummary` verificados
  contra una fecha pasada. Rechazados: tipo y prioridad inválidos, descripción
  vacía, fecha inválida y crear actividad sobre un expediente fuera de alcance.
- invalid scope and invalid transition checks verified: los `filters` de
  `listActivities` se combinan con `AND` y no amplían el alcance (filtrar por un
  expediente ajeno devuelve 0 filas para Gerente y Vendedor). Un rol con
  sucursal propia no puede colocar una actividad suelta en otra sucursal: el
  `branchCode` del payload se ignora y la actividad aterriza en su sucursal. Un
  rol global sin `branchCode` y sin expediente es rechazado.
- expediente UI routes checked with DB available: `/panel/expedientes`,
  `/panel/expedientes?expediente=<id>` (propio y ajeno), `/panel/actividades` y
  `/panel/creditos` responden 200 con Admin y con Vendedor. El HTML servido al
  Vendedor nunca contiene `SMOKE-EXPEDIENTE-3-3D-OUT`.
- fix aplicado (único bug bloqueante encontrado): `customerFileScopeFilter` en
  `src/server/expedientes/queries.ts` filtraba el modo personal solo por
  `sellerId`, mientras `listCustomerFiles` y `getCustomerFileDetail` ya
  reconocían la propiedad a través del lead. Como Gerente y Administrador pueden
  crear un expediente sin vendedor (`sellerId` opcional en
  `createExpedienteAction`), el Vendedor veía ese expediente en su listado pero
  al abrirlo no obtenía proforma, documentos, crédito ni seguimiento, y no podía
  escribir en él. El filtro ahora acepta `sellerId` **o** el lead asignado/creado
  por el vendedor, igual que el resto de la capa CRM. Se agregó la prueba
  negativa que confirma que el expediente derivado del lead de **otro** vendedor
  sigue fuera de alcance. Sin cambios de esquema, de UI ni de permisos de rol.
- no costs exposed: ningún DTO de la capa contiene costos de inventario
  (verificado sobre el payload serializado de `getExpedienteSupport`).
- Customer and MotorcycleUnit separation preserved: el conteo de
  `MotorcycleUnit` no cambió en todo el recorrido; ninguna acción creó Customer
  ni MotorcycleUnit.
- Caja/Contabilidad/public tracking untouched.
- smoke fixtures cleaned up: tras la corrida, `customers`, `leads`,
  `customerFiles`, `quotes`, `documents`, `credits` y `activities` vuelven a 0;
  `users = 5` y `branches = 14` intactos. El route handler temporal
  `/api/smoke-3-3d` y el script controlador fueron eliminados; el build final no
  los incluye.
- build validated: `npx prisma generate`, `npx tsc --noEmit` (limpio) y
  `npm.cmd run build` (48 rutas, sin errores). Esto reemplaza la nota de
  verificación pendiente del Parche 3.3C.1.

## Patch 3.4A - Caja Prisma models

Includes:
- current Caja local data model reviewed: facturas, recibos, notas de débito y
  crédito, medios de pago, abonos, retenciones y cierres por turno.
- Caja Prisma models added: `CashSession`, `CashDocument`, `CashDocumentItem`,
  `CashPayment` y `CashClosing`.
- stable enums added: `CashDocumentType`, `CashDocumentStatus`,
  `CashPaymentMethod`, `CashSessionStatus` y `CashClosingStatus`.
- branch/user/customer/sale/reservation relations prepared where appropriate;
  document numbers are unique and Caja records remain branch-scoped.
- money fields modeled with `Decimal`; optional currency fields are neutral
  because the current Caja UI does not select a currency.
- multi-branch Caja foundation prepared with practical status, cashier, date
  and document indexes.
- no independent cash movement model added: the current Caja flow does not
  record movements outside documents, payments and closing totals.
- no Caja seed data added; existing seed behavior remains unchanged.
- no Caja UI connected yet and no Caja server actions added yet.
- no Contabilidad migration performed; localStorage fallback and presentation
  bridge preserved.
- database migration `20260710052533_caja_core` created and applied without a
  reset, row deletion or changes to existing tables.
- build validated: `npx prisma generate`, `npx tsc --noEmit` and
  `npm.cmd run build` (48 routes, no errors).

## Patch 3.4B - Caja server queries and actions

Includes:
- Caja access helpers added in `src/server/auth/access.ts`:
  `canAccessCaja`, `canOperateCaja`, `canReviewCaja` and
  `getCajaScopeForUser`. Admin has global scope, Gerente has branch
  supervision/review scope, Cajero operates only their own branch/sessions, and
  Vendedor/Contador are blocked from operational Caja.
- Caja DTOs, enum values/labels, Decimal serialization, date serialization,
  text/money/quantity sanitizers and calculation helpers added in
  `src/server/caja/shared.ts`. No cost fields are exposed.
- Caja role-scoped queries added in `src/server/caja/queries.ts`:
  `getCurrentCashSession`, `listCashSessions`, `getCashSessionDetail`,
  `listCashDocuments`, `getCashDocumentDetail`, `listCashClosings`,
  `getCashClosingDetail` and `getCajaDashboardSummary`.
- all query filters are combined with the server-created scope using `AND`;
  unknown branches and blocked/missing scopes return empty/null results rather
  than widening access.
- Caja server actions added in `src/server/caja/actions.ts` for opening/closing
  sessions; creating/updating/issuing/internally cancelling documents;
  adding/updating/removing draft items and payments; preparing closings and
  reviewing closed closings.
- Caja validation and scope rules implemented: every action calls
  `requireAuth`, validates role/scope/enums/text/money/ownership, derives the
  branch from the actor/session, and revalidates Caja routes.
- branch/session ownership enforced server-side. Cajero cannot operate another
  cashier's session; closed sessions reject documents/payments; issued or
  cancelled documents reject free edits; document numbers remain unique.
- multi-write document, item-total, closing and session-close flows use Prisma
  transactions. Closing payment-method counts remain manual like the current
  UI, while invoiced totals, retentions and differences are derived from
  persisted issued documents.
- Decimal money handling preserved in Prisma writes and serialized to safe
  numbers for client DTOs; optional currency stays neutral.
- no turn/closing cancellation actions added because the current Caja UI does
  not expose those workflows. No DGI, fiscal or electronic-invoice behavior
  added.
- localStorage fallback and presentation bridge preserved; Caja UI is not
  connected yet.
- Prisma schema and migration history unchanged in Patch 3.4B; Contabilidad and
  public tracking untouched.
- build validated: `npx prisma generate`, `npx tsc --noEmit`, targeted ESLint
  and `npm.cmd run build` (48 routes, no errors).

## Patch 3.4B.1 - Caja server database smoke test

Includes:
- local PostgreSQL connectivity verified; `prisma migrate status` confirms all
  6 migrations are applied and the schema is up to date.
- isolated Caja smoke fixtures created with `SMOKE-CAJA-3-4B1` and
  `SMOKE-CASH-DOCUMENT-3-4B1` identifiers, then deleted after 51 checks.
- Admin global Caja scope verified for sessions, documents, closings, detail
  queries and dashboard summary.
- Gerente branch Caja scope verified: can supervise/review the own-branch
  closing, but branch filters for another branch return no rows.
- Cajero own-branch/session operation verified: opens one session, duplicate
  opening is rejected, own detail resolves and another session cannot be read
  or written.
- Vendedor and Contador blocked from operational Caja; their session-opening
  actions and operational access checks are rejected.
- cash session workflow verified: open/current/duplicate/close states persist;
  a closed session rejects new documents.
- cash document workflow verified for FACTURA, RECIBO, NOTA_DEBITO and
  NOTA_CREDITO: draft updates, unique number rejection, issue, internal cancel
  and immutable issued/cancelled states.
- cash item and total calculations verified: add/update/remove recalculates the
  persisted Decimal totals; invalid quantities are rejected and DTO money is
  serialized as safe numbers.
- cash payment workflow verified: add/update/remove on draft, invalid method or
  amount rejection, paid total/balance calculation and cancelled-document lock.
- cash closing workflow verified: manual payment-method counts persist; issued
  invoice and retention totals are derived from persisted documents; difference
  is calculated; Cajero cannot review and Gerente can review once closed.
- invalid scope and invalid state checks verified across session, document,
  item, payment and closing workflows.
- Caja queries verified for future UI connection: dashboard, current session,
  lists and all session/document/closing detail payloads.
- no costs exposed; localStorage fallback preserved; Caja UI not connected yet;
  Contabilidad and public tracking untouched.
- temporary authenticated smoke route and runner removed; smoke fixtures
  confirmed absent after cleanup.
- build validated: `npx prisma generate`, `npx prisma migrate status`,
  `npx tsc --noEmit` and `npm.cmd run build` (48 routes, no errors).

## Patch 3.4C - Caja UI database connection

Includes:
- Caja UI connected to the PostgreSQL-backed server layer through five
  server-rendered routes: `/panel/caja`, `/panel/caja/facturacion`,
  `/panel/caja/recibos`, `/panel/caja/notas` and `/panel/caja/cierres`.
- new `getCajaPageContext` server helper resolves role, Caja scope, branch and
  availability once per route; no route trusts a client-side filter.
- Caja dashboard connected to the DB summary, current turno, recent documents
  and closing status, with payment-method breakdown and quick actions.
- Facturación connected to DB documents, items, payments and actions: draft
  creation, item add/update/remove with recalculated totals, payment
  add/update/remove, issue and internal cancellation with reason.
- Recibos connected to DB documents, payments and actions with visible total,
  paid total and balance.
- Notas connected to the DB debit/credit note actions; notes register no direct
  payments and no items, matching the server rules.
- Cierres connected to the DB closing workflow: manual counted totals per
  payment method, derived invoiced and retention totals, calculated difference,
  turno closing and supervision review.
- Admin/Gerente supervision and Cajero operation preserved: operating controls
  render only for Admin and Cajero, review only for Admin and Gerente, and every
  mutation re-checks role and scope inside its server action.
- Vendedor and Contador blocked from operational Caja; the database-backed
  section does not render for them.
- document writes offered only while the document's own turno is open, mirroring
  the server rules for closed turnos and issued/cancelled documents.
- a global role picks the branch when opening a turno and the turno when several
  are open in scope.
- legacy localStorage fallback preserved: `CashierPanel`, its localStorage
  services and keys, the SessionBridge and the presentation bridge are unchanged
  and still render below every Caja route.
- technical migration wording kept hidden behind
  `NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS`; the default copy reads Caja,
  Turno, Documentos, Facturación, Recibos, Notas, Cierres, Operación,
  Supervisión and Historial.
- UI design system preserved: PageHeader, Card, Button, Badge, Input, Field,
  FormSection, EmptyState and StatCard, with no visual redesign.
- Prisma schema, migrations, Contabilidad and public tracking untouched; no costs
  exposed.
- build validated: `npx prisma generate`, `npx tsc --noEmit`, `npx eslint` and
  `npm.cmd run build` (48 routes, no errors).

## Patch 3.4D - Caja full UI and database smoke test

Includes:
- PostgreSQL connectivity verified; `prisma migrate status` confirms all 6
  migrations are applied and the schema is up to date.
- temporary authenticated smoke route and runner exercised the connected Caja
  UI/server layer end to end: 290 checks, all passing, run through the real
  `requireAuth` path with a signed session cookie per role.
- isolated Caja smoke fixtures created with `SMOKE-CAJA-3-4D`,
  `SMOKE-CASH-SESSION-3-4D` and `SMOKE-CASH-DOCUMENT-3-4D` identifiers, then
  deleted after the run.
- Caja UI routes checked with DB enabled: `/panel/caja`,
  `/panel/caja/facturacion`, `/panel/caja/recibos`, `/panel/caja/notas` and
  `/panel/caja/cierres` return 200 for Admin, Gerente, Cajero, Vendedor and
  Contador.
- Admin global Caja supervision verified: global dashboard, turnos of both
  branches, document and closing detail, branch selection when opening a turno,
  and an unknown branch code rejected.
- Gerente branch Caja supervision verified: supervises its own branch turno,
  documents and closings, reviews a closed closing, and cannot open a turno or
  create documents.
- Cajero own-branch/session operation verified: opens a turno, creates
  documents, adds/updates/removes items and payments, issues documents, prepares
  a closing and closes the turno; cannot review its own closing.
- Vendedor and Contador blocked from operational Caja: no connected section
  renders, scope resolves to none, and their session/document/review actions are
  rejected.
- Caja dashboard DB behavior verified: open turno card, payment-method
  breakdown, recent documents, closing status, quick actions pointing at the
  Caja routes, supervision copy for Admin/Gerente and operational copy for
  Cajero.
- Facturación DB workflow verified: draft creation with FAC-CJA numbering, item
  add/update/remove recalculating the persisted subtotal, retention update,
  payment add/update/remove, issue, and issued documents rejecting item, payment
  and edit writes.
- Recibos DB workflow verified: ROC-CJA numbering, items rejected, payments and
  balance correct, issue, internal cancellation with reason, and cancelled
  documents rejecting payments and a second cancellation.
- Notas DB workflow verified: ND-CJA and NC-CJA numbering, direct payments and
  items rejected, creation with inline payments rejected, issue and totals
  persisted.
- Cierres DB workflow verified: manual counted totals persist, invoiced total
  (4365) and retention total (135) derive from issued documents, difference
  (-865) is calculated, pending drafts block closing the turno, the turno closes
  and a closed turno rejects new documents.
- invalid scope and invalid state checks verified: duplicate turno rejected,
  unknown branch rejected, branch filters cannot widen access for Cajero or
  Gerente, a Cajero cannot read, operate or close another cashier's turno, and
  an already-reviewed closing rejects a second review.
- invalid input checks verified: zero quantity, negative amount, unknown payment
  method, payments above the document total and a blank cancellation reason are
  all rejected.
- technical migration wording kept hidden: the five routes render no "Base de
  datos", "localStorage", "pendiente de migración", "Temporal", "fuente
  principal", "sesión demo" or "(BD)" by default, and the same labels reappear
  with NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS=true.
- legacy localStorage fallback preserved: the legacy Caja panel still mounts
  below every route, the legacy divider shows only where the connected section
  renders, and no localStorage key, service or SessionBridge was touched.
- no source changes were needed: the two initial smoke failures were assertion
  bugs in the temporary runner (the legacy panel resolves its session on the
  client, and React splits `Turno {estado}` into two text nodes), not defects in
  the application.
- smoke fixtures cleaned up: Caja tables back to zero rows; seed users (5),
  branches (14), catalog, inventory, sales and reservations untouched.
- temporary smoke route and runner removed; a leftover empty
  `src/app/api/smoke-caja-3-4b1` directory from Patch 3.4B.1 removed as well.
- Prisma schema, migrations, Contabilidad and public tracking untouched; no
  costs exposed; no dependencies installed; `.env` unmodified.
- build validated: `npx prisma generate`, `npx prisma migrate status`,
  `npx tsc --noEmit` and `npm.cmd run build` (48 routes, no errors).

## Patch 3.5A - Contabilidad Prisma models

Includes:
- current Contabilidad local data model reviewed: the panel persists eleven
  localStorage collections (asientos, comprobantes, documentos, gastos,
  planilla, inventario contable, plan de cuentas, bancos, conciliaciones,
  cierres, terceros); "reportes" is derived output, not a stored collection.
- Contabilidad Prisma models added: ChartAccount, ThirdParty,
  AccountingDocument, JournalEntry, JournalEntryLine, AccountingVoucher,
  Expense, PayrollRecord, AccountingInventoryCost, BankAccount,
  BankReconciliation and AccountingClosing (12 tables).
- stable accounting enums added, mirroring the current Spanish states:
  AccountingDocumentType, AccountingDocumentStatus, AccountingDocumentOrigin,
  JournalEntryStatus, JournalEntrySource, AccountType, AccountNature,
  VoucherType, VoucherStatus, ExpenseCategory, ExpenseStatus,
  BankReconciliationStatus, AccountingClosingStatus, ThirdPartyType and
  PayrollStatus (15 enums). Chart-account and bank-account "Activa/Inactiva"
  reuse the existing `isActive` boolean convention rather than a new enum.
- branch/user/review relations prepared: branchId on every branch-scoped model
  plus createdById, and reviewedById / postedById / reconciledById /
  cancelledById / closedById where the current flow already records them. No
  access logic is implemented in this patch.
- Caja integration readiness prepared: AccountingDocument carries nullable
  cashDocumentId, cashClosingId, saleId, reservationId, customerId and
  thirdPartyId, plus an `origin` of CAJA or CONTABILIDAD. Nothing is required,
  so no circular dependency is introduced and Caja behavior is unchanged.
- double-entry accounting foundation prepared: JournalEntry (header) plus
  JournalEntryLine (accountId, debit, credit, position). The current panel keeps
  one flat row per asiento, which maps to one entry holding one line; the split
  lets a later patch record a real multi-line asiento without reshaping the
  table. Balance is deliberately NOT enforced at schema level.
- money fields modeled with Decimal(12,2) throughout; no float is used for
  stored money. Optional `currency` preserved where the current UI carries it.
- practical indexes added: branchId+status, date/period columns, createdBy and
  reviewedBy where useful, unique account code, unique document/voucher/entry
  numbers, unique (branchId, period) closing and unique (branchId, modelSlug)
  inventory cost.
- AccountingInventoryCost is the only model that stores an acquisition cost, by
  design: it belongs to Contabilidad and the commercial/inventory models still
  hold no cost columns. Cost visibility remains an Admin/Contador server-layer
  concern for a later patch.
- intentionally not modeled: BankTransaction (the current panel has no bank
  statement ledger or imported transaction feed), PayrollRun/PayrollItem (the
  current planilla is a flat per-employee, per-period record with no run
  concept), a Report entity (reports are derived), and ThirdParty
  `saldoRelacionado`/`documentosAsociados` (derived aggregates).
- no Contabilidad UI connected yet; no Contabilidad server queries or actions
  added yet; no public tracking migration performed.
- localStorage fallback preserved: the legacy accounting panel, its services and
  its storage keys are untouched; auth, roles and Caja behavior unchanged.
- database migration applied: `20260710070202_contabilidad_core`, additive only
  (12 CREATE TABLE, 15 CREATE TYPE, 47 indexes, 41 ADD CONSTRAINT; no DROP,
  DELETE or TRUNCATE). Existing rows verified intact afterwards (5 users, 14
  branches, 13 catalog models, 3 units) and every new table is empty — no seed
  changes were made.
- build validated: `npx prisma format`, `npx prisma validate`,
  `npx prisma migrate dev --name contabilidad_core`, `npx tsc --noEmit` and
  `npm.cmd run build` (48 routes, no errors).

## Patch 3.5B - Contabilidad server queries and actions

Includes:
- Contabilidad access helpers added to `src/server/auth/access.ts`:
  `canAccessContabilidad`, `canOperateContabilidad`, `canReviewContabilidad`,
  `canViewAccountingLedger`, `canViewAccountingCosts` and
  `getContabilidadScopeForUser` with a `ContabilidadScope` of `global`,
  `branchReadOnly` or `none`. No existing role permission was changed.
- cost visibility follows ROLES.md, not a blanket Admin/Contador rule: "Contador
  ve costos globales. Administrador ve costos globales. Gerente ve costos solo de
  su sucursal. Vendedor no ve costos." `canViewAccountingCosts` therefore
  delegates to the existing `canViewCosts`, and a Gerente reads the valued
  inventory of their own branch. Writing a cost still requires cost visibility
  AND write access, which is Admin/Contador only. Cajero and Vendedor never see
  a cost.
- ledger separation enforced server-side: chart of accounts, third parties,
  documents, journals, vouchers, expenses, payroll, banks, reconciliations and
  closings are `global`-scope only, per ROLES.md "los diarios, comprobantes y
  documentos globales quedan reservados para Contador y Administrador". A
  Gerente reads none of them; only valued inventory and the dashboard summary
  accept a branch-scoped reader.
- Contabilidad DTOs, enum value arrays, type guards, Spanish labels, Decimal and
  date serialization helpers, text sanitizers, money/period validators and
  calculation helpers added in `src/server/contabilidad/shared.ts`.
  `AccountingInventoryCostDTO` is the only cost-bearing DTO and is built by a
  single serializer; every other DTO is cost-free by construction.
- Contabilidad role-scoped queries added in `src/server/contabilidad/queries.ts`:
  dashboard summary plus list/detail for chart accounts, third parties,
  documents, journal entries, vouchers, expenses, payroll, inventory costs, bank
  accounts, reconciliations and closings. Every optional client filter is ANDed
  with the server scope; an unknown branch or a blocked scope yields no rows.
  The cost queries take an explicit `allowCosts` flag so the decision cannot be
  skipped at the call site.
- Contabilidad server actions added in `src/server/contabilidad/actions.ts` (33):
  chart accounts (create/update/deactivate), third parties
  (create/update/deactivate), documents (create/update/issue/review/post/
  reconcile/cancel), journal entries (create/update/post/reconcile/cancel plus
  line add/update/remove), vouchers (create/update/reconcile/cancel), expenses
  (create/update/review), payroll (create/update/prepare/markPaid), inventory
  costs (create/update), bank accounts (create/update/deactivate),
  reconciliations (create/update/review/cancel) and closings
  (create/review/close/reopen).
- validation and scope rules implemented: every action calls `requireAuth`,
  re-checks the Contabilidad role, validates enum values, sanitizes text,
  validates Decimal-safe money, validates dates and `AAAA-MM` periods, resolves
  the branch from a validated code rather than trusting the client, and
  revalidates the thirteen Contabilidad routes.
- accounting business rules implemented: a document always starts as BORRADOR;
  "contabilizar requiere revisión previa" and "conciliar requiere contabilización
  previa"; posted, reconciled and cancelled records reject free edits;
  cancellation requires a reason and is internal, never fiscal; a closed period
  is frozen until explicitly reopened with a reason.
- journal debit/credit calculation prepared: totals, difference and balance are
  derived from the lines. A draft asiento may be unbalanced (mirroring the
  current panel, which flags but never blocks an unbalanced row) while posting
  requires at least one line and debit == credit, compared as Decimal.
- reconciliation and closing calculations prepared: the reconciliation status is
  derived, never client-supplied — a movement matching its linked document total
  becomes CONCILIADO, otherwise DIFERENCIA. The closing difference is derived as
  cash minus income. Reports remain derived from persisted records; no report
  entity exists.
- Caja integration readiness preserved: `listCajaLinkedAccountingDocuments` and a
  `linkedToCaja` document filter read the optional cashDocument/cashClosing/
  sale/reservation/customer references. Nothing imports or mutates a Caja record
  and Caja behavior is unchanged.
- intentionally not added, because the current model has no such workflow:
  voucher "approve", expense "approve/reject/cancel", payroll "approve", and
  `deactivateAccountingInventoryCostAction` (the model has no `isActive`).
- temporary authenticated smoke route and runner exercised the layer against
  real PostgreSQL: 168 checks, all passing, run through the real `requireAuth`
  path with a signed session cookie per role. Verified Contador and Admin global
  execution, Gerente branch-read-only with cost access but no ledger access,
  Cajero and Vendedor fully blocked, cost writes blocked for every non
  Admin/Contador role, derived totals (document 11000, expense 1120, payroll net
  22000, journal balance 0, reconciliation difference -500, closing difference
  -500), and rejection of invalid enums, money, periods, scopes and state
  transitions. Fixtures cleaned up; all twelve Contabilidad tables back to zero
  rows; users, branches, Caja and inventory untouched. Route and runner removed.
- localStorage fallback preserved: the legacy accounting panel, its services and
  its storage keys are untouched; the Contabilidad UI is not connected and no
  action is imported by it.
- no Prisma schema change was needed; no migration was run; public tracking
  untouched; no dependency installed; `.env` unmodified.
- build validated: `npx prisma generate`, `npx tsc --noEmit`, `npx eslint` and
  `npm.cmd run build` (48 routes, no errors).

## Patch 3.5C - Contabilidad UI database connection

Includes:
- Contabilidad UI connected to the PostgreSQL-backed server layer (Patch 3.5B).
  The connection is additive: every one of the thirteen `/panel/contabilidad`
  routes now renders a database-backed panel above the untouched legacy
  localStorage panel, separated by the shared `LegacySectionDivider`.
- Contabilidad page context/scope helper added in
  `src/server/contabilidad/context.ts` (`getContabilidadPageContext`), mirroring
  `getCajaPageContext`. It resolves session, role, `ContabilidadScope`, branch,
  `dbConfigured`, `enabled`, and the access flags `canAccess`, `canOperate`,
  `canReview`, `canViewLedger` and `canViewCosts`. `enabled` gates the
  database-backed panels; no route trusts a client-side filter and every query
  re-applies the resolved scope.
- new client module `src/features/operations/modules/contabilidad-db/` with a
  shared toolkit (`useContaRunner`, scope chip, totals, formatters, status-tone
  helpers, branch select, ledger-restricted notice, `ContaSectionCard`) and one
  panel per section. Panels never enforce permissions themselves: every mutation
  goes through a server action that re-checks role and scope.
- dashboard/reportes connected to `getContabilidadDashboardSummary`
  (`/panel/contabilidad` and `/panel/contabilidad/reportes`). Every figure is
  derived from persisted records — document counts, journal debit/credit/
  difference, expense and payroll totals, bank balance, reconciliation and
  closing status. Inventory cost total shows only when the reader may view
  costs. No report entity was added; reports stay derived.
- Plan de cuentas (`catalogo-cuentas`) connected to `listChartAccounts`,
  `createChartAccountAction` and `deactivateChartAccountAction`. Global by design
  (chart of accounts is not branch-scoped); code, name, type, nature, parent and
  active/inactive behavior preserved.
- Terceros connected to `listThirdParties`, `createThirdPartyAction` and
  `deactivateThirdPartyAction`, scoped by branch. No tax/fiscal behavior invented.
- Documentos contables connected to `listAccountingDocuments` and the full
  lifecycle: `create`, `issue`, `review`, `post`, `reconcile` and `cancel`
  actions. The UI honors the server rules — BORRADOR first, review before
  posting, posting before reconciliation, and internal cancellation with a
  required reason. The document total is previewed with the same
  `calculateAccountingDocumentTotal` the server applies.
- Asientos connected to `listJournalEntries`/`getJournalEntryDetail` and the
  create, add/remove line, `post`, `reconcile` and `cancel` actions. Debit,
  credit and difference come from the persisted lines; drafts may be unbalanced
  and are flagged; posting is offered only while balanced rules are enforced
  server-side. Line accounts come from the active chart of accounts.
- Comprobantes connected to `listAccountingVouchers`,
  `createAccountingVoucherAction`, `reconcileAccountingVoucherAction` and
  `cancelAccountingVoucherAction`. No approval flow added.
- Gastos connected to `listExpenses`, `createExpenseAction` and
  `reviewExpenseAction`, with the total previewed via `calculateExpenseTotal`.
  No approve/reject/cancel invented.
- Planilla connected to `listPayrollRecords`, `createPayrollRecordAction`,
  `preparePayrollRecordAction` and `markPayrollRecordPaidAction`. Flat record
  model preserved; net pay previewed via `calculatePayrollNetPay`; no payroll
  tax rule invented.
- Inventario contable connected to `listAccountingInventoryCosts` and
  `createAccountingInventoryCostAction` with the cost-visibility rules of 3.5B
  intact: Admin and Contador view/write global costs, a Gerente reads their own
  branch costs read-only, and Cajero/Vendedor never reach the section. Costs are
  exposed only in this cost-bearing panel.
- Bancos connected to `listBankAccounts`, `createBankAccountAction` and
  `deactivateBankAccountAction`. Balances manual; no banking integration or
  imported movement.
- Conciliaciones connected to `listBankReconciliations`,
  `createBankReconciliationAction`, `reviewBankReconciliationAction` and
  `cancelBankReconciliationAction`. System amount (linked document total), bank
  amount (movement), derived difference and derived status are shown; the status
  is never client-supplied.
- Cierres contables connected to `listAccountingClosings`,
  `createAccountingClosingAction`, `reviewAccountingClosingAction`,
  `closeAccountingClosingAction` and `reopenAccountingClosingAction`. A closed
  period is frozen; reopening requires a reason; the difference is previewed via
  `calculateAccountingClosingDifference`. Unsafe changes are rejected server-side.
- Caja integration readiness preserved read-only: documents carry a "Caja" badge
  and the Caja reference number when linked (`cashDocumentNumber`). Nothing
  imports or mutates a Caja record and Caja behavior is unchanged.
- role behavior preserved from 3.5B: Admin and Contador operate the whole centre
  globally; a Gerente reaches the dashboard summary and own-branch valued
  inventory but the ledger sections (documents, journals, vouchers, gastos,
  planilla, banks, reconciliations, closings, terceros) show a read-only
  "reservado para Contabilidad" notice and return no rows; Cajero and Vendedor
  never render a database-backed panel (`canAccess` is false).
- legacy localStorage fallback preserved: the legacy `AccountingPanel`, its
  `accounting-service` storage keys, the session bridge and the presentation
  bridge are untouched and still render below every DB panel. When
  `DATABASE_URL` is absent, the DB panels show an unavailable notice and the
  legacy panel keeps working.
- technical/migration wording kept hidden by default via the existing
  `SHOW_TECHNICAL_LABELS` flag; business labels (Contabilidad, Asientos,
  Comprobantes, Documentos, Gastos, Planilla, Inventario contable, Plan de
  cuentas, Bancos, Conciliaciones, Cierres, Terceros, Reportes, Supervisión,
  Revisión) are shown otherwise.
- UI design system preserved: `Card`, `Button`, `Badge`, `Input`, `Field`,
  `FormSection`, `EmptyState`, `PrimarySectionBadge` and the existing
  Contabilidad visual style. No module redesign; only data/actions connected.
- no Prisma schema change, no migration, no dependency installed, `.env`
  unmodified, public tracking untouched.
- build validated: `npx prisma generate`, `npx tsc --noEmit`, `npx eslint` and
  `npm.cmd run build` (48 routes, compiled successfully, no errors).

## Patch 3.5D - Contabilidad full UI and database smoke test

Includes:
- PostgreSQL connectivity verified: `motomas-postgres` (postgres:16) reachable at
  the configured host, `npx prisma migrate status` reports "Database schema is up
  to date!" (7 migrations applied), `npx prisma generate` and `npx tsc --noEmit`
  clean. `.env` was not modified and no secret was printed.
- a temporary authenticated smoke route and a runner exercised the connected
  Contabilidad layer against the real database through the real `requireAuth`
  path with a signed session cookie per seeded role
  (admin/contador/gerente/cajero/vendedor@motomas.local). 104 checks, all
  passing. Fixtures used the `SMOKE-3-5D` tag on branch `plaza-inter`; the route
  and runner were removed afterwards.
- Contabilidad UI routes checked with DB enabled: the thirteen `/panel/contabilidad`
  pages render. Admin/Contador render the database-backed panels; a Gerente sees
  the dashboard summary and own-branch inventario but a "reservado para
  Contabilidad" ledger notice elsewhere; Cajero and Vendedor render no
  database-backed panel. The legacy `AccountingPanel` and its
  "Registros adicionales de contabilidad" divider still render below.
- Admin global Contabilidad operation verified: full lifecycle across chart of
  accounts, terceros, documents, journals, vouchers, expenses, payroll,
  inventory costs, banks, reconciliations and closings.
- Contador global Contabilidad operation verified: create/list/deactivate chart
  account plus global dashboard summary.
- Gerente branch-read-only accounting visibility verified: ledger list queries
  (chart, documents, journals, closings) return empty; own-branch
  `AccountingInventoryCost` is readable; another branch's cost is not; the
  dashboard summary keeps ledger counters at zero while exposing the branch cost
  total; chart/cost/document writes are rejected.
- Cajero and Vendedor blocked from Contabilidad: no access, `none` scope, empty
  lists, empty summary, and every write action rejected.
- dashboard/reportes DB behavior verified: document counts, expense total (1120),
  payroll net total (21000) and inventory cost total are derived from persisted
  records; the cost total appears only for cost-viewers; no report entity exists.
- Plan de cuentas DB workflow verified: create, list, deactivate; duplicate code,
  invalid enum and blank name rejected.
- Terceros DB workflow verified: create; unknown branch and invalid type rejected.
- Documentos contables DB workflow verified: BORRADOR → issue → review → post →
  reconcile; total (9700); posting-before-review, reconcile-before-post and
  empty-reason cancellation rejected; cancellation with a reason works. Caja
  references stay read-only; no Caja record was mutated.
- Asientos DB workflow verified: create draft, add lines, balanced flag; posting
  an unbalanced entry rejected; balanced entry posts; editing a posted entry
  rejected; empty-reason cancellation rejected, reasoned cancellation works.
- Comprobantes DB workflow verified: create voucher (no approval flow).
- Gastos DB workflow verified: create, review; total (1120) reflected.
- Planilla DB workflow verified: create, prepare, mark paid; net (21000)
  reflected; paying before preparing rejected.
- Inventario contable cost-visibility workflow verified: Admin/Contador
  create/update global costs; Gerente reads own-branch cost read-only; other
  roles blocked; costs surface only in the cost-bearing section.
- Bancos DB workflow verified: create, manual balance; deactivation available.
- Conciliaciones DB workflow verified: matched movement derives CONCILIADO with
  difference 0, mismatched derives DIFERENCIA with the computed difference
  (-700); status is derived, not client-supplied; empty-reason cancel rejected.
- Cierres contables DB workflow verified: create with derived difference (-500),
  review, close (period frozen — a further review is rejected), reopen requires a
  reason; duplicate branch/period and invalid period rejected.
- invalid scope and invalid state checks verified: blocked roles cannot call
  actions; client branch filters do not widen scope; unknown branch codes,
  invalid enums, invalid money, invalid periods, blank required fields and unsafe
  state transitions are all rejected.
- technical migration wording kept hidden: the rendered Admin documentos page
  contained none of the forbidden phrases ("Base de datos", "localStorage",
  "pendiente de migración", "Temporal", "fuente principal", "sesión demo",
  "(BD)") by default.
- legacy localStorage fallback preserved: the legacy panel still renders below
  the DB sections; no localStorage key was deleted; the session bridge and
  presentation bridge are unchanged.
- smoke fixtures cleaned up: 13 tagged rows created during the run, 0 remaining
  after cleanup (verified by count). No seed user, branch, catalog, inventory,
  Caja, sale or reservation data was touched.
- only fix made was to the temporary smoke harness itself (numeric-only chart
  codes to satisfy the existing `sanitizeAccountCode` rule); no product code,
  Prisma schema, migration or Caja behavior was changed.
- final validation: `npx prisma generate`, `npx prisma migrate status`,
  `npx tsc --noEmit`, `npx eslint` (Contabilidad files clean; pre-existing
  repo-wide lint items unchanged) and `npm.cmd run build` (48 routes, compiled
  successfully, no errors). Temporary smoke route/runner removed.

## Patch 3.6A - Public portal tracking server layer

Includes:
- public portal lookup behavior reviewed: the current public tracking
  (`consultar-expediente`, `mi-credito`, `mi-reserva`, `mi-entrega`) runs on the
  localStorage `public-process-service`, keyed by lead code / expediente number /
  phone / cédula, with a nine-step public timeline and public status labels. The
  DB lead path (`createPublicLeadAction`) and the localStorage fallback are left
  untouched; no UI was connected in this patch.
- public-safe DTOs added in `src/server/portal/shared.ts`:
  `PublicLeadStatusDTO`, `PublicExpedienteStatusDTO`, `PublicCreditStatusDTO`,
  `PublicReservationStatusDTO`, `PublicDeliveryStatusDTO`,
  `PublicTimelineStepDTO` and the umbrella `PublicPortalLookupResultDTO`. Each
  exposes only public-safe values: tracking/expediente code, customer display
  name, masked phone/identification, branch public name, advisor display name
  (already shown by the current UI), a public-safe motorcycle model name, public
  status, next step, a public timeline and the last public update date.
- public input normalization and masking helpers added: `normalizeTrackingCode`,
  `normalizePhone`, `normalizeIdentification`, `maskPhone`,
  `maskIdentification`, `hasUsableVerification`, plus `buildPublicTimeline` and
  the `map*StatusToPublicStatus` functions for lead, expediente, credit,
  reservation and delivery. Delivery is derived from the sale status; no report
  or delivery entity exists.
- public queries added in `src/server/portal/queries.ts`:
  `lookupPublicPortalStatus`, `lookupPublicExpedienteStatus`,
  `lookupPublicCreditStatus`, `lookupPublicReservationStatus` and
  `lookupPublicDeliveryStatus`. A module-private `resolveVerifiedContext` loads
  the anchor by any public code (lead `trackingCode`, `fileNumber`,
  `reservationNumber` or `saleNumber`), verifies the requester and projects only
  safe primitives. Data sources are `Lead`, `Customer`, `CustomerFile`, `Quote`,
  `CreditApplication`, `Reservation`, `Sale`, `MotorcycleUnit` (model name only)
  and `Branch`. No Caja, Contabilidad or inventory-cost table is queried; no
  record is created or modified.
- a thin `src/server/portal/actions.ts` (`lookupPublicPortalStatusAction`) wraps
  the umbrella lookup as the future public form entry point; it is not imported
  by any route yet.
- lookup verification requires a public code PLUS a verification field (phone or
  identification) that must match the record's own customer or lead; lookup by
  code alone is rejected, matching the security principle for unauthenticated
  routes.
- generic not-found behavior implemented: a wrong code, a wrong phone, a missing
  verification field or an absent database all resolve to the SAME `null`
  (surfaced by the action as a single `PUBLIC_LOOKUP_NOT_FOUND` message), so a
  public caller cannot tell whether the code or the phone was wrong and cannot
  enumerate codes or numbers.
- internal notes, costs, Caja and Contabilidad data excluded; raw Prisma records
  are never returned; user emails, cuid ids, raw phone/identification, seller
  ids, audit logs and roles never cross the boundary (only masked contact fields
  and public codes do).
- public request form behavior preserved: `createPublicLeadAction` and the
  localStorage `lead-service`/`public-process-service` are unchanged; the legacy
  fallback and localStorage keys remain.
- public UI not connected yet: no portal route imports the new layer.
- a temporary public smoke route created isolated `SMOKE-3-6A` fixtures
  (customer + lead + expediente + credit application on an existing branch) and
  verified against real PostgreSQL: valid expediente lookup by code + phone,
  wrong-phone and wrong-code returning the same generic null, code-alone
  rejected, identification verification, credit lookup exposing only
  status/next-step, reservation/delivery safe defaults, and no internal field
  (email, cuid, raw phone, notes, cost, seller id) present in the serialized
  DTO. 11 checks, all passing; fixtures cleaned up (0 remaining). The route was
  removed before the final build. No `MotorcycleUnit` was created.
- no Prisma schema change, no migration, no dependency installed, `.env`
  unmodified, no existing data deleted.
- build validated: `npx prisma generate`, `npx tsc --noEmit`, `npx eslint`
  (portal files clean) and `npm.cmd run build` (48 routes, compiled
  successfully, no errors).

## Patch 3.6B - Connect consultar expediente to DB

Includes:
- `/consultar-expediente` connected to the public portal lookup server layer
  (Patch 3.6A). Only the `process` view of the shared `PublicProcessLookup`
  component is wired to the database; `/mi-credito`, `/mi-reserva` and
  `/mi-entrega` (the reservation/credit/delivery views of the same component)
  are untouched and still use the localStorage lookup only.
- the process search now calls `lookupPublicPortalStatusAction` first, passing
  the code (tracking code or expediente number) plus the phone and/or cédula the
  form already collects. A verified database result is preferred; a not-found or
  unavailable database falls through to the legacy `findPublicProcess`
  localStorage lookup, so the fallback stays fully available.
- code plus customer verification required: the database action only resolves a
  record when the code matches AND the phone or identification matches that
  record's own customer/lead. Lookup by code alone is not accepted by the
  database path (it falls back to the legacy behavior, which is unchanged).
- generic not-found behavior preserved: any database miss returns the single
  `PUBLIC_LOOKUP_NOT_FOUND` message and then the existing generic empty state is
  shown — the UI never reveals whether the code, the phone or the identification
  was the wrong part.
- public-safe expediente status rendering added via a new `DbProcessCard`: it
  renders only DTO fields — tracking code, customer display name, masked phone,
  branch public name, advisor display name, public-safe motorcycle model name,
  public status, expediente number, last public update date and the public next
  step. No raw phone/identification, internal ids, notes, emails, seller ids,
  costs, Caja or Contabilidad data reach the component.
- public timeline rendered from the DB result where available: a new
  `DbProgressLine` renders the DTO's `timeline` (done/current/pending) with the
  same nine-step visual design as the legacy progress line; step labels remain
  the customer-facing labels and no internal status leaks.
- legacy localStorage fallback preserved: `public-process-service`,
  `lead-service`, their storage keys and the other three portal views are
  unchanged; a loading state (`Buscando…`) was the only control added.
- technical migration wording kept hidden: the rendered route shows none of the
  forbidden phrases by default (verified against the served HTML).
- verified against real PostgreSQL through the exact action the form calls:
  valid code + phone renders a public result, wrong phone and wrong code return
  the same generic message, code-only is rejected, and the serialized result
  contains no raw phone, email, cuid id, seller id, `notes` or internal text. 7
  action checks plus a route 200/form/no-forbidden-wording check, all passing;
  isolated `SMOKE-3-6B` fixtures cleaned up (0 remaining); temporary route
  removed before the final build.
- `/mi-credito`, `/mi-reserva` and `/mi-entrega` untouched; no Prisma schema
  change, no migration, no dependency, `.env` unmodified, no existing data
  deleted.
- build validated: `npx prisma generate`, `npx tsc --noEmit`, `npx eslint`
  (0 errors; one pre-existing `unitStatus` warning in the untouched delivery
  view) and `npm.cmd run build` (48 routes, compiled successfully, no errors).

## Patch 3.6C - Connect mi credito to DB

Includes:
- `/mi-credito` connected to the public portal lookup server layer (Patch 3.6A).
  The shared `PublicProcessLookup` now treats both the `process` and `credit`
  views as database-backed (`dbBackedView`); `/mi-reserva` and `/mi-entrega`
  (the reservation/delivery views) remain on the localStorage lookup only.
- code plus customer verification required for the DB lookup: the credit search
  calls `lookupPublicPortalStatusAction` with the code (tracking code or
  expediente number) plus the phone and/or cédula the form collects. A verified
  database result is preferred; a not-found or unavailable database falls
  through to the legacy `findPublicProcess` localStorage lookup. Code-alone is
  not accepted by the DB path.
- generic not-found behavior preserved: any database miss returns the single
  `PUBLIC_LOOKUP_NOT_FOUND` message and the existing generic empty state — the
  UI never reveals whether the code, the phone, the identification, or the
  presence of a credit application was the differentiator.
- public-safe credit status rendering added via a new `DbCreditCard`: it renders
  only the DTO's mapped, customer-friendly credit status and next step
  (Documentación pendiente, En revisión, Preaprobado, Aprobado, Rechazado…),
  plus customer display name, public-safe motorcycle model name, branch public
  name, advisor display name and last public update date. When the verified
  record has no credit application it shows a neutral "Seguimiento de crédito
  pendiente".
- internal credit observations, pending-item text, amounts, ids, notes, emails,
  seller ids, raw phone/identification, costs, Caja and Contabilidad data are
  excluded — the credit DTO carries only the mapped status and next step, and no
  raw Prisma object crosses the boundary.
- the public credit status/timeline come from the DB DTO mapping; no raw enum
  name or internal status leaks, and no technical wording appears.
- legacy localStorage fallback preserved: `public-process-service`,
  `lead-service`, their storage keys and the reservation/delivery views are
  unchanged.
- verified against real PostgreSQL through the exact action the form calls, with
  a credit application whose `observations`, `pendingItems` and `amount` were
  deliberately populated: valid code + phone and valid code + identification
  render the mapped credit status; wrong phone and wrong code return the same
  generic message; code-only is rejected; and the serialized result contains
  none of the internal observation/pending/amount text, raw phone, email, cuid
  ids or seller id. 8 action checks plus a `/mi-credito` 200/form/no-forbidden
  check, all passing; isolated `SMOKE-3-6C` fixtures cleaned up (0 remaining);
  temporary route removed before the final build.
- `/mi-reserva` and `/mi-entrega` untouched; no Prisma schema change, no
  migration, no dependency, `.env` unmodified, no existing data deleted.
- build validated: `npx prisma generate`, `npx tsc --noEmit`, `npx eslint`
  (0 errors; one pre-existing `unitStatus` warning in the untouched delivery
  view) and `npm.cmd run build` (48 routes, compiled successfully, no errors).

## Patch 3.6D - Connect mi reserva to DB

Includes:
- `/mi-reserva` connected to the public portal lookup server layer (Patch 3.6A).
  The shared `PublicProcessLookup` now treats the `process`, `credit` and
  `reservation` views as database-backed (`dbBackedView`); `/mi-entrega` (the
  delivery view) remains on the localStorage lookup only.
- code plus customer verification required for the DB lookup: the reservation
  search calls `lookupPublicPortalStatusAction` with the code (tracking code,
  expediente number or reservation number) plus the phone and/or cédula the form
  collects. A verified database result is preferred; a not-found or unavailable
  database falls through to the legacy `findPublicProcess` localStorage lookup.
  Code-alone is not accepted by the DB path.
- generic not-found behavior preserved: any database miss returns the single
  `PUBLIC_LOOKUP_NOT_FOUND` message and the existing generic empty state — the
  UI never reveals whether the code, the phone, the identification, or the
  presence of a reservation was the differentiator.
- public-safe reservation status rendering added via a new `DbReservationCard`:
  it renders only the DTO's mapped reservation status/next step (Reserva activa,
  Reserva completada, Reserva cancelada), plus customer display name, public-safe
  motorcycle model name, branch public name, advisor display name and last
  public update date, with the public timeline via `DbProgressLine`. When the
  verified record has no reservation it shows a neutral "Aún no encontramos una
  reserva activa asociada a esta solicitud."
- internal notes, ids, raw contact data, costs, Caja, Contabilidad data and
  every motorcycle unit identifier (VIN, chassis number, engine number, unit id)
  are excluded — the DTO exposes only a public-safe `brand model` text and the
  mapped status; no raw Prisma object crosses the boundary.
- the public reservation status/timeline come from the DB DTO mapping; no raw
  enum name or internal status leaks and no technical wording appears.
- legacy localStorage fallback preserved: `public-process-service`,
  `lead-service`, their storage keys and the delivery view are unchanged.
- verified against real PostgreSQL through the exact action the form calls, with
  a temporary reservation linked to a temporary motorcycle unit carrying a real
  chassis/engine number and an internal reservation note: lookup by expediente
  number + phone, by reservation number + phone, and by code + identification all
  render "Reserva activa" with the public `SmokeBrand Modelo 150` model text;
  wrong phone and wrong code return the same generic message; code-only is
  rejected; and the serialized result contains none of the chassis, engine,
  unit id, reservation id, seller id, cuid ids, raw phone, email or internal
  note. 10 action checks plus a `/mi-reserva` 200/form/no-forbidden check, all
  passing; isolated `SMOKE-3-6D` fixtures (including the temporary unit) cleaned
  up (0 remaining); temporary route removed before the final build.
- `/mi-entrega` untouched; no Prisma schema change, no migration, no dependency,
  `.env` unmodified, no existing data deleted.
- build validated: `npx prisma generate`, `npx tsc --noEmit`, `npx eslint`
  (0 errors; one pre-existing `unitStatus` warning in the untouched delivery
  view) and `npm.cmd run build` (48 routes, compiled successfully, no errors).

## Patch 3.6E - Connect mi entrega to DB

Includes:
- `/mi-entrega` connected to the public portal lookup server layer (Patch 3.6A).
  All four public views (`process`, `credit`, `reservation`, `delivery`) are now
  database-backed (`dbBackedView` is true for every view), completing the public
  portal DB connection.
- code plus customer verification required for the DB lookup: the delivery search
  calls `lookupPublicPortalStatusAction` with the code (tracking code, expediente
  number, reservation number or sale number) plus the phone and/or cédula the
  form collects. A verified database result is preferred; a not-found or
  unavailable database falls through to the legacy `findPublicProcess`
  localStorage lookup. Code-alone is not accepted by the DB path.
- generic not-found behavior preserved: any database miss returns the single
  `PUBLIC_LOOKUP_NOT_FOUND` message and the existing generic empty state — the
  UI never reveals whether the code, the phone, the identification, or the
  presence of a sale/delivery record was the differentiator.
- public-safe delivery status rendering added via a new `DbDeliveryCard`: it
  renders only the DTO's mapped delivery status/next step (Motocicleta
  entregada, Proceso de entrega en preparación, Entrega aún no programada), plus
  customer display name, public-safe motorcycle model name, branch public name,
  advisor display name and last public update date, with the public timeline via
  `DbProgressLine`. When the verified record has no sale/delivery it shows a
  neutral "Aún no encontramos una entrega asociada a esta solicitud."
- internal notes, ids, raw contact data, costs, Caja, Contabilidad data, every
  motorcycle unit identifier (VIN, chassis number, engine number, unit id) and
  all internal sale/payment/cash details are excluded — the DTO exposes only a
  public-safe `brand model` text and the mapped status; no raw Prisma object
  crosses the boundary.
- the public delivery status/timeline come from the DB DTO mapping; no raw enum
  name or internal status leaks and no technical wording appears.
- the delivery-view `unitStatus` eslint warning was local to the touched file
  (an unused `const unitStatus` in the legacy `DeliveryCard`); it was removed
  cleanly along with the now-unused `normalizeUnitStatus` import — no unrelated
  refactor, no global lint suppression, no type weakening. The touched file is
  now eslint-clean.
- legacy localStorage fallback preserved: `public-process-service`,
  `lead-service`, their storage keys and the legacy per-view cards are unchanged.
- verified against real PostgreSQL through the exact action the form calls, with
  a temporary delivered sale linked to a temporary motorcycle unit carrying a
  real chassis/engine number and an internal sale note: lookup by expediente
  number + phone, by sale number + phone, and by code + identification all render
  "Motocicleta entregada" with the public `SmokeBrand Modelo 200` model text;
  wrong phone and wrong code return the same generic message; code-only is
  rejected; and the serialized result contains none of the chassis, engine, unit
  id, sale id, seller id, cuid ids, raw phone, email or internal note. 10 action
  checks plus a `/mi-entrega` 200/form/no-forbidden check, all passing; isolated
  `SMOKE-3-6E` fixtures (including the temporary unit and sale) cleaned up (0
  remaining); temporary route removed before the final build.
- no Prisma schema change, no migration, no dependency, `.env` unmodified, no
  existing data deleted.
- build validated: `npx prisma generate`, `npx tsc --noEmit`, `npx eslint`
  (touched portal component clean) and `npm.cmd run build` (48 routes, compiled
  successfully, no errors).

## Patch 3.6F - Public portal full DB smoke test

Includes:
- PostgreSQL connectivity, generated client and migration status verified; the
  database schema is up to date.
- all database-backed public tracking routes checked against isolated fixtures:
  `/consultar-expediente`, `/mi-credito`, `/mi-reserva` and `/mi-entrega`.
- verified code plus phone and code plus identification lookups return only the
  public DTO; expediente, credit, reservation and delivered-sale paths were
  exercised through the same public lookup action used by the portal.
- wrong code, wrong phone and code-only requests return one generic public
  not-found message. Missing credit, reservation and delivery states now use
  that same neutral message without revealing which internal record is absent.
- public timeline, status and public-number rendering verified; serialized
  results were checked for raw contact data, internal IDs, notes, credit
  amounts/pending items, sale/payment/cash data, Caja, Contabilidad and
  motorcycle unit identifiers. None are exposed.
- legacy localStorage fallback preserved and tightened for the four DB-backed
  views: it now requires a public code plus a matching phone or cédula before
  returning local data, and its displayed phone is masked. No storage keys are
  removed and technical migration wording remains hidden by default.
- `/solicitar-informacion` compatibility verified: the database lead action and
  its legacy local fallback remain wired.
- all `SMOKE-PORTAL-3-6F` fixtures and temporary smoke route/script removed
  after the test; no existing data was reset or deleted.
- no Prisma schema or migration change; `.env`, Caja, Contabilidad,
  reportes and marketing remain untouched.
- validation: `npx prisma generate`, `npx prisma migrate status`, `npx tsc
  --noEmit` and `npm.cmd run build` passed. The two touched portal files pass
  targeted `npx eslint`; the full `npx eslint` run remains blocked by 41
  pre-existing errors in unrelated operations/shared files.

## Patch 3.7A - Audit remaining localStorage operational dependencies

Includes:
- all remaining `localStorage` usage audited; 28 centralized keys and their
  consumers are classified in `docs/LOCALSTORAGE_AUDIT.md`.
- active operational dependencies identified: the migrated DB routes still
  render legacy local panels, while Marketing, Reportes and Dashboard KPIs
  remain local-first.
- safe fallback, presentation bridge and public fallback dependencies reviewed;
  public tracking keeps its verified, masked fallback and `demoSession` remains
  a compatibility bridge rather than an authorization source.
- technical wording reviewed: migration labels use the existing
  `NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS` gate; business labels remain the
  default.
- no behavior changed, no localStorage key was removed, no Prisma schema or
  migration changed, and no data was reset or deleted.
- `npx prisma generate`, `npx tsc --noEmit` and `npm.cmd run build` passed.
  The requested full `npx eslint` run reproduces the existing unrelated
  baseline (41 errors, 12 warnings); this documentation-only patch adds none.

## Patch 3.7B - Gate unsafe operational localStorage fallback

Includes:
- centralized operational legacy panel gate added via
  `shouldShowLegacyOperationalPanel` and
  `NEXT_PUBLIC_ENABLE_LEGACY_OPERATIONAL_PANELS` (off by default).
- 26 migrated DB-backed routes no longer render operational local panels by
  default: commercial/CRM, Caja and all DB-backed Contabilidad sections.
- legacy panels and their services remain available for authorized fallback
  when PostgreSQL is unavailable, or for explicit technical recovery.
- `LegacySectionDivider` remains in place; it only renders in explicit legacy
  mode and its technical wording still requires
  `NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS=true`.
- verified public tracking fallback preserved without weakening code plus
  matching phone/cédula verification or phone masking.
- `SessionBridge`, `session-service` and `motomas-demo-session-v1` preserved as
  UI compatibility only; server authorization does not consume them.
- browser-data reset service preserved, while its destructive Settings control
  is hidden by default behind `NEXT_PUBLIC_ENABLE_DEMO_DATA_RESET=true`.
- Marketing, Reportes and Dashboard KPIs remain unchanged for 3.7C; the local
  Inventory overview remains until it has a DB-backed equivalent.
- no localStorage key removed, no Prisma schema change, no migration, no DB data
  change and no `.env` modification.
- validation: `npx prisma generate`, `npx tsc --noEmit` and `npm.cmd run build`
  passed; all touched files pass targeted `npx eslint`. Full `npx eslint` still
  reports the unrelated baseline (40 errors, 11 warnings).

## Patch 3.7C.1 - Analytics, Reportes and Marketing DB server layer

- reviewed the current local-first behavior of Marketing, Reportes and the
  operations Dashboard and enumerated every KPI they compute (lead funnel by
  status/source/campaign, conversion, activities pending/overdue/completed,
  expediente/customer counts, quotes/proformas, credit statuses, document
  checklist progress, inventory availability, reservations, sales/deliveries,
  seller and branch performance, marketing campaign performance).
- added client-safe analytics DTOs in `src/server/analytics/shared.ts`
  (`DashboardSummaryDTO`, `ReportSummaryDTO`, `LeadFunnelDTO`,
  `InventorySummaryDTO`, `ReservationSalesSummaryDTO`, `CreditSummaryDTO`,
  `QuoteDocumentSummaryDTO`, `ActivitySummaryDTO`, `ExpedienteSummaryDTO`,
  `BranchPerformanceDTO`, `SellerPerformanceDTO`, `DashboardRoleContextDTO`,
  `DashboardAlertDTO`), with money serialized as plain numbers and no inventory
  cost exposed.
- added DB-backed Dashboard KPI queries in `src/server/analytics/queries.ts`
  (`getOperationsDashboardSummary`, `getDashboardRoleContext`,
  `getDashboardAlerts`, `getDashboardRecentActivity`,
  `getDashboardBranchPerformance`, `getDashboardSellerPerformance`).
- added DB-backed Reportes queries (`getCommercialReportSummary`,
  `getLeadReport`, `getInventoryReport`, `getReservationSalesReport`,
  `getActivityReport`, `getQuoteCreditDocumentReport`, `getMarketingReport`,
  `getSellerReport`, `getBranchReport`).
- added the Marketing server layer: `src/server/marketing/shared.ts` (DTOs,
  enums, labels, input type), `src/server/marketing/queries.ts`
  (`listMarketingCampaigns`, `getMarketingCampaignDetail`,
  `getMarketingCampaignPerformance`, `getMarketingSummary`) and
  `src/server/marketing/actions.ts` (`createMarketingCampaignAction`,
  `updateMarketingCampaignAction`, `archiveMarketingCampaignAction`).
- added role/scope predicates in `src/server/auth/access.ts`
  (`canViewCommercialAnalytics`, `canViewBranchPerformance`,
  `canViewSellerPerformance`, `getAnalyticsScopeForUser`, `canViewMarketing`,
  `canManageMarketing`, `getMarketingScopeForUser`, `MarketingScope`).
- no Prisma/campaign/UTM schema change was needed: the `MarketingCampaign`
  model, marketing enums and Lead UTM/campaign attribution fields already exist
  from migration `20260711010940_analytics_marketing_foundation`. No new
  migration was created and no DB data was altered.
- role-scoped aggregation is enforced in the database layer, never in the UI:
  Admin global, Gerente branch, Vendedor personal; Cajero and Contador are
  blocked from commercial analytics; Marketing is Admin-managed and
  Gerente-readable (own branch + company-wide); campaign budget is hidden from
  roles that cannot see costs; UI filters combine with scope via AND and can
  never widen it, and no client-provided branch/seller is trusted.
- localStorage is not read by any server query; the local Marketing/Reportes/
  Dashboard services and keys are untouched.
- UI is NOT connected yet and no panel was redesigned; the legacy local-first
  behavior is unchanged. 3.7C.2/3.7C.3/3.7C.4 will wire the Dashboard, Reportes
  and Marketing UIs to these queries.
- validation: `npx prisma generate`, `npx prisma validate`, `npx tsc --noEmit`
  and `npm.cmd run build` passed; new modules pass targeted `npx eslint`
  (`src/server/analytics`, `src/server/marketing`, `src/server/auth/access.ts`)
  with no errors. Full-repo `npx eslint` still reports its unrelated baseline.

## Patch 3.7C.2 - Connect Dashboard and Reportes UI to DB

- connected the Operations Dashboard to the DB-backed analytics queries:
  `/panel/dashboard` is now a server component that resolves the session, builds
  an `AnalyticsContext` and calls `getOperationsDashboardSummary`,
  `getDashboardRoleContext`, `getDashboardAlerts`, `getDashboardRecentActivity`,
  `getDashboardBranchPerformance` and `getDashboardSellerPerformance`, rendering
  the new server-fed `DashboardDbPanel`.
- connected Reportes to the DB-backed report queries: `/panel/reportes` is now a
  server component that calls `getCommercialReportSummary` (lead, inventory,
  reservation/sales, activity, quote/credit/document, marketing, seller and
  branch reports) and renders the new server-fed `ReportsDbPanel`.
- preserved the role-scoped KPIs: Admin global (summary + branch performance +
  seller performance + alerts), Gerente branch (own-branch seller performance +
  alerts), Vendedor personal; Cashier/Accountant get only their non-commercial
  header with no commercial KPIs. Reportes stays restricted to Admin/Manager;
  Seller/Cashier/Accountant see the "Reportes restringidos" card.
- localStorage is no longer the primary source for Dashboard or Reportes; the
  new panels read only DB DTOs and never touch `window`/localStorage.
- legacy fallback remains gated by the 3.7B gate: the legacy `OperationsDashboard`
  and `ReportsPanel` render only when PostgreSQL is unavailable, or under
  `NEXT_PUBLIC_ENABLE_LEGACY_OPERATIONAL_PANELS=true`; they do not render next to
  the DB panels by default.
- Reportes shows DB-backed marketing aggregates (read-only) via
  `getMarketingReport`; the Marketing UI CRUD is untouched and no marketing
  action is imported into any UI — that remains for Patch 3.7C.3.
- technical/migration wording stays hidden by default (only in code comments,
  never rendered); the legacy divider still requires
  `NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS=true`.
- no Prisma schema change, no migration, no localStorage key removed and no local
  service deleted; costs are not exposed to unauthorized roles.
- validation: `npx prisma generate`, `npx tsc --noEmit` and `npm.cmd run build`
  passed; new/changed files pass targeted `npx eslint`
  (`dashboard-db-panel.tsx`, `reports-db-panel.tsx`, the dashboard and reportes
  routes) with no errors. Full-repo `npx eslint` still reports its unrelated
  baseline.

## Patch 3.7C.3 - Connect Marketing UI to DB

- connected the Marketing UI to the DB-backed marketing layer: `/panel/marketing`
  is now a server component that resolves the session, gates to Admin/Manager,
  builds the `MarketingScope` and calls `listMarketingCampaigns`,
  `getMarketingCampaignPerformance` and `getMarketingSummary`, rendering the new
  server-fed `MarketingDbPanel`.
- connected campaign create/update/archive to the exact server actions
  `createMarketingCampaignAction`, `updateMarketingCampaignAction` and
  `archiveMarketingCampaignAction`; every mutation re-checks the Admin-only role
  server-side and re-resolves the target branch from a branch code.
- campaign list/detail fields and per-campaign performance now come from DB
  records (leads attributed by `marketingCampaignId`, converted leads, and
  reservations/sales linked by expediente → lead → campaign); no localStorage
  aggregation, with safe empty/zero states when a metric is unavailable.
- preserved the marketing role/scope rules: Admin manages globally and sees the
  budget; Manager reads own-branch + company-wide campaigns without managing;
  Seller/Cashier/Accountant see the "Marketing restringido" card. Campaign budget
  is nulled in the DTO for roles without cost visibility, and UI filters only
  narrow the already-scoped server list.
- localStorage is no longer the primary source for Marketing; the local
  `marketing-campaign-service` and `motomas-marketing-campaigns-v1` key are
  preserved only as the 3.7B-gated legacy fallback (PostgreSQL unavailable or
  `NEXT_PUBLIC_ENABLE_LEGACY_OPERATIONAL_PANELS=true`) and never render next to
  the DB panel by default.
- public form campaign compatibility preserved: `/solicitar-informacion` is
  untouched — it still captures `campaignId`/UTM from the query string (DB lead
  attribution flows through those) and resolves the cosmetic `campaignName` from
  the local list as a fallback; no public-safe DB campaign lookup was added so
  the public submission flow and its security are unchanged.
- Dashboard and Reportes UIs untouched; Caja, Contabilidad and public tracking
  routes untouched; no external ad-platform integration added.
- no Prisma schema change, no migration, no localStorage key removed and no local
  service deleted; budget/cost is not exposed to unauthorized roles.
- technical/migration wording stays hidden by default (only in code comments,
  never rendered).
- validation: `npx prisma generate`, `npx tsc --noEmit` and `npm.cmd run build`
  passed; the new panel and the marketing route pass targeted `npx eslint` with
  no errors. Full-repo `npx eslint` still reports its unrelated baseline.

## Patch 3.7C.4 - Analytics, Reportes and Marketing full smoke test

- verified PostgreSQL connectivity: `motomas_db` reachable, 8 migrations applied,
  schema up to date (`npx prisma migrate status`).
- ran an end-to-end role-scoped smoke test with a temporary two-route harness
  (`/api/smoke-3-7c4`, `/api/smoke-3-7c4-pages`) that seeded isolated
  `SMOKE-3-7C4` fixtures, exercised the real analytics/marketing query functions
  and the actual page routes per role, then cleaned up; both routes were removed
  and no new code remains in the tree.
- Dashboard verified: `/panel/dashboard` returns 200 for all five roles; Admin
  global KPIs + branch performance (14 branches) + seller performance + alerts;
  Gerente branch KPIs with Admin-only branch performance empty; Vendedor personal
  KPIs with seller performance empty; Cajero/Contador commercial analytics empty
  (blocked). DB-derived metrics confirmed for leads (status/source/campaign),
  activities, customers/expedientes, quotes, credits, documents, inventory,
  reservations, sales, branch and seller performance, alerts and recent activity.
- Reportes verified: 200 for Admin/Gerente (global vs branch scope), restricted
  card for Vendedor/Cajero/Contador; `getCommercialReportSummary` reflected with
  read-only DB-derived marketing aggregates.
- Marketing verified: 200 for all five roles; Admin manages campaigns and sees
  budget; Gerente reads company-wide campaigns read-only; Vendedor/Cajero/Contador
  restricted (scope `none`). Campaign performance from DB (attributed leads=2,
  converted=1, reservations=1, sales=1); budget hidden (`null`) when cost
  visibility is off; update→PAUSED and archive→COMPLETED reflected in the DB list.
- scope/security verified: Vendedor personal scope not widened (2 own leads vs 3
  branch leads for Gerente); Gerente cannot see cross-branch comparison;
  Cajero/Contador blocked from commercial analytics; UI filters cannot widen the
  server-enforced scope; DTOs serialize dates as strings (no raw Prisma records).
- localStorage regression verified: Dashboard/Reportes/Marketing render DB data by
  default, legacy panels do not appear (legacy markers absent in HTML) with the
  3.7B gate at its default, and no forbidden technical wording appears in any of
  the 15 role×page HTML responses; no localStorage key or local service removed.
- result: 94/94 checks passed (49 query-layer + 45 page-render); smoke fixtures
  cleaned up (0 leftover campaigns/leads/units); public form
  (`/solicitar-informacion`) left untouched and compatible.
- no source change, no Prisma schema change, no migration, no real data deleted.
- validation: `npx prisma generate`, `npx prisma migrate status` (up to date),
  `npx tsc --noEmit` and `npm.cmd run build` passed; the 3.7C analytics/marketing
  server modules and DB panels pass targeted `npx eslint` with no errors.
  Full-repo `npx eslint` still reports its unrelated baseline.

## Patch 3.7D - Final role and navigation smoke test

- verified PostgreSQL connectivity: `motomas_db` reachable, migrations applied,
  schema up to date.
- ran a final integrated role/navigation smoke test with a temporary harness
  route (`/api/smoke-3-7d`) that minted signed per-role session cookies and swept
  every internal and public route; the route was removed afterward and no new
  code or DB fixture remains.
- auth/session verified: unauthenticated requests to `/panel/*` redirect to
  `/login`; server authorization uses the signed cookie, and
  `SessionBridge`/`motomas-demo-session-v1` remain UI-compatibility mirrors only,
  never consulted by server actions or data scoping.
- Admin navigation and global scope verified: all 33 internal routes (commercial,
  operations, supervision, all Caja sections, all Contabilidad sections) return
  200 with no crash, no forbidden technical wording and no legacy-panel markers.
- Gerente branch scope, Vendedor personal scope, and Cajero/Contador restrictions
  verified via server-enforced page gates: Reportes and Marketing show the
  restricted card for Vendedor/Cajero/Contador and normal content for
  Admin/Gerente; a Cajero on `/panel/leads` gets 200 with no commercial data panel
  and no leak (`canOperateCrm` gate); Cajero/Contador dashboards show the
  non-commercial header only.
- public portal routes verified: `/`, `/catalogo`, `/motocicletas/[slug]`,
  `/solicitar-informacion`, `/consultar-expediente`, `/mi-credito`, `/mi-reserva`,
  `/mi-entrega` return 200 with no forbidden technical wording; public tracking
  security was not changed.
- legacy operational panels hidden by default (no legacy markers in HTML);
  `LegacySectionDivider` still requires `NEXT_PUBLIC_ENABLE_LEGACY_OPERATIONAL_PANELS`
  and technical labels still require `NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS`.
- SessionBridge confirmed as UI compatibility only; no localStorage key removed,
  no local service deleted, no SessionBridge removal in this patch.
- result: 131/131 checks passed; no temporary smoke artifacts, routes, test
  runners or SMOKE fixtures remain; no data reset and no schema change.
- validation: `npx prisma generate`, `npx prisma migrate status` (up to date),
  `npx tsc --noEmit` and `npm.cmd run build` passed; the 3.7C analytics/marketing
  modules, DB panels and connected routes pass targeted `npx eslint` with no
  errors. Full-repo `npx eslint` still reports its unrelated baseline.

## Patch 3.7E - Production hardening checklist

- completed a production-readiness audit (environment, feature flags, auth/session
  config, Prisma deploy/seed flow, package scripts, public/protected route
  security, logging surfaces) after the PostgreSQL migration and the 3.7D smoke.
- documented the required environment variables in `.env.example`, adding the
  three migration/hardening flags (`NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS`,
  `NEXT_PUBLIC_ENABLE_LEGACY_OPERATIONAL_PANELS`, `NEXT_PUBLIC_ENABLE_DEMO_DATA_RESET`)
  with commented, off-by-default placeholders; no secrets or real credentials
  added and `.env` untouched.
- reviewed feature-flag defaults: technical migration labels, legacy operational
  panels and the demo-data reset are all OFF by default, so with PostgreSQL
  configured there is no DB/local dual operation and no technical wording in prod.
- reviewed auth/protected routing: `/panel/:path*` is guarded by `src/proxy.ts`
  (edge) plus the server layout; login sets an httpOnly/secure cookie and logout
  deletes it; server actions and route guards use the signed cookie, never
  `motomas-demo-session-v1`; `SessionBridge` remains UI-compatibility only.
- reviewed public route security: code + phone/cédula verification, masked phone,
  generic not-found, no raw Prisma serialization and no internal ID/notes/cost/
  Caja/Contabilidad/unit-identifier leakage; `/solicitar-informacion` unchanged.
- documented the migration/deploy procedure and added two non-destructive
  convenience scripts (`prisma:deploy` = `prisma migrate deploy`, `prisma:status`
  = `prisma migrate status`); confirmed there is no `prisma reset`/force-reset
  script and none was added.
- documented seed behavior (idempotent upserts, env-gated bootstrap Admin, no
  demo users or fake inventory, warn-only on legacy demo rows) and safe-to-run
  guidance.
- documented PostgreSQL backup/restore recommendations (pre-deploy `pg_dump`,
  scheduled backups, off-server copies, restore rehearsal, UPS, retention) and
  Ubuntu/PostgreSQL server, rollback and per-role/public QA notes.
- added `docs/PRODUCTION_HARDENING_CHECKLIST.md` with the full pre-deploy,
  env, flags, migration, seed, build, smoke, backup, rollback and QA checklist.
- no business workflow changed, no new module, no Prisma schema change, no
  migration run, no data deleted; changes are documentation/configuration only.
- validation: `npx prisma generate`, `npx prisma migrate status` (up to date),
  `npx tsc --noEmit` and `npm.cmd run build` passed; touched files are clean under
  `npx eslint`. Full-repo `npx eslint` still reports its unrelated baseline.

## Patch 3.8A - Production deploy rehearsal

- production-style deploy commands reviewed: `docs/PRODUCTION_HARDENING_CHECKLIST.md`
  §6/§7 documents `npm install`, `npx prisma generate`, `npx prisma migrate deploy`,
  `npx prisma migrate status`, `npm run build` and `npm run start`; the same
  sequence is backed by the non-destructive `prisma:deploy` / `prisma:status`
  scripts in `package.json`.
- environment requirements verified against `.env.example`: `DATABASE_URL` and
  `SESSION_SECRET` are required in production; `MOTOMAS_ADMIN_*` are documented as
  first-seed only; `AUTH_DEV_FALLBACK` and the demo/migration flags are optional and
  documented as off in production. No secrets added and `.env` untouched.
- safe production flags verified in `src/shared/feature-flags.ts`: technical
  migration labels OFF, legacy operational panels OFF and demo data reset OFF unless
  the corresponding `NEXT_PUBLIC_*` variable is explicitly `"true"`. The destructive
  reset control in `/panel/configuracion` stays hidden behind `ENABLE_DEMO_DATA_RESET`,
  and `isDemoDataEnabled()` returns false when `NODE_ENV=production`.
- auth gating re-checked: the dev login fallback requires no `DATABASE_URL`, a
  non-production `NODE_ENV` and `AUTH_DEV_FALLBACK !== "false"` simultaneously; the
  session cookie is httpOnly/sameSite=lax and `secure` in production; `/panel/:path*`
  stays guarded by `src/proxy.ts`.
- no destructive scripts found in `package.json`: no `prisma migrate reset`, no
  `db push --force-reset`; `prisma:deploy`, `prisma:status` and `prisma:seed`
  (idempotent) are the only production-relevant entries. `db:setup` uses
  `migrate dev` and remains development-only.
- temporary smoke artifacts: no smoke API routes remain (`src/app/api` does not
  exist). One leftover was found and removed: `prisma/_smoke-3011c.mjs`, a tracked
  Patch 3.0.1C script that declared itself deleted-after-use and opened a real
  PrismaClient connection. It was referenced by no code or script.
- protected/public QA checklist confirmed: per-role QA (§10) and public portal QA
  (§11) remain documented in the hardening checklist, with route/permission
  coverage in `ROLES.md` and `ARCHITECTURE.md`.
- Prisma migration status verified against the real PostgreSQL database
  (`motomas_db`): `npx prisma migrate status` reports 8 migrations found and
  "Database schema is up to date", with no pending or drifted migration. No
  migration was created or applied and the database was not reset.
- risk noted (not changed here): `getSecret()` in `src/server/auth/session.ts` falls
  back silently to a hardcoded development secret when `SESSION_SECRET` is unset,
  including under `NODE_ENV=production`. Deploying without `SESSION_SECRET` would
  allow session-cookie forgery. Recommended follow-up: fail fast on missing
  `SESSION_SECRET` in production.
- no business workflow changed, no Prisma schema change, no migration run, no
  database reset and no data deleted.
- validation: `npx prisma generate`, `npx prisma migrate status` (up to date),
  `npx prisma validate`, `npx tsc --noEmit` and `npm.cmd run build` all passed.

## Patch 3.8B - Production auth secret hardening

- `SESSION_SECRET` is now required in production: `getSecret()` in
  `src/server/auth/session.ts` throws a clear configuration error under
  `NODE_ENV=production` when the variable is unset, instead of silently signing
  session cookies with the public development key.
- development fallback preserved only outside production: with no
  `NODE_ENV=production`, the built-in key keeps local development and the offline
  demo working exactly as before.
- the failure is fail-closed and loud: `verifySessionToken()` now resolves the
  secret before its `catch`, so a misconfigured production server surfaces the
  configuration error rather than masking it as an invalid token and silently
  redirecting to `/login`.
- auth cookie signing remains unchanged whenever `SESSION_SECRET` is set: same
  HMAC-SHA256 algorithm, same payload, same 8h TTL, same httpOnly / sameSite=lax /
  secure-in-production cookie. Login, logout and `/panel/:path*` verification all
  keep using the single shared secret resolver.
- the secret is never logged or printed; the thrown message names the variable
  only and `.env` was not modified.
- `.env.example` now marks `SESSION_SECRET` as required in production and warns
  that the development key is public and must not reach a deployed environment.
- `docs/PRODUCTION_HARDENING_CHECKLIST.md` (§2, §4) records that production will
  not run without `SESSION_SECRET` and that the fallback is local-development only.
- no business workflow changed, no auth role changed, no cookie security weakened,
  no Prisma schema change, no migration run, no database reset and no data deleted.
- validation: `npx prisma generate`, `npx prisma validate`, `npx prisma migrate
  status` (8 migrations, up to date), `npx tsc --noEmit` and `npm.cmd run build`
  all passed.

## Patch 3.9P-A - Portal Cliente visual audit and premium direction

- Portal Cliente visual audit completed over the eight public routes (`/`,
  `/catalogo`, `/motocicletas/[slug]`, `/solicitar-informacion`,
  `/consultar-expediente`, `/mi-credito`, `/mi-reserva`, `/mi-entrega`) and the
  portal component layer, without touching the internal `/panel`.
- diagnosis recorded: the brand navy token (`--brand-navy #12284c`) is defined in
  `globals.css` but never used — the portal renders every primary surface in stock
  Tailwind `blue-600`, which is the main source of the generic SaaS look.
- diagnosis recorded: the Home hero is light and frames the motorcycle inside a
  bordered white card, while the two cinematic assets that exist
  (`hero/background.webp`, `hero/floor.webp`) are rendered at 7% and 25% opacity
  and are effectively invisible.
- diagnosis recorded: the four customer tracking views share one component
  (`public-process-lookup.tsx`) that presents results as a grid of 6-9 label/value
  `InfoTile`s plus numbered progress boxes — a CRM record view on customer-facing
  pages, with the next step (the most valuable content) rendered last.
- diagnosis recorded: catalog data is largely empty (no model has a `category`, 15
  of ~16 have no `colors`, 13 have no `brand`, 10 have no `shortDescription` and 10
  have no `technicalSpecs`), so the current card design exposes the gaps. Per
  `PROJECT_RULES.md` §17 this must be solved with imagery-led, sparse-tolerant
  design plus a real content task — never with invented specs, colors or prices.
- diagnosis recorded: image treatment mixes transparent PNG cut-outs with JPEG
  photos on the same grid, `next/image` is used in zero portal files, and six files
  carry `no-img-element` eslint disables with raw `<img>`.
- diagnosis recorded: flat section rhythm (every block `py-14` with the same header
  cadence), orange accent spent on every CTA and eyebrow so the conversion CTA is
  no longer distinct, no loaded typeface, and two dead carousel components
  (`featured-motorcycle-carousel`, `motomas-showroom-carousel`) still in the tree.
- premium motorcycle dealership direction defined: dark cinematic hero stage over
  clean light content, deep navy primary, orange reserved for the single conversion
  CTA, staged product imagery with no card behind the bike, unified card
  radius/shadow, a typography scale and mobile rules.
- portal page priorities documented: P1 = Home hero and the four tracking views,
  P2 = catalog and model detail, P3 = request form (already the strongest page).
- patch sequence defined: 3.9P-B tokens, 3.9P-C dark hero, 3.9P-D customer status
  experience, 3.9P-E catalog/model pages, 3.9P-F `next/image` pipeline, 3.9P-G
  optional home composition; plus a parallel, non-blocking catalog content task.
- explicit no-touch list recorded: public lookup verification (code + phone/cédula),
  masked phone, generic not-found copy, public DTOs, `campaignId`/UTM capture, lead
  validation, `/panel`, `src/components/ui/*`, server, Prisma and auth.
- `docs/PORTAL_UI_POLISH_PLAN.md` added with the diagnosis, target direction, visual
  system, page-by-page and component-level recommendations, patch sequence,
  do-not-change list and a visual QA checklist.
- no source code changed, no business logic changed, no DB query, auth, Prisma or
  dependency touched. Documentation only.

## Patch 3.9P-B - Portal Cliente visual tokens and style foundation

- portal-specific visual tokens/classes added in `globals.css`, scoped to the
  public portal and without touching the `/panel` surfaces: `.portal-stage`
  (dark cinematic navy surface for future showroom bands), `.portal-muted`
  (quiet band between white sections), `.portal-card-shadow` and
  `.portal-card-shadow-elevated` (one card shadow for the whole portal),
  `.portal-rule` (navy micro-rule under headings), `.portal-timeline-surface`
  (customer progress blocks) and `.portal-section` (section rhythm). The brand
  orange is now exposed as the `brand-orange` color token.
- brand navy applied to public portal primary surfaces: `btnPrimary`, inputs and
  select focus states, icon tiles, progress steps, active navigation, badges and
  links in `ui.tsx` now use the `navy`/`navy-soft` brand tokens instead of stock
  Tailwind blue. The compiled CSS was verified to emit the `bg-navy` and
  `bg-navy/*` utilities.
- generic Tailwind blue removed from the portal: 69 `blue-*` occurrences across
  nine portal files (`public-process-lookup`, `ui`, `public-home`,
  `public-header`, `motocicletas/[slug]`, `showroom-hero`, `lead-request-form`,
  `motorcycle-public-card`, `public-footer`) were replaced with navy tokens; a
  grep for `blue-[0-9]` under the portal now returns zero results. The
  `.portal-canvas` wash also moved from Tailwind blue to brand navy.
- orange accent usage normalized: orange is now reserved for conversion CTAs
  (`btnAccent`, mobile sticky CTA, request-info hover), active indicators (nav
  underline, model strip, tracking tabs) and the next-step highlight. Decorative
  orange was retired from section header rules, hero/detail heading rules, form
  section rules, process step bars, list bullets and icon tiles, all now navy.
  The desktop and mobile-menu header CTA moved from orange to navy so the hero
  conversion CTA keeps the only orange in the first viewport.
- portal typography and spacing foundation improved: `text-balance` on portal
  h1/h2, consistent eyebrow style via `PortalBadge`, unified card border and
  shadow via `PortalCard` (with a new `elevated` variant), and a shared navy
  `iconTile` helper. System font stack unchanged; no font dependency added.
- removed the two dead, unimported carousel components superseded by the current
  hero (`featured-motorcycle-carousel.tsx`, `motomas-showroom-carousel.tsx`), as
  scoped in the polish plan.
- no full page redesign yet: hero, tracking, catalog and detail keep their
  structure; this patch changes tokens, classes and shared primitives only.
- behavior preserved: no change to public lookup verification, forms, server
  actions, DB queries, routes, slugs, fallback behavior, `campaignId`/UTM
  capture, catalog data or the internal `/panel`. No `next/image` migration in
  this patch (reserved for 3.9P-F). No visible technical wording introduced.
- validation: `npx tsc --noEmit` passed, targeted `npx eslint` on the nine
  touched portal files passed with no errors, and `npm.cmd run build` completed
  successfully.

## Patch 3.9P-C - Portal Home white premium showroom polish

- direction confirmed and documented: the Portal Cliente keeps a white/light
  premium style; the dark cinematic hero originally sketched in the polish plan
  was rejected. `docs/PORTAL_UI_POLISH_PLAN.md` now carries an explicit
  amendment so later patches do not reintroduce a dark hero; dark navy
  (`.portal-stage`) is reserved for the final CTA band only.
- public Home hero polished while preserving the white/light style: the
  showroom backdrop stays near-invisible (5% texture), soft navy/orange washes
  remain subtle, and the first viewport stays light end to end.
- motorcycle presentation improved: the bike was taken out of its bordered
  white card and now sits unboxed on a soft light platform (halo, floor
  ellipse, contact shadow) with a masked desktop-only reflection; the product
  column gained width (1fr/1.15fr grid) and a larger stage (max 660px), and the
  model caption reads directly on the surface instead of inside a card.
- CTA hierarchy improved: primary conversion stays orange
  ("Solicitar información"), "Ver catálogo" became a navy-tinted outline
  secondary, and a tertiary text link "Consulta tu proceso" toward
  `/consultar-expediente` was added so the hero also communicates online
  tracking. Model-strip chips grew slightly and use a navy active state with
  the orange underline kept as the active indicator.
- below-hero sections lightly polished: unified `portal-section` rhythm across
  trust signals, process, tools, branches and final CTA; trust grid gap
  increased; the final CTA band moved from generic `bg-slate-900` to the deep
  navy brand stage — the page's only dark surface.
- responsive behavior reviewed: the mobile headline step-down is preserved, the
  bike keeps a contained aspect stage on mobile (5/4) and desktop (4/3), CTAs
  stack on small screens, the reflection renders only on `lg` and the model
  strip keeps horizontal scroll without page overflow.
- runtime QA against the production build: `/` returns 200; the tertiary
  tracking link and navy rule render; no `bg-blue-600` and no technical wording
  (`localStorage`, `Base de datos`, `pendiente de migración`, `sesión demo`,
  `(BD)`) appear in the served HTML; `portal-stage` appears only on the final
  CTA band.
- behavior preserved: no change to routes, links, slugs, server actions, DB
  behavior, public lookup security, `campaignId`/UTM capture, catalog data or
  the internal `/panel`; no `next/image` migration in this patch.
- validation: `npx tsc --noEmit` passed, targeted `npx eslint` on
  `showroom-hero.tsx` and `public-home.tsx` passed, and `npm.cmd run build`
  completed successfully.

## Patch 3.9P-D - Portal public tracking customer experience polish

- public tracking layout polished for the four customer routes
  (`/consultar-expediente`, `/mi-credito`, `/mi-reserva`, `/mi-entrega`) by
  reworking only the shared presentation component
  (`public-process-lookup.tsx`); the lookup logic, server action calls, DTOs
  and fallback order were not modified.
- current status and next step prioritized: every result card now opens with a
  status-first header (the customer's current status as the headline, the
  verified name as context), immediately followed by the promoted next-step
  highlight — previously rendered last — and then the progress timeline.
- CRM-like InfoTile density reduced: the 6-9 equal label/value tiles per card
  became a compact "Detalles de tu consulta" reference list of quiet rows below
  the status story, and tiles duplicating the header (name, status) were
  removed. The credit and delivery cards now surface their real mapped status
  as the headline instead of a generic module title.
- timeline/progress visual improved: the grid of numbered boxes was replaced by
  a connected stepper — navy filled checks for completed steps, orange reserved
  for the current step, quiet dots for pending — horizontal on desktop and
  vertical with a left rail on mobile, with `aria-current="step"` on the active
  step. Both the database-backed and the local-fallback timelines share the new
  stepper.
- lookup forms improved: the form now reads as two labeled groups — "Tu
  solicitud" (código / expediente) and "Verificación de identidad" (teléfono /
  cédula) — with clearer helper text and security microcopy ("Tus datos se usan
  únicamente para verificar tu identidad"). The old "Basta con uno de los
  datos" line was corrected because it contradicted the code + phone/cédula
  verification requirement. Inputs, names, handlers, sanitization and the
  submit flow are unchanged.
- empty/not-found states improved: the not-found state keeps the generic
  `PUBLIC_LOOKUP_NOT_FOUND` copy (no hint about which field failed) and adds
  neutral retry guidance; the initial state copy now matches the two-step form.
- white/light premium portal style preserved: light surfaces, navy hierarchy,
  orange only on the current timeline step and the next-step highlight.
- public lookup security preserved: code + phone/cédula verification, masked
  phone, generic not-found behavior, DTO boundaries and local fallback
  verification untouched; no internal IDs, notes, costs, Caja/Contabilidad
  data or VIN/chassis/engine exposure (the legacy reservation fallback keeps
  the already-masked identifier). Only presentation changed; fewer fields are
  displayed than before, none added.
- runtime QA against the production build: all four routes return 200, render
  the grouped form and security microcopy, and contain no technical wording
  (`localStorage`, `Base de datos`, `pendiente de migración`, `sesión demo`,
  `(BD)`, `fuente principal`) and no stock `bg-blue-600`.
- no business logic changed, no server/Prisma/auth changes (verified: no file
  under `src/server` touched by this patch), no route or `/panel` changes, no
  `next/image` migration.
- validation: `npx tsc --noEmit` passed, targeted `npx eslint` on
  `public-process-lookup.tsx` passed, and `npm.cmd run build` completed
  successfully.

## Patch 3.9P-E - Portal catalog and motorcycle detail polish

- catalog page polished: stronger header with a commercial intro, the shared
  `portal-section` rhythm, a cleaner four-column grid at `xl`, and a closing
  conversion block so the grid no longer ends on nothing. White/light style and
  the model count line are preserved.
- motorcycle cards improved: larger image plate on a flat neutral tint (so the
  JPEG photos with their own backgrounds sit beside the transparent PNGs
  without looking pasted on), a soft navy radial under the bike, stronger model
  name hierarchy, whole-card click target via an overlay link on the name,
  unified portal radius/shadow, and a clearer action row — "Ver modelo" as the
  navy in-card action plus an independently clickable "Solicitar información".
  `object-contain` is retained: `object-cover` was slicing the near-square
  photos.
- sparse catalog data handled visually without inventing specs, prices, stock,
  colors or financing terms. The data was measured first: of the 15 models, all
  have exactly one image, none has a category or colors, only 2 have a brand and
  only 5 have a description or technical specs. Cards therefore treat every
  metadata slot as optional and fall back to the safe, generic line "Conoce más
  detalles con un asesor."; the brand pill renders only for the 2 models that
  have one.
- motorcycle detail page polished: the bike moved out of its bordered gradient
  card onto a light staged platform (halo, floor ellipse, contact shadow) that
  matches the Home hero language, with a larger product stage and a clear CTA
  block. For the 10 models with no technical specs, the empty spec column is
  replaced by a single honest advisor prompt instead of placeholder rows, and
  the missing description falls back to a generic invitation to consult an
  advisor — no invented content. The multi-image gallery block is kept but is
  correctly inert, since no model currently has a second photo.
- CTA hierarchy improved: the detail page leads with the orange conversion CTA
  ("Solicitar información") and a navy outline secondary ("Ver catálogo"); the
  catalog grid keeps orange out of its 15 cards and reserves it for the single
  closing conversion block.
- white/light premium portal style preserved; no dark surface added on either
  page.
- no catalog data changed, no slug changed, no route changed, no business logic,
  server action, DB query, Prisma, auth or `/panel` change; no `next/image`
  migration (reserved for Patch 3.9P-F).
- runtime QA against the production build: `/catalogo` and both a data-rich
  (`pulsar-ns400z`) and a bare (`boxer-150`) model page return 200. Verified
  against the built HTML for all 15 detail pages: the sparse fallback and the
  advisor block render on exactly the 10 bare models, "Características" renders
  on exactly the 5 models that have real specs, and there is no price, currency,
  stock, financing or technical-migration wording anywhere, and no stock
  `bg-blue-600`.
- validation: `npx tsc --noEmit` passed, targeted `npx eslint` on the catalog
  page, detail page and card passed, and `npm.cmd run build` completed
  successfully.

## Patch 3.10A-CONTADOR - Contador role audit

- CONTADOR role permissions audited: confirmed as a **full accounting operator**
  (not read-only) at every layer — access predicates, server actions, scoped
  queries, page context and UI panels.
- Contabilidad route access reviewed: all 13 subroutes reachable by CONTADOR with
  operator UI; global scope; confined to `/panel/contabilidad/*` by the shell.
- Contabilidad server actions reviewed: every mutation authorizes via
  `authorizeContabilidad(operate|review|costs)`, all of which include CONTADOR;
  authorization is server-side and branch is resolved from a validated code.
- Contabilidad UI controls reviewed: create/edit/review/post/reconcile/cancel and
  close controls render for CONTADOR (`canOperate`/`canReview`/`canViewLedger`/
  `canViewCosts` all true); no operator control hidden by mistake.
- `docs/CONTADOR_ROLE_AUDIT.md` added (summary, expected vs actual, route access
  matrix, action permission matrix, UI visibility matrix, findings by severity,
  recommended fixes, files reviewed, validation results).
- No blocking issue found; the reported "view-only" concern is unsubstantiated
  (most likely a no-`DATABASE_URL` fallback where DB panels are disabled by design).
- No business workflow changed. No Prisma schema change. No migration. No auth
  behavior change. No smoke route or fixture left behind.
- Build validated: `npx prisma generate` ok, `npx prisma validate` ok,
  `npx tsc --noEmit` ok, `npm run build` ok. `npx prisma migrate status` could not
  run (local Postgres unreachable at `localhost:15432`; environment-only).

## Patch 4.0A - Role expansion and shared function design

- Current role system audited across the full stack: Prisma `enum UserRole`, seed
  and dev users, login/session (`session.ts`, `context.ts`, `proxy.ts`), access
  predicates (`access.ts`), route guards and confinement (`operations-shell.tsx`),
  navigation, dashboards/copy (`role-copy.ts`, `demo-session-login.tsx`), server
  actions and UI panels. Documented the two-representation rule (DB `UserRoleEnum`
  <-> Spanish `OperationRole`) and the exhaustive `Record<OperationRole>` tripwires.
- Role expansion impact mapped: dependency map, complete list of files likely
  affected, per-domain server-action impact, seed impact and navigation impact.
- Shared cross-role function planning section added (recommended "Mi cuenta"
  profile/password self-service, with confined-role whitelist and identity-based
  authorization rules; alternatives noted).
- Two new role placeholders documented (`NEW_ROLE_A`/`NEW_ROLE_B`, candidates
  SUPERVISOR and LOGISTICA/BODEGA), with permission-matrix, route-access-matrix and
  test-matrix templates left fillable pending stakeholder confirmation.
- Implementation patch sequence defined (4.0B enum/type scaffolding with migration
  -> 4.0C shared function -> 4.0D/4.0E per-role permissions -> 4.0F seed/creation
  -> 4.0G full regression) plus risks and no-touch rules.
- `docs/ROLE_EXPANSION_PLAN.md` added.
- No business logic changed. No Prisma schema change. No migration. No auth,
  permission, nav or UI change.
- Build validated: `npx prisma generate` ok, `npx prisma validate` ok,
  `npx tsc --noEmit` ok, `npm run build` ok.

## Patch 4.0A.1 - Role and ticket implementation plan

- Final role decisions documented, replacing the 4.0A placeholders: NEW_ROLE_A ->
  MARKETING, NEW_ROLE_B -> SOPORTE_TECNICO, and shared function "Mi cuenta" ->
  "Tickets / Ayuda" (global help desk at /panel/ayuda*).
- Exact enum names (MARKETING, SOPORTE_TECNICO), Spanish labels (Marketing, Soporte
  Tecnico), home routes (/panel/marketing, /panel/soporte) and confinement rules
  defined; both new roles confined to their area plus /panel/ayuda*, with the
  Cajero/Contador guards to be widened for /panel/ayuda* too.
- MARKETING role scope defined: manage campaigns + reduced lead-attribution view;
  no leads/inventory/reservations/sales/Caja/Contabilidad; no costs. MVP reuses the
  existing /panel/marketing page and MarketingCampaign model.
- SOPORTE_TECNICO role scope defined: operate help desk + safe read-only diagnostics
  and technical audit; no direct commercial/financial/accounting writes, no secrets,
  no SQL, no destructive/deploy/env actions; sensitive access changes are Admin-approved.
- Global ticket/help function scope defined: one ticket system, per-role visibility
  (own / branch-operational / all), public vs internal notes separated, safe context
  auto-capture with sensitive-value masking, participants, duplicates, global
  incidents, full event audit.
- Seven-role permission matrix and route matrix drafted (existing + new predicates).
- Ticket MVP scope defined (internal only; no attachments, no public portal, no
  auto WhatsApp/email, no destructive actions) and the four Prisma models
  (SupportTicket, TicketComment, TicketParticipant, TicketEvent) plus seven enums
  documented for a later schema patch.
- Implementation sequence updated: 4.0B enum/type scaffolding (migration) -> 4.0C
  MARKETING -> 4.0D SOPORTE_TECNICO -> 4.0E ticket schema/server -> 4.0F ticket UI
  -> 4.0G support operator panel -> 4.0H public portal -> 4.1A Meta integration design.
- Meta Business API integration and in-CRM ad payment deferred to 4.1A design.
- docs/ROLE_AND_TICKET_IMPLEMENTATION_PLAN.md added.
- No code changed. No Prisma schema change. No migration. No auth, permission or UI change.
- Build validated: npx prisma generate ok, npx prisma validate ok, npx tsc --noEmit
  ok, npm run build ok.

## Patch 4.0B - Role enum and type scaffolding

- `MARKETING` and `SOPORTE_TECNICO` added to the Prisma `UserRole` enum.
- Enum-only Prisma migration `20260721222857_add_marketing_soporte_roles`
  created and applied with `npx prisma migrate dev --name
  add_marketing_soporte_roles`; no reset, destructive command or old migration
  edit was used.
- Server role enum, Spanish UI labels and both role bridge maps updated:
  `MARKETING` -> `Marketing` and `SOPORTE_TECNICO` -> `Soporte Técnico`.
- `OperationRole`, `operationRoles[]`, persisted-operation role validation and all
  exhaustive role copy/dashboard records updated.
- Default routes prepared: Marketing -> `/panel/marketing`; Soporte Técnico ->
  `/panel/soporte`. A minimal authenticated coming-soon support page prevents a
  broken default route and exposes no sensitive data or actions.
- Both new roles are confined to their prepared home areas in the shell and are
  intentionally absent from the general commercial, inventory, finance and admin
  navigation.
- No Marketing operational permissions granted yet; activation remains in Patch
  4.0C.
- No Soporte Técnico operational permissions granted yet; activation remains in
  Patch 4.0D.
- Neither role receives CRM, inventory, reservations, sales, Caja, Contabilidad,
  costs, user-management or global-scope permissions. Missing branch context for
  non-global roles now fails closed instead of widening to global scope.
- No Tickets/Ayuda implementation, ticket predicate or ticket model was added;
  that work remains in Patches 4.0E/4.0F/4.0G.
- No production or development users were added automatically. `prisma/seed.mjs`
  remains unchanged.
- No business workflow changed.
- Validation passed: `npx prisma generate`, `npx prisma validate`, `npx prisma
  migrate status` (9 migrations; database schema up to date), `npx tsc --noEmit`
  and `npm run build`. Targeted ESLint passed on the clean touched-file subset;
  the broader targeted run only reported the pre-existing React effect baseline
  in `operations-shell.tsx` / `demo-session-login.tsx` and existing dashboard
  unused-variable warnings, which were left unchanged.

## Patch 4.0C - MARKETING role activation

- MARKETING can access `/panel/marketing` and lands there by default through the
  route prepared in Patch 4.0B.
- `canViewMarketing(MARKETING)` and `canManageMarketing(MARKETING)` enabled;
  existing campaign create, update, pause, reactivate and archive/finalize actions
  now authorize MARKETING server-side.
- MARKETING navigation added only to the existing Marketing item. Shell
  confinement remains `/panel` plus `/panel/marketing*`; `/panel/ayuda*` was not
  added.
- MARKETING receives a cross-branch scope only inside the isolated Marketing
  query layer. It remains a non-global role for CRM, operations, inventory,
  finance, accounting and user data.
- Existing campaign dashboard, channel/status/branch/model filters, campaign
  performance and marketing summary analytics are reused without new routes,
  modules, tables or campaign status values.
- Campaign planning budget remains available to Admin/MARKETING campaign
  managers without granting `canViewCosts`; accounting and inventory cost access
  stays blocked.
- Added `canViewLeadAttribution` for ADMIN and MARKETING only, separate from
  `canViewCommercialAnalytics`.
- Reduced lead attribution implemented through an explicit Prisma field allow-list
  and a dedicated DTO/UI: lead code/date, campaign/channel, branch, motorcycle of
  interest, general status, derived final result and conversion date when an
  expediente creation date exists.
- The reduced DTO never selects or returns lead name, phone, cédula, email, seller,
  notes, expediente contents/documents, credit evaluations, references,
  conversations or sensitive observations. Gerente keeps aggregate marketing
  metrics but does not receive lead-level attribution rows.
- Marketing permissions remain blocked for CRM operation, lead assignment/status
  mutation, inventory, reservations, transfers, sales, Caja, Contabilidad, costs,
  user management, configuration and support.
- Authenticated PostgreSQL-backed smoke passed with tagged temporary fixtures:
  Marketing route rendered the real campaign and attribution panels; campaign
  create -> pause -> reactivate -> archive succeeded; direct lead assignment,
  lead-status update and sale creation were denied; the attribution row contained
  only the approved fields despite private fixture data. The temporary route,
  user, lead and campaign were removed and zero tagged rows remain.
- No automatic production or development user was added; `prisma/seed.mjs` is
  unchanged.
- No Meta API implementation, no ad payment implementation and no Tickets/Ayuda
  implementation.
- No Prisma schema change and no migration.
- Build validated: `npx prisma generate`, `npx prisma validate`, `npx prisma
  migrate status` (9 migrations; database schema up to date), `npx tsc --noEmit`,
  targeted ESLint and `npm run build` all passed.

## Patch 4.0D - SOPORTE_TECNICO role activation

- `SOPORTE_TECNICO` can access `/panel/soporte` and lands there by default
  through the route prepared in Patch 4.0B.
- `canOperateSupport` and `canViewTechnicalAudit` added for
  `SOPORTE_TECNICO`, with direct supervisory access for `ADMIN`.
- SOPORTE_TECNICO navigation added only to Soporte Técnico. Shell confinement
  remains `/panel` plus `/panel/soporte*`; `/panel/ayuda*` was not added.
- A support-only global scope was added and is consumed exclusively by the safe
  support query layer; SOPORTE_TECNICO remains a non-global business role.
- Safe support dashboard added with support readiness, generic database
  connectivity status, sanitized read-only technical audit summaries, safe
  diagnostic readiness and informational access-support readiness.
- Technical audit reads use an explicit field allow-list and return only mapped
  category labels, general target type, timestamp and counts. Actor data, target
  IDs and free-text descriptions are not selected or returned.
- User/access support remains request-only and informational; no password reset,
  unlock, role, session or user mutation was implemented.
- No direct commercial, inventory, reservations, transfers, sales, Caja,
  Contabilidad, cost, Marketing or user-management permissions were granted.
- No secrets, tokens, raw credentials, raw stack traces, SQL, deploy, reset,
  log deletion or destructive action is exposed.
- No Tickets/Ayuda implementation, ticket route or ticket model was added.
- No Prisma schema change and no migration.
- Authenticated database-backed smoke confirmed support access, support-only
  global scope, safe audit DTO shape and direct denial of CRM, reservations,
  sales, transfers, inventory ingress/egress, Caja, Contabilidad, Marketing and
  user-management actions. No test row or route remains.
- Build validated: `npx prisma generate`, `npx prisma validate`, `npx prisma
  migrate status` (9 migrations; database schema up to date), `npx tsc --noEmit`,
  targeted ESLint and `npm run build` all passed. The broader shell lint retains
  its pre-existing React effect baseline on untouched lines.

## Patch 4.0E - Internal ticket schema and server layer

- `SupportTicket`, `TicketComment`, `TicketParticipant` and `TicketEvent` models added.
- Ticket status, priority, impact, category, scope, comment-visibility and participant-type enums added.
- Additive Prisma migration `20260722211834_add_internal_support_tickets` created and applied without reset or destructive data changes.
- Ticket access predicates and the global / operational-branch / personal ticket scope resolver added without changing existing CRM, Caja, Contabilidad, Marketing or Support predicates.
- Best-effort sensitive-value masking added for ticket text and event metadata; passwords, tokens, secrets, database URLs, cookies, card numbers, CVV and raw stack-like lines are masked before storage.
- Collision-retried `TKT-YYYY-NNNNN` ticket code generation added; public DTOs do not use ticket database IDs.
- Internal scoped queries and strictly authorized server actions added for creation, public/internal comments, status, assignment, priority, duplicates, global incidents, reopen and own cancellation.
- Public/internal comment separation is enforced server-side; internal notes are selected only for `ADMIN` and `SOPORTE_TECNICO`.
- Ticket event audit and role-based ticket visibility are implemented server-side. Gerente branch visibility excludes other employees' personal access/security tickets.
- Closed tickets are immutable outside the explicit reopen flow. Ticket actions do not mutate CRM, inventory, commercial, Caja or accounting records.
- No `/panel/ayuda` UI yet; no `/panel/soporte/tickets` UI yet; no public `/ayuda` portal yet.
- No attachments, WhatsApp/email notifications, auto-close, satisfaction rating, Meta API or ad payments.
- Database-backed smoke validation used temporary `SMOKE-4.0E-` data and removed it after the checks; no fixture or temporary route/script remains.
- Build validated with Prisma generation/validation/status, TypeScript and the production Next.js build.

## Patch 4.0F - Internal Tickets / Ayuda UI for all roles

- `/panel/ayuda` shared overview added.
- `/panel/ayuda/nuevo-ticket` added.
- `/panel/ayuda/mis-tickets` added.
- `/panel/ayuda/tickets/[code]` added using the public ticket code instead of a database ID.
- Tickets y ayuda navigation added for all seven internal roles, together with a persistent Reportar problema action.
- Cajero, Contador, Marketing and Soporte confinement widened only for `/panel/ayuda*` while all existing blocked areas remain blocked.
- Internal ticket creation UI added with Spanish category, impact and role-aware module labels; branch context is derived from the authenticated session and technical priority remains server-derived.
- Own/participant ticket list and authorized ticket detail added through the existing scoped server queries.
- Public conversation added through the audited public-comment action; the public/internal comment split remains enforced and internal notes render only for Administrador and Soporte Tecnico when returned by the authorized DTO.
- Creator cancel/reopen controls added only for eligible states and continue to rely on server-side authorization.
- Safe event timeline added without raw metadata, private actor data, internal database IDs or hidden technical priority.
- No support operator inbox or operator controls yet; no public customer portal yet.
- No attachments, external notifications, auto-close, satisfaction rating, Meta API or ad payments.
- No Prisma schema change and no migration.
- Build validated.

## Patch 4.0F.1 - Ticket scope and route-prefix hardening

- Shared internal ticket creation now derives scope server-side and always stores `USER`.
- Client-supplied ticket scope was removed from the public creation input and is ignored by the shared server action.
- Ordinary users cannot create `BRANCH`, `MODULE` or `GLOBAL` tickets through a forged direct call; Admin and Soporte Tecnico also create `USER` tickets through this shared report action.
- Broader incident classification is deferred to authorized Patch 4.0G operator controls.
- Cajero, Contador, Marketing and Soporte Tecnico `/panel/ayuda` confinement checks are exact and segment-safe without changing their other allowed areas.
- Generated `tsconfig.tsbuildinfo` output is excluded from the patch.
- Authenticated PostgreSQL-backed scope smoke completed for all seven roles and all three forged broader scopes; creator, personal-user, Gerente, Admin, Soporte, internal-note and sensitive-masking boundaries passed, with zero tagged fixtures remaining.
- No Prisma schema change and no migration.
- Build validated.

## Patch 4.0G - Support ticket operator inbox

- `/panel/soporte/tickets` operator inbox added.
- `/panel/soporte/tickets/nuevo` added.
- `/panel/soporte/tickets/[code]` added using public ticket codes only.
- Server-filtered operator metrics, validated filters, bounded pagination and safe ticket list DTOs added.
- Operator ticket creation with authorized `USER`, `BRANCH`, `MODULE` and `GLOBAL` scope added; shared ticket creation remains `USER`-scoped.
- Ticket classification controls added with server validation and per-field audit events.
- Assignment and priority controls added with validated operators, participant updates and audit events.
- Status workflow controls added and continue to use the audited server transition table and server-controlled timestamps.
- Public response and explicitly separate internal-note workflows added; internal content remains restricted to Admin and Soporte Técnico.
- Duplicate and global-incident linking controls added with self-link, target and practical circular-chain validation; original tickets are preserved and no automatic status propagation is claimed.
- Root cause is recorded as privileged, sanitized, immutable ticket events and is excluded from the shared Ayuda DTO/UI.
- Admin supervisory access is preserved without automatic assignment.
- Non-support roles are denied server-side and receive a generic restricted operator state.
- Ticket actions remain isolated from CRM, inventory, commercial, Caja, Contabilidad, Marketing and user-management mutations.
- Authenticated PostgreSQL-backed `SMOKE-4.0G-` validation completed with 85 assertions; temporary tickets, users, route and script were removed and zero tagged fixtures remain.
- Knowledge Base publishing remains deferred; no KB model was added.
- No attachments, external notifications or public customer ticket portal were added.
- No Prisma schema change and no migration.
- Build validated.

## Patch 4.0S-A - Caja and Contabilidad operational audit

Includes:
- Caja daily operational workflow audited
- accounting invariants audited
- Caja-to-accounting integration audited
- Sales-to-accounting integration audited
- Inventory-to-accounting integration audited
- banks, reconciliation and closing audited
- financial permissions audited
- idempotency and concurrency risks audited
- production blockers classified
- finance stabilization plan created
- no business logic changed
- no Prisma schema change
- no migration
- no UI redesign
- build validated

## Patch 4.0S-B - Financial audit trail and posted-record immutability

Includes:
- append-only financial audit model added
- Caja mutations audited atomically
- Contabilidad mutations audited atomically
- posted journal entries made immutable
- CONTABILIZADO accounting documents made immutable
- direct cancellation of posted history blocked
- cancellation reasons no longer overwrite notes
- safe financial history queries added
- minimal authorized history UI added where practical
- Admin cannot bypass posted-record invariants
- no reversal engine yet
- no period lock yet
- no Caja/accounting integration yet
- no report reliability claim
- additive migration applied
- build validated

## Patch 4.0S-B1 - Financial audit schema and infrastructure

Includes:
- append-only financial audit model, atomic writer, sanitization and bounded
  authorized history query verified against the full 4.0S-B1 checklist; all of
  them were already delivered by Patch 4.0S-B and remain unchanged
- named financial-audit predicates added (canViewGlobalFinancialAudit,
  canViewAccountingAudit, canViewBranchCashAudit) and wired into the history
  query without changing any role's effective access
- no Caja or Contabilidad business behavior changed
- no reversal engine, no period lock, no automatic posting
- no schema change and no new migration in this subpatch
- SMOKE-4.0S-B1 executed against PostgreSQL through the real audit writer:
  atomic rollback, Decimal/date serialization, sensitive-value masking,
  allowlist and domain rejection, no-op suppression; 10/10 assertions passed
  and zero tagged fixtures remain
- build validated

## Patch 4.0S-C1 - Accounting period locking and active-account enforcement

Includes:
- finalized accounting closings now block postings in their effective date range
- branch and global closing scope enforced server-side
- posting validates period state inside the transaction
- AccountingDocument finalization blocked in closed periods
- inactive and non-postable accounts rejected
- journal posting revalidates all current account states
- account deactivation preserves posted history
- authorized reopen restores posting availability
- overlapping closing periods rejected where applicable (one closing per branch
  and period is a database unique constraint, so no period can overlap another)
- Admin cannot bypass financial invariants
- vouchers, expenses and payroll finalization stay outside this guard because
  they do not post to the ledger today; this is current scope, not a bypass
- no reversal engine yet
- no Caja integration yet
- no defect was found during validation, so no source fix was required and the
  implementation is committed as it was reviewed
- authenticated PostgreSQL-backed `SMOKE-4.0S-C1` validation completed with
  72/72 assertions passing against `motomas_db`, driving the real server actions
  through signed Contador and Administrador sessions: closed-period rejection on
  the first day, the last day and mid-month; identical rejection for the
  Administrador; ABIERTO, EN_REVISION and REABIERTO closings still allowing
  posting; a branch's closing not blocking another branch while a branch-less
  entry fails closed; document `CONTABILIZADO` and `CONCILIADO` and journal
  `CONCILIADO` blocked in a closed period; reopen restoring posting; inactive
  accounts rejected on line creation, line update and posting-time
  revalidation of a previously valid draft; and posted history surviving a later
  deactivation
- the whole smoke ran under the `America/Managua` (UTC-6) process timezone and
  confirmed date-only accounting inputs keep their UTC calendar month, so the
  first and last day of a closed month never shift into a neighbouring period
- Patch 4.0S-B regression re-verified inside the same run: posted entries remain
  immutable against edit, cancellation and new lines, draft cancellation is
  unchanged, a successful posting writes exactly one `JOURNAL_ENTRY_POSTED`
  event with the BORRADOR-to-CONTABILIZADO transition, and every rejected
  posting left status, lines and the audit trail untouched
- temporary smoke route and runner removed; every tagged fixture deleted, with
  chart accounts, journal entries, journal lines, accounting documents,
  accounting closings and financial audit events all back to zero rows
- `prisma validate` reports the schema valid and `prisma migrate status` reports
  the database up to date; this patch adds no schema change and no migration
- generated `next-env.d.ts` and `tsconfig.tsbuildinfo` output is excluded from
  the patch
- build validated (`npm run build` compiled successfully, 27/27 static pages)

## Patch 4.0S-C2 - Journal entry reversal engine

Includes:
- posted journal entries can be corrected only by a referenced reversal entry
- new nullable unique `JournalEntry.reversalOfId` self-relation with restrictive
  deletion on both sides, so an original has at most one reversal and neither
  side of a correction can be deleted away
- migration `20260724120000_add_journal_entry_reversal` (additive column, unique
  index and self foreign key; no data migration)
- `reverseJournalEntryAction` runs in one transaction: it locks and re-reads the
  source, checks eligibility, re-validates the period, mirrors every line with
  debit and credit swapped on the same accounts and branch, and creates the
  reversal already CONTABILIZADO
- eligibility: only CONTABILIZADO or CONCILIADO entries reverse; drafts,
  cancelled entries, missing entries, entries without lines, unbalanced or
  malformed sources and reversals of reversals are all rejected
- the original entry is never edited, re-dated, cancelled or deleted
- the period lock is evaluated against the reversal date, not the original's, so
  an entry from an already closed month stays correctable in the open period
- a reversal may reuse an account deactivated after the original was posted,
  because it must reproduce historical accounting dimensions; ordinary manual
  lines and ordinary posting keep the strict 4.0S-C1 active-account rule
- the unique `reversalOfId` is the final guard against a duplicate reversal;
  concurrent attempts leave exactly one winner and the loser receives a business
  error rather than a raw Prisma error
- two audit events per reversal, committed in the same transaction:
  `JOURNAL_ENTRY_REVERSED` on the original (naming the generated entry) and
  `JOURNAL_ENTRY_POSTED` on the reversal (naming the reversed entry)
- minimal journal UI: reversal/reverted badges, the linked entry number on both
  sides, and a "Revertir" control collecting the reversal date and an optional
  reason for eligible entries only
- Admin receives no bypass of eligibility, period lock, account or uniqueness
  invariants
- no Caja integration, no document-to-journal engine and no report reliability
  claim in this patch
- authenticated PostgreSQL-backed `SMOKE-4.0S-C2` validation completed with
  94/94 assertions passing against `motomas_db`, driving the real server actions
  through signed Contador and Administrador sessions under the `America/Managua`
  (UTC-6) process timezone: mirrored amounts to the cent, original entry and
  lines unchanged including `updatedAt`, one reversal per original, draft and
  cancelled and missing and line-less and unbalanced and malformed sources all
  rejected, no reversal chains, second attempt rejected, two concurrent attempts
  leaving exactly one reversal row with no orphan lines, reversal into a CERRADO
  period rejected on the first day and mid-month and the last day while the
  neighbouring days are accepted, ABIERTO and EN_REVISION not blocking, REABIERTO
  restoring reversal, a branch's closing not blocking another branch, branch-less
  reversals failing closed, an original from a closed historical period still
  reversible into an open period, the historical-account exception working while
  manual lines and posting still reject inactive accounts, account ids never
  substituted, and Gerente/Cajero/Vendedor/Marketing/Soporte Técnico denied
- Patch 4.0S-B and 4.0S-C1 regression re-verified inside the same run: posted
  headers, lines and direct annulment remain blocked, reconciliation and draft
  cancellation unchanged, journal queries unaffected
- temporary smoke route and runner removed; every tagged fixture deleted, with
  journal entries, journal lines, chart accounts, accounting closings, financial
  audit events, smoke users and smoke branches all back to zero rows
- `prisma validate` reports the schema valid and `prisma migrate status` reports
  the database up to date
- generated `next-env.d.ts` and `tsconfig.tsbuildinfo` output is excluded from
  the patch
- build validated (`npm run build` compiled successfully)

## Patch FF1.0 - Financial foundation (transaction helper, numbering, account mapping)

Infrastructure-only patch. It prepares the shared financial layer that the
remaining financial-core patches consume. It does NOT implement the posting
engine (FF1.4), POS, billing or treasury, and it changes no existing action,
route, permission, screen or business rule.

### Implemented changes

**1. Reusable financial transaction helper**

- `runFinancialTransaction` centralizes what every financial write repeats by
  hand today: database-configured gating, the Prisma interactive transaction,
  atomic audit writing, Prisma error translation and post-commit revalidation.
- `ctx.fail` / `ctx.ensure` reject a business rule by throwing
  `FinancialRuleError`, which rolls the transaction back. This closes a latent
  trap: returning `{ ok: false }` from inside a Prisma interactive transaction
  commits it, so a future action that writes and then rejects would otherwise
  leave partial writes committed.
- `revalidatePath` runs only after the commit, never inside the transaction.
- `describeFinancialError` maps P2002/P2003/P2025/P2034 to business messages,
  with per-constraint messages, instead of collapsing every failure into one
  generic sentence. Driver text never reaches the user.
- The helper does NOT authorize. Authorization stays in each module's
  `authorize*` function, resolved from the signed session.
- Existing Caja/Contabilidad actions were NOT rewritten. Adoption is incremental.

**2. Sequential numbering service**

- Configurable by document type (`FinancialDocumentSeries`), by branch (or
  corporate) and by fiscal year; the prefix and zero padding are stored per
  series, so a branch can carry its own prefix without a join.
- Concurrency-safe: allocation is a single atomic `next_value = next_value + 1`
  statement that takes the row lock and returns the committed value. The
  consumed value is never derived from a prior read.
- Transaction-scoped: `allocateDocumentNumber` receives the caller's transaction
  client, so a number consumed by a document creation that fails rolls back
  with it.
- Fails closed: an unconfigured or inactive series raises a rule error rather
  than falling back to a random number.
- The counter can never be rewound by a caller, and the prefix/padding of a
  series that already issued a number cannot change.
- Fiscal year resolution reads dates in UTC, matching `parseAccountingDate`, so
  a date-only accounting input cannot drift into a neighbouring year.

**3. Account mapping base infrastructure**

- Versioned rule sets: BORRADOR -> ACTIVO -> ARCHIVADO. Activation validates
  against current database state and archives the set holding the same branch
  scope in the same transaction. An active set is never edited in place; a
  correction is the next version.
- Every rule requires a debit account AND a credit account and they must differ,
  so any entry the future engine builds from a validated set is balanced by
  construction.
- An event/component matrix rejects rules that could never fire.
- `resolveAccountMapping` prefers the branch set over the corporate one and
  returns null when there is no mapping, so a future posting stops instead of
  inventing an account. It has no caller yet - it is the FF1.4 contract.
- No journal entry is generated, previewed or posted anywhere in this patch.

**4. Documentation**

- New `docs/FINANCIAL_FOUNDATION.md` with the architecture, guarantees,
  explicit non-goals, open dependencies and pending verification.
- Obsolete sections marked (never deleted) in README, ARCHITECTURE 14,
  PROJECT_RULES 4, PROJECT_AUDIT 1-12, DATABASE_PLAN, PRISMA_PLAN,
  `docs/CASH_OPERATIONAL_AUDIT.md` and `docs/ACCOUNTING_INTEGRATION_AUDIT.md`.
- ROLES.md: FF1.0 access matrix plus the correction of the Contador route list,
  incomplete since Patch 2.23.

### Modified files

New:

```txt
src/server/finance/errors.ts
src/server/finance/text.ts
src/server/finance/transaction.ts
src/server/finance/context.ts
src/server/finance/numbering/shared.ts
src/server/finance/numbering/repository.ts
src/server/finance/numbering/service.ts
src/server/finance/account-mapping/shared.ts
src/server/finance/account-mapping/repository.ts
src/server/finance/account-mapping/validation.ts
src/server/finance/account-mapping/service.ts
prisma/migrations/20260801120000_financial_foundation/migration.sql
docs/FINANCIAL_FOUNDATION.md
```

Extended (additive only):

```txt
prisma/schema.prisma                     # 3 models, 4 enums, back-relations
src/server/auth/access.ts                # 2 named predicates, no access change
src/server/financial-audit/shared.ts     # 9 actions, 3 entities, 13 field labels
src/server/financial-audit/queries.ts    # 3 entity labels
README.md ARCHITECTURE.md PROJECT_RULES.md PROJECT_AUDIT.md
DATABASE_PLAN.md PRISMA_PLAN.md ROLES.md FLOWS.md CHANGES.md
docs/FINANCE_STABILIZATION_PLAN.md
docs/CASH_OPERATIONAL_AUDIT.md
docs/ACCOUNTING_INTEGRATION_AUDIT.md
```

No existing Caja, Contabilidad, CRM, inventory, portal or ticket file was
modified.

### Database changes

Three additive tables and four enums:

- `document_sequences` - unique `(series, branch_key, fiscal_year)`.
- `account_mapping_sets` - unique `(code, version)`, unique `active_branch_key`.
- `account_mapping_rules` - unique `(set_id, event, component)`; both account
  FKs are `ON DELETE RESTRICT`.
- Enums `FinancialDocumentSeries`, `AccountMappingSetStatus`,
  `AccountingEventType`, `AccountingEventComponent`.

Migration `20260801120000_financial_foundation` contains only `CREATE TYPE`,
`CREATE TABLE`, `CREATE INDEX` and `ADD CONSTRAINT`. No destructive statement,
no data migration, no existing table, column or index altered.

### Architectural decisions

1. **`finance` is the base layer.** It may be imported by `caja` and
   `contabilidad`, never the reverse. That is why it resolves branches itself
   instead of reusing `resolveCajaBranchIdByCode`.
2. **Non-null branch key.** `branchKey` mirrors a nullable `branchId` with a
   corporate sentinel because PostgreSQL treats NULLs as distinct inside a
   unique key, which would otherwise allow duplicate corporate counters and
   duplicate corporate mapping scopes.
3. **Nullable unique instead of a partial index.** "At most one ACTIVO mapping
   set per branch scope" uses `activeBranchKey` (unique, valued only while
   active). A partial unique index would express the same rule but cannot be
   declared in the Prisma schema: it would exist only in the migration SQL and
   every later `prisma migrate dev` would treat it as drift and try to drop it.
4. **Balanced by construction.** A mapping rule stores a complete debit/credit
   pair rather than one side, so the posting engine cannot produce a one-sided
   entry out of a mapping.
5. **Corrections are versions, not edits.** An active mapping set is immutable,
   mirroring the posted-record immutability rule already enforced for journal
   entries and accounting documents.
6. **Foundation writes audit under CONTABILIDAD**, including Caja series:
   configuring a series is an accounting-administration act by Admin/Contador,
   not a cashier shift operation.
7. **No new access.** The two new predicates delegate to
   `canViewAccountingLedger` and `canOperateContabilidad`; they are named
   separately so a future change to the foundation access does not silently
   move the whole ledger with it. `authorizeFinancialFoundation` additionally
   requires a global accounting scope, so a Gerente never reaches it.
8. **Write services are plain server functions, not `"use server"` actions.**
   No UI calls them yet, and exposing unused RPC endpoints would enlarge the
   attack surface for no benefit. They are wrapped in actions by the patch that
   introduces their screen.
9. **`sanitizeFinancialText` instead of the ticket sanitizer.** The ticket
   sanitizer masks credential-like `KEY=value` text, which would corrupt a
   legitimate accounting note such as `IVA=15`. Caja and Contabilidad keep their
   byte-identical private copies for now; converging them is a behaviour-neutral
   cleanup for a later patch, not for FF1.0.

### Migration notes

- **The migration was NOT applied.** No PostgreSQL instance was reachable in the
  delivery environment (the local `motomas-postgres` Docker container was not
  running). The SQL was generated offline with `prisma migrate diff` between the
  previous and the new datamodel.
- Run on a machine with the database: `npx prisma migrate deploy`, then
  `npx prisma migrate status` to confirm the schema is up to date.
- The migration is additive and safe on a populated database: it creates new
  types and tables only. No backfill is required - the new tables start empty
  and no existing row references them.
- Existing document numbers are NOT migrated. A series numbers only the
  documents created after it is wired into a create action.
- Rollback, if ever needed, is dropping the three tables and four enums; nothing
  else depends on them yet.

### Validation performed

- `npx prisma validate`: schema valid.
- `npx prisma format`: applied.
- `npx prisma generate`: Prisma Client v6.19.3 generated.
- `npx tsc --noEmit`: clean, strict mode, zero `any` in the new code.
- `npx eslint` over `src/server/finance`, `src/server/financial-audit` and
  `src/server/auth/access.ts`: clean.
- `npm run build`: compiled successfully.
- Migration reviewed for destructive statements: none found.
- NOT performed: `prisma migrate deploy`, `prisma migrate status` and the
  database-backed `SMOKE-FF1.0`. All three require a reachable PostgreSQL
  instance.

### Pending work for FF1.1

Blocking before FF1.4 (not FF1.1, but they must start now because they are
external decisions, not code):

1. **Real chart of accounts** from the company accountant. The database still
   has zero `ChartAccount` rows, so no mapping rule can be created yet.
2. **Event/component mapping** decided and signed off by accounting.
3. **Functional currency and exchange-rate policy**, still undefined.
4. **Monetary amount on `Sale`**, required later for revenue and COGS.

Immediate FF1.1 scope (Caja cash movements and closing math):

- `openingBalance` on `CashSession`.
- New `CashMovement` model (IN/OUT: outflows, petty expenses, deposits,
  withdrawals) - additive schema change.
- Expected-per-method computed from `CashPayment` + movements, replacing the
  current `invoicedTotal` formula, which compares counted cash against issued
  FACTURA totals and therefore produces systematically wrong differences when
  receipts, partial payments or credit notes exist.
- Store expected/counted/difference per payment method on `CashClosing`.
- Explicit shortage/overage acceptance during manager review.
- Closing annul/reopen path (`CashClosingStatus.ANULADO` is currently
  unreachable).
- Adopt `runFinancialTransaction` in the Caja actions touched by this work,
  incrementally and only where they are already being modified.
- `SMOKE-FF1.0` and `SMOKE-FF1.1` executed together against PostgreSQL once the
  database is available, including concurrent number allocation, allocation
  rollback, inactive series rejection, activation with a deactivated account and
  single-active-set uniqueness.

## Patch FF1.1 - Chart of accounts foundation

Turns the existing `ChartAccount` table into a reusable enterprise chart-of-
accounts infrastructure and seeds a professional **template** catalogue for the
company accountant to review. It does NOT post, map, price or tax anything.

> Naming note: the stabilization plan numbered "Caja cash movements and closing
> math" as FF1.1. That work is NOT in this patch; it was renumbered FF1.1-B and
> is still pending. This patch is FF1.1-A. FF1.2 through FF1.6 keep their
> meaning, so no existing reference in the docs became wrong.

### Duplication check (performed before writing code)

`ChartAccount` already existed with its model, three server actions, two
queries, a route and a panel. There was exactly **one** implementation, so it
was extended — no parallel model, service or screen was created. The chart-of-
accounts vocabulary that lived in `contabilidad/shared.ts` moved down to the
finance base layer and is re-exported from its previous location, so every
existing import keeps working against a single definition.

### Implemented changes

**1. Model (additive migration `20260802120000_chart_of_accounts_foundation`)**

- New columns on `chart_accounts`: `level`, `allows_posting`, `origin`,
  `template_version`, `approved_at`, `approved_by_user_id`,
  `requires_cost_center`, `allows_branch_detail`, `effective_from`,
  `effective_to`, `archived_at`, `archived_by_user_id`.
- New enum `ChartAccountOrigin` (`PLANTILLA` / `EMPRESA`).
- Two backfills for populated catalogues: recursive level materialization and
  `allows_posting = false` for accounts that already have children.
- The tree FK moved from `ON DELETE SET NULL` to `ON DELETE RESTRICT`: deleting
  a parent would otherwise promote its whole subtree to the root silently.
  It is the only non-additive statement and it touches no data.

**2. Foundation service (`src/server/finance/chart-of-accounts/`)**

- `shared.ts` (pure, client-safe), `repository.ts` (persistence only) and
  `service.ts` (authorized, transactional, audited) following the project's
  per-domain convention.
- Create, update, move, activate/deactivate, archive, restore and approve, each
  inside `runFinancialTransaction` with its audit event in the same transaction.
- Hierarchy: stored `level`, 6-level ceiling, cycle detection through the
  ancestor chain, subtree re-levelling on move, and automatic demotion of a
  parent to a grouping account when it gains its first child (refused if the
  parent already carries movements).
- Immutability: accounts are never deleted; the code is never edited; the type
  and nature cannot change once journal lines exist.

**3. One posting-eligibility rule**

`describeChartAccountPostingBlock` replaces three divergent `isActive` checks —
journal lines, posting revalidation and account mapping — and adds archival,
grouping headers, the effective window (judged against the entry date) and
template approval. The 4.0S-C2 reversal exception is untouched.

**4. Template catalogue (239 accounts)**

- `prisma/data/chart-of-accounts-template.mjs` + `prisma/seed-chart-of-accounts.mjs`,
  run with `npm run prisma:seed:cuentas`. Deliberately separate from
  `prisma:seed`, which only seeds real company data.
- Every account is created with `origin = PLANTILLA`, a `templateVersion`, an
  explicit description and **no approval**, so none of them accepts a movement
  until the company accountant approves it.
- The seed is additive, re-runnable, never deletes, never touches an `EMPRESA`
  account and never reverts an accountant decision (`approvedAt`, `isActive`,
  `archivedAt`).

**5. Panel**

`/panel/contabilidad/catalogo-cuentas` now shows the hierarchy by indentation,
catalogue counters, template/approval badges, the reason an account cannot
receive movements, filters (vigentes / pendientes / inactivas / archivadas) and
the approve, deactivate/activate, archive and restore controls.

### Access

Unchanged. `authorizeContabilidad("operate")` and the service's
`authorizeFinancialFoundation("configure")` both resolve to Admin and Contador
with a global accounting scope. Gerente, Cajero, Vendedor, Marketing and Soporte
Técnico stay out.

### Validation performed

- `npx prisma validate`, `npx prisma format`, `npx prisma generate`: clean.
- Migration contrasted against `prisma migrate diff --from-empty`: column names,
  types, defaults, index names and FK actions match the target schema exactly.
- `npx tsc --noEmit`: clean.
- `npx eslint` over the touched directories: clean (the 39 pre-existing repo
  errors live in untouched legacy files and are identical before and after).
- `npm run build`: compiled successfully.
- Template expansion executed offline: 239 accounts, 6 classes, 17 groups,
  193 postable, 46 grouping, no invalid/duplicate/orphan code.

### NOT verified (no database available)

`prisma migrate deploy`, `prisma migrate status`, `npm run prisma:seed:cuentas`
and `SMOKE-FF1.1` were NOT executed: the development PostgreSQL instance was
unreachable (`localhost:15432`, Docker stopped), the same situation as FF1.0.
The 15-case smoke checklist is in `docs/CHART_OF_ACCOUNTS.md` §12.

### Documentation

New `docs/CHART_OF_ACCOUNTS.md`. Updated `ARCHITECTURE.md`, `DATABASE_PLAN.md`,
`PRISMA_PLAN.md`, `docs/FINANCIAL_FOUNDATION.md`,
`docs/FINANCE_STABILIZATION_PLAN.md` and `docs/ACCOUNTING_INTEGRATION_AUDIT.md`.

## Patch FF1.2-A - Accounting events specification

Documentation and domain analysis only. **No production code, no schema change,
no service, no API, no Prisma model and no journal entry.** The patch produces
the functional contract that the posting engine (FF1.4) will implement against.

> Naming note: FF1.2 in the stabilization plan is "post-issue collections and
> payment reversal". This patch is FF1.2-A, the specification that precedes it;
> the collection work keeps its meaning and is still pending.

### Created documentation

New `docs/ACCOUNTING_EVENTS.md`. No similar document existed, so nothing was
duplicated: it cites `FINANCIAL_FOUNDATION.md` (FF1.0), `CHART_OF_ACCOUNTS.md`
(FF1.1-A) and the 4.0S-A audits instead of restating them.

It catalogues **87 business events** across seven real modules, each with its
trigger, business description, implementation state, expected accounting impact
(without assigning accounts), posting requirements (preconditions, validations,
required entities, permissions, failure cases) and future integration.

### Analyzed modules

Events were discovered by reading the server actions that persist to PostgreSQL,
their guards and the Prisma models they touch — never assumed:

| Module | Source | Events |
|---|---|---:|
| Caja | `src/server/caja/actions.ts` (14 actions) | 19 |
| Contabilidad | `src/server/contabilidad/actions.ts` (51 actions) | 36 |
| Bancos | Contabilidad submodule | 8 |
| Ventas / reservas | `src/server/operations/actions.ts` (10 actions) | 7 |
| Inventario / traslados | `src/server/inventory/actions.ts` + operations | 9 |
| Expedientes y créditos | `src/server/expedientes/actions.ts` (12 actions) | 6 |
| Usuarios y autenticación | `src/server/users`, `src/server/auth` | 2 |

Legacy localStorage panels were deliberately excluded as a source of events:
they do not persist to the database and their retirement is planned (FF1.6).

Modules that do NOT exist were listed as absent rather than invented: Purchases,
POS, fiscal Billing, Treasury, Fixed assets, and Spare-parts/workshop inventory.

State of the 87: 38 implemented, 32 partial, 5 planned, 12 missing. 47 carry an
expected accounting impact. **None of them posts anything today** — "post" is a
status change everywhere in the codebase.

### Architectural findings

- **9 real business events have no value in `AccountingEventType`** (FF1.0):
  sale revenue, sale cost, delivery, inventory ingress (the de-facto purchase),
  inventory write-off, cash-document annulment, accounting-document annulment,
  depreciation and provisions. Four monetary components are missing too
  (creditable tax, employer payroll contributions, cost of sales, applied
  customer deposit).
- **R-01 (critical): no tax modelling in any operational document.**
  `CashDocument` has subtotal, applied payment and two retentions — no taxable
  base, no VAT — while the FF1.1-A template has VAT accounts.
- **R-02 (critical): inventory is not valued.** Neither `MotorcycleUnit` nor
  `InventoryMovement` carries a cost; `AccountingInventoryCost` is a manual
  per-model catalogue. No cost of sales is derivable.
- **R-03 (critical): functional currency undefined.** `currency` is free text in
  eight models with no exchange-rate policy.
- **R-04 (high): sales and invoicing are disconnected.** `CashDocument.saleId`
  exists but no UI populates it, so nothing links an invoice to a unit sale.
- **R-05 (high): the economic concept is free text.** A receipt may be a
  receivable collection or a customer advance; the mapping cannot tell.
- **R-08 (high): `JournalEntry.accountingDocumentId` is not unique**, so
  double-posting protection would be an `if`, not a database guarantee.
- Plus R-06 (adjustment vouchers are not representable with a single `TOTAL`
  component), R-07 (dual data planes), R-09 (posting date vs event date) and
  R-10 (closings are typed, not derived).
- **The cash-closing arithmetic is confirmed wrong in code**: the difference
  compares counted money against the total of issued FACTURA documents only,
  ignoring the recorded `CashPayment` rows, receipts and notes. FF1.4 must not
  consume it until FF1.1-B corrects it.
- Eight documentation-vs-implementation inconsistencies recorded (I-01…I-08),
  including the still-unresolved PROJECT_RULES §4 scope contradiction, the
  unused traceability columns on `AccountingDocument`, and the numbering service
  that no action calls yet.

### Pending work

- **12 questions require the company accountant**, not engineering: revenue
  recognition point (sale vs delivery), whether a sale posts by itself or only
  through its cash invoice, VAT treatment, branch-level inventory accounting,
  cash shortage treatment, receipt semantics, inventory costing method,
  functional currency, employer payroll contributions, monthly provisions,
  annulment as event vs reversal, and purchase documentation.
- **Blocking for FF1.4**: those decisions, the company's approval of the FF1.1-A
  catalogue, the mapping content itself, and a schema patch extending the event
  and component enums.
- **Recommended FF1.4 scope**: expenses, vouchers, cash invoice/receipt and
  accounting-document posting. Sale, cost and inventory move to a later FF1.4-B
  once R-01/R-02 are resolved; cash differences wait for FF1.1-B.

## Patch TD-01 - Technical debt cleanup (financial layer)

Behaviour-neutral cleanup. **No schema change, no migration, no new endpoint, no
business rule touched and no UI change.** Every public name that existed before
this patch still exists and still means the same thing; the duplicated
implementations behind them were collapsed.

### Centralized helpers

`src/server/finance/money.ts` (new) holds the money, currency, date and
Decimal-serialization helpers that Caja and Contabilidad each carried privately.
Six helpers existed **twice, byte for byte** — 12 function bodies where there was
one decision:

| Canonical (`finance/money.ts`, `finance/text.ts`) | Caja name (kept) | Contabilidad name (kept) |
|---|---|---|
| `sanitizeFinancialText` | `sanitizeCajaText` | `sanitizeAccountingText` |
| `sanitizeFinancialMoney` | `sanitizeCashMoney` | `sanitizeAccountingMoney` |
| `sanitizeFinancialCurrency` | `sanitizeCashCurrency` | `sanitizeAccountingCurrency` |
| `roundFinancialMoney` | `roundCashMoney` | `roundAccountingMoney` |
| `decimalToNumber` | `decimalToNumber` | `decimalToNumber` |
| `dateToISOString` | `dateToISOString` | `dateToISOString` |

`sanitizeSignedFinancialMoney`, `parseFinancialDate` and `decimalToString` moved
to the same module for cohesion (they existed once). Both `shared.ts` files now
re-export under their historical names, so **no call site changed**.

Deliberately NOT merged, because they encode different rules despite looking
alike: `sanitizeCashQuantity` (three decimals, strictly positive),
`sanitizeMinimumStock` and `sanitizeAccountingPeriod`.

One subtlety preserved on purpose: `sanitizeFinancialCurrency` still runs
through the text sanitizer with a 3-character bound, so `"NIOS"` keeps being
truncated to `"NIO"` instead of being rejected. Changing what an input means is
not this patch's business.

### Centralized error messages

`finance/errors.ts` gains `UNKNOWN_BRANCH_ERROR` and `ACCOUNT_NOT_FOUND_ERROR`,
joining the existing `DATABASE_REQUIRED_ERROR` and
`NO_FINANCIAL_PERMISSION_ERROR`. Six identical literals disappeared from
`caja/actions.ts`, `contabilidad/actions.ts`, `contabilidad/guards.ts`,
`finance/numbering/service.ts`, `finance/account-mapping/service.ts` and
`finance/chart-of-accounts/service.ts`. The local constant names
(`DB_REQUIRED`, `NO_PERMISSION`, `NO_BRANCH`, `NO_ACCOUNT`) were kept as
aliases, so no call site changed.

### Removed dead code

- `listChartAccountCatalog` and `getChartAccountDetail` in
  `finance/chart-of-accounts/service.ts`. Written in FF1.1-A, never called, and
  duplicating `listChartAccounts` / `getChartAccountDetail` of
  `contabilidad/queries.ts` — which the catalogue route actually uses and which
  additionally applies the reader's `ContabilidadScope`. **Two read paths with
  different authorization for the same rows** is exactly the divergence this
  cleanup targets; the scoped one stays.
- `findPostingState` and the `ChartAccountUsageDb` type
  (`chart-of-accounts/repository.ts`): superseded by `postingStateSelect`.
- `chartAccountCodeDepth` and `isChartAccountPostable`
  (`chart-of-accounts/shared.ts`): never acquired a caller.
- `isContraAccountNature`, `isWithinEffectiveWindow` and
  `ACCOUNT_ARCHIVED_ERROR_SUFFIX` stopped being exported — they are used only
  inside their own module.
- Import lists pruned in the files above.

### Marked, not removed

`finance/numbering/service.ts` and `finance/account-mapping/service.ts` carry a
`TODO(FF1.4)` stating they are **not** dead code: they are the numbering and
mapping contracts the posting engine will consume, documented in
`docs/FINANCIAL_FOUNDATION.md` §4–§5 and `docs/ACCOUNTING_EVENTS.md`. Without
the marker the next cleanup would delete them as unused.

### Cleaned files

`src/server/finance/money.ts` (new), `finance/errors.ts`,
`finance/chart-of-accounts/{shared,repository,service}.ts`,
`finance/numbering/service.ts`, `finance/account-mapping/service.ts`,
`caja/{shared,actions}.ts`, `contabilidad/{shared,actions,guards}.ts`.

### Validation

`npx tsc --noEmit` clean · `npx eslint` clean over the touched directories (the
39 pre-existing repo errors live in untouched legacy files) · `npm run build`
compiled successfully · `npx prisma validate` unaffected (schema untouched).

### Remaining technical debt

- **Audit helpers still diverge.** `caja/actions.ts` has
  `auditMoney`/`auditValuesEqual`; `contabilidad/actions.ts` has
  `auditValue`/`comparableAuditValue`/`changedDataFields`. They overlap but are
  not identical, so converging them would change audit output — a behavioural
  change that does not belong in TD-01.
- **`DB_REQUIRED` still duplicated outside the financial layer** in
  `crm`, `expedientes`, `marketing` and `operations` actions (plus a
  missing-accent variant in `tickets`). Left alone on purpose: `finance` is the
  *financial* base layer, not a global utility module, and importing it from CRM
  would widen the dependency graph for a string.
- **Enum value lists and type guards** in `caja/shared.ts` and
  `contabilidad/shared.ts` have no external consumer today
  (`journalEntryStatusValues`, `isPayrollStatusValue`, …). They are symmetric
  with the label maps and cheap to keep; deleting them is churn with risk.
- **`generateNumber` (random suffix)** still lives in `contabilidad/actions.ts`
  while the sequential numbering service sits unused. Wiring it is FF1.2+, not
  a cleanup.
- **Larger refactors not attempted**: adopting `runFinancialTransaction` across
  the existing Caja/Contabilidad actions, and retiring the legacy localStorage
  panels (FF1.6).

## Patch FF1.1-B - Cash foundation stabilization (closing arithmetic)

Makes the Caja module mathematically consistent before automatic accounting
starts. **No posting engine, no journal entry, no tax, no chart-of-accounts
change, no POS, no billing.** One additive migration.

### Corrected formula

The arqueo compared counted money against *invoicing* instead of against
*collection*:

```txt
BEFORE (wrong)
  recibido   = efectivo + transferencia + cheque + tarjeta   (typed)
  facturado  = Σ total of the shift's issued FACTURA documents
  diferencia = recibido − facturado

AFTER (FF1.1-B)
  esperado[m]   = Σ payments of method m registered against the shift's
                  ISSUED documents
  contado[m]    = what the cashier counts for method m
  diferencia[m] = contado[m] − esperado[m]
  diferencia    = Σ contado − Σ esperado
```

The old rule ignored the `CashPayment` rows actually registered, ignored
receipts entirely, counted a partially paid invoice at face value and treated
debit/credit notes as collected. A shift issuing one C$10,000 invoice with a
C$3,000 down payment reported a C$7,000 shortage that never existed.

The new rule needs **no rule per document type**: notes cannot carry payments
and drafts are not issued, so both contribute zero by construction instead of by
exception. `invoicedTotal` and `retentionTotal` survive as informational figures
and no longer take part in the difference.

### Previous inconsistencies removed

- **Three copies of the formula** — inline in `createCashClosingAction`, again
  in `closeCashSessionAction`, and a third in `calculateCashClosingTotals` for
  the panel preview. There is now one implementation, used by both writes, the
  closing DTO and the preview.
- **Drafts counted as facts.** The session `documentTotal` included BORRADOR
  documents.
- **Payments of annulled documents counted as collected.** `documentTotal`
  excluded ANULADO documents while `paidTotal` did not, so the two sides of
  `balance` described different universes.
- **The dashboard mixed universes**: FACTURA-only invoiced totals against every
  payment, including drafts' and annulled documents'.
- **A single global difference hid offsetting errors** — a C$500 cash overage
  against a C$500 card shortage reported a balanced shift. The arqueo is now
  per payment method.

### Architectural decisions

1. **The expectation is stored, not recomputed on read.** Migration
   `20260803120000_cash_closing_expected_totals` adds `expected_cash_amount`,
   `expected_transfer_amount`, `expected_check_amount`, `expected_card_amount`
   and `expected_total` to `cash_closings`. A payment corrected after the fact
   must not silently rewrite a difference a supervisor already reviewed.
2. **One arithmetic domain.** The shared formula works in numbers, not Decimal:
   every input is already bounded to `Decimal(12,2)`, so values are exact as
   doubles (below 2^53 in cents) and `roundCashMoney` absorbs the epsilon. That
   is what allows the server and the panel to run the *same* function instead of
   keeping a Decimal copy for writes and a number copy for the preview — the
   divergence that produced the bug.
3. **Recomputed at close, never at review.** `closeCashSessionAction` re-runs
   the collector so a document issued or annulled after the closing was prepared
   is reflected; `reviewCashClosingAction` deliberately does not, because review
   must not move the numbers it is reviewing. Counted amounts are the cashier's
   and are never recalculated.
4. **Per-method differences are derived, not stored.** They are a function of
   the stored counted/expected pairs; storing them too would create a second
   truth that could drift.

### Audit

Traceability increased, never reduced: `CashClosingAuditSource`, the closing
snapshot and the `financialAuditFieldLabels` allowlist all gained the five
expected fields, so a closing's audit trail now records what the shift was
expected to hold, not only what was counted.

### Files

`prisma/schema.prisma`, migration
`20260803120000_cash_closing_expected_totals`, `src/server/caja/closing.ts`
(new), `src/server/caja/{shared,actions,queries}.ts`,
`src/server/financial-audit/shared.ts`,
`src/features/operations/modules/caja-db/caja-closings-db-panel.tsx`.

### Validation

`npx prisma validate` / `format` / `generate` clean · `npx tsc --noEmit` clean ·
`npx eslint` clean over Caja and its panels · `npm run build` compiled
successfully.

**NOT verified**: the migration was NOT applied and `SMOKE-FF1.1-B` was NOT
executed — no PostgreSQL instance was reachable (`localhost:15432`, Docker
stopped), the same situation as FF1.0 and FF1.1-A.

### Remaining limitations

- **No opening balance** (`CashSession`) and **no cash movements**
  (`CashMovement`: outflows, petty expenses, deposits, withdrawals). Money can
  still only enter. Until they exist, expected cash is only what was collected,
  so a change fund counted at close appears as an overage. These are new
  business capabilities, not calculation fixes, which is why they are not in
  this patch.
- **No explicit shortage/overage acceptance** during review, and
  `CashClosingStatus.ANULADO` remains unreachable (no annul/reopen path).
- **Notes still do not move any balance.** A credit note is added at face value
  to the shift's document total because the model does not link it to the
  document it corrects — an open business question, not arithmetic.
- **Post-issue collections are still impossible** (FF1.2), so a document issued
  with a pending balance can never be settled.
- The duplicate-open-session race and the legacy localStorage cashier panel are
  unchanged (FF1.6).

## Patch FF1.2-B - Accounts receivable foundation

The customer's financial position, independent of cash. **No posting engine, no
journal entry, no tax, no POS, no fiscal billing, no bank reconciliation.** One
purely additive migration.

### Architecture check (performed before writing code)

The design was contrasted against every previous phase. **No blocking conflict
was found**; two real tensions were resolved explicitly rather than silently:

- **FF1.1-B cash arqueo.** A second payment concept could double-count money.
  Resolved by design: the arqueo reads `CashPayment` only, and
  `ReceivablePayment.cashPaymentId` is a nullable unique that mirrors the cash
  payment when the money came through a shift. A collection registered outside
  Caja has no session and correctly affects no arqueo. **FF1.1-B was not
  modified** — the compatibility is a property of the design, not a patch.
- **`appliedPayment` collision.** That column is a prepayment *inside the
  document total formula*, not a payment history. `originalAmount` copies the
  document total, which is already net of it, so a prepayment is never counted
  twice. Converting that field into a real allocation is declared debt.

FF1.0 (transaction helper, authorization), FF1.1-A (no account is referenced —
mapping is FF1.4), FF1.2-A (implements the data substrate of CJ-17, CJ-18,
VT-07 and EX-05 without inventing enum events) and TD-01 (reuses `money.ts` and
`text.ts`, adds no duplicate helper) were all compatible as-is.

### Reused vs unavoidable

Reused without duplication: `Customer`, `ThirdParty`, `Branch`, `User`,
`CashDocument`, `AccountingDocument`, `CashPayment`, `CashSession` and the
`CashPaymentMethod` enum — a collection method is one concept, not two.

Three new models, each because the schema could not express the fact it stores:

| Model | Why it was unavoidable |
|---|---|
| `ReceivableDocument` | The obligation did not exist. It mirrors an issued document instead of creating a third document plane: `cashDocumentId` and `accountingDocumentId` are nullable uniques, so one source document yields exactly one receivable. |
| `ReceivablePayment` | A `CashPayment` belongs to a shift *and to one document*. A collection may arrive by transfer with no shift, pay several documents, or none. |
| `ReceivableAllocation` | **The missing concept.** Without it a payment cannot be split and an advance cannot exist. |

Deliberately not created: any customer balance table. Balances are sums over
persisted rows.

### Business rules

1. **No balance is ever stored.** Every figure is recomputed from the allocation
   rows inside the transaction that needs it, so a stale read can never
   authorize a write. The only derived value the schema keeps is `settledAt` —
   an *event* (when the balance first reached zero), which no later sum can
   reconstruct.
2. **An advance is never deleted, only applied.** A collection with no
   allocations *is* the advance; it is not a separate record type.
3. **Reversals preserve history.** Allocations and collections are marked
   REVERTIDA/REVERTIDO with who, when and why; reversing an allocation clears
   `settledAt`, because an obligation that owes again was never settled then.
4. **Over-allocation is impossible.** An application may exceed neither the
   obligation's balance nor the collection's remainder, both read inside the
   transaction.
5. **Same currency or nothing.** No exchange-rate policy exists (risk R-03), so
   mixing currencies would invent a rate.
6. **Nothing is deleted.** No delete action exists; every FK to money or to a
   source document is `RESTRICT`.
7. **Cancelling requires clearing first.** An obligation with active
   allocations cannot be cancelled — the money must return to the party's
   advance instead of vanishing with the debt.
8. **The party name is resolved server-side** from the supplied id, so a caller
   cannot label a collection with someone else's name.

### Audit

Eight new actions written in the same transaction as the change:
`RECEIVABLE_DOCUMENT_{CREATED,SETTLED,REOPENED,CANCELLED}`,
`RECEIVABLE_PAYMENT_{REGISTERED,REVERSED}`,
`RECEIVABLE_ALLOCATION_{APPLIED,REVERSED}`, plus three entity types and nine
allowlisted fields. Settlement and reopening are distinct events on purpose.
Domain: CONTABILIDAD, even when the money entered through a Caja shift.

### Access

Unchanged: `authorizeFinancialFoundation` — Admin and Contador with a global
accounting scope, the same predicate numbering, mapping and the chart of
accounts already use. No role gained or lost anything.

No `"use server"` actions were added, following the FF1.0 precedent: no screen
consumes this yet and unused RPC endpoints would enlarge the attack surface for
no benefit.

### Files

`prisma/schema.prisma`, migration
`20260804120000_accounts_receivable_foundation`,
`src/server/finance/receivables/{shared,repository,service}.ts` (new),
`src/server/financial-audit/{shared,queries}.ts`, new
`docs/ACCOUNTS_RECEIVABLE.md`.

### Validation

`npx prisma validate` / `format` / `generate` clean · the migration was
contrasted line by line against `prisma migrate diff --from-empty` with **zero
divergences** · `npx tsc --noEmit` clean · `npx eslint` clean · `npm run build`
compiled successfully.

**NOT verified**: the migration was NOT applied and `SMOKE-FF1.2-B` (15 cases,
listed in `docs/ACCOUNTS_RECEIVABLE.md` §9) was NOT executed — no PostgreSQL
instance was reachable, the same situation as FF1.0, FF1.1-A and FF1.1-B.

### Pending

- **Cashier collection at the window** (FF1.2-C): registering a `CashPayment`
  and its mirrored `ReceivablePayment` in one transaction, plus the permission
  decision for the Cajero role. The substrate is ready; the flow is not.
- **A `AccountingEventType` value for a standalone collection** is still
  missing; the `ABONO_APLICADO` component already exists. That enum migration
  belongs to FF1.4.
- **Sequential numbering** is still the project's random-suffix shape, marked
  `TODO(FF1.0-numbering)`.
- **Six assumptions require the company accountant** (advances as a liability,
  cross-branch application, how a credit note offsets its original document,
  payment terms, late interest, and whether the receivable is the gross or the
  retention-net amount). Listed in `docs/ACCOUNTS_RECEIVABLE.md` §10.

## Patch FF1.3-A - Posting engine foundation

The architecture every future accounting event will consume. **It is not the
posting engine yet**: no strategy is registered, so no business event can be
posted, and **no existing module was modified to call it**. No UI, no routes, no
APIs, no server actions. One purely additive migration.

### Duplication check (performed before writing code)

Verified against the repository, not assumed:

- **`resolveAccountMapping` (FF1.0) already solves mapping resolution.** The
  engine consumes it through an adapter and **the account-mapping module was not
  modified**.
- **`describeChartAccountPostingBlock` (FF1.1-A) already solves account
  eligibility.** The validator calls it instead of re-deciding what a postable
  account is.
- **The period lock (4.0S-C1) existed only in `contabilidad/guards.ts`**, and
  `finance` may never import `contabilidad`. Duplicating it was the alternative
  TD-01 spent a patch eliminating, so it moved down to
  `src/server/finance/periods.ts` and `contabilidad/guards.ts` now re-exports it
  under its historical names — same rule, one implementation, zero call sites
  changed. This is the one existing file the patch modifies.
- **`JournalEntry`/`JournalEntryLine`, `runFinancialTransaction`,
  `authorizeFinancialFoundation`, the TD-01 money helpers, the 4.0S-C2 reversal
  linkage and `FinancialAuditEvent`** are all reused rather than reimplemented.

### Architecture

```txt
Business event → Dispatcher → Strategy → Validator → Mapping resolver
              → Builder → Journal validator → Writer → Audit
```

One responsibility per file under `src/server/finance/posting/`: `shared.ts`,
`errors.ts`, `strategy.ts`, `registry.ts`, `dispatcher.ts`, `mapping.ts`,
`builder.ts`, `validator.ts`, `repository.ts`, `writer.ts`, `pipeline.ts`,
`service.ts`.

**Registration-based, no switch.** `registerStrategy(...)` inscribes a strategy
for one event; there is no `switch (event)` or `if (eventType)` anywhere in the
pipeline, so adding an accounting event never edits the dispatcher, validator,
builder or writer. Registering the same event twice throws instead of silently
overwriting.

**A strategy never touches the database, never chooses an account and never
decides debit or credit.** `plan` is pure and synchronous: it declares which
monetary components moved and for how much. Accounts come from the mapping,
which carries both sides — that is why every entry the builder produces is
balanced by construction.

**The builder never writes; the writer is the only component that persists.**
That separation is what makes `previewPosting` — the full pipeline stopped
before the write — free.

### Idempotency becomes a database guarantee

New `posting_records` table with a unique `idempotency_key`
(`event:sourceType:sourceId` by default) and a unique `journal_entry_id`. This
closes finding R-08 of `docs/ACCOUNTING_EVENTS.md`: until now double-posting
protection would have been an `if` inside a transaction, which does not survive
concurrency. The pre-read is a courtesy for a clean message; the constraint is
the guarantee. A retry converges on the existing result (`alreadyPosted: true`)
rather than failing, with a strict mode available.

### Generic invariants only

The validator checks balance, line structure, an open accounting period,
postable accounts on the accounting date, and no duplicate posting. **No
business-specific validation**: no "an invoice needs items", no "a closing needs
a counted amount". Those belong to the module that owns the event.

### Audit

Two events per posting, in the same transaction: `JOURNAL_ENTRY_POSTED` on the
entry (so the ledger stays readable without knowing the engine exists) and
`POSTING_EXECUTED` on the posting record. `POSTING_REVERSED` and the
`POSTING_RECORD` entity are declared for FF1.3-C. A rejection is not audited —
the transaction rolls back and would take the audit row with it.

### Access

Unchanged. `authorizeFinancialFoundation` — Admin and Contador with a global
accounting scope. No role changed.

### Files

`prisma/schema.prisma`, migration `20260805120000_posting_engine_foundation`,
`src/server/finance/posting/*` (12 files, new),
`src/server/finance/periods.ts` (new), `src/server/contabilidad/guards.ts`
(period lock delegated), `src/server/financial-audit/{shared,queries}.ts`, new
`docs/POSTING_ENGINE.md`.

### Validation

`npx prisma validate` / `format` / `generate` clean · migration contrasted line
by line against `prisma migrate diff --from-empty` with **zero divergences** ·
`npx tsc --noEmit` clean · `npx eslint` clean · `npm run build` compiled ·
statically verified that no `switch`/`if` on event type exists in the engine,
that no module outside `finance/posting` imports it, and that `finance` still
imports nothing from `contabilidad`.

**NOT verified**: the migration was NOT applied and `SMOKE-FF1.3-A` (12 cases,
`docs/POSTING_ENGINE.md` §9) was NOT executed — no PostgreSQL instance was
reachable. **No automated test was written either: the repository has no test
runner**, which is the most visible debt this phase leaves, because the
dispatcher, builder and structural validators are pure and trivially testable.

### Known limitations

- The registry is empty; nothing can be posted. That is the deliverable.
- No posting reversal yet: the reversal columns and `POSTING_REVERSED` exist but
  nothing writes them (FF1.3-C).
- Entry numbering is still the project's random-suffix shape
  (`TODO(FF1.0-numbering)`).
- One currency per entry; no taxes; `JournalEntry.accountingDocumentId` is still
  not unique, so a manual entry may still point at the same document.

## Patch FF1.3-B - First executable posting strategy

The transition from infrastructure to execution: exactly one business event now
travels the entire posting pipeline. **No new infrastructure, no new
abstraction, no alternative pipeline, no parallel validation.** No schema
change, no migration, no UI, no server action.

### Phase 0 - why this event

Verified against the repository, not assumed:

- `componentsForEvent("COMPROBANTE_EGRESO")` is **exactly `["TOTAL"]`** — the
  only event family in the FF1.0 matrix with a single component. Accounting
  documents declare five, expenses four, payroll two, cash invoices nine.
- A multi-component event forces a decision about **which** components make up
  the entry. Declaring both `SUBTOTAL` and `TOTAL` would recognize the same
  money twice, and that choice is a business decision the repository explicitly
  lists as pending (`docs/ACCOUNTING_EVENTS.md` §13). Per the source-of-truth
  rule, it is documented rather than invented.
- `AccountingVoucher.amount` is the whole economic fact: no derivation, no
  netting, no tax split.
- It is isolated from every excluded domain: no sale, no inventory, no
  receivable, no tax, no VAT, no COGS, no payroll, no depreciation, no
  provision.
- `ACCOUNTING_VOUCHER` was already in `postingSourceTypes`, so the engine needed
  no change to accept it.

Priority-1 (manual accounting document) was **not** chosen: it is the
five-component case, two of those components are tax withholdings, and the event
is receivable/revenue-shaped — all three excluded by this patch's constraints.

### What was added

- `finance/posting/strategies/accounting-voucher.ts` — the strategy. Pure and
  synchronous: `parse` narrows the opaque payload, `plan` declares one `TOTAL`
  component. It touches no database, chooses no account and decides no
  debit/credit side.
- `finance/posting/strategies/index.ts` — registration point. One line per
  strategy; the `has` guard makes it idempotent under Next hot reloads, where a
  re-evaluated module would otherwise crash on `register`'s duplicate throw.
- `contabilidad/posting.ts` — the caller. Holds only the rules the module owns
  (the voucher exists, is not annulled, has an amount) and delegates everything
  else. It declares the full voucher-type → event table even though only
  `EGRESO` has a strategy: the rest resolve to `STRATEGY_NOT_FOUND`, which is
  the honest answer, and making them postable is five strategy files with no
  change to this caller.

### What was modified

Two lines in `finance/posting/service.ts`: a side-effect import of the strategy
barrel and a corrected header comment. **No other engine file was touched** —
not the dispatcher, registry, validator, builder, writer, pipeline, mapping,
repository, errors or shared contracts.

### Runtime verification (new for this phase)

A Node harness with a custom ESM resolver ran the engine **for real**, without
PostgreSQL, using the injectable resolver port and an in-memory fake for the
narrow `Pick<TransactionClient>` shapes: **46 assertions, 0 failures.**

- Pure stages (25): component/amount planning, balanced two-line draft, mapped
  accounts, deterministic idempotency key, and eight rejection paths
  (`STRATEGY_NOT_FOUND`, four `INVALID_PAYLOAD` variants, two `INVALID_REQUEST`,
  `MAPPING_MISSING`), plus the state invariants (`PERIOD_CLOSED`,
  grouping account / unapproved template / missing account →
  `ACCOUNT_NOT_POSTABLE`) and duplicate-registration rejection.
- Full pipeline including the writer (21): first execution creates one entry
  (born `CONTABILIZADO`) plus one posting record and emits exactly
  `JOURNAL_ENTRY_POSTED` then `POSTING_EXECUTED`; **re-execution converges**
  (`alreadyPosted: true`, same entry, nothing created, nothing re-audited);
  **strict mode rejects** with `DUPLICATE_POSTING` and writes nothing; a
  different source posts normally; a closed period rejects and leaves no entry,
  no record and no audit.

The harness lives in the scratchpad, not in the repository: the project still
has no test runner, so this is verification, not a test suite.

### Known limitations

- Only `COMPROBANTE_EGRESO` is executable; the other five voucher types and
  every other event fail with `STRATEGY_NOT_FOUND`.
- The voucher is **not** marked as posted. `VoucherStatus` has no
  `CONTABILIZADO` state and inventing one would be a business-behaviour change
  beyond this patch; the `PostingRecord` is the link, and it is what makes a
  second call idempotent.
- Nothing calls `postAccountingVoucher` yet — no screen, no action, following
  the FF1.0/FF1.3-A precedent.
- Posting still requires an ACTIVE account mapping set with a rule for
  `COMPROBANTE_EGRESO · TOTAL`, which does not exist in any database: the
  mapping content remains an accountant decision.
- The double authorization (`authorizeFinancialFoundation` in the caller for the
  read, then again inside `executePosting`) is deliberate: the read needs its own
  gate. Both resolve to Admin/Contador, so no role sees anything new.

## Patch FF1.3-C - Posting reversal engine

Completes the posting engine. A posting can now be reversed, the original entry
stays immutable, and the whole engine is verified against a real PostgreSQL
database for the first time.

### Defect found and fixed in FF1.3-A

`posting_records.idempotency_key` was unique **absolutely**, while the model's
own documentation promised that marking a record REVERTIDO would let the source
event be posted again. Both could not be true: the second attempt collided on
the index, so the **reverse → correct → post again** loop — the entire reason a
reversal exists — was impossible.

The rule that actually holds is "at most one **active** posting per business
event", expressed with `activeIdempotencyKey`: a nullable unique column that
carries the key only while the posting is CONTABILIZADO. Same device as
`account_mapping_sets.active_branch_key`, and for the same documented reason: a
partial unique index cannot be declared in the Prisma schema. Migration
`20260806120000_posting_reversal` (drop index, add column, backfill, add
nullable unique + plain index).

### Second defect, found by the smoke

The strategy registration lived in `posting/service.ts` as a side-effect import,
so **any caller reaching `runPostingPipeline` directly saw an empty registry**.
The smoke hit `STRATEGY_NOT_FOUND` on its first run. The import moved to
`dispatcher.ts`, the only component that consults the registry and therefore the
one that must guarantee it is populated. This was flagged as a theoretical risk
in the FF1.3-B self-review; runtime validation proved it real.

### Reversal

- `buildReversalDraft` mirrors the posted lines with debit and credit swapped.
  It does **not** consult the mapping: the mapping may legitimately have changed
  since, and a reversal must undo what happened, not what would happen today.
- `assertReversalAccountsExist` implements the 4.0S-C2 historical-account
  exception: a reversal may reuse a deactivated or archived account, but the
  account must still exist. Existence, not policy — which is why it does not go
  through `describeChartAccountPostingBlock`.
- `runReversalPipeline` is a second, shorter pipeline in the same module. A
  reversal has no strategy to dispatch and no mapping to resolve; forcing it
  through `runPostingPipeline` would mean inventing a fake strategy and plan.
  Every stage it does have is the same component the posting path uses.
- `writePostingReversal` creates the mirrored entry linked through the unique
  `reversalOfId`, flips the record to REVERTIDO releasing its active key, and
  emits `JOURNAL_ENTRY_REVERSED` + `POSTING_REVERSED` — the audit actions FF1.3-A
  had already declared. **No new audit event was invented.**
- The period lock is judged against the **reversal date**, not the original's, so
  an entry from a closed month stays correctable in the current open period.
- Re-reversing converges (`alreadyReversed: true`); the unique `reversalOfId` is
  what guarantees only one mirrored entry can ever exist.

### Runtime validation against PostgreSQL (SMOKE-FF1.3-C)

`npm run smoke:posting` — **41 assertions, 0 failures, zero fixtures left**
(verified: the database returns to 0 postings, 0 entries, 0 lines, 0 audit rows,
0 accounts, 0 mapping sets).

Covered: successful posting (balanced entry, record, both audit events
persisted) · idempotent re-execution · strict mode rejection · **concurrent
posting of the same event — exactly one survives** · reversal (linked mirror,
swapped sides, balanced) · **original entry byte-for-byte immutable** (status,
date and lines re-read and compared) · record flipped with author and reason ·
double reversal converges with a single mirror · **re-posting after reversal
works** (two records, one active) · reversal reason required · closed period
blocks both posting and reversal · **transaction rollback leaves no entry, no
record and no audit** · foreign keys refuse to delete an account with movements
or a posted entry · `STRATEGY_NOT_FOUND` and `MAPPING_MISSING` as typed errors.

Also applied and verified for the first time: the **five previously unapplied
migrations** of FF1.0, FF1.1-A, FF1.1-B and FF1.2-B, plus this patch's. Database
schema is up to date; `prisma migrate status` clean.

### Files

`prisma/schema.prisma`, migration `20260806120000_posting_reversal`,
`finance/posting/{repository,builder,validator,writer,pipeline,service,dispatcher}.ts`,
new `prisma/smoke/{ff13c-posting-reversal.ts,loader.mjs,register.mjs,next-stub.mjs}`,
`package.json` (`smoke:posting`), `docs/POSTING_ENGINE.md`.

### Remaining limitations

- **Authorization is not covered by the smoke.** `authorizeFinancialFoundation`
  resolves the session from the request's signed cookie, which a standalone
  script cannot build. The engine is unreachable without it — both entry points
  authorize before opening the transaction — but that is verified by reading the
  code, not by execution.
- Only `COMPROBANTE_EGRESO` is postable; the other events still need strategies.
- Entry numbering remains the random-suffix shape (`TODO(FF1.0-numbering)`).
- A reversal cannot itself be reversed, and reversing does not notify the source
  module: nothing tells the voucher its posting was undone.
- `JournalEntry.accountingDocumentId` is still not unique, so a manual entry may
  point at the same document as an engine-produced one.

## Patch FF1.4-A - Automatic posting integration (accounting vouchers)

One existing business flow now uses the posting engine automatically. **No new
infrastructure, no schema change, no migration, no UI, no new strategy, no new
abstraction.**

### Phase 0 - the actual voucher lifecycle

Read from the code, not assumed:

```txt
create → REGISTRADO      (born this way; there is NO draft state)
REGISTRADO → edit        (updateAccountingVoucherAction; CAN change the amount)
REGISTRADO → CONCILIADO  (bank reconciliation, not approval)
any except ANULADO → ANULADO (cancel, reason required)
```

**There is no approval transition.** `VoucherStatus` is REGISTRADO / CONCILIADO
/ ANULADO; the model has `createdByUserId` and no reviewer or approver column,
unlike `AccountingDocument` which has both. No state means "approved".

### Which transition was chosen, and why the others are wrong

**Creation.** A voucher is born final: there is no draft to leave it in, so the
moment it exists is the moment it becomes an economic fact.

- `CONCILIADO` was rejected: it is **bank** reconciliation. Posting there would
  mean a voucher never matched against a statement is never posted, and would
  equate reconciliation with approval — inventing accounting behaviour.
- `ANULADO` is the end of life, not the beginning.
- A new approval state was rejected: inventing a workflow is explicitly out of
  scope.

**The consequence, made explicit rather than silent:** `REGISTRADO` was an
editable state, and a posted voucher can no longer be edited.
`updateAccountingVoucherAction` now refuses when an active posting exists — the
same immutability rule 4.0S-B already applies to posted entries and documents.
Correcting a posted voucher means annulling it and registering a new one. For
voucher types with no strategy nothing changed: they are still fully editable.

### Integration

- `postVoucherInTransaction(ctx, voucher)` posts **inside the caller's
  transaction**. No second transaction exists anywhere in the flow, so the
  voucher and its journal entry are written by the same transaction and neither
  can survive without the other.
- Whether to post is decided by asking the **registry** (`postingRegistry.has`),
  not by a hardcoded type check. An event is postable exactly when someone wrote
  a strategy for it, so registering the remaining voucher strategies later starts
  posting them with **no change to this code**.
- `createAccountingVoucherAction` was converted to `runFinancialTransaction` —
  the incremental adoption FF1.0 planned for actions touched for another reason.
  It brings the transaction, the atomic audit write and the error translation the
  action was doing by hand.
- `cancelAccountingVoucherAction` reverses the posting through
  `reverseVoucherPostingInTransaction`, which delegates to the engine's
  `runReversalPipeline`. **No reversal logic was recreated.**
- No new audit event. Creation still emits `VOUCHER_CREATED`, annulment still
  emits `VOUCHER_CANCELLED`, and the engine adds the four it already had.

### Runtime validation against PostgreSQL (SMOKE-FF1.4-A)

`npm run smoke:voucher` — **30 assertions, 0 failures**. Plus SMOKE-FF1.3-C
re-run: **41 assertions, 0 failures** (no regression). Database returns to zero
rows in every touched table.

Covered: EGRESO creation posts automatically (entry, record, amount) · a voucher
type with no strategy is created and **not** posted · re-posting converges ·
**a posting failure rolls the voucher back too — no voucher without entry, no
entry without voucher** · concurrent creation, one posting each · annulment
reverses automatically (mirror entry, record REVERTIDO, active key released,
balanced inverted lines, `POSTING_REVERSED` persisted) · double annulment
rejected with a single mirror · annulling an unposted voucher produces no mirror
· `findActiveVoucherPosting` detects a posted voucher · final counts coherent.

### Files

`src/server/contabilidad/posting.ts` (transaction-scoped helpers),
`src/server/contabilidad/actions.ts` (create, update, cancel),
new `prisma/smoke/ff14a-voucher-autoposting.ts`, `package.json`
(`smoke:voucher`).

### Remaining limitations

- Only EGRESO posts; the other five voucher types are recorded and left unposted
  until someone writes their strategies.
- Posting requires an ACTIVE mapping with a rule for `COMPROBANTE_EGRESO ·
  TOTAL`. Without it **voucher creation now fails** — a real behaviour change:
  before this patch an EGRESO voucher could always be created.
- Annulling a posted voucher is blocked when the current period is closed,
  because its reversal cannot be dated into a closed period.
- The voucher still has no CONTABILIZADO state; the `PostingRecord` is the link.
- The authorization layer is not covered by the smoke: server actions resolve the
  session from the request cookie, which a standalone script cannot build.

## Patch FF1.4-C - Automatic posting integration (accounting documents)

Automatic posting extended to `AccountingDocument`. **No engine redesign, no
schema change, no migration, no UI, no new infrastructure.**

### Phase 0 - the lifecycle, read from the code

```txt
BORRADOR --issue--> EMITIDO --review--> REVISADO --post--> CONTABILIZADO --reconcile--> CONCILIADO
                                                     \--cancel--> ANULADO (refused once posted)
```

Unlike the voucher, this lifecycle is **unambiguous**: it already distinguishes
created, emitted, reviewed and posted, it already has a state literally called
CONTABILIZADO, and `postAccountingDocumentAction` already requires REVISADO.
Per FF1.2-A finding CT-07 that transition was "a status flag only, with no
ledger effect". It now has one.

**Transition selected: REVISADO → CONTABILIZADO.** Every other one was rejected:
BORRADOR and EMITIDO are before review; CONCILIADO requires posting to have
happened already; ANULADO is refused for posted documents by 4.0S-B. No new
workflow was invented — the approval state already existed.

### Components: a documentation gap, resolved by the model's own arithmetic

No project document states which components form a document entry; they state
which ones are *allowed*. The arithmetic decides:
`total = max(subtotal − appliedPayment − retention1 − retention2, 0)`. Since each
component becomes an independent balanced pair, the entry declares **SUBTOTAL
plus each non-zero deduction, and never TOTAL** — declaring TOTAL as well would
recognize the same money twice. The set is forced, not chosen. Full derivation
in `docs/POSTING_ENGINE.md` §11.

Verified end to end: an invoice of 10 000 with retentions 200 + 100 and an
applied payment of 1 500 produces eight balanced lines whose **net receivable
balance is exactly 8 200**, the document total.

A cash receipt declares `TOTAL` only, because its matrix allows nothing else. A
document whose shape the matrix cannot express — a receipt carrying a retention —
is **refused** rather than posted with the movement silently dropped.

### Implementation

- `strategies/accounting-document.ts`: four strategies (invoice, debit note,
  credit note, cash receipt) from one factory. They read the allowed set from
  `componentsForEvent` instead of assuming it. No existing strategy was touched.
- `postDocumentInTransaction` posts inside the caller's transaction, so the
  state change and the entry are written together or not at all.
- The engine call passes `accountingDocumentId`, so `JournalEntry` finally
  carries the traceability column that has existed since Patch 3.5A and that no
  flow ever populated — **finding I-07 of `ACCOUNTING_EVENTS.md` is closed**.
- The action's explicit 4.0S-C1 period check was removed: the engine applies the
  same rule against the same date, and keeping both is how two answers to one
  question start to drift. The guarded `updateMany` concurrency check was kept
  exactly as it was.
- Immutability needed **no change**: `updateAccountingDocumentAction` already
  requires BORRADOR and `cancelAccountingDocumentAction` already refuses
  CONTABILIZADO with `POSTED_IMMUTABLE`.

### Regression prevented

`reverseJournalEntryAction` (4.0S-C2) would happily reverse an engine-produced
entry, leaving its `PostingRecord` CONTABILIZADO and still holding the event's
active idempotency key — the record would lie and the document could never be
corrected. It now refuses entries owned by a posting and points at the engine's
reversal. This hole was **created** by FF1.4-A/C making entries engine-owned, so
closing it belongs here.

### Runtime validation against PostgreSQL

`npm run smoke:document` — **37 assertions, 0 failures**. Re-ran without
regression: `smoke:voucher` 30/30, `smoke:posting` 41/41. **108 assertions
total.** Every touched table returns to zero rows.

Scenarios: draft document not postable · reviewed invoice posts automatically
(8 lines, balanced, correct net receivable, document traced) · posting twice
rejected · missing mapping rolls back the state change too · unexpressible shape
refused · cash receipt posts a single component · concurrent posting — one wins,
one entry · closed period blocks and leaves the document untouched · mapping vs
strategy failures distinguished in the message · reversal produces the mirrored
8-line entry with the original intact · double reversal converges · final
consistency: **every engine entry has a posting record**.

### Files

`src/server/finance/posting/strategies/accounting-document.ts` (new),
`strategies/index.ts`, `src/server/contabilidad/posting.ts`,
`src/server/contabilidad/actions.ts` (post + reverse guard),
new `prisma/smoke/ff14c-document-autoposting.ts`, `package.json`,
`docs/POSTING_ENGINE.md`.

### Remaining work before operational modules

- **The mapping content is still undefined.** Nothing posts without an ACTIVE
  set with rules per event and component; posting an unmapped document now
  **blocks the CONTABILIZADO transition** that used to always succeed.
- Note direction (debit vs credit note) is a mapping decision still pending.
- Documents already CONTABILIZADO before this patch have no posting record and
  no entry; there is no backfill.
- Cash documents, expenses, payroll and sales remain unposted.

## Patch FF1.4-D - Automatic posting integration (cash documents)

Automatic posting extended to `CashDocument`. **No engine change, no schema
change, no migration, no UI, no second pipeline.**

### Phase 0 - the lifecycle, read from the code

```txt
create → BORRADOR                     (requires an open shift)
BORRADOR: update / items / payments   (all require BORRADOR; notes take no payments)
BORRADOR --issue--> EMITIDO           (open shift; FACTURA needs items; recalculates
                                       subtotal from items and total from the formula;
                                       payments must not exceed the total)
any except ANULADO --cancel--> ANULADO (open shift, reason required)
```

**Transition selected: `issueCashDocumentAction` (BORRADOR → EMITIDO).** It is
where the document becomes an economic fact: its subtotal and total are
recalculated and frozen, no item or payment can be added afterwards, and
FF1.1-B's arqueo already counts exactly the payments of EMITIDO documents.

Rejected: creation (a draft is still being edited), cancellation (end of life),
and shift closing (a different source and a different event — see below).

**Immutability needed no change**: update, items and payments already require
BORRADOR.

### Components

Same derivation as FF1.4-C, extended with the collection side and equally forced
by `calculateCashDocumentTotal`: **SUBTOTAL + each non-zero deduction + each
non-zero `PAGO_*` by method, never TOTAL**. What is left uncollected simply
stays on the receivable account with no component of its own — a partially paid
invoice needs no extra rule. Verified: an invoice of 5 000 with a 100 retention,
3 000 cash and 1 000 transfer posts eight balanced lines and leaves **exactly
900 on the receivable**.

**The cash receipt is genuinely ambiguous and was not decided silently.** Its
matrix allows both `TOTAL` and `PAGO_*`, which for a receipt are the same money.
`PAGO_*` was implemented because it moves the same amount while preserving the
method, and a receipt whose payments do not add up to its total is **refused**
rather than interpreted. The alternative and the pending accountant decision are
written up in `docs/POSTING_ENGINE.md` §12.

`CAJA_CIERRE` was deliberately left out: FF1.1-B fixed the arqueo arithmetic but
the opening balance and cash movements still do not exist, so posting a shift
difference would record a phantom overage.

### Defect found by runtime validation

The concurrent-issue scenario showed **both transactions succeeding**: the action
read the status and then issued a plain `update`, so two callers could both issue
the same document — two `CASH_DOCUMENT_ISSUED` audit events and two `issuedAt`
overwrites. The ledger was never at risk (the engine's unique index kept a single
posting), but the lifecycle was. The transition now uses a **guarded
`updateMany`** with the status in the WHERE, the same device
`postAccountingDocumentAction` already used.

`issueCashDocumentAction` and `cancelCashDocumentAction` were also converted to
`runFinancialTransaction`, which closes the FF1.0 trap they carried: returning
`{ ok: false }` from inside a Prisma interactive transaction **commits** it.
Every rejection now goes through `ctx.fail` and rolls back.

### Runtime validation against PostgreSQL

`npm run smoke:cash` — **34 assertions, 0 failures**. No regression: `posting`
41/41, `voucher` 30/30, `document` 37/37. **142 assertions across four suites.**
Every touched table returns to zero rows.

Scenarios: paid invoice posts on issue (8 lines, balanced, `source = CAJA`,
correct outstanding receivable) · issuing twice rejected · receipt with exact
collection posts one component pair · **receipt with partial collection refused**
· missing mapping rolls the issue back, document stays BORRADOR · note without
mapping distinguished in the message · concurrent issue — one wins · closed
accounting period blocks issuing · annulment reverses automatically (mirror,
original intact, record REVERTIDO, no active posting) · audit carries both the
Caja and the engine events · every engine entry has a posting record.

### Files

`src/server/finance/posting/strategies/cash-document.ts` (new),
`strategies/index.ts`, `src/server/caja/posting.ts` (new),
`src/server/caja/actions.ts` (issue + cancel),
new `prisma/smoke/ff14d-cash-autoposting.ts`, `package.json`,
`docs/POSTING_ENGINE.md`.

### Behaviour changes

- **Issuing a cash document now fails when its event has no mapping.** A
  cashier cannot issue an invoice until Contabilidad configured the rules. This
  is the direct consequence of atomicity and the most operationally sensitive
  change in the patch.
- **A closed accounting period blocks a cashier from issuing.** Closings
  normally cover past months, but closing the current month would stop the till.
- Issuing twice is now rejected instead of silently re-issuing.

## Patch FF1.4-E - Automatic posting: expenses

### Lifecycle, read from the code

`ExpenseStatus` is `REGISTRADO | REVISADO`. Two states, one transition, no
annulment. `reviewExpenseAction` is that transition: it requires the `review`
permission (creation requires only `operate`), stamps reviewer and timestamp,
and is the boundary past which `updateExpenseAction` refuses to edit. That is
where the expense stops being a draft, so that is where it is now posted.

### Components, derived not chosen

`calculateExpenseTotal` is `max(subtotal + tax - retention1 - retention2, 0)` —
the tax **adds**, unlike every other posted document, which is why this strategy
is not another instance of the document factory. With `tax = 0` the FF1.4-C
derivation carries over unchanged: `SUBTOTAL` plus the non-zero retentions,
never `TOTAL`, which lands the payable exactly on `total`.

### What is refused

- **Expenses carrying tax.** No component in FF1.0's matrix expresses a tax —
  not for `GASTO`, not for any event. Every available combination either loses
  the tax or overstates the expense, so the expense is refused instead of
  posting a wrong entry. Enabling it needs an accounting decision plus a Prisma
  enum migration. See `docs/POSTING_ENGINE.md` §13.
- **Retentions exceeding the subtotal**, where `total` floors at zero while the
  components sum to something else.

### Runtime verification

`npm run smoke:expense` — 39 assertions, 0 failures, against real PostgreSQL:
automatic entry on review · retention entry whose net payable equals the
expense total · taxed expense refused **and the review rolled back** · double
review rejected · missing mapping rolls back the transition · concurrent review
yields one posting · closed period blocks · reversal mirrors and leaves the
original intact · double reversal converges. All four previous suites re-run
clean (41 + 30 + 37 + 34). Database ends with zero fixtures.

### Files

`src/server/finance/posting/strategies/expense.ts` (new),
`strategies/index.ts`, `src/server/contabilidad/posting.ts` (expense seam),
`src/server/contabilidad/actions.ts` (`reviewExpenseAction`),
new `prisma/smoke/ff14e-expense-autoposting.ts`, `package.json`,
`docs/POSTING_ENGINE.md`.

### Behaviour changes

- **Reviewing an expense now fails when `GASTO` has no mapping.** Nobody can
  review an expense until Contabilidad configured the rules — the direct
  consequence of atomicity, and the most operationally sensitive change here.
- **A closed accounting period blocks review**, judged against the expense date.
- **An expense carrying tax can no longer be reviewed at all.** Previously
  review was a status change with no accounting meaning, so tax was irrelevant
  to it. This is the change most likely to surprise, and it is deliberate.
- `reviewExpenseAction` moved from a raw `$transaction` to
  `runFinancialTransaction`. The old body returned `{ ok: false }` from inside
  an interactive transaction, which **commits**; with posting attached that
  would have left a reviewed expense with no entry.
- Immutability needed no change: `updateExpenseAction` already refused to edit
  anything past `REGISTRADO`.
- No automatic reversal was wired: the lifecycle has no annulment to hang it on.

## Patch FF1.4-F - Automatic posting: payroll

### Lifecycle, read from the code

`PayrollStatus` is `BORRADOR -> PREPARADA -> PAGADA`, with no annulment and no
backward transition. Posting happens on **`PREPARADA`**: it carries the `review`
permission and it is the point past which `updatePayrollRecordAction` refuses to
edit. That is the accrual.

### Components, derived not chosen

`calculatePayrollNetPay` is
`max(base + commissions + bonuses - deductions - advances, 0)`, and
`componentsForEvent("PLANILLA")` is `PLANILLA_NETO, PLANILLA_DEDUCCIONES`. There
is **no gross component**, so the gross is reached by addition rather than
subtraction — the mirror image of the FF1.4-C derivation:

    net + deductions = base + commissions + bonuses

which holds exactly when `advances = 0`. Verified in runtime: base 20 000 with
deductions 3 000 books the expense at **20 000**, not at the 17 000 net.

### What is refused

- **Payroll carrying advances.** The matrix has one deduction component and two
  economically different deductions: a withholding credits a third-party
  payable, an advance recovery credits an employee receivable. One mapping rule
  names one pair of accounts, so they cannot share a component; omitting the
  advance understates the salary expense by exactly that amount. Both readings
  are wrong, so the record is refused. See `docs/POSTING_ENGINE.md` §14.
- **Deductions exceeding gross earnings**, where the net floors at zero.
- **A stored net that disagrees with its own parts.**

### Repository limitations recorded, not worked around

- `PayrollRecord` has **no date column**. The accounting date is derived as the
  last day of `period` (`YYYY-MM`), in UTC — a reasoned choice, documented as
  such. A malformed period fails closed through the engine's period validator.
- **`PAGADA` produces no entry.** The matrix has one payroll event and its
  components describe the accrual; there is no payment event to express
  *debit salaries payable, credit bank*. Consequence: the ledger accumulates a
  `Salarios por pagar` balance that nothing clears. Verified in runtime.

### Runtime verification

`npm run smoke:payroll` — 50 assertions, 0 failures, against real PostgreSQL:
derived accounting date · entry on prepare · gross expense with the deduction
split · advances refused **and the transition rolled back** · over-deduction and
inconsistent net refused · double prepare rejected · missing mapping rolls back ·
concurrent prepare yields one posting · closed period blocks, judged against the
payroll period · **PAGADA creates no second entry** · reversal mirrors and leaves
the original intact · double reversal converges. All five previous suites re-run
clean (41 + 30 + 37 + 34 + 39). Database ends with zero fixtures.

### Files

`src/server/finance/posting/strategies/payroll.ts` (new),
`strategies/index.ts`, `src/server/contabilidad/posting.ts` (payroll seam),
`src/server/contabilidad/actions.ts` (`preparePayrollRecordAction`),
new `prisma/smoke/ff14f-payroll-autoposting.ts`, `package.json`,
`docs/POSTING_ENGINE.md`.

### Behaviour changes

- **Preparing a payroll now fails when `PLANILLA` has no mapping.** Nobody can
  prepare until Contabilidad configured the rules — the direct consequence of
  atomicity.
- **A closed accounting period blocks preparing**, judged against the derived
  period date rather than the current month.
- **Payroll carrying advances can no longer be prepared at all.** Previously
  preparing was a status change with no accounting meaning, so advances were
  irrelevant to it. This is the change most likely to surprise, and it is
  deliberate.
- `preparePayrollRecordAction` moved from a raw `$transaction` to
  `runFinancialTransaction`, for the same reason as FF1.4-E: the old body
  returned `{ ok: false }` from inside an interactive transaction, which
  **commits**.
- Immutability needed no change: `updatePayrollRecordAction` already refused to
  edit anything past `BORRADOR`.
- `markPayrollRecordPaidAction` is untouched and posts nothing.

## Patch FF1.4-G - Posting contract (architecture only)

No schema, no migration, no engine, no pipeline, no strategy, no UI, no runtime
behaviour change. Two documents and nothing else.

### What it produces

`docs/POSTING_CONTRACT.md` (new) formalizes the contract that emerged across
FF1.4-A…F between strategies, engine, mapping layer, `AccountingEventComponent`
and the event/component matrix:

- **Phase 0** — audit of all 17 events and 13 components: allowed components vs
  components any strategy actually emits, plus per-event ambiguity and model
  limitation.
- **Phase 1** — contract for every one of the 13 components: meaning, accounting
  class (gross / net / deduction / payment / adjustment), coexistence, mutual
  exclusion, zero-value behaviour, expected mapping.
- **Phase 2** — contract for every event: which components constitute the fact,
  which are forbidden, the arithmetic, and what stays outside the posting.
- **Phase 3** — seven model limitations (L-1…L-7), each with why the model cannot
  express it, whether a migration is required, and the operational consequence.
- **Phase 4** — nine invariants the repository **does** enforce, with file and
  line, separated from seven that exist **only as contract** and can be violated
  by creating a perfectly valid mapping rule.
- **Phase 5** — re-evaluation of the FF1.3-A principle.
- **Phase 6** — blockers vs technical debt vs business decisions vs migrations.

Every statement is tagged by provenance: repository inspection, runtime
verification, inference, accounting assumption, or pending business decision.

### The two findings that reframe FF1.4

- **The matrix declares what may be *mapped*, not what is *emitted*.** In 9 of 17
  events the sets differ — `TOTAL` is mappable in 9 events and emitted in 2 — so a
  valid, activated mapping rule can be silently dead. No previous document said
  this.
- **Mapping validation is rule-by-rule**
  (`src/server/finance/account-mapping/validation.ts`). Nothing validates a
  relationship *between* two components of one event, which is precisely what
  payroll correctness requires.

### A previous claim corrected

The FF1.4-F review stated payroll was the first event where mapping determines an
amount. **That was too strong.** Mapping redistributes amounts in every
multi-component event. The distinction that does hold: everywhere except payroll
the gross is *declared* by one component, so mapping that component correctly
guarantees the gross figure; in payroll the gross is *emergent* from two
components, so no single rule can be "correct" in isolation. Classified as a
**matrix limitation**, not a strategy or engine defect.

### Files

`docs/POSTING_CONTRACT.md` (new), `docs/POSTING_ENGINE.md` (§15 pointer and a
correction note on §14).

## Patch FF1.5-A - Mapping contract enforcement

Makes part of the FF1.4-G contract executable. One function added to one file.
No schema, no migration, no engine, no pipeline, no strategy, no DTO, no UI.

### Where it hooks in

`validateMappingSet` already existed and activation already rejected on it
(`account-mapping/service.ts:307`). It only ever looped over rules calling
`validateRule` — one row at a time. FF1.5-A adds `validateSetRelationships`,
which judges relationships **between** rules of one set. The rejection point was
already there; nothing new was plumbed.

### The two invariants that became executable

- **X1 — base component dependency.** If a set has rules for an event, it must
  map that event's base component: `SUBTOTAL` where the matrix contains it,
  `PLANILLA_NETO` for payroll. Evidence: all three strategy factories build
  their component list starting from `SUBTOTAL` and append only non-zero
  modifiers, so a set missing it can never post the event at all — the engine
  fails closed on the first unmapped component. This rejects nothing that works
  today; it moves an existing failure from posting time to activation time.
- **X2 — payroll cannot cancel itself.** In `PLANILLA`, neither component may
  debit the account the other credits. Evidence: `PLANILLA` has no gross
  component, so the devengado exists only as the sum of its two components; if
  they cancel, the gross never reaches the ledger **and the entry still
  balances**, which is exactly why nothing downstream catches it.

`TOTAL` is deliberately **not** treated as a base component: `CAJA_RECIBO`
allows it and no strategy emits it, so requiring it would force a dead rule.

### What was deliberately left unenforced

Six contractual invariants stay documentation-only, each with its reason
recorded in `docs/POSTING_CONTRACT.md` §Fase 4. The most important: **X2 does
not demand that both payroll components share a debit account.** Splitting the
salary expense across two expense accounts is legitimate presentation and the
repository proves nothing against it, so only the provable half — the
cancellation — is enforced.

### Runtime verification

`npm run smoke:mapping` — 34 assertions, 0 failures, real PostgreSQL: valid
mappings · duplicate component rejected by the SQL constraint · missing base
component · forbidden component · empty set · **dead mapping stays valid** ·
**event without a strategy stays valid** · correct payroll · **payroll split
across two expense accounts stays valid** · both cancellation directions
rejected · payroll without the net · **the exact FF1.4-C/D/E/F mappings still
validate** · cross-event isolation · activation accepted, rejected, and the
rejected set left in `BORRADOR` with no `activeBranchKey` and no `activatedAt` ·
double activation rejected. All six previous suites re-run clean
(41 + 30 + 37 + 34 + 39 + 50). Database ends empty.

### Files

`src/server/finance/account-mapping/validation.ts`,
new `prisma/smoke/ff15a-mapping-validation.ts`, `package.json`,
`docs/POSTING_CONTRACT.md`.

### Behaviour changes

- **Activating a mapping set now fails** when an event is mapped without its
  base component, or when payroll components cancel each other. Both were
  already broken configurations; neither could produce correct accounting.
- **No posting behaviour changed.** The engine, pipeline, builder, validator and
  every strategy are untouched. Valid mappings resolve exactly as before —
  verified by re-running all six posting suites.

## Patch FF2.0-A - Tax component model

First patch of the FF2 line, and the first since FF1.1-B to extend the schema.
`IMPUESTO` becomes a first-class `AccountingEventComponent`.

### Phase 0 finding that shaped the whole patch

**A tax amount exists in exactly one place in the schema: `Expense.tax`.**
`AccountingDocument` and `CashDocument` carry `subtotal`, `retention1`,
`retention2`, `appliedPayment` and `total` — and no tax column. Their `taxId`
fields are tax identification numbers (strings), and `JournalEntry.taxBase` is
manual-entry metadata. So four of the requested smoke scenarios — taxed
document, taxed cash invoice, taxed credit note, taxed debit note — **describe
data the repository does not have**, and were not built. See §L-8 below.

### Migration, and why it was unavoidable

`ALTER TYPE "AccountingEventComponent" ADD VALUE 'IMPUESTO' AFTER 'SUBTOTAL'`
(`20260807120000_tax_component`). Purely additive: no row, column or constraint
changed. No existing component could carry the tax — `SUBTOTAL` alone leaves the
payable short and loses the creditable tax, `SUBTOTAL` + `TOTAL` double-counts
the subtotal, and folding it into `SUBTOTAL` overstates the expense. The enum is
a Postgres type; a new member requires DDL. There was no non-migration path.

### The engine did not change

Not one line in `pipeline.ts`, `builder.ts`, `validator.ts`, `writer.ts`,
`registry.ts` or `dispatcher.ts`. The engine still does not know what a tax is:
it receives one more component, resolves it against the mapping and emits its
debit/credit pair like any other. A new component costs an enum value, a matrix
row and one list entry in the strategy.

### The strategy got shorter

The block that refused taxed expenses is gone. The tax joined the modifier list
that already held the retentions. The only adjustment: the floor guard now
compares retentions against `subtotal + tax`, since the tax is part of what is
owed — which *relaxes* the guard for taxed expenses and leaves untaxed ones
identical.

### Mapping validation extended

**X3** — `IMPUESTO` may not cancel `SUBTOTAL` in either direction. Provable from
the model's own arithmetic: the tax *adds*, so a mapping that debits what the
subtotal credits leaves the balance at `subtotal - tax`, contradicting the
stored `total`; one that credits what the subtotal debits shrinks the expense.
Both balance, both lie. Which account receives the tax — creditable asset or
sunk cost — stays the accountant's decision.

### A false pass this patch exposed and fixed

`SMOKE-FF1.4-E` scenario 3 asserted a taxed expense was rejected, checking the
error contained "impuesto". After FF2.0-A it still passed — but for a different
reason: the strategy no longer refuses, and the failure now comes from the
missing `IMPUESTO` mapping, whose message happens to name the component. The
scenario was rewritten to assert what it actually verifies (`mapeo contable
activo`), so the suite stops being green by coincidence.

### Runtime verification

`npm run smoke:tax` — 44 assertions, 0 failures, real PostgreSQL: untaxed
expense unchanged and needing no tax rule · explicit zero tax likewise · taxed
expense where **expense = subtotal, tax on its own account, payable = total** ·
tax and retentions together (10 000 + 1 500 - 200 = 11 300) · missing tax
mapping rolls back the whole review · same branch still posts untaxed expenses ·
retentions above the subtotal but below subtotal+tax now accepted · retentions
above both rejected · closed period · concurrency · reversal mirroring the tax
line · archived mapping set stops resolving · X3 rejected in both directions.
All seven previous suites re-run clean (41+30+37+34+39+50+34). Database ends
empty.

### Files

`prisma/schema.prisma`, `prisma/migrations/20260807120000_tax_component/`,
`src/server/finance/account-mapping/shared.ts` (matrix + label),
`src/server/finance/account-mapping/validation.ts` (X3),
`src/server/finance/posting/strategies/expense.ts`,
new `prisma/smoke/ff20a-tax-component.ts`,
`prisma/smoke/ff14e-expense-autoposting.ts` (corrected scenario 3),
`package.json`, `docs/POSTING_ENGINE.md` (§16), `docs/POSTING_CONTRACT.md`.

### Behaviour changes

- **Expenses carrying tax can now be reviewed and posted.** FF1.4-E blocked them
  entirely; this reverses that block, which was always documented as temporary.
- **Posting a taxed expense requires a `GASTO · IMPUESTO` mapping rule.** Until
  Contabilidad configures it, taxed expenses fail at review with a mapping error
  and roll back completely.
- **Untaxed expenses are byte-for-byte unchanged** and need no new rule.
- **Activating a mapping set now fails** when the tax rule cancels the subtotal.

## Patch FF2.0-B - Tax amounts in accounting documents

Gives `AccountingDocument` the tax amount it never had, so it can emit the
`IMPUESTO` component FF2.0-A introduced. Accounting documents only — CashDocument
is untouched.

### Migration

`ALTER TABLE "accounting_documents" ADD COLUMN "tax" DECIMAL(12,2) NOT NULL
DEFAULT 0` (`20260808120000_document_tax_amount`). No backfill, no row rewritten:
`calculateAccountingDocumentTotal` gains an **additive** term that is zero for
every document written before this patch, so each keeps exactly the total it
already had.

### The FF2.0-A prediction held

FF2.0-A claimed that once a model carried a tax amount, enabling it would cost
"one matrix line per event and one modifier-list entry". That is precisely what
it cost:

- `IMPUESTO` added to `DOCUMENTO_FACTURA`, `DOCUMENTO_NOTA_DEBITO` and
  `DOCUMENTO_NOTA_CREDITO`;
- one entry in the document strategy's modifier list;
- **no enum migration, and not one line of engine code.**

`pipeline.ts`, `builder.ts`, `validator.ts`, `writer.ts`, `dispatcher.ts` and
`registry.ts` are untouched, as is X3 in the mapping validator — it was written
generically in FF2.0-A and now covers document events with no change.

### The official cash receipt is deliberately excluded

`DOCUMENTO_RECIBO_OFICIAL_CAJA` has no gross component, so a tax would have
nothing to add to, and its total already includes whatever tax the original
document charged. Declaring `IMPUESTO` there would count it twice. A receipt
carrying tax is refused by the existing unmappable-component guard — no new
logic. Recorded as §L-9.

### The same component, both directions

An expense's tax is typically creditable (an asset, debited); a sales invoice's
tax is typically payable (a liability, credited). **The same component serves
both**, because it only declares an amount — the direction is the mapping's.
Verified in runtime both ways: SMOKE-FF2.0-A debits creditable VAT,
SMOKE-FF2.0-B credits VAT payable.

### Runtime verification

`npm run smoke:document-tax` — 43 assertions, 0 failures, real PostgreSQL:
arithmetic unchanged at zero tax · untaxed invoice identical to FF1.4-C · explicit
zero tax emits no component · taxed invoice where **revenue = subtotal, tax on its
own account, receivable = total** · tax plus retentions (10 000 + 1 500 - 200 =
11 300, cross-checked against the model's own formula) · taxed debit note ·
**receipt with tax refused by the strategy, asserted on the reason** · missing
`IMPUESTO` mapping rolls back the whole posting · same branch still posts untaxed
invoices · closed period · concurrency · reversal mirroring the tax line · X3
rejecting a document mapping that cancels the subtotal. All eight previous suites
re-run clean (41+30+37+34+39+50+34+44). Database ends empty.

### Files

`prisma/schema.prisma`, `prisma/migrations/20260808120000_document_tax_amount/`,
`src/server/contabilidad/shared.ts` (formula + DTO),
`src/server/contabilidad/actions.ts` (create, update, audit snapshot),
`src/server/contabilidad/queries.ts` (DTO mapping),
`src/server/contabilidad/posting.ts` (seam),
`src/server/finance/account-mapping/shared.ts` (matrix),
`src/server/finance/posting/strategies/accounting-document.ts`,
new `prisma/smoke/ff20b-document-tax.ts`, `package.json`,
`docs/POSTING_ENGINE.md` (§16), `docs/POSTING_CONTRACT.md` (§L-8, §L-9).

### Behaviour changes

- **Accounting documents accept and store a tax amount**, additive to the total.
- **Posting a taxed document requires a `<evento> · IMPUESTO` mapping rule.**
  Until Contabilidad configures it, taxed documents fail at posting and roll back
  completely.
- **Untaxed documents are byte-for-byte unchanged**: same total, same components,
  same entry, no new rule required.
- **A cash receipt carrying tax is refused.** Previously unreachable, since
  documents could not carry tax at all.

## Patch FF2.0-C - Tax amounts in cash documents

Closes limitation L-8. `CashDocument` gets the tax amount `AccountingDocument`
received in FF2.0-B, and the two totals agree again.

### Migration

`ALTER TABLE "cash_documents" ADD COLUMN "tax" DECIMAL(12,2) NOT NULL DEFAULT 0`
(`20260809120000_cash_document_tax_amount`). Additive term, zero for every
existing row, so each keeps its stored total. No backfill. No payment total is
invalidated either: a larger total can only leave more room under the
overpayment guard, never less.

### The asymmetry FF2.0-B introduced lasted exactly one patch

Both models now compute `subtotal + tax - abono - retentions`, floor 0. Cash has
**two** implementations of that formula — `calculateDocumentTotalDecimal`
(Decimal, writes the column) and `calculateCashDocumentTotal` (number, the rest
of the layer) — and both carry the term. That duplication is pre-existing; it is
now recorded in the contract because there are two places to keep in step.

### Cost, for the third time

Three matrix rows (`CAJA_FACTURA`, `CAJA_NOTA_DEBITO`, `CAJA_NOTA_CREDITO`), one
modifier-list entry in the cash strategy. **No enum migration, no engine line, no
new component, no new event.** X3 was reused exactly as written in FF2.0-A.
`CAJA_RECIBO` is excluded for the same reason as its accounting twin (§L-9), and
the existing unmappable-component guard refuses a taxed receipt with no new
logic.

### A bug the type checker could not catch

`tax` has `@default(0)`, so omitting it from `prisma.cashDocument.create` is
valid TypeScript — the create action would have silently stored zero for every
tax the caller passed. `tsc` was clean and the defect was real. Found by reading
the create block against the update block rather than trusting the typecheck.

### Runtime verification

`npm run smoke:cash-tax` — 45 assertions, 0 failures, real PostgreSQL: cash
arithmetic now equals accounting arithmetic · untaxed cash invoice identical to
FF1.4-D · taxed invoice where **revenue = subtotal, tax on its own account,
receivable = total** · tax + retention + cash collection together (10 000 + 1 500
- 200 - 5 000 collected = 6 300 outstanding) · taxed cash debit note · **taxed
receipt refused, asserted on the reason** · untaxed receipt unchanged · missing
`IMPUESTO` mapping rolls back the issue · same branch still issues untaxed
invoices · closed period · concurrency · reversal mirroring the tax line ·
archived mapping set stops resolving · payment totals still read from the
database. All nine previous suites re-run clean
(41+30+37+34+39+50+34+44+43). Database ends empty.

### Files

`prisma/schema.prisma`,
`prisma/migrations/20260809120000_cash_document_tax_amount/`,
`src/server/caja/shared.ts` (formula + DTO),
`src/server/caja/actions.ts` (Decimal formula, create, update, issue, item
recalculation, audit snapshot),
`src/server/caja/queries.ts` (DTO mapping),
`src/server/caja/posting.ts` (seam),
`src/server/finance/account-mapping/shared.ts` (matrix),
`src/server/finance/posting/strategies/cash-document.ts`,
new `prisma/smoke/ff20c-cash-tax.ts`, `package.json`,
`docs/POSTING_ENGINE.md` (§16), `docs/POSTING_CONTRACT.md` (§L-8 closed, §L-9).

### Behaviour changes

- **Cash documents accept and store a tax amount**, additive to the total.
- **Issuing a taxed cash invoice or note requires a `<evento> · IMPUESTO`
  mapping rule.** Until Contabilidad configures it, issuing fails and rolls back
  completely — the cashier cannot issue.
- **Untaxed cash documents are byte-for-byte unchanged**: same total, same
  components, same entry, no new rule required.
- **A cash receipt carrying tax is refused**, matching the accounting receipt.

## Patch FF2.0-D - VAT settlement event

Closes the tax lifecycle FF2.0-A…C opened. Tax is recognised on purchases and
sales; `LIQUIDACION_IVA` is the statutory act that settles the accumulated
balances against the tax authority.

### Two corrections to the patch premise, both verified

- **`AJUSTE_MANUAL` does not exist in this repository.** The generic adjustment
  event is `COMPROBANTE_AJUSTE`. The conclusion survives, on stronger grounds: it
  allows only `TOTAL`, has no strategy, and the voucher seam binds it to a
  `VoucherType.AJUSTE` row, so every posting of it originates in an
  `AccountingVoucher`. A settlement is not a voucher.
- **No posting source type could represent a settlement.** `postingSourceTypes`
  had eight entries, none applicable, and the engine requires a non-empty
  `source.id`. `VAT_SETTLEMENT` was added — a runtime allowlist in
  `posting/shared.ts`, explicitly designed so a new source costs a code change
  and not a migration. **This file was not in the patch's file list**; without it
  the event cannot be posted at all.

### Migration

`ALTER TYPE "AccountingEventType" ADD VALUE 'LIQUIDACION_IVA'`
(`20260810120000_vat_settlement_event`). One enum value. **No new component** —
`IMPUESTO` is reused. No row, column or constraint changed.

### Identity without a business model

There is no settlement table, and the patch does not add one. The identity of a
settlement is **the period it settles**, carried as `source.id`, so the
idempotency key `LIQUIDACION_IVA:VAT_SETTLEMENT:<branch>:<period>` makes settling
one period twice impossible — verified under concurrency.

### No new validation, as predicted

X3 looks for `IMPUESTO` alongside `SUBTOTAL`. `LIQUIDACION_IVA` has no
`SUBTOTAL`, so `validateAdditiveModifiers` returns early and a set carrying only
the settlement rule is valid. X1 likewise finds no base component and skips.
Both verified in runtime rather than assumed.

### Runtime verification

`npm run smoke:vat-settlement` — 37 assertions, 0 failures, real PostgreSQL:
settlement owing tax (debits the payable, credits the bank) · settlement in
favour (**the same component producing the opposite entry**, direction chosen by
the mapping) · zero amount refused with a message naming the settlement ·
malformed period refused · missing mapping rolls back leaving no entry and no
posting record · **same period settled twice converges instead of duplicating** ·
a different period posts normally · concurrent settlement of one period yields
one record · closed period blocks · archived mapping stops resolving · **a taxed
expense posts unchanged in the same branch, both events using `IMPUESTO` without
interfering** · reversal mirrors the settlement · X3 correctly does not apply.
All ten previous suites re-run clean
(41+30+37+34+39+50+34+44+43+45). Database ends empty.

### Files

`prisma/schema.prisma`,
`prisma/migrations/20260810120000_vat_settlement_event/`,
`src/server/finance/account-mapping/shared.ts` (matrix + label),
`src/server/finance/posting/shared.ts` (**source type, beyond the listed files**),
`src/server/finance/posting/strategies/vat-settlement.ts` (new),
`strategies/index.ts`, new `prisma/smoke/ff20d-vat-settlement.ts`,
`package.json`, `docs/POSTING_ENGINE.md` (§16), `docs/POSTING_CONTRACT.md`
(event contract, §L-10).

### Behaviour changes

- **VAT balances can now be settled through a dedicated accounting event.**
- **Settlement requires an active mapping for `LIQUIDACION_IVA · IMPUESTO`.**
- **No existing posting behaviour changes.** Engine, pipeline, builder,
  validator, writer, dispatcher and registry untouched; purchase and sales tax
  postings verified byte-for-byte identical.
- **Nothing calls the settlement yet.** There is no action, no seam and no UI —
  the smoke builds the request and runs the pipeline, which is what a future seam
  would do.

## Patch FF2.0-E - VAT settlement workflow

Makes `LIQUIDACION_IVA` reachable from the application. The engine, pipeline,
builder, validator, writer, dispatcher, registry and the settlement strategy are
untouched.

### One correction to the patch premise

**`postVATSettlement(...)` did not exist.** FF2.0-D shipped the strategy only;
its smoke built the `PostingRequest` inline. The seam was written here, not
reused.

### Business model

`VatSettlement` — branch, period, amount, status (`BORRADOR → EJECUTADA`),
notes, executor and timestamp, plus `createdByUserId` (not in the spec's field
list, but every other financial model has a creator and the audit trail needs an
actor). `@@unique([branchId, period])`. New enum `VatSettlementStatus`. The
migration is purely additive: one type, one table, no existing object touched.

The model is deliberately thin: it **records a human decision, it does not derive
one**. Computing the VAT position from the ledger remains open as §L-10.

### Identity is branch+period, not the row id

`@@unique([branchId, period])` is the business twin of the engine's idempotency
key `LIQUIDACION_IVA:VAT_SETTLEMENT:<branch>:<period>` — the database forbids a
second settlement of one period from both sides. The period was chosen over the
row id because it **survives a draft being deleted and redrafted**; a row id
would make "the same period" a different fact each time.

### Beyond the listed files

Three central allowlists in `src/server/financial-audit/` needed the new action
names, entity type and the `executedAt` field label — extended in TypeScript, not
by migration, which is exactly what those allowlists exist for. Without them the
audit calls do not compile.

### A flaky assertion this patch exposed

Re-running the suites surfaced a failure in **SMOKE-FF2.0-D scenario 8**, which
asserted that two concurrent settlements of one period *both* succeed. That
outcome is timing-dependent: if the second transaction reads before the first
commits it hits the unique index and fails; if it reads after, it converges. Both
are correct. The assertion passed on its first run by luck. It now asserts what
the engine actually guarantees — **at least one succeeds and exactly one posting
record exists** — and was re-run four times to confirm stability. Not a
regression from FF2.0-E: nothing here touches that path.

### Runtime verification

`npm run smoke:vat-settlement-workflow` — 46 assertions, 0 failures, real
PostgreSQL: draft created with no entry · draft edited · duplicate branch+period
refused by the unique index · malformed period refused · execution produces the
entry, the posting record and the executor stamp · entry dated on the last day of
the settled period · **posting source is `branch:period`, not the row id** ·
immutable after execution · double execution rejected · zero amount refused with
the business message and rolled back · missing mapping rolls back · closed period
blocks · archived mapping set rolls back · concurrent execution yields one record
· reversal mirrors and leaves the settlement `EJECUTADA`. All eleven previous
suites re-run clean (41+30+37+34+39+50+34+44+43+45+37). Database ends empty.

### Files

`prisma/schema.prisma`,
`prisma/migrations/20260811120000_vat_settlement_workflow/`,
`src/server/contabilidad/posting.ts` (seam),
`src/server/contabilidad/actions.ts` (three actions),
`src/server/contabilidad/queries.ts` + `shared.ts` (DTO),
`src/server/financial-audit/shared.ts` + `queries.ts`
(**allowlists, beyond the listed files**),
new `prisma/smoke/ff20e-vat-settlement-workflow.ts`,
`prisma/smoke/ff20d-vat-settlement.ts` (flaky assertion fixed),
`package.json`, `docs/POSTING_ENGINE.md` (§16), `docs/POSTING_CONTRACT.md`.

### Behaviour changes

- **VAT settlement is now executable through the application.**
- **One settlement per branch and accounting period**, enforced by the database.
- **Executed settlements become immutable.**
- **Posting behaviour is byte-for-byte identical** — verified by re-running every
  previous suite.
- **Reversal is still unreachable.** `VatSettlementStatus` has no annulled state,
  so an executed settlement cannot be undone through the application. This is the
  same gap expenses and payroll have carried since FF1.4-E — blocker B-2, now
  affecting a third flow.

## Patch FF2.1-A - Expense tax UI

First browser-level patch of the FF2 line, and the repository's first E2E suite.

### Phase 0 finding: most of the patch was already built

**The tax field, the live total and the wiring to the action already existed** —
`contabilidad-expenses-db-panel.tsx` (commit `9735474`, untouched here) declares
`tax` state, renders an `Impuesto` input beside `Subtotal`, computes the total
through the shared `calculateExpenseTotal` and passes `tax` to
`createExpenseAction`. FF1.4-E is what blocked taxed expenses, at review time,
and FF2.0-A lifted that block. The screen needed nothing.

Also verified as **not applicable**: hiding the field for non-taxable types.
`Expense` has a category, not a taxable/non-taxable distinction — there is no
such type to branch on.

### What was actually missing: editing

`updateExpenseAction` had **no caller anywhere in the repository**. An expense
could be registered and reviewed but never corrected, so "edit tax before
review" and "remove tax" were impossible. This patch adds the edit form, offered
only while the expense is `REGISTRADO` — mirroring the server rule rather than
inventing one — plus a small amount breakdown in the list row when there is
something to break down.

The form carries **no arithmetic of its own**: it recomputes with the same
`calculateExpenseTotal` the server uses, so the preview cannot drift from what
gets stored.

### The E2E suite, and the coverage it finally adds

Playwright installed from scratch (no test infrastructure existed), driving the
real app against the real database, with fixtures written via Prisma and cleanup
scoped by tag.

**It closes the one gap 434 Prisma assertions never touched: authorization.**
Every smoke reproduces the transactional body of an action precisely because
actions authorize against a session cookie. `auth.setup.ts` performs a genuine
login, so the session, the proxy and the permission checks are exercised for the
first time.

### A second architectural finding

The expense screen's branch selector is **not fed by the database**:
`gastos/page.tsx` fills it from `desiredBranches`, a static array in
`src/data/operations/leads.ts`, while `createExpenseAction` resolves the code
against the `branches` table. A branch is usable from the UI only if it exists in
**both**. The suite had to borrow two real seeded branches (`granada`, `rosita`)
because a fixture branch could never appear in the dropdown.

### Runtime verification

`npm run e2e` — **14 tests, 0 failures**, real browser against real PostgreSQL:
live total recalculation including removing the tax · create untaxed · create
taxed with subtotal and tax stored separately · edit the tax before review ·
remove the tax · review untaxed (2-line entry) · **review taxed (4-line entry,
IVA acreditable debited 150, expense still 1000)** · reviewed expense loses both
buttons · missing `IMPUESTO` mapping shows the server error and leaves no
posting record · archived mapping blocks review · persistence across reload ·
mobile viewport with no horizontal overflow · keyboard reachability and label
association. Run **four consecutive times** clean after the flakiness fix below.
All twelve Prisma suites re-run clean
(41+30+37+34+39+50+34+44+43+45+37+46). Database ends empty.

### Two harness defects found and fixed while building it

- **A `router.refresh()` race.** Clicking *Revisar*/*Editar* immediately after
  submitting could land on a node React was about to replace. Reloading before
  the click removes it. This is a test-harness race, not a product defect — the
  actions themselves are covered by the Prisma suites.
- **`next build` type-checks `e2e/` but `tsc --noEmit` does not.** A mistyped
  fixture array compiled clean under `tsc` and failed the build — the same
  asymmetry that caught a smoke file in FF1.4-F.

### Not delivered

**Documentation screenshots.** Producing them was possible but they would be
binary artifacts with no assertion behind them; the suite's failure traces
already capture the rendered state when something breaks. Say so rather than
claim them.

### Files

`src/features/operations/modules/contabilidad-db/contabilidad-expenses-db-panel.tsx`
(edit form, amount breakdown, two `data-testid` anchors),
new `playwright.config.ts`, new `e2e/` (config, fixtures, global setup/teardown,
auth setup, spec), `package.json`, `.gitignore`.

### Behaviour changes

- **Registered expenses can now be edited**, including their tax. Nothing could
  edit an expense before.
- **Reviewed expenses expose no edit affordance**, matching the server rule.
- **The tax entry flow itself is unchanged** — it already worked.
- **Posting is byte-for-byte identical to FF2.0-A**, verified by re-running every
  Prisma suite.

## Patch FF2.1-B - Accounting document tax UI

Extends the browser workflow to accounting documents. Unlike FF2.1-A, where the
field already existed, here **nothing was built**: the create form had no tax
input, the total omitted the term, and `updateAccountingDocumentAction` had no
caller anywhere in the repository.

### What this patch adds

- **`Impuesto` field** in the create form, and the live total now passes `tax` to
  `calculateAccountingDocumentTotal`. The browser owns no arithmetic: it calls
  the same function the server calls, so the preview cannot drift from what is
  stored or from what FF2.0-B posts.
- **An edit form for drafts**, wired to `updateAccountingDocumentAction`. Offered
  only while the document is `BORRADOR`, mirroring the server rule rather than
  inventing one.
- **A breakdown in the list row** — subtotal, tax, applied payment, retentions,
  total — shown only when there is something to break down, so a plain document
  looks exactly as before. There is no separate detail drawer in this repository;
  the row is the detail, and the breakdown lives there next to the existing audit
  timeline.
- **`data-testid="conta-error"`** on the shared error notice, so a rejected
  transition fails a test with the server's own message instead of a silent
  timeout.

### Runtime verification

`npm run e2e:documents` — 15 tests; `npm run e2e` — **28 tests, 0 failures**,
run three times clean after the fixes below. Real browser, real PostgreSQL,
through the full lifecycle `BORRADOR → EMITIDO → REVISADO → CONTABILIZADO`,
because **posting happens on the last transition**, not on review:

live total across tax, applied payment and retentions · create untaxed · create
taxed with the subtotal unchanged · no breakdown when there is nothing to break
down · edit the tax · remove the tax · post untaxed (2-line entry) · **post taxed
(4-line entry: revenue stays at 1000, VAT payable credited 150, receivable
1150)** · posted document exposes no edit affordance · missing `IMPUESTO` mapping
surfaces the server error and leaves no posting record · archived mapping set
blocks posting · persistence and breakdown after reload · mobile viewport with no
horizontal overflow · keyboard reachability and label association · authorization
through a real login.

All twelve Prisma suites re-run clean
(41+30+37+34+39+50+34+44+43+45+37+46). Database ends empty.

### Three harness defects found and fixed

- **Hydration race — the real cause of the FF2.1-A flakiness.** After
  `page.reload()` the row exists in the server HTML before React attaches its
  handlers, so a click in that window does nothing and the action is lost
  silently. `waitForLoadState("networkidle")` before clicking closes it. The
  reload alone, added in FF2.1-A, only narrowed the window.
- **A rejected transition failed as a bare timeout.** The status poll now checks
  the error notice first and reports the server's message.
- **The auth setup's 120 s wait was capped by the 60 s global test timeout**, so
  it failed before its own budget ran out. Fixed with `setup.setTimeout`.

### Files

`src/features/operations/modules/contabilidad-db/contabilidad-documents-db-panel.tsx`
(tax field, edit form, breakdown, two `data-testid` anchors),
`contabilidad-db-shared.tsx` (error notice anchor),
`e2e/fixtures.ts` (document accounts, `DOCUMENTO_FACTURA` mappings, document
cleanup), `e2e/expense-tax.spec.ts` (hydration wait),
new `e2e/document-tax.spec.ts`, `e2e/auth.setup.ts`, `package.json`.

### Behaviour changes

- **Accounting documents can now capture, edit and display tax amounts.**
- **Draft documents can be edited at all** — nothing could edit one before.
- **Posting is byte-for-byte identical to FF2.0-B**, verified by re-running every
  Prisma suite.
- No accounting engine, strategy, mapping or arithmetic changed.

## Patch FF2.1-C - Cash document tax UI

Verified in full. This entry was first written as PARTIALLY VERIFIED because the
environment's database connectivity failed mid-patch; a later run with the
environment healthy passed **all 14 cash tests**, including everything the first
attempts never reached. The verification section below has been corrected.

### Three corrections to the patch premise

- The panel is `modules/caja-db/caja-documents-db-panel.tsx`, not
  `modules/caja/cash-documents-db-panel.tsx`.
- **`updateCashDocumentAction` already had a browser caller.** `UpdateDocumentForm`
  has existed all along; it simply had no tax field.
- The detail card already rendered a monetary grid (subtotal, applied payment,
  retentions, total, balance). Only the tax tile was missing. What genuinely did
  **not** exist was a live total in any cash form —
  `calculateCashDocumentTotal` was not even imported.

### What this patch adds

- **`supportsTax` per section, read from the FF1.0 matrix**: `CAJA_FACTURA` and
  the two note types admit `IMPUESTO`; `CAJA_RECIBO` does not, so the receipt
  screen deliberately offers no tax field — typing one there would produce a
  document the strategy refuses to post (§L-9).
- Tax field in the create and edit forms; tax threaded into both actions.
- **Live total in the edit form via the server's own
  `calculateCashDocumentTotal`.** It works for invoices too, whose subtotal comes
  from items rather than a typed field, by feeding the stored subtotal in.
- Tax tile in the detail breakdown; `testId` support on `CajaTotal`; anchors
  `cash-breakdown`, `cash-tax-tile`, `cash-live-total`, `cash-edit-form`,
  `cash-item-form`, and `caja-error` on the shared notice.

### Verification: what was and was not proven

**Prisma suites pass**: `smoke:expense` 39/39, `smoke:cash` 34/34 after the
environment fix below. The cash tax posting path itself is covered by
SMOKE-FF2.0-C (45 assertions), which is unaffected by this patch.

**`npm run e2e:cash` — 14 tests, 0 failures**, confirmed in the combined
57-test run: admin login (a **second role** through the real authorization layer
— `canOperateCaja` rejects Contador) · receipt correctly offering no tax field ·
invoice offering it · create untaxed · add tax with the live total reading
1,150.00 · remove tax to zero · tax + applied payment + retention combining to
10,800.00 through the shared helper · **issue taxed invoice (4-line entry,
revenue 1000, VAT payable 150, receivable 1150)** · issue untaxed (2 lines) ·
issued invoice loses its edit form · missing `IMPUESTO` mapping leaves no posting
record · archived mapping blocks issuing · persistence · mobile · keyboard.

### The environment problem, and what was changed

PostgreSQL is healthy — zero restarts, no OOM, only routine checkpoints. The
failure is Docker Desktop's **host↔container port forward dropping under load**:
`docker exec` always succeeds while the host intermittently gets `P1001`.

Two things were changed outside the repository:

- **`.env`: `@localhost:15432` → `@127.0.0.1:15432`.** Node resolves `localhost`
  to `::1` and Docker's IPv6 forward had stopped working entirely; IPv4 restored
  it. Backup left at `.env.backup-ipv6`. `.env` is gitignored.
- A stale dev server predating that change was still holding port 5173 and had to
  be stopped.

Even on IPv4 the forward still drops sporadically, which is why each run fails at
a different test.

### Three harness defects fixed along the way

- **`Field` appends an asterisk to the accessible name of required fields**
  ("Descripción *"), so `getByLabel(..., { exact: true })` never matches. Scoped
  container anchors replace exact-name lookups.
- The create and edit forms share field names on one screen; every edit
  interaction is now scoped to `cash-edit-form`.
- **Adding an item did not wait for persistence**, so a following reload read a
  stale subtotal. It now waits for the form to clear.

### Files

`src/features/operations/modules/caja-db/caja-documents-db-panel.tsx`,
`caja-db-shared.tsx` (`testId` prop, error anchor),
`e2e/fixtures.ts` (admin user, open turnos, `CAJA_FACTURA` mappings, cash
cleanup), new `e2e/auth-admin.setup.ts`, new `e2e/cash-tax.spec.ts`,
`playwright.config.ts` (per-role projects), `package.json`.

### Behaviour changes

- **Cash invoices and notes can capture, edit and display tax amounts.**
- **Cash receipts deliberately cannot** — the matrix does not admit it.
- **Draft cash documents gain a live total**; they had none.
- **Posting is unchanged from FF2.0-C**; no engine, strategy, mapping or
  arithmetic was touched.

## Patch FF2.1-D - VAT settlement UI

Makes `LIQUIDACION_IVA` reachable. FF2.0-E left the model, the actions, the DTO
and the posting seam complete and **with nobody calling them**; this patch is
that caller. With it, all four FF2 accounting flows are operable from the browser.

### What Phase 0 found missing beyond the panel

- **The DTO carried neither creator nor executor**, both of which the screen has
  to display. `VatSettlementDTO` and `listVatSettlements` gained `branchName`,
  `createdByName` and `executedByName`.
- **`/panel/contabilidad/liquidaciones` was not in `contabilidadRoutes`**, so
  server-side revalidation would have skipped it.
- **The per-section accounting navigation is owned by the legacy
  `AccountingPanel`**, not by the shell. A page that does not render that panel
  has no menu entry at all, so the route was registered there — the only reason
  this patch touches legacy code. The settlement page itself renders no legacy
  panel: the feature was born in FF2.0-E and has nothing to migrate.

### What the screen does, and refuses to do

Create, edit and execute drafts; browse history; filter by branch and period.
Rows show period, branch, amount, status, who registered it, who executed it and
when, plus the existing audit timeline.

**It performs no accounting arithmetic.** FF2.0-E documents in §L-10 that a
settlement records a human decision rather than deriving one from ledger
balances, and this patch preserves that contract exactly: the amount is typed,
stored and displayed unchanged.

**The identity shown is branch + period, never the row id** — the same identity
as the engine's idempotency key and the `@@unique([branchId, period])`
constraint. A test asserts the id never appears in the row.

Editing and executing are offered only while `BORRADOR`, mirroring the server
rule instead of inventing one.

### Runtime verification

`npm run e2e:settlements` — **15 tests, 0 failures on the first clean run**:
create draft · creator shown and "pending" state · edit amount · duplicate
branch+period refused by the unique index with the server's message ·
malformed period refused · **execute produces the 2-line entry (VAT payable
debited 12,500, bank credited 12,500) and stamps the executor** · executed
settlement offers neither Edit nor Execute · missing mapping leaves no posting
record · archived mapping blocks · closed accounting period blocks · persistence
with notes · period filter narrows the list · mobile viewport · keyboard order
and label association.

**Combined run: `npm run e2e` — 57 tests, 0 failures** across all four specs and
both roles. All twelve Prisma suites re-run clean
(41+30+37+34+39+50+34+44+43+45+37+46).

Each test reserves its own period inside a dedicated year (`2031-`), because the
period **is** the settlement's identity on both the business and the engine side.

### Files

new `src/features/operations/modules/contabilidad-db/contabilidad-vat-settlements-db-panel.tsx`,
new `src/app/(operations)/panel/contabilidad/liquidaciones/page.tsx`,
`src/server/contabilidad/shared.ts` + `queries.ts` (DTO),
`src/server/contabilidad/actions.ts` (revalidated route),
`src/features/operations/modules/accounting/accounting-panel.tsx` (nav entry),
new `e2e/vat-settlement.spec.ts`, `e2e/fixtures.ts`, `playwright.config.ts`,
`package.json`.

### Behaviour changes

- **VAT settlements are reachable, creatable, editable and executable** from the
  browser. None of that was possible before.
- **Executed settlements are immutable**, matching FF2.0-E.
- **Posting is byte-for-byte identical to FF2.0-E** — no engine, strategy,
  mapping, validation or arithmetic changed.

## Patch POS1.0-A - Point of Sale domain

Opens a new bounded context. **Nothing here posts, moves inventory or touches
Caja** — that abstention is what makes a separate aggregate legitimate rather
than a duplicate.

### The objection that was raised, and how the patch answers it

Phase 0 initially argued against a new aggregate: `CashDocument` of type
`FACTURA` already carries branch, cashier, shift, customer, `BORRADOR → EMITIDO →
ANULADO`, subtotal, tax, total, line items, payments by method, draft-only
editing, posting on issue and reversal on cancel. `Sale` is a different context
again — one motorcycle unit, tied to a reservation.

The patch answers it directly: the POS is a **retail checkout** (catalogue,
barcode, cart, immediate payment, future inventory), and it **deliberately does
not post**. With no second posting path there is no double-recording risk — the
exact hazard recorded as §L-7 in `POSTING_CONTRACT.md`. That condition is now the
context's contract: a new aggregate is justified **for as long as it does not
post**. When a completed sale eventually emits a cash document, that document
posts, never the POS.

### One thing the file list did not mention, and could not work without

**There is no product catalogue in the repository.** The only one is
`MotorcycleCatalogModel`, and motorcycles are sold through `Sale`. Without a
product model, `PosSaleItem.product` has nothing to reference. `PosProduct` was
added — SKU, barcode, name, price, active — and nothing more, because inventory
and cost are excluded. The barcode field exists because barcode search is the
stated reason the POS needs a catalogue at all.

### Migration

`20260812120000_pos_domain`: one enum and four tables (`pos_products`,
`pos_sales`, `pos_sale_items`, `pos_payments`). Purely additive — no existing
type, table, column or constraint touched.

### Arithmetic

Line: `quantity × price - discount + tax`, floored at zero. Sale: **every stored
figure is the sum of its lines**, and the aggregate is rewritten from them on
every change rather than accumulated, so a stored total cannot drift from what
the lines say.

Treating the sale's `discount` as the sum of the line discounts is the only
reading that needs no extra decision — a header-level discount would require
inventing an order between two discount layers. Recorded as open question P-2.

Money helpers are reused from `finance/money`; TD-01 removed duplicated money
helpers and this context does not reintroduce them.

### Two deviations from the brief, both stated rather than silent

- **Statuses are Spanish** (`BORRADOR`, `COMPLETADA`, `ANULADA`) although the
  brief wrote them in English. Every status enum in the repository is Spanish and
  `SaleStatus` already uses `COMPLETADA`; a mixed-language enum set would be a
  permanent wart. The mapping is exact and a rename is one migration away.
- **`CashPaymentMethod` is reused** instead of declaring a twin enum: the payment
  vocabulary is shared, and the future "completed sale emits a cash document"
  step then needs no translation table.

### Runtime verification

`npm run smoke:pos-domain` — **52 assertions, 0 failures on the first run**, real
PostgreSQL: line and sale arithmetic including the zero floor · draft with no
amounts and no customer · adding items recalculates the aggregate · price taken
from the catalogue unless overridden · inactive product refused · removing an
item recalculates · multiple payments by method · completion stamps the date ·
**a completed sale is immutable against items, payments, cancellation and a
second completion** · completing with no items refused · cancelling a draft ·
duplicate sale number blocked by the unique index · unique SKU and barcode ·
concurrent completion with a single winner · rollback leaving no trace · **and
the POS creates no journal entry, no posting record, no cash document and no
inventory movement**.

All twelve previous Prisma suites re-run clean
(41+30+37+34+39+50+34+44+43+45+37+46).

### Files

`prisma/schema.prisma`, `prisma/migrations/20260812120000_pos_domain/`,
new `src/server/pos/shared.ts`, `queries.ts`, `actions.ts`,
new `prisma/smoke/pos-domain.ts`, `package.json`, new `docs/POS.md`.

### Behaviour changes

- **The repository gains a Point of Sale bounded context**: products, sales,
  lines and payments.
- **No accounting, inventory or cash behaviour changes** — asserted, not assumed.
- Four business decisions are recorded as open in `docs/POS.md`, the most
  consequential being whether a sale may complete without its payments covering
  the total.

## Patch POS1.0-B - Product catalogue workflow

Makes `PosProduct` reachable from the browser.

### Two corrections to the Phase 0 brief

The brief stated there was "no action, no query". Both already existed:
**`createPosProductAction`** and **`searchPosProducts`** shipped with POS1.0-A.
What was genuinely missing was an update action, a route, a UI and a test — plus
the fact that **`/panel/pos` did not exist as a route at all**, so the module had
no page and no menu entry.

### What this patch adds

- **`updatePosProductAction`** — edit any field, and toggle `isActive`.
- **`/panel/pos/productos`** and a panel: create, edit, activate/deactivate,
  list with SKU, barcode, name, price and status, and search.
- **A navigation entry** under Finanzas with the same roles as Caja, because the
  POS reuses `canOperateCaja`. Without it the page would exist and be
  unreachable — the same gap FF2.1-D found in Contabilidad.

### Why there is no draft state to protect

A product has no workflow, so any field is editable at any time. What it has is
`isActive`, and **deactivating is how the catalogue retires an article without
deleting it**: past sale lines reference it and the foreign key is
`ON DELETE RESTRICT`. Deletion is not an operation this model offers, and the
list keeps showing inactive products so they can be brought back.

### Search resolves on the server

The term travels in the URL (`?q=`) and `searchPosProducts` matches it against
exact SKU, exact barcode and partial name. It does **not** filter what the page
already loaded — the only way a barcode scanner finds an article that was not in
the current page of results.

### Runtime verification

`npm run e2e:pos-products` — **14 tests, 0 failures**, real browser against real
PostgreSQL: create with and without barcode · edit name and price · deactivate
and reactivate, with the inactive product still listed · **duplicate SKU refused
with the server's message and the original untouched** · duplicate barcode
refused and nothing created · search by exact barcode · by exact SKU · by partial
name · **search proven to travel through the URL rather than filter the loaded
list** · persistence after reload · keyboard order and `inputmode` · mobile
viewport with no horizontal overflow.

All thirteen Prisma suites re-run clean
(41+30+37+34+39+50+34+44+43+45+37+46+52).

**The combined `npm run e2e` run was 64 passed / 1 failed**, and the failure was
**not in this patch**: `document-tax.spec.ts` reported no active
`DOCUMENTO_FACTURA · SUBTOTAL` mapping at its ninth test, immediately after two
tests that posted documents through that same mapping. Re-run in isolation the
document suite is **15/15 clean**, and the previous combined run was 57/57, so it
is intermittent rather than broken. **The mechanism is not proven** — no
archived-mapping test had run yet at that point — so no root cause is claimed
here. The most likely fragility is that three FF2.1 specs archive and restore the
**same shared mapping set** (`${TAG}-A`); giving each its own throwaway set would
remove the coupling. POS1.0-B touches no mappings and its own suite passed 14/14.

### One harness detail worth recording

The operations shell renders the navigation label as an `<h1>`, so the page
heading appeared twice. Anchors in this suite are scoped to `main` — the same
class of ambiguity that scoped anchors already solved for cash and settlement
forms.

### Files

`src/server/pos/actions.ts` (`updatePosProductAction`),
new `src/features/operations/modules/pos/pos-products-panel.tsx`,
new `src/app/(operations)/panel/pos/productos/page.tsx`,
`src/features/operations/components/operations-shell.tsx` (nav entry),
new `e2e/pos-products.spec.ts`, `e2e/fixtures.ts` (POS cleanup),
`playwright.config.ts`, `package.json`, `docs/POS.md`.

### Behaviour changes

- **POS products are manageable from the browser**: create, edit, activate and
  deactivate.
- **The POS gains its first route and menu entry.**
- **No inventory, accounting or cash behaviour** — the catalogue still holds no
  stock and no cost.

## Patch POS1.0-C - Shopping cart workflow

Turns the POS into a checkout screen. **Nothing is written**: the cart lives in
browser state until a later patch creates the sale.

### The design decision the patch turns on

A till assembles a sale in seconds — scan, fix a quantity, drop a line — and
persisting every keystroke would litter the database with abandoned drafts, one
per customer who changes their mind. So the cart is browser state, and
**reloading clears it by design**. Both facts are asserted, not assumed: one test
reloads and checks the cart is empty, another builds a 5,000 cart and checks no
sale, line or payment exists.

### Search had to stop being a navigation

The catalogue screen (POS1.0-B) puts its search term in the URL, which is right
there: nothing is lost on navigation. **The checkout cannot do that** — navigating
would throw the cart away on every scan. `searchPosProductsAction` was added: a
thin authorized wrapper over the existing `searchPosProducts`, returning products
so the page stays put. A test asserts the URL does not change.

Two screens, two opposite contracts, each for its own reason.

### The browser owns no arithmetic

Lines and totals are computed with `calculatePosLineTotal` and
`calculatePosSaleTotals` — the same functions the server uses in POS1.0-A — so
what the cashier sees cannot diverge from what will be stored. The zero floor is
verified through the UI too: a discount larger than the line leaves it at zero,
never negative.

### Beyond the file list

- **`searchPosProductsAction`**, without which search would have to navigate.
- **A navigation entry** for `/panel/pos/venta`. The catalogue needed one in
  POS1.0-B for the same reason: a page nobody can reach is half-delivered.
- **No checkout button.** The sale is created in a later patch, and a button that
  saved nothing would be worse than its absence — the screen says so instead.

### Runtime verification

`npm run e2e:pos-cart` — **18 tests, 0 failures on the first run**, real browser:
empty cart with zero totals · search does not navigate · add one · add several ·
**repeated scan increases quantity instead of opening a second line** · edit
quantity · override price · line discount · line tax · discount and tax across
two lines (2,250 − 200 + 307.50 = 2,357.50) · **discount larger than the line
floors at zero** · remove line · **reload empties the cart** · **nothing is
persisted** · empty search result · keyboard reachability including Enter to
search · mobile viewport with no horizontal overflow.

All thirteen Prisma suites re-run clean
(41+30+37+34+39+50+34+44+43+45+37+46+52).

### The combined browser run is now unreliable, and that is worth stating

`npm run e2e` returned **67 passed / 3 failed in 19.3 minutes**, one failure in
each of three different suites — document, cash and POS catalogue. **Every one of
those suites passes in isolation** (15/15, 14/14, 14/14), as does this patch's
own (18/18).

Two of the three failures are plain timeouts: a form field not clearing within
20 s, and `waitForLoadState` exceeding 60 s. The third is the recurring
"no active `DOCUMENTO_FACTURA · SUBTOTAL` mapping" reported in POS1.0-B, whose
mechanism is **still unproven** — it fires before any archived-mapping test has
run.

The combined run took 12 minutes two patches ago and 19 now. **The suite is
outgrowing a single-worker run against a dev server**, and the honest reading is
that the failures track load rather than code. Two concrete next steps, neither
taken here: give each archived-mapping test its own throwaway set instead of
sharing `${TAG}-A`, and run the browser suites against a production build rather
than `next dev`, whose on-demand compilation is most of the wall time.

A related symptom appeared while wrapping up: `next build` failed with a
corrupted `.next/dev/types/validator.ts` because the dev server was still writing
into `.next`. Clearing the cache and rebuilding without a server running is
clean. Not a code defect, but the same collision.

### Files

`src/server/pos/actions.ts` (`searchPosProductsAction`),
new `src/features/operations/modules/pos/pos-cart-panel.tsx`,
new `src/app/(operations)/panel/pos/venta/page.tsx`,
`src/features/operations/components/operations-shell.tsx` (nav entry),
new `e2e/pos-cart.spec.ts`, `playwright.config.ts`, `package.json`, `docs/POS.md`.

### Behaviour changes

- **The POS gains a working checkout screen**: search, cart, line editing and
  running totals.
- **No sale is created, no inventory moves, no accounting happens.**
- The cart is deliberately not persisted.

## Patch POS1.0-D - Sale persistence workflow

**The first POS patch that writes data from the browser.** POS1.0-C assembled a
cart and persisted nothing, and said so on screen. This one adds the checkout,
which is the exact boundary where the cart stops being the source of truth.

### The sale is born COMPLETADA

`checkoutPosSaleAction` does not pass through `BORRADOR`. The browser cart **is**
the draft: the assembly phase already happened, and persisting a draft only to
complete it inside the same transaction would be ceremony with no reader.
`BORRADOR` stays reachable through `createPosSaleAction`, so the lifecycle from
POS1.0-A is unchanged — it gained a direct entrance to its terminal state, not a
new state.

### Why a new action rather than the existing ones

The existing path is `createPosSaleAction` + `addPosSaleItemAction` × n +
`addPosPaymentAction` × m + `completePosSaleAction` — **2 + n + m separate
transactions**. A till that abandons midway would leave an orphan sale and its
lines. The checkout writes sale, lines and payments in **one transaction**:
everything or nothing. Verified: deactivating a product between assembly and
checkout fails the checkout and leaves no sale behind.

The incremental actions were **not touched**. They still serve a sale assembled
over time, with the same immutability rule.

### Totals are derived, not accepted

**The action's input has no total field at all** — no total, no subtotal, no tax,
no header discount. The server recomputes every figure from the received lines
with `calculatePosSaleTotals`, the same function the browser uses to display.

This is not a validation, it is an absence: there is no comparison between a
browser total and a server total, because there is no browser total to compare.
A tampered client has nowhere to put the number. Verified that 2 000 + 250 with a
200 discount and 307.50 tax stores exactly 2 357.50.

The **line price** does travel from the browser, exactly as `addPosSaleItemAction`
already allowed. That is a pre-existing business decision — the counter negotiates
price — not a gap opened here.

### The branch is not chosen silently

Whoever has a branch sells in theirs; only a global role gets a selector and must
say which counter records the sale. This follows the repository's own precedent
in `caja/page.tsx` for opening a turno, reusing `desiredBranches` rather than
inventing a second list. The page imports nothing from `server/caja`: it shares
the role predicate from `auth/access`, not Caja's context.

### Customer lookup stays inside the POS

`searchPosCustomers` reads `Customer` directly. It deliberately does **not** reuse
`listCustomers` from CRM, which requires a `CrmScope`: that would couple the till
to another context's authorization model for a read the POS already performs
through `PosSale.customer`.

### What was not decided

**Payment coverage is still not enforced** — P-1 in `docs/POS.md` remains open.
The balance is displayed and nothing more. Whether a till may close short, and
what an overpayment means, is accounting policy nobody has stated; Caja rejects
overpayment, the POS does not opine. Inventing a rule here would be invention.

**There is no server-side idempotency key.** A double click cannot duplicate
because the cart clears on success and the button disables without lines, but
that is interface defence, not server defence: two identical requests sent
outside the browser would create two sales with different numbers. A business key
identifying the checkout does not exist today — `saleNumber` is generated after
the fact. Recorded as **P-5**.

### What reviewing my own implementation turned up

Four defects, all found by rereading the finished code rather than by a test:

**A mistyped payment amount vanished silently.** The panel filtered payments with
`parseAmount(amount) > 0`, so a row containing `abc` was dropped without a word
and the sale was charged short. Only an **empty** row — added and never filled —
is dropped now; anything typed reaches the server, which rejects it. Silent data
loss is exactly the failure mode that is invisible until an audit.

**The checkout leaked raw Prisma text to the till.** The `catch` returned
`error.message` for any error, so a constraint violation or a dropped connection
would have shown the cashier a table name. A `PosCheckoutError` class now marks
the messages this action authored; everything else becomes a generic failure.

**The payment row did not fit a phone.** `w-40 + w-36 + button` is roughly 360 px
inside a card that leaves ~342 px at 390 px wide. The existing mobile test passed
only because it never added a payment — the widths are flexible now, and the test
adds one.

**The new "Buscar cliente" button broke an existing suite.** `pos-cart.spec.ts`
located the search button by the non-exact name `"Buscar"`, which now also matches
`"Buscar cliente"` — a Playwright strict-mode violation in three places. Fixed
with `exact: true`.

### A prior assertion had to be corrected

`e2e/pos-cart.spec.ts` asserted `posSaleItem.count() === 0` and
`posPayment.count() === 0` — globally. That was true while nothing in the POS
wrote. Now that checkout exists, a global zero would be a statement about the
rest of the suite rather than about the cart, and would fail depending on file
order. Both assertions now measure against a before-count, which is what they
always meant: **assembling** a cart writes nothing.

### Verification

**SUITE-POS1.0-D — 22 tests, 22 passing** in a real browser against the real
database with a real admin login: cash checkout · server-generated sale number ·
mixed payment · **stored totals equal the server-derived ones** · per-line
discount and tax · overridden price · sale without customer · sale with customer ·
notes · **cart clears after checkout** · a second checkout does not duplicate ·
no checkout without items · **product deactivated mid-sale: checkout fails and
leaves nothing** · the sale appears after reload through the query layer · an
invalid payment amount is rejected rather than dropped · an empty payment row does
not block the checkout · balance shown while charging · **zero journal entries,
posting records, cash documents and inventory movements** measured before and
after · a global role picks the branch and the sale lands there · checkout
activatable by keyboard · usable on mobile with no horizontal overflow.

**The combined run passed for the first time in three patches: `npm run e2e` —
108 tests, 108 passing, 10.6 minutes**, against 67/3 in 19.3 minutes reported in
POS1.0-C. The database ends with **zero remaining fixtures**, verified by counting
every tagged entity plus the whole `PosSale` / `PosSaleItem` / `PosPayment` tree.

**This does not prove the earlier flakiness is fixed**, and nothing here was aimed
at it. What changed is that this run started from a deleted `.next`; the honest
reading is that a stale or production-poisoned cache is now a live suspect
alongside load, not that the mechanism is understood. The shared `${TAG}-A`
mapping set is still shared.

A fixture customer had to be added: the seeded database has none, so the customer
test would have silently skipped rather than covered anything.

All thirteen Prisma suites re-run clean (532 assertions, 0 failures). `next build`
clean. Lint shows only the repository's pre-existing debt; no POS or e2e file is
flagged.

### The `.next` collision, in the other direction

POS1.0-C reported `next build` failing because the dev server was writing into
`.next`. The reverse also breaks: running `next build` **before** `npm run e2e`
leaves a production `.next` that `next dev` then serves from, and **every route
returns 404** — both auth setups failed and 106 tests did not run, at a cost of
one full twenty-minute cycle. Deleting `.next` between a build and a browser run
is not optional. This reinforces the standing recommendation to run the browser
suites against a production server rather than `next dev`.

### Files

`src/server/pos/actions.ts` (`checkoutPosSaleAction`, `searchPosCustomersAction`),
`src/server/pos/queries.ts` (`searchPosCustomers`),
`src/features/operations/modules/pos/pos-cart-panel.tsx`,
`src/app/(operations)/panel/pos/venta/page.tsx`,
new `e2e/pos-sale.spec.ts`, `e2e/pos-cart.spec.ts` (corrected assertion),
`e2e/fixtures.ts` (customer fixture + cleanup), `playwright.config.ts`,
`package.json`, `docs/POS.md`.

### Behaviour changes

- **The POS checkout persists sales.** A completed sale, its lines and its
  payments are written in one transaction.
- **A sale created from the till is `COMPLETADA` immediately** and therefore
  immutable — it cannot be cancelled, by the lifecycle POS1.0-A established.
- **Still no posting, no inventory movement, no cash document.**

## Patch POS1.1-A - Product catalogue foundation

Gives `PosProduct` the metadata that inventory, purchasing and costing will need.
**It moves no stock**, and the smoke suite proves it by querying
`information_schema`.

### Phase 0 — what already existed

| Concept | Present? | Action |
|---|---|---|
| Generic Product outside the motorcycle catalogue | **No.** Only `MotorcycleCatalogModel` and `PosProduct`. | Extended `PosProduct`. |
| Category | **No.** `TicketCategory` / `ExpenseCategory` are enums of other domains that do not describe articles. | New `PosCategory`. |
| Brand | **No table.** `MotorcycleCatalogModel.brand` and `MotorcycleUnit.brand` are free text on another aggregate. | New `PosBrand`. |
| UnitOfMeasure | **No.** Nothing in the repository. | New `PosProductUnit` enum. |
| TaxRate | **No.** See below. | New inert `defaultTaxRate` column. |
| Supplier belonging to Purchasing | **Yes** — `ThirdParty` with `type = PROVEEDOR`, branch-scoped. There is no Purchasing module. | **Untouched.** This patch links no suppliers. |
| Inventory | **Yes, but serialized.** See below. | **Untouched.** |

### The inventory that exists cannot represent a till article

`MotorcycleUnit` + `InventoryMovement` is **serialized** inventory: every
motorcycle is an individual unit with a unique `chassisNumber`, and
`InventoryMovement.motorcycleUnitId` is **required**. **There is no quantity field
anywhere in the inventory model.**

A till article is fungible — twelve helmets, not twelve individually identified
helmets. The existing inventory therefore cannot represent it without a schema
change, so this patch neither reuses nor extends it: doing so would redesign
motorcycle inventory in passing. Recorded as **PL-6**.

### The tax rate is the repository's first percentage

**The repository declares no tax rate anywhere.** Every piece of tax introduced in
FF2.0 is an **amount**: `AccountingDocument.tax`, `CashDocument.tax`,
`PosSaleItem.tax`, and the posting engine's `IMPUESTO` component consumes amounts.

The default is therefore **0, not 15**. Writing Nicaragua's rate here would invent
fiscal policy in a repository that has deliberately never stated one. The
sanitizer's 0–100 bound is arithmetic, not fiscal.

**Nothing derives tax from the field.** Checkout still takes the amount it
receives per line. Computing it automatically would change checkout's behaviour
silently, and this patch changes no workflow. When and where the rate applies is
**P-6**.

### Cost and minimum stock already existed — per branch

`AccountingInventoryCost` holds `unitCost` and `minimumStock` keyed
`@@unique([branchId, modelSlug])`. The business has already treated these as
**branch facts**.

They cannot be reused — that table is bound to `modelSlug` / `catalogModelId`,
which are motorcycle-shaped — but their existence matters, because `PosProduct` is
**global** and has no branch. The values added here are therefore **catalogue
defaults, not branch figures**. If the POS needs a different cost or threshold per
branch, an override table is required. **P-7**, not invented here.

### Threshold is not balance

`minimumStock` and `reorderPoint` are different things: the first is the floor
below which stock is a problem, the second the level at which reordering makes
sense — normally higher, because it covers lead time. **Neither is a balance and
neither is read.** Both are `Decimal(12,3)` like `PosSaleItem.quantity`, because a
till article can be sold in litres; this diverges from `AccountingInventoryCost`'s
`Int`, where the unit is a motorcycle and fractions mean nothing.

### Smaller decisions, with their reason

- **Unit is an enum, not a table.** The brief authorized tables only for category
  and brand, and the repository resolves every closed vocabulary this way. A table
  would invite "unidad", "Unidad", "und", "u." coexisting. Widening it is a
  migration, and that friction is wanted.
- **Relations are `RESTRICT`, not `SET NULL`.** Deleting a category in use must
  fail, not silently blank the field on the products referencing it. Retiring one
  is `isActive`, exactly as with a product.
- **POS brand is a table while motorcycle brand is text.** A real repository
  inconsistency, recorded rather than resolved: normalizing the motorcycle side is
  a data migration outside this patch.
- **Categories and brands share their action implementation**, because their shape
  is identical today. Duplicating two functions in case they diverge would invent a
  difference that does not exist. The shared helper branches with a ternary rather
  than casting the Prisma delegate — a cast would typecheck while lying about which
  table is in use.

### Migration compatibility

One type, two tables and nine columns, every one nullable or defaulted. No
existing column, constraint or index is modified. The smoke creates a product with
**exactly the pre-patch shape** and asserts it stays valid and picks up ten inert
defaults.

### `next build` caught what `tsc` could not, again

The four lookup-action wrappers were declared non-`async`. In a `"use server"`
file **every export must be an async function**; returning the promise typechecks
and fails the build. Same lesson recorded in FF1.4-F, and the same reason
`next build` stays in the verification list.

### Verification

**SMOKE-POS1.1-A — 66 assertions, 0 failures** against real PostgreSQL: **a
pre-patch-shaped product is still creatable** and acquires ten inert defaults ·
category and brand name uniqueness · creation with all nine metadata fields ·
edition, reassignment and unassignment · **`RESTRICT` verified** — a category in
use cannot be deleted and the failed attempt blanks nothing · non-existent
category rejected by the foreign key · **SKU and barcode uniqueness survive**, and
several products without a barcode coexist · rate and threshold sanitizers,
including that zero is valid for a threshold and not for a quantity · **all eight
TypeScript units are writable into the PostgreSQL enum** · and **no inventory,
accounting, cash or sale records**, with `information_schema` confirming
`pos_products` has no `stock`, `quantity` or `on_hand` column.

All fourteen Prisma suites clean (598 assertions). `next build` clean after the
async fix. Lint shows only pre-existing debt.

**The combined browser run regressed to the known flakiness: 100 passed, 1 failed,
7 did not run (15.6 min).** The failure is `expense-tax.spec.ts:207` — a reviewed
expense stayed `REGISTRADO` instead of becoming `REVISADO` — and because that file
runs in `serial` mode, the seven tests after it never started.

**It is not caused by this patch.** POS1.1-A touches `prisma/schema.prisma`
(`PosProduct`, `PosCategory`, `PosBrand`), `src/server/pos/*`, a new smoke,
`package.json` and docs. It touches no expense, accounting or posting code path.
**The suite passes 14/14 in isolation** (`npm run e2e:expenses`), which is the same
signature reported in POS1.0-C: whole suites that pass alone and fail under the
combined single-worker run against a dev server.

The clean 108/108 recorded in POS1.0-D therefore did **not** mean the flakiness was
fixed, exactly as that entry warned. The two open leads are unchanged: the shared
`${TAG}-A` mapping set, and running the browser suites against a production server
instead of `next dev`.

### Files

`prisma/schema.prisma`, new
`prisma/migrations/20260813120000_pos_product_catalogue/`,
`src/server/pos/shared.ts`, `src/server/pos/queries.ts`,
`src/server/pos/actions.ts`, new `prisma/smoke/pos11a-product-catalogue.ts`,
`package.json`, `docs/POS.md`.

### Behaviour changes

- **Products carry business metadata required by inventory.** All of it is inert:
  no code reads it.
- **POS behaviour is unchanged.** No screen, no checkout path and no existing
  action behaves differently.
- **Inventory is still not implemented**, and the existing one still cannot
  express a fungible article.

## Patch POS1.1-B - Inventory foundation

Introduces the retail inventory model. **Nothing here changes a single stock
balance.** The structures exist so that later purchasing, sales and adjustment
patches have somewhere legitimate to write.

### Phase 0 — why the existing inventory could not be reused

`MotorcycleUnit` + `InventoryMovement` is **serialized asset inventory**: each
motorcycle is one unit identified by its chassis number,
`InventoryMovement.motorcycleUnitId` is **required**, and **there is no quantity
field anywhere in that model**.

Twenty oil filters are twenty interchangeable pieces, not twenty individually
identified assets. Extending the current inventory would break the three
constraints that protect motorcycle sales today — `Sale.motorcycleUnitId @unique`
("one sale per unit"), the terminal states of `MotorcycleUnitStatus`, and the
irreversibility of egress. That is redesigning the motorcycle workflow disguised
as extending the POS.

The two models stay independent. Verified: the smoke queries `information_schema`
and confirms no new table has a column mentioning motorcycles.

### The four aggregates

- **`PosWarehouse`** — a physical warehouse or store location. It holds **no stock
  and no accounting information**; it only says where. **It cannot exist without a
  branch**, unlike products, which stay global. Unique **per branch**
  (`@@unique([branchId, code])`), not globally: "PRINCIPAL" must be able to exist
  in Granada and in Rosita at once.
- **`PosInventory`** — the balance of one product inside one warehouse, identity
  `@@unique([warehouseId, productId])`. **Every balance starts at zero**, and
  `openPosInventoryAction` **accepts no initial quantity**: a non-zero opening
  balance is an `INICIAL` movement, and that workflow does not exist yet. Accepting
  one here would create stock with no ledger entry explaining it.
- **`PosInventoryMovement`** — an inventory event carrying the balance before and
  after. **No `updatedAt`**, exactly like `InventoryMovement`: that absence is how
  this schema says "append only".
- **`PosInventoryMovementType`** — the vocabulary.

### Why balances are stored

**This is the repository's first denormalized stock value, and the duplication is
intentional.** A pure movement ledger would require replaying the entire history to
answer "how many filters do I have?". Motorcycle inventory avoids that cost because
each unit is already one row; retail inventory is not.

**The obligation that decision buys: every future mutation must update movement and
balance inside the same transaction.** The patch that introduces the first mutation
inherits that duty.

### The enum is in Spanish

The brief stated the types in English. They are implemented in Spanish because
`InventoryMovementType` already is — `INGRESO`, `VENTA`, `AJUSTE`,
`TRASLADO_SALIDA`, `TRASLADO_ENTRADA` — and two movement enums in two languages
sitting next to each other would be a permanent mark. Same reasoning accepted for
the sale states in POS1.0-A.

INITIAL→`INICIAL`, PURCHASE→`COMPRA`, SALE→`VENTA`, ADJUSTMENT→`AJUSTE`,
TRANSFER_IN→`TRASLADO_ENTRADA`, TRANSFER_OUT→`TRASLADO_SALIDA`,
RETURN→`DEVOLUCION`. The correspondence is exact; switching to English is a rename
migration.

A **new** enum rather than reusing `InventoryMovementType`: that one carries
`RESERVA` and `ENTREGA`, which only mean something for a serialized unit, and lacks
`INICIAL`, `COMPRA` and `DEVOLUCION`. Reusing it would import dead vocabulary and
omit half of what is needed.

### Movement quantity is signed

So that `quantityAfter = quantityBefore + quantity` holds for every type without
the type having to encode direction. An entry is positive, an exit negative, and
**the invariant is checkable on its own**. Verified in both directions. A zero
movement is rejected: a movement that moves nothing is not a movement — the same
rule the posting engine applies to zero-amount components.

### Negative stock remains undecided

**The repository contains no rule stating whether stock may go below zero**, so
this patch does not invent one. Balances accept zero, and the sanitizer **does not
reject negatives either** — burying that rule inside a shape sanitizer would be the
worst place to hide it. Whether sales may consume unavailable inventory becomes
**P-8**.

### A race condition found by reviewing, not by testing

`openPosInventoryAction` read the balance row, found none, then created it. Two
concurrent calls both pass the check and the second hits the unique index — **with
no `try/catch`, so it threw an unhandled exception instead of returning a result**.
The loser of the race now re-reads and returns the row that won, which is what
"make sure this product exists in this warehouse" meant all along. A smoke case
reproduces the race with `Promise.allSettled` and asserts exactly one row survives.

### Cost remains descriptive

`PosProduct.cost` from POS1.1-A is still descriptive only. There is no valuation:
no weighted average, no FIFO, no specific cost. Outside this patch.

### Verification

**SMOKE-POS1.1-B — 51 assertions, 0 failures** against real PostgreSQL: warehouse
creation, default-active, branch-bound · **duplicate code rejected within a branch
and accepted in another** · multiple warehouses per branch · retirement via
`isActive` · balance row created **at zero** · **a product cannot hold two balances
in one warehouse** and can in different ones · multiple products per warehouse ·
movement with mandatory reason and author · **the `after = before + quantity`
invariant on entry and exit** · three decimals surviving Postgres · all seven types
writable into the enum · **`RESTRICT` verified** — neither a warehouse in use nor a
product with stock can be deleted, and the failed attempt deletes nothing · foreign
keys rejecting non-existent warehouse and product · sanitizers (zero movement
rejected, negative balance **accepted** because P-8 is open) · **zero motorcycle
units and zero `InventoryMovement`**, with `information_schema` confirming no new
table mentions motorcycles · zero accounting entries, postings, cash documents and
sales · the ledger **without `updated_at`** · and **no balance moved: all still zero
at the end**, which is the patch's central promise.

All fifteen Prisma suites clean (**649 assertions, 0 failures**). `next build`
clean. Lint flags no file in this patch. `prisma migrate status` clean at 26
migrations.

### Files

`prisma/schema.prisma`, new
`prisma/migrations/20260814120000_pos_inventory_foundation/`,
`src/server/pos/shared.ts`, `src/server/pos/queries.ts`,
`src/server/pos/actions.ts`, new `prisma/smoke/pos11b-inventory-foundation.ts`,
`package.json`, `docs/POS.md`.

### Behaviour changes

- **The repository gains a dedicated retail inventory model**, independent from the
  serialized motorcycle one.
- **No workflow uses it yet.** No sale, purchase, accounting entry or balance
  changes automatically.
- The model exists solely so future patches have somewhere legitimate to write.

## Patch POS1.1-C - Inventory receipt workflow

**The first workflow in the repository that changes retail stock.** Its scope is
deliberately narrow: register a manual inventory receipt. No purchasing, no
suppliers, no invoices, no costing, no accounting, no cash, no transfers, no
adjustments, no consumption.

### Phase 0

| Question | Finding |
|---|---|
| Does any workflow already mutate `PosInventory` / `PosInventoryMovement`? | **No.** Only `openPosInventoryAction` creates a zero row; `PosInventoryMovement` had never been written by any action. This is genuinely the first mutation. |
| Can the serialized pattern be reused? | **No.** `registerIngress` and `addMovement` write `InventoryMovement`, which requires `motorcycleUnitId`. They are typed for the serialized model. |
| Decimal helpers | `src/server/finance/money.ts` is canonical since TD-01. **`sanitizePosQuantity` from POS1.0-A already means "three decimals, strictly positive"** — exactly the receipt rule. No new arithmetic was added. |
| Authenticated user | `requireAuth()` in `auth/context.ts`, already wrapped by `authorizePos()`, which returns `userId`. No second pattern. |
| Transactions | 83 `$transaction` call sites. Long transactions are avoided by sanitizing and resolving before opening one. |
| Append-only models | Seven models have `createdAt` and no `updatedAt`: `InventoryMovement`, `UserAuditLog`, **`PosInventoryMovement`**, `FinancialAuditEvent`, `TicketComment`, `TicketParticipant`, `TicketEvent`. Same philosophy confirmed. |
| Negative stock | **Still no business rule.** P-8 stays open; a receipt only adds, so the question is not put to it. |

### The mutation contract

Inside **one transaction**, in this order: lock and read the balance
(`SELECT … FOR UPDATE`) → create the movement carrying before/quantity/after →
update the balance to that same after.

**Never a balance without a movement; never a movement without a balance update.**
Sharing a transaction means there is no observable intermediate state. Verified by
forcing a failure precisely between step 2 and step 3: neither survives.

The `after` written into the movement is the **same object** stored on the
balance, not a recomputation — two separate calculations could diverge, one
cannot. Arithmetic is in `Decimal`, not floating point: a balance carried
movement by movement cannot afford float drift. Verified: 2.5 + 0.125 is exactly
2.625.

### Concurrency: why pessimistic locking

`lockPosInventory` **copies `lockJournalEntry`** from `contabilidad/actions.ts`,
which already solves the same problem. No second concurrency pattern is invented
for the same repository.

PostgreSQL runs READ COMMITTED by default, where reading and then writing a
computed value **does** lose updates. `FOR UPDATE` serializes competitors on the
row: the second waits for the first to commit and reads the updated balance.

**Atomic increment was rejected** (`SET quantity = quantity + n`), despite also
being immune to lost updates, for two reasons:

1. **`quantityBefore` would be derived, not read.** In an audit ledger, computing
   the "before" by subtracting from the "after" is a fiction that holds only while
   nothing else writes the balance by another path.
2. **The contract must serve the workflows that follow.** A sale consuming stock
   must **decide** — "is there enough?" — before writing, and a decision requires a
   lock: an increment cannot reject itself. This patch fixes the contract every
   future inventory workflow inherits, so it is built on what generalizes.

**The test has teeth, and that was verified.** Ten concurrent receipts leave the
balance at exactly 10, with no two movements sharing a `quantityBefore` — they
chain 0→1→…→9. **Removing the `FOR UPDATE` makes the same suite fail**, with the
balance at 3 instead of 10 and the "before" values colliding at
`0,1,1,1,1,1,2,2,2,2`. A concurrency test that would also pass without the lock
proves nothing, so it was checked that it does not.

### Business rules

- **Quantity is strictly positive**, sanitized with the pre-existing
  `sanitizePosQuantity`. Zero and negative rejected.
- **Warehouse and product must exist and be active**, checked **inside** the
  transaction: what was read before opening it may have changed, and a product
  deactivated midway must not get in anyway.
- **Reason is mandatory**, as in `InventoryMovement`.
- **The receipt does not create the balance.** If the `PosInventory` row is
  missing the receipt is rejected — opening it belongs to `openPosInventoryAction`
  (POS1.1-B). Creating it here would hide a decision ("this product is now stocked
  in this warehouse") inside an operation that claims to do something else.
  Verified the rejection creates nothing.

### The movement type is an approximation, and it is flagged

A manual receipt is recorded as `COMPRA`. That is the closest value in the
vocabulary, but **a manual receipt is not necessarily a purchase** — it may be an
opening load or a correction. The POS1.1-B vocabulary has no value for "manual
entry with no origin", and adding one without knowing whether the business
distinguishes those cases would be inventing it. Tied to **P-9**.

### Verification

**SMOKE-POS1.1-C — 50 assertions, 0 failures** against real PostgreSQL: first
receipt into zero stock · successive receipts accumulating · **exact decimals** ·
independent products and warehouses · zero and negative quantity rejected ·
inactive warehouse and product rejected · empty reason rejected · **no open
balance means rejection, not creation** · foreign keys and `RESTRICT` over
warehouse, product and author · **the `after = before + quantity` invariant across
every movement** · **the stored balance equals the sum of its ledger** · **a
failure forced between movement and balance leaves neither** · **ten concurrent
receipts landing exactly on 10** · and zero accounting entries, postings, cash
documents, motorcycle units, serialized movements and POS sales.

All sixteen Prisma suites clean (**699 assertions, 0 failures**). `next build`
clean. Lint flags no file in this patch. `prisma migrate status` clean at 26
migrations — **this patch adds no migration**: POS1.1-B's schema already had
everywhere to write.

### Files

`src/server/pos/actions.ts`, new
`prisma/smoke/pos11c-inventory-receipts.ts`, `package.json`, `docs/POS.md`.

### Behaviour changes

- **The repository gains its first workflow that legitimately changes retail
  inventory.**
- **No other subsystem changes.** Motorcycle inventory stays completely
  independent, accounting untouched, cash untouched, POS checkout untouched.
- This patch establishes the inventory mutation contract every future inventory
  workflow must obey.

## Patch POS1.1-D - Inventory adjustment workflow

**The second workflow that changes retail stock**, and the proof that POS1.1-C's
contract is reusable without modification.

### Phase 0

**Could POS1.1-C's transaction be reused unchanged? No — and the reason is
precise.** The transactional body was entirely general, but three things were
baked into `registerPosInventoryReceiptAction` that belong to *receipts*, not to
the engine: the strictly-positive sanitizer, the hardcoded `COMPRA` type, and the
rejection message. **The answer was to extract the engine, not duplicate it.** The
transaction contract itself did not change by one line.

**Does a motorcycle adjustment already exist? Yes**, and it cannot be reused.
`inventory/shared.ts` declares
`{ value: "ADJUSTMENT", label: "Ajuste de inventario", status: "EXITED", movement: "AJUSTE" }`,
consumed by `registerEgress`. It operates on a serialized `MotorcycleUnit`, leaves
it in the **terminal** state `EXITED`, writes `InventoryMovement` (which requires
`motorcycleUnitId`), and **has no quantity**. There, "adjustment" means "this
particular motorcycle left inventory", not "the count changed by n".
`VoucherType.AJUSTE` is an accounting voucher — a third, unrelated domain.

**Terminology**: the repository already pairs a mandatory `reason` with optional
`notes` (4 and ~30 occurrences). `comment` exists only as `TicketComment`, a
different entity; `observations` appears once on `CreditApplication`.
`PosInventoryMovement` already carried exactly that pair.

**Schema**: no change needed. `AJUSTE` was already in the enum and `quantity` was
already signed.

### One engine, two entry points

`applyPosInventoryMovement` is now the engine, shared byte for byte: same
`FOR UPDATE` lock, same order, same transaction, same invariant. Each workflow
contributes only what is its own:

| | Receipt (POS1.1-C) | Adjustment (POS1.1-D) |
|---|---|---|
| Sanitizer | `sanitizePosQuantity` (POS1.0-A) | `sanitizePosMovementQuantity` (POS1.1-B) |
| Quantity | Strictly positive | **Signed**, non-zero |
| Type | `COMPRA` | `AJUSTE` |

**Neither sanitizer is new.** Both already existed and mean exactly what each
workflow needs. No arithmetic was added.

### Negative stock: this patch does not decide (P-8)

A negative adjustment larger than the balance takes it below zero, and **there is
no line that checks for it**.

**That is not new permissiveness.** The repository has never contained that rule,
`sanitizePosInventoryQuantity` documented the gap back in POS1.1-B, and writing it
here — in either direction — would be inventing operating policy inside a patch
that claims to do adjustments. **Silently rejecting it and silently allowing it by
new policy are the same mistake with opposite signs.**

What is preserved is the **absence** of the rule, and the smoke verifies it as an
absence: −10 against a balance of 4 leaves −6, the invariant holds, and the
assertion says explicitly that the engine *does not check the sign* — not that the
negative is correct.

### The concurrency test had to be rebuilt, and that was my error

POS1.1-C asserted that no two movements share a `quantityBefore`. **That is valid
only for receipts**, where everything adds and the balance rises monotonically.
With mixed-sign adjustments the balance goes up and down, revisits the same value,
and two movements can legitimately read it: twelve concurrent adjustments produced
`100,102,104,106,108,110,112,111,110,109,108,107`, where 110 and 108 repeat with
**nothing wrong**.

The correct test under mixed signs is that **the chain has no breaks**: walk from
the opening balance consuming movements, and every one must fit. Twelve concurrent
adjustments — six of +2 and six of −1 — land on exactly 106 and chain without
gaps. **Removing the `FOR UPDATE` makes it fail** with the balance at 102 and three
orphaned movements, so the new assertion has teeth too.

### Verification

**SMOKE-POS1.1-D — 53 assertions, 0 failures** against real PostgreSQL: positive
and **negative** adjustment · exact decimals (10 − 0.375 = 9.625) · adjustment onto
a zero balance with no prior receipt · chained successive adjustments · **P-8
preserved as an absence** · zero quantity and empty reason rejected · inactive
warehouse and product rejected · **no open balance means rejection, not creation**
· foreign keys and `RESTRICT` over warehouse, product and author · **the invariant
across every movement, including below zero** · **balance equals ledger sum for
three products** · **a failure forced between movement and balance leaves neither**
· **twelve mixed concurrent adjustments landing on exactly 106, chaining without
breaks** · **receipt and adjustment share the engine**, verified because both types
satisfy the same invariant and carry reason and author, and no receipt is negative
· and zero accounting entries, postings, cash documents, motorcycle units,
serialized movements and POS sales.

All seventeen Prisma suites clean (**752 assertions, 0 failures**). `next build`
clean. Lint flags no file in this patch. `prisma migrate status` clean at 26
migrations — **no migration in this patch either**.

### Files

`src/server/pos/actions.ts`, new
`prisma/smoke/pos11d-inventory-adjustments.ts`, `package.json`, `docs/POS.md`.

### Behaviour changes

- **The repository gains its second inventory workflow.** Receipts and adjustments
  now share one mutation engine.
- **`registerPosInventoryReceiptAction` was refactored onto the extracted engine.**
  Its behaviour is unchanged — same sanitizer, same type, same messages — and
  SMOKE-POS1.1-C still passes unmodified, which is the evidence for that claim.
- **No other subsystem changes.** Motorcycle inventory independent, accounting
  untouched, cash untouched, POS checkout untouched.

## Patch POS1.1-E - Inventory consumption from POS sales

**The first workflow that consumes retail inventory**, and the third entry point
into the same mutation engine. PL-1 falls here: a completed till sale now
discounts stock.

### Phase 0

**1. How checkout persists a sale, and where consumption belongs.**
`PosCartPanel.checkout()` → `checkoutPosSaleAction` → authorize → sanitize lines
and payments outside the transaction → resolve the branch by code → `$transaction`:
verify products active, verify customer, compute totals, `posSale.create` with
nested items and payments → commit → `revalidatePos()`.

Consumption belongs to **the transition into `COMPLETADA`, not to "checkout"**.
There are two paths into that state: `checkoutPosSaleAction` and
`completePosSaleAction` (the incremental draft path). **Only checkout consumes** —
not by oversight: `completePosSaleAction` receives a `saleId`, and **a sale stores
no warehouse**, so that path cannot say where to discount from without someone
inventing the answer. Recorded as **P-12** rather than papered over: a sale
completed the incremental way does **not** discount, and that is a real
inconsistency in the repository.

**2. Can `applyPosInventoryMovement` be reused unmodified? Yes — not one line
changed.** It already takes a signed quantity and a movement type, verifies
warehouse and product inside the transaction, locks `FOR UPDATE`, writes the
movement and updates the balance. A sale is a caller that passes a negated
quantity and `VENTA`.

**3. Sales are the third entry point**, alongside receipts and adjustments. No
second engine was needed and none was written.

**4. Does inventory know which sale moved it? No.** `PosInventoryMovement` has
relations to warehouse, product and author, and **nothing to `PosSale`**. The
consequence is concrete: the only trace is the `reason` text (`Venta POS-…`),
readable by a person but **not a foreign key**, so "which movements did this sale
generate?" cannot be answered by relation, and a future return has nothing to
reverse against. The brief listed this under DO NOT DECIDE, so no relation was
invented — **P-13**.

**5. Does `PosSale` store a warehouse? No.** It has `branchId` only, and a branch
may hold several warehouses. Consumption therefore cannot deduce it, and picking
one — "the first active" — would be inventing a selection rule. **The warehouse
became required input**, chosen by the operator in a selector, exactly as the
branch is in POS1.0-D.

**6. Negative stock: still no business rule.** P-8 remains unanswered and the
absence is preserved: nothing checks whether a sale leaves the balance below zero.

**7. Locking**: the repository uses `SELECT … FOR UPDATE` (`lockJournalEntry`,
then `lockPosInventory`). Sales inherit it unchanged through the shared engine. No
optimistic locking was introduced.

**8. Existing "checkout never touched inventory" assertions.** Both surviving
assertions — `pos-domain.ts` and `pos-sale.spec.ts` — count `InventoryMovement`,
the **serialized** model, which this patch still does not touch, so they remain
true and were left alone. The browser assertion was **extended** to also count
`PosInventoryMovement` and require it to grow by one, turning a promise of
inaction into a proof of action. `docs/POS.md` PL-1 was rewritten.

### The warehouse must belong to the sale's branch

Nothing enforced this, and a sale in Rosita could have discounted a Granada
warehouse. **That is not an invented rule**: `PosWarehouse.branchId` is mandatory,
everything holding stock in this repository is branch-scoped, and moving stock
between branches requires a transfer — which POS1.1-B deliberately excluded.
Without the check, two branches would silently go out of balance. Verified that
the cross-branch attempt is rejected and touches no balance. If the business runs
a central warehouse serving several branches, this blocks it — **P-14**.

### Deterministic lock ordering

Lines are sorted by `productId` before consuming. Two simultaneous checkouts
sharing articles would otherwise lock balances in the order their lines arrive; if
one cashier sells A,B and another B,A, each transaction would wait on the lock the
other holds and PostgreSQL would abort one for deadlock. Sorting makes every
checkout request locks in the same sequence, which is the standard way a deadlock
cannot form.

### Atomicity and concurrency

Consumption happens **inside the same transaction that persists the sale**, so
there can be no completed sale without its consumption and no consumption without
its sale. Verified by forcing a failure **after** the first movement of a two-line
sale: no sale, no movement, no balance change survives.

Ten simultaneous checkouts of the same article leave the balance at exactly 90 and
the ten consumptions chain without breaks. **Removing the `FOR UPDATE` makes it
fail** — balance 96, six consumptions lost, six orphaned movements — so the
concurrency assertion has teeth.

### What was not decided

- **Sufficient stock is not checked.** A sale may drive the balance below zero,
  exactly as a negative adjustment may, because **P-8 is still unanswered**. Same
  absence as POS1.1-B and POS1.1-D, not new permissiveness.
- **The movement does not reference the sale** — P-13.
- **A cancelled sale does not restore stock**, because a till sale is born
  `COMPLETADA` and immutable — P-15.
- **Warehouse selection is not configurable** — the operator states it — P-14 for
  the central-warehouse case.

### Verification

**SMOKE-POS1.1-E — 49 assertions, 0 failures** against real PostgreSQL:
single-line sale discounting · multi-line sale · **exact decimals (20 − 1.5 =
18.5)** · independent warehouses · balance equal to its movement ledger for three
pairs · movement type `VENTA` with negative quantity · author stored · mandatory
reason naming the sale · inactive product and inactive warehouse rejected ·
**cross-branch warehouse rejected** · **missing balance rejected instead of
created** · **failure after the first consumption leaves no sale, no movement and
no balance change** · **ten concurrent checkouts landing on exactly 90 and chaining
without breaks** · **all three flows share the engine**, verified because every
movement satisfies the same invariant and carries reason and author, no sale adds
and no receipt subtracts · and zero accounting entries, postings, cash documents,
motorcycle units and serialized movements.

**SUITE-POS1.0-D — 23 tests, 23 passing** in a real browser, including the new
`cobrar descuenta existencias de la bodega`, which drives the real action and
asserts the balance drop and the stored movement.

All eighteen Prisma suites clean (**801 assertions, 0 failures**). `next build`
clean. Lint clean for every file in this patch. `prisma migrate status` clean at
26 migrations — **no migration**: POS1.1-B's schema already had everywhere to
write.

### Files

`src/server/pos/actions.ts`,
`src/features/operations/modules/pos/pos-cart-panel.tsx`,
`src/app/(operations)/panel/pos/venta/page.tsx`,
new `prisma/smoke/pos11e-inventory-consumption.ts`,
`e2e/fixtures.ts`, `e2e/pos-sale.spec.ts`, `package.json`, `docs/POS.md`.

### Behaviour changes

- **A till sale now consumes retail inventory**, atomically with the sale.
- **`checkoutPosSaleAction` gained a required `warehouseId`.** This is a breaking
  change to its contract; the checkout screen gained a warehouse selector, and
  without an active warehouse the checkout button stays disabled.
- **A sale is rejected when a line has no open balance in the chosen warehouse.**
  Opening balances remains POS1.1-B's job.
- **A sale is rejected when the warehouse belongs to another branch.**
- **`completePosSaleAction` still does not consume** — P-12.
- Motorcycle inventory, accounting, cash and posting remain untouched.

## Patch POS1.2-B - Purchase receipt workflow

**The fourth caller of the inventory engine**, and the first that also advances a
document. Receiving is the only responsibility: no supplier invoices, no accounts
payable, no accounting, no costing, no payments, no purchase returns.

### Phase 0

| Question | Finding |
|---|---|
| How are Purchase Orders persisted? | Sanitize outside, then one `$transaction`: supplier verified (exists, `PROVEEDOR`, active), products verified active, totals derived, `create` with nested items. Transitions use `updateMany` with the status in the `WHERE`. |
| How are inventory mutations performed? | `applyPosInventoryMovement`: verify warehouse and product, `FOR UPDATE`, read before, compute in `Decimal`, write movement, update balance. |
| Can it be reused unchanged? | **Yes — not one line changed.** Reception passes a positive quantity and `COMPRA`. |
| Is partial receipt already represented? | **Half.** `RECIBIDA_PARCIAL` has been in the enum since POS1.2-A, but **nothing could reach it**. |
| Is warehouse ownership already enforced? | **Yes, but only in checkout**, inline inside `checkoutPosSaleAction`. Reception needs the same rule. |
| Do orders store received quantities? | **No.** This is the only schema change, and it is unavoidable: "40 of 100 leaves 60 pending" cannot be written anywhere without it. |

### Pending is derived, never stored

The single new column is `receivedQuantity`. Pending is
`quantity − receivedQuantity`, computed in the read layer: **two figures that must
always add to the same thing are two places where they can diverge**.
`information_schema` confirms the line has `received_quantity` and **no**
`pending_quantity`.

Verified: 40 of 100 leaves 60 pending; 61 is rejected; the remaining 60 closes the
order; a fully received order accepts nothing more. With exact decimals — 2.25 of
7.5 leaves 5.25.

### The state is derived from the lines

Not declared by the caller. After applying what arrived, the lines are re-read:
all complete → `RECIBIDA`; some received → `RECIBIDA_PARCIAL`. **It is the only
implementation that cannot lie** — a declared state could say "received" with
lines still pending.

**Deviation from the brief, stated plainly.** The brief drew
`APPROVED → PARTIALLY_RECEIVED → RECEIVED` with "no shortcut". An order received in
full in one delivery goes from `APROBADA` straight to `RECIBIDA`: marking a
complete delivery as partial would be writing a false fact. "No shortcut" was read
as **"you cannot jump to `RECIBIDA` while anything is pending"**, which is what the
code guarantees. If the literal path is wanted, it is a one-line change.

### Why the order is locked too

**Locking inventory is not enough**, and the smoke proves it by **removing** the
header lock. Two simultaneous receipts of the same line both read
`receivedQuantity = 0` on an order of 100, both compute that 60 fits, and both pass
validation. They then serialize on the balance — the engine's `FOR UPDATE` works —
but each writes `0 + 60 = 60` to the line: a **lost update**.

The measured outcome is worse than over-receiving:

- inventory rises by **120**, with its ledger balancing;
- the order says **60 received and 40 pending**.

**The ledger and the document contradict each other**, and those 40 phantom
"pending" units would allow receiving up to 160 against an order of 100.

**My own reasoning was wrong before the test ran.** I had predicted "each adds 60 →
120 received". The assertion and the code comment were corrected to what actually
happens.

The datum to protect is *pending*, and it lives on the order, so the header is
locked with `FOR UPDATE` **before the lines are read**. With the lock, two
concurrent receipts of 60 against 100: exactly one wins, received stays at 60, and
inventory rises by exactly 60. Lock order is order first, then balances sorted by
product — a fixed global sequence is what prevents deadlock.

### The warehouse check was extracted, not duplicated

POS1.1-E put "the warehouse must belong to the branch" inline inside checkout.
Reception needs it identically, so it was extracted to
`assertWarehouseBelongsToBranch` rather than copied: **two copies of one rule are
two places where one can be relaxed.**

It lives outside the engine deliberately. A manual receipt and an adjustment have
no branch of their own to compare against; a sale and a reception do, because their
document carries one. Putting it in `applyPosInventoryMovement` would force the
engine to know about documents that are none of its business.

### Business rules

Rejected: zero or negative quantity, more than pending, inactive warehouse,
inactive product, inactive supplier, draft order, cancelled order, already-received
order, warehouse from another branch, a line belonging to another order, and
**missing inventory balance**. All verified, including that the missing-balance
rejection **does not create one** — opening balances remains POS1.1-B's job.

**No sanitizer was added.** `sanitizePosQuantity` already means "strictly positive,
three decimals".

The movement is type `COMPRA`, with a mandatory reason naming the order and a
mandatory author. The trace back to the order is still **text, not a foreign key** —
P-13 stays open and now affects reception too.

### Verification

**SMOKE-POS1.2-B — 61 assertions, 0 failures** against real PostgreSQL: partial
receipt · over-receipt rejected · full receipt closing the order · multiple lines ·
exact decimals · received and pending quantities · state transitions · inventory
balances · balance equal to its ledger · movement type `COMPRA` · author · mandatory
reason · warehouse, branch and supplier validation · inactive products · missing
balances · **rollback after the first line leaves nothing** · **concurrency: exactly
one of two concurrent receipts wins** · **the lock-removal case, documented as the
failure it prevents** · and zero accounting entries, postings, cash documents,
serialized movements and motorcycle units.

All twenty Prisma suites clean (**921 assertions, 0 failures**). `next build`
clean. Lint flags no file in this patch. `prisma migrate status` clean at 28
migrations.

**Browser: 87 passed, 3 failed, 19 did not run.** **All 52 POS tests passed**,
including `cobrar descuenta existencias de la bodega`. The three failures are all in
the `contabilidad` project — `document-tax:262`, `expense-tax:255`,
`vat-settlement:204` — none of which this patch or POS1.1-E touches; it is the
recurring combined-run flakiness first reported in POS1.0-C.

**Confirmed by re-running the `contabilidad` project alone: 42 passed, 0 failed.**
The three tests that failed under load pass in isolation in 15.5s, 6.4s and 5.2s,
against 55.0s, 34.7s and 5.3s in the combined run. Two of the three are plainly
load-bound; the third (`vat-settlement:204`) failed in 5.3s, so its mechanism is
**not** explained by wall time and remains unproven. The two standing leads are
unchanged: the shared `${TAG}-A` mapping set, and running the browser suites
against a production server instead of `next dev`.

**This run also confirmed the POS1.1-E regression fix.** The branch/warehouse
mismatch that broke checkout is gone: warehouses are now filtered by the selected
branch, so the two selectors cannot contradict each other.

### Two invalidated runs, both my fault

Two earlier browser runs were void because I deleted `.next` and edited source
**while the dev server was live**. One of them also truncated at test 45 of 108, so
no POS test ran at all — meaning my earlier "23/23" report for `e2e:pos-sale` was
taken *before* the cross-branch check existed and did not cover it. The rule is
simple and was not followed: once a browser run starts, touch nothing until it ends.

### Files

`prisma/schema.prisma`, new
`prisma/migrations/20260816120000_pos_purchase_receipts/`,
`src/server/pos/actions.ts`, `src/server/pos/queries.ts`,
`src/server/pos/shared.ts`, new `prisma/smoke/pos12b-purchase-receipts.ts`,
`package.json`, `docs/POS.md`.

### Behaviour changes

- **A purchase order can be received into inventory**, partially or in full, with
  inventory movement, received quantity and order state advancing in one
  transaction.
- **`PosPurchaseOrderItem` gained `receivedQuantity`**, defaulted to zero, so every
  pre-existing line stays valid.
- **The warehouse-belongs-to-branch rule moved from checkout into a shared helper.**
  Behaviour is unchanged for checkout; SMOKE-POS1.1-E still passes unmodified.
- No supplier invoice, payable, accounting entry, cost or payment is created.

## Patch POS1.2-C - Purchase cancellation workflow

Closes the purchase order lifecycle. Cancellation changes document state and
nothing else.

### Phase 0

| Question | Finding |
|---|---|
| Which states exist? | `BORRADOR`, `APROBADA`, `RECIBIDA_PARCIAL`, `RECIBIDA`, `ANULADA`. |
| Which are terminal? | `RECIBIDA` and `ANULADA`. **`RECIBIDA_PARCIAL` is not** — it still accepts receipts. |
| Do cancellation helpers exist? | **Yes.** `cancelPosPurchaseOrderAction` has existed since POS1.2-A; most of this brief was already implemented. |
| Is `updateMany(...status in WHERE...)` the pattern? | **Yes**: 7 uses in `pos`, 4 in `caja`, 15 in `contabilidad`. |
| Do approvals use optimistic transitions? | **Yes**: read, check, guarded `updateMany`, assert `count === 1`. No row lock. |
| Does any workflow restore inventory? | **None.** `DEVOLUCION` remains an unreachable enum value. |
| May partially received orders be cancelled? | Currently no. Registered as **P-27**; refusing preserves the status quo rather than deciding. |

### A defect of my own POS1.2-A, fixed

The cancellation reason was **appended to `notes`** — a user-authored field.
Mutating it destroyed whatever the user had written and left the reason
impossible to read separately. It now lives in `cancelledReason`, its own column,
exactly as *who* and *when* already did.

Caja stores its reason in `FinancialAuditEvent.reason`, but the POS has no audit
trail: `FinancialAuditDomain` admits only `CAJA` and `CONTABILIDAD` (inconsistency
I-2, recorded in POS1.1-B's Phase 0). Adding a value to that enum for a context
with no financial effect would couple purchasing to the financial layer; a
dedicated column is what the repository already does when there is no ledger.

### Two contract changes, both following precedent

**The reason became mandatory**, following `cancelCashDocumentAction`, which
demands it with "Indica el motivo de la anulación interna". Not a rule invented
here: the repository already decided that a cancellation without a stated reason
is not recorded. POS1.2-A had left it optional.

**An explicit check for received goods** was added. The status already implies it
— a receipt moves the order to `RECIBIDA_PARCIAL` — but **the rule must not depend
on the status derivation being correct**. If some future flow left an order
`APROBADA` with received lines, this check would still protect. The smoke builds
that impossible order on purpose and asserts it is refused by the quantities.

### Concurrency

Guarded transition, **exactly like approval**: status re-checked in the `WHERE`,
`count === 1` required. Three concurrent cancellations: one wins, the others fail
cleanly with a message rather than an exception.

**No `FOR UPDATE` is needed**, unlike reception. Reception decides from the
**line quantities**, which the `updateMany` `WHERE` cannot filter; cancellation
decides from the **status**, which is in the `WHERE`. Adding a lock the guard
already covers would be ceremony.

### Scope I judged necessary

The brief asks for browser tests, but **purchasing had no screen at all** —
POS1.2-A and B were server-only. A cancellation nobody can reach is not a
workflow, and authorization is precisely what the Prisma suites cannot cover,
because actions authorize against a session cookie while smokes reproduce the
transactional body without one.

`/panel/pos/compras` lists and cancels. Nothing else: it does not create orders,
approve them, or receive goods. The rule for what may be cancelled is **not
reimplemented in the screen** — it arrives as `cancellable`, derived in the query
layer from the same condition the server applies.

### Verification

**SMOKE-POS1.2-C — 35 assertions, 0 failures**: cancelling a draft · cancelling an
approved order · **who, when and reason recorded, with the user's notes left
untouched** · mandatory reason · received, partially received, cancelled and
non-existent orders refused · **the defence-in-depth check on received
quantities** · **three concurrent cancellations, exactly one winner** · rollback
leaving the order untouched · and **no inventory movement, no stock restoration,
no accounting entry, no posting, no cash document, no serialized movement**.

All twenty-one Prisma suites clean (**956 assertions, 0 failures**). `next build`
clean. Lint flags no file in this patch. `prisma migrate status` clean at 29
migrations.

**Browser: `pos-purchases.spec.ts` 12/12**, plus `pos-purchases-denied.spec.ts`
passing in the `contabilidad` project — **the first authorization coverage
purchasing has ever had**, and the only kind of test that can provide it.

### Files

`prisma/schema.prisma`, new
`prisma/migrations/20260817120000_pos_purchase_cancellation/`,
`src/server/pos/actions.ts`, `src/server/pos/queries.ts`,
`src/server/pos/shared.ts`,
new `src/features/operations/modules/pos/pos-purchases-panel.tsx`,
new `src/app/(operations)/panel/pos/compras/page.tsx`,
`src/features/operations/components/operations-shell.tsx`,
new `prisma/smoke/pos12c-purchase-cancellation.ts`,
new `e2e/pos-purchases.spec.ts`, new `e2e/pos-purchases-denied.spec.ts`,
`e2e/fixtures.ts`, `playwright.config.ts`, `package.json`, `docs/POS.md`.

### Behaviour changes

- **A purchase order can be cancelled from the application**, from `BORRADOR` or
  from `APROBADA` with nothing received.
- **The cancellation reason is now mandatory** and stored in its own column.
- **Purchasing has a screen**, restricted to ADMIN and GERENTE.
- No inventory, accounting, cash or supplier debt is touched.

## Patch POS2.0-A - SmartBitz Design System foundation

The first patch of Phase POS2.0. It creates the visual language every Operations
module will share, and changes **no** business logic, workflow, schema or
permission.

### What was studied

The reference material was a working Nicaraguan ERP of the same shape as this one
— importer, multi-branch, credit sales, purchasing, payroll — alongside the
interfaces the brief named. Nothing was copied. The analysis, in full, is §1 of
`docs/design-system.md`.

**What the strong references share**: a fixed left rail with content that never
moves; a page header with four fixed parts; stat cards that state one number
rather than decorating it; tables treated as the product rather than the
dashboard; and one accent colour used almost nowhere.

**What the weaker reference gets wrong — and avoiding it is the design work**:
sixteen ungrouped navigation entries; "No hay datos" as an empty state; charts
with no number anywhere on screen; overlapping labels in the checkout summary, at
the exact moment of taking money; and four button colours with no semantics. Each
failure is answered by a rule in the document, with the failure named.

### The constraint that shaped everything

**The system was extracted from the running product, not imposed on it.** Every
token encodes what the panel already renders, so adopting one changes no pixel.

That was deliberate: a design system nobody can adopt without a redesign is a
design system nobody adopts, and this patch is explicitly forbidden from
redesigning any screen. It also means POS2.0-B onward can migrate a module at a
time without a visual big bang.

### Tokens

`src/app/globals.css` gains a `--sb-*` layer: a 4px spacing scale, seven type
sizes, four radii, three elevations, a four-level surface and text hierarchy,
five semantic colour families, icon sizes, control heights, four motion durations,
a z-index ladder and one focus ring.

Plus a behaviour layer that Tailwind classes cannot express: `.sb-focus` (a
two-ring focus indicator legible on both white inputs and coloured buttons),
`.sb-scroll` (thin scrollbars visible only on hover), `.sb-skeleton` (a sweep, not
a pulse), `.sb-numeric` (tabular figures), and the overlay keyframes — all
collapsed by `prefers-reduced-motion`.

### Components

**Nine new files**, every one composing what already exists:

- `overlay.tsx` — Escape, outside-click, focus trap, scroll lock. Dialog, drawer
  and menu differ in where they sit, not how they behave; writing that three
  times would be three places for the focus trap to drift.
- `dialog.tsx` — `Dialog` and `ConfirmDialog`.
- `drawer.tsx` — detail beside context, as opposed to the dialog's interruption.
- `dropdown-menu.tsx` — keyboard-first actions on one thing.
- `select.tsx` — a native `<select>`, styled once. Three screens had already
  hand-rolled the same 200-character class string onto a bare select, and they had
  drifted apart.
- `fields.tsx` — `SearchField`, `MoneyInput`, `QuantityInput`, `DateInput`,
  `Textarea`. The four things an ERP types all day, each composing `Input`.
- `table.tsx` — semantic cells, so "this column is numeric" and "this row is
  cancelled" become statements rather than class strings.
- `pagination.tsx` — states the **range** (`41–60 de 237`), not the page number.
- `feedback.tsx` — skeletons, spinner, scoped loading overlay, inline `Notice`,
  and a toast system.
- `navigation.tsx` — state `Tabs`, `Breadcrumbs`, `Toolbar`.
- `command-palette.tsx` — Ctrl/⌘-K foundation, shipping **no commands**.
- `chart-frame.tsx` — the frame, palette and rules around a plot.

**Three existing primitives refactored with identical rendered output**: `Button`,
`Input` and `Badge` adopt `.sb-focus`; `Badge` gains an optional `dot` so a status
column carries meaning without relying on colour; `Input` gains hover and disabled
states it lacked.

### Two decisions worth stating

**No charting library was added.** Choosing one is a real architectural decision —
bundle size, SSR behaviour, accessibility of the rendered output — and it deserves
its own patch. `ChartFrame` settles everything around the plot so that choice,
when made, changes nothing else. Recorded as DS-1.

**The command palette ships empty.** What it can do is a product decision per
module, and this patch may not touch workflows. A later patch passes commands in;
the component does not change.

### Review findings on my own code

Lint caught two real defects, both fixed properly rather than silenced:

- **`setState` inside an effect** in the command palette and the dropdown menu,
  which triggers cascading renders. The fix was structural: both now render
  nothing while closed and mount a fresh inner surface on open, so state starts
  clean without an effect resetting it. The palette's active index is now derived
  and clamped on read rather than stored.
- **`aria-hidden` on `role="none"`** in the menu separator — unsupported for that
  role, not merely redundant.

### Verification

`npx tsc --noEmit` clean · `npm run lint` clean for every file in this patch ·
`next build` compiled successfully.

No Prisma schema, migration, action, query or permission was touched, so no smoke
or browser suite was affected.

### Files

`src/app/globals.css`, new `docs/design-system.md`, new
`src/components/ui/{overlay,dialog,drawer,dropdown-menu,select,fields,table,pagination,feedback,navigation,command-palette,chart-frame}.tsx`,
and `src/components/ui/{button,input,badge}.tsx` refactored onto tokens.

### Future patches that consume this

POS2.0-B onward migrate the Operations modules one at a time — POS checkout,
dashboard, inventory, purchases, products, customers — each an explicit patch
with its own report, never a silent restyle. `docs/design-system.md` §14 is the
checklist each of them must satisfy.

### Behaviour changes

- **None.** No screen renders differently. The foundation exists; nothing consumes
  it yet.

## Patch POS1.2-D - Supplier return workflow

**The first workflow in the repository that reverses stock after goods have been
received**, and the fifth caller of the inventory engine. It consumes inventory
and advances the purchase document, and creates no accounting entry, credit note,
payable adjustment, payment, costing or financial document.

### Phase 0

| Question | Answer |
|---|---|
| Can returns reuse `applyPosInventoryMovement` unchanged? | **Yes.** It takes a signed quantity and a type; a return contributes the negative sign and `DEVOLUCION`. |
| Is `DEVOLUCION` already in the movement enum? | **Yes, since POS1.1-B — and nothing wrote it.** The four types in use were `COMPRA` (×2), `AJUSTE` and `VENTA`. It had been declared and unreachable for four patches; this is the one that reaches it. |
| Does the repository store returned quantities? | **No.** The line held only `quantity` and `receivedQuantity`. |
| Can multiple returns happen? | Nothing prevents it, and the schema accumulates. Verified with three successive returns. |
| Can a return exceed what was received? | Nothing prevented it, because returns did not exist. Now rejected. |
| Was any workflow already restoring inventory? | **None.** |

### Returned quantity cannot be derived

The only source would be summing the order's `DEVOLUCION` movements — but
**`PosInventoryMovement` has no relation to the order** (P-13, open since
POS1.1-E). Its only trace is the reason text, and computing a control quantity by
parsing free text would be worse than storing it.

Hence the single new column, `returnedQuantity`. `information_schema` confirms the
line stores **ordered, received and returned**, and neither derived figure —
pending and returnable are computed in the query layer.

The three quantities cannot contradict each other: returned ≤ received ≤ ordered.
**Returning is capped by what was received, not by what was ordered** — verified on
a line of 20 ordered with 12 received, where 13 is refused.

### Two things this patch does not decide

**Pending does not change — P-28.** `quantity − receivedQuantity` remains the
POS1.2-B formula. Whether a return **reopens** the line (the supplier must
re-ship) or **closes** it (written off) is a business decision, and changing the
formula here would silently alter what reception already means.

**The order state does not change — P-29.** Returning everything received from a
`RECIBIDA` order leaves it `RECIBIDA`. Introducing a transition nobody specified —
back to `APROBADA`? to `RECIBIDA_PARCIAL`? — would be inventing the state machine.
Preserving it is not deciding.

**Stock may go negative** if goods already sold are returned: the same absence as
P-8, not new permissiveness. Recorded as P-30.

### Why the order is locked too

**Identical to POS1.2-B, for exactly the same reason.** What must be protected is
how much remains returnable, and that lives on the **order**, not the balance: the
engine's `FOR UPDATE` serializes the balance, not the line.

**Verified by removing the header lock.** Two concurrent returns of 30 against 50
received both read `returned = 0`, both believe it fits, and both write
`0 + 30 = 30`:

- inventory falls by **60**, with its ledger balancing;
- the document records **30 returned**.

**Ledger and document contradict each other** — the same failure mode POS1.2-B
documented. With the lock, exactly one wins: returned 30, inventory −30.

Lock ordering is order first, then balances sorted by product — the same global
sequence as checkout and reception, which is what prevents deadlock between the
three.

### Business rules

The reason is mandatory, as in cancellation and in every inventory movement: goods
leaving without a stated reason are not recorded.

Rejected: zero or negative quantity, more than received, a line already fully
returned, empty reason, inactive warehouse, warehouse from another branch,
inactive product, inactive supplier, a line from another order, missing balance,
an order still in `BORRADOR` or `APROBADA` — it has received nothing — and a
cancelled order, which by POS1.2-C never received anything either.

**No sanitizer was added.** `sanitizePosQuantity` already means "strictly positive,
three decimals"; the caller supplies the sign.

### A type defect the smoke could not see

The suite accessed `.error` on a `{ok:true} | {ok:false; error}` union in six
places. It passed at runtime by accident — `undefined?.includes(...) === true` is
`false`, which happened to be the wanted outcome — but `tsc` rejected it, and an
assertion that passes for the wrong reason is not an assertion. Replaced with a
typed `errorOf` helper that narrows explicitly.

### Verification

**SMOKE-POS1.2-D — 59 assertions, 0 failures** against real PostgreSQL: partial
return · successive returns accumulating to a complete one · **exact decimals
(8 − 1.25 leaves 6.75 returnable)** · multiple products · over-return rejected ·
a fully returned line refusing more · **returning capped by received, not
ordered** · balance equal to its ledger, with every return negative · zero,
negative, empty reason, inactive warehouse, cross-branch warehouse, inactive
product, inactive supplier, foreign line, unreceived order and cancelled order all
rejected · **rollback after the first line leaves no movement, no balance change
and no partial document update** · **concurrency: exactly one of two wins** · **the
lock-removal case, documented as the failure it prevents** · and zero accounting
entries, postings, cash documents, receivables, serialized movements and
motorcycle units.

All twenty-two Prisma suites clean (**1,015 assertions, 0 failures**).
`npx tsc --noEmit` clean · `next build` clean · lint flags no file in this patch ·
`prisma migrate status` clean at 30 migrations.

No browser suite was affected: purchasing's screen (POS1.2-C) lists and cancels,
and this patch adds no UI.

### Files

`prisma/schema.prisma`, new
`prisma/migrations/20260818120000_pos_purchase_returns/`,
`src/server/pos/actions.ts`, `src/server/pos/queries.ts`,
`src/server/pos/shared.ts`, new `prisma/smoke/pos12d-purchase-returns.ts`,
`package.json`, `docs/POS.md`.

### Behaviour changes

- **Goods received against a purchase order can be returned to the supplier**,
  partially or in full, in as many returns as needed.
- **Inventory falls by the returned quantity**, through a `DEVOLUCION` movement
  with a mandatory reason and author — the first time that movement type is ever
  written.
- **`PosPurchaseOrderItem` gained `returnedQuantity`**, defaulted to zero, so every
  pre-existing line stays valid.
- **Pending and the order status are unchanged by a return** (P-28, P-29).
- Nothing else moves: no accounting, no cash, no payables, no supplier balance.

## Patch POS1.2-E - Purchase history and traceability

Makes the purchase lifecycle observable. It adds no workflow, changes no inventory
rule, no totals, no accounting and no supplier debt.

### Phase 0: what could be reconstructed, and what could not

| Fact | Reconstructible from existing data? |
|---|---|
| Order created | **Yes** — `createdAt` + `createdByUserId`. |
| Order approved | **Yes** — `approvedAt` + `approvedById`. |
| Order cancelled | **Yes** — `cancelledAt` + `cancelledById` + `cancelledReason`. |
| Partial receipt | **No.** |
| Full receipt | **No.** |
| Supplier return | **No.** |

`receivedQuantity` and `returnedQuantity` are **running totals**. Three receipts of
40, 40 and 20 leave a 100 that says nothing about when each happened, who did it,
or how large it was. The other possible source — inventory movements — does not
work either: `PosInventoryMovement` has no relation to the order (P-13) and its
only trace is the reason text, which the brief rules out as a source. `updatedAt`
marks the last change, not an event.

### Why a table, and why it records the reconstructible facts too

`PosPurchaseOrderEvent`, a per-aggregate log. It was necessary because three of the
six facts could not be reconstructed without guessing.

**It records all six, not only the three that were missing.** Storing only receipts
and returns would make an order predating this patch show its creation and approval
— real data — and **no receipts at all**: a timeline that looks complete and is
not. With a uniform log, an order with no events says exactly that, and the screen
states it in words.

The duplication is **three immutable timestamps**, not mutable state: approval and
cancellation happen once and cannot diverge from their column. That is not true of
"pending", which is always derived.

It **copies the shape of `TicketEvent`** — the per-aggregate log the repository
already had: bound to its parent with `Cascade`, append-only, indexed by parent and
timestamp. It **diverges in one way**: a typed enum and typed columns instead of
`action String` + `metadata Json`, because nobody validates an inventory quantity
inside a JSON blob.

**No financial concept.** `information_schema` confirms no column matching amount,
cost, price, payable or balance.

### Two receipt event types

`RECEPCION_PARCIAL` and `RECEPCION_TOTAL` are two types rather than one with a
derived flag. Whether a receipt **closed** the order is a fact of that moment which
stops being recoverable afterwards: a later return changes the quantities, and then
there is no way to tell. Recording it at write time preserves information that
would otherwise be lost.

**One event per line.** A receipt of 10 helmets and 2.5 litres has no meaningful
single total. All events of one operation share its type and its instant.

### Atomicity and idempotency

The event is written **inside the operation's transaction** and **always after its
guard**. Both matter:

- Inside the transaction, so a later failure takes it with it — a log that records
  what did not happen is worse than no log. Verified with a forced failure on
  creation and on reception.
- After the `updateMany` with `count === 1`, so **a transition that loses a race
  leaves no trace**. Verified: three concurrent approvals leave **one** `APROBADA`
  event; two concurrent cancellations leave **one** `ANULADA`.

### The query

Deterministic: timestamp ascending, then id. Ties are normal — a two-line receipt
writes two events in one transaction — and without the second key the screen would
show a different order on each load. Verified that two reads return the same
sequence.

It exposes **no internals**: names, labels and quantities, never movement ids,
Prisma types or the ledger. The screen reconstructs nothing.

### UI scope

Deliberately small: the row on `/panel/pos/compras` expands to show the history.
Not a new screen and not a redesign — the module redesign is POS2.0-B/C. It reuses
the visual shape of `FinancialAuditTimeline` without extracting a shared component:
the two consume different DTOs, and abstracting two uses with different fields
costs more than it saves.

### Recorded limitation

**Orders created before this patch have no history, and none was fabricated for
them.** Traceability starts here. Verified: an order written in the old shape —
with `approvedAt` and `receivedQuantity` populated — returns zero events, and the
screen says so rather than showing an empty list.

### Prisma's 5-second limit, which this patch made visible

**The browser suite failed where no Prisma suite could.** Cancellation aborted with
`P2028`: *"The timeout for this transaction was 5000 ms, however 5253 ms passed"*,
precisely on writing the event — the last statement of its transaction.

**The cause is not the log, though the log triggered it.** A ten-line receipt runs
on the order of **sixty queries inside the transaction**: the header lock, the line
read, and per line two engine reads, the balance lock, the movement, the balance
update, the line update and its event. At 80 ms per query — what a loaded server
costs — that is already 4.8 s. **The limit was at the edge before this patch**;
adding one query crossed it.

**The six purchase lifecycle transactions now declare `timeout: 20_000`.** Twenty
seconds, not "a lot": a high ceiling on transactions holding `FOR UPDATE` lengthens
how long a stuck one blocks the others. Twenty leaves ample room for the heaviest
legitimate case and still cuts off one that genuinely hung.

**`maxWait` is untouched.** That is a different problem — waiting for a pool
connection, not executing — and raising it would only lengthen the wait against a
saturated pool. See P-31.

**Checkout (`checkoutPosSaleAction`) has the same shape and the same latent risk**,
and was **not changed**: this patch added no work to it, and touching its
transaction deserves its own justification. Recorded as **P-32**.

### The `.next` cache, in a third direction

POS1.0-D recorded that `next build` before `npm run e2e` poisons `.next` and every
route 404s. POS1.1-A recorded the reverse — a dev server writing into `.next` while
`next build` runs corrupts `validator.ts`. This patch found the third: **deleting
`.next` immediately before a browser run** makes the first login exceed the 120 s
navigation timeout while the dev server compiles from cold, failing the auth setup
before any test runs.

None of the three is a code defect, and all three cost a full cycle. The rule that
covers all of them: **the browser suite needs a `.next` that is neither stale, nor
being written by another process, nor empty.** Running against a production server
instead of `next dev` would remove the whole class, and remains the standing
recommendation from POS1.0-C.

### A finding from the test run, unrelated to this patch

Under the sequential 23-suite run, **three concurrency tests failed intermittently**
with `Transaction API error: Unable to start a transaction in the given time`. That
is Prisma's `maxWait` — the time a transaction waits **for a pool connection** — not
the lock: the chain stayed intact and the balance matched the accepted count
exactly.

**The assertions were mine and they were too strong.** "All ten concurrent
checkouts are accepted" is a claim about pool capacity, not about correctness — the
same mistake I identified once before in FF2.0-D and then repeated. All three now
assert what the lock actually guarantees: **whatever was accepted balances
exactly**, for any number of winners.

The capacity limit is real and is recorded as **P-31**: with enough concurrency on
one article some checkouts fail on connection acquisition and the cashier sees "No
se pudo registrar la venta". No inventory is lost, but pool sizing is an operations
decision nobody has taken.

**And one of my tests was simply wrong.** POS1.1-D's chain walk was greedy: with
mixed signs the balance revisits values, several continuations exist at each step,
and choosing badly dead-ends **even though a valid chain exists** — backtracking
search disguised as a loop, failing intermittently with the interleaving. Replaced
by a multiset equality: **the "befores" plus the end must equal the "afters" plus
the start**, which walks nothing and still detects a lost update. Verified by
removing the lock.

### Verification

**SMOKE-POS1.2-E — 51 assertions, 0 failures**: all six lifecycle facts recorded
with author, timestamp, quantity and reason · a two-line receipt writing two events
· **exact decimals (2.5)** · chronological and repeatable ordering · **an order
predating the patch receiving no fabricated history** · rollback removing both the
operation and its event · **concurrent approvals and cancellations leaving exactly
one event** · no orphan events · only receipts and returns carrying quantity ·
`Cascade` on order deletion · and no inventory, accounting, cash, receivable or
serialized-movement change.

All twenty-three Prisma suites clean (**1,066 assertions, 0 failures**).
`npx tsc --noEmit` clean · `next build` clean · lint flags no file in this patch ·
`prisma migrate status` clean at 31 migrations.

### Files

`prisma/schema.prisma`, new
`prisma/migrations/20260819120000_pos_purchase_history/`,
`src/server/pos/actions.ts`, `src/server/pos/queries.ts`,
`src/server/pos/shared.ts`,
new `src/features/operations/modules/pos/pos-purchase-history.tsx`,
`src/features/operations/modules/pos/pos-purchases-panel.tsx`,
`src/app/(operations)/panel/pos/compras/page.tsx`,
new `prisma/smoke/pos12e-purchase-history.ts`,
`prisma/smoke/pos11c-inventory-receipts.ts`,
`prisma/smoke/pos11d-inventory-adjustments.ts`,
`prisma/smoke/pos11e-inventory-consumption.ts` (concurrency assertions corrected),
`package.json`, `docs/POS.md`.

### Behaviour changes

- **A purchase order exposes a chronological history of its lifecycle
  operations**, readable without knowing that inventory movements exist.
- **Orders created before this patch show no history**, and say so.
- No inventory, accounting, cash, supplier balance, costing or payment behaviour
  changes.

---

## Patch POS1.2-F - Purchase module closure

Closes POS1.2. **No new purchasing capability.** The module is audited, its
internal contradictions fixed, its server-only workflows made reachable, and the
whole lifecycle pinned by tests.

### Phase 0: what the audit found

**Two real internal contradictions**, both fixed here.

**1. Editing did not defend itself the way cancelling did.**
`cancelPosPurchaseOrderAction` checked, beyond status, that no line had received
goods. `updatePosPurchaseOrderAction` checked status only — and it edits by
`deleteMany` on the lines. A `BORRADOR` order carrying receipts (a state no
legitimate transition produces, but one the database accepts) would have silently
destroyed the record of what had arrived, leaving stock no document explains. It
now refuses exactly as cancellation does. This is defence in depth, not a new
rule: through normal transitions the case cannot arise.

**2. Four of the six actions had no way to be executed.** Only cancel reached the
application. Create, approve, receive and return were server code without a door.
A workflow nobody can run is not closed.

**One traceability gap, recorded rather than papered over**:
`updatePosPurchaseOrderAction` writes no event. Editing a draft is the only
lifecycle change history cannot see. **No event type was invented for it** — what
editing should record (the fact? the line diff?) is a business decision. Filed as
**P-33**, and the reason editing stays the one action without a screen.

**What the audit confirmed sound**: a single inventory engine, uniform
authorization across all six actions, zero accounting coupling, and no business
rule duplicated between action and query.

### A single mutation engine, verified structurally

The closure smoke reads `src/server/pos/actions.ts` and asserts that the whole
module contains **exactly one** `posInventoryMovement.create`, **one**
`posInventory.update` and **one** balance `FOR UPDATE` — all three inside
`applyPosInventoryMovement`. Counting the outcome would not have proved this;
reading the source does.

### Reachability

New: `/panel/pos/compras/nueva` (create) and `/panel/pos/compras/[orderId]`
(detail, with approve, receive, return, cancel and history). The list now links to
the detail and offers "Nueva orden".

Both pages authorize with `canManageInventory`, the same predicate the actions
enforce, and 404 for a non-global role reading another branch's order. **The
screen is not the security boundary**: `derivePosPurchaseAbilities` decides which
buttons appear and travels to the browser; every action re-authorizes and
re-validates server-side.

Deliberately no design work: existing primitives, no metric cards, no charts, no
filters. That is POS2.0.

### Rollback, proved properly

**A rejection by up-front validation does not prove rollback** — receiving
validates every line before moving anything, so an excessive quantity aborts with
nothing written and nothing to undo. The smoke therefore forces a failure *after*
the first write: a two-line receipt whose second product has no balance open in
the warehouse. The first line has already created its movement and updated its
balance when the engine refuses the second. Nothing survives.

### Two test defects found and corrected

**The fixture cleanup could not remove UI-created orders.** While creating was a
screenless action, every order the suite made came from `makeOrder` with the TAG
inside its number. Orders created *through the application* get a server-generated
number with no TAG, so they survived teardown and their lines blocked deleting the
product — a foreign-key failure at global teardown, leaving residue. Cleanup now
identifies orders by what actually ties them to the fixture: supplier or products.

**A POS1.2-C browser assertion passed by timing luck.** It asserted `compras-denied`
was visible for an accountant. But the operations shell is a client component that,
once the session hydrates, replaces the whole screen with "Acceso comercial
restringido" — the testid only existed before hydration. It now asserts the
**server-emitted HTML**, where the denial actually lives, plus the final screen
state.

### P-8 preserved

No sufficient-stock validation was added. The smoke verifies it as an absence:
no purchasing action contains such a check. Inventory may still go negative.
Closing a module was not the occasion to decide business policy.

### Verification

**SMOKE-POS1.2-F — 78 assertions, 0 failures** against real PostgreSQL. Full
lifecycle with realistic quantities · exact decimals (25.25 pending, 55.5 balance)
· every illegal transition refused · the four quantity invariants across **all**
lines · balance equals the sum of its ledger · single engine verified in source ·
history exactly `CREADA, APROBADA, RECEPCION_PARCIAL ×2, RECEPCION_TOTAL ×2,
DEVOLUCION` with event quantities summing to the line's received · independent
orders and products · rollback after a partial write · three concurrent approvals
leaving one winner and one event · two concurrent receipts of 6 against 10 pending
admitting exactly one, inventory up exactly 6 · and no accounting, cash,
receivable, payment, serialized inventory, motorcycle or POS sale, with
`information_schema` confirming no payment/invoice/debt column exists.

**The concurrency proof was validated by removing the lock**, via a reproducible
negative control (`SMOKE_SIN_BLOQUEO=1`): without the header lock both receipts are
accepted and inventory reaches 120 while the document still says 6 — the lost
update of POS1.2-B. The switch can only break the suite, never soften it.

**SUITE-POS1.2-F — 30 browser tests, 30 green** (2.4 min), covering list, detail,
create, approve, partial receive, full receive, return, cancel, history, ability
gating, ledger invariant after operating through the screen, and mobile layout.
**SUITE-POS1.2-F denied — 4 tests, 4 green** with the accountant session.

All twenty-four Prisma suites clean. `npx tsc --noEmit` clean · `next build`
clean · `prisma migrate status` clean at 31 migrations · **no migration in this
patch** · lint flags no file in this patch (39 pre-existing errors, all in legacy
demo panels untouched here).

### Files

`src/server/pos/actions.ts`, `src/server/pos/queries.ts`,
`src/server/pos/shared.ts`,
`src/features/operations/modules/pos/pos-purchases-panel.tsx`,
new `src/features/operations/modules/pos/pos-purchase-detail-panel.tsx`,
new `src/features/operations/modules/pos/pos-purchase-new-panel.tsx`,
new `src/app/(operations)/panel/pos/compras/[orderId]/page.tsx`,
new `src/app/(operations)/panel/pos/compras/nueva/page.tsx`,
new `prisma/smoke/pos12f-purchase-closure.ts`,
`e2e/pos-purchases.spec.ts`, `e2e/pos-purchases-denied.spec.ts`,
`e2e/fixtures.ts`, `package.json`, `docs/POS.md`.

**No schema change. No migration. No new dependency.**

### Behaviour changes

- **Create, approve, receive and return are reachable from the application.**
  They were server-only; their server behaviour is unchanged.
- **Editing a draft that already moved goods is refused**, as cancelling already
  was. Defence in depth; unreachable through normal transitions.
- No inventory, accounting, cash, supplier balance, costing, payment or
  authorization behaviour changed.

POS1.2-A through POS1.2-F are complete.

---

## Patch POS2.0-B - Operations layout

The first patch that consumes the POS2.0-A design system, for the one thing every
screen shares: the frame around it.

**No business logic. No schema change. No migration. No server action. No
authorization change. No chart library.**

### Phase 0: what the shell already did right

`operations-shell.tsx` was 638 lines in one file, and most of its behaviour was
correct. Retained unchanged: every route, label, icon and role in the navigation;
the four role-restriction screens with their exact copy; the owner's own group
labelling and ordering; the "Mis leads" → "Leads" relabelling; the rule that
`/panel/inventario/movimientos` wins over `/panel/inventario`; and
`max-w-[1400px]` as the default width, so the 44 screens this patch does not
migrate render exactly as before.

### What changed

**Scrolling.** The sidebar was `fixed` and the content was offset by
`padding-left`, so the whole page scrolled underneath it. The rail is now a real
column and **only the content area scrolls** — stable because it is not inside the
thing that moves, not because it is pinned on top of it.

**The mobile menu is now the design-system `Drawer`.** The hand-rolled panel it
replaces had no focus trap, no Escape, no outside-click close and no scroll lock.
`Drawer` gained two props rather than a second implementation: `side` (navigation
arrives from the left, where its trigger is) and `contentClassName` (full-bleed
content). Escape, focus trap, outside click and scroll lock still come from
`overlay.tsx`.

**Navigation hierarchy.** Groups carry a `tier`. Configuration and help moved to
a `secondary` tier at the foot of the rail, behind a rule and with a quieter
label, so the application's chrome stops competing with business modules.
**Soporte Técnico keeps its screens in `primary` deliberately** — for that role
the support centre is the job, not chrome.

**Route matching is now a pure module.** `lib/nav-model.ts` has no `"use client"`,
no JSX and no `usePathname`. `routeMatches` compares segments, so
`/panel/ventas-antiguas` is not "inside" `/panel/ventas`; the active item is the
**longest** matching href, which is a simpler statement of the old
most-specific-wins scan.

**Page header and container.** `PageHeader` gained breadcrumbs — the `Breadcrumbs`
primitive had existed unused since POS2.0-A, so nested routes had no way back but
the browser button. `PageContainer` offers three widths, assigned by a **short
list of exceptions** rather than a per-page setting; the default is what the old
shell imposed on everything.

### Two pre-existing defects fixed structurally

**The shell rendered once without a session.** It started at `null` and read the
session in an effect, so the first paint had no navigation and no identity and
**the screen changed under the user on hydration** — the same behaviour that made
a POS1.2-F assertion racy. The server layout already had the session; it now
passes it as a prop. That removed both `set-state-in-effect` lint errors the file
carried (39 → 37 repository-wide).

That fix has a consequence worth stating plainly, because a browser assertion
caught it: **an area restriction is now applied during server rendering.** An
accountant requesting `/panel/pos/compras` previously received the purchases page
in the HTML and had it replaced on hydration; the HTML that leaves the server is
now the restricted screen, with no purchase markup emitted at all. The POS1.2-F
test asserting `compras-denied` in the server HTML was treating that leak as the
contract; it now asserts the restricted screen and the **absence** of purchase
data, which is strictly stronger. This tightens what the server discloses — it
does not change who is authorized. `canManageInventory` still decides, still on
the server, in the page and in every action.

**Closing the mobile menu was an effect on `pathname`.** It is now the click
handler on the link — the user's gesture is the signal, and expressing it as an
effect meant a cascading render to say something the event already knew.

### Purchasing migration

List, create and detail now use `PageHeader` and stop drawing their own title
blocks; nested routes carry breadcrumbs; the list gets the `wide` container and
the create form the `form` one. **No business behaviour touched**: the same
actions, the same permissions, the same server checks.

### Verification

**SUITE-POS2.0-B — 21 browser tests, 21 green.** Landmarks · rail stationary while
content scrolls · nested purchase routes marking their module · deeper route
winning over its container · top bar carrying no module links · page actions in
the page · breadcrumbs nested-only · drawer replacing the rail below 1024px ·
Escape · outside click · **focus trapped across forty tabs** · background scroll
locked and released · navigating from the drawer closing it and landing on the
chosen route · **no horizontal overflow at 1440, 1280, 1024, 768 and 390px across
three routes** · content never beneath the rail at any of those widths · menu
trigger only where the rail is absent.

`npx tsc --noEmit` clean · `next build` clean · lint flags no file in this patch,
and the repository total dropped from 39 errors to 37.

**SUITE-POS1.2-F — 30 purchasing tests green, plus 4 denied-role tests green**, on
a clean single dev server. No purchasing assertion was weakened or removed.

**Four earlier purchasing runs were invalidated and are not reported as results**,
each for an environment or process reason, never a code one: PostgreSQL became
unreachable mid-suite after 27 green tests; a run overlapped with Prisma suites
hitting the same database; a run showed 18–26s server-action times under host
load with the generic transaction error that implies; and a run hit
`Jest worker encountered 2 child process exceptions` after an orphaned dev server
was left listening. The final run was made on a freshly started server with a
regenerated `.next`, warmed before measuring.

### Files

New `src/features/operations/lib/nav-model.ts`,
new `src/features/operations/components/operations-rail.tsx`,
new `src/features/operations/components/operations-topbar.tsx`,
new `src/components/ui/page-container.tsx`,
new `e2e/operations-shell.spec.ts`,
`src/features/operations/components/operations-shell.tsx`,
`src/app/(operations)/panel/layout.tsx`,
`src/components/ui/drawer.tsx`, `src/components/ui/page-header.tsx`,
`src/app/globals.css`,
the three `panel/pos/compras` pages and their panels,
`playwright.config.ts`, `package.json`, `docs/design-system.md`.

### Behaviour changes

- **The content area scrolls, not the page.** The rail no longer moves.
- **The mobile menu is a proper modal surface**: focus trap, Escape, outside
  click, scroll lock.
- **Configuration and help are visually secondary.**
- **Nested routes show a breadcrumb.**
- **The shell no longer flashes a session-less first paint**, and an area
  restriction is therefore decided on the server: a restricted role's HTML no
  longer carries the page it may not see.
- No route renamed, no permission changed, no workflow added.

---

## Patch POS2.0-C - Operations components

The library POS2.1 and POS2.2 will assemble screens from. **No business logic, no
schema, no migration, no server action, no permission change, no new dependency.**

### Phase 0: the audit found more than expected

POS2.0-A had already built the cells (`TH`, `TD`, `TR`, `TDActions`,
`TableEmptyRow`), the frame (`DataTableShell`), the search input, the toolbar
strip, the dialogs, the drawer, pagination and four loading states. What was
missing was narrower than the brief's list suggested, and the audit is what kept
this patch from rebuilding things that already worked.

Genuinely absent: **a checkbox** — three screens hand-rolled `type="checkbox"`,
and none could express the indeterminate state a table header needs. Genuinely
duplicated: **ten modules declare their own `statusTone` map**, so the same state
can be amber in one screen and blue in another.

Present but incomplete: `EmptyState` had one variant where the design system's own
rules call for two; `Field` renders a hint and an error but **associates neither**
with the control, so a screen reader hears a valid field and no reason for the
failure; and `SkeletonTable` covered lists while cards, forms and blocks had no
matching geometry.

### Added

| Component | File | Role |
|---|---|---|
| `Checkbox` | `checkbox.tsx` | A real `<input>` with a working indeterminate state |
| `DataTable` | `data-table.tsx` | Columns, rows, selection, loading, empty — the loop every list wrote |
| `defineStatuses`, `StatusBadge`, `isInactiveStatus` | `status.tsx` | One status dictionary per module |
| `FilterBar`, `BulkActionBar` | `toolbar.tsx` | Search, filters, clear; and the bar that replaces them during a selection |
| `FormField` | `form-field.tsx` | Label, hint and error wired to the control |
| `DetailList` | `detail-list.tsx` | The `<dl>` a drawer detail is made of |
| `ConfirmAction` | `confirm-action.tsx` | Binds a danger button to its confirmation, state included |

Extended, backwards-compatibly: `EmptyState` gains `variant` and
`secondaryAction`; `feedback.tsx` gains `SkeletonCards`, `SkeletonForm`,
`SkeletonBlock` and `SkeletonPage`.

### Decisions worth stating

**`DataTable` does not replace the cell primitives** — an irregular table still
composes them directly. Forcing every table through one component is how a
700-line `SuperTable` gets written.

**Status tones are semantic, not colours.** A module declares `tone: "warning"`,
never `"amber"`, so a palette change touches one file instead of ten.

**`FormField` takes a render function.** Cloning the child to inject props breaks
the moment the control is wrapped in anything; making `Input` read a context would
have meant touching the forty screens already using it.

**Mobile hides accessory columns; it does not become cards.** A POS works with a
lot of information at once and the card format destroys exactly that.

### Showcase

`/panel/dev/componentes` — under `/panel/dev/`, absent from `nav-model`, so it
never appears in commercial navigation and marks no module active. It reads no
database and calls no server action; its data is invented and lives in the
component file, deliberately, so the library cannot acquire a coupling to domain
types through the back door.

### Verification

**SUITE-POS2.0-C — 29 browser tests, 29 green.** Behaviour, not presence: the
header checkbox passing through indeterminate before checked; "select all"
skipping a non-selectable row; rows opened by mouse **and** keyboard; the checkbox
not opening the row; a no-results table explaining *why*; the form error carrying
`role="alert"`, being pointed at by `aria-describedby`, **replacing** the hint and
clearing on correction; the confirm dialog trapping focus and returning it to the
button that opened it; no horizontal overflow at 1440, 1280, 1024, 768 and 390px.

`npx tsc --noEmit` clean · `next build` clean · lint flags no file in this patch ·
`prisma migrate status` clean at 31 migrations.

### Files

New: `src/components/ui/checkbox.tsx`, `data-table.tsx`, `status.tsx`,
`toolbar.tsx`, `form-field.tsx`, `detail-list.tsx`, `confirm-action.tsx`;
`src/features/operations/modules/dev/components-showcase.tsx`;
`src/app/(operations)/panel/dev/componentes/page.tsx`;
`e2e/components-showcase.spec.ts`.

Modified: `src/components/ui/empty-state.tsx`, `src/components/ui/feedback.tsx`,
`playwright.config.ts`, `package.json`, `docs/design-system.md`.

**No file under `src/server/`, `prisma/` or `src/features/operations/modules/pos/`
was touched.**

### Behaviour changes

**None.** POS2.0-C adds no business capability. No existing screen changes its
rendered output: `EmptyState` and `feedback.tsx` gained props and exports without
altering their current ones.

---

## Patch POS2.1 - Operations dashboard

The counter's operational dashboard, over the data POS1.0–POS1.2 built and no
dashboard had ever shown. **No schema change, no migration, no server action, no
permission change, no chart library, no new dependency.**

### Phase 0: there was a dashboard, and it knew nothing about the POS

`/panel/dashboard` has existed for a long time and is **entirely commercial** —
leads, expedientes, activities, credits, reservations, motorcycle sales. What
POS1.x built (counter sales, per-warehouse stock, purchase orders, the inventory
ledger) appeared on no dashboard at all. That gap is what this patch fills; it is
not a second version of what was there, and the commercial panel is untouched.

### One source of truth

`getPosDashboard` — one function, one call, one range. The failure the brief warns
about, a screen where one card means "today" and another means "last 30 days"
without saying so, **cannot occur**: the range is resolved once and every figure
derives from it.

The period travels in the URL (`?periodo=`), not in client state. The server
recomputes, the filter is shareable by pasting the link, and there is no
cross-card state to keep in sync.

**Comparison is the same window shifted back**, not "last month": 30 days against
a 28-day month produces a variation that means nothing. When the previous window
was zero the variation is `null` and the card says so — "+100%" over zero is an
invented figure.

### Metrics, and what was refused

Sales total, sale count, **derived** average ticket, period-over-period change,
sales by day, payments by method, sales by branch (global roles only), items out
of stock, items below their minimum, purchase orders awaiting receipt, and the
recent inventory ledger.

**"Below minimum" counts only items that declare a minimum.** `minimumStock`
defaults to zero and nothing read it before POS1.1-A; counting the zeros would
flag every out-of-stock item as an alert and double the out-of-stock figure. The
screen states how many items have a threshold configured so the number can be
read.

Refused rather than improvised: receivables (P-36) and margin/profitability
(P-37).

### No charting library

**DS-1 remains open and this patch does not settle it.** The trend is
proportional-height columns with zero new dependencies. The total is text in the
frame header, every column carries its value in its accessible name, and the best
day is stated separately: **the figure is never only in the drawing**.

### Permissions

None created. The existing predicates are composed with their existing meaning:
`canAccessCaja` (ADMIN, GERENTE, CAJERO) for sales figures; `canManageInventory`
(ADMIN, GERENTE) for stock, purchases and the ledger. Branch scope is resolved
**server-side** and the queries come back already filtered — an unauthorized role
receives none of it in the HTML, verified against the server response rather than
against what the browser paints.

### Two defects found during implementation

**`DataTable` cannot be used directly from a server component.** Its columns are
functions (`cell`, `rowKey`) and functions do not cross the server→client
boundary. The dashboard is deliberately a server component, so the movements
table moved into its own small client boundary rather than shipping the whole
dashboard to the browser. This is a property of the POS2.0-C library worth
knowing, not a defect of this screen.

**34px of horizontal overflow at 390px**, caught by this patch's own assertion and
introduced by this patch: a grid item's `min-width: auto` refused to shrink below
its content. Fixed with `min-w-0` on the affected items. The first diagnostic pass
blamed a legacy table — wrongly, because elements inside an `overflow-x-auto`
container legitimately extend past the viewport; the probe's criterion was
corrected before anything was changed.

### Verification

**SUITE-POS2.1 — 20 browser tests green, plus 2 denied-role tests.** Figures are
asserted **against the seeded data**, not against "greater than zero": 1,500 +
2,500 today and 9,000 twenty days ago, with the period switch moving the total
from one to the other.

Regression, all green: components 29/29 · shell 21/21 · purchases 30/30 ·
purchases denied 4/4 · **24/24 Prisma suites**.

`npx tsc --noEmit` clean · `next build` clean · `prisma migrate status` clean at
31 migrations · **no file under `prisma/` touched** · lint flags no file in this
patch.

### Files

New: `src/server/pos/dashboard.ts`,
`src/features/operations/modules/dashboard/pos-operations-panel.tsx`,
`src/features/operations/modules/dashboard/pos-movements-table.tsx`,
`e2e/pos-dashboard.spec.ts`, `e2e/pos-dashboard-denied.spec.ts`.

Modified: `src/app/(operations)/panel/dashboard/page.tsx`, `playwright.config.ts`,
`package.json`, `docs/POS.md`.

### Behaviour changes

- **Visual**: `/panel/dashboard` gains an operational section above the existing
  commercial panel, for roles that pass `canAccessCaja` or `canManageInventory`. A
  role that passes neither sees exactly what it saw before.
- **Functional**: the dashboard accepts `?periodo=`; an unrecognised value falls
  back to 30 days.
- **Data**: none. Nothing is written; every figure is read or derived.
- **Permissions**: none. No predicate was added, removed or altered.

---

## Patch POS2.2 - POS / Checkout

### Phase 0: the checkout already existed, and was already reachable

The audit's central finding is that **the requested capability was already
built**. `/panel/pos/venta` renders `PosCartPanel`, wired to
`searchPosProductsAction` and `checkoutPosSaleAction`, and covers every item in
the brief's checkout scope: product search, add, quantity edit, line removal,
running totals, optional customer, multiple payment rows by method, branch and
warehouse selection, notes, submission, loading, error and success. It is
verified by **39 existing browser tests** — 17 in `pos-cart.spec.ts` and 22 in
`pos-sale.spec.ts` — including inventory decrement, exact server-derived totals,
duplicate-submission protection and zero accounting effect.

So POS2.2 did not rebuild it. The brief's own instruction applies: *if the audit
shows a capability already exists, expose it instead of rebuilding it.*

What the audit **did** find:

**The screen predates the design system and duplicates three of its primitives.**
A raw `<select>` carrying a 200-character hand-written class string — precisely
what `Select` was created in POS2.0-A to delete, and whose own documentation
names this screen as one that had drifted. Two hand-rolled notice `<div>`s where
`Notice` exists. A bespoke page header where `PageHeader` exists.

**The unauthorized path had no test at all.** The panel had a denial branch with
no `data-testid`, and no suite exercised it. POS1.0-D proved the identity that
can sell; nothing proved the one that cannot.

**Responsive coverage was one width, not five.** Only 390px was asserted.

### What changed

Presentation only. The raw `<select>` became `Select`; the two notice divs became
`Notice`, keeping their `data-testid`s so the 39 existing tests still target the
same things; the page header moved to `PageHeader`; the denial branch gained
`pos-denied`. **No business logic, no action, no query, no transaction, no
permission was touched.**

### What was deliberately not introduced

`checkoutPosSaleAction` already owns the whole server workflow, and it was reused
unchanged: totals derived server-side, inventory mutated through
`applyPosInventoryMovement`, sale and movement in one transaction.

Not added, because the repository does not contain them: receivables, credit
sales, partial settlement, change calculation, cash-drawer posting, accounting
entries. **No sufficient-stock validation** — P-8 stays open, and the checkout
must not invent a stock policy the rest of the module does not enforce.
**`PURCHASE_TX` and the checkout's transaction configuration were left alone** —
P-32 remains open; exposing a workflow is not a reason to change its timeout.

### P-items

**P-35 resolved by what already existed.** The checkout does not use a native
`Select` for products: it has a server-side search
(`searchPosProductsAction`) returning a result list. No new `SearchSelect` was
built, and none is needed — the second consumer that would justify the
abstraction does not exist.

**P-8, P-32 remain open**, deliberately. **P-36, P-37 untouched**: neither is a
checkout requirement.

### One limitation recorded, not papered over

There are two distinct denials, and the harness can only exercise one. The shell
restricts CONTADOR by **area**, server-side, before the panel renders — that is
what the denied suite asserts. `canOperateCaja` separately excludes **GERENTE**,
who reaches the area and sees `pos-denied` instead of the checkout. **With no
manager session in the harness, that branch is not exercised in the browser.**
Recorded as a limitation rather than claimed as coverage.

### Verification

**SUITE-POS2.2 — 14 browser tests green, plus 2 denied-role tests.** Exact totals
against a seeded decimal price (3 × 1,234.56 = 3,703.68), the stored total proven
to be the server's, submission disabled with an empty cart, **a server failure
producing no success state and no inventory movement**, error text free of Prisma
internals, payment method and quantity operated by keyboard, line removal, and the
five widths.

Regression, all green: **checkout 22/22 and cart 17/17** (the 39 tests the
migration had to preserve) · dashboard 20/20 · components 29/29 · shell 21/21 ·
purchases 30/30 · denied suites 6/6 · products 14/14 · **24/24 Prisma suites**.

`npx tsc --noEmit` clean · `next build` clean · `prisma migrate status` clean at
31 migrations · lint flags no file in this patch.

### Files

New: `e2e/pos-checkout.spec.ts`, `e2e/pos-checkout-denied.spec.ts`.
Modified: `src/features/operations/modules/pos/pos-cart-panel.tsx`,
`src/app/(operations)/panel/pos/venta/page.tsx`, `playwright.config.ts`,
`package.json`.

**No file under `prisma/`, `src/server/`, accounting, cash or the commercial
dashboard was touched.** Schema unchanged, no migration, no dependency added.

### Behaviour changes

- **Visual**: the checkout header is now `PageHeader`; error and success use
  `Notice`; the payment method uses `Select`. Same information, same controls.
- **Functional**: none. The workflow, its validation and its results are
  unchanged — proven by the 39 pre-existing tests still passing.
- **Data**: none.
- **Authorization**: none. `canOperateCaja` still decides, still on the server.

---

## Patch POS2.3 - POS inventory, reachable

### Phase 0: five server actions with no door

The audit found the same shape POS1.2-F found in purchasing.
`createPosWarehouseAction`, `updatePosWarehouseAction`, `openPosInventoryAction`,
`registerPosInventoryReceiptAction` and `adjustPosInventoryAction` have existed
since POS1.1-B/C/D, are covered by Prisma suites, and **none of them could be
executed from the application**. `listPosInventory` and
`listPosInventoryMovements` had no consumer at all.

Verified against the repository rather than assumed: grepping every action and
query name across `src/features` and `src/app` returned zero UI references.

### What was built, and what was not

**No server code.** The screen calls the existing actions unchanged, so it
inherits what they already guarantee: the `FOR UPDATE` lock, the
`after = before + quantity` invariant, the mandatory reason and the recorded
author. The inventory mutation engine was not touched, duplicated or wrapped.

**No new permission.** All five actions use `authorizePos` (`canOperateCaja`), and
the navigation entry declares the same roles. Whether an adjustment should need a
second pair of eyes is **P-10**, still unanswered.

**Warehouse management deliberately left out.** Creating and editing warehouses is
configuration, not daily operation; folding it into the balances screen would have
made it two screens. Filed as **P-38**.

### P-8 stays open, and is now visible

The screen adds **no sufficient-stock validation**. An adjustment that drives the
balance below zero is recorded, exactly as the engine has recorded it since
POS1.1-D. The suite asserts this explicitly: −30 against 20 leaves −10 and is
accepted. Refusing it here would have been deciding operational policy from a
screen.

### Design system

Composed, not recreated: `PageHeader`, `FilterBar`, `DataTable`, `StatusBadge` +
`defineStatuses`, `FormField`, `Drawer`, `DetailList`, `Notice`, `EmptyState`,
`Select`, `Button`, `Card`. No primitive was modified.

### Defect found

**Two `DataTable`s on one page were indistinguishable.** Both emit `tabla-fila`,
so an assertion counting rows after filtering mixed the balances table with the
movements table and measured the wrong thing. That was a **test defect**, but it
pointed at a real gap: the page gives no way to tell its two tables apart. Both
now sit in labelled wrappers, and the assertion is scoped to the table the filter
actually controls.

### Verification

**SUITE-POS2.3 — 17 browser tests green, plus 2 denied-role tests.** Reachable
from navigation and marking its module · opening a balance creates it at zero
**without writing a movement** · a 25.5 receipt writes `before = 0`,
`after = 25.5` · a −5.5 adjustment chains 25.5 → 20 · **the balance equals the sum
of its ledger** and the invariant holds across every movement · **P-8 preserved**
· the reason is mandatory and its error is associated with the field · a zero
receipt is refused without a round trip · state is computed only against declared
thresholds · the detail says what is absent · filters narrow and clear · and no
horizontal overflow at 1440, 1280, 1024, 768 and 390px, with the table staying a
table on mobile.

### Files

New: `src/features/operations/modules/pos/pos-inventory-panel.tsx`,
`src/app/(operations)/panel/pos/inventario/page.tsx`,
`e2e/pos-inventory.spec.ts`, `e2e/pos-inventory-denied.spec.ts`.
Modified: `src/features/operations/lib/nav-model.ts` (one navigation entry),
`playwright.config.ts`, `package.json`, `docs/POS.md`.

**Nothing under `prisma/` or `src/server/` was touched.** Schema unchanged, no
migration, no dependency added.

### Behaviour changes

- **Visual**: a new navigation entry, "Existencias POS", for the roles that
  already pass `canOperateCaja`.
- **Functional**: opening a balance, registering a receipt and adjusting stock are
  now executable from the application. Their server behaviour is unchanged.
- **Data**: none introduced. The screen writes only through the existing actions.
- **Authorization**: none. `canOperateCaja` still decides, still on the server.

---

## Patch POS2.4 - POS authentication separated from Caja

### Phase 0: part of the foundation already existed

The audit found uncommitted scaffolding already in the tree, predating this
patch: the `PosOperator` model and its migration, the POS session token in
`session.ts`, and `pos/auth.ts` + `pos/auth-actions.ts`. It was well-formed and
was **reused rather than rebuilt** — no second password hasher, no second session
mechanism.

What did not exist: the `/pos` route group, the login screen, the protected
counter routes, operator management, and — the whole point — **the removal of
`POS → canOperateCaja`**. `authorizePos()` still called `requireAuth()` and
`canOperateCaja()`, so operating Caja still implied operating the counter.

The migration was also unapplied; migrations went from 32 applied to **33**.

### The boundary

```text
/pos/*  →  POS session  →  active operator  →  branch scope  →  operation
```

**Its own identity.** `PosOperator`: username, hash, branch, active flag, session
version. Its password never authenticates the panel; the panel's never
authenticates the counter.

**Its own session.** `motomas_pos_session`, distinct from `motomas_session`,
`HttpOnly`, `SameSite=Lax`, 8 hours, with a payload declaring `kind: "pos"` — an
administrative session cannot satisfy that check even though both are signed with
the same key. **Revalidated against the database on every request**, so disabling
an operator or logging out takes effect immediately rather than at token expiry.

**Authorization split three ways.** `authorizePos` (counter, POS session),
`authorizePosCatalogue` (products, categories, brands, warehouses — the
administrative session and its existing predicate), and `authorizePosLookup`
(product search, either identity, read-only). The catalogue stays in the panel
because administering articles always was panel work.

### Why the operator links to an internal user

`PosOperator.userId` **authenticates nothing**. It exists because the audit
foreign keys POS1.x writes — `cashierId`, `createdByUserId` — point at `User` and
are immutable. Changing them would have rewritten the history of every sale and
every inventory movement.

### Scope

MotoMas has one database and **no tenant model**. The branch is the operator's
scope and the server imposes it: the counter's **branch selector is gone**,
because a counter identity already carries its branch.

### Credentials

Created from Configuración under `canManageUsers` — the predicate the repository
already uses to grant access — never from source. **The server generates the
password and shows it once**; afterwards it can only be replaced. Resetting or
disabling rotates the session version, cutting off an operator who was already in.

### Three defects found, and where each was fixed

**A real accessibility gap I introduced**: `/pos/venta` rendered `<main>` with no
heading. Fixed in the page, not in the assertion.

**Two test defects of my own**: `browser.newContext()` inherits the project's
`storageState`, so my "anonymous" contexts arrived carrying a POS session and
fifteen assertions measured the opposite of what they claimed — verified with
`curl` that the server was right (`307 → /pos/login`) before touching anything.
And the logout test invalidated the suite's own shared session, because rotating
`sessionVersion` kills every session of that operator; isolated onto a throwaway
identity rather than weakening the rotation.

**One design consequence, fixed at the edge**: `/panel/pos/venta` passes through
`proxy.ts`, which demands an administrative session, so a counter operator with an
old bookmark landed on the admin login. The compatibility redirect moved into the
proxy, before any administrative authorization gets an opinion.

### Assertions updated to the new contract, none weakened

Four existing assertions described behaviour POS2.4 deliberately removes: the POS
screens being reachable from the **admin** menu, and a global role **choosing a
branch** at the counter. Each was rewritten to assert the surviving — and
stronger — guarantee: the screen is reachable from the terminal, and the sale
lands in the operator's branch because **the server imposes it and the browser
cannot change it**.

### Verification

**SUITE-POS2.4 — 24 browser tests green.** Regression, all green: sale 22/22 ·
cart 17/17 · checkout 14/14 · inventory 17/17 · denied suites 10/10 · products
14/14 · purchases 30/30 · shell 21/21 · components 29/29 · dashboard 20/20 ·
**24/24 Prisma suites**.

`npx tsc --noEmit` clean · `next build` clean, with `/pos/login`, `/pos/venta` and
`/pos/inventario` in the route table · lint flags no file in this patch ·
`prisma migrate status` clean at 33 migrations.

### Behaviour changes

- **Visual**: a dedicated counter terminal at `/pos/*`, deliberately not the
  operations shell. The POS entries left the admin menu.
- **Functional**: the counter requires POS credentials. The branch selector is
  gone. Old URLs redirect.
- **Data**: none. No sale, inventory, purchase or accounting behaviour changed.
- **Authorization**: **the intended change.** `canOperateCaja` no longer grants
  counter access; the catalogue keeps it, because the catalogue is panel work.

---

## Patch POS2.5 - POS payment allocation

### Phase 0: mixed payments already worked

The audit answered the brief's own questions from the code, and the answer was
that the headline capability was already there.

| Question | Answer from the code |
|---|---|
| Multiple payment rows per sale? | **Yes.** `PosPayment` is one-to-many on `saleId` |
| Multiple methods in the schema? | **Yes.** `CashPaymentMethod`: EFECTIVO, TRANSFERENCIA, CHEQUE, TARJETA |
| Does the server require payments to cover the total? | **No, deliberately** — that is P-1 |
| Duplicate methods? | Permitted; neither grouped nor rejected |
| Allocation model? | None separate: payments hang off the sale |
| Change? | **Does not exist** in the model |
| Cash distinct from electronic? | No: same enum, same shape |
| Does Caja consume `PosPayment`? | **No.** No reference outside `src/server/pos/` |
| Does accounting consume them? | **No.** PL-2 still holds |

`pos-sale.spec.ts` has persisted two methods on one sale since POS1.0-D. **There
was nothing to build.** Rebuilding it would have been the duplication every patch
in this sequence has refused.

### What was actually missing

The screen showed the paid amount and the balance but **never stated the state**:
the cashier had to do the subtraction. POS2.5 adds one line that says it in words
— "Sin pagos registrados", "Faltan C$ X por cobrar", "Cobro exacto", "El cobro
supera el total en C$ X" — inside a `role="status"` region.

**The state is never carried by colour alone, and it does not block the sale.**

Derived from the totals the screen already computes; **no second arithmetic**. The
comparison rounds to cents before deciding "exact", because with three-decimal
quantities a residue of 0.000001 is not a difference a cashier should see.

### P-1 stays open, deliberately

The server does **not** require coverage: a short-paid sale is recorded, exactly as
it has been since POS1.0-D. Enforcing it would have decided, on the business's
behalf, whether a till may close short and what overpayment means. The screen
reports; it does not invent. **The suite pins this explicitly**: with 1,000 against
3,703.68 the submit button stays enabled and the sale persists.

The user was asked and chose to keep P-1 open rather than resolve it in this patch.

### Invoicing: audited, and deliberately not built

Not missing code — **missing decisions**. `CashDocument`, `AccountingDocument` and
`ReceivableDocument` all exist, and all three belong to Caja and Contabilidad:
they require an open cash session and post to accounting. Issuing from the counter
through them would re-merge the two products POS2.4 has just separated.

A POS-native receipt would need a tax ID and legal name `Customer` does not have
(**P-40**), a tax rate the repository declares nowhere (**P-6**), and a series
nobody has assigned (**P-41**). Filed as **P-39**.

**There is no fiscal invoicing in this repository, and this patch does not imply
otherwise.**

### Verification

**SUITE-POS2.5 — 18 browser tests, 18 green on the first run**, with 1,234.56 × 3
= 3,703.68 so no total lands round: the state stated in words in all four cases ·
editing and removing rows recalculate · **three methods persisted with exact
amounts** (1,000 + 2,000 + 703.68) summing to the total · two rows of the same
method stored as two · a negative amount rejected leaving no sale · **P-1
preserved** · a server failure leaving no orphan payments and no inventory
movement · keyboard operation and `role="status"` · no horizontal overflow at
1440, 1280, 1024, 768 and 390px.

Regression, all green: sale 22/22 · cart 17/17 · checkout 14/14 · **POS auth
24/24** · inventory 17/17 · dashboard 20/20 · components 29/29 · shell 21/21 ·
purchases 30/30 · products 14/14 · denied suites 10/10 · **24/24 Prisma suites**.

`npx tsc --noEmit` clean · `next build` clean · `prisma migrate status` clean at
33 migrations · lint flags no file in this patch.

### Files

New: `e2e/pos-payments.spec.ts`.
Modified: `src/features/operations/modules/pos/pos-cart-panel.tsx`,
`playwright.config.ts`, `package.json`, `docs/POS.md`.

**No schema change and no migration in this patch** — verified with git: the only
`prisma/` diff is POS2.4's `PosOperator`. **No server action, query or
authorization helper was touched.**

### Behaviour changes

- **Visual**: the payment block states the allocation's status in words, and now
  shows the sale total beside paid and balance.
- **Functional**: none. Nothing that could be submitted before is refused now, and
  nothing new is accepted.
- **Data**: none.
- **Authorization**: none. The POS2.4 boundary is untouched and re-verified.

## Parche POS2.6 - Impresion termica, cajon y recibo

- Se agrego `src/server/pos/escpos.ts`: codificador ESC/POS propio, sin
  dependencias nuevas, que produce los bytes del recibo, del pulso del cajon y
  de la pagina de prueba.
- Se agrego `tools/pos-bridge/bridge.mjs`: servicio local de Windows cuya unica
  responsabilidad es entregar bytes a la impresora. Escucha solo en 127.0.0.1,
  acepta solo `{ bytes: number[] }`, y el destino de impresion sale del entorno
  del proceso y nunca de la peticion.
- Se agrego `src/features/pos/pos-printer.ts`: contrato de hardware del
  terminal, con la configuracion en `localStorage` del equipo. No se modifico
  el esquema de Prisma.
- Se agrego `src/server/pos/receipt-actions.ts`: el recibo se arma en el
  servidor a partir de la venta persistida, con sesion de POS y acotado a la
  sucursal del operador.
- Se agrego `src/features/pos/pos-printer-panel.tsx` a `/pos/venta`: estado de
  la impresora dicho con palabras, prueba de impresion, apertura de cajon y
  configuracion local.
- Al cobrar, si la impresora esta activa, el recibo se imprime solo. **El fallo
  de impresion se avisa aparte del error de cobro y nunca invita a repetir la
  venta.**
- El recibo lleva el pie "Documento no fiscal". No se agrego RUC, serie,
  numero de autorizacion, tasa de impuesto ni integracion con la DGI.
- El terminal bancario sigue siendo un aparato independiente: `TARJETA` se
  registra como anotacion y el POS no afirma autorizacion alguna.
- Se agregaron SUITE-POS2.6 (19 pruebas de navegador con proveedor de hardware
  falso) y SMOKE-POS2.6 (34 comprobaciones de seguridad contra el puente real).
- Se registraron las decisiones pendientes P-42 a P-47 y se actualizo PL-5.

## Parche V1.0 - Arnes de verificacion: el codigo inalcanzable rompe la build

Una auditoria tecnica encontro **6,891 lineas (7.0% de `src/`) inalcanzables
desde cualquier ruta**, entre ellas un subsistema de Cuentas por Cobrar completo
de 1,760 lineas con cero importadores y un servicio de numeracion de documentos
de 690 lineas con cero llamadores.

La forma siempre es la misma: **una capa inferior completa sin capa superior
encima**. Ocurria porque nada se rompia: `tsc --noEmit` pasaba, `next build`
pasaba, y para toda herramienta del repositorio un archivo que nadie importa era
indistinguible de uno que esta en la ruta caliente.

**Este parche no arregla el codigo muerto.** Construye el arnes que lo convierte
en un fallo de build de aqui en adelante, y lo deja pasando en verde.

### Lo que se agrego

- Se agrego `knip.json`: analisis de alcanzabilidad. Los puntos de entrada del
  App Router de Next 16 se declaran explicitamente porque **se cargan por
  convencion y no por un `import`**. El critico es `src/proxy.ts` —el middleware
  renombrado de Next 16, que protege todo `/panel/*`—: sin su linea, knip
  reporta la autorizacion de borde de la aplicacion como codigo muerto.
- Se agregaron los scripts `knip` y `verify` a `package.json`:
  `tsc --noEmit && eslint . && next build && knip`. En ese orden: lo mas barato
  primero, para que un error de tipos cueste segundos y no una build completa.
- Se agrego `.github/workflows/ci.yml`: `npm ci` → `npx prisma generate` →
  `npm run verify`, en cada push y cada pull request, con Node 20.
  `DATABASE_URL` apunta a una direccion deliberadamente inalcanzable
  (`127.0.0.1:1`): `next build` nunca consulta porque `getPrisma()` es un
  singleton perezoso, pero la variable debe **existir** porque
  `isDatabaseConfigured()` es `Boolean(process.env.DATABASE_URL)` y varias
  paginas se ramifican sobre ella al prerenderizar. **No se agrego servicio de
  base de datos ni se corre Playwright en CI**: la suite es serial por diseno y
  exige una base viva, asi que sigue siendo una compuerta local.
- Se agrego `CLAUDE.md` (119 lineas): las reglas permanentes. Definicion de
  terminado —una tarea esta hecha cuando **un usuario puede llegar al cambio por
  una ruta** y `verify` pasa—, construir de arriba hacia abajo, la regla del
  enum contable, la separacion de lineas de negocio (Caja factura motos, el POS
  vende repuestos; **nunca enrutar el POS por `CashDocument`**), las fronteras de
  capa y la regla de que un comentario que contradice al codigo es peor que
  ningun comentario.
- Se agrego `docs/VERIFICATION.md`: que atrapa y que no atrapa cada
  comprobacion, como leer la salida de knip, las tres categorias de la lista de
  ignorados y por que agregar una entrada debe sentirse caro.

### La lista de ignorados es una linea base, no una amnistia

Los 20 archivos que knip reporto **ya estaban** inalcanzables el dia que se
introdujo la comprobacion. Se listaron para que el arnes pudiera entrar en verde
**sin borrar 6,891 lineas en el mismo parche que agrega la comprobacion**: son
dos cambios que deben poder revisarse por separado. **El codigo muerto nuevo no
esta cubierto por nada de esto y rompe la build** (verificado: un modulo
huerfano nuevo hace salir a knip con codigo 1).

Diecinueve entradas, cada una con su motivo y su categoria en linea:

- **CONTRACT** (3): `src/server/finance/numbering/*`. Sin llamador a proposito;
  `service.ts:68` lleva un comentario explicito de "no es codigo muerto, no lo
  borres por no usarse" y `docs/FINANCIAL_FOUNDATION.md` §4 especifica la
  interfaz.
- **WIRING-PENDING** (3): `src/server/finance/receivables/*`. Completo y
  confirmado para conectarse, no para borrarse.
- **DELETE-PENDING** (13): verificados muertos, agendados para el parche de
  limpieza.

El analisis de exportaciones queda **deliberadamente apagado**: hoy reporta 325
exportaciones sin uso, casi todas primitivas del sistema de diseno y guardas de
tipo conservadas como paleta. Poner 325 entradas en la linea base la volveria
insignificante, y ese volumen de ruido es justo lo que ensena a dejar de leer la
salida.

### Se dejo en verde

`npm run lint` reportaba **37 errores y 12 avisos**. Ahora reporta **0 errores**.

- Se borro `src/shared/persistence/repository-types.ts` —doce interfaces
  marcadoras vacias, cero importadores, confirmado antes de borrar—, que era el
  origen de los 12 errores `no-empty-object-type`. **Es el unico borrado de este
  parche.**
- Se eliminaron **7 efectos `set-state-in-effect` demostrablemente inalcanzables**
  en `customers-list`, `customer-files-list`, `inventory-panel`, `leads-inbox`,
  `reservations-panel`, `sales-panel` y `transfers-panel`. En los siete, el valor
  derivado ya cae a `filtrados[0]` durante el render, de modo que la condicion
  `!seleccionado && filtrados[0]` no puede ser cierta nunca: si hay un primer
  elemento el seleccionado no es nulo, y si no lo hay la condicion tampoco se
  cumple. **Borrarlos no cambia comportamiento alguno.**
- Se quitaron los 11 enlaces sin usar (`no-unused-vars`) en lugar de silenciarlos,
  y con ellos el flujo muerto que arrastraban: el estado `quotes`/`credits` del
  panel de dashboard se escribia desde `localStorage` y no lo leia nadie.
- Se quito el parametro `session` de `resolveCurrentShift` y la prop `session` de
  `ClosuresTable` en `cashier-panel`, con sus sitios de llamada.

### Los 18 errores restantes, y por que no se arreglaron aqui

Quedan 18 violaciones de `react-hooks/set-state-in-effect` en **11 archivos, todos
de la capa heredada de `localStorage`** (ninguno es un modulo `-db`; todos
renderizan `null` cuando hay PostgreSQL configurado, y la capa entera esta
agendada para borrarse).

Son de tres clases y **ninguna tiene arreglo local**: hidratacion al montar desde
`localStorage`, que no puede hacerse durante el render y exige
`useSyncExternalStore`; resincronizacion al cambiar una prop, que exige un
remontaje por `key` desde el padre; y validez de la seleccion, que exige derivar
la seleccion efectiva durante el render. Las tres son reescrituras de manejo de
estado sobre ~7,000 lineas sin pruebas unitarias.

Se registraron en una linea base **acotada por archivo** en `eslint.config.mjs`,
con el mismo contrato que la de knip: **nombra los archivos exactos, de modo que
un doceavo archivo sigue rompiendo la build** (verificado), y es `warn` y no
`off`, para que la cuenta siga visible en `npm run lint`. **No se uso ni un solo
comentario `eslint-disable` en linea**: un disable en el sitio esconde el
problema, no caduca y no se puede contar; un bloque enumerado se lee, se cuenta
y se borra de una vez cuando se elimine la capa heredada.

Queda ademas 1 aviso `react-hooks/exhaustive-deps` en `sales-panel.tsx:171`, del
mismo grupo y por la misma razon.

### Cambios de comportamiento

- **Visual**: ninguno.
- **Funcional**: ninguno. Los 7 efectos eliminados eran demostrablemente
  inalcanzables; el estado `quotes`/`credits` del dashboard no lo leia nadie.
- **Datos**: ninguno. **Sin cambio de esquema y sin migracion en este parche.**
- **Autorizacion**: ninguna. No se toco ninguna server action, query ni ayudante
  de autorizacion.

## Parche POS2.7 - Bodega por omision en el seed

El seed del POS ahora aprovisiona una bodega activa por cada sucursal sembrada,
eliminando el bloqueo de cobro en base de datos recien migrada.

### El bloqueo

`prisma/seed.mjs` sembraba sucursales, modelos de catalogo y el Admin de
arranque, pero **ninguna `PosWarehouse`**. El cobro descuenta existencias de una
bodega, asi que `PosCartPanel` deja el boton deshabilitado mientras
`effectiveWarehouse` este vacio, y crear una bodega **no tiene pantalla** (P-38):
`createPosWarehouseAction` y `updatePosWarehouseAction` existen desde POS1.1-B y
no los llama ningun `.tsx`. En una base recien migrada no se podia registrar ni
una sola venta de mostrador.

### El cambio

- Se agrego `seedPosWarehouses()` a `prisma/seed.mjs`, llamado despues de
  `seedBranches()` porque una bodega no puede existir sin sucursal.
- Crea la bodega `PRINCIPAL` / `Bodega principal` para cada una de las 12
  sucursales del arreglo `branches`. El codigo es el que el propio esquema usa
  como ejemplo al documentar `@@unique([branchId, code])`.
- `isActive` se deja en el valor por omision del esquema (`true`), igual que
  hacen `createPosWarehouseAction` y `e2e/fixtures.ts`.

### Por que es idempotente

Se usa `upsert` sobre la clave compuesta `branchId_code`, que es el indice unico
que POS1.1-B ya declaro. **La rama `update` esta vacia a proposito**: una bodega
renombrada o desactivada con `updatePosWarehouseAction` es una decision del
operador, y volver a sembrar no debe pisarla. Verificado en ejecucion: tras
renombrar y desactivar `coyotepe/PRINCIPAL`, una nueva corrida la deja
exactamente igual y no crea duplicado.

### Lo que este parche no hace

- **No abre ningun saldo de `PosInventory`.** Un saldo es un hecho por producto
  que `openPosInventoryAction` crea desde el terminal; inventar cantidades
  iniciales aqui seria inventar mercancia que el negocio nunca recibio. Que la
  bodega exista y que haya saldo son dos cosas distintas.
- **No crea la pantalla de administracion de bodegas.** P-38 sigue abierta.
- No toca autorizacion, cobro, pagos ni inventario.

### Cambios de comportamiento

- **Visual**: ninguno.
- **Funcional**: en una base recien sembrada, `/pos/venta` resuelve bodega activa
  y el boton de cobro deja de estar deshabilitado por falta de bodega.
- **Datos**: se crean filas en `pos_warehouses` al sembrar. **Sin cambio de
  esquema y sin migracion en este parche.**
- **Autorizacion**: ninguna. No se toco ninguna server action, query ni ayudante
  de autorizacion.

## Parche CB4-D3 - El efectivo exige turno de caja abierto

Una venta de mostrador que cobra efectivo ahora **requiere un turno de caja
abierto** del operador y la sucursal de la sesion, y la venta registra a que
turno pertenece. Tarjeta y transferencia siguen cobrandose sin turno.

### El hueco

CB4-B dio al mostrador turno, fondo, movimientos y arqueo, pero
`checkoutPosSaleAction` no sabia que existian. Una venta en efectivo cobrada sin
turno abierto metia dinero real en el cajon **sin que ningun arqueo pudiera
verlo**: el efectivo estaba, la cifra no. Ese es D3.

### La regla

Solo el efectivo. Es la misma distincion por metodo que Caja aplica al derivar lo
esperado (`collectCashClosingInputs` agrupa por `method`) y que CB4 heredo: el
cajon espera los pagos `EFECTIVO`, no el total de la venta. Un pago mixto con
cualquier importe en efectivo exige turno; una venta integramente con tarjeta no
toca el cajon y no lo exige.

`payments: []` sigue siendo legal y no exige turno: no contiene efectivo. Este
parche no cambia esa entrada.

### Donde vive la regla

**Dentro de la transaccion del cobro**, entre la lectura de idempotencia y la
primera escritura. Las dos posiciones importan:

- *Despues de la idempotencia*, porque un reintento de un cobro ya registrado
  devuelve aquella venta sin volver a exigir nada. La venta existe; el turno de
  entonces ya cumplio.
- *Antes de escribir*, porque un rechazo no puede dejar rastro: ni venta, ni
  pagos, ni movimiento de inventario. Al no haber escrito nada, no hay nada que
  deshacer.

El caso inverso es el que si debe reevaluarse: un intento **rechazado** no creo
venta, asi que su clave de idempotencia no quedo ocupada. Si el cajero abre el
turno y reintenta, la regla se evalua de nuevo y pasa. No hizo falta estado
adicional: lo da la ausencia de la fila.

### Por que una clave foranea y no una ventana de tiempo

`PosSale.shiftId` apunta a `PosCashShift`. Caja ya resolvio este problema con
`CashPayment.cashSessionId`, y su arqueo agrupa por esa columna. Atribuir las
ventas del mostrador por la tupla (operador, sucursal, instante) habria inventado
un **segundo mecanismo de atribucion** para el mismo hecho, y no se puede
demostrar correcto cuando un cierre concurre con un cobro.

Anulable y sin relleno retroactivo, igual que `warehouseId` y `operatorId`: las
ventas anteriores a D3 no tuvieron turno y no se les inventa uno. `NULL` tambien
es la respuesta correcta para una venta pagada solo con tarjeta.

### El bloqueo, y por que no basta con leer el estado

Leer `status = 'ABIERTO'` y luego crear la venta es un `check-then-act` bajo READ
COMMITTED: el turno puede cerrarse entre la lectura y el `commit`, **despues** de
que el cierre haya congelado `expectedCash`, y la venta confirmaria con efectivo
invisible para un arqueo ya firmado. Es la misma clase de fallo que CB4-A cerro
con un indice unico parcial.

El cobro toma `SELECT ... FOR UPDATE` sobre el turno y lo retiene hasta el
`commit`; `closePosCashShiftAction` toma **el mismo bloqueo antes de derivar**.
Con eso hay dos desenlaces y los dos son correctos: si el cobro llega primero, el
cierre espera y su derivacion lo incluye; si el cierre llega primero, el cobro
encuentra el turno cerrado y se rechaza.

**Orden de bloqueos: turno primero, inventario despues.** El cobro es el unico
camino que toma las dos clases; el cierre toma solo la primera. Esta escrito en
un comentario junto a los bloqueos de inventario para que un parche futuro no lo
invierta: hacerlo permitiria que un cobro con el saldo bloqueado esperase un
turno que otro cobro tiene.

### El error deja de ser generico

`PosCheckoutError` lleva ahora un `code` opcional
(`PosCheckoutErrorCode = "NO_OPEN_SHIFT"`), y la accion lo devuelve. El mostrador
decide por el codigo, **no comparando el texto en español**: el texto es para el
cajero y puede reescribirse. Con turno ausente, el aviso ofrece un enlace a
`/pos/caja` que abre en otra pestaña para no perder el carrito.

### Verificacion

- `npm run smoke:d3` — 7 correctas. Reproduce la carrera abriendo dos
  transacciones solapadas. **Control negativo comprobado**: al quitar el bloqueo
  del cierre, el esperado se congela en 1 500 en vez de 1 800 y los C$300 del
  cobro en vuelo desaparecen del arqueo.
- `npm run e2e:pos-d3` — 11 correctas: efectivo sin turno, mixto sin turno, turno
  cerrado y turno de otra sucursal se rechazan sin escribir fila alguna;
  tarjeta y transferencia pasan con `shiftId` nulo; efectivo y mixto con turno
  pasan con `shiftId` puesto; y el reintento tras abrir turno cobra una sola vez.

### Lo que este parche no hace

- **No implementa P-13**: `PosInventoryMovement` sigue sin `saleId`.
- **No implementa devoluciones ni anulaciones.**
- **No contabiliza nada**: no se agrego ningun miembro a `AccountingEventType`.
- **No toca `CashSession`**: sigue siendo el turno de la linea de motocicletas.
- **No rediseña el cobro** mas alla de la comprobacion y la columna nueva.

## Parche P-13 - El movimiento de inventario sabe de que venta salio

`PosInventoryMovement.saleId` es ahora una clave foranea a `PosSale`. Hasta aqui
la unica traza hacia la venta era el texto de `reason` (`"Venta POS-000123"`).

### El hueco

Un texto no se puede unir ni indexar con garantias. No habia forma de preguntar
**que movimientos genero una venta**, que es exactamente lo que una devolucion
necesita saber para revertirlos. El propio esquema lo tenia anotado desde INT4,
en el comentario sobre `PosSale.warehouseId`, y
`docs/decisions/pos-sale-return.md` §6 lo nombraba como el paso 2 de la
secuencia CB4 -> P-13 -> devolucion.

### El cambio

- `saleId String?` en `PosInventoryMovement`, FK a `PosSale` con
  `onDelete: Restrict`, indexado por `saleId` — que es la consulta que las
  devoluciones haran.
- Relacion inversa `movements PosInventoryMovement[]` en `PosSale`.
- `applyPosInventoryMovement` acepta `saleId?: string | null` y lo persiste.
- `checkoutPosSaleAction` lo pasa: `saleId: sale.id`, del `create` de **la misma
  transaccion**, asi que no puede señalar una venta inexistente.

### Solo el cobro lo escribe

Se revisaron **los cuatro** call sites del helper compartido:

| Call site | Funcion | Tipo | `saleId` |
|---|---|---|---|
| `actions.ts:1529` | `receivePosPurchaseOrderAction` | `COMPRA` | `null` — es una recepcion de compra |
| `actions.ts:1769` | `returnPosPurchaseOrderAction` | `DEVOLUCION` | `null` — retorno a proveedor |
| `actions.ts:2286` | `runPosInventoryMutation`, embudo de `registerPosInventoryReceiptAction` y `adjustPosInventoryAction` | `INICIAL`/`COMPRA`/`AJUSTE` | `null` — ninguna es una venta |
| `actions.ts:2782` | `checkoutPosSaleAction` | `VENTA` | **la venta** |

`src/server/operations/actions.ts:476` tambien escribe `type: "VENTA"`, pero sobre
`inventoryMovement` — el inventario **serializado de motocicletas**, otro modelo y
otra linea de negocio. No se toca.

**El campo es opcional a proposito.** Obligar a los tres llamadores que no son
ventas a pasar `null` explicito no diria nada que su ausencia no diga ya.

### `reason` no cambia

Sigue siendo el texto legible que un operador lee en la bitacora. `saleId` lo
**acompaña**, no lo sustituye: son dos cosas distintas y las dos hacen falta. Hay
una asercion que lo comprueba.

### Dos fallos de orden en el arnes, encontrados por el `Restrict`

El FK nuevo destapo dos dependencias de orden que estaban latentes en
`cleanupFixtures`:

1. **Los movimientos se borraban despues de las ventas.** Con `RESTRICT`, borrar
   una venta con movimientos atribuidos falla. Ahora los de esas ventas caen
   antes.
2. **Las ventas se recogian solo por sus lineas.** `posSaleIds` se derivaba de
   `posSaleItem`, asi que una venta **sin lineas** —lo que queda cuando una
   corrida anterior borro las lineas y no llego a la venta— sobrevivia invisible
   y, desde D3, bloqueaba el borrado de su turno. Se comprobo: tres huerfanas
   rompian el teardown. Ahora se recogen tambien por `cashierId`.

Ninguno de los dos era un fallo de este parche; los dos eran fallos que este
parche hizo visibles.

### Verificacion

- `npm run smoke:p13` — 9 correctas. Atribucion por FK, un movimiento por linea,
  el ajuste y la recepcion en `NULL`, `Restrict` impidiendo borrar una venta con
  movimientos, y `reason` intacto.
- `npm run e2e:pos-p13` — 6 correctas, cobrando **desde el terminal**: una linea,
  dos lineas con el mismo `saleId`, una venta solo con tarjeta —que no exige turno
  (D3) y aun asi atribuye—, un ajuste manual por la interfaz real que se queda en
  `NULL`, y la consulta por `saleId` devolviendo exactamente lo que la venta movio.

### Lo que este parche no hace

- **No decide P-8.** El comportamiento de saldo negativo de
  `applyPosInventoryMovement` queda exactamente como estaba: sin decidir.
- **No implementa devoluciones**: ni `PosSaleReturn`, ni `PosSaleReturnItem`, ni
  `PosRefund`.
- **No contabiliza nada**: ningun miembro nuevo en `AccountingEventType`.
- **No relaciona el movimiento con la orden de compra.** P-13 cerro la mitad de la
  **venta**; la de la orden es otra pregunta y sigue abierta.

## Parche DEV-A - Devolucion de venta del mostrador

El mostrador **devuelve mercancia y paga efectivo** en una sola transaccion.
Cierra la pregunta que `docs/decisions/pos-sale-return.md` dejo abierta desde su
auditoria: que pasa con el dinero.

### La decision

**Reembolso en efectivo del turno abierto, y solo efectivo.** Nada de credito a
favor ni de `ReceivableDocument`: eso es la Opcion B y habria fusionado el POS con
el contexto financiero, que CLAUDE.md separa a proposito.

**El tope por venta es el efectivo que esa venta cobro, menos lo ya reembolsado
contra ella.** No el total de la venta: `PosPayment` no se ata a lineas, asi que
una venta mixta de C$100 en efectivo y C$900 con tarjeta no dice que articulo pago
cada metodo. Repartir por linea exigiria inventar una imputacion que el
repositorio no tiene; el tope por venta es la unica que no se puede forzar.

**Una devolucion que excederia el tope se rechaza entera.** No se recorta en
silencio: recortar dejaria mercancia devuelta y dinero sin devolver, sin que nada
lo registre.

**Una venta sin efectivo no se devuelve aqui**, y se rechaza con el codigo
`CARD_ONLY_SALE`. Registrar solo la reposicion bajo la etiqueta «devolucion»
seria un documento con aspecto financiero que no mueve dinero. La pantalla lo
explica y remite al ajuste de inventario, que es lo que de verdad ocurre. El caso
queda documentado en `docs/decisions/pos-card-return.md`.

### El estado se deriva, no se guarda

**No se agrego `PARCIALMENTE_DEVUELTA` a `PosSaleStatus`.** Lo devuelto es la suma
de `PosSaleReturnItem`, y un estado derivado no puede desincronizarse de sus
datos; un miembro de enum si. **La venta original no se muta**: sigue diciendo lo
que se cobro el dia que se cobro.

### Orden de bloqueos: cabecera -> turno -> inventario

Tres clases de bloqueo en una transaccion, y el orden es carga estructural:

1. **`pos_sales`**, la cabecera. Serializa dos devoluciones contra la misma venta.
   Lo que hay que proteger —cuanto queda por devolver de cada linea y cuanto
   efectivo queda— **se calcula desde aqui**, asi que se lee bajo este bloqueo y
   nunca antes. Mismo patron que la recepcion de ordenes de compra.
2. **`pos_cash_shifts`**, solo si hay efectivo. Antes que el inventario, para
   respetar el orden global que D3 establecio.
3. **`pos_inventory`**, una fila por linea, ordenadas por `productId`.

Documentado en un comentario junto a los bloqueos para que un parche futuro no lo
invierta.

**Comprobado con control negativo**: al quitar el bloqueo de la cabecera, dos
devoluciones simultaneas de la misma linea **prosperan las dos** y se devuelven
**13 unidades de una linea de 10**. Con el bloqueo, una gana y la otra se rechaza
por exceder.

### Reutiliza CB4 en vez de inventar un modelo

**No hay `PosRefund`.** El reembolso es un `PosCashMovement` de tipo `SALIDA` —
salida de efectivo de un turno abierto, con motivo y autor, que es exactamente lo
que CB4 modelo— mas una columna `saleReturnId` que lo ata a la devolucion que lo
justifica. Ninguna invariante de CB4 cambia: el importe sigue siendo positivo y la
direccion sigue en `type`.

`DEVOLUCION_CLIENTE` es miembro propio del enum de movimientos y **no** reutiliza
`DEVOLUCION`: esa la escribe el retorno a proveedor con cantidad negada. Son
direcciones opuestas, y compartir el tipo dejaria la bitacora sin poder
distinguirlas.

### Dos filas, no una mutada

El movimiento de la devolucion lleva `saleId` **y** `returnId`. La salida del
cobro y la entrada de la devolucion son **filas distintas**; ninguna se reescribe.

### Verificacion

- `npm run smoke:return` — 13 correctas, incluida la carrera y su control
  negativo.
- `npm run e2e:pos-devoluciones` — 8 correctas contra la accion real: devolucion
  completa, dos parciales acumulando, la tercera que excede rechazada, el tope de
  una venta mixta, la venta con tarjeta explicando por que no, el rechazo sin
  turno con su enlace a la caja, la venta de otra sucursal inalcanzable, y el
  estado derivado sobreviviendo a la recarga.

### Dos ordenes de limpieza que los `RESTRICT` destaparon

`cleanupFixtures` borraba las lineas de venta antes que las de devolucion, y las
ventas antes que sus devoluciones. Los tres `RESTRICT` nuevos lo hicieron visible
y se corrigio el orden. No era un fallo de este parche; era uno que este parche
hizo salir.

### Lo que este parche no hace

- **No toca `checkoutPosSaleAction`.** El cobro esta terminado y fuera de alcance.
- **No contabiliza nada**: ningun miembro nuevo en `AccountingEventType`. Una
  devolucion no revierte ningun ingreso porque el POS nunca registro uno.
- **No comprueba el saldo del cajon.** Si una `SALIDA` puede exceder el efectivo
  disponible es una pregunta abierta de CB4 — `registerPosCashMovementAction`
  tampoco lo comprueba — y este parche no la responde por su cuenta.
- **No toca credito a favor ni `ReceivableDocument`.**
- **No arregla el determinismo de `returnNumber`**, que sigue el mismo patron que
  `saleNumber` con su misma limitacion conocida (**P-41**).


## Meta-1: Webhook + Lead Ads (completo)

Los leads de Meta Lead Ads entran solos al CRM. Entran por la unica ruta de API
del repositorio, y aterrizan en la sucursal correcta porque ahora existe una
tabla que dice que pagina de Facebook atiende cual.

### La unica ruta de API, y por que

`src/app/api/webhooks/meta/route.ts`. CLAUDE.md dice «No API routes» y hasta este
parche el repositorio tenia cero. La excepcion existe por una razon que la regla
general no admite: **Meta llama a una URL publica fija por HTTP**, y una Server
Action no es un contrato invocable por un tercero — su endpoint lo genera el
compilador y cambia entre builds.

Todo lo demas de la integracion sigue siendo Server Action en
`src/server/meta/actions.ts`. La regla de CLAUDE.md ahora nombra esta ruta para
que nadie la borre por limpieza, y dice explicitamente que no es un precedente.

### Lo que el webhook NO trae

El payload de `leadgen` trae `leadgen_id`, `page_id`, `form_id` y la fecha. **No
trae nombre, telefono ni correo.** Las respuestas se van a buscar al Graph API
con el token de pagina. Tratar el payload como si fueran los datos del lead es el
error habitual de esta integracion: no falla, crea leads vacios.

### La firma, antes de tocar la base

HMAC-SHA256 del cuerpo **crudo** contra `X-Hub-Signature-256`, comparado con
`timingSafeEqual`. 401 antes de Prisma. Sin esto, cualquiera que descubra la URL
inyecta leads falsos. El smoke lo prueba firmando un cuerpo y enviando otro, y
contando que no hubo ni escrituras ni llamadas al Graph API.

### La sucursal: lo que bloqueo el intento anterior

`Lead.branchId` es obligatorio y el payload de Meta no sabe de sucursales. Son
14. El intento anterior se detuvo aqui, correctamente, en vez de adivinar.

`MetaPageBranch` es esa decision, guardada en la base y no en el codigo: Marketing
conecta una pagina nueva desde el panel, sin despliegue.

### Lo que llega de una pagina sin mapear no se pierde

`MetaUnmappedLead` es el anden. Un lead cuya pagina no esta mapeada —o esta
mapeada pero inactiva— se guarda ahi **con sus respuestas ya traidas del Graph
API**, y espera a que alguien elija sucursal desde el panel. No se descarta y no
se le adivina una sucursal. Es un estado normal mientras se conectan las paginas,
no un error: por eso responde 200 y por eso se registra como `info`.

`resolveUnmappedMetaLead` usa **la misma** funcion de mapeo que el webhook, no una
copia: un lead resuelto a mano y uno captado solo quedan guardados igual.

### Idempotencia en los dos caminos

Meta reenvia ante cualquier respuesta que no sea 200. `Lead.metaLeadgenId` y
`MetaUnmappedLead.leadgenId` son unicos, y el P2002 se resuelve releyendo al
ganador — el mismo patron que `checkoutPosSaleAction` y `return-actions.ts`. El
reenvio de un lead ya creado ademas se corta antes de gastar otra llamada al
Graph API.

### El unico `console.*` de `src/`

`src/server/meta/log.ts`. Todo lo demas del repositorio devuelve el error a quien
lo pidio; al webhook lo llama Meta, no una persona, y la respuesta HTTP solo puede
ser un numero. Se concentro en un modulo para que la excepcion quede localizada.
No registra respuestas de formulario: solo identificadores.

### Verificacion

- `npm run smoke:meta` — **51 correctas, 0 fallos.** Peticiones HTTP reales
  contra los handlers exportados por la ruta: saludo con token bueno y malo,
  firma manipulada y sin firma, pagina mapeada, sin mapear e inactiva, los dos
  reenvios, evento ajeno, resolucion manual con su segundo intento, y el CRUD con
  su puerta de permiso. El Graph API esta simulado; el resto es codigo real.
- `npm run verify` — completo.

### Lo que este parche no hace

- **No envia WhatsApp ni responde automaticamente.** La ruta esta preparada para
  recibir esos eventos y hoy los ignora con 200.
- **No toca nada de Meta Ads**: ni campanas, ni metricas, ni presupuestos, ni
  pagos.
- **No toca el POS.**
- **No reconcilia el anden automaticamente.** Mapear una pagina no reprocesa lo
  que ya quedo esperando; la resolucion es manual, una fila a la vez. Es una
  tarea futura razonable, no esta hecha.
- **No decide que pasa si una pagina atiende varias sucursales.** Una pagina, una
  sucursal.

## Meta-2: WhatsApp send + auto-reply

WhatsApp entra y sale por el CRM. Entra por la **misma** ruta y la **misma**
firma que Lead Ads: no hubo que abrir una segunda excepcion a la regla de
CLAUDE.md, que era la duda razonable al empezar.

### Dos eventos bajo el mismo nombre de campo

La forma se verifico contra la documentacion vigente de Meta, no de memoria.
Lead Ads llega con `object: "page"` y `field: "leadgen"`. WhatsApp llega con
`object: "whatsapp_business_account"` y **`field: "messages"` para las dos
cosas**: los mensajes del cliente y las devoluciones de estado de lo que
enviamos nosotros.

Lo que las distingue no es el campo sino que arreglo trae el `value`:
`value.messages[]` o `value.statuses[]`. Ramificar por `field` y quedarse ahi es
el error que hace que los estados de entrega se pierdan en silencio, y es
exactamente el que habria cometido quien diera la forma por sabida.

### La ventana de 24 h se deriva de la bitacora

Meta solo permite texto libre dentro de las 24 h del ultimo mensaje del cliente.
Fuera de eso, plantilla aprobada o nada.

El momento del ultimo entrante **se calcula desde `whatsapp_messages`**, no desde
un campo "visto por ultima vez": un campo aparte se desvia del log en cuanto una
escritura falla a medias, y entonces la ventana deja de describir la conversacion
que de verdad ocurrio.

El rechazo tiene codigo propio (`fuera-de-ventana`), no un fallo generico, para
que la pantalla pueda ofrecer la plantilla en vez de mostrar el error criptico de
Meta. **El CRM nunca cambia por su cuenta un texto libre por una plantilla**:
cual plantilla es decision de negocio, y mandar algo distinto de lo que el
vendedor escribio seria peor que no mandar nada.

### Que se registra y que no

Solo deja fila lo que **llego a intentarse contra la API**. Un envio rechazado
antes de salir —fuera de ventana, sin numero configurado, plantilla no aprobada—
nunca llego a Meta, no tiene `wa_message_id` y no hay nada que correlacionar
despues; guardarlo llenaria el hilo de mensajes que el cliente nunca pudo
recibir. Un envio que si salio y Meta rechazo si queda, como `FALLIDO`.

Un mensaje **entrante** se guarda siempre, aunque su telefono no corresponda a
ningun `Lead` ni `Customer`. Misma regla que `MetaUnmappedLead` fijo en Meta-1.

### La bienvenida, una sola vez

"Primero" se decide contando las filas de ese telefono despues de insertar la
entrante: si hay exactamente una, la recien creada es la primera que ha existido
nunca. Contra la bitacora y no contra una marca aparte, para que ni un reenvio ni
un mensaje concurrente ni una respuesta anterior fallida puedan producir un
segundo saludo.

Si el saludo falla, la entrega responde **200 igual**. Un 500 haria que Meta
reenviara el MISMO mensaje entrante, y el cliente acabaria con la conversacion
duplicada por culpa de una cortesia.

El texto es provisional y vive en una sola constante,
`WHATSAPP_WELCOME_MESSAGE_ES` en `src/server/whatsapp/shared.ts`, para que
cambiar la redaccion sea editar una linea.

### Los estados solo avanzan

Meta entrega las devoluciones desordenadas: un `sent` puede llegar despues de un
`delivered`. Aplicarlas tal cual haria retroceder lo que se muestra. `FALLIDO`
queda fuera de la escala y siempre gana. Un estado de un `wa_message_id` que no
esta en la bitacora se registra y se ignora — crear una fila a partir de un
estado inventaria un mensaje del que no se conoce ni el texto ni el destinatario.

### El numero emisor todavia no existe

`WHATSAPP_PHONE_NUMBER_ID` esta vacio a proposito: el numero real sigue pendiente
de alta. Con la variable vacia, **recibir sigue funcionando** y enviar falla con
su codigo propio y el mensaje `WHATSAPP_PHONE_NUMBER_ID no configurado`, sin
dejar fila. No revienta y no se queda callado.

### Verificacion

- `npm run smoke:meta2` — **39 correctas, 0 fallos.**
- `npm run smoke:meta` — **51 correctas, 0 fallos** (Meta-1 intacto).
- `npm run verify` — completo.

### Lo que este parche no hace

- **No gestiona plantillas.** No las crea ni las somete a aprobacion; eso es el
  WhatsApp Manager. `WHATSAPP_APPROVED_TEMPLATES` declara cual se puede enviar, y
  hoy contiene la de muestra `hello_world` como marcador de posicion.
- **No toca el camino de Lead Ads.** `collectLeadgenChanges` y
  `createLeadFromMetaFields` quedaron sin modificar; la ruta descuenta `messages`
  de su lista de ignorados en vez de cambiar esa funcion.
- **No toca el POS.**
- **No hace nada de Meta Ads.**
- **No responde automaticamente mas alla del primer contacto.** Del segundo
  mensaje en adelante contesta una persona.

## Meta-3: Ad account connection registry

Que cuentas publicitarias sigue MotoMas, y sus datos basicos leidos de Meta.
**Solo consulta**: ni una llamada de escritura a la Marketing API.

### No entra por el webhook, y por eso es un modulo aparte

Lead Ads y WhatsApp *reciben* lo que Meta empuja. Esto *consulta* con peticiones
`GET`. Comparten proveedor, no mecanismo, asi que vive en `src/server/meta-ads/`
y no toca `src/app/api/webhooks/meta/route.ts` ni nada bajo `src/server/meta/`.

Lo que si comparte es el patron que Meta-1 dejo montado con `MetaPageBranch`:
tabla en la base, panel autoservicio, y la misma puerta `canManageMarketing`
(Admin y MARKETING). No se invento ningun permiso nuevo.

### Un token, todas las cuentas

Todas las cuentas cuelgan del mismo Business Manager y son del mismo negocio, asi
que un unico token de Usuario del Sistema las lee todas. **No hizo falta construir
un OAuth por cuenta**, que era la alternativa cara y que este parche evita a
proposito.

### `ads_read`, nunca `ads_management`

Minimo privilegio deliberado. `ads_management` permite crear campanas, pausarlas
y mover presupuestos — o sea, gastar dinero. Se pedira mas adelante, junto con
topes de gasto duros, y **no antes de que esos topes existan**: un token capaz de
gastar sin nada que limite cuanto es un riesgo sin contrapartida.

El codigo respalda la decision: `src/server/meta-ads/client.ts` solo hace `GET`, y
no funcionaria distinto con mas permisos. La unica mencion de `ads_management` en
todo el parche es la advertencia de `.env.example` que dice que no se conceda.

### El orden de las comprobaciones al conectar

1. **La forma del identificador** (`act_` + digitos). Un valor mal escrito no
   puede existir en Meta, asi que gastar una llamada de red en confirmarlo seria
   tirar una peticion para saber lo que ya se sabe. El smoke lo prueba contando
   las llamadas, no leyendo el mensaje.
2. **El Graph API.** Esta es la validacion de verdad: comprueba que la cuenta
   existe Y que este token puede leerla. Sin ella el registro aceptaria
   identificadores bien formados que no sirven, y el fallo saldria mucho despues.
3. **Solo entonces** se escribe la fila, ya con los metadatos traidos.

Si falla cualquiera de los dos primeros, no se crea ninguna fila.

El identificador se guarda **con** el prefijo `act_` porque es la forma literal
que el Graph API espera como ruta del nodo; guardarlo pelado obligaria a
recomponerlo en cada llamada y a acertar siempre.

### La cache es cache, y se nota

`accountName`, `currency` y `accountStatus` son lo que Meta dijo al conectar o en
la ultima resincronizacion **manual**. No hay trabajo programado que los refresque
— eso es del tablero de metricas, no de este parche. `lastSyncedAt` nace nulo y el
panel muestra "Sin resincronizar" hasta que alguien pulse el boton, para que se
sepa en vez de suponerse.

`isActive` es el interruptor de MotoMas y es independiente del estado que Meta le
de a la cuenta: una ACTIVE puede dejar de interesarnos y una DISABLED puede seguir
importando para consultar historial.

### Desconectar no revoca

Borrar la fila deja de seguir la cuenta aqui y **nada mas**. El Usuario del
Sistema conserva el mismo acceso; revocarlo es un paso manual y aparte, en el
Business Manager. Lo dice el panel debajo de la tabla, y el smoke lo demuestra
reconectando la cuenta despues de desconectarla.

### Verificacion

- `npm run smoke:meta3` — **40 correctas, 0 fallos.**
- `npm run verify` — completo.

### Lo que este parche no hace

- **No crea campanas, no las pausa, no cambia presupuestos, no gasta dinero.**
- **No sincroniza solo.** Resincronizar es un boton.
- **No lee metricas** (impresiones, clics, gasto). Eso es el tablero, la tarea
  siguiente.
- **No toca Lead Ads, WhatsApp ni el POS.**

## Meta-4: read-only metrics dashboard

Impresiones, clics, gasto, CTR y CPC por cuenta publicitaria, dentro del mismo
panel de Marketing. Sigue siendo **solo lectura**: el mismo token `ads_read`, una
peticion `GET` mas, cero llamadas de escritura.

### Fotos guardadas, no consulta en vivo

Es la decision que estructura todo el parche. La Marketing API limita la
frecuencia con dureza, y el limite se cuenta por app y por cuenta publicitaria.
Un tablero que consultara en cada carga haria **14 peticiones por visita** con 14
cuentas conectadas, multiplicadas por cada persona que lo mire, y al alcanzar el
limite dejaria de funcionar justo cuando mas se esta mirando.

    Boton «Actualizar»  ->  GET /act_.../insights  ->  se GUARDA una foto
    Cargar la pantalla  ->  se LEE la foto guardada ->  cero peticiones a Meta

`getLatestMetaAdMetrics()` no tiene ninguna llamada de red, y **eso esta probado
contando las llamadas al Graph API antes y despues de invocarla**, no afirmado.
La contrapartida se asume de frente: lo que se ve puede estar viejo, y por eso
cada fila lleva su edad. Un numero sin fecha invita a creer que es de ahora.

### Historial, no casilla de cache

Cada refresco anade una fila; no pisa la anterior. El tablero se queda con la mas
reciente por (cuenta, periodo) y el resto queda como registro de que dijo Meta y
cuando — util el dia que alguien pregunte por que el gasto de un mes cambio
despues de que Meta reprocesara atribuciones.

Sin clave foranea a `meta_ad_accounts` **a proposito**: la tabla guarda el `act_…`
y no el cuid del registro, para que desconectar una cuenta no borre la prueba de
lo que se gasto. Misma postura que `pos_sale_returns` y `meta_unmapped_leads`. Que
la cuenta exista hoy lo comprueba la aplicacion, que es donde esa regla puede
decir algo util en espanol en vez de un error del motor.

### «Sin datos» no es «cero gasto»

Una cuenta nunca consultada para ese periodo muestra «Sin datos — actualizar», no
una fila de ceros. Son dos estados distintos —«no hemos preguntado» y
«preguntamos y no hubo entrega»— y colapsarlos haria que una cuenta olvidada
pareciera una que no gasto nada, que es el error que hace decidir presupuestos al
reves. El smoke los distingue explicitamente.

En la misma linea: sin clics, el CPC queda **nulo y no cero**. Un coste por clic
sin clics no es cero, es nada.

### El fallo de una cuenta no arrastra a las demas

`refreshAllMetaAdMetrics` recorre las cuentas **en secuencia, no con
`Promise.all`**: disparar una peticion por cuenta a la vez es exactamente lo que
los limites de frecuencia castigan. Si una cuenta perdio el acceso, se anota y se
sigue; el panel dice cuantas entraron y cual fallo, en vez de un «fallo» que
ocultaria el avance.

### Detalles que la documentacion de Meta decidio

- Los cinco `date_preset` se verificaron contra la referencia vigente de Insights
  antes de escribir el mapeo, no de memoria.
- Las metricas llegan como **texto** («"1234"», «"78.90"») y se conservan como
  texto hasta que Prisma las convierte a `Decimal`: pasar por `number` a mitad de
  camino introduciria el error de coma flotante que la columna `Decimal` existe
  para evitar.
- `ctr` se guarda tal cual lo da Meta y **no se recalcula** desde clics entre
  impresiones: Meta aplica sus propias reglas de atribucion, y un calculo nuestro
  daria otro numero que pareceria un error de Meta cuando seria nuestro.
- `account_currency` se pide en el mismo informe, ademas de los cinco campos de
  negocio, para que la cifra y su moneda vengan del mismo sitio en vez de que la
  moneda dependa de una cache que pudo quedarse vieja.

### Verificacion

- `npm run smoke:meta4` — **32 correctas, 0 fallos.**
- `npm run verify` — completo.

### Lo que este parche no hace

- **No crea campanas, no las pausa, no cambia presupuestos, no gasta dinero.**
- **No anade ningun trabajo programado.** Refrescar lo dispara una persona.
- **No usa `ads_management` en ningun sitio.**
- **No toca Lead Ads, WhatsApp ni el POS.**
