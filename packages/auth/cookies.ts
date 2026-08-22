// Framework-agnostic cookie-option helper: works with any Fetch-API `Request`
// (including Next.js's `NextRequest`, which extends it).

function isSecureRequest(req: Request): boolean {
  const url = new URL(req.url);
  if (url.protocol === "https:") return true;

  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (!forwardedProto) return false;

  return forwardedProto
    .split(",")
    .some(proto => proto.trim().toLowerCase() === "https");
}

export type SessionCookieOptions = {
  httpOnly: true;
  path: "/";
  sameSite: "none";
  secure: boolean;
};

export function getSessionCookieOptions(req: Request): SessionCookieOptions {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req),
  };
}
