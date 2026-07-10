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
