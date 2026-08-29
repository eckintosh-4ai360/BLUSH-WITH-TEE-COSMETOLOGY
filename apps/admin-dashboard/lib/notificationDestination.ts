/**
 * Top-level sections this dashboard actually serves.
 *
 * A notification is written for whoever the event concerns, so the rows an
 * applicant or a customer receives carry client-site links such as `/portal`
 * or `/store`. Those routes do not exist here, and staff do receive such rows
 * — an admin who files an application from the office is its applicant — so
 * pushing the stored link blindly lands on this app's own 404.
 */
const ADMIN_SECTIONS = new Set([
  "academics",
  "account",
  "admissions",
  "audit",
  "finance",
  "inventory",
  "operations",
  "orders",
  "programs",
  "purchases",
  "reports",
  "settings",
  "staff",
  "students",
  "suppliers",
]);

/** The back-office screen that shows the record a notification is about. */
const BY_ENTITY: Record<string, (entityId: number | null) => string> = {
  application: () => "/admissions",
  certificate: () => "/students/certificates",
  payment: () => "/finance/payments",
  expense: () => "/finance/expenses",
  inventory: () => "/inventory?filter=low",
  storeOrder: entityId => (entityId ? `/orders/${entityId}` : "/orders"),
};

/** Fallback for older rows saved without an entity to point at. */
const BY_TYPE: Record<string, string> = {
  application_submitted: "/admissions",
  application_approved: "/admissions",
  application_rejected: "/admissions",
  missing_document: "/admissions",
  admission_granted: "/admissions",
  payment_received: "/finance/payments",
  outstanding_fee: "/finance/fees",
  new_order: "/orders",
  order_confirmed: "/orders",
  order_shipped: "/orders",
  order_delivered: "/orders",
  low_stock: "/inventory?filter=low",
  new_expense: "/finance/expenses",
  certificate_issued: "/students/certificates",
};

type NotificationRow = {
  type: string;
  entityType: string | null;
  entityId: number | null;
  link: string | null;
};

/**
 * Where clicking a notification should land, or null when this dashboard has
 * nothing to show for it. The stored link wins whenever it names a section
 * that exists here; otherwise the entity it refers to decides.
 */
export function notificationDestination(row: NotificationRow): string | null {
  const link = row.link?.trim();
  if (link?.startsWith("/")) {
    const section = link.split(/[/?#]/).filter(Boolean)[0];
    if (!section || ADMIN_SECTIONS.has(section)) return link;
  }

  const byEntity = row.entityType ? BY_ENTITY[row.entityType] : undefined;
  return byEntity?.(row.entityId) ?? BY_TYPE[row.type] ?? null;
}
