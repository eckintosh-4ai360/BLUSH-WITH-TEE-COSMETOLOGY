"use client";

import { useState } from "react";
import { Award, ExternalLink, Ban } from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import { toast } from "@blush/ui/components/ui/sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import { IssueCertificateDialog } from "@/components/certificates/IssueCertificateDialog";
import { RevokeCertificateDialog } from "@/components/certificates/RevokeCertificateDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { collectAllPages } from "@/lib/exportAll";
import { trpc } from "@/lib/trpc";

type CertificateRow = {
  id: number;
  certificateNumber: string;
  verificationToken: string;
  studentName: string;
  studentNumber: string;
  courseTitle: string;
  finalGrade: string | null;
  status: string;
  completionDate: Date;
  issuedAt: Date;
};

/** Where the public verification page lives, for the copyable link. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

export default function CertificatesPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["certificates.read"]}>
        <CertificatesContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function CertificatesContent() {
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [issueOpen, setIssueOpen] = useState(false);
  const [revoking, setRevoking] = useState<CertificateRow | null>(null);

  const utils = trpc.useUtils();

  // Shared by the table and by export, so a download covers exactly what the
  // filters describe rather than the page on screen.
  const filters = {
    sortDir: "desc" as const,
    search: search || undefined,
    status: status === "all" ? undefined : (status as "issued" | "revoked"),
  };

  const query = trpc.certificates.list.useQuery({ ...filters, page, pageSize: 25 });

  const columns: Column<CertificateRow>[] = [
    {
      key: "certificateNumber",
      header: "Certificate",
      cell: row => <span className="font-medium text-foreground">{row.certificateNumber}</span>,
    },
    {
      key: "studentName",
      header: "Student",
      cell: row => (
        <span>
          <span className="text-foreground">{row.studentName}</span>
          <span className="block text-xs text-muted-foreground">{row.studentNumber}</span>
        </span>
      ),
    },
    { key: "courseTitle", header: "Course" },
    { key: "finalGrade", header: "Grade", cell: row => row.finalGrade ?? "-" },
    {
      key: "completionDate",
      header: "Completed",
      cell: row => new Date(row.completionDate).toLocaleDateString("en-GB"),
      value: row => new Date(row.completionDate).toISOString().slice(0, 10),
    },
    {
      key: "status",
      header: "Status",
      cell: row => (
        <Badge
          className={`capitalize ${
            row.status === "revoked"
              ? "bg-rose-500/15 text-rose-800 hover:bg-rose-500/15 dark:text-rose-300"
              : "bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-300"
          }`}
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: "verify",
      header: "",
      align: "right",
      cell: row => (
        <span className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" className="gap-1.5" asChild>
            <a
              href={`${SITE_URL}/verify?c=${encodeURIComponent(row.verificationToken)}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Verify
            </a>
          </Button>
          {can("certificates.write") && row.status === "issued" ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive"
              onClick={() => setRevoking(row)}
            >
              <Ban className="h-3.5 w-3.5" />
              Revoke
            </Button>
          ) : null}
        </span>
      ),
      value: () => "",
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <DataTable
        title="Certificates"
        description="Awards issued, each with a public verification link."
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
        searchPlaceholder="Search by certificate number or student..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        exportFileName="certificates"
        fetchAllRows={() =>
          collectAllPages((page, pageSize) =>
            utils.certificates.list.fetch({ ...filters, page, pageSize }),
          )
        }
        emptyMessage="No certificates have been issued yet."
        filters={
          <Select
            value={status}
            onValueChange={value => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[10rem]" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="issued">Issued</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
            </SelectContent>
          </Select>
        }
        actions={
          can("certificates.write") ? (
            <Button className="gap-2" onClick={() => setIssueOpen(true)}>
              <Award className="h-4 w-4" />
              Issue certificate
            </Button>
          ) : null
        }
      />

      <IssueCertificateDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        onIssued={number => {
          toast.success(`Certificate ${number} issued.`);
          query.refetch();
        }}
      />

      <RevokeCertificateDialog
        certificate={revoking}
        onOpenChange={open => !open && setRevoking(null)}
        onRevoked={() => {
          toast.success("Certificate revoked.");
          setRevoking(null);
          query.refetch();
        }}
      />
    </div>
  );
}
