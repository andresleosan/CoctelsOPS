"use client";

import Image from "next/image";
import { useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  Landmark,
  X,
  XCircle,
} from "lucide-react";

import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PAYMENT_VERIFICATION_META,
  REJECT_PROOF_REASONS,
  getEffectivePaymentVerificationStatus,
} from "@/lib/orders/payment-verification";
import { POS_DIGITAL_CHANNEL_LABELS } from "@/lib/orders/pos-calculator";
import type {
  OrderPaymentProof,
  OrderPaymentVerification,
  PaymentVerificationStatus,
  PosDigitalChannel,
} from "@/types/orders";

export type PaymentProofVerificationControlsProps = {
  orderId: string;
  paymentVerificationStatus?: PaymentVerificationStatus;
  paymentProof?: Pick<OrderPaymentProof, "url" | "uploadedAt" | "channel" | "reference">;
  paymentVerification?: Pick<
    OrderPaymentVerification,
    "status" | "updatedAt" | "updatedByName" | "reason"
  >;
  digitalChannel?: PosDigitalChannel;
  digitalReference?: string;
  isVerifying?: boolean;
  compact?: boolean;
  onVerifyPayment?: (
    orderId: string,
    status: PaymentVerificationStatus,
    reason?: string,
  ) => void | Promise<void>;
};

export function PaymentProofVerificationControls({
  orderId,
  paymentVerificationStatus,
  paymentProof,
  paymentVerification,
  digitalChannel,
  digitalReference,
  isVerifying = false,
  compact = false,
  onVerifyPayment,
}: PaymentProofVerificationControlsProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const effectiveStatus = getEffectivePaymentVerificationStatus({
    paymentVerificationStatus,
    paymentVerification,
    paymentProof,
  });

  if (!paymentProof && effectiveStatus === null) {
    return null;
  }

  const activeStatus: PaymentVerificationStatus = effectiveStatus ?? "pendiente_verificacion";
  const statusMeta = PAYMENT_VERIFICATION_META[activeStatus];
  const resolvedChannel = paymentProof?.channel ?? digitalChannel;
  const resolvedReference = paymentProof?.reference ?? digitalReference;
  const channelLabel = resolvedChannel ? POS_DIGITAL_CHANNEL_LABELS[resolvedChannel] : null;

  async function handleApprove() {
    if (!onVerifyPayment) return;
    setShowRejectForm(false);
    setRejectReason("");
    await onVerifyPayment(orderId, "verificado");
  }

  async function handleConfirmReject() {
    if (!onVerifyPayment) return;
    const cleanReason = rejectReason.trim() || undefined;
    await onVerifyPayment(orderId, "rechazado", cleanReason);
    setShowRejectForm(false);
    setRejectReason("");
  }

  return (
    <div
      data-testid={`payment-proof-panel-${orderId}`}
      className={`rounded-lg border border-slate-200 bg-slate-50/90 text-slate-900 ${
        compact ? "space-y-2 p-2.5" : "space-y-3 p-3.5"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            data-testid={`payment-verification-badge-${orderId}`}
            className={`inline-flex items-center gap-1 text-[11px] ${statusMeta.adminBadgeClass}`}
          >
            <Landmark className="h-3 w-3 shrink-0" aria-hidden="true" />
            {statusMeta.label}
          </Badge>
          {channelLabel && (
            <span className="rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-200">
              {channelLabel}
            </span>
          )}
          {resolvedReference && (
            <span className="rounded bg-white px-2 py-0.5 text-[11px] font-mono text-slate-700 border border-slate-200">
              Ref: {resolvedReference}
            </span>
          )}
        </div>

        {paymentProof?.url ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid={`btn-view-proof-${orderId}`}
            onClick={() => setIsPreviewOpen(true)}
            className="min-h-11 gap-2 border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
          >
            <span className="relative h-6 w-6 overflow-hidden rounded border border-slate-200 bg-slate-100 shrink-0">
              <Image
                src={paymentProof.url}
                alt={`Comprobante pedido ${orderId}`}
                width={24}
                height={24}
                unoptimized
                className="h-full w-full object-cover"
              />
            </span>
            <Eye className="h-3.5 w-3.5 text-cyan-700" aria-hidden="true" />
            Ver comprobante
          </Button>
        ) : (
          <span className="text-[11px] font-medium text-slate-500">
            Sin captura adjunta aún
          </span>
        )}
      </div>

      {activeStatus === "rechazado" && paymentVerification?.reason && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-900">
          Motivo rechazo: {paymentVerification.reason}
        </p>
      )}

      {activeStatus === "verificado" && paymentVerification?.updatedByName && (
        <p className="text-[11px] font-medium text-emerald-800">
          Verificado por {paymentVerification.updatedByName}
        </p>
      )}

      {onVerifyPayment && (
        <PermissionGate permission="pedidos.update">
          <div className="flex flex-wrap items-center gap-2">
            {activeStatus !== "verificado" && (
              <Button
                type="button"
                size="sm"
                data-testid={`btn-verify-payment-${orderId}`}
                disabled={isVerifying}
                onClick={() => void handleApprove()}
                className="min-h-11 gap-1.5 bg-emerald-700 px-3 font-bold text-white hover:bg-emerald-800"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {isVerifying ? "Verificando..." : "Aprobar pago"}
              </Button>
            )}

            {activeStatus !== "rechazado" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid={`btn-reject-payment-${orderId}`}
                disabled={isVerifying}
                onClick={() => setShowRejectForm((prev) => !prev)}
                className="min-h-11 gap-1.5 border-rose-300 bg-white px-3 font-semibold text-rose-800 hover:bg-rose-50"
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Rechazar
              </Button>
            )}
          </div>

          {showRejectForm && (
            <div className="space-y-2 rounded-lg border border-rose-200 bg-white p-2.5">
              <p className="text-xs font-semibold text-slate-800">
                Motivo del rechazo (opcional)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {REJECT_PROOF_REASONS.map((preset) => {
                  const selected = rejectReason === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRejectReason(preset)}
                      className={`min-h-9 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        selected
                          ? "border-rose-600 bg-rose-600 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
              <Input
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Especifica el motivo si aplica..."
                aria-label={`Motivo de rechazo del comprobante ${orderId}`}
                maxLength={240}
                className="min-h-10 bg-white text-xs text-slate-900"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  data-testid={`btn-confirm-reject-${orderId}`}
                  disabled={isVerifying}
                  onClick={() => void handleConfirmReject()}
                  className="min-h-11 bg-rose-700 px-3 text-xs font-bold text-white hover:bg-rose-800"
                >
                  {isVerifying ? "Guardando..." : "Confirmar rechazo"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isVerifying}
                  onClick={() => {
                    setShowRejectForm(false);
                    setRejectReason("");
                  }}
                  className="min-h-11 px-3 text-xs text-slate-700"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </PermissionGate>
      )}

      {isPreviewOpen && paymentProof?.url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Comprobante de transferencia pedido ${orderId}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">
                  Comprobante #{orderId}
                </h3>
                <p className="text-xs text-slate-600">
                  {channelLabel ? `${channelLabel}` : "Transferencia"}
                  {resolvedReference ? ` · Ref: ${resolvedReference}` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Cerrar vista de comprobante"
                onClick={() => setIsPreviewOpen(false)}
                className="min-h-11 min-w-11 text-slate-700"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="relative flex max-h-[65vh] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-2">
              <Image
                src={paymentProof.url}
                alt={`Captura de comprobante del pedido ${orderId}`}
                width={480}
                height={640}
                unoptimized
                className="max-h-[60vh] w-auto rounded-lg object-contain"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <a
                href={paymentProof.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-cyan-800 hover:bg-slate-50"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir original
              </a>
              <Button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="min-h-11 bg-slate-900 px-5 text-xs font-bold text-white hover:bg-slate-800"
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
