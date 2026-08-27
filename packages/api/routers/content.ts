import { eq } from "drizzle-orm";
import { clinicServices, courses } from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { publicProcedure, router } from "../trpc";

/**
 * Public read-only content.
 *
 * These used to call `initializeFoundationData`, which inserted a set of sample
 * courses and services whenever the tables were empty. That made an empty
 * catalogue impossible to keep: clearing it out was silently undone by the next
 * anonymous page load. Seeding belongs in `pnpm db:seed`, run deliberately.
 */
export const contentRouter = router({
  courses: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    return db.select().from(courses).where(eq(courses.isActive, true));
  }),
  clinicServices: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    return db.select().from(clinicServices).where(eq(clinicServices.isActive, true));
  }),
});
