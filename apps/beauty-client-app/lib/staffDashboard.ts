// Staff and administrators work in the dashboard, which is a separate app. Set
// NEXT_PUBLIC_ADMIN_URL once it is deployed; in development it runs on port 3000 beside this site.
export function staffDashboardUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_ADMIN_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return process.env.NODE_ENV === "development" ? "http://localhost:3000" : null;
}

export function isStaffRole(role: string | null | undefined): boolean {
  return role === "staff" || role === "admin";
}

// Whether a destination is the student portal, which has nothing to show a staff account.
export function isPortalPath(path: string): boolean {
  return path === "/portal" || path.startsWith("/portal/") || path.startsWith("/portal?");
}
