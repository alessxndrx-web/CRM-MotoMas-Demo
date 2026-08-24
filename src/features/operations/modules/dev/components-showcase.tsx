"use client";

import { Ban, Package, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailList } from "@/components/ui/detail-list";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyInput, Textarea } from "@/components/ui/fields";
import {
  Notice,
  SkeletonBlock,
  SkeletonCards,
  SkeletonForm,
} from "@/components/ui/feedback";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge, defineStatuses, isInactiveStatus } from "@/components/ui/status";
import { BulkActionBar, FilterBar } from "@/components/ui/toolbar";

/**
 * Showcase de POS2.0-C.
 *
 * **No es un módulo de negocio.** No lee la base de datos, no llama a ninguna
 * acción de servidor y no aparece en la navegación comercial. Existe para dos
 * cosas: ver los componentes juntos —que es la única forma de notar que dos de
 * ellos no combinan— y darle a la suite de navegador algo real que manipular.
 *
 * Los datos son inventados y viven en este archivo. Cualquier parecido con una
 * entidad del dominio es deliberadamente superficial: si el showcase importara
 * tipos del negocio, la biblioteca acabaría acoplada a ellos por la puerta de
 * atrás.
 */

/* ---------------------------------------------------------------------------
 * Datos de mentira
 * ------------------------------------------------------------------------ */

type DemoRow = {
  id: string;
  code: string;
  name: string;
  group: string;
  status: "activo" | "revision" | "listo" | "retirado";
  quantity: number;
  amount: number;
};

/**
 * El diccionario de estados vive **en el módulo**, no en el sistema de diseño.
 * Así es como POS2.1 y POS2.2 declararán los suyos.
 */
const demoStatus = defineStatuses({
  activo: { label: "Activo", tone: "progress", hint: "En circulación" },
  revision: { label: "En revisión", tone: "warning", hint: "Esperando aprobación" },
  listo: { label: "Listo", tone: "success" },
  retirado: { label: "Retirado", tone: "danger", hint: "Ya no participa" },
});

const rows: DemoRow[] = [
  { id: "1", code: "ART-001", name: "Filtro de aceite", group: "Motor", status: "activo", quantity: 120, amount: 145.5 },
  { id: "2", code: "ART-002", name: "Aceite 20W50", group: "Lubricantes", status: "listo", quantity: 55.5, amount: 78.25 },
  { id: "3", code: "ART-003", name: "Casco integral", group: "Accesorios", status: "revision", quantity: 8, amount: 2450 },
  { id: "4", code: "ART-004", name: "Bujía NGK", group: "Motor", status: "activo", quantity: 340, amount: 60 },
  { id: "5", code: "ART-005", name: "Cadena de transmisión", group: "Transmisión", status: "retirado", quantity: 0, amount: 890.75 },
  { id: "6", code: "ART-006", name: "Llanta trasera", group: "Rodaje", status: "activo", quantity: 24, amount: 3100 },
];

const money = (value: number) =>
  new Intl.NumberFormat("es-NI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const groups = [...new Set(rows.map((row) => row.group))];

/* ---------------------------------------------------------------------------
 * Secciones
 * ------------------------------------------------------------------------ */

function Section({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <section aria-labelledby={`${id}-titulo`} className="space-y-3" id={id}>
      <div>
        <h2 className="text-base font-semibold text-slate-900" id={`${id}-titulo`}>
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function ComponentsShowcase() {
  const [search, setSearch] = React.useState("");
  const [group, setGroup] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [detail, setDetail] = React.useState<DemoRow | null>(null);
  const [log, setLog] = React.useState<string | null>(null);

  // Formulario de demostración: valida en el cliente, no envía nada a ninguna
  // parte. El objetivo es el estado de error, no el guardado.
  const [name, setName] = React.useState("");
  const [cost, setCost] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  const nameError = submitted && !name.trim() ? "Escribe un nombre." : null;
  const costError =
    submitted && !(Number(cost.replace(",", ".")) > 0)
      ? "El costo debe ser mayor que cero."
      : null;

  const filtered = React.useMemo(
    () =>
      rows.filter((row) => {
        const term = search.trim().toLowerCase();
        if (term && !`${row.code} ${row.name}`.toLowerCase().includes(term)) return false;
        if (group && row.group !== group) return false;
        if (status && row.status !== status) return false;
        return true;
      }),
    [search, group, status],
  );

  const activeFilters = [search.trim(), group, status].filter(Boolean).length;

  const columns: Array<DataTableColumn<DemoRow>> = [
    {
      id: "code",
      header: "Código",
      cell: (row) => <span className="font-mono text-xs text-slate-600">{row.code}</span>,
      width: "7rem",
    },
    {
      id: "name",
      header: "Artículo",
      cell: (row) => <span className="font-medium text-slate-800">{row.name}</span>,
    },
    {
      id: "group",
      header: "Grupo",
      cell: (row) => row.group,
      hideOnMobile: true,
    },
    {
      id: "status",
      header: "Estado",
      cell: (row) => <StatusBadge map={demoStatus} value={row.status} />,
      width: "9rem",
    },
    {
      id: "quantity",
      header: "Existencia",
      cell: (row) => row.quantity.toLocaleString("es-NI"),
      numeric: true,
      hideOnMobile: true,
    },
    {
      id: "amount",
      header: "Costo",
      cell: (row) => money(row.amount),
      numeric: true,
    },
  ];

  function clearFilters() {
    setSearch("");
    setGroup("");
    setStatus("");
  }

  return (
    <div className="space-y-10">
      <Notice title="Página de demostración" tone="info">
        Componentes de POS2.0-C. No hay datos reales, no se llama a ninguna acción de
        servidor y esta ruta no forma parte de la navegación comercial.
      </Notice>

      {log ? (
        <Notice onDismiss={() => setLog(null)} tone="success">
          <span data-testid="registro-accion">{log}</span>
        </Notice>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <Section
        description="Filtros, selección masiva, estados, filas clicables, carga y vacíos."
        id="tabla"
        title="Tabla de datos"
      >
        <Card className="overflow-hidden p-0">
          {selected.size > 0 ? (
            <BulkActionBar
              count={selected.size}
              noun={selected.size === 1 ? "fila seleccionada" : "filas seleccionadas"}
              onClear={() => setSelected(new Set())}
            >
              <Button
                data-testid="masiva-exportar"
                onClick={() => setLog(`Exportadas ${selected.size} filas.`)}
                size="sm"
                variant="secondary"
              >
                Exportar
              </Button>
              <ConfirmAction
                confirmLabel="Retirar filas"
                data-testid="masiva-retirar"
                description="Las filas seguirán existiendo, pero dejarán de participar. La demostración no cambia ningún dato."
                icon={<Trash2 aria-hidden className="h-4 w-4" />}
                label="Retirar"
                onConfirm={() => {
                  setLog(`Retiradas ${selected.size} filas.`);
                  setSelected(new Set());
                }}
                title={`Retirar ${selected.size} filas`}
              />
            </BulkActionBar>
          ) : (
            <FilterBar
              actions={
                <>
                  <Button
                    data-testid="alternar-carga"
                    onClick={() => setLoading((value) => !value)}
                    size="sm"
                    variant="secondary"
                  >
                    {loading ? "Mostrar datos" : "Simular carga"}
                  </Button>
                  <Button size="sm">
                    <Plus aria-hidden className="h-4 w-4" />
                    Nuevo
                  </Button>
                </>
              }
              activeCount={activeFilters}
              filters={
                <>
                  <Select
                    aria-label="Grupo"
                    className="w-40"
                    data-testid="filtro-grupo"
                    onChange={(event) => setGroup(event.target.value)}
                    value={group}
                  >
                    <option value="">Todos los grupos</option>
                    {groups.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </Select>
                  <Select
                    aria-label="Estado"
                    className="w-40"
                    data-testid="filtro-estado"
                    onChange={(event) => setStatus(event.target.value)}
                    value={status}
                  >
                    <option value="">Todos los estados</option>
                    {Object.entries(demoStatus).map(([key, definition]) => (
                      <option key={key} value={key}>
                        {definition.label}
                      </option>
                    ))}
                  </Select>
                </>
              }
              onClear={clearFilters}
              onSearchChange={setSearch}
              search={search}
              searchPlaceholder="Buscar por código o nombre…"
            />
          )}

          <DataTable
            caption="Artículos de demostración"
            columns={columns}
            emptyMessage={
              activeFilters > 0
                ? "Ningún artículo coincide con los filtros. Prueba a quitar alguno."
                : "Todavía no hay artículos."
            }
            isRowMuted={(row) => isInactiveStatus(demoStatus, row.status)}
            isRowSelectable={(row) => row.status !== "retirado"}
            loading={loading}
            onRowClick={setDetail}
            onSelectionChange={setSelected}
            rowKey={(row) => row.id}
            rows={filtered}
            selectedKeys={selected}
          />
        </Card>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        description="Dos vacíos distintos, porque dicen dos cosas distintas al usuario."
        id="vacios"
        title="Estados vacíos"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState
            action={
              <Button size="sm">
                <Plus aria-hidden className="h-4 w-4" />
                Crear el primero
              </Button>
            }
            description="Cuando registres artículos aparecerán en esta lista."
            icon={Package}
            title="Sin artículos todavía"
          />
          <EmptyState
            action={
              <Button onClick={clearFilters} size="sm" variant="secondary">
                Quitar filtros
              </Button>
            }
            description="Hay artículos, pero ninguno coincide con lo que buscas."
            title="Sin resultados"
            variant="no-results"
          />
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        description="Cada esqueleto imita la geometría de lo que va a llegar."
        id="carga"
        title="Carga"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tarjetas
            </p>
            <SkeletonCards count={2} />
          </Card>
          <Card className="p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Formulario y bloque
            </p>
            <SkeletonForm columns={1} fields={2} />
            <SkeletonBlock className="mt-4" />
          </Card>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        description="Rótulo, pista, obligatoriedad y error, asociados al control de verdad."
        id="formulario"
        title="Formulario"
      >
        <Card className="p-5">
          <form
            className="grid gap-4 sm:grid-cols-2"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
            }}
          >
            <FormField error={nameError} label="Nombre del artículo" required>
              {(field) => (
                <Input
                  {...field}
                  data-testid="campo-nombre"
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                />
              )}
            </FormField>

            <FormField
              error={costError}
              hint="Sin impuestos."
              label="Costo unitario"
              required
            >
              {(field) => (
                <MoneyInput
                  {...field}
                  data-testid="campo-costo"
                  onChange={(event) => setCost(event.target.value)}
                  value={cost}
                />
              )}
            </FormField>

            <FormField
              className="sm:col-span-2"
              hint="Opcional. Solo para esta demostración."
              label="Notas"
            >
              {(field) => (
                <Textarea
                  {...field}
                  onChange={(event) => setNotes(event.target.value)}
                  value={notes}
                />
              )}
            </FormField>

            <div className="sm:col-span-2">
              <Button data-testid="formulario-enviar" size="sm" type="submit">
                Validar
              </Button>
            </div>
          </form>
        </Card>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        description="Primaria, secundaria, en fila, peligrosa y peligrosa con confirmación."
        id="acciones"
        title="Jerarquía de acciones"
      >
        <Card className="flex flex-wrap items-center gap-2 p-5">
          <Button size="sm">Acción primaria</Button>
          <Button size="sm" variant="secondary">
            Secundaria
          </Button>
          <Button size="sm" variant="ghost">
            En fila
          </Button>
          <Button size="sm" variant="danger">
            Peligrosa
          </Button>
          <ConfirmAction
            confirmLabel="Anular documento"
            data-testid="accion-anular"
            description="Esta acción no se puede deshacer. En la demostración no cambia ningún dato."
            icon={<Ban aria-hidden className="h-4 w-4" />}
            label="Anular"
            onConfirm={() => setLog("Documento anulado.")}
            title="Anular el documento DEMO-0031"
          >
            <p className="text-sm text-slate-600">
              El documento seguirá visible y quedará marcado como anulado.
            </p>
          </ConfirmAction>
        </Card>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Drawer
        description={detail?.code}
        footer={
          <Button onClick={() => setDetail(null)} size="sm" variant="secondary">
            Cerrar
          </Button>
        }
        onClose={() => setDetail(null)}
        open={detail !== null}
        title={detail?.name ?? "Detalle"}
      >
        {detail ? (
          <DetailList
            columns={1}
            items={[
              { label: "Código", value: detail.code },
              {
                label: "Estado",
                value: <StatusBadge map={demoStatus} value={detail.status} />,
              },
              { label: "Grupo", value: detail.group },
              { label: "Existencia", value: detail.quantity, numeric: true },
              { label: "Costo unitario", value: money(detail.amount), numeric: true },
              { label: "Notas", value: null, wide: true },
            ]}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
