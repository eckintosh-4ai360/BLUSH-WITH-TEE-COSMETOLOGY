import { asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { banners, enquiries, events, faqs, galleryItems, testimonials } from "@blush/db/schema";
import { storageGet, storagePut } from "@blush/storage";
import { dbOrThrow } from "../dbOrThrow";
import {
  MAX_UPLOAD_BASE64_LENGTH,
  safeFileName,
  safeHref,
  slugify,
  validateDocumentUpload,
} from "../platform.utils";
import { recordAudit } from "../services/audit";
import { permissionProcedure, router } from "../trpc";

// Website content: what the public site shows beyond the catalogue. Nothing here is deleted;
// archiving takes an entry off the site and keeps its history.

export const PUBLISH_STATUSES = ["draft", "published", "archived"] as const;

export const GALLERY_CATEGORIES = [
  "student_work",
  "graduation",
  "training",
  "facilities",
  "hair",
  "makeup",
  "nails",
  "events",
] as const;

export const BANNER_PLACEMENTS = ["homepage", "announcement"] as const;

const status = z.enum(PUBLISH_STATUSES);
const sortOrder = z.number().int().min(0).max(9999).default(0);
const optionalText = (max: number) => z.string().trim().max(max).optional();
// A key returned by uploadImage; null clears the picture.
const imageKey = z.string().trim().min(3).max(512).nullable().optional();

const KINDS = {
  banner: banners,
  event: events,
  gallery: galleryItems,
  testimonial: testimonials,
  faq: faqs,
} as const;

// The proxy path an image is served from, public for keys under media/gallery and media/site.
async function imageUrl(key: string | null | undefined): Promise<string | null> {
  return key ? (await storageGet(key)).url : null;
}

function blank(value: string | undefined | null): string | null {
  return value?.trim() ? value.trim() : null;
}

export const cmsRouter = router({
  banners: permissionProcedure("cms.read").query(async () => {
    const db = await dbOrThrow();
    const rows = await db
      .select()
      .from(banners)
      .orderBy(asc(banners.placement), asc(banners.sortOrder), desc(banners.createdAt));
    return Promise.all(rows.map(async row => ({ ...row, imageUrl: await imageUrl(row.imageKey) })));
  }),

  events: permissionProcedure("cms.read").query(async () => {
    const db = await dbOrThrow();
    const rows = await db.select().from(events).orderBy(desc(events.startsAt));
    return Promise.all(rows.map(async row => ({ ...row, imageUrl: await imageUrl(row.imageKey) })));
  }),

  gallery: permissionProcedure("cms.read").query(async () => {
    const db = await dbOrThrow();
    const rows = await db
      .select()
      .from(galleryItems)
      .orderBy(asc(galleryItems.sortOrder), desc(galleryItems.createdAt));
    return Promise.all(
      rows.map(async row => ({ ...row, imageUrl: await imageUrl(row.storageKey) })),
    );
  }),

  testimonials: permissionProcedure("cms.read").query(async () => {
    const db = await dbOrThrow();
    const rows = await db
      .select()
      .from(testimonials)
      .orderBy(asc(testimonials.sortOrder), desc(testimonials.createdAt));
    return Promise.all(rows.map(async row => ({ ...row, photoUrl: await imageUrl(row.photoKey) })));
  }),

  faqs: permissionProcedure("cms.read").query(async () => {
    const db = await dbOrThrow();
    return db.select().from(faqs).orderBy(asc(faqs.sortOrder), asc(faqs.id));
  }),

  // Messages sent from the public contact page, newest first.
  enquiries: permissionProcedure("cms.read").query(async () => {
    const db = await dbOrThrow();
    return db.select().from(enquiries).orderBy(desc(enquiries.createdAt));
  }),

  setEnquiryStatus: permissionProcedure("cms.write")
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["new", "handled"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [updated] = await db
        .update(enquiries)
        .set({ status: input.status })
        .where(eq(enquiries.id, input.id))
        .returning({ id: enquiries.id });
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That enquiry could not be found." });
      }
      await recordAudit(db, ctx.actor, {
        action: "set_status",
        entity: "enquiry",
        entityId: input.id,
        newValue: { status: input.status },
        summary: `${ctx.actor.name ?? "Staff"} marked enquiry #${input.id} as ${input.status}`,
      });
      return { id: input.id, status: input.status };
    }),

  deleteEnquiry: permissionProcedure("cms.write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [removed] = await db
        .delete(enquiries)
        .where(eq(enquiries.id, input.id))
        .returning({ id: enquiries.id, name: enquiries.name });
      if (!removed) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That enquiry could not be found." });
      }
      await recordAudit(db, ctx.actor, {
        action: "delete",
        entity: "enquiry",
        entityId: input.id,
        entityLabel: removed.name,
        summary: `${ctx.actor.name ?? "Staff"} deleted enquiry #${input.id} from ${removed.name}`,
      });
      return { id: input.id };
    }),

  // Stores a picture for the site. Gallery photos and other site images live under public
  // prefixes, so the storage proxy serves them without a sign-in.
  uploadImage: permissionProcedure("cms.write")
    .input(
      z.object({
        area: z.enum(["gallery", "site"]),
        fileName: z.string().min(1).max(255),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        base64Data: z.string().min(8).max(MAX_UPLOAD_BASE64_LENGTH),
      }),
    )
    .mutation(async ({ input }) => {
      let buffer: Buffer;
      try {
        buffer = validateDocumentUpload(input.mimeType, input.base64Data);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "That image could not be read.",
        });
      }

      const stored = await storagePut(
        `media/${input.area}/${Date.now()}-${safeFileName(input.fileName)}`,
        buffer,
        input.mimeType,
      );
      return { key: stored.key, url: stored.url };
    }),

  saveBanner: permissionProcedure("cms.write")
    .input(
      z
        .object({
          id: z.number().int().positive().optional(),
          title: z.string().trim().min(2).max(180),
          subtitle: optionalText(255),
          imageKey,
          ctaLabel: optionalText(80),
          ctaHref: optionalText(255),
          placement: z.enum(BANNER_PLACEMENTS),
          sortOrder,
          status,
        })
        .superRefine((input, ctx) => {
          if (input.ctaHref?.trim() && !safeHref(input.ctaHref)) {
            ctx.addIssue({
              code: "custom",
              path: ["ctaHref"],
              message: "Use a page on this site such as /apply, or a full https:// address.",
            });
          }
          if (Boolean(input.ctaLabel?.trim()) !== Boolean(input.ctaHref?.trim())) {
            ctx.addIssue({
              code: "custom",
              path: ["ctaHref"],
              message: "A button needs both its wording and where it goes.",
            });
          }
        }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const values = {
        title: input.title,
        subtitle: blank(input.subtitle),
        imageKey: input.imageKey ?? null,
        ctaLabel: blank(input.ctaLabel),
        ctaHref: safeHref(input.ctaHref),
        placement: input.placement,
        sortOrder: input.sortOrder,
        status: input.status,
      };
      const id = await saveRow(db, banners, input.id, values);
      await recordAudit(db, ctx.actor, {
        action: input.id ? "update" : "create",
        entity: "banner",
        entityId: id,
        entityLabel: input.title,
        newValue: { placement: input.placement, status: input.status },
        summary: `${ctx.actor.name ?? "Staff"} ${input.id ? "edited" : "added"} the "${input.title}" banner (${input.status})`,
      });
      return { id };
    }),

  saveEvent: permissionProcedure("cms.write")
    .input(
      z
        .object({
          id: z.number().int().positive().optional(),
          title: z.string().trim().min(2).max(180),
          summary: optionalText(320),
          description: optionalText(5000),
          imageKey,
          location: optionalText(180),
          startsAt: z.coerce.date(),
          endsAt: z.coerce.date().nullable().optional(),
          status,
        })
        .refine(input => !input.endsAt || input.endsAt >= input.startsAt, {
          path: ["endsAt"],
          message: "An event cannot end before it starts.",
        }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const values = {
        title: input.title,
        summary: blank(input.summary),
        description: blank(input.description),
        imageKey: input.imageKey ?? null,
        location: blank(input.location),
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        status: input.status,
      };
      const id = input.id
        ? await saveRow(db, events, input.id, values)
        : await saveRow(db, events, undefined, {
            ...values,
            // Unique without a lookup: the time suffix separates two events with one title.
            slug: `${slugify(input.title).slice(0, 120)}-${Date.now().toString(36)}`,
          });
      await recordAudit(db, ctx.actor, {
        action: input.id ? "update" : "create",
        entity: "event",
        entityId: id,
        entityLabel: input.title,
        newValue: { startsAt: input.startsAt, status: input.status },
        summary: `${ctx.actor.name ?? "Staff"} ${input.id ? "edited" : "added"} the "${input.title}" event (${input.status})`,
      });
      return { id };
    }),

  saveGalleryItem: permissionProcedure("cms.write")
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        title: optionalText(180),
        caption: optionalText(320),
        category: z.enum(GALLERY_CATEGORIES),
        storageKey: z.string().trim().min(3).max(512),
        altText: optionalText(255),
        sortOrder,
        status,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const values = {
        title: blank(input.title),
        caption: blank(input.caption),
        category: input.category,
        storageKey: input.storageKey,
        altText: blank(input.altText),
        sortOrder: input.sortOrder,
        status: input.status,
        ...(input.id ? {} : { uploadedByUserId: ctx.user.id }),
      };
      const id = await saveRow(db, galleryItems, input.id, values);
      const label = input.title?.trim() || "a gallery photo";
      await recordAudit(db, ctx.actor, {
        action: input.id ? "update" : "create",
        entity: "galleryItem",
        entityId: id,
        entityLabel: label,
        newValue: { category: input.category, status: input.status },
        summary: `${ctx.actor.name ?? "Staff"} ${input.id ? "edited" : "added"} ${label} (${input.status})`,
      });
      return { id };
    }),

  saveTestimonial: permissionProcedure("cms.write")
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        authorName: z.string().trim().min(2).max(160),
        authorRole: optionalText(120),
        quote: z.string().trim().min(10).max(2000),
        photoKey: imageKey,
        rating: z.number().int().min(1).max(5).nullable().optional(),
        sortOrder,
        status,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const values = {
        authorName: input.authorName,
        authorRole: blank(input.authorRole),
        quote: input.quote,
        photoKey: input.photoKey ?? null,
        rating: input.rating ?? null,
        sortOrder: input.sortOrder,
        status: input.status,
      };
      const id = await saveRow(db, testimonials, input.id, values);
      await recordAudit(db, ctx.actor, {
        action: input.id ? "update" : "create",
        entity: "testimonial",
        entityId: id,
        entityLabel: input.authorName,
        newValue: { status: input.status },
        summary: `${ctx.actor.name ?? "Staff"} ${input.id ? "edited" : "added"} a testimonial from ${input.authorName} (${input.status})`,
      });
      return { id };
    }),

  saveFaq: permissionProcedure("cms.write")
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        question: z.string().trim().min(5).max(320),
        answer: z.string().trim().min(2).max(4000),
        category: optionalText(80),
        sortOrder,
        status,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const values = {
        question: input.question,
        answer: input.answer,
        category: blank(input.category),
        sortOrder: input.sortOrder,
        status: input.status,
      };
      const id = await saveRow(db, faqs, input.id, values);
      await recordAudit(db, ctx.actor, {
        action: input.id ? "update" : "create",
        entity: "faq",
        entityId: id,
        entityLabel: input.question.slice(0, 120),
        newValue: { status: input.status },
        summary: `${ctx.actor.name ?? "Staff"} ${input.id ? "edited" : "added"} the FAQ "${input.question.slice(0, 80)}" (${input.status})`,
      });
      return { id };
    }),

  deleteFaq: permissionProcedure("cms.write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [removed] = await db
        .delete(faqs)
        .where(eq(faqs.id, input.id))
        .returning({ id: faqs.id, question: faqs.question });
      if (!removed) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That question could not be found." });
      }
      await recordAudit(db, ctx.actor, {
        action: "delete",
        entity: "faq",
        entityId: input.id,
        entityLabel: removed.question.slice(0, 120),
        summary: `${ctx.actor.name ?? "Staff"} deleted the FAQ "${removed.question.slice(0, 80)}"`,
      });
      return { id: input.id };
    }),

  deleteBanner: permissionProcedure("cms.write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [removed] = await db
        .delete(banners)
        .where(eq(banners.id, input.id))
        .returning({ id: banners.id, title: banners.title });
      if (!removed) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That banner could not be found." });
      }
      await recordAudit(db, ctx.actor, {
        action: "delete",
        entity: "banner",
        entityId: input.id,
        entityLabel: removed.title,
        summary: `${ctx.actor.name ?? "Staff"} deleted the "${removed.title}" banner`,
      });
      return { id: input.id };
    }),

  deleteEvent: permissionProcedure("cms.write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [removed] = await db
        .delete(events)
        .where(eq(events.id, input.id))
        .returning({ id: events.id, title: events.title });
      if (!removed) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That event could not be found." });
      }
      await recordAudit(db, ctx.actor, {
        action: "delete",
        entity: "event",
        entityId: input.id,
        entityLabel: removed.title,
        summary: `${ctx.actor.name ?? "Staff"} deleted the "${removed.title}" event`,
      });
      return { id: input.id };
    }),

  deleteGalleryItem: permissionProcedure("cms.write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [removed] = await db
        .delete(galleryItems)
        .where(eq(galleryItems.id, input.id))
        .returning({ id: galleryItems.id, title: galleryItems.title });
      if (!removed) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That gallery photo could not be found." });
      }
      const label = removed.title?.trim() || "a gallery photo";
      await recordAudit(db, ctx.actor, {
        action: "delete",
        entity: "galleryItem",
        entityId: input.id,
        entityLabel: label,
        summary: `${ctx.actor.name ?? "Staff"} deleted ${label}`,
      });
      return { id: input.id };
    }),

  deleteTestimonial: permissionProcedure("cms.write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [removed] = await db
        .delete(testimonials)
        .where(eq(testimonials.id, input.id))
        .returning({ id: testimonials.id, authorName: testimonials.authorName });
      if (!removed) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That testimonial could not be found." });
      }
      await recordAudit(db, ctx.actor, {
        action: "delete",
        entity: "testimonial",
        entityId: input.id,
        entityLabel: removed.authorName,
        summary: `${ctx.actor.name ?? "Staff"} deleted a testimonial from ${removed.authorName}`,
      });
      return { id: input.id };
    }),

  // Publishes, unpublishes or archives one entry without reopening its form.
  setStatus: permissionProcedure("cms.write")
    .input(
      z.object({
        kind: z.enum(["banner", "event", "gallery", "testimonial", "faq"]),
        id: z.number().int().positive(),
        status,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const table = KINDS[input.kind];
      const updated = await db
        .update(table)
        .set({ status: input.status })
        .where(eq(table.id, input.id))
        .returning({ id: table.id });
      if (!updated.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That entry could not be found." });
      }
      await recordAudit(db, ctx.actor, {
        action: "set_status",
        entity: input.kind,
        entityId: input.id,
        newValue: { status: input.status },
        summary: `${ctx.actor.name ?? "Staff"} set ${input.kind} #${input.id} to ${input.status}`,
      });
      return { id: input.id, status: input.status };
    }),
});

type ContentTable = (typeof KINDS)[keyof typeof KINDS];

// Inserts a new row, or updates the one named, and returns its id.
async function saveRow<T extends ContentTable>(
  db: Awaited<ReturnType<typeof dbOrThrow>>,
  table: T,
  id: number | undefined,
  values: Record<string, unknown>,
): Promise<number> {
  if (id) {
    const updated = await db
      .update(table)
      .set(values as never)
      .where(eq(table.id, id))
      .returning({ id: table.id });
    if (!updated.length) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That entry could not be found." });
    }
    return id;
  }

  const [created] = await db
    .insert(table)
    .values(values as never)
    .returning({ id: table.id });
  if (!created) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The entry could not be saved." });
  }
  return created.id;
}
