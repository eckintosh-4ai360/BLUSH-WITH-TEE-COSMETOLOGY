import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  clinicServices,
  courseModules,
  courses,
  events,
  faqs,
  intakes,
  inventoryItems,
  siteServices,
  testimonials,
} from "@blush/db/schema";
import { defineTool } from "../types";
import { matchesWords } from "./shared";

// What the website assistant may look at.
export const publicTools = [
  defineTool({
    name: "browse_courses",
    description:
      "The courses the school offers, with fees, how long they run, what they cover and what they certify. Use for any question about training, programmes, prices or duration.",
    permissions: [],
    input: z.object({
      search: z.string().optional().describe("Match on course title, code or category."),
      includeModules: z
        .boolean()
        .default(true)
        .describe("Include the list of what each course covers."),
      limit: z.number().int().min(1).max(30).default(20),
    }),
    async run(args, ctx) {
      const filters = [isNull(courses.deletedAt), eq(courses.isActive, true)];
      if (args.search) {
        filters.push(
          matchesWords(
            [courses.title, courses.code, courses.category, courses.summary],
            args.search,
          )!,
        );
      }

      const rows = await ctx.db
        .select({
          id: courses.id,
          title: courses.title,
          slug: courses.slug,
          category: courses.category,
          summary: courses.summary,
          durationWeeks: courses.durationWeeks,
          tuition: courses.tuition,
          productFee: courses.productFee,
          schedule: courses.schedule,
          certification: courses.certification,
          requirements: courses.requirements,
          toiletries: courses.toiletries,
        })
        .from(courses)
        .where(and(...filters))
        .orderBy(asc(courses.category), asc(courses.title))
        .limit(args.limit);

      if (!args.includeModules || !rows.length) {
        return { currency: "GHS", count: rows.length, courses: rows.map(withLink) };
      }

      const modules = await ctx.db
        .select({ courseId: courseModules.courseId, title: courseModules.title })
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
        .orderBy(asc(courseModules.sequence));

      return {
        currency: "GHS",
        count: rows.length,
        courses: rows.map(row => ({
          ...withLink(row),
          covers: modules.filter(module => module.courseId === row.id).map(module => module.title),
        })),
      };
    },
  }),

  defineTool({
    name: "browse_products",
    description:
      "Products the online store sells, with prices and whether they are in stock. Use for questions about buying anything.",
    permissions: [],
    input: z.object({
      search: z.string().optional().describe("Match on product name or category."),
      limit: z.number().int().min(1).max(25).default(12),
    }),
    async run(args, ctx) {
      const filters = [
        isNull(inventoryItems.deletedAt),
        eq(inventoryItems.isActive, true),
        eq(inventoryItems.isSellable, true),
      ];
      if (args.search) {
        filters.push(
          matchesWords([inventoryItems.name, inventoryItems.category], args.search)!,
        );
      }

      const rows = await ctx.db
        .select({
          name: inventoryItems.name,
          slug: inventoryItems.slug,
          category: inventoryItems.category,
          description: inventoryItems.description,
          price: inventoryItems.sellingPrice,
          // The exact count is stock control, not shopping information.
          inStock: sql<boolean>`${inventoryItems.quantityOnHand} > 0`,
        })
        .from(inventoryItems)
        .where(and(...filters))
        .orderBy(asc(inventoryItems.name))
        .limit(args.limit);

      return {
        currency: "GHS",
        count: rows.length,
        products: rows.map(row => ({
          ...row,
          link: row.slug ? `/store/${row.slug}` : "/store",
        })),
      };
    },
  }),

  defineTool({
    name: "browse_services",
    description:
      "Salon and student-clinic services that can be booked, with prices and how long each takes.",
    permissions: [],
    input: z.object({
      limit: z.number().int().min(1).max(30).default(20),
    }),
    async run(args, ctx) {
      const [bookable, advertised] = await Promise.all([
        ctx.db
          .select({
            name: clinicServices.name,
            description: clinicServices.description,
            durationMinutes: clinicServices.durationMinutes,
            price: clinicServices.price,
          })
          .from(clinicServices)
          .where(eq(clinicServices.isActive, true))
          .orderBy(asc(clinicServices.name))
          .limit(args.limit),
        ctx.db
          .select({
            name: siteServices.name,
            summary: siteServices.summary,
            priceFrom: siteServices.priceFrom,
            slug: siteServices.slug,
          })
          .from(siteServices)
          .where(eq(siteServices.status, "published"))
          .orderBy(asc(siteServices.sortOrder))
          .limit(args.limit),
      ]);

      return {
        currency: "GHS",
        bookableAppointments: bookable,
        bookingLink: "/appointments",
        servicesOnSite: advertised,
      };
    },
  }),

  defineTool({
    name: "next_intakes",
    description:
      "When the next classes start and by when to apply. Use for questions about start dates, deadlines or whether it is still possible to join.",
    permissions: [],
    input: z.object({
      limit: z.number().int().min(1).max(20).default(10),
    }),
    async run(args, ctx) {
      const rows = await ctx.db
        .select({
          title: intakes.title,
          course: courses.title,
          startDate: intakes.startDate,
          applicationDeadline: intakes.applicationDeadline,
          capacity: intakes.capacity,
          status: intakes.status,
        })
        .from(intakes)
        .innerJoin(courses, eq(intakes.courseId, courses.id))
        .where(eq(intakes.status, "open"))
        .orderBy(asc(intakes.startDate))
        .limit(args.limit);

      return { count: rows.length, openIntakes: rows, applyLink: "/apply" };
    },
  }),

  defineTool({
    name: "school_information",
    description:
      "Published answers to common questions, upcoming events and what past students say. Use for questions about the school itself, its policies, or anything not covered by the other tools.",
    permissions: [],
    input: z.object({
      topic: z.string().optional().describe("Narrow the questions and answers to a topic."),
    }),
    async run(args, ctx) {
      const questionFilters = [eq(faqs.status, "published")];
      if (args.topic) {
        questionFilters.push(
          matchesWords([faqs.question, faqs.answer, faqs.category], args.topic)!,
        );
      }

      const [questions, upcoming, praise] = await Promise.all([
        ctx.db
          .select({ question: faqs.question, answer: faqs.answer, category: faqs.category })
          .from(faqs)
          .where(and(...questionFilters))
          .orderBy(asc(faqs.sortOrder))
          .limit(20),
        ctx.db
          .select({
            title: events.title,
            summary: events.summary,
            location: events.location,
            startsAt: events.startsAt,
          })
          .from(events)
          .where(and(eq(events.status, "published"), gte(events.startsAt, ctx.now)))
          .orderBy(asc(events.startsAt))
          .limit(5),
        ctx.db
          .select({
            author: testimonials.authorName,
            role: testimonials.authorRole,
            quote: testimonials.quote,
            rating: testimonials.rating,
          })
          .from(testimonials)
          .where(eq(testimonials.status, "published"))
          .orderBy(asc(testimonials.sortOrder))
          .limit(4),
      ]);

      return {
        frequentlyAskedQuestions: questions,
        upcomingEvents: upcoming,
        whatStudentsSay: praise,
        contactLink: "/contact",
      };
    },
  }),
];

function withLink<T extends { id: number; slug: string | null }>(row: T) {
  const { id: _id, ...rest } = row;
  return { ...rest, link: row.slug ? `/programs/${row.slug}` : "/programs" };
}
