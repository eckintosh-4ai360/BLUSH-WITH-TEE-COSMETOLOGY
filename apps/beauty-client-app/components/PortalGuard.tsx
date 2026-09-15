"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { startLogin } from "@/lib/auth";
import { isStaffRole, staffDashboardUrl } from "@/lib/staffDashboard";

type AllowedRole = "student" | "staff" | "admin";

export default function PortalGuard({ allowedRoles, children }: { allowedRoles: AllowedRole[]; children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const mustChangePassword = Boolean(user?.mustChangePassword);

  useEffect(() => {
    if (!loading && !user) startLogin();
  }, [loading, user]);

  // When the office asks for a new password on first use, the portal waits until it is chosen.
  useEffect(() => {
    if (loading || !mustChangePassword) return;
    const here = `${window.location.pathname}${window.location.search}`;
    router.replace(`/account/password?next=${encodeURIComponent(here)}`);
  }, [loading, mustChangePassword, router]);

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#fdf8fc] text-sm font-semibold text-[#8f0d6b]">Opening your student portal…</div>;
  if (!user) return <div className="grid min-h-screen place-items-center bg-[#fdf8fc] text-sm font-semibold text-[#8f0d6b]">Redirecting to sign in…</div>;
  if (mustChangePassword) return <div className="grid min-h-screen place-items-center bg-[#fdf8fc] text-sm font-semibold text-[#8f0d6b]">Taking you to choose a password…</div>;
  if (!allowedRoles.includes(user.role as AllowedRole)) {
    const dashboard = isStaffRole(user.role) ? staffDashboardUrl() : null;
    return (
      <div className="grid min-h-screen place-items-center bg-[#fdf8fc] p-6 text-center">
        <div className="max-w-lg">
          <p className="font-serif text-3xl font-bold text-[#8f0d6b]">
            {isStaffRole(user.role)
              ? "The student portal is for students."
              : "This portal is not available to your account."}
          </p>
          {isStaffRole(user.role) ? (
            <p className="mt-3 text-sm leading-7 text-[#6a2557]">
              You are signed in with a staff account. Staff work in the staff dashboard.
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {dashboard ? (
              <a href={dashboard} className="inline-block rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-6 py-3 text-sm font-bold text-white shadow-md hover:scale-105 transition-transform">
                Open the staff dashboard
              </a>
            ) : null}
            <Link
              href="/"
              className={
                dashboard
                  ? "inline-block rounded-full border border-[#8f0d6b]/25 bg-white px-6 py-3 text-sm font-bold text-[#8f0d6b] hover:bg-[#faeaf6]"
                  : "inline-block rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-6 py-3 text-sm font-bold text-white shadow-md hover:scale-105 transition-transform"
              }
            >
              Return to Blush With Tee
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
