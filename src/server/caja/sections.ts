import type { CajaDocumentsSection } from "@/features/operations/modules/caja-db/caja-documents-db-panel";
import {
  getCajaPageContext,
  listCashDocumentsForTypes,
  type CajaPageContext,
} from "@/server/caja/context";
import { getCashDocumentDetail, listCashSessions } from "@/server/caja/queries";
import type {
  CashDocumentDetailDTO,
  CashDocumentDTO,
  CashDocumentTypeValue,
  CashSessionDTO,
} from "@/server/caja/shared";

/**
 * Shared server loader for the three Caja document routes. The `documento`
 * search param is never trusted: `getCashDocumentDetail` re-applies the reader's
 * scope, and a document outside this section's types is dropped as well.
 */

const sectionTypes: Record<CajaDocumentsSection, CashDocumentTypeValue[]> = {
  facturacion: ["FACTURA"],
  recibos: ["RECIBO"],
  notas: ["NOTA_DEBITO", "NOTA_CREDITO"],
};

export async function loadCajaDocumentsSection(
  section: CajaDocumentsSection,
  searchParams?: Promise<{ documento?: string | string[] }>,
): Promise<{
  caja: CajaPageContext;
  detail: CashDocumentDetailDTO | null;
  documents: CashDocumentDTO[];
  /** Open turnos in scope: a document is writable only while its turno is one. */
  sessions: CashSessionDTO[];
}> {
  const caja = await getCajaPageContext();
  if (!caja.enabled) {
    return { caja, detail: null, documents: [], sessions: [] };
  }

  const types = sectionTypes[section];
  const [documents, sessions] = await Promise.all([
    listCashDocumentsForTypes(caja.scope, types),
    listCashSessions(caja.scope, { status: "ABIERTO" }),
  ]);

  const params = await searchParams;
  const raw = params?.documento;
  const selectedId = Array.isArray(raw) ? raw[0] : raw;

  const detail = selectedId
    ? await getCashDocumentDetail(caja.scope, selectedId)
    : null;

  return {
    caja,
    detail: detail && types.includes(detail.type) ? detail : null,
    documents,
    sessions,
  };
}
