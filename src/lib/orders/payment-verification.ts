import type {
  OrderPaymentVerification,
  PaymentVerificationStatus,
  PosDigitalChannel,
  PosPaymentMethod,
} from "@/types/orders";

export const MAX_PAYMENT_PROOF_BYTES = 5 * 1024 * 1024;

export const ALLOWED_PAYMENT_PROOF_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const EXTENSION_TO_MIME: Record<string, (typeof ALLOWED_PAYMENT_PROOF_MIME_TYPES)[number]> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const REJECT_PROOF_REASONS: readonly string[] = [
  "Monto no coincide con el total",
  "Comprobante borroso o ilegible",
  "Transferencia no reflejada en cuenta",
  "Comprobante duplicado o antiguo",
];

export type PaymentVerificationMeta = {
  label: string;
  shortLabel: string;
  adminBadgeClass: string;
  storeBadgeClass: string;
};

export const PAYMENT_VERIFICATION_META: Record<
  PaymentVerificationStatus,
  PaymentVerificationMeta
> = {
  pendiente_verificacion: {
    label: "Pago por verificar",
    shortLabel: "Pendiente",
    adminBadgeClass: "border-amber-300 bg-amber-50 text-amber-950 font-semibold",
    storeBadgeClass: "border-amber-400/40 bg-amber-500/15 text-amber-200 font-bold",
  },
  verificado: {
    label: "Pago verificado",
    shortLabel: "Verificado",
    adminBadgeClass: "border-emerald-300 bg-emerald-50 text-emerald-950 font-semibold",
    storeBadgeClass: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200 font-bold",
  },
  rechazado: {
    label: "Comprobante rechazado",
    shortLabel: "Rechazado",
    adminBadgeClass: "border-rose-300 bg-rose-50 text-rose-950 font-semibold",
    storeBadgeClass: "border-rose-400/40 bg-rose-500/15 text-rose-200 font-bold",
  },
};

export function isDigitalTransferMethod(
  method?: PosPaymentMethod,
): method is PosDigitalChannel {
  return (
    method === "transferencia" ||
    method === "nequi" ||
    method === "daviplata" ||
    method === "qr"
  );
}

export function getEffectivePaymentVerificationStatus(order: {
  paymentVerificationStatus?: PaymentVerificationStatus;
  paymentVerification?: Pick<OrderPaymentVerification, "status">;
  paymentProof?: unknown;
}): PaymentVerificationStatus | null {
  return (
    order.paymentVerification?.status ??
    order.paymentVerificationStatus ??
    (order.paymentProof ? "pendiente_verificacion" : null)
  );
}

export function validateClientProofFile(
  file: Pick<File, "size" | "type" | "name">,
): string | null {
  if (file.size <= 0) {
    return "El archivo seleccionado está vacío.";
  }

  if (file.size > MAX_PAYMENT_PROOF_BYTES) {
    return "El comprobante supera el máximo de 5 MB. Elige una captura más liviana.";
  }

  const ext = file.name.split(".").pop()?.trim().toLowerCase() ?? "";
  const expectedMime = EXTENSION_TO_MIME[ext];
  if (!expectedMime) {
    return "Solo se aceptan comprobantes en formato JPEG, PNG o WebP.";
  }

  const normalizedType = file.type.trim().toLowerCase();
  if (normalizedType) {
    const isAllowedMime = (
      ALLOWED_PAYMENT_PROOF_MIME_TYPES as readonly string[]
    ).includes(normalizedType);
    if (!isAllowedMime || normalizedType !== expectedMime) {
      return "El formato de la imagen no coincide con una captura JPEG, PNG o WebP válida.";
    }
  }

  return null;
}
