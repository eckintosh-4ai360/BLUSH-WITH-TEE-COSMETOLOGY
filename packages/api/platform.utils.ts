import { nanoid } from "nanoid";

export const acceptedDocumentMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AcceptedDocumentMimeType = (typeof acceptedDocumentMimeTypes)[number];

export function buildReference(prefix: string) {
  return `${prefix}-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`;
}

export function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 180) || "upload";
}

export function validateDocumentUpload(mimeType: string, base64Data: string) {
  if (!acceptedDocumentMimeTypes.includes(mimeType as AcceptedDocumentMimeType)) {
    throw new Error("Only PDF, JPEG, PNG, and WEBP documents are accepted.");
  }

  const encoded = base64Data.includes(",") ? base64Data.split(",").pop() ?? "" : base64Data;
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
    throw new Error("Upload must be between 1 byte and 8 MB.");
  }

  return buffer;
}

export function money(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

export function calculateOrderTotal(
  items: Array<{ quantity: number; sellingPrice: string | number }>
) {
  return items.reduce((sum, item) => sum + item.quantity * money(item.sellingPrice), 0);
}

export function inventoryBalanceAfter(quantityOnHand: number, quantityDelta: number) {
  if (!Number.isInteger(quantityOnHand) || !Number.isInteger(quantityDelta)) {
    throw new Error("Inventory quantities must be whole numbers.");
  }
  const nextBalance = quantityOnHand + quantityDelta;
  if (nextBalance < 0) throw new Error("This movement would take inventory below zero.");
  return nextBalance;
}

export function checkoutStockDeductions(items: Array<{ inventoryItemId: number; quantityOnHand: number; quantity: number }>) {
  return items.map(item => ({ inventoryItemId: item.inventoryItemId, remaining: inventoryBalanceAfter(item.quantityOnHand, -item.quantity) }));
}

export function canUsePortal(role: "user" | "student" | "staff" | "admin", portal: "student" | "staff" | "admin") {
  if (portal === "student") return role === "student" || role === "admin";
  if (portal === "staff") return role === "staff" || role === "admin";
  return role === "admin";
}
