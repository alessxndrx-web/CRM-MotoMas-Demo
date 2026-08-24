"use client";

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { SkeletonTable } from "@/components/ui/feedback";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableEmptyRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — tabla de datos (Patch POS2.0-C).
 *
 * ## Qué añade sobre lo que ya había
 *
 * POS2.0-A dejó las celdas (`TH`, `TD`, `TR`…) y el marco (`DataTableShell`).
 * Con eso, cada pantalla seguía escribiendo el mismo bucle: recorrer columnas,
 * recorrer filas, decidir si toca esqueleto, decidir si toca fila vacía, y
 * cablear la selección a mano. Eso es lo que vive aquí.
 *
 * **No sustituye a las primitivas.** Una pantalla con una tabla irregular sigue
 * componiendo `Table` + `TR` + `TD` directamente, y así debe ser: forzar toda
 * tabla por esta puerta produciría el «SuperTable» de setecientas líneas que
 * este parche tiene prohibido escribir.
 *
 * ## Lo que deliberadamente NO hace
 *
 * Sin ordenación, sin paginación de servidor, sin columnas redimensionables,
 * sin agrupación. `Pagination` ya existe y se compone al lado. Añadir ordenación
 * aquí exigiría decidir si ordena el cliente o el servidor, y eso depende del
 * módulo — es decisión de POS2.1/POS2.2, no de la biblioteca (P-34).
 *
 * ## No sabe nada del negocio
 *
 * Sin Prisma, sin rutas, sin roles, sin entidades. Recibe filas de tipo `T` y
 * columnas que saben leerlas. Lo único que exige de `T` es una clave estable,
 * que aporta el llamador.
 */

export type DataTableColumn<T> = {
  /** Identidad de la columna. Debe ser única dentro de la tabla. */
  id: string;
  /** Encabezado. Corto: se lee una vez y luego debe desaparecer. */
  header: React.ReactNode;
  /** Cómo se dibuja la celda. */
  cell: (row: T) => React.ReactNode;
  /**
   * `numeric` alinea a la derecha **y** activa cifras tabulares. Las dos cosas
   * viajan siempre juntas: una columna alineada a la derecha con dígitos
   * proporcionales sigue sin cuadrar en la coma decimal.
   */
  numeric?: boolean;
  align?: "left" | "right" | "center";
  /** Ancho fijo cuando la columna lo pide, como una de acciones o un estado. */
  width?: string;
  /**
   * Oculta la columna por debajo de 768px. **No convierte la tabla en tarjetas**:
   * un POS trabaja con mucha información y el formato tarjeta la destruye. Se
   * esconde lo accesorio y el resto se desplaza dentro de su propio contenedor.
   */
  hideOnMobile?: boolean;
};

export type DataTableProps<T> = {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  /** Clave estable por fila. Sin ella React no puede conservar la selección. */
  rowKey: (row: T) => string;

  /** Cargando: se dibuja un esqueleto con la geometría real de la tabla. */
  loading?: boolean;
  /** Qué mostrar cuando no hay filas. Distinto de «nunca hubo datos». */
  emptyMessage?: React.ReactNode;

  /** Abre la fila. Si se define, la fila es interactiva y alcanzable con teclado. */
  onRowClick?: (row: T) => void;
  /** Atenúa filas que existen pero ya no actúan. Nunca las oculta. */
  isRowMuted?: (row: T) => boolean;

  /** Selección. Se activa solo si se pasan las tres piezas. */
  selectedKeys?: ReadonlySet<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  /** Filas que no se pueden seleccionar, con su motivo para el `title`. */
  isRowSelectable?: (row: T) => boolean;

  /** Rótulo accesible de la tabla. */
  caption?: string;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyMessage,
  onRowClick,
  isRowMuted,
  selectedKeys,
  onSelectionChange,
  isRowSelectable,
  caption,
  className,
}: DataTableProps<T>) {
  const selectable = Boolean(selectedKeys && onSelectionChange);
  const columnCount = columns.length + (selectable ? 1 : 0);

  const selectableRows = React.useMemo(
    () => (isRowSelectable ? rows.filter(isRowSelectable) : rows),
    [rows, isRowSelectable],
  );
  const selectableKeys = React.useMemo(
    () => selectableRows.map(rowKey),
    [selectableRows, rowKey],
  );

  const selectedCount = selectableKeys.filter((key) => selectedKeys?.has(key)).length;
  const allSelected = selectableKeys.length > 0 && selectedCount === selectableKeys.length;
  const someSelected = selectedCount > 0 && !allSelected;

  function toggleAll() {
    if (!onSelectionChange) return;
    // **Alternar afecta solo a lo seleccionable y visible.** Vaciar una selección
    // que incluye filas de otra página sería borrar trabajo que el usuario no
    // tiene delante.
    const next = new Set(selectedKeys);
    if (allSelected) {
      for (const key of selectableKeys) next.delete(key);
    } else {
      for (const key of selectableKeys) next.add(key);
    }
    onSelectionChange(next);
  }

  function toggleRow(key: string) {
    if (!onSelectionChange) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectionChange(next);
  }

  return (
    <DataTableShell className={className}>
      {loading ? (
        <div data-testid="tabla-cargando">
          <SkeletonTable columns={Math.min(columnCount, 6)} rows={6} />
        </div>
      ) : (
        <Table>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <THead>
            <tr>
              {selectable ? (
                <TH align="center" className="w-10">
                  <Checkbox
                    aria-label={
                      allSelected ? "Quitar la selección de todo" : "Seleccionar todo"
                    }
                    checked={allSelected}
                    data-testid="tabla-seleccionar-todo"
                    disabled={selectableKeys.length === 0}
                    indeterminate={someSelected}
                    onChange={toggleAll}
                  />
                </TH>
              ) : null}
              {columns.map((column) => (
                <TH
                  align={column.align ?? (column.numeric ? "right" : "left")}
                  className={cn(
                    column.hideOnMobile && "hidden md:table-cell",
                  )}
                  key={column.id}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.header}
                </TH>
              ))}
            </tr>
          </THead>

          <TBody>
            {rows.length === 0 ? (
              <TableEmptyRow colSpan={columnCount}>{emptyMessage}</TableEmptyRow>
            ) : (
              rows.map((row) => {
                const key = rowKey(row);
                const selected = Boolean(selectedKeys?.has(key));
                const canSelect = isRowSelectable ? isRowSelectable(row) : true;

                return (
                  <TR
                    aria-selected={selectable ? selected : undefined}
                    className={cn(selected && "bg-blue-50/70 hover:bg-blue-50")}
                    data-testid="tabla-fila"
                    interactive={Boolean(onRowClick)}
                    key={key}
                    muted={isRowMuted?.(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    /*
                     * Una fila que se abre con el ratón debe abrirse con el
                     * teclado. Se le da parada de tabulación y las dos teclas que
                     * el usuario espera; sin esto, la tabla entera queda fuera del
                     * alcance de quien no usa ratón.
                     */
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            if (event.target !== event.currentTarget) return;
                            event.preventDefault();
                            onRowClick(row);
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                  >
                    {selectable ? (
                      <TD
                        align="center"
                        /*
                         * La casilla no debe abrir la fila: son dos intenciones
                         * distintas sobre el mismo píxel.
                         */
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          aria-label={`Seleccionar fila ${key}`}
                          checked={selected}
                          data-testid="tabla-seleccionar-fila"
                          disabled={!canSelect}
                          onChange={() => toggleRow(key)}
                        />
                      </TD>
                    ) : null}
                    {columns.map((column) => (
                      <TD
                        align={column.align}
                        className={cn(column.hideOnMobile && "hidden md:table-cell")}
                        key={column.id}
                        numeric={column.numeric}
                      >
                        {column.cell(row)}
                      </TD>
                    ))}
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      )}
    </DataTableShell>
  );
}
