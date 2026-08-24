import { PageHeader } from "@/components/ui/page-header";
import {
  PosProductsPanel,
  type PosCatalogueStatus,
} from "@/features/operations/modules/pos/pos-products-panel";
import { canOperateCaja } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { countPosProducts, searchPosProducts } from "@/server/pos/queries";

export const dynamic = "force-dynamic";

/**
 * Patch POS1.0-B — catálogo del punto de venta.
 *
 * ## Todo el estado de la lista vive en la URL
 *
 * Término, estado y página los resuelve el servidor. No se filtra en el
 * navegador: el mostrador debe poder teclear un código y encontrar el artículo
 * aunque no esté entre los que ya se cargaron, y una lista de trabajo tiene que
 * sobrevivir a una recarga y poderse enlazar.
 *
 * El catálogo inactivo se muestra por omisión, porque desactivar es la forma de
 * retirar un artículo y hay que poder volver a activarlo. El filtro de estado
 * existe para separarlos, no para esconder unos por defecto.
 *
 * ## Cabecera en la ruta, no en el panel
 *
 * `PageHeader` se compone aquí, igual que en `/pos/inventario`: el contexto —qué
 * es esta pantalla— lo pone la ruta y no cambia mientras se trabaja; el panel se
 * queda con los controles y los datos, que sí cambian.
 */
/**
 * Los tamaños de página viven aquí porque **aquí se valida la URL**. El panel los
 * recibe como prop en vez de exportarlos: un módulo `"use client"` no puede
 * prestarle un valor al servidor —Next lo sustituye por una referencia de
 * cliente— y el servidor acabaría llamando `.includes` sobre algo que no es un
 * array.
 */
const PAGE_SIZES = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

function readParam(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
}

/** Un parámetro de URL es texto de fuera: se acota, no se cree. */
function readStatus(raw: string | string[] | undefined): PosCatalogueStatus {
  const value = readParam(raw);
  return value === "activo" || value === "inactivo" ? value : "";
}

function readPageSize(raw: string | string[] | undefined): number {
  const value = Number(readParam(raw));
  return PAGE_SIZES.includes(value) ? value : DEFAULT_PAGE_SIZE;
}

export default async function PosProductsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string | string[];
    estado?: string | string[];
    pagina?: string | string[];
    tam?: string | string[];
  }>;
}) {
  const session = await requireAuth();
  const canOperate = canOperateCaja(session.roleEnum);

  const params = await searchParams;
  const term = readParam(params?.q);
  const status = readStatus(params?.estado);
  const pageSize = readPageSize(params?.tam);
  const requestedPage = Math.trunc(Number(readParam(params?.pagina)));
  const filters = {
    includeInactive: true,
    isActive: status === "" ? undefined : status === "activo",
  };

  // El total se lee antes de decidir la página: pedir la novena de ocho —al
  // recargar tras un filtro más estrecho, por ejemplo— debe devolver la última
  // que existe, no una lista vacía que parece un fallo.
  const total = await countPosProducts(term, filters);
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1), pageCount);

  const products = await searchPosProducts(term, {
    ...filters,
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return (
    <section className="space-y-6">
      <PageHeader
        description="Los artículos que el mostrador puede vender: qué son, cómo se cuentan y a qué precio salen. Las existencias no se editan aquí — viven en las bodegas."
        eyebrow="Catálogo"
        title="Productos"
      />
      <PosProductsPanel
        canOperate={canOperate}
        page={page}
        pageSize={pageSize}
        pageSizes={PAGE_SIZES}
        products={products}
        status={status}
        term={term}
        total={total}
      />
    </section>
  );
}
