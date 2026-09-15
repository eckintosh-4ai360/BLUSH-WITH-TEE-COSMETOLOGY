import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  banners,
  blogCategories,
  blogPosts,
  clinicServices,
  courseModules,
  courses,
  enquiries,
  events,
  faqs,
  galleryItems,
  intakes,
  pages,
  systemSettings,
  testimonials,
} from "@blush/db/schema";
import { storageGet } from "@blush/storage";
import { dbOrThrow } from "../dbOrThrow";
import { safeHref } from "../platform.utils";
import { readSchoolProfile } from "../services/schoolProfile";
import { readMessagingConfig } from "../services/messaging/config";
import { sendEmail } from "../services/messaging/email";
import { publicProcedure, router, throttledPublicProcedure } from "../trpc";

async function imageUrl(key: string | null | undefined): Promise<string | null> {
  return key ? (await storageGet(key)).url : null;
}

// A published post shows once its date has come. Ghana keeps GMT, so the UTC date is today's.
const postIsLive = () =>
  and(
    eq(blogPosts.status, "published"),
    isNull(blogPosts.deletedAt),
    or(isNull(blogPosts.publishedAt), lte(blogPosts.publishedAt, new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`))),
  );

const slugParam = z.string().trim().min(1).max(180);

// Public read-only content.
export const contentRouter = router({
  // A published website page, or null when there is none at that address.
  page: publicProcedure.input(z.object({ slug: slugParam })).query(async ({ input }) => {
    const db = await dbOrThrow();
    const [row] = await db
      .select()
      .from(pages)
      .where(and(eq(pages.slug, input.slug), eq(pages.status, "published")))
      .limit(1);
    if (!row) return null;
    return {
      slug: row.slug,
      title: row.title,
      content: row.content ?? "",
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      ogImageUrl: await imageUrl(row.ogImageKey),
      updatedAt: row.updatedAt,
    };
  }),

  // Published pages, for the footer and the sitemap.
  pageLinks: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    return db
      .select({ slug: pages.slug, title: pages.title, updatedAt: pages.updatedAt })
      .from(pages)
      .where(eq(pages.status, "published"))
      .orderBy(asc(pages.title));
  }),

  // Published blog posts, newest first, optionally in one category.
  blogPosts: publicProcedure
    .input(
      z
        .object({
          category: slugParam.optional(),
          limit: z.number().int().min(1).max(100).default(30),
        })
        .default({ limit: 30 }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const rows = await db
        .select({
          post: blogPosts,
          categoryName: blogCategories.name,
          categorySlug: blogCategories.slug,
        })
        .from(blogPosts)
        .leftJoin(blogCategories, eq(blogPosts.categoryId, blogCategories.id))
        .where(and(postIsLive(), input.category ? eq(blogCategories.slug, input.category) : undefined))
        .orderBy(sql`${blogPosts.publishedAt} desc nulls last`, desc(blogPosts.createdAt))
        .limit(input.limit);
      return Promise.all(
        rows.map(async row => ({
          slug: row.post.slug,
          title: row.post.title,
          excerpt: row.post.excerpt,
          authorName: row.post.authorName,
          publishedAt: row.post.publishedAt,
          updatedAt: row.post.updatedAt,
          categoryName: row.categoryName,
          categorySlug: row.categorySlug,
          featuredImageUrl: await imageUrl(row.post.featuredImageKey),
        })),
      );
    }),

  // Categories that have at least one post showing.
  blogCategories: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    return db
      .selectDistinct({ slug: blogCategories.slug, name: blogCategories.name })
      .from(blogCategories)
      .innerJoin(blogPosts, eq(blogPosts.categoryId, blogCategories.id))
      .where(postIsLive())
      .orderBy(asc(blogCategories.name));
  }),

  // One published post, or null.
  blogPost: publicProcedure.input(z.object({ slug: slugParam })).query(async ({ input }) => {
    const db = await dbOrThrow();
    const [row] = await db
      .select({
        post: blogPosts,
        categoryName: blogCategories.name,
        categorySlug: blogCategories.slug,
      })
      .from(blogPosts)
      .leftJoin(blogCategories, eq(blogPosts.categoryId, blogCategories.id))
      .where(and(eq(blogPosts.slug, input.slug), postIsLive()))
      .limit(1);
    if (!row) return null;
    return {
      slug: row.post.slug,
      title: row.post.title,
      excerpt: row.post.excerpt,
      content: row.post.content,
      authorName: row.post.authorName,
      publishedAt: row.post.publishedAt,
      updatedAt: row.post.updatedAt,
      tags: (row.post.tags ?? "")
        .split(",")
        .map(tag => tag.trim())
        .filter(Boolean),
      seoTitle: row.post.seoTitle,
      seoDescription: row.post.seoDescription,
      categoryName: row.categoryName,
      categorySlug: row.categorySlug,
      featuredImageUrl: await imageUrl(row.post.featuredImageKey),
    };
  }),

  // Published banners for one place on the site: the homepage band, or the site-wide strip.
  banners: publicProcedure
    .input(z.object({ placement: z.enum(["homepage", "announcement"]) }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const rows = await db
        .select()
        .from(banners)
        .where(and(eq(banners.placement, input.placement), eq(banners.status, "published")))
        .orderBy(asc(banners.sortOrder), desc(banners.createdAt))
        .limit(6);
      return Promise.all(
        rows.map(async row => ({
          id: row.id,
          title: row.title,
          subtitle: row.subtitle,
          ctaLabel: row.ctaLabel,
          // Checked again on the way out, whatever was stored.
          ctaHref: safeHref(row.ctaHref),
          imageUrl: await imageUrl(row.imageKey),
        })),
      );
    }),

  // Published events that have not finished yet, soonest first.
  upcomingEvents: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    const now = new Date();
    const rows = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.status, "published"),
          or(gte(events.startsAt, now), gte(events.endsAt, now)),
        ),
      )
      .orderBy(asc(events.startsAt))
      .limit(6);
    return Promise.all(
      rows.map(async row => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        description: row.description,
        location: row.location,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        imageUrl: await imageUrl(row.imageKey),
      })),
    );
  }),

  gallery: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows = await db
      .select()
      .from(galleryItems)
      .where(eq(galleryItems.status, "published"))
      .orderBy(asc(galleryItems.sortOrder), desc(galleryItems.createdAt))
      .limit(120);
    return Promise.all(
      rows.map(async row => ({
        id: row.id,
        title: row.title,
        caption: row.caption,
        category: row.category,
        altText: row.altText,
        imageUrl: (await imageUrl(row.storageKey))!,
      })),
    );
  }),

  testimonials: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows = await db
      .select()
      .from(testimonials)
      .where(eq(testimonials.status, "published"))
      .orderBy(asc(testimonials.sortOrder), desc(testimonials.createdAt))
      .limit(12);
    return Promise.all(
      rows.map(async row => ({
        id: row.id,
        authorName: row.authorName,
        authorRole: row.authorRole,
        quote: row.quote,
        rating: row.rating,
        photoUrl: await imageUrl(row.photoKey),
      })),
    );
  }),

  faqs: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    return db
      .select({
        id: faqs.id,
        question: faqs.question,
        answer: faqs.answer,
        category: faqs.category,
      })
      .from(faqs)
      .where(eq(faqs.status, "published"))
      .orderBy(asc(faqs.sortOrder), asc(faqs.id));
  }),

  // The prospectus, as both the public site and the admissions desk read it.
  courses: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    // Removed as well as closed.
    const rows = await db
      .select()
      .from(courses)
      .where(and(eq(courses.isActive, true), isNull(courses.deletedAt)));
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
    return db
      .select()
      .from(clinicServices)
      .where(and(eq(clinicServices.isActive, true), eq(clinicServices.isBookable, true)));
  }),
  // Open intakes, soonest start first, so the apply form offers the school's real
  // start dates instead of a free date picker.
  intakes: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    return db
      .select({
        id: intakes.id,
        courseId: intakes.courseId,
        title: intakes.title,
        startDate: intakes.startDate,
        applicationDeadline: intakes.applicationDeadline,
      })
      .from(intakes)
      .where(eq(intakes.status, "open"))
      .orderBy(asc(intakes.startDate));
  }),
  // The contact page enquiry form. The message is stored and also emailed to the
  // school's published inbox; a missing SMTP setup never loses the enquiry.
  sendEnquiry: throttledPublicProcedure({ bucket: "content.enquiry", limit: 5, windowMs: 60 * 60_000 })
    .input(
      z.object({
        name: z.string().trim().min(2).max(160),
        email: z.string().trim().email().max(320),
        phone: z.string().trim().max(40).optional().or(z.literal("")),
        subject: z.string().trim().max(180).optional().or(z.literal("")),
        message: z.string().trim().min(5).max(3000),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await dbOrThrow();
      await db.insert(enquiries).values({
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone?.trim() || null,
        subject: input.subject?.trim() || null,
        message: input.message,
      });

      const profile = await readSchoolProfile(db);
      const config = await readMessagingConfig(db);
      let emailed = false;
      if (profile.email) {
        const body = [
          `Name: ${input.name}`,
          `Email: ${input.email}`,
          input.phone?.trim() ? `Phone: ${input.phone.trim()}` : null,
          "",
          input.message,
        ]
          .filter(line => line !== null)
          .join("\n");
        const result = await sendEmail(
          config.email,
          profile.email,
          input.subject?.trim() || `Website enquiry from ${input.name}`,
          body,
        );
        emailed = result.ok;
      }
      return { received: true, emailed };
    }),
  // The contact details and social links the school keeps in Settings, for the site's header,
  // footer, contact page and printed forms.
  schoolProfile: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    return readSchoolProfile(db);
  }),
  // Public: returns the school Terms & Conditions stored in system settings.
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

