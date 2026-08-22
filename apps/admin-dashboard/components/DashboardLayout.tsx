"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, PanelLeft, ShieldAlert } from "lucide-react";
import { Avatar, AvatarFallback } from "@blush/ui/components/ui/avatar";
import { Button } from "@blush/ui/components/ui/button";
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to continue</h1>
          <p className="text-sm text-muted-foreground">
            The management system is restricted to Blush With Tee staff accounts.
          </p>
          <Button onClick={() => startLogin()} size="lg" className="w-full">
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <DashboardShell>{children}</DashboardShell>
    </SidebarProvider>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { canAny, roles, isLoading } = usePermissions();
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
    [canAny],
  );

  const activeLabel = sections
    .flatMap(section => section.items)
    .find(item => item.path === pathname)?.label;

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-border/60">
        <SidebarHeader className="h-16 justify-center">
          <div className="flex w-full items-center gap-2 px-2">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Toggle navigation"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <span className="truncate font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
              Blush With Tee
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent className="gap-0">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3, 4].map(index => (
                <div key={index} className="h-8 animate-pulse rounded-lg bg-muted/60" />
              ))}
            </div>
          ) : !sections.length ? (
            <div className="p-4 text-center group-data-[collapsible=icon]:hidden">
              <ShieldAlert className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-xs text-muted-foreground">
                No modules are assigned to your account yet. Ask an administrator to grant you a
                role.
              </p>
            </div>
          ) : (
            sections.map((section, index) => (
              <SidebarGroup key={section.label || `root-${index}`} className="py-1">
                {section.label ? (
                  <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.14em]">
                    {section.label}
                  </SidebarGroupLabel>
                ) : null}
                <SidebarMenu>
                  {section.items.map(item => {
                    const isActive = pathname === item.path;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => router.push(item.path)}
                          tooltip={item.label}
                          className="h-9 font-normal"
                        >
                          <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
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

        <SidebarFooter className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center">
                <Avatar className="h-9 w-9 shrink-0 border">
                  <AvatarFallback className="text-xs font-medium">
                    {user?.name?.charAt(0).toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <span className="block truncate text-sm font-medium leading-none">
                    {user?.name || "Account"}
                  </span>
                  <span className="mt-1.5 block truncate text-xs text-muted-foreground">
                    {roles.map(role => role.name).join(", ") || user?.email || "-"}
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

      <SidebarInset>
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border/60 bg-background/90 px-3 backdrop-blur sm:px-5">
          <SidebarTrigger className="h-9 w-9 shrink-0 rounded-lg md:hidden" />
          <div className="flex-1">
            <GlobalSearch />
          </div>
          <NotificationBell />
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <span className="sr-only">{activeLabel ?? "Dashboard"}</span>
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
