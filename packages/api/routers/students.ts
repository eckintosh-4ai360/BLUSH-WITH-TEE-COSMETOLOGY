import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  certificates,
  courses,
  enrollments,
  feeCharges,
  people,
  studentProfiles,
} from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { buildReference } from "../platform.utils";
import { recordAudit } from "../services/audit";
import { announce } from "../services/messaging/announce";
import { flushInBackground } from "../services/messaging/dispatch";
import {
  listInputSchema,
  likePattern,
  paginate,
  paginationBounds,
} from "../services/pagination";
import {
  findStudentAccountForEmail,
  grantStudentRole,
  resolvePerson,
} from "../services/people";
import { money } from "../services/money";
import { permissionProcedure, router } from "../trpc";

const STUDENT_STATUS = [
  "active",
  "suspended",
  "completed",
  "graduated",
  "withdrawn",
] as const;

/** Whether a student holds any enrolment at all - the "not yet enrolled" cohort. */
const ENROLMENT_FILTER = ["enrolled", "unenrolled"] as const;

export const studentsRouter = router({
  /** The student register, paginated, searched and filtered server-side (§43). */
  list: permissionProcedure("students.read")
    .input(
      listInputSchema.extend({
        status: z.enum(STUDENT_STATUS).optional(),
        courseId: z.number().int().positive().optional(),
        enrolment: z.enum(ENROLMENT_FILTER).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      // Programme and enrolment filters ask a question about a student's
      // enrolments, not about a joined row - EXISTS keeps one row per student
      // so the page count stays honest however many programmes they hold.
      const enrolmentOf = (extra?: SQL) =>
        db
          .select({ one: sql`1` })
          .from(enrollments)
          .where(and(eq(enrollments.studentId, studentProfiles.id), extra));

      const where = and(
        isNull(studentProfiles.deletedAt),
        // Graduates keep their record but leave this register - they are read
        // from `graduates` instead. Asking for them by name in the status
        // filter still works, so nobody is ever hidden from a direct question.
        input.status
          ? eq(studentProfiles.status, input.status)
          : ne(studentProfiles.status, "graduated"),
        input.courseId
          ? exists(enrolmentOf(eq(enrollments.courseId, input.courseId)))
          : undefined,
        input.enrolment === "enrolled" ? exists(enrolmentOf()) : undefined,
        input.enrolment === "unenrolled" ? notExists(enrolmentOf()) : undefined,
        input.search
          ? or(
              ilike(studentProfiles.fullName, likePattern(input.search)),
              ilike(studentProfiles.studentNumber, likePattern(input.search)),
              ilike(studentProfiles.email, likePattern(input.search)),
              ilike(studentProfiles.phone, likePattern(input.search))
            )
          : undefined
      );

      const [students, [total]] = await Promise.all([
        db
          .select()
          .from(studentProfiles)
          .where(where)
          .orderBy(desc(studentProfiles.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(studentProfiles).where(where),
      ]);

      // Enrolments are fetched for the page only, so a large register costs the
      // same as a small one.
      const ids = students.map(student => student.id);
      const programmes = ids.length
        ? await db
            .select({
              id: enrollments.id,
              studentId: enrollments.studentId,
              courseId: enrollments.courseId,
              courseTitle: courses.title,
              status: enrollments.status,
              progressPercent: enrollments.progressPercent,
            })
            .from(enrollments)
            .innerJoin(courses, eq(enrollments.courseId, courses.id))
            .where(inArray(enrollments.studentId, ids))
            .orderBy(desc(enrollments.enrolledAt))
        : [];

      return paginate(
        students.map(student => ({
          ...student,
          programmes: programmes.filter(
            programme => programme.studentId === student.id
          ),
        })),
        Number(total?.total ?? 0),
        input
      );
    }),

  /**
   * Adds a student directly, without an application.
   *
   * Approving an application is still the main route in (§21) and produces the
   * same record. This exists for the students who never went through the form:
   * a walk-in enrolled at the desk, or a register being typed up from paper.
   *
   * Two things it does that a bare insert would not. It goes through
   * `resolvePerson`, so somebody already known to the school as a customer
   * becomes the same person rather than a second one (§34). And it links an
   * existing portal account with the same email and grants it the student
   * role, so the student can sign in without anybody wiring it up afterwards.
   */
  create: permissionProcedure("students.write")
    .input(
      z.object({
        fullName: z.string().trim().min(2).max(160),
        email: z.string().trim().email().max(320),
        phone: z.string().trim().min(7).max(40),
        studentNumber: z.string().trim().max(40).optional(),
        status: z.enum(STUDENT_STATUS).default("active"),
        gender: z.string().trim().max(32).optional(),
        birthDate: z.coerce.date().optional(),
        address: z.string().trim().max(1500).optional(),
        emergencyContactName: z.string().trim().max(160).optional(),
        emergencyContactPhone: z.string().trim().max(40).optional(),
        /** Enrols on a programme straight away. Optional. */
        courseId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const email = input.email.toLowerCase();

      // An archived student still holds their email, and refusing on it is
      // right - re-adding somebody would open a second record rather than
      // bring back the one with all their history on it. What matters is that
      // the message says which of the two situations this is, because they
      // need different things done about them and only one of them is visible
      // in the register.
      const [duplicate] = await db
        .select({
          studentNumber: studentProfiles.studentNumber,
          deletedAt: studentProfiles.deletedAt,
        })
        .from(studentProfiles)
        .where(sql`lower(${studentProfiles.email}) = ${email}`)
        .limit(1);
      if (duplicate) {
        throw new TRPCError({
          code: "CONFLICT",
          message: duplicate.deletedAt
            ? `That email belongs to ${duplicate.studentNumber}, who was removed from the register. Ask an administrator to restore them rather than adding them again.`
            : `A student with that email is already on file as ${duplicate.studentNumber}.`,
        });
      }

      if (input.studentNumber) {
        const [taken] = await db
          .select({ id: studentProfiles.id })
          .from(studentProfiles)
          .where(eq(studentProfiles.studentNumber, input.studentNumber))
          .limit(1);
        if (taken) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Student number ${input.studentNumber} already belongs to another student.`,
          });
        }
      }

      if (input.courseId) {
        const [course] = await db
          .select({ id: courses.id })
          .from(courses)
          .where(and(eq(courses.id, input.courseId), eq(courses.isActive, true)))
          .limit(1);
        if (!course) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That programme is unavailable." });
        }
      }

      return db.transaction(async tx => {
        const personId = await resolvePerson(tx, {
          fullName: input.fullName,
          email,
          phone: input.phone,
          birthDate: input.birthDate ?? null,
          gender: input.gender ?? null,
          address: input.address ?? null,
          emergencyContactName: input.emergencyContactName ?? null,
          emergencyContactPhone: input.emergencyContactPhone ?? null,
        });

        // Only links an account that already exists; it never creates one, so
        // no password is invented on the student's behalf.
        const accountId = await findStudentAccountForEmail(tx, email);

        const studentNumber = input.studentNumber || buildReference("STU");

        const [student] = await tx
          .insert(studentProfiles)
          .values({
            personId,
            userId: accountId,
            studentNumber,
            fullName: input.fullName,
            email,
            phone: input.phone,
            status: input.status,
          })
          .returning({ id: studentProfiles.id });

        if (!student?.id) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "The student could not be created.",
          });
        }

        if (accountId) await grantStudentRole(tx, accountId);

        if (input.courseId) {
          await tx.insert(enrollments).values({
            studentId: student.id,
            courseId: input.courseId,
            status: "active",
          });
        }

        await recordAudit(tx, ctx.actor, {
          action: "create",
          entity: "studentProfile",
          entityId: student.id,
          entityLabel: studentNumber,
          newValue: { fullName: input.fullName, email, status: input.status },
          summary: `${ctx.actor.name ?? "Staff"} added ${input.fullName} as ${studentNumber}`,
        });

        return { id: student.id, studentNumber, linkedAccount: Boolean(accountId) };
      });
    }),

  /**
   * One student's full record, profile and identity together.
   *
   * The register only carries what the table shows. Editing needs the rest -
   * date of birth, address, next of kin - and those live on the shared `people`
   * row rather than on the profile, so they are read back here rather than
   * being dropped from the form because nobody fetched them.
   */
  get: permissionProcedure("students.read")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const [row] = await db
        .select({
          id: studentProfiles.id,
          studentNumber: studentProfiles.studentNumber,
          fullName: studentProfiles.fullName,
          email: studentProfiles.email,
          phone: studentProfiles.phone,
          status: studentProfiles.status,
          userId: studentProfiles.userId,
          gender: people.gender,
          birthDate: people.birthDate,
          address: people.address,
          emergencyContactName: people.emergencyContactName,
          emergencyContactPhone: people.emergencyContactPhone,
        })
        .from(studentProfiles)
        .leftJoin(people, eq(studentProfiles.personId, people.id))
        .where(and(eq(studentProfiles.id, input.id), isNull(studentProfiles.deletedAt)))
        .limit(1);

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That student is not on file." });
      }

      return row;
    }),

  /**
   * Corrects a student's details.
   *
   * A profile and the person behind it are two rows, and both have to move
   * together or the register and the rest of the school disagree about who
   * somebody is (§34). The person row is updated in place rather than being
   * re-resolved from the new contact details: `resolvePerson` is a matcher, and
   * on an edit it would happily attach this student to whoever already owns the
   * corrected email instead of correcting their own record.
   *
   * That makes the email checks the important part of this procedure. Both the
   * student register and the `people` table refuse duplicates, so a clash is
   * caught here and explained rather than surfacing as a constraint violation.
   */
  update: permissionProcedure("students.write")
    .input(
      z.object({
        id: z.number().int().positive(),
        fullName: z.string().trim().min(2).max(160),
        email: z.string().trim().email().max(320),
        phone: z.string().trim().min(7).max(40),
        studentNumber: z.string().trim().min(1).max(40),
        status: z.enum(STUDENT_STATUS),
        gender: z.string().trim().max(32).optional(),
        birthDate: z.coerce.date().optional(),
        address: z.string().trim().max(1500).optional(),
        emergencyContactName: z.string().trim().max(160).optional(),
        emergencyContactPhone: z.string().trim().max(40).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const email = input.email.toLowerCase();

      const [existing] = await db
        .select()
        .from(studentProfiles)
        .where(and(eq(studentProfiles.id, input.id), isNull(studentProfiles.deletedAt)))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That student is not on file." });
      }

      const [emailTaken] = await db
        .select({ studentNumber: studentProfiles.studentNumber })
        .from(studentProfiles)
        .where(
          and(
            sql`lower(${studentProfiles.email}) = ${email}`,
            ne(studentProfiles.id, input.id),
            isNull(studentProfiles.deletedAt),
          ),
        )
        .limit(1);
      if (emailTaken) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `That email is already on file for ${emailTaken.studentNumber}.`,
        });
      }

      if (input.studentNumber !== existing.studentNumber) {
        const [numberTaken] = await db
          .select({ id: studentProfiles.id })
          .from(studentProfiles)
          .where(
            and(
              eq(studentProfiles.studentNumber, input.studentNumber),
              ne(studentProfiles.id, input.id),
            ),
          )
          .limit(1);
        if (numberTaken) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Student number ${input.studentNumber} already belongs to another student.`,
          });
        }
      }

      // The same email can only belong to one live person, and that person may
      // be known to the school in another capacity entirely - a customer, or a
      // supplier contact. Merging two people is not something an edit should
      // decide on its own, so it is refused with the reason.
      if (existing.personId) {
        const [personClash] = await db
          .select({ fullName: people.fullName })
          .from(people)
          .where(
            and(
              sql`lower(${people.email}) = ${email}`,
              ne(people.id, existing.personId),
              isNull(people.deletedAt),
            ),
          )
          .limit(1);
        if (personClash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `That email already belongs to ${personClash.fullName} elsewhere in the school's records.`,
          });
        }
      }

      // Only stamped on the way into "graduated", and cleared on the way back
      // out, so the date always means the graduation currently on record.
      const graduatedAt =
        input.status === "graduated" ? (existing.graduatedAt ?? new Date()) : null;

      return db.transaction(async tx => {
        const [updated] = await tx
          .update(studentProfiles)
          .set({
            fullName: input.fullName,
            email,
            phone: input.phone,
            studentNumber: input.studentNumber,
            status: input.status,
            graduatedAt,
            updatedAt: new Date(),
          })
          .where(eq(studentProfiles.id, input.id))
          .returning();

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "The student could not be updated.",
          });
        }

        if (existing.personId) {
          // An emptied optional field means "remove this", not "leave it
          // alone" - the form always sends every field it owns.
          await tx
            .update(people)
            .set({
              fullName: input.fullName,
              email,
              phone: input.phone,
              gender: input.gender || null,
              birthDate: input.birthDate ?? null,
              address: input.address || null,
              emergencyContactName: input.emergencyContactName || null,
              emergencyContactPhone: input.emergencyContactPhone || null,
              updatedAt: new Date(),
            })
            .where(eq(people.id, existing.personId));
        }

        await recordAudit(tx, ctx.actor, {
          action: "update",
          entity: "studentProfile",
          entityId: updated.id,
          entityLabel: updated.studentNumber,
          oldValue: {
            fullName: existing.fullName,
            email: existing.email,
            phone: existing.phone,
            studentNumber: existing.studentNumber,
            status: existing.status,
          },
          newValue: {
            fullName: updated.fullName,
            email: updated.email,
            phone: updated.phone,
            studentNumber: updated.studentNumber,
            status: updated.status,
          },
          summary: `${ctx.actor.name ?? "Staff"} updated ${updated.fullName} (${updated.studentNumber})`,
        });

        return { id: updated.id, studentNumber: updated.studentNumber };
      });
    }),

  /**
   * The graduates register.
   *
   * Everyone whose studies are finished, kept apart from the students still
   * being taught. It is the same `studentProfiles` row throughout - graduating
   * moves a student between the two lists rather than copying them into a
   * second table, so their fees, results and certificates stay attached to the
   * one record and nothing has to be reconciled afterwards.
   */
  graduates: permissionProcedure("students.read")
    .input(
      listInputSchema.extend({
        courseId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        isNull(studentProfiles.deletedAt),
        eq(studentProfiles.status, "graduated"),
        input.courseId
          ? exists(
              db
                .select({ one: sql`1` })
                .from(enrollments)
                .where(
                  and(
                    eq(enrollments.studentId, studentProfiles.id),
                    eq(enrollments.courseId, input.courseId),
                  ),
                ),
            )
          : undefined,
        input.dateFrom ? gte(studentProfiles.graduatedAt, input.dateFrom) : undefined,
        input.dateTo ? lte(studentProfiles.graduatedAt, input.dateTo) : undefined,
        input.search
          ? or(
              ilike(studentProfiles.fullName, likePattern(input.search)),
              ilike(studentProfiles.studentNumber, likePattern(input.search)),
              ilike(studentProfiles.email, likePattern(input.search)),
              ilike(studentProfiles.phone, likePattern(input.search)),
            )
          : undefined,
      );

      const [rows, [total]] = await Promise.all([
        db
          .select()
          .from(studentProfiles)
          .where(where)
          // A record graduated before this register existed can carry no date;
          // it belongs at the end of the list rather than the top of it.
          .orderBy(sql`${studentProfiles.graduatedAt} desc nulls last`)
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(studentProfiles).where(where),
      ]);

      // Programmes and awards are read for the page only, the same way the
      // student register does it.
      const ids = rows.map(row => row.id);
      const [programmes, awards] = ids.length
        ? await Promise.all([
            db
              .select({
                id: enrollments.id,
                studentId: enrollments.studentId,
                courseId: enrollments.courseId,
                courseTitle: courses.title,
                status: enrollments.status,
                completedAt: enrollments.completedAt,
              })
              .from(enrollments)
              .innerJoin(courses, eq(enrollments.courseId, courses.id))
              .where(inArray(enrollments.studentId, ids))
              .orderBy(desc(enrollments.enrolledAt)),
            db
              .select({
                id: certificates.id,
                studentId: certificates.studentId,
                certificateNumber: certificates.certificateNumber,
                courseTitle: courses.title,
                finalGrade: certificates.finalGrade,
              })
              .from(certificates)
              .innerJoin(courses, eq(certificates.courseId, courses.id))
              .where(and(inArray(certificates.studentId, ids), eq(certificates.status, "issued")))
              .orderBy(desc(certificates.issuedAt)),
          ])
        : [[], []];

      return paginate(
        rows.map(row => ({
          ...row,
          programmes: programmes.filter(programme => programme.studentId === row.id),
          certificates: awards.filter(award => award.studentId === row.id),
        })),
        Number(total?.total ?? 0),
        input,
      );
    }),

  /**
   * Graduates a student.
   *
   * Three things happen together, because leaving any of them out puts the
   * records in a state somebody has to notice and repair by hand. The student
   * moves to the graduates register; every programme they were still on is
   * closed as completed, which is also what makes them eligible for a
   * certificate (§37); and they are told.
   *
   * Two refusals. Somebody who was never enrolled has nothing to graduate
   * from - that is a data-entry mistake rather than a graduation. And a
   * student who still owes money is refused for the same reason removing them
   * is: writing off a debt is a finance decision, and it should not happen as
   * a side effect of a ceremony.
   */
  graduate: permissionProcedure("students.write")
    .input(
      z.object({
        id: z.number().int().positive(),
        /** The ceremony date, when it was not today. */
        graduatedAt: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [student] = await db
        .select()
        .from(studentProfiles)
        .where(and(eq(studentProfiles.id, input.id), isNull(studentProfiles.deletedAt)))
        .limit(1);

      if (!student) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That student is not on file." });
      }

      if (student.status === "graduated") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${student.fullName} has already graduated.`,
        });
      }

      if (student.status === "withdrawn") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${student.fullName} withdrew from the school. Put them back on the register before graduating them.`,
        });
      }

      const graduatedAt = input.graduatedAt ?? new Date();
      if (graduatedAt.getTime() > Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A graduation date cannot be in the future.",
        });
      }

      const enrolments = await db
        .select({
          id: enrollments.id,
          status: enrollments.status,
          courseTitle: courses.title,
        })
        .from(enrollments)
        .innerJoin(courses, eq(enrollments.courseId, courses.id))
        .where(eq(enrollments.studentId, input.id));

      if (!enrolments.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${student.fullName} has never been enrolled on a programme, so there is nothing to graduate from.`,
        });
      }

      const outstanding = await outstandingBalance(db, input.id);
      if (outstanding > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${student.fullName} still owes GHS ${outstanding.toFixed(2)}. Settle or waive the balance before graduating them.`,
        });
      }

      // Paused counts as open here: graduation closes the student's file, and
      // a programme left half-finished behind them would keep them counted
      // among the people still being taught.
      const open = enrolments.filter(
        enrolment => enrolment.status === "active" || enrolment.status === "paused",
      );

      const result = await db.transaction(async tx => {
        await tx
          .update(studentProfiles)
          .set({ status: "graduated", graduatedAt, updatedAt: new Date() })
          .where(eq(studentProfiles.id, input.id));

        if (open.length) {
          await tx
            .update(enrollments)
            .set({ status: "completed", completedAt: graduatedAt, progressPercent: 100 })
            .where(
              inArray(
                enrollments.id,
                open.map(enrolment => enrolment.id),
              ),
            );
        }

        await recordAudit(tx, ctx.actor, {
          action: "graduate",
          entity: "studentProfile",
          entityId: student.id,
          entityLabel: student.studentNumber,
          oldValue: { status: student.status },
          newValue: {
            status: "graduated",
            graduatedAt,
            completedProgrammes: open.map(enrolment => enrolment.courseTitle),
          },
          summary: `${ctx.actor.name ?? "Staff"} graduated ${student.fullName} (${student.studentNumber})`,
        });

        await announce(tx, {
          type: "general",
          recipient: {
            name: student.fullName,
            email: student.email,
            phone: student.phone,
            userId: student.userId,
          },
          title: "Congratulations on your graduation",
          body: "Your studies are complete. Your certificate appears in your portal once it has been issued.",
          facts: {
            reference: student.studentNumber,
            course: enrolments.map(enrolment => enrolment.courseTitle).join(", "),
          },
          entityType: "studentProfile",
          entityId: student.id,
          link: "/portal",
        });

        return {
          id: student.id,
          studentNumber: student.studentNumber,
          fullName: student.fullName,
          completedProgrammes: open.length,
        };
      });

      // After the commit: the congratulations must describe a graduation that
      // is actually on file.
      flushInBackground(db);
      return result;
    }),

  /**
   * Puts a graduate back on the student register.
   *
   * The undo for a graduation recorded against the wrong person. Completed
   * enrolments are left completed - a graduate who genuinely returns to study
   * is a new enrolment rather than an old one reopened, and it carries its own
   * fees.
   */
  reinstate: permissionProcedure("students.write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [student] = await db
        .select()
        .from(studentProfiles)
        .where(and(eq(studentProfiles.id, input.id), isNull(studentProfiles.deletedAt)))
        .limit(1);

      if (!student) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That student is not on file." });
      }

      if (student.status !== "graduated") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${student.fullName} is already on the student register.`,
        });
      }

      return db.transaction(async tx => {
        await tx
          .update(studentProfiles)
          .set({ status: "active", graduatedAt: null, updatedAt: new Date() })
          .where(eq(studentProfiles.id, input.id));

        await recordAudit(tx, ctx.actor, {
          action: "update",
          entity: "studentProfile",
          entityId: student.id,
          entityLabel: student.studentNumber,
          oldValue: { status: "graduated", graduatedAt: student.graduatedAt },
          newValue: { status: "active", graduatedAt: null },
          summary: `${ctx.actor.name ?? "Staff"} returned ${student.fullName} (${student.studentNumber}) to the student register`,
        });

        return { id: student.id, studentNumber: student.studentNumber };
      });
    }),

  /**
   * Removes a student from the register.
   *
   * Soft, and deliberately so. Fee charges, adjustments, payment plans and
   * enrolments all cascade off this row, and payments merely point at it - a
   * real DELETE would take a student's entire fee history with them, or orphan
   * the money that was actually received. Setting `deletedAt` takes them out of
   * every list, count and export, all of which already filter on it, while
   * leaving the books intact.
   *
   * A student who still owes money is refused: writing off a debt is a finance
   * decision, and it should not happen as a side effect of tidying the
   * register.
   */
  archive: permissionProcedure("students.write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [existing] = await db
        .select()
        .from(studentProfiles)
        .where(and(eq(studentProfiles.id, input.id), isNull(studentProfiles.deletedAt)))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That student is not on file." });
      }

      const outstanding = await outstandingBalance(db, input.id);
      if (outstanding > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${existing.fullName} still owes GHS ${outstanding.toFixed(2)}. Settle or write off the balance before removing them.`,
        });
      }

      return db.transaction(async tx => {
        await tx
          .update(studentProfiles)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(studentProfiles.id, input.id));

        await recordAudit(tx, ctx.actor, {
          action: "delete",
          entity: "studentProfile",
          entityId: existing.id,
          entityLabel: existing.studentNumber,
          oldValue: {
            fullName: existing.fullName,
            email: existing.email,
            status: existing.status,
          },
          summary: `${ctx.actor.name ?? "Staff"} removed ${existing.fullName} (${existing.studentNumber}) from the register`,
        });

        return { id: existing.id, studentNumber: existing.studentNumber };
      });
    }),
});


/**
 * What a student still owes, across every fee charge on their account.
 *
 * Billed and paid are summed separately and reduced to money the same way the
 * fees-owed report does it, so no two places disagree about whether a student
 * is clear. Both graduating and removing a student ask this question.
 */
async function outstandingBalance(
  db: Awaited<ReturnType<typeof dbOrThrow>>,
  studentId: number,
): Promise<number> {
  const [owing] = await db
    .select({
      billed: sql<string>`coalesce(sum(${feeCharges.amountDue}), 0)`,
      paid: sql<string>`coalesce(sum(${feeCharges.amountPaid}), 0)`,
    })
    .from(feeCharges)
    .where(eq(feeCharges.studentId, studentId));

  return money(owing?.billed) - money(owing?.paid);
}
