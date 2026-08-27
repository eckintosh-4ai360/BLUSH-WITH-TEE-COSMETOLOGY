"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { toast } from "@blush/ui/components/ui/sonner";
import { formatMoney } from "@blush/ui/lib/viz";
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { collectAllPages } from "@/lib/exportAll";
import { trpc } from "@/lib/trpc";

type OwingRow = {
  studentId: number;
  studentNumber: string;
  fullName: string;
  email: string;
  phone: string;
  status: string;
  totalFees: number;
  amountPaid: number;
  outstanding: number;
};

export default function OutstandingFeesPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["fees.read"]}>
        <OutstandingFeesContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function OutstandingFeesContent() {
  const router = useRouter();
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [payingStudentId, setPayingStudentId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  // Shared by the table and by export, so a download covers exactly what the
  // filters describe rather than the page on screen.
  const filters = { sortDir: "desc" as const, search: search || undefined };

  const query = trpc.finance.outstanding.useQuery({ ...filters, page, pageSize: 25 });

  const columns: Column<OwingRow>[] = [
    {
      key: "fullName",
      header: "Student",
      cell: row => (
        <span>
          <span className="font-medium text-foreground">{row.fullName}</span>
          <span className="block text-xs text-muted-foreground">{row.studentNumber}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: row => (
        <Badge variant="outline" className="capitalize">
          {row.status}
        </Badge>
      ),
    },
    { key: "phone", header: "Phone", optional: true },
    { key: "email", header: "Email", optional: true },
    {
      key: "totalFees",
      header: "Total fees",
      align: "right",
      cell: row => formatMoney(row.totalFees),
      value: row => row.totalFees,
    },
    {
      key: "amountPaid",
      header: "Paid",
      align: "right",
      cell: row => formatMoney(row.amountPaid),
      value: row => row.amountPaid,
    },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right",
      cell: row => (
        <span className="font-semibold text-foreground">{formatMoney(row.outstanding)}</span>
      ),
      value: row => row.outstanding,
    },
    ...(can("payments.write")
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: OwingRow) => (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => setPayingStudentId(row.studentId)}
              >
                <Receipt className="h-3.5 w-3.5" />
                Record
              </Button>
            ),
            value: () => "",
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <DataTable
        title="Outstanding fees"
        description="Students carrying a balance, largest first."
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
        searchPlaceholder="Search by name or student number..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.studentId}
        onRowClick={row => router.push(`/students/${row.studentId}`)}
        exportFileName="outstanding-fees"
        fetchAllRows={() =>
          collectAllPages((page, pageSize) =>
            utils.finance.outstanding.fetch({ ...filters, page, pageSize }),
          )
        }
        emptyMessage="Every student is up to date."
      />

      <RecordPaymentDialog
        open={payingStudentId !== null}
        studentId={payingStudentId ?? undefined}
        onOpenChange={open => !open && setPayingStudentId(null)}
        onRecorded={() => {
          toast.success("Payment recorded and the balance updated.");
          setPayingStudentId(null);
          query.refetch();
        }}
      />
    </div>
  );
}
