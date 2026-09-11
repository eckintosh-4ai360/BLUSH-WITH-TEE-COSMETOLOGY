"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Home,
  MapPin,
  Plus,
  RefreshCw,
  Scissors,
} from "lucide-react";
import { Calendar } from "@blush/ui/components/ui/calendar";
import { Button } from "@blush/ui/components/ui/button";
import DashboardLayout from "@/components/DashboardLayout";
import { NewAppointmentDialog } from "@/components/appointments/NewAppointmentDialog";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

type AppointmentLocation = "salon" | "home";
type LocationFilter = "all" | AppointmentLocation;
type AppointmentStatus =
  | "requested"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";
type HistoryStatusFilter = "all" | AppointmentStatus;

type AppointmentRow = {
  appointment: {
    id: number;
    reference: string;
    customerName: string;
    customerEmail: string | null;
    customerPhone: string;
    startsAt: Date | string;
    location: AppointmentLocation;
    locationDetails: string | null;
    note: string | null;
    status: AppointmentStatus;
  };
  serviceName: string;
  durationMinutes: number;
};

const locationFilters: { value: LocationFilter; label: string }[] = [
  { value: "all", label: "All services" },
  { value: "salon", label: "Salon" },
  { value: "home", label: "Home service" },
];

const historyStatusFilters: { value: HistoryStatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "requested", label: "Requested" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" },
];

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const appointmentDate = (row: AppointmentRow) =>
  new Date(row.appointment.startsAt);

const formatMonth = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "long", year: "numeric" });

const formatDay = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const formatTime = (date: Date) =>
  date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

const statusLabel = (status: AppointmentStatus) =>
  status.replaceAll("_", " ").replace(/^./, value => value.toUpperCase());

const statusClass = (status: AppointmentStatus) => {
  switch (status) {
    case "confirmed":
      return "bg-[#e2f6ed] text-[#287454] dark:bg-[#173a2d] dark:text-[#9fe0bd]";
    case "completed":
      return "bg-[#e8eef9] text-[#41628f] dark:bg-[#1d2b43] dark:text-[#abc7f2]";
    case "cancelled":
    case "no_show":
      return "bg-[#fbe7eb] text-[#a33e57] dark:bg-[#42232d] dark:text-[#f0a5b8]";
    default:
      return "bg-[#fff3d9] text-[#916d18] dark:bg-[#44371d] dark:text-[#efd28a]";
  }
};

const locationLabel = (location: AppointmentLocation) =>
  location === "home" ? "Home service" : "Salon";

export default function AppointmentsPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["appointments.read"]}>
        <AppointmentsCalendar />
      </PermissionGate>
    </DashboardLayout>
  );
}

function AppointmentsCalendar() {
  const { can } = usePermissions();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const appointmentsQuery = trpc.staff.appointments.useQuery();

  const appointments = (appointmentsQuery.data ?? []) as AppointmentRow[];
  const visibleAppointments = useMemo(
    () =>
      appointments.filter(
        row =>
          locationFilter === "all" ||
          row.appointment.location === locationFilter
      ),
    [appointments, locationFilter]
  );

  const appointmentsByDay = useMemo(() => {
    const grouped = new Map<string, AppointmentRow[]>();
    for (const row of visibleAppointments) {
      const key = dateKey(appointmentDate(row));
      const current = grouped.get(key) ?? [];
      current.push(row);
      grouped.set(key, current);
    }
    return grouped;
  }, [visibleAppointments]);

  const selectedAppointments =
    appointmentsByDay.get(dateKey(selectedDate)) ?? [];
  const monthAppointments = visibleAppointments.filter(row => {
    const date = appointmentDate(row);
    return (
      date.getFullYear() === month.getFullYear() &&
      date.getMonth() === month.getMonth()
    );
  });
  const monthSalonCount = monthAppointments.filter(
    row => row.appointment.location === "salon"
  ).length;
  const monthHomeCount = monthAppointments.filter(
    row => row.appointment.location === "home"
  ).length;
  const eventDates = [...appointmentsByDay.keys()].map(key => {
    const [year, monthNumber, day] = key.split("-").map(Number);
    return new Date(year, monthNumber - 1, day);
  });

  function selectMonth(nextMonth: Date) {
    const next = startOfMonth(nextMonth);
    setMonth(next);
    setSelectedDate(next);
  }

  function selectToday() {
    const today = new Date();
    setMonth(startOfMonth(today));
    setSelectedDate(today);
  }

  function handleAppointmentCreated(startsAt: Date) {
    setMonth(startOfMonth(startsAt));
    setSelectedDate(startsAt);
    void appointmentsQuery.refetch();
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-10">
      <header className="admin-glass-card relative overflow-hidden rounded-[1.55rem] border p-6 sm:p-8">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(116deg,rgba(226,252,255,0.82),rgba(249,247,255,0.58)_52%,rgba(255,249,241,0.72))] dark:bg-[linear-gradient(116deg,rgba(16,44,54,0.72),rgba(24,28,52,0.5)_52%,rgba(44,20,42,0.6))]"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#22aeb6] dark:text-[#3fd0d8]">
              Salon schedule
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[#263746] dark:text-[#e4f4f7]">
              Appointments
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              See every salon and home-service booking by day, then plan the
              team around what is coming up.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can("appointments.write") ? (
              <Button
                type="button"
                className="rounded-full bg-[#22aeb6] text-white shadow-[0_10px_24px_rgba(34,174,182,0.2)] hover:bg-[#1b969d]"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                New appointment
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="rounded-full bg-white/60 dark:bg-white/5"
              onClick={selectToday}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full bg-white/60 dark:bg-white/5"
              onClick={() => appointmentsQuery.refetch()}
              disabled={appointmentsQuery.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${appointmentsQuery.isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label={`${formatMonth(month)} bookings`}
          value={monthAppointments.length}
          icon={CalendarDays}
          tone="teal"
        />
        <SummaryCard
          label="Salon appointments"
          value={monthSalonCount}
          icon={Scissors}
          tone="purple"
        />
        <SummaryCard
          label="Home services"
          value={monthHomeCount}
          icon={Home}
          tone="amber"
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#263746] dark:text-[#e4f4f7]">
            Filter the calendar
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose which service locations appear on the calendar.
          </p>
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Appointment location filter"
        >
          {locationFilters.map(filter => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={locationFilter === filter.value}
              onClick={() => setLocationFilter(filter.value)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                locationFilter === filter.value
                  ? "border-[#22aeb6] bg-[#22aeb6] text-white shadow-[0_8px_20px_rgba(34,174,182,0.18)]"
                  : "border-[#9ee6ec]/70 bg-white/60 text-[#55707b] hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-[#b8d2d7] dark:hover:bg-white/10"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section className="admin-glass-card min-w-0 rounded-[1.35rem] border p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6f8a95] dark:text-[#9fc1c8]">
                Month view
              </p>
              <h2 className="mt-1 text-xl font-semibold text-[#263746] dark:text-[#e4f4f7]">
                {formatMonth(month)}
              </h2>
            </div>
            <p className="text-right text-xs text-muted-foreground">
              {monthAppointments.length} booking
              {monthAppointments.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl bg-white/55 p-2 dark:bg-white/5">
            <Calendar
              mode="single"
              month={month}
              onMonthChange={selectMonth}
              selected={selectedDate}
              onSelect={date => date && setSelectedDate(date)}
              showOutsideDays={false}
              className="mx-auto w-full max-w-[420px]"
              modifiers={{ hasAppointments: eventDates }}
              modifiersClassNames={{
                hasAppointments: "rounded-xl bg-[#e4f7f8] dark:bg-[#173c44]",
              }}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#22aeb6]" />
              Has appointments
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#b44ac8]" />
              Selected day
            </span>
          </div>
        </section>

        <section className="admin-glass-card min-w-0 rounded-[1.35rem] border p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#9ee6ec]/45 pb-5 dark:border-white/10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6f8a95] dark:text-[#9fc1c8]">
                Daily agenda
              </p>
              <h2 className="mt-1 text-xl font-semibold text-[#263746] dark:text-[#e4f4f7]">
                {formatDay(selectedDate)}
              </h2>
            </div>
            <span className="rounded-full bg-[#e4f7f8] px-3 py-1.5 text-xs font-semibold text-[#25727b] dark:bg-[#173c44] dark:text-[#9fe4ea]">
              {selectedAppointments.length} appointment
              {selectedAppointments.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {appointmentsQuery.isLoading ? (
              [0, 1, 2].map(item => (
                <div
                  key={item}
                  className="h-28 animate-pulse rounded-2xl bg-[#e8f7f8]/75 dark:bg-white/5"
                />
              ))
            ) : selectedAppointments.length ? (
              selectedAppointments.map(row => (
                <AppointmentCard key={row.appointment.id} row={row} />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-[#9ee6ec]/70 bg-white/35 px-5 py-12 text-center dark:border-white/15 dark:bg-white/5">
                <CalendarDays className="mx-auto h-8 w-8 text-[#86b8c0] dark:text-[#6eabb4]" />
                <p className="mt-3 text-sm font-semibold text-[#4d6672] dark:text-[#c5dce0]">
                  No appointments for this day
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Select another date or change the service-location filter.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      <AppointmentHistoryTable
        appointments={appointments}
        isLoading={appointmentsQuery.isLoading}
      />

      <NewAppointmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialDate={selectedDate}
        onSaved={handleAppointmentCreated}
      />
    </div>
  );
}

function AppointmentHistoryTable({
  appointments,
  isLoading,
}: {
  appointments: AppointmentRow[];
  isLoading: boolean;
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");

  const invalidDateRange = Boolean(fromDate && toDate && fromDate > toDate);
  const filteredAppointments = useMemo(() => {
    if (invalidDateRange) return [];

    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`) : null;

    return appointments
      .filter(row => {
        const date = appointmentDate(row);
        const matchesDate = (!from || date >= from) && (!to || date <= to);
        const matchesStatus =
          statusFilter === "all" || row.appointment.status === statusFilter;
        return matchesDate && matchesStatus;
      })
      .sort(
        (left, right) =>
          appointmentDate(right).getTime() - appointmentDate(left).getTime()
      );
  }, [appointments, fromDate, invalidDateRange, statusFilter, toDate]);

  const hasFilters = Boolean(fromDate || toDate || statusFilter !== "all");

  function clearFilters() {
    setFromDate("");
    setToDate("");
    setStatusFilter("all");
  }

  return (
    <section className="admin-glass-card rounded-[1.35rem] border p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#9ee6ec]/45 pb-5 dark:border-white/10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6f8a95] dark:text-[#9fc1c8]">
            Appointment history
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[#263746] dark:text-[#e4f4f7]">
            Track bookings
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review past, upcoming, and pending appointments by date or status.
          </p>
        </div>
        <span className="rounded-full bg-[#e4f7f8] px-3 py-1.5 text-xs font-semibold text-[#25727b] dark:bg-[#173c44] dark:text-[#9fe4ea]">
          {filteredAppointments.length} shown · {appointments.length} total
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_1.2fr_auto] md:items-end">
        <label className="grid gap-2 text-xs font-semibold text-[#55707b] dark:text-[#b8d2d7]">
          From date
          <input
            type="date"
            value={fromDate}
            onChange={event => setFromDate(event.target.value)}
            className="soft-input"
          />
        </label>
        <label className="grid gap-2 text-xs font-semibold text-[#55707b] dark:text-[#b8d2d7]">
          To date
          <input
            type="date"
            value={toDate}
            onChange={event => setToDate(event.target.value)}
            className="soft-input"
          />
        </label>
        <label className="grid gap-2 text-xs font-semibold text-[#55707b] dark:text-[#b8d2d7]">
          Status
          <select
            value={statusFilter}
            onChange={event =>
              setStatusFilter(event.target.value as HistoryStatusFilter)
            }
            className="soft-input"
          >
            {historyStatusFilters.map(filter => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          className="rounded-xl bg-white/60 dark:bg-white/5"
          onClick={clearFilters}
          disabled={!hasFilters}
        >
          Clear filters
        </Button>
      </div>

      {invalidDateRange ? (
        <p className="mt-3 text-xs font-medium text-[#b44d61] dark:text-[#f0a5b8]">
          The from date must be before or the same as the to date.
        </p>
      ) : null}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-[#9ee6ec]/45 dark:border-white/10">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="bg-[#e8f7f8]/75 text-xs uppercase tracking-[0.08em] text-[#55707b] dark:bg-white/5 dark:text-[#b8d2d7]">
            <tr>
              <th className="px-4 py-3 font-semibold">Date &amp; time</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Service</th>
              <th className="px-4 py-3 font-semibold">Location</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#9ee6ec]/35 dark:divide-white/10">
            {isLoading ? (
              [0, 1, 2].map(item => (
                <tr key={item}>
                  <td colSpan={6} className="px-4 py-4">
                    <div className="h-5 animate-pulse rounded bg-[#e8f7f8]/75 dark:bg-white/5" />
                  </td>
                </tr>
              ))
            ) : filteredAppointments.length ? (
              filteredAppointments.map(row => (
                <AppointmentHistoryRow key={row.appointment.id} row={row} />
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  No appointments match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AppointmentHistoryRow({ row }: { row: AppointmentRow }) {
  const date = appointmentDate(row);
  const isHome = row.appointment.location === "home";
  const LocationIcon = isHome ? Home : MapPin;

  return (
    <tr className="bg-white/25 transition-colors hover:bg-white/60 dark:bg-transparent dark:hover:bg-white/5">
      <td className="whitespace-nowrap px-4 py-4 align-top">
        <p className="font-semibold text-[#324956] dark:text-[#e4f4f7]">
          {formatDay(date)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatTime(date)} · {row.durationMinutes} minutes
        </p>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="font-semibold text-[#324956] dark:text-[#e4f4f7]">
          {row.appointment.customerName}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {row.appointment.customerPhone}
        </p>
      </td>
      <td className="px-4 py-4 align-top text-[#4d6974] dark:text-[#c1d9dd]">
        {row.serviceName}
      </td>
      <td className="px-4 py-4 align-top">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4d6974] dark:text-[#c1d9dd]">
          <LocationIcon className="h-3.5 w-3.5" />
          {locationLabel(row.appointment.location)}
        </span>
        {isHome && row.appointment.locationDetails ? (
          <p className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">
            {row.appointment.locationDetails}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-4 align-top">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(row.appointment.status)}`}
        >
          {statusLabel(row.appointment.status)}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-4 align-top text-xs font-medium text-muted-foreground">
        {row.appointment.reference}
      </td>
    </tr>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof CalendarDays;
  tone: "teal" | "purple" | "amber";
}) {
  const colors = {
    teal: "bg-[#e1f7f8] text-[#24818a] dark:bg-[#173c44] dark:text-[#9fe4ea]",
    purple: "bg-[#f1eafb] text-[#7653a3] dark:bg-[#302340] dark:text-[#d2b7f1]",
    amber: "bg-[#fff3df] text-[#9b711e] dark:bg-[#44371e] dark:text-[#f0d494]",
  }[tone];

  return (
    <div className="admin-glass-card flex items-center gap-4 rounded-2xl border p-4">
      <div
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${colors}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-semibold tabular-nums text-[#263746] dark:text-[#e4f4f7]">
          {value}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function AppointmentCard({ row }: { row: AppointmentRow }) {
  const date = appointmentDate(row);
  const isHome = row.appointment.location === "home";
  const LocationIcon = isHome ? Home : MapPin;

  return (
    <article className="rounded-2xl border border-[#9ee6ec]/55 bg-white/55 p-4 transition-colors hover:bg-white/75 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f7f8] text-[#25808a] dark:bg-[#173c44] dark:text-[#9fe4ea]">
            <Clock3 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-[#324956] dark:text-[#e4f4f7]">
              {formatTime(date)} · {row.serviceName}
            </p>
            <p className="mt-1 text-sm text-[#58717d] dark:text-[#b6d0d5]">
              {row.appointment.customerName}
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(row.appointment.status)}`}
        >
          {statusLabel(row.appointment.status)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium text-[#4d6974] dark:text-[#c1d9dd]">
          <LocationIcon className="h-3.5 w-3.5" />
          {locationLabel(row.appointment.location)}
        </span>
        <span>{row.durationMinutes} minutes</span>
        <span>{row.appointment.customerPhone}</span>
      </div>

      {isHome && row.appointment.locationDetails ? (
        <p className="mt-3 rounded-xl bg-[#fff5e2] px-3 py-2 text-xs text-[#76581b] dark:bg-[#44371e] dark:text-[#f0d494]">
          Home address: {row.appointment.locationDetails}
        </p>
      ) : null}
      {row.appointment.note ? (
        <p className="mt-3 text-xs italic text-muted-foreground">
          Note: {row.appointment.note}
        </p>
      ) : null}
    </article>
  );
}
