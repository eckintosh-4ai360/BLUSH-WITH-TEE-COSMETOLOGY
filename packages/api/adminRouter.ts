import { adminNamespaceRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { contentRouter } from "./routers/content";
import { certificatesRouter } from "./routers/certificates";
import { dashboardRouter } from "./routers/dashboard";
import { financeRouter } from "./routers/finance";
import { importsRouter } from "./routers/imports";
import { inventoryRouter } from "./routers/inventory";
import { notificationsRouter } from "./routers/notifications";
import { platformRouter } from "./routers/platform";
import { reportsRouter } from "./routers/reports";
import { ordersRouter } from "./routers/orders";
import { staffRouter } from "./routers/staff";
import { studentsRouter } from "./routers/students";
import { systemRouter } from "./routers/system";
import { router } from "./trpc";

/** Mounted by the admin-dashboard app only - admin/staff-only procedures. */
export const adminAppRouter = router({
  system: systemRouter,
  auth: authRouter,
  content: contentRouter,
  staff: staffRouter,
  students: studentsRouter,
  admin: adminNamespaceRouter,
  finance: financeRouter,
  imports: importsRouter,
  inventory: inventoryRouter,
  orders: ordersRouter,
  certificates: certificatesRouter,
  platform: platformRouter,
  reports: reportsRouter,
  dashboard: dashboardRouter,
  notifications: notificationsRouter,
});

export type AdminAppRouter = typeof adminAppRouter;
