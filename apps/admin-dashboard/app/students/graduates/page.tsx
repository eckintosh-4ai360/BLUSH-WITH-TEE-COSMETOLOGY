"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { toast } from "@blush/ui/components/ui/sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@blush/ui/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { collectAllPages } from "@/lib/exportAll";
import { trpc } from "@/lib/trpc";

type GraduateRow = {
  id: number;
  studentNumber: string;
  fullName: string;
  email: string;
  phone: string;
  graduatedAt: Date | null;
  programmes: { id: number; courseTitle: string; status: string }[];
  certificates: { id: number; certificateNumber: string; courseTitle: string }[];
};

function formatDate(value: Date | string | null) {
  return value ? new Date(value).toLocaleDateString("en-GB") : "—";
}

export default function GraduatesPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["students.read"]}>
        <GraduatesContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function GraduatesContent() {
  const router = useRouter();
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [course, setCourse] = useState("all");
  const [reinstating, setReinstating] = useState<GraduateRow | null>(null);

  const utils = trpc.useUtils();
  const courses = trpc.content.courses.useQuery();

  const filters = {
    sortDir: "desc" as const,
    search: search || undefined,
    courseId: course === "all" ? undefined : Number(course),
  };

  const query = trpc.students.graduates.useQuery({ ...filters, page, pageSize: 25 });

  const reinstate = trpc.students.reinstate.useMutation({
    onSuccess: result => {
      setReinstating(null);
      toast.success(`${result.studentNumber} is back on the student register.`);
      query.refetch();
    },
    onError: error => toast.error(error.message),
  });

  const columns: Column<GraduateRow>[] = [
    {
      key: "fullName",
      header: "Graduate",
      cell: row => (
        <span>
          <span className="font-medium text-foreground">{row.fullName}</span>
          <span className="block text-xs text-muted-foreground">{row.email}</span>
        </span>
      ),
    },
    {
      key: "studentNumber",
      header: "Student number",
      cell: row => <span className="whitespace-nowrap">{row.studentNumber}</span>,
    },
    { key: "phone", header: "Phone", optional: true },
    {
      key: "programmes",
      header: "Programme",
      cell: row =>
        row.programmes.length ? (
          <span className="space-y-1">
            {row.programmes.map(programme => (
              <span key={programme.id} className="block text-foreground">
                {programme.courseTitle}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      value: row => row.programmes.map(programme => programme.courseTitle).join("; "),
    },
    {
      key: "certificates",
      header: "Certificate",
      // A graduate without an award yet is the thing worth seeing here: it is
      // the queue of certificates still to issue.
      cell: row =>
        row.certificates.length ? (
          <span className="space-y-1">
            {row.certificates.map(certificate => (
              <Badge
                key={certificate.id}
                className="block w-fit bg-violet-500/15 text-violet-800 hover:bg-violet-500/15 dark:text-violet-300"
              >
                {certificate.certificateNumber}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not yet issued</span>
        ),
      value: row =>
        row.certificates.map(certificate => certificate.certificateNumber).join("; "),
    },
    {
      key: "graduatedAt",
      header: "Graduated",
      cell: row => (
        <span className="whitespace-nowrap">{formatDate(row.graduatedAt)}</span>
      ),
      value: row =>
        row.graduatedAt ? new Date(row.graduatedAt).toISOString().slice(0, 10) : "",
    },
    ...(can("students.write")
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: GraduateRow) => (
              <span className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={event => {
                    event.stopPropagation();
                    setReinstating(row);
                  }}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Return to register
                </Button>
              </span>
            ),
            value: () => "",
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <DataTable
        title="Graduates"
        description="Studies finished, records kept."
        columns={columns}
        data={query.data}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        error={query.error ? { message: query.error.message } : null}
        search={search}
        onSearchChange={value => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search by name, student number, email or phone..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        // The fee account outlives graduation, so it is still where the row
        // leads - for anyone allowed to read it.
        onRowClick={
          can("fees.read") ? row => router.push(`/students/${row.id}`) : undefined
        }
        exportFileName="graduates"
        fetchAllRows={() =>
          collectAllPages((page, pageSize) =>
            utils.students.graduates.fetch({ ...filters, page, pageSize }),
          )
        }
        emptyMessage="Nobody has graduated yet."
        filters={
          <Select
            value={course}
            onValueChange={value => {
              setCourse(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[13rem]" aria-label="Filter by programme">
              <SelectValue placeholder="All programmes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All programmes</SelectItem>
              {courses.data?.map(item => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {item.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <AlertDialog
        open={reinstating !== null}
        onOpenChange={open => !open && setReinstating(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Put {reinstating?.fullName} back on the student register?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This undoes a graduation recorded in error. They become active again and
              the graduation date is cleared. Completed programmes stay completed, and
              any certificate already issued is untouched — revoke it separately if it
              should not stand.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reinstate.isPending}>
              Keep as graduate
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={reinstate.isPending}
              onClick={event => {
                event.preventDefault();
                if (reinstating) reinstate.mutate({ id: reinstating.id });
              }}
            >
              {reinstate.isPending ? "Returning..." : "Return to register"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
