"use client";

import { useCallback } from "react";
import { toast } from "@blush/ui/components/ui/sonner";
import {
  documentDate,
  drawSignature,
  money,
  renderDocument,
  type SchoolProfile,
} from "@/lib/documents";
import { trpc } from "@/lib/trpc";

export type ReceiptPayment = {
  reference: string;
  amount: number;
  refundedAmount?: number;
  paymentMethod: string;
  paidAt: Date | string | null;
  transactionReference?: string | null;
  note?: string | null;
  studentName: string;
  studentNumber?: string | null;
};

export type StatementCharge = {
  description: string;
  feeType: string;
  dueDate: Date | string | null;
  amountDue: number;
  amountPaid: number;
  balance: number;
};

export type StatementPayment = {
  reference: string;
  paidAt: Date | string | null;
  paymentMethod: string;
  amount: number;
};

export type InvoiceOrder = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress?: string | null;
  createdAt: Date | string;
  paymentStatus: string;
  fulfillmentStatus: string;
  subtotal: number;
  total: number;
  items: Array<{ itemName: string; quantity: number; unitPrice: number; lineTotal: number }>;
};

export type PrintableCertificate = {
  certificateNumber: string;
  studentName: string;
  studentNumber: string;
  courseTitle: string;
  finalGrade?: string | null;
  completionDate: Date | string | null;
  issuedAt: Date | string | null;
  status: string;
  verificationToken?: string | null;
};

const methodLabel = (value: string) => value.replaceAll("_", " ");

/**
 * Printable documents, sharing one letterhead.
 *
 * The school profile is fetched once per screen rather than per document, and
 * every builder is a no-op-safe async function: a failed render reports itself
 * rather than leaving a button that silently does nothing.
 */
export function useDocuments() {
  const header = trpc.platform.documentHeader.useQuery();
  const session = trpc.auth.session.useQuery();

  const school = (header.data?.school ?? {}) as SchoolProfile;
  const footerNote = (header.data?.receipt?.footerNote as string | undefined) ?? undefined;
  const signature = header.data?.certificate ?? {
    signatureName: "Principal",
    signatureTitle: "Principal",
  };
  const generatedBy = session.data?.user.name ?? session.data?.user.email ?? undefined;

  const guard = useCallback(async (run: () => Promise<void>) => {
    try {
      await run();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "That document could not be generated.",
      );
    }
  }, []);

  const paymentReceipt = useCallback(
    (payment: ReceiptPayment) =>
      guard(async () => {
        const net = payment.amount - (payment.refundedAmount ?? 0);

        await renderDocument({
          fileName: `receipt-${payment.reference}`,
          school,
          meta: {
            title: "Payment receipt",
            reference: payment.reference,
            generatedBy,
            footerNote,
            summary: [
              ["Received from", payment.studentName],
              ...(payment.studentNumber
                ? ([["Student number", payment.studentNumber]] as Array<[string, string]>)
                : []),
              ["Date", documentDate(payment.paidAt)],
              ["Method", methodLabel(payment.paymentMethod)],
              ...(payment.transactionReference
                ? ([["Transaction", payment.transactionReference]] as Array<[string, string]>)
                : []),
            ],
          },
          tables: [
            {
              head: ["Description", "Amount"],
              body: [
                ["Payment received", money(payment.amount)],
                ...(payment.refundedAmount
                  ? [["Refunded", `- ${money(payment.refundedAmount)}`]]
                  : []),
              ],
              numericColumns: [1],
              foot: [["Net received", money(net)]],
            },
          ],
          afterTables: (doc, y) => {
            if (payment.note) {
              doc.setFontSize(8.5);
              doc.setTextColor(130, 122, 138);
              doc.text(payment.note, 14, y);
              y += 10;
            }
            drawSignature(doc, y + 14, school.name || "Blush With Tee", "Received by");
          },
        });
      }),
    [guard, school, generatedBy, footerNote],
  );

  const feeStatement = useCallback(
    (input: {
      studentName: string;
      studentNumber: string;
      summary: {
        totalFees: number;
        discounts: number;
        additionalCharges: number;
        amountPaid: number;
        outstanding: number;
      };
      charges: StatementCharge[];
      payments: StatementPayment[];
    }) =>
      guard(async () => {
        const { summary } = input;

        await renderDocument({
          fileName: `fee-statement-${input.studentNumber}`,
          school,
          meta: {
            title: "Fee statement",
            reference: input.studentNumber,
            generatedBy,
            summary: [
              ["Student", input.studentName],
              ["Student number", input.studentNumber],
              ["Statement date", documentDate(new Date())],
            ],
          },
          tables: [
            {
              caption: "Charges",
              head: ["Description", "Type", "Due", "Billed", "Paid", "Balance"],
              body: input.charges.map(charge => [
                charge.description,
                charge.feeType,
                documentDate(charge.dueDate),
                money(charge.amountDue),
                money(charge.amountPaid),
                money(charge.balance),
              ]),
              numericColumns: [3, 4, 5],
            },
            ...(input.payments.length
              ? [
                  {
                    caption: "Payments",
                    head: ["Reference", "Date", "Method", "Amount"],
                    body: input.payments.map(payment => [
                      payment.reference,
                      documentDate(payment.paidAt),
                      methodLabel(payment.paymentMethod),
                      money(payment.amount),
                    ]),
                    numericColumns: [3],
                  },
                ]
              : []),
            {
              // Spelled out as an equation rather than a single number, so the
              // figure at the bottom can be checked rather than trusted.
              caption: "Summary",
              head: ["", "Amount"],
              body: [
                ["Total billed", money(summary.totalFees)],
                ["Less discounts", `- ${money(summary.discounts)}`],
                ["Plus surcharges", `+ ${money(summary.additionalCharges)}`],
                ["Less payments", `- ${money(summary.amountPaid)}`],
              ],
              numericColumns: [1],
              foot: [["Outstanding", money(summary.outstanding)]],
            },
          ],
        });
      }),
    [guard, school, generatedBy],
  );

  const orderInvoice = useCallback(
    (order: InvoiceOrder) =>
      guard(async () => {
        await renderDocument({
          fileName: `invoice-${order.orderNumber}`,
          school,
          meta: {
            title: "Invoice",
            reference: order.orderNumber,
            generatedBy,
            footerNote,
            summary: [
              ["Billed to", order.customerName],
              ["Contact", `${order.customerEmail} · ${order.customerPhone}`],
              ...(order.deliveryAddress
                ? ([["Deliver to", order.deliveryAddress]] as Array<[string, string]>)
                : []),
              ["Order date", documentDate(order.createdAt)],
              ["Payment", order.paymentStatus],
              ["Fulfilment", order.fulfillmentStatus],
            ],
          },
          tables: [
            {
              head: ["Item", "Qty", "Unit price", "Line total"],
              body: order.items.map(item => [
                item.itemName,
                item.quantity,
                money(item.unitPrice),
                money(item.lineTotal),
              ]),
              numericColumns: [1, 2, 3],
              foot: [
                ["", "", "Subtotal", money(order.subtotal)],
                ["", "", "Total", money(order.total)],
              ],
            },
          ],
        });
      }),
    [guard, school, generatedBy, footerNote],
  );

  const certificate = useCallback(
    (input: PrintableCertificate) =>
      guard(async () => {
        await renderDocument({
          fileName: `certificate-${input.certificateNumber}`,
          school,
          meta: {
            title: "Certificate of completion",
            reference: input.certificateNumber,
            generatedBy,
            orientation: "landscape",
          },
          afterTables: (doc, y) => {
            const pageWidth = doc.internal.pageSize.getWidth();
            const centre = pageWidth / 2;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            doc.setTextColor(130, 122, 138);
            doc.text("This is to certify that", centre, y + 6, { align: "center" });

            doc.setFont("helvetica", "bold");
            doc.setFontSize(26);
            doc.setTextColor(95, 82, 119);
            doc.text(input.studentName, centre, y + 22, { align: "center" });

            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            doc.setTextColor(130, 122, 138);
            doc.text("has successfully completed", centre, y + 32, { align: "center" });

            doc.setFont("helvetica", "bold");
            doc.setFontSize(16);
            doc.setTextColor(40, 35, 48);
            doc.text(input.courseTitle, centre, y + 44, { align: "center" });

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.setTextColor(70, 62, 78);
            const detail = [
              `Student number ${input.studentNumber}`,
              input.finalGrade ? `Grade ${input.finalGrade}` : null,
              `Completed ${documentDate(input.completionDate)}`,
            ]
              .filter(Boolean)
              .join("   ·   ");
            doc.text(detail, centre, y + 54, { align: "center" });

            // A revoked certificate must never print as if it were valid.
            if (input.status === "revoked") {
              doc.setFont("helvetica", "bold");
              doc.setFontSize(20);
              doc.setTextColor(200, 40, 70);
              doc.text("REVOKED", centre, y + 68, { align: "center" });
            }

            drawSignature(doc, y + 86, signature.signatureName, signature.signatureTitle);

            if (input.verificationToken) {
              doc.setFont("helvetica", "normal");
              doc.setFontSize(7.5);
              doc.setTextColor(130, 122, 138);
              doc.text(
                `Verify at ${school.website || "the school website"} using ${input.certificateNumber}`,
                pageWidth - 14,
                y + 92,
                { align: "right" },
              );
            }
          },
        });
      }),
    [guard, school, generatedBy, signature],
  );

  return {
    /** False until the letterhead has loaded, so buttons can wait for it. */
    ready: header.isSuccess,
    paymentReceipt,
    feeStatement,
    orderInvoice,
    certificate,
  };
}
