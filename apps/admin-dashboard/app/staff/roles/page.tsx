"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  KeyRound,
  Plus,
  ShieldCheck,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@blush/ui/components/ui/dropdown-menu";
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { toast } from "@blush/ui/components/ui/sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import {
  CreateUserDialog,
  ResetPasswordDialog,
} from "@/components/access/CreateUserDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

type AccountRow = {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  roles: string[];
  lastSignedIn: Date;
};

export default function RolesPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["roles.read"]}>
        <RolesContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function RolesContent() {
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetting, setResetting] = useState<AccountRow | null>(null);

  const roles = trpc.platform.roles.useQuery();
  const catalogue = trpc.platform.permissionCatalogue.useQuery();
  const accounts = trpc.platform.accounts.useQuery({
    page,
    pageSize: 25,
    sortDir: "desc",
    search: search || undefined,
  });

  const assign = trpc.platform.assignRole.useMutation({
    onSuccess: () => {
      toast.success("Role granted.");
      accounts.refetch();
    },
    onError: error => toast.error(error.message),
  });

  const revoke = trpc.platform.revokeRole.useMutation({
    onSuccess: () => {
      toast.success("Role removed.");
      accounts.refetch();
    },
    onError: error => toast.error(error.message),
  });

  const setActive = trpc.platform.setUserActive.useMutation({
    onSuccess: () => {
      toast.success("Account updated.");
      accounts.refetch();
    },
    onError: error => toast.error(error.message),
  });

  const roleList = roles.data ?? [];

  const columns: Column<AccountRow>[] = [
    {
      key: "name",
      header: "Account",
      cell: row => (
        <span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{row.name ?? "Unnamed"}</span>
            {!row.isActive ? (
              <Badge variant="outline" className="text-destructive">
                Deactivated
              </Badge>
            ) : null}
            {row.mustChangePassword ? (
              <Badge className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300">
                Temporary password
              </Badge>
            ) : null}
          </span>
          <span className="block text-xs text-muted-foreground">{row.email ?? "-"}</span>
        </span>
      ),
      value: row => row.name ?? "",
    },
    {
      key: "roles",
      header: "Roles",
      cell: row =>
        row.roles.length ? (
          <span className="flex flex-wrap gap-1">
            {row.roles.map(roleKey => (
              <Badge key={roleKey} variant="secondary" className="capitalize">
                {roleKey.replaceAll("_", " ")}
                {can("roles.write") ? (
                  <button
                    type="button"
                    aria-label={`Remove ${roleKey}`}
                    className="ml-1 opacity-60 hover:opacity-100"
                    onClick={() => revoke.mutate({ userId: row.id, role: roleKey })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            No role - falls back to {row.role}
          </span>
        ),
      value: row => row.roles.join(" "),
    },
    {
      key: "lastSignedIn",
      header: "Last seen",
      cell: row => new Date(row.lastSignedIn).toLocaleDateString("en-GB"),
      value: row => new Date(row.lastSignedIn).toISOString().slice(0, 10),
    },
    ...(can("roles.write")
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: AccountRow) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5">
                    Manage
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Grant a role</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {roleList
                    .filter(role => !row.roles.includes(role.key))
                    .map(role => (
                      <DropdownMenuItem
                        key={role.key}
                        className="cursor-pointer"
                        onClick={() => assign.mutate({ userId: row.id, role: role.key })}
                      >
                        {role.name}
                      </DropdownMenuItem>
                    ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer" onClick={() => setResetting(row)}>
                    <KeyRound className="mr-2 h-3.5 w-3.5" />
                    Reset password
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={`cursor-pointer ${row.isActive ? "text-destructive focus:text-destructive" : ""}`}
                    onClick={() =>
                      setActive.mutate({ userId: row.id, isActive: !row.isActive })
                    }
                  >
                    {row.isActive ? (
                      <>
                        <UserX className="mr-2 h-3.5 w-3.5" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <UserCheck className="mr-2 h-3.5 w-3.5" />
                        Restore access
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
            value: () => "",
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <DataTable
        title="Access"
        description="Who can reach which parts of the system."
        columns={columns}
        data={accounts.data}
        isLoading={accounts.isLoading}
        isFetching={accounts.isFetching}
        error={accounts.error ? { message: accounts.error.message } : null}
        search={search}
        onSearchChange={value => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search by name or email..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No accounts match this search."
        actions={
          can("roles.write") ? (
            <Button className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create account
            </Button>
          ) : null
        }
      />

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        roles={roleList.map(role => ({
          key: role.key,
          name: role.name,
          description: role.description,
        }))}
        onCreated={email => {
          toast.success(`Account created for ${email}.`);
          accounts.refetch();
        }}
      />

      <ResetPasswordDialog
        account={resetting}
        onOpenChange={open => !open && setResetting(null)}
        onReset={() => {
          toast.success("Password reset. They will choose a new one on next sign-in.");
          setResetting(null);
          accounts.refetch();
        }}
      />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            What each role can do
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every one of these is enforced on the server. Hiding a menu item is a courtesy; the
            API refuses the call either way.
          </p>
        </div>

        {roles.isLoading || catalogue.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map(index => (
              <Skeleton key={index} className="h-40 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {roleList.map(role => (
              <article
                key={role.key}
                className="rounded-2xl border border-border/60 bg-card p-5"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">{role.name}</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{role.description}</p>

                {!role.permissions.length ? (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Portal access only - no back-office permissions.
                  </p>
                ) : (
                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {role.permissions.slice(0, 10).map(permission => (
                      <li
                        key={permission}
                        className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {permission}
                      </li>
                    ))}
                    {role.permissions.length > 10 ? (
                      <li className="rounded-md px-2 py-0.5 text-[11px] text-muted-foreground">
                        +{role.permissions.length - 10} more
                      </li>
                    ) : null}
                  </ul>
                )}
              </article>
            ))}
          </div>
        )}

        {catalogue.data ? (
          <details className="rounded-2xl border border-border/60 bg-card p-5">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Full permission catalogue
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalogue.data.map(group => (
                <div key={group.module}>
                  <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {group.module}
                  </h4>
                  <ul className="mt-2 space-y-1">
                    {group.entries.map(entry => (
                      <li key={entry.key} className="flex items-start gap-1.5 text-xs">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                        <span>
                          <span className="block font-medium text-foreground">{entry.key}</span>
                          <span className="text-muted-foreground">{entry.description}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </section>
    </div>
  );
}
