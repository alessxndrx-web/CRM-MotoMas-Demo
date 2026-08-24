"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { createPosPurchaseOrderAction } from "@/server/pos/actions";
import type { PosProductDTO } from "@/server/pos/shared";

/**
 * Patch POS1.2-F — crear una orden de compra.
 *
 * La última acción del módulo que no tenía forma de alcanzarse. Igual que el
 * detalle: **primitivas existentes, cero diseño nuevo**, alcanzabilidad
 * funcional.
 *
 * **No envía totales.** La entrada de la acción no tiene campo de total y esta
 * pantalla no lo calcula: el servidor los deriva de las líneas. Mostrar un
 * subtotal aquí sería duplicar la aritmética en el sitio donde más fácil es que
 * divergiera.
 */
type DraftLine = {
  key: string;
  productId: string;
  quantity: string;
  unitCost: string;
};

function newLine(): DraftLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productId: "",
    quantity: "1",
    unitCost: "",
  };
}

export function PosPurchaseNewPanel({
  branches,
  suppliers,
  products,
}: {
  branches: Array<{ code: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  products: PosProductDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);

  const selectClass =
    "sb-focus h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900";

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createPosPurchaseOrderAction({
        branchCode,
        supplierId,
        expectedAt: expectedAt || null,
        notes: notes || null,
        lines: lines
          // La fila vacía que el usuario añadió y no rellenó no es una línea.
          .filter((line) => line.productId && line.unitCost.trim() !== "")
          .map((line) => ({
            productId: line.productId,
            quantity: Number(line.quantity.replace(",", ".")),
            unitCost: Number(line.unitCost.replace(",", ".")),
          })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/panel/pos/compras/${result.orderId}`);
    });
  }

  return (
    // Patch POS2.0-B. Título y descripción los pone `PageHeader` desde la página.
    <Card className="p-6" data-testid="compra-nueva">
      {error ? (
        <div
          className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          data-testid="compra-nueva-error"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Proveedor" required>
          <select
            className={selectClass}
            onChange={(event) => setSupplierId(event.target.value)}
            value={supplierId}
          >
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sucursal" required>
          <select
            className={selectClass}
            onChange={(event) => setBranchCode(event.target.value)}
            value={branchCode}
          >
            {branches.map((branch) => (
              <option key={branch.code} value={branch.code}>
                {branch.name}
              </option>
            ))}
          </select>
        </Field>
        <Field hint="Opcional. Informativa." label="Entrega esperada">
          <Input
            onChange={(event) => setExpectedAt(event.target.value)}
            type="date"
            value={expectedAt}
          />
        </Field>
        <Field hint="Opcional." label="Notas">
          <Input
            onChange={(event) => setNotes(event.target.value)}
            value={notes}
          />
        </Field>
      </div>

      <div className="mt-6" data-testid="compra-nueva-lineas">
        <p className="text-sm font-semibold text-slate-700">Líneas</p>
        {lines.map((line, index) => (
          <div className="mt-2 flex flex-wrap items-end gap-2" key={line.key}>
            <div className="min-w-[14rem] flex-1">
              <Field label={`Artículo ${index + 1}`}>
                <select
                  className={selectClass}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((item) =>
                        item.key === line.key
                          ? { ...item, productId: event.target.value }
                          : item,
                      ),
                    )
                  }
                  value={line.productId}
                >
                  <option value="">Selecciona…</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {product.sku}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="w-28">
              <Field label={`Cantidad ${index + 1}`}>
                <Input
                  className="sb-numeric text-right"
                  inputMode="decimal"
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((item) =>
                        item.key === line.key
                          ? { ...item, quantity: event.target.value }
                          : item,
                      ),
                    )
                  }
                  value={line.quantity}
                />
              </Field>
            </div>
            <div className="w-32">
              <Field label={`Costo ${index + 1}`}>
                <Input
                  className="sb-numeric text-right"
                  inputMode="decimal"
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((item) =>
                        item.key === line.key
                          ? { ...item, unitCost: event.target.value }
                          : item,
                      ),
                    )
                  }
                  value={line.unitCost}
                />
              </Field>
            </div>
            <Button
              aria-label={`Quitar línea ${index + 1}`}
              disabled={lines.length === 1}
              onClick={() =>
                setLines((current) => current.filter((item) => item.key !== line.key))
              }
              size="sm"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          className="mt-2"
          onClick={() => setLines((current) => [...current, newLine()])}
          size="sm"
          variant="secondary"
        >
          <Plus className="h-4 w-4" />
          Agregar línea
        </Button>
      </div>

      <div className="mt-6">
        <Button
          disabled={pending || !supplierId || !branchCode}
          onClick={submit}
          size="sm"
        >
          Crear orden
        </Button>
      </div>
    </Card>
  );
}
