"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Database, MessageCircle, UserPlus, Users } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListPagination } from "@/features/operations/components/list-pagination";
import { ListSearchBar } from "@/features/operations/components/list-search-bar";
import { Notice } from "@/components/ui/feedback";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import { WhatsAppConversationDrawer } from "@/features/operations/modules/whatsapp/whatsapp-conversation-drawer";
import { assignCustomerAction, createCustomerAction } from "@/server/crm/actions";
import type { CustomerDTO } from "@/server/crm/shared";
import type { WhatsAppConversationDTO } from "@/server/whatsapp/shared";

/**
 * Database-backed customers section for `/panel/clientes`.
 *
 * Patch CRM-QA1 — **la asignación de cartera y el alta, que no existían.**
 *
 * La QA reportó «no hay opción de asignar clientes». No era una pantalla
 * escondida: `Customer` no tenía a quién estar asignado. La columna
 * `assigned_seller_id` y sus dos campos de auditoría nacen en este parche, y el
 * desplegable de abajo es lo que las escribe.
 *
 * `createCustomerAction` sí existía —completa, validada y con deduplicación por
 * teléfono y cédula— **sin un solo llamador desde 3.1B**. Aquí tiene el suyo.
 *
 * ## Reasignar no reescribe la historia
 *
 * Cambiar el vendedor de un cliente no toca ni uno de sus leads, expedientes,
 * reservas o ventas: cada uno conserva el vendedor que tuvo cuando ocurrió. Lo
 * que cambia es quién lo atiende a partir de ahora.
 */

export type CustomerSellerOption = {
  id: string;
  name: string;
  branchCode: string | null;
};

export function CustomersDbPanel({
  branches,
  canAssign,
  conversations,
  customers,
  dbConfigured,
  page,
  pageSize,
  total,
  scopeLabel,
  sellers,
}: {
  /** Vacío salvo para un rol global: los demás heredan su sucursal. */
  branches: Array<{ code: string; name: string }>;
  canAssign: boolean;
  /** Hilos de WhatsApp por teléfono, ya cargados por el servidor. */
  conversations: Record<string, WhatsAppConversationDTO>;
  customers: CustomerDTO[];
  dbConfigured: boolean;
  /** Patch CRM-AUD2 — paginación de servidor. */
  page: number;
  pageSize: number;
  total: number;
  scopeLabel: string;
  sellers: CustomerSellerOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [chatCustomer, setChatCustomer] = useState<CustomerDTO | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cedula, setCedula] = useState("");
  const [correo, setCorreo] = useState("");
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");

  function assign(customerId: string, sellerId: string) {
    setError("");
    setMessage("");
    setPendingId(customerId);
    startTransition(async () => {
      const result = await assignCustomerAction({ customerId, sellerId });
      if (!result.ok) setError(result.error);
      setPendingId(null);
      router.refresh();
    });
  }

  function submitCreate() {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await createCustomerAction({
        nombre,
        telefono,
        cedula: cedula || null,
        correo: correo || null,
        // Un rol de sucursal no elige: el servidor rechaza cualquier otra.
        branchCode: branches.length ? branchCode : (customers[0]?.branchCode ?? ""),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(
        result.deduped
          ? "Ese contacto ya existía: se reutilizó el cliente registrado."
          : "Cliente registrado.",
      );
      setNombre("");
      setTelefono("");
      setCedula("");
      setCorreo("");
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PrimarySectionBadge
            businessLabel="Clientes · Historial comercial"
            technicalLabel="Clientes · Base de datos (fuente principal)"
          />
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
            {scopeLabel}
          </span>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Database className="h-5 w-5" />
        </div>
      </div>

      <PrimarySectionDescription
        businessText="Tu cartera de clientes. Quien supervisa puede repartirla entre el equipo; reasignar no altera las ventas ni los expedientes ya registrados."
        technicalText="Clientes respaldados por PostgreSQL, con vendedor asignado y su
        rastro de auditoría. La reasignación escribe sólo el puntero de cartera."
      />

      {!dbConfigured ? (
        <SectionUnavailableNotice
          businessText="Esta sección aún no está disponible."
          technicalText={
            <>
              Esta sección requiere <code>DATABASE_URL</code> configurado.
            </>
          }
        />
      ) : (
        <>
          <div className="mt-5">
            {showForm ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <FormSection
                  description="Si el teléfono o la cédula ya existen, se reutiliza el cliente registrado en lugar de duplicarlo."
                  title="Registrar cliente"
                >
                  <Field label="Nombre" required>
                    <Input
                      onChange={(event) => setNombre(event.target.value)}
                      value={nombre}
                    />
                  </Field>
                  <Field hint="Al menos 8 dígitos" label="Teléfono" required>
                    <Input
                      inputMode="tel"
                      onChange={(event) => setTelefono(event.target.value)}
                      value={telefono}
                    />
                  </Field>
                  <Field label="Cédula">
                    <Input
                      onChange={(event) => setCedula(event.target.value)}
                      value={cedula}
                    />
                  </Field>
                  <Field label="Correo">
                    <Input
                      onChange={(event) => setCorreo(event.target.value)}
                      type="email"
                      value={correo}
                    />
                  </Field>
                  {branches.length ? (
                    <Field label="Sucursal" required>
                      <Select
                        onChange={(event) => setBranchCode(event.target.value)}
                        value={branchCode}
                      >
                        {branches.map((branch) => (
                          <option key={branch.code} value={branch.code}>
                            {branch.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
                </FormSection>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    disabled={pending || !nombre.trim() || !telefono.trim()}
                    onClick={submitCreate}
                  >
                    Guardar cliente
                  </Button>
                  <Button onClick={() => setShowForm(false)} variant="secondary">
                    Cerrar
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={() => setShowForm(true)} size="sm">
                <UserPlus aria-hidden className="h-4 w-4" />
                Registrar cliente
              </Button>
            )}
          </div>

          {error ? (
            <div className="mt-4">
              <Notice tone="danger">{error}</Notice>
            </div>
          ) : null}
          {message ? (
            <div className="mt-4">
              <Notice tone="success">{message}</Notice>
            </div>
          ) : null}

          <div className="mt-5">
            <ListSearchBar
              placeholder="Buscar por nombre, teléfono, cédula o correo"
            />
          </div>

          <div className="mt-5 overflow-x-auto">
            <div className="min-w-[900px] overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1.2fr_auto] border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <div>Cliente</div>
                <div>Cédula</div>
                <div>Sucursal</div>
                <div>Vendedor asignado</div>
                <div className="text-right">WhatsApp</div>
              </div>

              {customers.length ? (
                customers.map((customer) => {
                  const rowPending = pending && pendingId === customer.id;
                  const branchSellers = sellers.filter(
                    (seller) => seller.branchCode === customer.branchCode,
                  );
                  return (
                    <div
                      className="grid grid-cols-[1.4fr_1fr_1fr_1.2fr_auto] items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0"
                      key={customer.id}
                    >
                      <div className="min-w-0">
                        {/*
                          * Patch CRM-AUD2. El nombre abre la ficha comercial:
                          * es el gesto que la gente ya intenta en una lista.
                          */}
                        <Link
                          className="sb-focus block truncate rounded font-semibold text-slate-900 hover:text-blue-700"
                          href={`/panel/clientes/${customer.id}`}
                        >
                          {customer.name}
                        </Link>
                        <div className="mt-1 truncate text-xs text-slate-500">
                          {customer.phone}
                          {customer.email ? ` · ${customer.email}` : ""}
                        </div>
                      </div>
                      <div className="truncate text-sm text-slate-500">
                        {customer.cedula ?? "No registrada"}
                      </div>
                      <div className="truncate text-sm text-slate-500">
                        {customer.branchName}
                      </div>
                      <div className="min-w-0">
                        {canAssign ? (
                          <>
                            <Select
                              disabled={rowPending || !branchSellers.length}
                              onChange={(event) =>
                                assign(customer.id, event.target.value)
                              }
                              size="sm"
                              value={customer.assignedSellerId ?? ""}
                            >
                              <option value="">
                                {branchSellers.length
                                  ? "Sin asignar"
                                  : "Sin vendedores en la sucursal"}
                              </option>
                              {branchSellers.map((seller) => (
                                <option key={seller.id} value={seller.id}>
                                  {seller.name}
                                </option>
                              ))}
                            </Select>
                            {customer.assignedAt ? (
                              <p className="mt-1 truncate text-xs text-slate-400">
                                {customer.assignedByName
                                  ? `Por ${customer.assignedByName} · `
                                  : ""}
                                {new Date(customer.assignedAt).toLocaleDateString(
                                  "es-NI",
                                )}
                              </p>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-sm text-slate-500">
                            {customer.assignedSellerName ?? "Sin asignar"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          onClick={() => setChatCustomer(customer)}
                          size="sm"
                          variant="secondary"
                        >
                          <MessageCircle aria-hidden className="h-4 w-4" />
                          {(conversations[customer.phone]?.messages.length ?? 0) || ""}
                        </Button>
                        <Link href={`/panel/clientes/${customer.id}`}>
                          <Button size="sm" variant="ghost">
                            Ver ficha
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState
                  description="Registra uno con el botón de arriba, o conviértelo desde un lead."
                  icon={Users}
                  title="Aún no hay clientes en tu alcance"
                />
              )}
            </div>
            <ListPagination
              label="clientes"
              page={page}
              pageSize={pageSize}
              total={total}
            />
          </div>
        </>
      )}

      <WhatsAppConversationDrawer
        contactName={chatCustomer?.name ?? ""}
        conversation={
          chatCustomer ? conversations[chatCustomer.phone] ?? null : null
        }
        onClose={() => setChatCustomer(null)}
        open={chatCustomer !== null}
        phone={chatCustomer?.phone ?? ""}
      />
    </Card>
  );
}
