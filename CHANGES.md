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
