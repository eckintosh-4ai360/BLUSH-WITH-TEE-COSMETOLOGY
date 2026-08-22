import { eq } from "drizzle-orm";
import { clinicServices, courses } from "@blush/db/schema";
import { initializeFoundationData } from "@blush/db";
import { dbOrThrow } from "../dbOrThrow";
import { publicProcedure, router } from "../trpc";

export const contentRouter = router({
  courses: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    await initializeFoundationData(db);
    return db.select().from(courses).where(eq(courses.isActive, true));
  }),
  clinicServices: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    await initializeFoundationData(db);
    return db.select().from(clinicServices).where(eq(clinicServices.isActive, true));
  }),
});
