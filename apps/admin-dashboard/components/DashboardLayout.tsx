"use client";

import { useEffect, useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  KeyRound,
  LogOut,
  PanelLeft,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@blush/ui/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@blush/ui/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@blush/ui/components/ui/sidebar";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationBell } from "./NotificationBell";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { NAV_SECTIONS } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { startLogin } from "@/lib/auth";

const ADMIN_SHELL_STYLE = {
  "--background": "#f3fbfd",
  "--foreground": "#263746",
  "--card": "rgba(255, 255, 255, 0.68)",
  "--card-foreground": "#263746",
  "--popover": "rgba(255, 255, 255, 0.92)",
  "--popover-foreground": "#263746",
  "--primary": "#22aeb6",
  "--primary-foreground": "#ffffff",
  "--secondary": "rgba(237, 250, 252, 0.8)",
  "--secondary-foreground": "#24747c",
  "--muted": "rgba(232, 247, 250, 0.74)",
  "--muted-foreground": "#667987",
  "--accent": "#b44ac8",
  "--accent-foreground": "#ffffff",
  "--border": "rgba(158, 230, 236, 0.66)",
  "--input": "rgba(158, 230, 236, 0.72)",
  "--ring": "#22b8bd",
  "--sidebar": "rgba(249, 254, 255, 0.62)",
  "--sidebar-foreground": "#344b59",
  "--sidebar-accent": "rgba(255, 255, 255, 0.52)",
  "--sidebar-accent-foreground": "#263746",
  "--sidebar-border": "rgba(158, 230, 236, 0.64)",
  "--sidebar-ring": "#22b8bd",
} as CSSProperties;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, user } = useAuth();

  // A signed-out visitor is sent to the sign-in page rather than shown a dead
  // end, and comes back to the page they were trying to reach.
  useEffect(() => {
    if (!loading && !user) startLogin();
  }, [loading, user]);

  if (loading || !user) return <DashboardLayoutSkeleton />;

  return (
    // The shell owns the viewport and the content panel scrolls inside it, so
    // the panel keeps its rounded corners against the navigation frame however
    // far the page runs.
    <SidebarProvider
      className="admin-dashboard-shell h-svh overflow-hidden"
      style={ADMIN_SHELL_STYLE}
    >
      <DashboardShell>{children}</DashboardShell>
    </SidebarProvider>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { canAny, roles, isLoading, mustChangePassword } = usePermissions();
  const pathname = usePathname();
  const router = useRouter();
  const { toggleSidebar } = useSidebar();

  /**
   * Only sections with at least one permitted item are rendered, so the
   * navigation reflects the role rather than showing dead ends.
   */
  const sections = useMemo(
    () =>
      NAV_SECTIONS.map(section => ({
        ...section,
        items: section.items.filter(item => canAny(...item.permissions)),
      })).filter(section => section.items.length > 0),
    [canAny]
  );

  const activeLabel = sections
    .flatMap(section => section.items)
    .find(item => item.path === pathname)?.label;

  return (
    <>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="h-16 justify-center px-1">
          <div className="flex w-full items-center gap-2.5">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Toggle navigation"
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#22b8bd] text-white shadow-[0_14px_28px_rgba(34,184,189,0.25)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <Sparkles className="size-4 group-data-[collapsible=icon]:hidden" />
              <PanelLeft className="hidden size-4 group-data-[collapsible=icon]:block" />
            </button>
            <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <span className="block truncate font-semibold leading-tight">
                Blush With Tee
              </span>
              <span className="block truncate text-[11px] text-sidebar-foreground/50">
                Admin console
              </span>
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent className="gap-0">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3, 4].map(index => (
                <div
                  key={index}
                  className="h-9 animate-pulse rounded-xl bg-white/5"
                />
              ))}
            </div>
          ) : !sections.length ? (
            <div className="p-4 text-center group-data-[collapsible=icon]:hidden">
              <ShieldAlert className="mx-auto h-6 w-6 text-sidebar-foreground/60" />
              <p className="mt-2 text-xs text-sidebar-foreground/60">
                No modules are assigned to your account yet. Ask an
                administrator to grant you a role.
              </p>
            </div>
          ) : (
            sections.map((section, index) => (
              // shrink-0 matters: SidebarContent is a flex-1 column, so once
              // the navigation is taller than the viewport the groups would
              // otherwise be squashed shorter than their own fixed-height
              // buttons — and the next section label would be drawn over the
              // overflow. The container already scrolls; let it.
              <SidebarGroup
                key={section.label || `root-${index}`}
                className={`shrink-0 py-1 ${section.label ? "pt-3" : ""}`}
              >
                {section.label ? (
                  <SidebarGroupLabel className="h-6 text-[10px] uppercase tracking-wider text-sidebar-foreground/55">
                    {section.label}
                  </SidebarGroupLabel>
                ) : null}
                <SidebarMenu className="gap-0.5">
                  {section.items.map(item => {
                    const isActive = pathname === item.path;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => router.push(item.path)}
                          tooltip={item.label}
                          className="h-10 rounded-xl px-3 font-medium text-sidebar-foreground/75 hover:bg-white/45 hover:text-sidebar-foreground data-[active=true]:bg-white/75 data-[active=true]:font-semibold data-[active=true]:text-[#263746] data-[active=true]:shadow-[0_12px_28px_rgba(71,124,138,0.16)]"
                        >
                          <item.icon
                            className={`size-4 ${isActive ? "text-[#22aeb6]" : ""}`}
                          />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))
          )}
        </SidebarContent>

        <SidebarFooter className="p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-xl border border-white/60 bg-white/40 p-2 text-left transition-colors hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="bg-[#22b8bd] text-xs font-semibold text-white">
                    {user?.name?.charAt(0).toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <span className="block truncate text-sm font-medium leading-none">
                    {user?.name || "Account"}
                  </span>
                  <span className="mt-1.5 block truncate text-xs text-sidebar-foreground/55">
                    {roles.map(role => role.name).join(", ") ||
                      user?.email ||
                      "-"}
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {user?.email || "Signed in"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => router.push("/account/password")}
                className="cursor-pointer"
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Change password
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={logout}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      {/* overflow-hidden is what actually holds the corner radius: every child,
          the header included, is clipped to the panel's rounded shape. */}
      <SidebarInset className="admin-content-panel min-h-0 overflow-hidden bg-transparent md:peer-data-[variant=inset]:rounded-[1.5rem] md:peer-data-[variant=inset]:shadow-[0_24px_70px_rgba(88,140,151,0.18)]">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/60 bg-white/35 px-3 backdrop-blur-xl sm:px-5">
          <SidebarTrigger className="h-9 w-9 shrink-0 rounded-lg md:hidden" />
          {/* Named for every reader, shown once there is room to spare. */}
          <p className="sr-only shrink-0 text-base font-semibold text-foreground lg:not-sr-only">
            {activeLabel ?? "Dashboard"}
          </p>
          <div className="flex-1">
            <GlobalSearch />
          </div>
          <NotificationBell />
        </header>

        <div className="flex-1 overflow-y-auto">
          {mustChangePassword ? (
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 sm:px-6">
              <p className="flex flex-wrap items-center gap-2 text-sm text-amber-900 dark:text-amber-200">
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                This account is still using the password it was set up with.
                <Link
                  href="/account/password"
                  className="font-semibold underline"
                >
                  Choose your own password
                </Link>
              </p>
            </div>
          ) : null}

          {/* SidebarInset is already the page's <main>, so this is a plain
              wrapper; the header above names the view for screen readers. */}
          <div className="p-4 sm:p-6">{children}</div>
        </div>
      </SidebarInset>
    </>
  );
}
