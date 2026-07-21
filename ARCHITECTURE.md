# MotoMas — Arquitectura funcional y técnica

## 1. Objetivo de la arquitectura

La arquitectura de MotoMas debe reflejar la operación real del negocio.

La plataforma debe manejar dos experiencias separadas:

1. Portal Cliente
2. Centro de Operaciones

Ambas experiencias pueden compartir:

- Colores
- Tipografías
- Componentes base
- Catálogo
- Utilidades
- Tipos comunes

Pero no deben mezclar:

- Navegación
- Layouts
- Sesiones
- Menús
- Roles
- Información privada
- Módulos internos

---

## 2. Dos productos dentro del mismo proyecto

### 2.1 Portal Cliente

El Portal Cliente es público.

Está orientado a:

- Visitantes
- Prospectos
- Clientes

Objetivos:

- Mostrar catálogo.
- Mostrar motocicletas.
- Recibir solicitudes de información.
- Permitir selección de sucursal.
- Consultar expediente.
- Consultar crédito.
- Consultar reserva.
- Consultar entrega.

El Portal Cliente no debe sentirse como parte del ERP interno.

Debe tener su propio header, navegación y diseño orientado al cliente final.

Rutas sugeridas:

```txt
/
/catalogo
/motocicletas/[slug]
/solicitar-informacion
/consultar-expediente
/mi-credito
/mi-reserva
/mi-entrega
```

---

### 2.2 Centro de Operaciones

El Centro de Operaciones es privado.

Está orientado a:

- Vendedor
- Gerente
- Administrador

Objetivos:

- Gestionar leads.
- Gestionar clientes.
- Crear cotizaciones.
- Crear expedientes.
- Dar seguimiento a créditos.
- Consultar inventario.
- Gestionar traslados.
- Registrar ventas.
- Consultar reportes según rol.
- Gestionar configuración.

Rutas sugeridas:

```txt
/panel
/panel/dashboard
/panel/leads
/panel/clientes
/panel/expedientes
/panel/creditos
/panel/inventario
/panel/traslados
/panel/ventas
/panel/vendedores
/panel/reportes
/panel/configuracion
```

No debe existir navegación operativa fuera de `/panel`.

---

## 3. Estructura de rutas recomendada

```txt
src/
  app/
    layout.tsx
    globals.css

    (portal)/
      layout.tsx
      page.tsx
      catalogo/
        page.tsx
      motocicletas/
        [slug]/
          page.tsx
      solicitar-informacion/
        page.tsx
      consultar-expediente/
        page.tsx
      mi-credito/
        page.tsx
      mi-reserva/
        page.tsx
      mi-entrega/
        page.tsx

    (operations)/
      panel/
        layout.tsx
        page.tsx
        dashboard/
          page.tsx
        leads/
          page.tsx
        clientes/
          page.tsx
        expedientes/
          page.tsx
        creditos/
          page.tsx
        inventario/
          page.tsx
        traslados/
          page.tsx
        ventas/
          page.tsx
        vendedores/
          page.tsx
        reportes/
          page.tsx
        configuracion/
          page.tsx
```

Los grupos `(portal)` y `(operations)` no afectan la URL.

Sirven para mantener layouts separados sin crear rutas innecesarias.

---

## 4. Estructura de carpetas recomendada

```txt
src/
  app/
  features/
    portal/
      components/
      layouts/
      sections/
      services/
      types.ts

    operations/
      components/
      layouts/
      modules/
        dashboard/
        leads/
        clientes/
        expedientes/
        creditos/
        inventario/
        traslados/
        ventas/
        vendedores/
        reportes/
        configuracion/
      services/
      types.ts

  shared/
    components/
      ui/
    lib/
    styles/
    types/

  data/
    catalog/
    operations/

docs/
  PROJECT_RULES.md
  ARCHITECTURE.md
  ROLES.md
  FLOWS.md
```

---

## 5. Layouts

### 5.1 Root Layout

`src/app/layout.tsx`

Debe contener únicamente infraestructura compartida:

- `<html>`
- `<body>`
- Fuentes
- `globals.css`
- Metadata base
- Providers globales realmente necesarios

No debe contener:

- Sidebar
- Login
- Navegación
- Header interno
- Menú operativo
- Selector de roles

---

### 5.2 Portal Layout

`src/app/(portal)/layout.tsx`

Puede contener:

- Header público
- Footer
- Navegación móvil
- CTA para solicitar información
- Acceso para consultar expediente

No puede contener:

- Sidebar operativo
- Menú de administración
- Reportes
- Inventario interno
- Usuarios
- Vendedores
- Login de gerente o vendedor

---

### 5.3 Operations Layout

`src/app/(operations)/panel/layout.tsx`

Puede contener:

- Sidebar interno
- Topbar
- Breadcrumbs
- Sesión operativa
- Protección de rutas
- Selector de sucursal cuando corresponda
- Menú condicionado por rol

No debe renderizarse en Portal Cliente.

---

## 6. Dependencias compartidas

### Permitido compartir

- Botones
- Tarjetas
- Inputs
- Badges
- Modales
- Tablas base
- Helpers
- Formatos de fecha
- Tokens visuales
- Colores
- Tipografías
- Tipos públicos del catálogo
- Fuente base de motocicletas
- Componentes UI reutilizables

Ejemplos:

```txt
src/shared/components/ui/button.tsx
src/shared/components/ui/card.tsx
src/shared/components/ui/input.tsx
src/shared/components/ui/badge.tsx
src/shared/lib/utils.ts
src/shared/styles/tokens.css
src/data/catalog/
```

### No compartir directamente

- PortalHeader con OperationsTopbar
- Portal nav con OperationsSidebar
- Sesión cliente con sesión interna
- Inventario operativo con catálogo público
- Reportes con portal cliente
- Datos privados de vendedores
- Utilidades
- Métricas corporativas
- Stock operativo detallado visible al público

El catálogo puede usar una fuente base común, pero debe exponerse en dos capas:

- Vista pública
- Vista operativa

---

## 7. Módulos funcionales

### 7.1 Dashboard

Debe cambiar según rol.

No es una sola pantalla para todos.

### 7.2 Leads

Funciones:

- Recibir leads.
- Filtrar por sucursal.
- Ver origen.
- Asignar vendedor.
- Cambiar estado.
- Ver historial.

### 7.3 Clientes

Funciones:

- Buscar cliente.
- Ver historial multi-sucursal.
- Ver vendedores que interactuaron.
- Ver cotizaciones.
- Ver expedientes.
- Ver créditos.
- Ver reservas.
- Ver ventas.

### 7.4 Expedientes

Funciones:

- Crear expediente.
- Adjuntar datos básicos.
- Relacionar cliente.
- Relacionar moto.
- Relacionar sucursal.
- Relacionar vendedor.
- Registrar avance comercial.

### 7.5 Créditos

Funciones:

- Crear solicitudes.
- Registrar financiera.
- Actualizar estado manualmente.
- Registrar observaciones.
- Ver historial.
- Relacionar con cliente y expediente.

### 7.6 Inventario

Funciones:

- Ver stock total.
- Ver stock por sucursal.
- Ver unidades.
- Ver VIN.
- Ver estado.
- Ver ubicación actual.
- Ver historial de movimientos.

### 7.7 Traslados

Funciones:

- Crear solicitud.
- Aprobar.
- Marcar en tránsito.
- Confirmar recepción.
- Cancelar.
- Ver historial.

### 7.8 Ventas

Funciones:

- Registrar venta.
- Relacionar cliente.
- Relacionar unidad.
- Relacionar sucursal.
- Relacionar vendedor.
- Relacionar crédito si aplica.

### 7.9 Vendedores

Funciones:

- Ver vendedores de sucursal.
- Ver leads activos.
- Ver ventas del mes.
- Ver conversión.
- Ver actividad reciente.
- Apoyar asignación equilibrada.

### 7.10 Reportes

Funciones:

- Reportes por sucursal.
- Reportes corporativos.
- Comparación de sucursales.
- Ventas.
- Inventario.
- Traslados.
- Créditos.
- Rendimiento comercial.

### 7.11 Configuración

Funciones futuras:

- Usuarios
- Roles
- Permisos
- Sucursales
- Catálogo
- Financieras
- Metas

---

## 8. Modelo de datos recomendado

La versión real debe usar una base de datos relacional.

Recomendación:

- PostgreSQL
- Prisma ORM

Entidades principales:

```txt
users
roles
permissions
user_roles
branches
branch_targets

leads
lead_assignments
customers
customer_interactions
quotes
customer_files

financial_institutions
credit_applications
credit_status_history

motorcycle_models
motorcycle_units
inventory_movements

reservations
transfer_orders
transfer_order_items
transfer_status_history

sales
activity_logs
```

---

## 9. Relaciones principales

```txt
branches 1 ─── N users
branches 1 ─── N leads
branches 1 ─── N motorcycle_units
branches 1 ─── N sales

customers 1 ─── N customer_interactions
customers 1 ─── N quotes
customers 1 ─── N customer_files
customers 1 ─── N credit_applications
customers 1 ─── N reservations
customers 1 ─── N sales

motorcycle_models 1 ─── N motorcycle_units
motorcycle_units 1 ─── N inventory_movements

transfer_orders 1 ─── N transfer_order_items
transfer_orders 1 ─── N transfer_status_history

credit_applications 1 ─── N credit_status_history
```

---

## 10. Campos mínimos sugeridos

### branches

```txt
id
name
city
address
is_active
created_at
updated_at
```

### users

```txt
id
name
email
phone
role_id
branch_id
is_active
created_at
updated_at
```

### leads

```txt
id
name
phone
email
source
motorcycle_model_id
desired_branch_id
status
assigned_user_id
created_at
updated_at
```

### customers

```txt
id
name
phone
email
identification
created_at
updated_at
```

### customer_interactions

```txt
id
customer_id
branch_id
user_id
motorcycle_model_id
type
notes
created_at
```

### quotes

```txt
id
customer_id
branch_id
user_id
motorcycle_model_id
status
notes
created_at
updated_at
```

### customer_files

```txt
id
customer_id
branch_id
user_id
motorcycle_model_id
status
created_at
updated_at
```

### financial_institutions

```txt
id
name
is_active
```

### credit_applications

```txt
id
customer_id
customer_file_id
financial_institution_id
status
notes
created_at
updated_at
```

### motorcycle_models

```txt
id
name
brand
category
description
image
is_active
```

### motorcycle_units

```txt
id
motorcycle_model_id
vin
chassis_number
engine_number
color
current_branch_id
status
created_at
updated_at
```

### inventory_movements

```txt
id
motorcycle_unit_id
movement_type
origin_branch_id
destination_branch_id
reference_type
reference_id
notes
created_at
```

### transfer_orders

```txt
id
origin_branch_id
destination_branch_id
requested_by
approved_by
status
requested_at
approved_at
dispatched_at
received_at
notes
```

### transfer_order_items

```txt
id
transfer_order_id
motorcycle_unit_id
```

### reservations

```txt
id
customer_id
motorcycle_unit_id
branch_id
user_id
status
reserved_at
expires_at
```

### sales

```txt
id
customer_id
motorcycle_unit_id
branch_id
user_id
reservation_id
credit_application_id
sale_type
status
sold_at
```

### activity_logs

```txt
id
user_id
branch_id
action
entity_type
entity_id
notes
created_at
```

---

## 11. Propuesta técnica para la demo

Para la demo funcional:

```txt
Next.js
TypeScript
Tailwind CSS
shadcn/ui
localStorage
datos simulados
roles demo
Vercel
```

Objetivo:

- Navegación funcional.
- Cambios de estado.
- Formularios.
- Persistencia local.
- Datos coherentes.
- Flujo comercial demostrable.

No agregar complejidad innecesaria.

---

## 12. Propuesta técnica para versión real

Para una futura implementación real:

```txt
Frontend:
Next.js + TypeScript + Tailwind + shadcn/ui

Backend:
NestJS o API Routes/Route Handlers de Next.js

Base de datos:
PostgreSQL

ORM:
Prisma

Autenticación:
Auth.js / NextAuth

Deploy frontend:
Vercel

Base de datos:
Neon, Supabase o Railway

Storage:
Supabase Storage o S3 compatible

Logs:
activity_logs e inventory_movements
```

---

## 13. Regla de implementación por fases

No implementar toda la plataforma en un solo cambio.

Orden recomendado:

### Fase 0
Separación Portal Cliente / Centro de Operaciones.

### Fase 1
Portal Cliente.

### Fase 2
Leads y asignación.

### Fase 3
Clientes, cotizaciones y expedientes.

### Fase 4
Créditos.

### Fase 5
Inventario por sucursal y trazabilidad de unidades.

### Fase 6
Traslados.

### Fase 7
Ventas.

### Fase 8
Vendedores y dashboards.

### Fase 9
Reportes y configuración.

Cada fase debe respetar:

- No rediseñar módulos existentes.
- No romper navegación.
- No cambiar reglas aprobadas.
- Ejecutar build.
- Corregir errores.
- Resumir archivos modificados.

---

## 14. Extension contable demo

El Parche 2.19 agrega una zona contable interna bajo `/panel/contabilidad`.
Esta zona pertenece al Centro de Operaciones, pero queda separada del flujo
comercial diario.

Rutas:

```txt
/panel/contabilidad
/panel/contabilidad/diarios
/panel/contabilidad/comprobantes
/panel/contabilidad/documentos
/panel/contabilidad/gastos
/panel/contabilidad/inventario
/panel/contabilidad/planilla
/panel/contabilidad/reportes
```

Responsabilidades:

- Dashboard contable.
- Diarios contables.
- Comprobantes de ingreso, egreso, cheque, transferencia, reembolso y ajuste.
- Gastos.
- Documentos contables base.
- Inventario contable con costos.
- Planilla salarial basica.
- Reportes contables.

El rol Contador no debe operar leads, reservas, traslados, ventas, catalogo
publico ni Portal Cliente. El modulo conserva persistencia demo en
`localStorage` y no instala Prisma, backend ni base de datos real.

QA del Parche 2.19.1:

- `OperationsShell` bloquea al Contador fuera de `/panel/contabilidad`.
- La navegacion del Contador queda limitada al menu contable.
- El Vendedor no recibe navegacion contable y la ruta contable responde con
  acceso restringido.
- El Gerente conserva sus rutas comerciales y solo usa contabilidad para
  inventario/reportes de su sucursal.
- Los registros contables globales sin sucursal quedan reservados para
  Contador y Administrador.

### Documentos contables base

El Parche 2.20 mantiene la implementacion dentro del modulo contable existente,
principalmente en:

```txt
src/data/operations/accounting.ts
src/features/operations/services/accounting-service.ts
src/features/operations/modules/accounting/accounting-panel.tsx
```

La ruta `/panel/contabilidad/documentos` administra estructura y preview de
Factura, Nota de Debito, Nota de Credito y Recibo Oficial de Caja. La
descripcion de factura de motocicleta se genera con un helper fijo para
conservar el orden MARCA, MODELO, CHASIS, MOTOR, COLOR, AÑO, CASCO, PÓLIZA y
CILINDRAJE.

El Parche 2.21 agrega el rol Cajero y un area separada bajo `/panel/caja`.
Caja emite documentos operativos demo y Contabilidad revisa, contabiliza y
concilia los registros sincronizados. No se generan PDFs, no se instala una
libreria de impresion, no se conecta DGI y no se implementa numeracion fiscal
oficial.

Rutas de Caja:

```txt
/panel/caja
/panel/caja/facturacion
/panel/caja/recibos
/panel/caja/notas
/panel/caja/cierres
```

Persistencias demo:

```txt
motomas-cashier-invoices-v1
motomas-cashier-receipts-v1
motomas-cashier-notes-v1
motomas-cashier-closures-v1
```

Los documentos emitidos por Caja pueden sincronizarse hacia
`motomas-accounting-documents-v1` para revision contable interna. El Cajero no
participa en leads, reservas, traslados, ventas comerciales, catalogo publico,
Prisma ni Portal Cliente.

QA del Parche 2.21.1:

- `OperationsShell` bloquea al Cajero fuera de `/panel/caja`.
- La navegacion del Cajero queda limitada al menu de Caja.
- El acceso principal del shell respeta la ruta inicial de cada rol para evitar
  enviar al Cajero o Contador a rutas comerciales restringidas.
- Los documentos emitidos por Caja se sincronizan a documentos contables con
  datos de tercero, sucursal, montos, retenciones, abono, total y trazabilidad
  de origen.
- Contabilidad puede marcar documentos como revisados o contabilizados; Caja no
  puede ejecutar acciones contables ni ver costos.

El Parche 2.22 no agrega rutas nuevas. Consolida el flujo en las rutas
existentes:

```txt
/panel/contabilidad/documentos
/panel/contabilidad/comprobantes
/panel/contabilidad/reportes
/panel/caja/cierres
```

Los documentos contables mantienen trazabilidad de creación, revisión,
contabilización, conciliación y anulación interna. Caja sigue emitiendo; el
Contador y Administrador ejecutan las acciones contables. Los cierres de caja
pueden cerrarse desde Caja y revisarse desde reportes contables.

### Contabilidad avanzada demo

El Parche 2.23 amplia el area contable sin cambiar la arquitectura de
persistencia local. Se agregan subrutas dentro de `/panel/contabilidad` para:

```txt
/panel/contabilidad/catalogo-cuentas
/panel/contabilidad/bancos
/panel/contabilidad/conciliacion
/panel/contabilidad/cierres
/panel/contabilidad/terceros
```

Estas vistas complementan diarios, comprobantes, documentos, gastos,
inventario, planilla y reportes. Mantienen la separacion Caja emite /
Contabilidad revisa y no implementan Prisma, bancos reales, DGI, PDF ni
automatizacion fiscal.

## 15. Patch 3.0 - Fundacion de produccion (base de datos, auth, servidor)

El Parche 3.0 introduce una capa de servidor real junto al codigo de UI
existente. Prisma (`prisma` y `@prisma/client`) queda instalado y
`prisma/schema.prisma` es el esquema de produccion para las entidades de este
parche: `Branch`, `User` (con `password_hash` y enum de rol), catalogo y unidades
de motocicleta, movimientos de inventario y `UserAuditLog`.

Estructura del servidor:

```txt
prisma/
  schema.prisma        # esquema de produccion PostgreSQL
  seed.mjs             # seed idempotente (sucursales, usuarios, unidades)

src/
  middleware.ts        # protege /panel/* (verificacion de cookie firmada, Edge)
  server/
    db/
      prisma.ts        # PrismaClient perezoso + isDatabaseConfigured
    auth/
      access.ts        # predicados de autorizacion puros (server + client)
      actions.ts       # loginAction / logoutAction (server actions)
      context.ts       # getCurrentUserSession / requireAuth / requireRole
      dev-users.ts     # cuentas de desarrollo (fallback sin base de datos)
      password.ts      # hashing scrypt (Node crypto)
      roles.ts         # mapeo rol/sucursal DB <-> sesion interna
      session.ts       # firma/verificacion de sesion (HMAC Web Crypto)
      user-store.ts    # authenticate / listUsers / createUser (DB o fallback)
    inventory/
      actions.ts       # registerIngress / registerEgress (server actions)
      queries.ts       # lectura de unidades y movimientos por alcance
      shared.ts        # tipos y catalogos client-safe
    users/
      actions.ts       # createUserAction (server action)
```

Rutas nuevas/afectadas:

```txt
/login                              # inicio de sesion real (publico)
/panel                              # redirige segun rol (requiere sesion)
/panel/configuracion                # gestion de usuarios (Admin y Gerente)
/panel/inventario/movimientos       # altas y bajas reales (Admin y Gerente)
```

Reglas de arquitectura respetadas: el codigo de servidor (`src/server/*`) no se
importa desde componentes de cliente salvo modulos puros (`access.ts`,
`roles.ts`, `inventory/shared.ts`) y las server actions (que Next expone como
RPC). `@prisma/client` queda en `serverExternalPackages` (next.config) y el
`PrismaClient` solo se construye cuando `DATABASE_URL` esta presente, de modo que
el build y el modo demo no abren conexiones. Las migraciones y el seed requieren
una instancia PostgreSQL y se ejecutan con `npm run prisma:migrate` y
`npm run prisma:seed`.
