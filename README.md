# MotoMas CRM Demo

Demo funcional de la Plataforma Integral de Gestion Comercial Multi-Sucursal
MotoMas, construida con Next.js, TypeScript, Tailwind CSS y componentes estilo
shadcn/ui.

## Modulos incluidos

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

Abre `http://localhost:3000`.

## Validacion

```bash
npm run lint
npm run build
```

La demo usa datos simulados y persiste los cambios en `localStorage`.
