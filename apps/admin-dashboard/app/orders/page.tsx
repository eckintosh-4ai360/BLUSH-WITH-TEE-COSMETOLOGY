"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@blush/ui/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import { formatMoney } from "@blush/ui/lib/viz";
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import { FULFILLMENT_TONE } from "@/lib/orderStatus";
import { trpc } from "@/lib/trpc";

const FULFILLMENT = [
  "new",
  "confirmed",
  "processing",
  "ready",
  "shipped",
  "delivered",
  "cancelled",
] as const;

const PAYMENT = ["pending", "paid", "refunded", "failed"] as const;

type OrderRow = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  total: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: Date;
};

export default function OrdersPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["orders.read"]}>
        <OrdersContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function OrdersContent() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [fulfillment, setFulfillment] = useState("all");
  const [payment, setPayment] = useState("all");

  const query = trpc.orders.list.useQuery({
    page,
    pageSize: 25,
    sortDir: "desc",
    search: search || undefined,
    fulfillmentStatus:
      fulfillment === "all" ? undefined : (fulfillment as (typeof FULFILLMENT)[number]),
    paymentStatus: payment === "all" ? undefined : (payment as (typeof PAYMENT)[number]),
  });

  const columns: Column<OrderRow>[] = [
    {
      key: "orderNumber",
      header: "Order",
      cell: row => <span className="font-medium text-foreground">{row.orderNumber}</span>,
    },
    {
      key: "customerName",
      header: "Customer",
      cell: row => (
        <span>
          <span className="text-foreground">{row.customerName}</span>
          <span className="block text-xs text-muted-foreground">{row.customerPhone}</span>
        </span>
      ),
    },
    { key: "customerEmail", header: "Email", optional: true },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: row => formatMoney(row.total),
      value: row => row.total,
    },
    {
      key: "paymentStatus",
      header: "Payment",
      cell: row => (
        <Badge
          variant={row.paymentStatus === "paid" ? "secondary" : "outline"}
          className="capitalize"
        >
          {row.paymentStatus}
        </Badge>
      ),
    },
    {
      key: "fulfillmentStatus",
      header: "Fulfilment",
      cell: row => (
        <Badge className={`capitalize ${FULFILLMENT_TONE[row.fulfillmentStatus] ?? ""}`}>
          {row.fulfillmentStatus}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      header: "Placed",
      cell: row => new Date(row.createdAt).toLocaleDateString("en-GB"),
      value: row => new Date(row.createdAt).toISOString().slice(0, 10),
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <DataTable
        title="Orders"
        description="Storefront orders, from placement through to delivery."
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
        searchPlaceholder="Search by order number, customer, email or phone..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        onRowClick={row => router.push(`/orders/${row.id}`)}
        exportFileName="orders"
        emptyMessage="No orders match these filters."
        footer={
          query.data ? (
            <span className="mr-2 text-xs text-muted-foreground">
              Filtered total:{" "}
              <span className="font-semibold text-foreground">
                {formatMoney(query.data.filteredTotal)}
              </span>
            </span>
          ) : null
        }
        filters={
          <>
            <Select
              value={fulfillment}
              onValueChange={value => {
                setFulfillment(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[11rem]" aria-label="Filter by fulfilment status">
                <SelectValue placeholder="All stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {FULFILLMENT.map(item => (
                  <SelectItem key={item} value={item} className="capitalize">
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={payment}
              onValueChange={value => {
                setPayment(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[10rem]" aria-label="Filter by payment status">
                <SelectValue placeholder="All payments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                {PAYMENT.map(item => (
                  <SelectItem key={item} value={item} className="capitalize">
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />
    </div>
  );
}
