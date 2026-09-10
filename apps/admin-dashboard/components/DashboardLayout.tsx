"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  KeyRound,
  LogOut,
  PanelLeft,
  ShieldAlert,
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
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@blush/ui/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@blush/ui/components/ui/collapsible";
import { AssistantLauncher } from "./assistant/AssistantLauncher";
import { GlobalSearch } from "./GlobalSearch";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationBell } from "./NotificationBell";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { NAV_SECTIONS } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { startLogin } from "@/lib/auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, user } = useAuth();

  // Started up here so it leaves in the same batch as `auth.me`. Mounted
  // below the auth check instead, it would not begin until that call came
  // back, and the page's own queries would not begin until it did - three
  // round trips of skeleton before the first row is asked for.
  usePermissions();

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
    <SidebarProvider className="admin-dashboard-shell h-svh overflow-hidden">
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
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    School: true,
    Salon: true,
    Shop: true,
    Administration: true,
  });

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

  // Keep the destination visible when navigation comes from search, a
  // notification, or a bookmarked URL rather than from the sidebar itself.
  useEffect(() => {
    const activeSection = sections.find(
      section =>
        section.label && section.items.some(item => item.path === pathname)
    );

    if (activeSection?.label) {
      setOpenSections(current =>
        current[activeSection.label]
          ? current
          : { ...current, [activeSection.label]: true }
      );
    }
  }, [pathname, sections]);

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
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#22b8bd] text-white shadow-[0_14px_28px_rgba(34,184,189,0.25)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring dark:bg-[#3fd0d8] dark:text-[#04252a] dark:shadow-[0_14px_28px_rgba(63,208,216,0.2)]"
            >
              <Image
                src="/logo.png"
                alt="Logo"
                width={24}
                height={24}
                className="size-6 object-contain group-data-[collapsible=icon]:hidden"
              />
              <PanelLeft className="hidden size-4 group-data-[collapsible=icon]:block" />
            </button>
            <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <span className="block truncate font-semibold leading-tight">
                BWT Artistry
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
                  className="h-9 animate-pulse rounded-xl bg-black/5 dark:bg-white/5"
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
            sections.map((section, index) => {
              // shrink-0 matters: SidebarContent is a flex-1 column, so once
              // the navigation is taller than the viewport the groups would
              // otherwise be squashed shorter than their own fixed-height
              // buttons — and the next section label would be drawn over the
              // overflow. The container already scrolls; let it.
              const menu = (
                <SidebarMenu className="gap-0 border-sidebar-border/50 group-data-[collapsible=icon]:border-0">
                  {section.items.map(item => {
                    const isActive = pathname === item.path;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => router.push(item.path)}
                          tooltip={item.label}
                          className="h-8 rounded-lg px-2.5 text-[13px] font-medium text-sidebar-foreground/75 hover:bg-white/45 hover:text-sidebar-foreground data-[active=true]:bg-white/75 data-[active=true]:font-semibold data-[active=true]:text-[#263746] data-[active=true]:shadow-[0_8px_20px_rgba(71,124,138,0.14)] dark:hover:bg-white/10 dark:data-[active=true]:bg-white/12 dark:data-[active=true]:text-[#f2fbfc] dark:data-[active=true]:shadow-[0_8px_20px_rgba(0,0,0,0.3)]"
                        >
                          <item.icon
                            className={`size-4 ${isActive ? "text-[#22aeb6] dark:text-[#3fd0d8]" : ""}`}
                          />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              );

              if (!section.label) {
                return (
                  <SidebarGroup
                    key={`root-${index}`}
                    className="shrink-0 p-1 pb-0"
                  >
                    {menu}
                  </SidebarGroup>
                );
              }

              const SectionIcon = section.icon;
              const isOpen = openSections[section.label] ?? true;

              return (
                <Collapsible
                  key={section.label}
                  open={isOpen}
                  onOpenChange={open =>
                    setOpenSections(current => ({
                      ...current,
                      [section.label]: open,
                    }))
                  }
                  className="shrink-0"
                >
                  <SidebarGroup className="shrink-0 p-1 pt-2">
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        type="button"
                        tooltip={section.label}
                        className="h-8 rounded-lg px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/60 hover:bg-white/45 hover:text-sidebar-foreground group-data-[collapsible=icon]:justify-center dark:hover:bg-white/10"
                      >
                        {SectionIcon ? (
                          <SectionIcon className="size-4" />
                        ) : null}
                        <span className="group-data-[collapsible=icon]:hidden">
                          {section.label}
                        </span>
                        <ChevronDown
                          className={`ml-auto size-3.5 transition-transform group-data-[collapsible=icon]:hidden ${isOpen ? "rotate-180" : ""}`}
                        />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border-l border-sidebar-border/50 pl-2 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:pl-0">
                      {menu}
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              );
            })
          )}
        </SidebarContent>

        <SidebarFooter className="p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-xl border border-white/60 bg-white/40 p-2 text-left transition-colors hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="bg-[#22b8bd] text-xs font-semibold text-white dark:bg-[#3fd0d8] dark:text-[#04252a]">
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
      <SidebarInset className="admin-content-panel min-h-0 overflow-hidden bg-transparent lg:peer-data-[variant=inset]:rounded-[1.5rem] lg:peer-data-[variant=inset]:shadow-[0_24px_70px_rgba(88,140,151,0.18)] dark:lg:peer-data-[variant=inset]:shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/60 bg-white/35 px-3 backdrop-blur-xl sm:px-5 dark:border-white/8 dark:bg-white/4">
          <SidebarTrigger className="h-9 w-9 shrink-0 rounded-lg lg:hidden" />
          {/* Named for every reader, shown once there is room to spare. */}
          <p className="sr-only shrink-0 text-base font-semibold text-foreground lg:not-sr-only">
            {activeLabel ?? "Dashboard"}
          </p>
          <div className="flex-1">
            <GlobalSearch />
          </div>
          <AssistantLauncher />
          <ThemeToggle />
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
