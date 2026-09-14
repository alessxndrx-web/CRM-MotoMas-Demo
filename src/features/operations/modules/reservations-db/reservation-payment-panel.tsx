"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, Receipt, ShieldCheck, Upload, XCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/fields";
import { Notice } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  reservationPaymentMethodLabels,
  reservationPaymentMethodValues,
  type ReservationDTO,
} from "@/server/operations/shared";
import {
  reviewReservationPaymentProof,
  uploadReservationPaymentProof,
} from "@/server/operations/actions";
import { createPaymentRequestAction } from "@/server/payments/actions";
import { formatMoney, supportedCurrencies } from "@/server/payments/shared";
import { MAX_UPLOAD_BYTES, RECEIPT_MIME_TYPES, formatBytes } from "@/server/storage/shared";

/**
 * Patch CRM-QA1 — cómo se paga una reserva, en una sola tarjeta.
 *
 * ## Los dos caminos, y por qué no son el mismo
 *
 * **Comprobante subido a mano.** Una foto de la transferencia o del depósito. La
 * sube quien atiende, la unidad queda retenida en el acto y un supervisor la
 * verifica después. Es la prueba más débil de las dos, y por eso lleva revisión.
 *
 * **Cobro en línea.** MotoMas emite la solicitud, el cliente paga desde su
 * portal y la pasarela confirma con un aviso firmado. **Esa confirmación
 * sustituye al comprobante**: es criptográficamente atribuible, y pedir además
 * la foto sería exigir una prueba peor encima de una mejor.
 *
 * ## Lo que esta tarjeta no puede hacer
 *
 * Activar una reserva sin ninguna de las dos. No hay botón, y tampoco lo habría
 * si lo hubiera: la única transición a ACTIVA vive en el servidor y exige su
 * prueba.
 */
export function ReservationPaymentPanel({
  canReview,
  canRequestPayment,
  onlinePaymentsEnabled,
  reservation,
}: {
  canReview: boolean;
  canRequestPayment: boolean;
  onlinePaymentsEnabled: boolean;
  reservation: ReservationDTO;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  // El archivo se guarda en estado y no en una referencia: `Input` del
  // sistema de diseno no reenvia `ref`, y el estado ademas permite habilitar
  // el boton solo cuando de verdad hay archivo elegido.
  const [file, setFile] = useState<File | null>(null);

  const [metodo, setMetodo] = useState<string>("TRANSFERENCIA");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<string>("NIO");
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");

  const [cobroMonto, setCobroMonto] = useState("");
  const [cobroConcepto, setCobroConcepto] = useState(
    `Reserva ${reservation.reservationNumber}`,
  );

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la acción.");
        return;
      }
      setMessage(done);
      router.refresh();
    });
  }

  function submitProof() {
    if (!file) {
      setError("Selecciona la imagen del comprobante.");
      return;
    }
    // Aviso temprano, no validación: el servidor vuelve a medir los bytes y a
    // comprobar la firma del contenido, que es lo que de verdad decide.
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`El archivo supera el máximo de ${formatBytes(MAX_UPLOAD_BYTES)}.`);
      return;
    }
    run(
      () =>
        uploadReservationPaymentProof({
          reservationId: reservation.id,
          file,
          monto: monto || null,
          moneda,
          metodo,
          referencia: referencia || null,
          notas: notas || null,
        }),
      "Comprobante registrado. La unidad queda apartada.",
    );
  }

  const proof = reservation.paymentProof;
  const pendingPayment = reservation.status === "PENDIENTE_PAGO";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Receipt aria-hidden className="h-4 w-4 text-slate-400" />
          Pago de la reserva {reservation.reservationNumber}
        </h4>
        {reservation.paidOnline ? (
          <Badge tone="green">
            <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
            Confirmado por la pasarela
          </Badge>
        ) : proof ? (
          <Badge
            tone={
              proof.status === "APROBADO"
                ? "green"
                : proof.status === "RECHAZADO"
                  ? "red"
                  : "orange"
            }
          >
            {proof.statusLabel}
          </Badge>
        ) : (
          <Badge tone="orange">Sin comprobante</Badge>
        )}
      </div>

      {error ? (
        <div className="mt-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
      {message ? (
        <div className="mt-3">
          <Notice tone="success">{message}</Notice>
        </div>
      ) : null}

      {proof ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <p className="font-medium text-slate-900">{proof.fileName}</p>
          <p className="mt-1 text-xs text-slate-500">
            {proof.methodLabel}
            {proof.amount ? ` · ${formatMoney(proof.amount, proof.currency ?? "NIO")}` : ""}
            {proof.reference ? ` · Ref. ${proof.reference}` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Subido por {proof.uploadedByName ?? "—"} ·{" "}
            {new Date(proof.uploadedAt).toLocaleString("es-NI")} ·{" "}
            {formatBytes(proof.sizeBytes)}
          </p>
          {proof.reviewedAt ? (
            <p className="mt-1 text-xs text-slate-400">
              Revisado por {proof.reviewedByName ?? "—"} ·{" "}
              {new Date(proof.reviewedAt).toLocaleString("es-NI")}
              {proof.reviewNotes ? ` · ${proof.reviewNotes}` : ""}
            </p>
          ) : null}

          {canReview && proof.status === "PENDIENTE_REVISION" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      reviewReservationPaymentProof({
                        reservationId: reservation.id,
                        aprobar: true,
                      }),
                    "Comprobante aprobado.",
                  )
                }
                size="sm"
                variant="success"
              >
                <CheckCircle2 aria-hidden className="h-4 w-4" />
                Aprobar
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      reviewReservationPaymentProof({
                        reservationId: reservation.id,
                        aprobar: false,
                        notas: notas || null,
                      }),
                    "Comprobante rechazado. La unidad vuelve a estar disponible.",
                  )
                }
                size="sm"
                variant="danger"
              >
                <XCircle aria-hidden className="h-4 w-4" />
                Rechazar y liberar unidad
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {pendingPayment && !proof ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field
            className="sm:col-span-2"
            hint={`JPEG, PNG o WebP. Máximo ${formatBytes(MAX_UPLOAD_BYTES)}.`}
            label="Imagen del comprobante"
            required
          >
            <Input
              accept={RECEIPT_MIME_TYPES.join(",")}
              className="h-auto py-2 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </Field>
          <Field label="Forma de pago">
            <Select onChange={(event) => setMetodo(event.target.value)} value={metodo}>
              {reservationPaymentMethodValues.map((value) => (
                <option key={value} value={value}>
                  {reservationPaymentMethodLabels[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field hint="Opcional" label="Referencia">
            <Input
              onChange={(event) => setReferencia(event.target.value)}
              placeholder="Número de transacción"
              value={referencia}
            />
          </Field>
          <Field hint="Opcional" label="Monto">
            <Input
              inputMode="decimal"
              onChange={(event) => setMonto(event.target.value)}
              placeholder="0.00"
              value={monto}
            />
          </Field>
          <Field label="Moneda">
            <Select onChange={(event) => setMoneda(event.target.value)} value={moneda}>
              {supportedCurrencies.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
          <Field className="sm:col-span-2" label="Notas">
            <Textarea
              onChange={(event) => setNotas(event.target.value)}
              rows={2}
              value={notas}
            />
          </Field>
          <div className="sm:col-span-2">
            <Button disabled={pending || !file} onClick={submitProof} size="sm">
              <Upload aria-hidden className="h-4 w-4" />
              Registrar comprobante y apartar unidad
            </Button>
          </div>
        </div>
      ) : null}

      {pendingPayment && canRequestPayment ? (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-900">
            O cóbralo en línea
          </p>
          {onlinePaymentsEnabled ? (
            <>
              <p className="mt-1 text-xs text-slate-500">
                El cliente lo verá en su portal y la pasarela confirmará el pago.
                Esa confirmación sustituye al comprobante.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Monto a cobrar" required>
                  <Input
                    inputMode="decimal"
                    onChange={(event) => setCobroMonto(event.target.value)}
                    placeholder="0.00"
                    value={cobroMonto}
                  />
                </Field>
                <Field label="Concepto" required>
                  <Input
                    onChange={(event) => setCobroConcepto(event.target.value)}
                    value={cobroConcepto}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Button
                    disabled={pending || !cobroMonto.trim()}
                    onClick={() =>
                      run(
                        () =>
                          createPaymentRequestAction({
                            customerId: reservation.customerId,
                            monto: cobroMonto,
                            moneda,
                            concepto: cobroConcepto,
                            reservationId: reservation.id,
                          }),
                        "Cobro enviado al portal del cliente.",
                      )
                    }
                    size="sm"
                    variant="secondary"
                  >
                    <CreditCard aria-hidden className="h-4 w-4" />
                    Solicitar pago en línea
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <Notice className="mt-2" tone="info">
              El pago en línea no está habilitado: falta configurar la pasarela
              (<code>PAYMENTS_PROVIDER</code>). Usa el comprobante de arriba.
            </Notice>
          )}
        </div>
      ) : null}
    </div>
  );
}
