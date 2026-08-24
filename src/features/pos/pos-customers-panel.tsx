"use client";

import { Search, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { searchPosCustomersAction } from "@/server/pos/actions";

/**
 * Patch POS7.0-C — buscar un cliente desde el mostrador.
 *
 * ## Alcance
 *
 * Llama a `searchPosCustomersAction`, que desde INT3 **acota por la sucursal de
 * la sesión**. No hay parámetro de sucursal que mandar ni forma de pedir la
 * cartera de otro mostrador; esta pantalla no relaja eso, lo hereda.
 *
 * ## Por qué no hay «Nuevo cliente»
 *
 * `createCustomerAction` existe, pero exige `canOperateCrm` sobre una **sesión
 * administrativa**, y además **deduplica por teléfono y cédula en toda la
 * empresa**: un cliente que el mostrador crea puede resolverse a una ficha que
 * ya pertenece a otra sucursal. Que un cajero pueda tocar la cartera de la
 * empresa es una decisión de negocio —quién es dueño del cliente— y no un hueco
 * de interfaz. Se dice en pantalla en vez de dibujar un botón que fallaría con
 * un error de permisos.
 */
export function PosCustomersPanel() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<
    Array<{ id: string; name: string; phone: string | null }>
  >([]);
  const [searched, setSearched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!term.trim()) return;
    setPending(true);
    setError(null);
    setSearched(false);
    const result = await searchPosCustomersAction({ term });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setResults([]);
      return;
    }
    setResults(result.customers);
    setSearched(true);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <Field hint="Nombre o teléfono." label="Buscar cliente">
              <Input
                autoFocus
                className="h-11"
                data-testid="pos-clientes-termino"
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void search();
                }}
                placeholder="Juan Pérez o 8888…"
                value={term}
              />
            </Field>
          </div>
          <Button
            disabled={pending}
            onClick={() => void search()}
            size="wide"
          >
            <Search className="h-4 w-4" />
            Buscar
          </Button>
        </div>
      </Card>

      {error ? (
        <Notice tone="danger">
          <span data-testid="pos-clientes-error">{error}</span>
        </Notice>
      ) : null}

      {pending ? (
        <p
          className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500"
          role="status"
        >
          Buscando…
        </p>
      ) : searched ? (
        results.length ? (
          <div className="space-y-2" data-testid="pos-clientes-resultados">
            {results.map((customer) => (
              <button
                className="sb-focus flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/30"
                data-testid="pos-cliente-fila"
                key={customer.id}
                onClick={() => router.push(`/pos/clientes/${customer.id}`)}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <UserRound aria-hidden className="h-5 w-5 shrink-0 text-slate-400" />
                  <span className="truncate text-sm font-semibold text-slate-900">
                    {customer.name}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-slate-500">
                  {customer.phone ?? "sin teléfono"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
            Ningún cliente de esta sucursal coincide con la búsqueda.
          </p>
        )
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center">
          <UserRound aria-hidden className="mx-auto h-7 w-7 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-600">
            Busca por nombre o teléfono
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Solo aparecen los clientes de esta sucursal.
          </p>
        </div>
      )}

      <Notice tone="info">
        <span data-testid="pos-clientes-limites">
          Dar de alta un cliente <strong>no está disponible desde el mostrador</strong>.
          El registro de clientes se comparte con toda la empresa y se deduplica
          por teléfono y cédula, así que quién puede crearlos es una decisión de
          negocio pendiente, no un botón que falte.
        </span>
      </Notice>
    </div>
  );
}
