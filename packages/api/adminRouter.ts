import { adminNamespaceRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { contentRouter } from "./routers/content";
import { dashboardRouter } from "./routers/dashboard";
import { notificationsRouter } from "./routers/notifications";
import { staffRouter } from "./routers/staff";
import { systemRouter } from "./routers/system";
import { router } from "./trpc";

/** Mounted by the admin-dashboard app only - admin/staff-only procedures. */
export const adminAppRouter = router({
  system: systemRouter,
  auth: authRouter,
  content: contentRouter,
  staff: staffRouter,
  admin: adminNamespaceRouter,
  dashboard: dashboardRouter,
  notifications: notificationsRouter,
});

export type AdminAppRouter = typeof adminAppRouter;
