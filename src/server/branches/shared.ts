/**
 * Patch CRM-INT1 — sucursales, tipos puros y reglas compartidas.
 *
 * Sin base de datos aquí: el formulario de administración valida lo mismo que
 * el servidor antes de enviar, y el servidor vuelve a validarlo todo.
 */

/** Una sucursal tal y como la ofrece un selector. */
export type BranchOptionDTO = { code: string; name: string };

/** Una sucursal en la pantalla de administración, con lo que cuelga de ella. */
export type BranchAdminDTO = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  activeUsers: number;
  customers: number;
  availableUnits: number;
  createdAt: string;
};

/**
 * El código se deriva del nombre con **la misma regla que usa el seed**
 * (`branchCodeFromName` en `prisma/seed.mjs`): minúsculas, sin acentos,
 * espacios a guiones. Así una sucursal creada desde la pantalla y una sembrada
 * no pueden acabar con dos convenciones de código distintas.
 *
 * El código es inmutable: viaja en la sesión firmada, en filtros de URL y en
 * el espejo de `localStorage`. Renombrar la sucursal cambia su nombre, nunca su
 * código.
 */
export function branchCodeFromName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export const BRANCH_NAME_MAX = 80;
