// Recognising the database's own answers.
const UNIQUE_VIOLATION = "23505";

// How far down the cause chain to look before giving up.
const MAX_DEPTH = 5;

type PostgresFault = { code?: string; constraint?: string };

// The first link in the chain that carries a SQLSTATE code, if any.
function driverFault(error: unknown): PostgresFault | null {
  let node: unknown = error;

  for (let depth = 0; node && depth < MAX_DEPTH; depth += 1) {
    const fault = node as PostgresFault & { cause?: unknown };
    if (typeof fault.code === "string") return fault;
    node = fault.cause;
  }

  return null;
}

// Whether this is a unique violation, optionally from one named index.
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const fault = driverFault(error);
  if (!fault || fault.code !== UNIQUE_VIOLATION) return false;
  return constraint ? fault.constraint === constraint : true;
}
