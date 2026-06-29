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
