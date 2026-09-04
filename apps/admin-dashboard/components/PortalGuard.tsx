"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { startLogin } from "@/lib/auth";

type AllowedRole = "student" | "staff" | "admin";

export default function PortalGuard({ allowedRoles, children }: { allowedRoles: AllowedRole[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  useEffect(() => { if (!loading && !user) startLogin(); }, [loading, user]);
  if (loading) return <div className="grid min-h-screen place-items-center bg-[#fbf8fc] dark:bg-[#0b1e26] text-sm text-[#70677b] dark:text-[#97b9c2]">Opening your portal…</div>;
  if (!user) return <div className="grid min-h-screen place-items-center bg-[#fbf8fc] dark:bg-[#0b1e26] text-sm text-[#70677b] dark:text-[#97b9c2]">Redirecting to sign in…</div>;
  if (!allowedRoles.includes(user.role as AllowedRole)) return <div className="grid min-h-screen place-items-center bg-[#fbf8fc] dark:bg-[#0b1e26] p-6 text-center"><div><p className="font-serif text-3xl text-[#51465c] dark:text-[#e4f4f7]">This portal is not available to your account.</p><Link href="/" className="mt-4 inline-block rounded-full bg-[#5f5277] px-5 py-3 text-sm font-semibold text-white">Return to BWT</Link></div></div>;
  return <>{children}</>;
}
