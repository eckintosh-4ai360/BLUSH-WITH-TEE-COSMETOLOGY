import { admissionsRouter } from "./routers/admissions";
import { appointmentsRouter } from "./routers/appointments";
import { authRouter } from "./routers/auth";
import { contentRouter } from "./routers/content";
import { portalRouter } from "./routers/portal";
import { storeRouter } from "./routers/store";
import { systemRouter } from "./routers/system";
import { router } from "./trpc";

/** Mounted by the barber-client-app only — public + student-portal procedures. */
export const clientAppRouter = router({
  system: systemRouter,
  auth: authRouter,
  content: contentRouter,
  admissions: admissionsRouter,
  store: storeRouter,
  appointments: appointmentsRouter,
  portal: portalRouter,
});

export type ClientAppRouter = typeof clientAppRouter;
