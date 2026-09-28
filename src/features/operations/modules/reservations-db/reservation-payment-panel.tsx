"use client";

import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CreditCard,
  Eye,
  History,
  Receipt,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/fields";
import { Notice, Spinner } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  reservationPaymentMethodLabels,
  reservationPaymentMethodValues,
  type ReservationDTO,
  type ReservationPaymentProofDTO,
} from "@/server/operations/shared";
import {
  readReservationPaymentProof,
  reviewReservationPaymentProof,
  uploadReservationPaymentProof,
} from "@/server/operations/actions";
import { createPaymentRequestAction } from "@/server/payments/actions";
import { formatMoney, supportedCurrencies } from "@/server/payments/shared";
import { MAX_UPLOAD_BYTES, RECEIPT_MIME_TYPES, formatBytes } from "@/server/storage/shared";

/**
 * Patch CRM-QA1 — cómo se paga una reserva, en una sola tarjeta.
 *
 * ## Los caminos, y por qué no son el mismo
 *
 * **Comprobante subido por el equipo** o **enviado por el cliente desde su
 * portal** (Patch CRM-INT1). Los dos son una evidencia que nadie ha verificado
 * todavía: **no apartan nada**. La reserva sigue pendiente de pago hasta que un
 * supervisor verifica el comprobante aquí, y esa verificación es la que aparta
 * la unidad. Hasta Patch CRM-INT3 el del equipo apartaba la moto al subirse.
 *
 * **Cobro en línea.** MotoMas emite la solicitud, el cliente paga desde su
 * portal y la pasarela confirma con un aviso firmado. **Esa confirmación
 * sustituye al comprobante**: es criptográficamente atribuible, y pedir además
 * la foto sería exigir una prueba peor encima de una mejor.
 *
 * ## Verificar no es cobrar
 *
 * «Verificado» dice que alguien miró la imagen y la dio por buena. El ingreso
 * sigue naciendo en Caja cuando la venta se factura.
 *
 * ## Lo que esta tarjeta no puede hacer
 *
 * Activar una reserva sin prueba. La única transición a ACTIVA vive en el
 * servidor y exige su prueba.
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
  const [preview, setPreview] = useState<string | null>(null);
  const [openingProof, setOpeningProof] = useState<string | null>(null);

  const [metodo, setMetodo] = useState<string>("TRANSFERENCIA");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<string>("NIO");
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [motivo, setMotivo] = useState("");

  const [cobroMonto, setCobroMonto] = useState("");
  const [cobroConcepto, setCobroConcepto] = useState(
    `Reserva ${reservation.reservationNumber}`,
  );

  // La vista previa es una URL local del navegador. Se crea al elegir el
  // archivo y se libera al reemplazarlo o al cerrar la tarjeta, para no retener
  // la imagen en memoria.
  const previewRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );
  function showPreview(next: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next ? URL.createObjectURL(next) : null;
    setPreview(previewRef.current);
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la acción.");
        return;
      }
      setMessage(done);
      after?.();
      router.refresh();
    });
  }

  function chooseFile(next: File | null) {
    setError("");
    // Aviso temprano, no validación: el servidor vuelve a medir los bytes y a
    // comprobar la firma del contenido, que es lo que de verdad decide.
    if (next && !(RECEIPT_MIME_TYPES as readonly string[]).includes(next.type)) {
      setError("Formato no permitido. Usa una imagen JPEG, PNG o WebP.");
      next = null;
    } else if (next && next.size > MAX_UPLOAD_BYTES) {
      setError(`El archivo supera el máximo de ${formatBytes(MAX_UPLOAD_BYTES)}.`);
      next = null;
    }
    setFile(next);
    showPreview(next);
  }

  function submitProof() {
    if (!file) {
      setError("Selecciona la imagen del comprobante.");
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
      "Comprobante registrado. La unidad se apartará cuando un supervisor lo verifique.",
      () => {
        setFile(null);
        showPreview(null);
      },
    );
  }

  async function openProof(proof: ReservationPaymentProofDTO) {
    setOpeningProof(proof.id);
    setError("");
    const result = await readReservationPaymentProof({
      reservationId: reservation.id,
      proofId: proof.id,
    });
    setOpeningProof(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.open(result.dataUri, "_blank", "noopener,noreferrer");
  }

  const proof = reservation.paymentProof;
  const history = reservation.proofHistory.slice(1);
  const pendingPayment = reservation.status === "PENDIENTE_PAGO";
  const canUpload =
    pendingPayment && (!proof || proof.status === "RECHAZADO");
  const reviewing = canReview && proof?.status === "PENDIENTE_REVISION";
  const approveLabel =
    pendingPayment ? "Verificar y apartar unidad" : "Verificar comprobante";
  const rejectLabel =
    reservation.status === "ACTIVA" ? "Rechazar y liberar unidad" : "Rechazar";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Receipt aria-hidden className="h-4 w-4 text-slate-400" />
          Pago de la reserva {reservation.reservationNumber} ·{" "}
          {reservation.customerName}
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-slate-900">{proof.fileName}</p>
            <Badge tone={proof.source === "PORTAL_CLIENTE" ? "blue" : "slate"}>
              {proof.sourceLabel}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Pago reportado: {proof.methodLabel}
            {proof.amount ? ` · ${formatMoney(proof.amount, proof.currency ?? "NIO")}` : " · sin monto indicado"}
            {proof.reference ? ` · Ref. ${proof.reference}` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Subido por {proof.uploadedByName ?? "—"} ·{" "}
            {new Date(proof.uploadedAt).toLocaleString("es-NI")} ·{" "}
            {formatBytes(proof.sizeBytes)}
          </p>
          {proof.reviewedAt ? (
            <p className="mt-1 text-xs text-slate-500">
              {proof.status === "RECHAZADO" ? "Rechazado" : "Verificado"} por{" "}
              {proof.reviewedByName ?? "—"} ·{" "}
              {new Date(proof.reviewedAt).toLocaleString("es-NI")}
              {proof.reviewNotes ? ` · Motivo: ${proof.reviewNotes}` : ""}
            </p>
          ) : null}
          {proof.status === "PENDIENTE_REVISION" && pendingPayment ? (
            <p className="mt-2 text-xs text-slate-500">
              {proof.source === "PORTAL_CLIENTE" ? "Enviado por el cliente: " : ""}
              la unidad todavía no está apartada. Se aparta al verificarlo.
            </p>
          ) : null}

          {/*
            * Patch CRM-AUD1 — ver el comprobante ANTES de decidir.
            *
            * Se abre en una pestaña nueva como `data:` URI: no hay ruta HTTP a
            * un comprobante de pago, así que no hay enlace que se reenvíe y siga
            * sirviendo a quien no debería verlo.
            */}
          <div className="mt-3">
            <Button
              disabled={openingProof !== null}
              onClick={() => openProof(proof)}
              size="sm"
              variant="secondary"
            >
              <Eye aria-hidden className="h-4 w-4" />
              {openingProof === proof.id ? "Abriendo…" : "Ver comprobante"}
            </Button>
          </div>

          {reviewing ? (
            <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4">
              <Field
                hint="Obligatorio para rechazar. El cliente lo verá en su portal."
                label="Motivo del rechazo"
              >
                <Textarea
                  onChange={(event) => setMotivo(event.target.value)}
                  placeholder="Ej.: el monto no coincide, la imagen no es legible…"
                  rows={2}
                  value={motivo}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        reviewReservationPaymentProof({
                          reservationId: reservation.id,
                          aprobar: true,
                        }),
                      pendingPayment
                        ? "Comprobante verificado. La unidad quedó apartada."
                        : "Comprobante verificado.",
                    )
                  }
                  size="sm"
                  variant="success"
                >
                  <CheckCircle2 aria-hidden className="h-4 w-4" />
                  {approveLabel}
                </Button>
                <Button
                  disabled={pending || motivo.trim().length < 5}
                  onClick={() =>
                    run(
                      () =>
                        reviewReservationPaymentProof({
                          reservationId: reservation.id,
                          aprobar: false,
                          notas: motivo,
                        }),
                      reservation.status === "ACTIVA"
                        ? "Comprobante rechazado. La unidad vuelve a estar disponible."
                        : "Comprobante rechazado. El cliente puede enviar otro.",
                      () => setMotivo(""),
                    )
                  }
                  size="sm"
                  variant="danger"
                >
                  <XCircle aria-hidden className="h-4 w-4" />
                  {rejectLabel}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {history.length ? (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <History aria-hidden className="h-3.5 w-3.5" />
            Intentos anteriores
          </p>
          <ul className="mt-2 space-y-2">
            {history.map((item) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                key={item.id}
              >
                <span className="min-w-0 text-slate-600">
                  {new Date(item.uploadedAt).toLocaleString("es-NI")} ·{" "}
                  {item.sourceLabel} · {item.statusLabel}
                  {item.reviewNotes ? ` · ${item.reviewNotes}` : ""}
                </span>
                <Button
                  disabled={openingProof !== null}
                  onClick={() => openProof(item)}
                  size="sm"
                  variant="ghost"
                >
                  {openingProof === item.id ? "Abriendo…" : "Ver"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canUpload ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {proof?.status === "RECHAZADO" ? (
            <div className="sm:col-span-2">
              <Notice tone="info">
                El comprobante anterior fue rechazado. Puedes registrar uno nuevo.
              </Notice>
            </div>
          ) : null}
          <Field
            className="sm:col-span-2"
            hint={`JPEG, PNG o WebP. Máximo ${formatBytes(MAX_UPLOAD_BYTES)}.`}
            label="Imagen del comprobante"
            required
          >
            <Input
              accept={RECEIPT_MIME_TYPES.join(",")}
              className="h-auto py-2 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </Field>
          {preview ? (
            <div className="sm:col-span-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Vista previa del comprobante"
                className="max-h-48 rounded-lg border border-slate-200 object-contain"
                src={preview}
              />
            </div>
          ) : null}
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
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button disabled={pending || !file} onClick={submitProof} size="sm">
              <Upload aria-hidden className="h-4 w-4" />
              Registrar comprobante
            </Button>
            {pending && file ? (
              <span className="flex items-center gap-2 text-xs text-slate-500">
                <Spinner label="Subiendo" />
                Subiendo comprobante…
              </span>
            ) : null}
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
