/**
 * Recognising the database's own answers.
 *
 * Drizzle wraps a failed query in its own `Error` and hangs the driver's error
 * off `cause`, so the `code` and `constraint` a caller wants are one or more
 * levels down rather than on the error it catches. Checking the top-level
 * object alone silently never matches - which looks like working code and
 * behaves like a missing branch.
 *
 * Matched on the SQLSTATE code and the constraint name rather than the message
 * text: the message is localised and reworded between server versions, these
 * are not.
 */

/** Unique violation. */
const UNIQUE_VIOLATION = "23505";

/** How far down the `cause` chain to look before giving up. */
const MAX_DEPTH = 5;

type PostgresFault = { code?: string; constraint?: string };

/** The first link in the chain that carries a SQLSTATE code, if any. */
function driverFault(error: unknown): PostgresFault | null {
  let node: unknown = error;

  for (let depth = 0; node && depth < MAX_DEPTH; depth += 1) {
    const fault = node as PostgresFault & { cause?: unknown };
    if (typeof fault.code === "string") return fault;
    node = fault.cause;
  }

  return null;
}

/**
 * Whether this is a unique violation, optionally from one named index.
 *
 * Naming the constraint matters when a table has more than one: "that student
 * is already on the programme" is only the right thing to say when it was the
 * enrolment index that refused, not some other uniqueness the same statement
 * happened to break.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const fault = driverFault(error);
  if (!fault || fault.code !== UNIQUE_VIOLATION) return false;
  return constraint ? fault.constraint === constraint : true;
}
