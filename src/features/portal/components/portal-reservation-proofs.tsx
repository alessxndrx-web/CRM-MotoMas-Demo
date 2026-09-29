"use client";

import { CheckCircle2, ImageUp, Loader2, Receipt } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  btnPrimary,
  inputClass,
  labelClass,
  PortalBadge,
  PortalCard,
  selectClass,
} from "@/features/portal/components/ui";
import {
  reservationPaymentMethodLabels,
  reservationPaymentMethodValues,
} from "@/server/operations/shared";
import { supportedCurrencies } from "@/server/payments/shared";
import {
  getPortalReservationsAction,
  uploadPortalReservationProofAction,
} from "@/server/portal/proof-actions";
import type { PortalReservationDTO } from "@/server/portal/shared";
import { MAX_UPLOAD_BYTES, RECEIPT_MIME_TYPES, formatBytes } from "@/server/storage/shared";

/**
 * Patch CRM-INT1 — el cliente envía el comprobante de pago de su reserva.
 *
 * Aparece en «Mi reserva» cuando la consulta resolvió a un cliente real (hay
 * testigo firmado). El servidor saca al cliente del testigo; esta pantalla no
 * envía ningún identificador de cliente.
 *
 * **Lo que se le dice al cliente es exactamente lo que pasa:** su comprobante
 * se recibe y queda en verificación. No se le dice que su pago está
 * confirmado ni que la moto está apartada, porque ninguna de las dos cosas
 * ocurre hasta que alguien de MotoMas lo verifica.
 *
 * El envío muestra «Enviando…» mientras dura: una Server Action no expone el
 * avance byte a byte, y fingir una barra de porcentaje sería inventarlo.
 */
export function PortalReservationProofs({ token }: { token: string }) {
  const [reservations, setReservations] = useState<PortalReservationDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const result = await getPortalReservationsAction(token);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError("");
      setReservations(result.reservations);
    } catch {
      setError("No pudimos consultar tus reservas. Inténtalo de nuevo.");
    } finally {
      setLoaded(true);
    }
  }, [token]);

  // Mismo patrón que `PortalPayments`: la carga vive en una función del propio
  // efecto, y un desmontaje antes de que responda no escribe estado.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (cancelled) return;
      await refresh();
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  if (!loaded) {
    return (
      <PortalCard className="flex items-center gap-3 p-6 text-sm text-slate-500">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        Consultando tus reservas…
      </PortalCard>
    );
  }
  if (error) {
    return (
      <PortalCard className="p-6 text-sm text-red-700">
        {error}
      </PortalCard>
    );
  }
  if (!reservations.length) return null;

  return (
    <div className="space-y-4">
      {reservations.map((reservation) => (
        <ReservationProofCard
          key={reservation.id}
          onUploaded={refresh}
          reservation={reservation}
          token={token}
        />
      ))}
    </div>
  );
}

function ReservationProofCard({
  onUploaded,
  reservation,
  token,
}: {
  onUploaded: () => Promise<void>;
  reservation: PortalReservationDTO;
  token: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<string>("TRANSFERENCIA");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<string>("NIO");
  const [referencia, setReferencia] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  // La vista previa es una URL local del navegador: se crea al elegir el
  // archivo y se libera al reemplazarlo o al salir de la pantalla.
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

  function chooseFile(next: File | null) {
    setError("");
    setSent(false);
    // Aviso temprano en el navegador. El servidor vuelve a comprobarlo todo,
    // incluida la firma del contenido del archivo.
    if (next && !(RECEIPT_MIME_TYPES as readonly string[]).includes(next.type)) {
      setError("Sube una foto o captura en formato JPG, PNG o WebP.");
      next = null;
    } else if (next && next.size > MAX_UPLOAD_BYTES) {
      setError(`La imagen pesa más de ${formatBytes(MAX_UPLOAD_BYTES)}. Envía una captura más liviana.`);
      next = null;
    }
    setFile(next);
    showPreview(next);
  }

  async function send() {
    if (!file) {
      setError("Elige la imagen de tu comprobante.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const result = await uploadPortalReservationProofAction({
        token,
        reservationId: reservation.id,
        file,
        monto: monto || null,
        moneda,
        metodo,
        referencia: referencia || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(true);
      setFile(null);
      showPreview(null);
      setMonto("");
      setReferencia("");
      await onUploaded();
    } catch {
      setError("No pudimos enviar tu comprobante. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSending(false);
    }
  }

  const proof = reservation.latestProof;
  const inputId = `comprobante-${reservation.id}`;

  return (
    <PortalCard className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Receipt aria-hidden className="h-4 w-4 text-slate-400" />
            Reserva {reservation.reservationNumber}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {reservation.unitLabel} · {reservation.branchName}
          </p>
        </div>
        <PortalBadge tone={reservation.status === "ACTIVA" ? "green" : "amber"}>
          {reservation.statusLabel}
        </PortalBadge>
      </div>

      {reservation.paidOnline ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Tu pago en línea quedó confirmado.
        </p>
      ) : proof ? (
        <div
          className={
            proof.status === "RECHAZADO"
              ? "mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              : proof.status === "APROBADO"
                ? "mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                : "mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          }
        >
          <p className="font-semibold">
            Comprobante: {proof.statusLabel.toLowerCase()}
          </p>
          <p className="mt-0.5">
            {proof.status === "PENDIENTE_REVISION"
              ? "Lo estamos verificando. Te avisaremos aquí cuando esté listo; hasta entonces tu reserva sigue pendiente."
              : proof.status === "APROBADO"
                ? "Verificamos tu comprobante y tu unidad quedó apartada."
                : proof.rejectionReason
                  ? `Motivo: ${proof.rejectionReason}`
                  : "No pudimos validarlo."}
          </p>
          <p className="mt-1 text-xs opacity-80">
            Enviado el {new Date(proof.uploadedAt).toLocaleString("es-NI")}
          </p>
        </div>
      ) : null}

      {sent ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 aria-hidden className="h-4 w-4" />
          Recibimos tu comprobante. Lo verificaremos y te avisaremos aquí.
        </p>
      ) : null}

      {reservation.canUploadProof ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor={inputId}>
              Foto o captura del comprobante de pago
            </label>
            <input
              accept={RECEIPT_MIME_TYPES.join(",")}
              aria-describedby={`${inputId}-ayuda`}
              className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold"
              disabled={sending}
              id={inputId}
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              type="file"
            />
            <p className="mt-1 text-xs text-slate-500" id={`${inputId}-ayuda`}>
              JPG, PNG o WebP, hasta {formatBytes(MAX_UPLOAD_BYTES)}. Te quedan{" "}
              {reservation.attemptsLeft} envío(s) para esta reserva.
            </p>
          </div>
          {preview ? (
            <div className="sm:col-span-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Vista previa de tu comprobante"
                className="max-h-56 rounded-xl border border-slate-200 object-contain"
                src={preview}
              />
            </div>
          ) : null}
          <div>
            <label className={labelClass} htmlFor={`${inputId}-metodo`}>
              ¿Cómo pagaste?
            </label>
            <select
              className={selectClass}
              disabled={sending}
              id={`${inputId}-metodo`}
              onChange={(event) => setMetodo(event.target.value)}
              value={metodo}
            >
              {reservationPaymentMethodValues.map((value) => (
                <option key={value} value={value}>
                  {reservationPaymentMethodLabels[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor={`${inputId}-referencia`}>
              Número de referencia (opcional)
            </label>
            <input
              className={inputClass}
              disabled={sending}
              id={`${inputId}-referencia`}
              onChange={(event) => setReferencia(event.target.value)}
              value={referencia}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={`${inputId}-monto`}>
              Monto pagado (opcional)
            </label>
            <input
              className={inputClass}
              disabled={sending}
              id={`${inputId}-monto`}
              inputMode="decimal"
              onChange={(event) => setMonto(event.target.value)}
              placeholder="0.00"
              value={monto}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={`${inputId}-moneda`}>
              Moneda
            </label>
            <select
              className={selectClass}
              disabled={sending}
              id={`${inputId}-moneda`}
              onChange={(event) => setMoneda(event.target.value)}
              value={moneda}
            >
              {supportedCurrencies.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2" role="alert">
              {error}
            </p>
          ) : null}

          <div className="sm:col-span-2">
            <button
              className={btnPrimary}
              disabled={sending || !file}
              onClick={send}
              type="button"
            >
              {sending ? (
                <>
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                  Enviando comprobante…
                </>
              ) : (
                <>
                  <ImageUp aria-hidden className="h-4 w-4" />
                  Enviar comprobante
                </>
              )}
            </button>
            <p className="mt-2 text-xs text-slate-500">
              Enviar el comprobante no confirma el pago ni aparta la motocicleta:
              nuestro equipo lo verifica primero.
            </p>
          </div>
        </div>
      ) : error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </PortalCard>
  );
}
