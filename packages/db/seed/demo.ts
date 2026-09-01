/**
 * Demo data for development (§73, §74).
 *
 * The point is a dashboard that reads like a real school on first open: a year
 * of revenue and spend, a mixed student roster, orders at every stage, stock
 * that has actually moved. Every figure is written as a real transaction with
 * a matching ledger line, so the numbers on screen are computed exactly the
 * way they will be in production.
 *
 * Two properties this script must keep:
 *
 *   Resumable - every entity is keyed (student number, order number, SKU) and
 *   skipped if already present, so a re-run tops up rather than duplicating.
 *
 *   Batched - rows are accumulated in memory and inserted in chunks. Seeding a
 *   remote database one row at a time is thousands of round trips and does not
 *   finish.
 *
 * Never runs in production: `seedDemoData` refuses when NODE_ENV says so, and
 * the accounts below are development-only fixtures with no real credentials.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
// Imported by path rather than as `@blush/auth`: this package sits below auth,
// and declaring the dependency would put a cycle in the workspace task graph.
// `password.ts` pulls in nothing but node:crypto, so the module graph stays acyclic.
import { hashPassword } from "../../auth/password";
import type { getDb } from "../index";
import {
  applications,
  assessmentResults,
  assessments,
  attendanceRecords,
  classSessions,
  classes,
  courseModules,
  courses,
  customers,
  enrollments,
  expenses,
  faqs,
  feeCharges,
  feeStructures,
  galleryItems,
  intakes,
  inventoryItems,
  inventoryMovements,
  orderItems,
  orderStatusEvents,
  paymentAllocations,
  payments,
  people,
  productCategories,
  purchaseOrderItems,
  purchaseOrders,
  revenueTransactions,
  staffProfiles,
  storeOrders,
  studentProfiles,
  suppliers,
  testimonials,
  users,
} from "../schema";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Seeded PRNG, so a reseed produces the same demo school every time. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = makeRandom(20260822);

const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(random() * items.length)]!;
const between = (min: number, max: number) =>
  Math.floor(random() * (max - min + 1)) + min;
const cash = (minor: number) => (minor / 100).toFixed(2);
const amountBetween = (min: number, max: number) =>
  cash(between(min * 100, max * 100));

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(between(8, 18), between(0, 59), 0, 0);
  return date;
}

function dateOnly(days: number): Date {
  const date = daysAgo(days);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

const YEAR = new Date().getFullYear();
const reference = (prefix: string, index: number) =>
  `${prefix}-${YEAR}-${String(index).padStart(5, "0")}`;

const slugOf = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Inserts in chunks so a large batch stays inside driver parameter limits. */
async function insertChunked<T>(
  run: (rows: T[]) => Promise<unknown>,
  rows: T[],
  size = 150
): Promise<number> {
  for (let index = 0; index < rows.length; index += size) {
    const chunk = rows.slice(index, index + size);
    if (chunk.length) await run(chunk);
  }
  return rows.length;
}

const FIRST_NAMES = [
  "Ama",
  "Akosua",
  "Efua",
  "Abena",
  "Adwoa",
  "Yaa",
  "Afia",
  "Esi",
  "Nana",
  "Akua",
  "Kwabena",
  "Kofi",
  "Yaw",
  "Kwame",
  "Kojo",
  "Kwaku",
  "Kwesi",
  "Mariam",
  "Zainab",
  "Grace",
  "Priscilla",
  "Sandra",
  "Linda",
  "Gifty",
  "Naa",
  "Rita",
  "Doris",
  "Vida",
  "Comfort",
  "Patience",
];

const LAST_NAMES = [
  "Mensah",
  "Owusu",
  "Boateng",
  "Asante",
  "Agyeman",
  "Darko",
  "Osei",
  "Appiah",
  "Ansah",
  "Frimpong",
  "Adjei",
  "Amoah",
  "Baidoo",
  "Quaye",
  "Tetteh",
  "Lartey",
  "Nartey",
  "Sarpong",
];

const personName = (index: number) =>
  `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[(index * 7) % LAST_NAMES.length]}`;

const MODULE_TITLES = [
  "Salon hygiene and client care",
  "Consultation and skin analysis",
  "Core practical technique",
  "Advanced finishing",
  "Business of beauty",
];

/* -------------------------------------------------------------------------- */
/* Seeding                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The password every seeded demo student signs in with.
 *
 * Safe to keep in the repository: `seedDemoData` refuses to run when NODE_ENV
 * says production, so these accounts only ever exist in a development database.
 */
export const DEMO_STUDENT_PASSWORD = "blush@student2026";

export type DemoSeedResult = Record<string, number>;

export async function seedDemoData(db: Database): Promise<DemoSeedResult> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo data must never be seeded into production.");
  }

  const counts: DemoSeedResult = {};

  const courseRows = await db.select().from(courses);
  if (!courseRows.length)
    throw new Error("Run initializeFoundationData before seeding demo data.");

  await db
    .update(courses)
    .set({
      slug: sql`lower(regexp_replace(${courses.title}, '[^a-zA-Z0-9]+', '-', 'g'))`,
    })
    .where(sql`${courses.slug} is null`);

  /* --- Course modules --------------------------------------------------- */

  counts.courseModules = await insertChunked(
    rows => db.insert(courseModules).values(rows).onConflictDoNothing(),
    courseRows.flatMap(course =>
      MODULE_TITLES.map((title, index) => ({
        courseId: course.id,
        code: `${course.code}-M${index + 1}`,
        title,
        description: `${title} for ${course.title}.`,
        sequence: index + 1,
        durationHours: between(8, 40),
      }))
    )
  );

  /* --- Intakes ---------------------------------------------------------- */

  let intakeRows = await db
    .select({ id: intakes.id, courseId: intakes.courseId })
    .from(intakes);
  if (!intakeRows.length) {
    await db.insert(intakes).values(
      courseRows.flatMap(course =>
        [240, 120, -30].map((offset, index) => ({
          courseId: course.id,
          title: `${course.title} intake ${index + 1}`,
          startDate: dateOnly(offset),
          applicationDeadline: dateOnly(offset + 21),
          capacity: between(12, 28),
          status: offset < 0 ? ("open" as const) : ("completed" as const),
        }))
      )
    );
    intakeRows = await db
      .select({ id: intakes.id, courseId: intakes.courseId })
      .from(intakes);
  }
  counts.intakes = intakeRows.length;

  /* --- Staff ------------------------------------------------------------ */

  const staffSeed = [
    {
      name: "Tee Adjei",
      position: "Principal",
      role: "admin" as const,
      salary: "6500.00",
    },
    {
      name: "Naa Lartey",
      position: "Lead Instructor",
      role: "staff" as const,
      salary: "3800.00",
    },
    {
      name: "Kwesi Boateng",
      position: "Accountant",
      role: "staff" as const,
      salary: "3200.00",
    },
    {
      name: "Adwoa Sarpong",
      position: "Storekeeper",
      role: "staff" as const,
      salary: "2400.00",
    },
    {
      name: "Efua Nartey",
      position: "E-commerce Manager",
      role: "staff" as const,
      salary: "2900.00",
    },
  ];

  const existingStaffUsers = await db
    .select({ id: users.id, openId: users.openId })
    .from(users)
    .where(
      inArray(
        users.openId,
        staffSeed.map((_, index) => `demo-staff-${index}`)
      )
    );
  const staffUserByOpenId = new Map(
    existingStaffUsers.map(row => [row.openId, row.id])
  );

  if (staffUserByOpenId.size < staffSeed.length) {
    const staffPeople = await db
      .insert(people)
      .values(
        staffSeed.map((member, index) => ({
          fullName: member.name,
          email: `${slugOf(member.name)}@blushwithtee.test`,
          phone: `+23320${String(400000 + index)}`,
        }))
      )
      .onConflictDoNothing()
      .returning({ id: people.id, email: people.email });

    const personByEmail = new Map(staffPeople.map(row => [row.email, row.id]));

    const created = await db
      .insert(users)
      .values(
        staffSeed.map((member, index) => ({
          openId: `demo-staff-${index}`,
          personId: personByEmail.get(
            `${slugOf(member.name)}@blushwithtee.test`
          ),
          name: member.name,
          email: `${slugOf(member.name)}@blushwithtee.test`,
          role: member.role,
          loginMethod: "demo",
        }))
      )
      .onConflictDoNothing()
      .returning({ id: users.id, openId: users.openId });

    for (const row of created) staffUserByOpenId.set(row.openId, row.id);

    await db
      .insert(staffProfiles)
      .values(
        staffSeed
          .map((member, index) => {
            const userId = staffUserByOpenId.get(`demo-staff-${index}`);
            if (!userId) return null;
            return {
              userId,
              personId: personByEmail.get(
                `${slugOf(member.name)}@blushwithtee.test`
              ),
              staffNumber: `STAFF-${String(index + 1).padStart(3, "0")}`,
              position: member.position,
              email: `${slugOf(member.name)}@blushwithtee.test`,
              phone: `+23320${String(400000 + index)}`,
              employmentDate: dateOnly(between(200, 900)),
              salary: member.salary,
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null)
      )
      .onConflictDoNothing();
  }

  const staffUserIds = staffSeed
    .map((_, index) => staffUserByOpenId.get(`demo-staff-${index}`))
    .filter((id): id is number => typeof id === "number");
  counts.staff = staffUserIds.length;

  const instructorUserId = staffUserIds[1] ?? staffUserIds[0] ?? null;
  const accountantUserId = staffUserIds[2] ?? staffUserIds[0] ?? null;
  const storekeeperUserId = staffUserIds[3] ?? staffUserIds[0] ?? null;

  /* --- Classes and their dated sessions --------------------------------- */

  let classRows = await db
    .select({ id: classes.id, courseId: classes.courseId })
    .from(classes);
  if (!classRows.length) {
    await db.insert(classes).values(
      courseRows.map(course => ({
        courseId: course.id,
        intakeId: intakeRows.find(row => row.courseId === course.id)?.id,
        instructorUserId,
        title: `${course.title} - main cohort`,
        room: `Studio ${between(1, 4)}`,
        dayOfWeek: between(1, 5),
        startsAt: "09:00:00",
        endsAt: "13:00:00",
        status: "active" as const,
      }))
    );
    classRows = await db
      .select({ id: classes.id, courseId: classes.courseId })
      .from(classes);
  }
  counts.classes = classRows.length;

  // Sessions belong to the class, not the student - create them once.
  const SESSION_COUNT = 12;
  let sessionRows = await db
    .select({
      id: classSessions.id,
      classId: classSessions.classId,
      sessionDate: classSessions.sessionDate,
    })
    .from(classSessions);

  if (sessionRows.length < classRows.length * SESSION_COUNT) {
    await insertChunked(
      rows => db.insert(classSessions).values(rows).onConflictDoNothing(),
      classRows.flatMap(classRow =>
        Array.from({ length: SESSION_COUNT }, (_, index) => ({
          classId: classRow.id,
          sessionDate: dateOnly(index * 7 + 3),
          topic: pick(MODULE_TITLES),
          recordedByUserId: instructorUserId,
        }))
      )
    );
    sessionRows = await db
      .select({
        id: classSessions.id,
        classId: classSessions.classId,
        sessionDate: classSessions.sessionDate,
      })
      .from(classSessions);
  }
  counts.classSessions = sessionRows.length;

  const sessionsByClass = new Map<number, typeof sessionRows>();
  for (const session of sessionRows) {
    const list = sessionsByClass.get(session.classId) ?? [];
    list.push(session);
    sessionsByClass.set(session.classId, list);
  }

  /* --- Assessments ------------------------------------------------------ */

  let assessmentRows = await db
    .select({ id: assessments.id, courseId: assessments.courseId })
    .from(assessments);

  if (assessmentRows.length < courseRows.length * 2) {
    await db.insert(assessments).values(
      courseRows.flatMap(course =>
        [
          { title: "Theory examination", type: "theory" as const },
          { title: "Practical assessment", type: "practical" as const },
        ].map(config => ({
          courseId: course.id,
          title: config.title,
          assessmentType: config.type,
          totalScore: 100,
          dueDate: dateOnly(between(10, 90)),
          createdByUserId: instructorUserId,
        }))
      )
    );
    assessmentRows = await db
      .select({ id: assessments.id, courseId: assessments.courseId })
      .from(assessments);
  }
  counts.assessments = assessmentRows.length;

  /* --- Fee structures --------------------------------------------------- */

  const existingStructures = await db.select().from(feeStructures);
  if (!existingStructures.length) {
    await db.insert(feeStructures).values(
      courseRows.flatMap(course => [
        {
          courseId: course.id,
          intakeId: null,
          feeType: "registration" as const,
          label: "Registration fee",
          amount: "150.00",
          dueOffsetDays: 0,
        },
        {
          courseId: course.id,
          intakeId: null,
          feeType: "tuition" as const,
          label: "Course tuition",
          amount: Number(course.tuition).toFixed(2),
          dueOffsetDays: 30,
        },
        {
          courseId: course.id,
          intakeId: null,
          feeType: "materials" as const,
          label: "Materials and kit",
          amount: "320.00",
          dueOffsetDays: 14,
        },
        {
          courseId: course.id,
          intakeId: null,
          feeType: "exam" as const,
          label: "Examination fee",
          amount: "180.00",
          dueOffsetDays: 90,
        },
      ])
    );
  }
  const structureRows = await db.select().from(feeStructures);
  counts.feeStructures = structureRows.length;

  const structuresByCourse = new Map<number, typeof structureRows>();
  for (const structure of structureRows) {
    if (structure.courseId == null) continue;
    const list = structuresByCourse.get(structure.courseId) ?? [];
    list.push(structure);
    structuresByCourse.set(structure.courseId, list);
  }

  /* --- Applications and students ---------------------------------------- */

  const STUDENT_COUNT = 42;
  const STATUSES = [
    "active",
    "active",
    "active",
    "active",
    "graduated",
    "suspended",
    "completed",
    "withdrawn",
  ] as const;

  const existingStudents = await db
    .select({ studentNumber: studentProfiles.studentNumber })
    .from(studentProfiles)
    .where(sql`${studentProfiles.studentNumber} like 'STU-DEMO-%'`);
  const takenStudentNumbers = new Set(
    existingStudents.map(row => row.studentNumber)
  );

  const existingApplications = await db
    .select({ reference: applications.reference })
    .from(applications)
    .where(sql`${applications.reference} like ${`APP-${YEAR}-%`}`);
  const takenApplicationRefs = new Set(
    existingApplications.map(row => row.reference)
  );

  let paymentIndex =
    (await db.select({ total: sql<number>`count(*)::int` }).from(payments))[0]
      ?.total ?? 0;

  const pendingIndexes: number[] = [];
  const newApplications: Array<Record<string, unknown>> = [];
  const personPayloads: Array<Record<string, unknown>> = [];
  const plannedStudents: Array<{
    index: number;
    name: string;
    email: string;
    phone: string;
    courseId: number;
    intakeId: number | undefined;
    appliedDaysAgo: number;
    status: (typeof STATUSES)[number];
    isPending: boolean;
  }> = [];

  for (let index = 0; index < STUDENT_COUNT; index += 1) {
    const studentNumber = `STU-DEMO-${String(index + 1).padStart(4, "0")}`;
    const applicationRef = reference("APP", index + 1);
    const isPending = index >= STUDENT_COUNT - 8;

    if (
      takenStudentNumbers.has(studentNumber) ||
      takenApplicationRefs.has(applicationRef)
    )
      continue;

    const name = personName(index);
    const email = `${slugOf(name)}.${index}@example.test`;
    const phone = `+23325${String(100000 + index)}`;
    const course = pick(courseRows);
    const intake = intakeRows.find(row => row.courseId === course.id);
    const appliedDaysAgo = between(20, 330);

    personPayloads.push({
      fullName: name,
      email,
      phone,
      whatsapp: phone,
      gender: index % 3 === 0 ? "Male" : "Female",
      birthDate: dateOnly(between(6500, 11000)),
      address: `${between(1, 90)} ${pick(["Tarkwa Banso", "Aboso", "Nsuta", "Tamso", "Bogoso", "Huni Valley"])}, Tarkwa`,
      emergencyContactName: personName(index + 11),
      emergencyContactPhone: `+23326${String(200000 + index)}`,
    });

    plannedStudents.push({
      index,
      name,
      email,
      phone,
      courseId: course.id,
      intakeId: intake?.id,
      appliedDaysAgo,
      status: pick(STATUSES),
      isPending,
    });

    if (isPending) pendingIndexes.push(index);
  }

  if (personPayloads.length) {
    await insertChunked(
      rows => db.insert(people).values(rows).onConflictDoNothing(),
      personPayloads
    );
  }

  const personRows = await db
    .select({ id: people.id, email: people.email })
    .from(people)
    .where(
      inArray(
        people.email,
        plannedStudents.map(student => student.email)
      )
    );
  const personIdByEmail = new Map(personRows.map(row => [row.email, row.id]));

  /* --- Sign-in accounts -------------------------------------------------- */

  // Demo students need real password accounts, otherwise `studentProfiles.userId`
  // stays null and the student portal - which looks a student up by that column
  // - only ever renders its "record is being prepared" empty state.
  const openIdFor = (index: number) => `demo-student-${index}`;

  const existingStudentUsers = await db
    .select({ id: users.id, openId: users.openId })
    .from(users)
    .where(
      inArray(
        users.openId,
        plannedStudents.map(student => openIdFor(student.index))
      )
    );
  const studentUserByOpenId = new Map(
    existingStudentUsers.map(row => [row.openId, row.id])
  );

  const missingAccounts = plannedStudents.filter(
    student => !studentUserByOpenId.has(openIdFor(student.index))
  );

  if (missingAccounts.length) {
    const accountRows: Array<Record<string, unknown>> = [];

    // Hashed one at a time rather than with Promise.all: scrypt is deliberately
    // memory-hard, so running every account at once asks for about a gigabyte.
    for (const student of missingAccounts) {
      accountRows.push({
        openId: openIdFor(student.index),
        personId: personIdByEmail.get(student.email),
        name: student.name,
        email: student.email,
        // Someone still waiting on a decision is an applicant, not a student.
        // Their account is what the portal's empty state is genuinely for.
        role: student.isPending ? ("user" as const) : ("student" as const),
        loginMethod: "password",
        passwordHash: await hashPassword(DEMO_STUDENT_PASSWORD),
        passwordUpdatedAt: new Date(),
        // Demo fixtures, so no change-password wall between you and the portal.
        mustChangePassword: false,
      });
    }

    await insertChunked(
      rows =>
        db
          .insert(users)
          .values(rows as never)
          .onConflictDoNothing(),
      accountRows
    );

    // Read the ids back rather than trusting `returning`, which skips the rows
    // an existing openId conflicted away on a re-run.
    const refreshed = await db
      .select({ id: users.id, openId: users.openId })
      .from(users)
      .where(
        inArray(
          users.openId,
          missingAccounts.map(student => openIdFor(student.index))
        )
      );
    for (const row of refreshed) studentUserByOpenId.set(row.openId, row.id);
  }

  const studentUserId = (index: number) =>
    studentUserByOpenId.get(openIdFor(index)) ?? null;
  counts.studentAccounts = studentUserByOpenId.size;

  for (const student of plannedStudents) {
    newApplications.push({
      reference: reference("APP", student.index + 1),
      personId: personIdByEmail.get(student.email),
      userId: studentUserId(student.index),
      fullName: student.name,
      email: student.email,
      phone: student.phone,
      whatsapp: student.phone,
      courseId: student.courseId,
      intakeId: student.intakeId,
      status: student.isPending
        ? pick([
            "submitted",
            "under_review",
            "more_information",
            "rejected",
          ] as const)
        : ("approved" as const),
      statement:
        "I would like to build a professional career in beauty and cosmetology.",
      submittedAt: daysAgo(student.appliedDaysAgo),
      createdAt: daysAgo(student.appliedDaysAgo),
      reviewedAt: student.isPending
        ? null
        : daysAgo(Math.max(student.appliedDaysAgo - 3, 1)),
    });
  }

  if (newApplications.length) {
    await insertChunked(
      rows =>
        db
          .insert(applications)
          .values(rows as never)
          .onConflictDoNothing(),
      newApplications
    );
  }
  counts.applications = newApplications.length;

  const applicationRows = await db
    .select({ id: applications.id, reference: applications.reference })
    .from(applications)
    .where(sql`${applications.reference} like ${`APP-${YEAR}-%`}`);
  const applicationIdByRef = new Map(
    applicationRows.map(row => [row.reference, row.id])
  );

  const admitted = plannedStudents.filter(student => !student.isPending);

  if (admitted.length) {
    await insertChunked(
      rows =>
        db
          .insert(studentProfiles)
          .values(rows as never)
          .onConflictDoNothing(),
      admitted.map(student => ({
        personId: personIdByEmail.get(student.email),
        userId: studentUserId(student.index),
        applicationId: applicationIdByRef.get(
          reference("APP", student.index + 1)
        ),
        studentNumber: `STU-DEMO-${String(student.index + 1).padStart(4, "0")}`,
        fullName: student.name,
        email: student.email,
        phone: student.phone,
        status: student.status,
        graduatedAt:
          student.status === "graduated" ? daysAgo(between(10, 120)) : null,
        createdAt: daysAgo(Math.max(student.appliedDaysAgo - 5, 1)),
      }))
    );
  }

  const studentRows = await db
    .select({
      id: studentProfiles.id,
      studentNumber: studentProfiles.studentNumber,
    })
    .from(studentProfiles)
    .where(sql`${studentProfiles.studentNumber} like 'STU-DEMO-%'`);
  const studentIdByNumber = new Map(
    studentRows.map(row => [row.studentNumber, row.id])
  );
  counts.students = studentRows.length;

  /* --- Records left without an account ----------------------------------- */

  // A re-run skips any student whose number is already present, so demo rows
  // written before accounts were part of this script would stay unreachable
  // forever. Claiming them here is what makes "top up rather than duplicate"
  // actually true for the portal.
  const unclaimed = await db
    .select({
      id: studentProfiles.id,
      personId: studentProfiles.personId,
      email: studentProfiles.email,
      fullName: studentProfiles.fullName,
      studentNumber: studentProfiles.studentNumber,
    })
    .from(studentProfiles)
    .where(
      and(
        sql`${studentProfiles.studentNumber} like 'STU-DEMO-%'`,
        isNull(studentProfiles.userId)
      )
    );

  let claimed = 0;

  for (const profile of unclaimed) {
    const index = Number(profile.studentNumber.slice("STU-DEMO-".length)) - 1;
    const openId = openIdFor(index);
    const email = profile.email.toLowerCase();

    let userId = studentUserByOpenId.get(openId) ?? null;

    if (!userId) {
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);
      userId = existing?.id ?? null;
    }

    if (!userId) {
      const [created] = await db
        .insert(users)
        .values({
          openId,
          personId: profile.personId,
          name: profile.fullName,
          email,
          role: "student",
          loginMethod: "password",
          passwordHash: await hashPassword(DEMO_STUDENT_PASSWORD),
          passwordUpdatedAt: new Date(),
          mustChangePassword: false,
        } as never)
        .onConflictDoNothing()
        .returning({ id: users.id });
      userId = created?.id ?? null;
    }

    if (!userId) continue;

    await db
      .update(studentProfiles)
      .set({ userId })
      .where(eq(studentProfiles.id, profile.id));
    // Never demotes: an account that is already staff or admin keeps its role.
    await db
      .update(users)
      .set({ role: "student" })
      .where(and(eq(users.id, userId), eq(users.role, "user")));

    studentUserByOpenId.set(openId, userId);
    claimed += 1;
  }

  counts.studentsClaimed = claimed;

  /* --- Enrolments ------------------------------------------------------- */

  const enrolmentPayload = admitted
    .map(student => {
      const studentId = studentIdByNumber.get(
        `STU-DEMO-${String(student.index + 1).padStart(4, "0")}`
      );
      if (!studentId) return null;
      const course = courseRows.find(row => row.id === student.courseId);
      return {
        studentId,
        courseId: student.courseId,
        intakeId: student.intakeId,
        enrolledAt: daysAgo(Math.max(student.appliedDaysAgo - 5, 1)),
        expectedCompletionDate: dateOnly(
          Math.max(
            student.appliedDaysAgo - (course?.durationWeeks ?? 12) * 7,
            0
          )
        ),
        progressPercent:
          student.status === "graduated" || student.status === "completed"
            ? 100
            : between(15, 90),
        status:
          student.status === "graduated" || student.status === "completed"
            ? ("completed" as const)
            : student.status === "withdrawn"
              ? ("withdrawn" as const)
              : ("active" as const),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (enrolmentPayload.length) {
    await insertChunked(
      rows => db.insert(enrollments).values(rows).onConflictDoNothing(),
      enrolmentPayload
    );
  }

  const enrolmentRows = await db
    .select({
      id: enrollments.id,
      studentId: enrollments.studentId,
      courseId: enrollments.courseId,
    })
    .from(enrollments);
  const enrolmentByStudent = new Map(
    enrolmentRows.map(row => [row.studentId, row])
  );
  counts.enrollments = enrolmentRows.length;

  /* --- Fee charges, payments and the revenue ledger --------------------- */

  const chargePayload: Array<Record<string, unknown>> = [];
  const paymentPayload: Array<Record<string, unknown>> = [];
  const revenuePayload: Array<Record<string, unknown>> = [];

  // Allocation is computed in memory so charges are inserted already settled -
  // no read-modify-write round trip per charge.
  const allocationPlan: Array<{
    paymentReference: string;
    chargeKey: string;
    amount: string;
  }> = [];

  for (const student of admitted) {
    const studentNumber = `STU-DEMO-${String(student.index + 1).padStart(4, "0")}`;
    const studentId = studentIdByNumber.get(studentNumber);
    if (!studentId) continue;

    const enrolment = enrolmentByStudent.get(studentId);
    const structures = structuresByCourse.get(student.courseId) ?? [];
    if (!structures.length) continue;

    const charges = structures.map((structure, position) => ({
      key: `${studentNumber}-${position}`,
      structure,
      dueMinor: Math.round(Number(structure.amount) * 100),
      paidMinor: 0,
    }));

    const billedMinor = charges.reduce(
      (sum, charge) => sum + charge.dueMinor,
      0
    );
    const settledFraction =
      student.status === "graduated" || student.status === "completed"
        ? 1
        : [0.25, 0.5, 0.75, 1][between(0, 3)]!;

    let remainingMinor = Math.round(billedMinor * settledFraction);
    const instalmentCount = Math.max(between(2, 4), 1);
    const instalmentMinor = Math.ceil(billedMinor / instalmentCount);

    while (remainingMinor > 0) {
      const thisPaymentMinor = Math.min(remainingMinor, instalmentMinor);
      paymentIndex += 1;
      const paymentReference = reference("PAY", paymentIndex);
      const paidAt = daysAgo(between(1, Math.max(student.appliedDaysAgo, 2)));

      paymentPayload.push({
        reference: paymentReference,
        studentId,
        amount: cash(thisPaymentMinor),
        paymentMethod: pick([
          "cash",
          "mobile_money",
          "bank",
          "online",
        ] as const),
        status: "completed" as const,
        transactionReference: `MOMO-${paymentIndex}-${between(100000, 999999)}`,
        receivedByUserId: accountantUserId,
        recordedByUserId: accountantUserId,
        paidAt,
        createdAt: paidAt,
      });

      revenuePayload.push({
        source: "student_fee" as const,
        sourceType: "payment",
        paymentReference,
        studentId,
        amount: cash(thisPaymentMinor),
        description: `Student payment ${paymentReference}`,
        occurredAt: paidAt,
      });

      let toAllocate = thisPaymentMinor;
      for (const charge of charges) {
        if (toAllocate <= 0) break;
        const owing = charge.dueMinor - charge.paidMinor;
        if (owing <= 0) continue;
        const applyMinor = Math.min(owing, toAllocate);
        charge.paidMinor += applyMinor;
        toAllocate -= applyMinor;
        allocationPlan.push({
          paymentReference,
          chargeKey: charge.key,
          amount: cash(applyMinor),
        });
      }

      remainingMinor -= thisPaymentMinor;
    }

    for (const charge of charges) {
      chargePayload.push({
        chargeKey: charge.key,
        studentId,
        enrollmentId: enrolment?.id,
        feeStructureId: charge.structure.id,
        feeType: charge.structure.feeType,
        description: `${charge.structure.label} [${charge.key}]`,
        amountDue: cash(charge.dueMinor),
        amountPaid: cash(charge.paidMinor),
        dueDate: dateOnly(
          Math.max(student.appliedDaysAgo - charge.structure.dueOffsetDays, 0)
        ),
        status:
          charge.paidMinor >= charge.dueMinor
            ? ("paid" as const)
            : charge.paidMinor > 0
              ? ("partially_paid" as const)
              : ("open" as const),
      });
    }
  }

  if (chargePayload.length) {
    await insertChunked(
      rows =>
        db
          .insert(feeCharges)
          .values(
            rows.map(({ chargeKey: _chargeKey, ...row }) => row) as never
          ),
      chargePayload
    );
  }
  counts.feeCharges = chargePayload.length;

  if (paymentPayload.length) {
    await insertChunked(
      rows =>
        db
          .insert(payments)
          .values(rows as never)
          .onConflictDoNothing(),
      paymentPayload
    );
  }
  counts.studentPayments = paymentPayload.length;

  // Charges were written with their planning key in the description, so the
  // ids can be matched back in one query rather than one per row.
  const chargeIdByKey = new Map<string, number>();
  const taggedCharges = await db
    .select({ id: feeCharges.id, description: feeCharges.description })
    .from(feeCharges)
    .where(sql`${feeCharges.description} like '%[STU-DEMO-%]'`);

  for (const row of taggedCharges) {
    const key = row.description.match(/\[([^\]]+)\]$/)?.[1];
    if (key) chargeIdByKey.set(key, row.id);
  }

  const paymentRefs = paymentPayload.map(row => row.reference as string);
  const paymentIdByRef = new Map<string, number>();
  for (let index = 0; index < paymentRefs.length; index += 150) {
    const rows = await db
      .select({ id: payments.id, reference: payments.reference })
      .from(payments)
      .where(
        inArray(payments.reference, paymentRefs.slice(index, index + 150))
      );
    for (const row of rows) paymentIdByRef.set(row.reference, row.id);
  }

  const allocationRows = allocationPlan
    .map(plan => {
      const paymentId = paymentIdByRef.get(plan.paymentReference);
      const feeChargeId = chargeIdByKey.get(plan.chargeKey);
      if (!paymentId || !feeChargeId) return null;
      return { paymentId, feeChargeId, amount: plan.amount };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (allocationRows.length) {
    await insertChunked(
      rows => db.insert(paymentAllocations).values(rows).onConflictDoNothing(),
      allocationRows
    );
  }
  counts.paymentAllocations = allocationRows.length;

  const revenueRows = revenuePayload
    .map(row => {
      const paymentId = paymentIdByRef.get(row.paymentReference as string);
      if (!paymentId) return null;
      const { paymentReference: _ref, ...rest } = row;
      return { ...rest, paymentId, sourceId: paymentId };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (revenueRows.length) {
    await insertChunked(
      rows => db.insert(revenueTransactions).values(rows as never),
      revenueRows
    );
  }
  counts.revenueFromFees = revenueRows.length;

  // Tidy the key marker back out of the human-facing description.
  await db
    .update(feeCharges)
    .set({
      description: sql`regexp_replace(${feeCharges.description}, '\\s*\\[[^\\]]+\\]$', '')`,
    })
    .where(sql`${feeCharges.description} like '%[STU-DEMO-%'`);

  /* --- Attendance and results ------------------------------------------- */

  const attendancePayload: Array<Record<string, unknown>> = [];
  const resultPayload: Array<Record<string, unknown>> = [];

  for (const student of admitted) {
    const studentId = studentIdByNumber.get(
      `STU-DEMO-${String(student.index + 1).padStart(4, "0")}`
    );
    if (!studentId) continue;

    const enrolment = enrolmentByStudent.get(studentId);
    const classRow = classRows.find(row => row.courseId === student.courseId);

    if (enrolment && classRow) {
      for (const session of sessionsByClass.get(classRow.id) ?? []) {
        const roll = random();
        attendancePayload.push({
          enrollmentId: enrolment.id,
          classId: classRow.id,
          classSessionId: session.id,
          classDate: session.sessionDate,
          status:
            roll > 0.16
              ? "present"
              : roll > 0.09
                ? "late"
                : roll > 0.04
                  ? "absent"
                  : "excused",
          recordedByUserId: instructorUserId,
        });
      }
    }

    for (const assessment of assessmentRows.filter(
      row => row.courseId === student.courseId
    )) {
      const score = between(48, 96);
      resultPayload.push({
        assessmentId: assessment.id,
        studentId,
        score: score.toFixed(2),
        grade:
          score >= 80
            ? "A"
            : score >= 70
              ? "B"
              : score >= 60
                ? "C"
                : score >= 50
                  ? "D"
                  : "F",
        instructorComment:
          score >= 70
            ? "Confident, consistent practical work."
            : "Needs more supervised practice.",
        gradedByUserId: instructorUserId,
      });
    }
  }

  counts.attendance = await insertChunked(
    rows =>
      db
        .insert(attendanceRecords)
        .values(rows as never)
        .onConflictDoNothing(),
    attendancePayload,
    300
  );
  counts.results = await insertChunked(
    rows =>
      db
        .insert(assessmentResults)
        .values(rows as never)
        .onConflictDoNothing(),
    resultPayload,
    300
  );

  /* --- Catalogue, suppliers, purchasing --------------------------------- */

  const categorySeed = [
    { name: "Hair care", slug: "hair-care" },
    { name: "Skin care", slug: "skin-care" },
    { name: "Nail care", slug: "nail-care" },
    { name: "Tools and kits", slug: "tools-and-kits" },
    { name: "Classroom supplies", slug: "classroom-supplies" },
  ];

  await db
    .insert(productCategories)
    .values(
      categorySeed.map((category, index) => ({ ...category, sortOrder: index }))
    )
    .onConflictDoNothing();

  const categoryRows = await db.select().from(productCategories);
  const categoryIdBySlug = new Map(categoryRows.map(row => [row.slug, row.id]));
  counts.productCategories = categoryRows.length;

  const supplierSeed = [
    {
      name: "Tarkwa Beauty Supplies",
      company: "Tarkwa Beauty Supplies Ltd",
      products: "Shampoo, conditioner, treatments",
    },
    {
      name: "Golden Nails Import",
      company: "Golden Nails Ghana",
      products: "Gels, tips, nail tools",
    },
    {
      name: "Takoradi Salon Equipment",
      company: "Takoradi Salon Equipment Co",
      products: "Dryers, chairs, steamers",
    },
  ];

  let supplierRows = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers);
  if (!supplierRows.length) {
    await db.insert(suppliers).values(
      supplierSeed.map((supplier, index) => ({
        name: supplier.name,
        company: supplier.company,
        phone: `+23327${String(300000 + index)}`,
        email: `${slugOf(supplier.name)}@suppliers.test`,
        address: "Tarkwa, Ghana",
        productsSupplied: supplier.products,
      }))
    );
    supplierRows = await db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers);
  }
  counts.suppliers = supplierRows.length;

  const productSeed = [
    {
      sku: "BWT-SHMP-01",
      name: "Hydrating Shampoo 500ml",
      category: "hair-care",
      cost: 18,
      price: 45,
      qty: 60,
    },
    {
      sku: "BWT-COND-01",
      name: "Repair Conditioner 500ml",
      category: "hair-care",
      cost: 20,
      price: 48,
      qty: 45,
    },
    {
      sku: "BWT-SERUM-01",
      name: "Lumina Renewal Serum",
      category: "skin-care",
      cost: 26,
      price: 68,
      qty: 32,
    },
    {
      sku: "BWT-CLNS-01",
      name: "Gentle Facial Cleanser",
      category: "skin-care",
      cost: 15,
      price: 38,
      qty: 28,
    },
    {
      sku: "BWT-GEL-01",
      name: "Builder Gel Kit",
      category: "nail-care",
      cost: 40,
      price: 95,
      qty: 18,
    },
    {
      sku: "BWT-POLISH-01",
      name: "Gel Polish Set (12)",
      category: "nail-care",
      cost: 55,
      price: 130,
      qty: 12,
    },
    {
      sku: "BWT-KIT-01",
      name: "Student Essentials Kit",
      category: "tools-and-kits",
      cost: 90,
      price: 210,
      qty: 22,
    },
    {
      sku: "BWT-BRUSH-01",
      name: "Professional Brush Set",
      category: "tools-and-kits",
      cost: 48,
      price: 115,
      qty: 6,
    },
    {
      sku: "BWT-DRYER-01",
      name: "Salon Hood Dryer",
      category: "tools-and-kits",
      cost: 420,
      price: 890,
      qty: 3,
    },
    {
      sku: "BWT-GLOVE-01",
      name: "Nitrile Gloves (100)",
      category: "classroom-supplies",
      cost: 22,
      price: 0,
      qty: 0,
      sellable: false,
    },
    {
      sku: "BWT-TOWEL-01",
      name: "Salon Towels (12)",
      category: "classroom-supplies",
      cost: 35,
      price: 0,
      qty: 4,
      sellable: false,
    },
  ];

  const productImagesBySku: Record<string, string> = {
    "BWT-SERUM-01": "/products/lumina-serum.jpg",
    "BWT-KIT-01": "/products/student-essentials-kit.jpg",
    "BWT-SHMP-01": "/products/hydrating-shampoo-mask.jpg",
    "BWT-COND-01": "/products/hydrating-shampoo-mask.jpg",
    "BWT-GEL-01": "/products/builder-gel-kit.jpg",
    "BWT-POLISH-01": "/products/builder-gel-kit.jpg",
    "BWT-CLNS-01": "/products/facial-cleanser.jpg",
    "BWT-BRUSH-01": "/products/makeup-brush-set.jpg",
  };

  await insertChunked(
    rows =>
      db
        .insert(inventoryItems)
        .values(rows as never)
        .onConflictDoNothing(),
    productSeed.map((product, index) => ({
      sku: product.sku,
      slug: slugOf(product.name),
      name: product.name,
      description: `${product.name} used across Blush With Tee training and retail.`,
      category:
        categorySeed.find(item => item.slug === product.category)?.name ??
        "General",
      categoryId: categoryIdBySlug.get(product.category),
      supplierId: supplierRows[index % supplierRows.length]?.id,
      imageKey: productImagesBySku[product.sku] ?? null,
      quantityOnHand: product.qty,
      reorderLevel: Math.max(5, Math.round(product.qty * 0.25)),
      unitCost: product.cost.toFixed(2),
      sellingPrice: product.price.toFixed(2),
      isSellable: product.sellable !== false,
    }))
  );

  const productRows = await db
    .select({
      id: inventoryItems.id,
      sku: inventoryItems.sku,
      name: inventoryItems.name,
      price: inventoryItems.sellingPrice,
      qty: inventoryItems.quantityOnHand,
    })
    .from(inventoryItems);
  const productBySku = new Map(productRows.map(row => [row.sku, row]));
  counts.products = productRows.length;

  // Running stock balance, tracked in memory so every movement can carry the
  // balance it left behind - the same invariant the API maintains.
  const balances = new Map<number, number>(
    productRows.map(row => [row.id, row.qty])
  );
  const movementPayload: Array<Record<string, unknown>> = [];

  const [{ total: existingMovements }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(inventoryMovements);

  if (!existingMovements) {
    for (const product of productSeed) {
      const row = productBySku.get(product.sku);
      if (!row || product.qty <= 0) continue;
      movementPayload.push({
        inventoryItemId: row.id,
        movementType: "received" as const,
        quantityDelta: product.qty,
        balanceAfter: product.qty,
        unitCost: product.cost.toFixed(2),
        referenceType: "opening_balance",
        note: "Opening balance",
        createdAt: daysAgo(between(200, 330)),
      });
    }
  }

  /* --- A received purchase order ---------------------------------------- */

  const [existingPo] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .limit(1);
  if (!existingPo && supplierRows[0]) {
    const poProducts = productSeed.slice(0, 3);
    const poLines = poProducts
      .map(product => {
        const row = productBySku.get(product.sku);
        if (!row) return null;
        const quantity = between(10, 30);
        const unitCostMinor = Math.round(product.cost * 100);
        return { row, quantity, unitCostMinor };
      })
      .filter((line): line is NonNullable<typeof line> => line !== null);

    const totalMinor = poLines.reduce(
      (sum, line) => sum + line.unitCostMinor * line.quantity,
      0
    );

    const [order] = await db
      .insert(purchaseOrders)
      .values({
        reference: reference("PO", 1),
        supplierId: supplierRows[0].id,
        orderDate: dateOnly(45),
        expectedDate: dateOnly(30),
        status: "received",
        subtotal: cash(totalMinor),
        total: cash(totalMinor),
        amountPaid: cash(totalMinor),
        receivedAt: daysAgo(30),
        createdByUserId: storekeeperUserId,
      })
      .returning({ id: purchaseOrders.id });

    if (order?.id) {
      await db.insert(purchaseOrderItems).values(
        poLines.map(line => ({
          purchaseOrderId: order.id,
          inventoryItemId: line.row.id,
          itemName: line.row.name,
          quantityOrdered: line.quantity,
          quantityReceived: line.quantity,
          unitCost: cash(line.unitCostMinor),
          lineTotal: cash(line.unitCostMinor * line.quantity),
        }))
      );

      for (const line of poLines) {
        const next = (balances.get(line.row.id) ?? 0) + line.quantity;
        balances.set(line.row.id, next);
        movementPayload.push({
          inventoryItemId: line.row.id,
          movementType: "received" as const,
          quantityDelta: line.quantity,
          balanceAfter: next,
          unitCost: cash(line.unitCostMinor),
          referenceType: "purchase_order",
          referenceId: order.id,
          createdAt: daysAgo(30),
        });
      }
      counts.purchaseOrders = 1;
    }
  }

  /* --- Customers and store orders --------------------------------------- */

  const sellable = productRows.filter(row => Number(row.price) > 0);

  const existingOrders = await db
    .select({ orderNumber: storeOrders.orderNumber })
    .from(storeOrders)
    .where(sql`${storeOrders.orderNumber} like ${`ORD-${YEAR}-%`}`);
  const takenOrderNumbers = new Set(existingOrders.map(row => row.orderNumber));

  const ORDER_COUNT = 36;
  const orderPlans: Array<{
    orderNumber: string;
    name: string;
    email: string;
    phone: string;
    placedDaysAgo: number;
    lines: Array<{
      productId: number;
      name: string;
      priceMinor: number;
      quantity: number;
    }>;
    subtotalMinor: number;
    deliveryMinor: number;
    totalMinor: number;
    fulfillment:
      | "new"
      | "confirmed"
      | "processing"
      | "shipped"
      | "delivered"
      | "cancelled";
    isPaid: boolean;
  }> = [];

  const customerPeople: Array<Record<string, unknown>> = [];

  /**
   * Stock still available to sell while planning orders. Demo orders must not
   * sell more units than exist, or the ledger and the shelf disagree - the
   * exact inconsistency the real checkout path is written to prevent.
   */
  const sellableRemaining = new Map<number, number>(
    sellable.map(row => [row.id, balances.get(row.id) ?? row.qty])
  );

  for (let index = 0; index < ORDER_COUNT; index += 1) {
    const orderNumber = reference("ORD", index + 1);
    if (takenOrderNumbers.has(orderNumber) || !sellable.length) continue;

    const name = personName(index + 60);
    const email = `${slugOf(name)}.shop${index}@example.test`;
    const phone = `+23328${String(500000 + index)}`;

    const lines: Array<{
      productId: number;
      name: string;
      priceMinor: number;
      quantity: number;
    }> = [];
    for (let line = 0; line < between(1, 3); line += 1) {
      const inStock = sellable.filter(
        row => (sellableRemaining.get(row.id) ?? 0) > 0
      );
      if (!inStock.length) break;

      const product = pick(inStock);
      const available = sellableRemaining.get(product.id) ?? 0;
      const quantity = Math.min(between(1, 3), available);
      if (quantity <= 0) continue;

      sellableRemaining.set(product.id, available - quantity);
      lines.push({
        productId: product.id,
        name: product.name,
        priceMinor: Math.round(Number(product.price) * 100),
        quantity,
      });
    }

    if (!lines.length) continue;

    const subtotalMinor = lines.reduce(
      (sum, line) => sum + line.priceMinor * line.quantity,
      0
    );
    const deliveryMinor = between(0, 1) ? 2500 : 0;

    const roll = random();
    const fulfillment =
      roll > 0.78
        ? "new"
        : roll > 0.68
          ? "confirmed"
          : roll > 0.6
            ? "processing"
            : roll > 0.5
              ? "shipped"
              : roll > 0.06
                ? "delivered"
                : "cancelled";

    customerPeople.push({ fullName: name, email, phone, whatsapp: phone });

    orderPlans.push({
      orderNumber,
      name,
      email,
      phone,
      placedDaysAgo: between(0, 300),
      lines,
      subtotalMinor,
      deliveryMinor,
      totalMinor: subtotalMinor + deliveryMinor,
      fulfillment: fulfillment as (typeof orderPlans)[number]["fulfillment"],
      isPaid: fulfillment !== "new" && fulfillment !== "cancelled",
    });
  }

  if (customerPeople.length) {
    await insertChunked(
      rows =>
        db
          .insert(people)
          .values(rows as never)
          .onConflictDoNothing(),
      customerPeople
    );

    const shopperRows = await db
      .select({ id: people.id, email: people.email })
      .from(people)
      .where(
        inArray(
          people.email,
          orderPlans.map(plan => plan.email)
        )
      );
    const shopperIdByEmail = new Map(
      shopperRows.map(row => [row.email, row.id])
    );

    await insertChunked(
      rows =>
        db
          .insert(customers)
          .values(rows as never)
          .onConflictDoNothing(),
      orderPlans
        .map(plan => {
          const personId = shopperIdByEmail.get(plan.email);
          if (!personId) return null;
          return {
            personId,
            totalOrders: plan.isPaid ? 1 : 0,
            totalSpent: plan.isPaid ? cash(plan.totalMinor) : "0.00",
            lastOrderAt: plan.isPaid ? daysAgo(plan.placedDaysAgo) : null,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
    );

    const customerRows = await db
      .select({ id: customers.id, personId: customers.personId })
      .from(customers);
    const customerIdByPerson = new Map(
      customerRows.map(row => [row.personId, row.id])
    );
    counts.customers = customerRows.length;

    await insertChunked(
      rows =>
        db
          .insert(storeOrders)
          .values(rows as never)
          .onConflictDoNothing(),
      orderPlans.map(plan => {
        const personId = shopperIdByEmail.get(plan.email);
        return {
          orderNumber: plan.orderNumber,
          customerId: personId ? customerIdByPerson.get(personId) : undefined,
          customerName: plan.name,
          customerEmail: plan.email,
          customerPhone: plan.phone,
          deliveryAddress: `${between(1, 90)} ${pick(["Tarkwa Banso", "Aboso", "Nsuta", "Tamso", "Prestea"])}, Tarkwa`,
          subtotal: cash(plan.subtotalMinor),
          deliveryFee: cash(plan.deliveryMinor),
          total: cash(plan.totalMinor),
          paymentStatus: plan.isPaid ? ("paid" as const) : ("pending" as const),
          fulfillmentStatus: plan.fulfillment,
          stockDeductedAt: plan.isPaid ? daysAgo(plan.placedDaysAgo) : null,
          createdAt: daysAgo(plan.placedDaysAgo),
        };
      })
    );

    const orderRows = await db
      .select({ id: storeOrders.id, orderNumber: storeOrders.orderNumber })
      .from(storeOrders)
      .where(
        inArray(
          storeOrders.orderNumber,
          orderPlans.map(plan => plan.orderNumber)
        )
      );
    const orderIdByNumber = new Map(
      orderRows.map(row => [row.orderNumber, row.id])
    );
    counts.orders = orderRows.length;

    await insertChunked(
      rows => db.insert(orderItems).values(rows as never),
      orderPlans.flatMap(plan => {
        const orderId = orderIdByNumber.get(plan.orderNumber);
        if (!orderId) return [];
        return plan.lines.map(line => ({
          orderId,
          inventoryItemId: line.productId,
          itemName: line.name,
          unitPrice: cash(line.priceMinor),
          quantity: line.quantity,
          lineTotal: cash(line.priceMinor * line.quantity),
        }));
      })
    );

    await insertChunked(
      rows => db.insert(orderStatusEvents).values(rows as never),
      orderPlans
        .map(plan => {
          const orderId = orderIdByNumber.get(plan.orderNumber);
          if (!orderId) return null;
          return {
            orderId,
            toStatus: plan.fulfillment,
            note: "Seeded demo order",
            createdAt: daysAgo(plan.placedDaysAgo),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
    );

    /* --- Sale payments, revenue and stock movements --------------------- */

    const salePayments: Array<Record<string, unknown>> = [];
    const saleRevenue: Array<{
      orderNumber: string;
      amount: string;
      occurredAt: Date;
      orderId: number;
    }> = [];

    for (const plan of orderPlans) {
      const orderId = orderIdByNumber.get(plan.orderNumber);
      if (!orderId || !plan.isPaid) continue;

      paymentIndex += 1;
      const paidAt = daysAgo(plan.placedDaysAgo);
      const paymentReference = reference("SALE", paymentIndex);

      salePayments.push({
        reference: paymentReference,
        storeOrderId: orderId,
        amount: cash(plan.totalMinor),
        paymentMethod: pick(["mobile_money", "card", "online"] as const),
        status: "completed" as const,
        transactionReference: `PSK-${paymentIndex}-${between(100000, 999999)}`,
        paidAt,
        createdAt: paidAt,
      });

      saleRevenue.push({
        orderNumber: plan.orderNumber,
        amount: cash(plan.totalMinor),
        occurredAt: paidAt,
        orderId,
      });

      for (const line of plan.lines) {
        // Not clamped on purpose: order planning already reserved the units, so
        // a negative here would mean a real bug rather than something to hide.
        const next = (balances.get(line.productId) ?? 0) - line.quantity;
        balances.set(line.productId, next);
        movementPayload.push({
          inventoryItemId: line.productId,
          movementType: "retail_sale" as const,
          quantityDelta: -line.quantity,
          balanceAfter: next,
          referenceType: "store_order",
          referenceId: orderId,
          createdAt: paidAt,
        });
      }
    }

    if (salePayments.length) {
      await insertChunked(
        rows =>
          db
            .insert(payments)
            .values(rows as never)
            .onConflictDoNothing(),
        salePayments
      );

      const saleRefs = salePayments.map(row => row.reference as string);
      const salePaymentRows = await db
        .select({
          id: payments.id,
          reference: payments.reference,
          storeOrderId: payments.storeOrderId,
        })
        .from(payments)
        .where(inArray(payments.reference, saleRefs));
      const salePaymentByOrder = new Map(
        salePaymentRows.map(row => [row.storeOrderId, row.id])
      );

      await insertChunked(
        rows => db.insert(revenueTransactions).values(rows as never),
        saleRevenue.map(entry => ({
          source: "product_sale" as const,
          sourceType: "payment",
          sourceId: salePaymentByOrder.get(entry.orderId),
          paymentId: salePaymentByOrder.get(entry.orderId),
          storeOrderId: entry.orderId,
          amount: entry.amount,
          description: `Store sale ${entry.orderNumber}`,
          occurredAt: entry.occurredAt,
        }))
      );
      counts.salePayments = salePayments.length;
    }
  }

  /* --- Write the stock ledger and settle final balances ----------------- */

  if (movementPayload.length) {
    counts.inventoryMovements = await insertChunked(
      rows => db.insert(inventoryMovements).values(rows as never),
      movementPayload,
      300
    );

    for (const [inventoryItemId, quantity] of balances) {
      await db
        .update(inventoryItems)
        .set({ quantityOnHand: quantity })
        .where(eq(inventoryItems.id, inventoryItemId));
    }
  }

  /* --- Expenses --------------------------------------------------------- */

  const [{ total: existingExpenses }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(expenses);

  if (!existingExpenses) {
    // Sized against seeded revenue (roughly GHS 8-9k a month, growing) so the
    // demo reads as a real, modestly profitable school rather than one that is
    // losing money every month.
    const expenseSeed = [
      {
        title: "Studio rent",
        category: "rent" as const,
        min: 1800,
        max: 1800,
        monthly: true,
      },
      {
        title: "Electricity bill",
        category: "utilities" as const,
        min: 280,
        max: 520,
        monthly: true,
      },
      {
        title: "Water and internet",
        category: "utilities" as const,
        min: 160,
        max: 260,
        monthly: true,
      },
      {
        title: "Staff salaries",
        category: "salaries" as const,
        min: 3200,
        max: 3600,
        monthly: true,
      },
      {
        title: "Product restock",
        category: "beauty_products" as const,
        min: 400,
        max: 1100,
        monthly: false,
      },
      {
        title: "Social media ads",
        category: "marketing" as const,
        min: 180,
        max: 520,
        monthly: false,
      },
      {
        title: "Equipment servicing",
        category: "maintenance" as const,
        min: 120,
        max: 420,
        monthly: false,
      },
      {
        title: "Cleaning supplies",
        category: "cleaning" as const,
        min: 60,
        max: 180,
        monthly: false,
      },
      {
        title: "Transport and delivery",
        category: "transport" as const,
        min: 90,
        max: 320,
        monthly: false,
      },
      {
        title: "Printing and stationery",
        category: "stationery" as const,
        min: 50,
        max: 190,
        monthly: false,
      },
    ];

    const expensePayload: Array<Record<string, unknown>> = [];
    const now = new Date();

    for (let monthsBack = 11; monthsBack >= 0; monthsBack -= 1) {
      for (const item of expenseSeed) {
        if (!item.monthly && random() > 0.55) continue;
        const day = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth() - monthsBack,
            between(2, 26)
          )
        );
        if (day > now) continue;

        expensePayload.push({
          title: item.title,
          category: item.category,
          amount: amountBetween(item.min, item.max),
          expenseDate: day,
          vendor: pick([
            "Tarkwa Properties",
            "ECG",
            "Vodafone",
            "Internal",
            "Tarkwa Beauty Supplies",
          ]),
          paymentMethod: pick(["bank", "mobile_money", "cash"] as const),
          approvalStatus: "approved" as const,
          recordedByUserId: accountantUserId,
        });
      }
    }

    counts.expenses = await insertChunked(
      rows => db.insert(expenses).values(rows as never),
      expensePayload,
      200
    );
  }

  /* --- Website content -------------------------------------------------- */

  const [{ total: existingTestimonials }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(testimonials);

  if (!existingTestimonials) {
    await db.insert(testimonials).values([
      {
        authorName: "Akosua Mensah",
        authorRole: "Graduate, Professional Hair Artistry",
        quote:
          "I walked in nervous and walked out running my own salon chair. The practical hours made the difference.",
        rating: 5,
        sortOrder: 0,
        status: "published",
      },
      {
        authorName: "Efua Boateng",
        authorRole: "Graduate, Nail Craft & Design",
        quote:
          "The instructors correct your technique until it is right. My clients notice.",
        rating: 5,
        sortOrder: 1,
        status: "published",
      },
      {
        authorName: "Gifty Owusu",
        authorRole: "Student, Foundations of Beauty",
        quote:
          "Small classes, real clients in the student clinic, and honest feedback every week.",
        rating: 5,
        sortOrder: 2,
        status: "published",
      },
    ]);
    counts.testimonials = 3;

    await db.insert(faqs).values([
      {
        question: "What qualifications do I need to enrol?",
        answer:
          "Most programmes are open to motivated beginners. Advanced programmes ask for a foundation certificate or equivalent salon experience.",
        category: "Admissions",
        sortOrder: 0,
        status: "published",
      },
      {
        question: "Can I pay my fees in instalments?",
        answer:
          "Yes. We set up a payment plan at registration and you can pay online from the student portal at any time.",
        category: "Fees",
        sortOrder: 1,
        status: "published",
      },
      {
        question: "Do you provide a kit?",
        answer:
          "A student essentials kit is included in the materials fee for every practical programme.",
        category: "Programmes",
        sortOrder: 2,
        status: "published",
      },
      {
        question: "Are certificates verifiable?",
        answer:
          "Every certificate carries a unique number and a QR code that links to our public verification page.",
        category: "Certificates",
        sortOrder: 3,
        status: "published",
      },
    ]);
    counts.faqs = 4;

    await db.insert(galleryItems).values(
      [
        { title: "Bridal finish", category: "makeup" as const },
        { title: "Colour correction", category: "hair" as const },
        { title: "Gel extension set", category: "nails" as const },
        { title: "Graduation 2026", category: "graduation" as const },
        { title: "Practical session", category: "training" as const },
        { title: "The studio floor", category: "facilities" as const },
      ].map((item, index) => ({
        title: item.title,
        category: item.category,
        storageKey: `demo/gallery/${slugOf(item.title)}.jpg`,
        altText: item.title,
        sortOrder: index,
        status: "published" as const,
      }))
    );
    counts.galleryItems = 6;
  }

  return counts;
}
