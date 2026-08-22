import { customAlphabet } from "nanoid";

/**
 * Uppercase letters and digits with the lookalikes removed (no I, O, 0, 1).
 * References get read down a phone line and copied off printed receipts, so
 * they must not contain the hyphen used as the delimiter or characters a
 * person can transcribe two ways.
 */
const referenceSuffix = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

export {
  amountString,
  formatCurrency,
  fromMinor,
  money,
  sumMinor,
  toAmountString,
  toMinor,
} from "./services/money";
export {
  checkoutStockDeductions,
  inventoryBalanceAfter,
  isLowStock,
} from "./services/stock";

export const acceptedDocumentMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AcceptedDocumentMimeType = (typeof acceptedDocumentMimeTypes)[number];

/** Magic-number prefixes, checked so a renamed executable cannot pose as an image. */
const MIME_SIGNATURES: Record<AcceptedDocumentMimeType, (buffer: Buffer) => boolean> = {
  "application/pdf": buffer => buffer.subarray(0, 4).toString("latin1") === "%PDF",
  "image/jpeg": buffer => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  "image/png": buffer =>
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": buffer =>
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP",
};

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Human-readable reference, e.g. `PAY-2026-A7B2C4`. */
export function buildReference(prefix: string) {
  return `${prefix}-${new Date().getFullYear()}-${referenceSuffix()}`;
}

/** Sequential, human-quotable document number, e.g. `COS-2026-00124`. */
export function buildSequentialNumber(prefix: string, sequence: number, width = 5) {
  return `${prefix}-${new Date().getFullYear()}-${String(sequence).padStart(width, "0")}`;
}

export function safeFileName(fileName: string) {
  return (
    fileName
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 180) || "upload"
  );
}

/** URL-safe slug for SEO-friendly course, product and post addresses (§55). */
export function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 160) || "item"
  );
}

/**
 * Validates an uploaded document by declared type, size, and actual file
 * signature (§58). A caller cannot smuggle content past this by lying about
 * the MIME type.
 */
export function validateDocumentUpload(mimeType: string, base64Data: string) {
  if (!acceptedDocumentMimeTypes.includes(mimeType as AcceptedDocumentMimeType)) {
    throw new Error("Only PDF, JPEG, PNG, and WEBP documents are accepted.");
  }

  const encoded = base64Data.includes(",") ? (base64Data.split(",").pop() ?? "") : base64Data;
  const buffer = Buffer.from(encoded, "base64");

  if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error("Upload must be between 1 byte and 8 MB.");
  }

  const matchesSignature = MIME_SIGNATURES[mimeType as AcceptedDocumentMimeType];
  if (!matchesSignature(buffer)) {
    throw new Error("File contents do not match the declared file type.");
  }

  return buffer;
}

export function calculateOrderTotal(
  items: Array<{ quantity: number; sellingPrice: string | number }>,
) {
  return items.reduce((sum, item) => sum + item.quantity * Number(item.sellingPrice ?? 0), 0);
}

export function canUsePortal(
  role: "user" | "student" | "staff" | "admin",
  portal: "student" | "staff" | "admin",
) {
  if (portal === "student") return role === "student" || role === "admin";
  if (portal === "staff") return role === "staff" || role === "admin";
  return role === "admin";
}
