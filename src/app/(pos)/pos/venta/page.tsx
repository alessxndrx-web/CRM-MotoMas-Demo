import { PosCartPanel } from "@/features/operations/modules/pos/pos-cart-panel";
import { PosTerminalHeader } from "@/features/pos/pos-terminal-header";
import { requirePosSession } from "@/server/pos/auth";
import {
  listPosCategories,
  listPosInventory,
  listPosSales,
  listPosWarehouses,
  searchPosProducts,
} from "@/server/pos/queries";

export const dynamic = "force-dynamic";

const RECENT_SALES = 10;

/**
 * Patch POS2.4 — el cobro, detrás de la sesión de POS.
 * Patch POS6.0-B — y con la disposición de un mostrador, no de un formulario.
 *
 * **Lo que cambió es la pantalla, no la transacción.** `PosCartPanel` conserva
 * el flujo de POS1.0-D, los totales derivados en el servidor y el descuento de
 * existencias; lo que se rehízo es dónde vive cada cosa: el buscador ocupa la
 * pantalla, el carrito pasó a un cajón de dos pasos y el cobro dejó de ser un
 * botón pequeño abajo a la derecha.
 *
 * Dos diferencias frente a `/panel/pos/venta`:
 *
 * - **`requirePosSession`**, no `requireAuth` + `canOperateCaja`. Sin sesión de
 *   mostrador se redirige a `/pos/login` antes de consultar nada.
 * - **La sucursal no se elige.** El operador tiene la suya y el servidor la
 *   impone; un mostrador no decide en qué sucursal registra la venta.
 */
export default async function PosVentaPage() {
  const session = await requirePosSession();

  const [recentSales, warehouses, categories] = await Promise.all([
    listPosSales({ branchCode: session.branchCode }),
    listPosWarehouses({ branchCode: session.branchCode }),
    // Patch POS7.0-A — el catálogo es global; las categorías no se acotan por
    // sucursal porque no pertenecen a ninguna. Lo que sí es de la sucursal es el
    // saldo, y ese lo trae la búsqueda con la bodega.
    listPosCategories(),
  ]);

  // Patch POS7.0-A — el catálogo con el que abre el mostrador, resuelto aquí.
  // La bodega por omisión es la primera de la sucursal, la misma que elige el
  // panel; `listPosInventory` vuelve a exigir que sea de esta sucursal.
  const catalogue = await searchPosProducts("", { includeInactive: false });
  const defaultWarehouse = warehouses[0]?.id;
  const catalogueRows = defaultWarehouse
    ? await listPosInventory({
        warehouseId: defaultWarehouse,
        branchCode: session.branchCode,
        productIds: catalogue.map((product) => product.id),
      })
    : [];

  return (
    <>
      <PosTerminalHeader
        branchName={session.branchName}
        username={session.username}
      />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {/*
          El contenido principal necesita su propio encabezado: la barra del
          terminal es `<header>` y no cuenta. Compacto a propósito — un terminal
          de mostrador no lleva la tarjeta de cabecera del panel.
        */}
        <h1 className="mb-4 text-lg font-semibold text-slate-900">Punto de venta</h1>
        <PosCartPanel
          branchCode={session.branchCode}
          branches={[]}
          categories={categories}
          initialCatalogue={catalogue}
          initialCatalogueBalances={Object.fromEntries(
            catalogueRows.map((row) => [row.productId, row.quantity]),
          )}
          canOperate
          recentSales={recentSales.slice(0, RECENT_SALES)}
          warehouses={warehouses}
        />
      </main>
    </>
  );
}
