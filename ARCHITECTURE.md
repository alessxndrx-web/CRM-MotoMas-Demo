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
