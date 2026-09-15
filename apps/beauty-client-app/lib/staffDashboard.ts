// The school's management dashboard, used when NEXT_PUBLIC_ADMIN_URL is not set.
const MANAGEMENT_URL = "https://management.blushwithtee.com";

// Staff and administrators work in the dashboard, which is a separate app. NEXT_PUBLIC_ADMIN_URL
// overrides the address; in development it runs on port 3000 beside this site.
export function staffDashboardUrl(): string {
  const configured = process.env.NEXT_PUBLIC_ADMIN_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return process.env.NODE_ENV === "development" ? "http://localhost:3000" : MANAGEMENT_URL;
}

export function isStaffRole(role: string | null | undefined): boolean {
  return role === "staff" || role === "admin";
}

// Whether a destination is the student portal, which has nothing to show a staff account.
export function isPortalPath(path: string): boolean {
  return path === "/portal" || path.startsWith("/portal/") || path.startsWith("/portal?");
}
