import { adminNamespaceRouter } from "./routers/admin";
import { attendanceRouter } from "./routers/attendance";
import { authRouter } from "./routers/auth";
import { contentRouter } from "./routers/content";
import { certificatesRouter } from "./routers/certificates";
import { closingRouter } from "./routers/closing";
import { dashboardRouter } from "./routers/dashboard";
import { financeRouter } from "./routers/finance";
import { importsRouter } from "./routers/imports";
import { inventoryRouter } from "./routers/inventory";
import { messagingRouter } from "./routers/messaging";
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
  attendance: attendanceRouter,
  content: contentRouter,
  staff: staffRouter,
  students: studentsRouter,
  admin: adminNamespaceRouter,
  finance: financeRouter,
  closing: closingRouter,
  imports: importsRouter,
  inventory: inventoryRouter,
  orders: ordersRouter,
  certificates: certificatesRouter,
  platform: platformRouter,
  messaging: messagingRouter,
  reports: reportsRouter,
  dashboard: dashboardRouter,
  notifications: notificationsRouter,
});

export type AdminAppRouter = typeof adminAppRouter;
