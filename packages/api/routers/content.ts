import { and, asc, eq, inArray } from "drizzle-orm";
import { clinicServices, courseModules, courses, systemSettings } from "@blush/db/schema";
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
  /**
   * The prospectus, as both the public site and the admissions desk read it.
   *
   * `outline` is the syllabus the school advertises - "Makeup", "Wigmaking and
   * styling", "Frontal pony" - carried as rows rather than as prose inside
   * `description`, so the office can edit a single line of it and both apps
   * show the change.
   */
  courses: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows = await db.select().from(courses).where(eq(courses.isActive, true));
    if (!rows.length) return [];

    const outlines = await db
      .select({
        courseId: courseModules.courseId,
        title: courseModules.title,
      })
      .from(courseModules)
      .where(
        and(
          inArray(
            courseModules.courseId,
            rows.map(row => row.id),
          ),
          eq(courseModules.isActive, true),
        ),
      )
      .orderBy(asc(courseModules.sequence), asc(courseModules.id));

    const byCourse = new Map<number, string[]>();
    for (const item of outlines) {
      const list = byCourse.get(item.courseId);
      if (list) list.push(item.title);
      else byCourse.set(item.courseId, [item.title]);
    }

    return rows.map(row => ({ ...row, outline: byCourse.get(row.id) ?? [] }));
  }),
  clinicServices: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    return db.select().from(clinicServices).where(eq(clinicServices.isActive, true));
  }),
  /** Public: returns the school Terms & Conditions stored in system settings. */
  terms: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, "school.terms"))
      .limit(1);

    type TermSection = { title: string; body: string };
    const data = row?.value as { sections?: TermSection[]; footer?: string } | null;
    return {
      sections: (data?.sections ?? DEFAULT_TERMS.sections) as TermSection[],
      footer: data?.footer ?? DEFAULT_TERMS.footer,
    };
  }),
});

// Default T&C seeded from the official physical document
const DEFAULT_TERMS = {
  sections: [
    {
      title: "Discipline and Personal Hygiene",
      body: "Discipline and personal hygiene is of utmost importance to the school, therefore all students must look very neat and smart always. Indecently dressed students will not be allowed inside the school premises.",
    },
    {
      title: "Student to Model for Each Other",
      body: "During practical sessions, student are expected to model for each other. If for any reason a student cannot do so, by reason of any medical condition, he or she must notify the school on enrollment with necessary evidence. Students shall provide models for practicals from outside when needed.",
    },
    {
      title: "Prescribed Dress Code Appearance",
      body: "In a bid to inculcate a Professional appearance in students, they are to be in the prescribed uniforms at all times. All students must wear the prescribed school uniform. Uniforms: School t-shirt and Lacoste from Tuesday to Thursday, Mufti on Friday. Footwear (loafers/flat shoes/Crocs/sandals): No talking shoes or high heeled foot-wear are allowed. Accessories: With the exception of wedding rings and earrings, no other form of accessories or body jewelries are allowed during and around classes' hours.",
    },
    {
      title: "Class Attendance",
      body: "Punctuality and regularity to class must be ensured. The instructor reserves every right to sanction late comers accordingly. Reporting time for school is 8am.",
    },
    {
      title: "Appearance During Practical",
      body: "Students must ensure that during practical hours, they wear their protective cloth (overalls or aprons, therapy shoes, gloves and others). No student will be permitted to work without it, hence, will not be allowed in class.",
    },
    {
      title: "School Property",
      body: "Students are expected to handle all school properties including tools and equipment with a sense of responsibility or else damages caused to any school property is payable.",
    },
    {
      title: "Compliance with School Rules and Regulation",
      body: "Every student is entitled to the acquaintance with the rules and regulations governing the school and is expected to comply by them accordingly. Breach of the rules shall warrant sanctions like warnings or suspension.",
    },
    {
      title: "Good Behavior",
      body: "Every student is expected to put up a good and accommodating behavior with a high level of comportment, courtesy, discipline, and good moral values.",
    },
    {
      title: "Respect for Student Leadership",
      body: "Every student must be ready to accord the student leadership (seniors), the respect due it. They must also comply with bye-laws which would emerge from their end to help ensure sanity in school.",
    },
    {
      title: "Graduation Requirement",
      body: "All students are to note that, if you do not meet your requirements for the end of a course, you are not graduating but rather re-sit and perfect without any cost involved. Students are requested to do all final project works before having access to graduate. Full payment of school fees and graduation fees are to be settled before a certificate will be given.",
    },
  ],
  footer: "FEES PAID IS STRICTLY NON REFUNDABLE",
};

