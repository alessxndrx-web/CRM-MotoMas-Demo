# MotoMas ERP + CRM Multi-Sucursal

Plataforma Integral de Gestion Comercial Multi-Sucursal MotoMas, construida con
Next.js, TypeScript, Tailwind CSS y componentes estilo shadcn/ui, sobre
PostgreSQL con Prisma y autenticacion real.

> **Nota de estado (actualizada en el Parche FF1.0).** El texto original de este
> README describia una demo con datos simulados en `localStorage`. Eso dejo de
> ser exacto a partir del Parche 3.0: hoy la aplicacion usa PostgreSQL, Prisma,
> sesiones firmadas y autorizacion en servidor. Los paneles heredados de
> `localStorage` siguen en el repositorio pero permanecen ocultos cuando hay
> base de datos disponible. Ver [ARCHITECTURE.md](ARCHITECTURE.md) §15 y
> [DATABASE_PLAN.md](DATABASE_PLAN.md).

## Modulos incluidos

> Lista historica del alcance inicial. El sistema incluye ademas Caja,
> Contabilidad, Marketing, Soporte Tecnico y auditoria financiera; los roles
> actuales son Administrador, Gerente, Vendedor, Cajero, Contador, Marketing y
> Soporte Tecnico. Ver [ROLES.md](ROLES.md).

- Login demo por rol: administrador, gerente y vendedor.
- Centro de Operaciones.
- Clientes y expediente comercial.
- Creditos.
- Inventario por sucursal para 12 sucursales.
- Ordenes de traslado con movimiento real de inventario en `localStorage`.
- Vendedores.
- Reportes con bloqueo para perfil vendedor.

## Ejecutar localmente

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` (puerto configurado en `package.json`).

Para trabajar con la base de datos real se requiere una instancia PostgreSQL
alcanzable y un `.env` derivado de `.env.example`:

```bash
npm run prisma:generate
npm run prisma:deploy     # aplica migraciones existentes
npm run prisma:seed       # sucursales y catalogo; Admin solo con variables MOTOMAS_ADMIN_*
npm run prisma:seed:cuentas  # opcional: plantilla de catalogo contable (239 cuentas)
```

`prisma:seed:cuentas` siembra un catalogo contable **de referencia**, no el de
MotoMas: las cuentas quedan marcadas como plantilla y sin aprobar, y no admiten
movimientos hasta que la contabilidad de la empresa las apruebe. Ver
[docs/CHART_OF_ACCOUNTS.md](docs/CHART_OF_ACCOUNTS.md).

Sin `DATABASE_URL` la aplicacion arranca en modo degradado: las secciones
respaldadas por base de datos quedan deshabilitadas.

## Validacion

```bash
npm run lint
npm run build
npx tsc --noEmit
npx prisma validate
npm run prisma:status
```

> El texto historico "la demo usa datos simulados y persiste los cambios en
> `localStorage`" quedo obsoleto en el Parche 3.0 y se conserva aqui solo como
> referencia. Ver [PRODUCTION_HARDENING_CHECKLIST.md](docs/PRODUCTION_HARDENING_CHECKLIST.md)
> para el despliegue y [FINANCIAL_FOUNDATION.md](docs/FINANCIAL_FOUNDATION.md)
> para la capa financiera base.
