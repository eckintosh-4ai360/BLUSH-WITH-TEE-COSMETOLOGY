"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { startLogin } from "@/lib/auth";

type AllowedRole = "student" | "staff" | "admin";

export default function PortalGuard({ allowedRoles, children }: { allowedRoles: AllowedRole[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading && !user) startLogin();
  }, [loading, user]);
  if (loading) return <div className="grid min-h-screen place-items-center bg-[#fdf8fc] text-sm font-semibold text-[#8f0d6b]">Opening your student portal…</div>;
  if (!user) return <div className="grid min-h-screen place-items-center bg-[#fdf8fc] text-sm font-semibold text-[#8f0d6b]">Redirecting to sign in…</div>;
  if (!allowedRoles.includes(user.role as AllowedRole))
    return (
      <div className="grid min-h-screen place-items-center bg-[#fdf8fc] p-6 text-center">
        <div>
          <p className="font-serif text-3xl font-bold text-[#8f0d6b]">This portal is not available to your account.</p>
          <Link href="/" className="mt-5 inline-block rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-6 py-3 text-sm font-bold text-white shadow-md hover:scale-105 transition-transform">
            Return to Blush With Tee
          </Link>
        </div>
      </div>
    );
  return <>{children}</>;
}

