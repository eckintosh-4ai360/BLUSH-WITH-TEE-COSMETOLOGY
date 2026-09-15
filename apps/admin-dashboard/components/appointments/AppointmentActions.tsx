"use client";

import { useState } from "react";
import { CalendarCheck2, Loader2, RotateCcw, UserX, X } from "lucide-react";
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
import { Button } from "@blush/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import { toast } from "@blush/ui/components/ui/sonner";
import { trpc } from "@/lib/trpc";

export type AppointmentStatus =
  | "requested"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type TeamMember = { userId: number | null; fullName: string | null };

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const UNASSIGNED = "unassigned";

const SUCCESS: Record<AppointmentStatus, string> = {
  requested: "Booking moved back to requested.",
  confirmed: "Booking confirmed.",
  completed: "Booking marked completed.",
  cancelled: "Booking cancelled.",
  no_show: "Booking marked as a no-show.",
};

// Confirming, completing, cancelling and assigning one booking.
export function AppointmentActions({
  appointment,
  team,
  variant = "full",
  onChanged,
}: {
  appointment: {
    id: number;
    reference: string;
    customerName: string;
    status: AppointmentStatus;
    assignedStaffUserId: number | null;
  };
  team: TeamMember[];
  // "compact" is the single status picker used in the history table.
  variant?: "full" | "compact";
  onChanged: () => void;
}) {
  const [pendingCancel, setPendingCancel] = useState(false);

  const update = trpc.staff.updateAppointment.useMutation({
    onSuccess: (result, variables) => {
      if (variables.status) {
        toast.success(SUCCESS[result.status], {
          description: result.clientMessaged
            ? "The client is told by text or email where messaging is switched on."
            : undefined,
        });
      } else {
        toast.success("Booking reassigned.");
      }
      onChanged();
    },
    onError: error => toast.error(error.message),
  });

  const setStatus = (status: AppointmentStatus) => {
    if (status === appointment.status) return;
    if (status === "cancelled") {
      setPendingCancel(true);
      return;
    }
    update.mutate({ appointmentId: appointment.id, status });
  };

  const assignable = team.filter(
    (member): member is { userId: number; fullName: string | null } => member.userId !== null,
  );

  const busy = update.isPending;

  return (
    <>
      {variant === "compact" ? (
        <Select
          value={appointment.status}
          onValueChange={value => setStatus(value as AppointmentStatus)}
          disabled={busy}
        >
          <SelectTrigger
            className="h-8 w-[9.5rem] rounded-full text-xs"
            aria-label={`Status of booking ${appointment.reference}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABELS) as AppointmentStatus[]).map(status => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#9ee6ec]/45 pt-4 dark:border-white/10">
          {appointment.status === "requested" ? (
            <Button
              type="button"
              size="sm"
              className="rounded-full bg-[#22aeb6] text-white hover:bg-[#1b969d]"
              disabled={busy}
              onClick={() => setStatus("confirmed")}
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CalendarCheck2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Confirm
            </Button>
          ) : null}

          {appointment.status === "confirmed" ? (
            <>
              <Button
                type="button"
                size="sm"
                className="rounded-full bg-[#22aeb6] text-white hover:bg-[#1b969d]"
                disabled={busy}
                onClick={() => setStatus("completed")}
              >
                <CalendarCheck2 className="mr-1.5 h-3.5 w-3.5" />
                Completed
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full bg-white/60 dark:bg-white/5"
                disabled={busy}
                onClick={() => setStatus("no_show")}
              >
                <UserX className="mr-1.5 h-3.5 w-3.5" />
                No-show
              </Button>
            </>
          ) : null}

          {appointment.status === "requested" || appointment.status === "confirmed" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full bg-white/60 text-[#a33e57] hover:text-[#a33e57] dark:bg-white/5 dark:text-[#f0a5b8]"
              disabled={busy}
              onClick={() => setStatus("cancelled")}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel booking
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full bg-white/60 dark:bg-white/5"
              disabled={busy}
              onClick={() => setStatus("confirmed")}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reopen as confirmed
            </Button>
          )}

          {assignable.length ? (
            <Select
              value={
                appointment.assignedStaffUserId
                  ? String(appointment.assignedStaffUserId)
                  : UNASSIGNED
              }
              onValueChange={value =>
                update.mutate({
                  appointmentId: appointment.id,
                  assignedStaffUserId: value === UNASSIGNED ? null : Number(value),
                })
              }
              disabled={busy}
            >
              <SelectTrigger
                className="ml-auto h-8 w-[11rem] rounded-full text-xs"
                aria-label={`Who handles booking ${appointment.reference}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Not assigned</SelectItem>
                {assignable.map(member => (
                  <SelectItem key={member.userId} value={String(member.userId)}>
                    {member.fullName ?? "Staff member"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      )}

      <AlertDialog open={pendingCancel} onOpenChange={setPendingCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {appointment.customerName}&apos;s booking?</AlertDialogTitle>
            <AlertDialogDescription>
              Booking {appointment.reference} is marked cancelled, and the client is told by
              text where messaging is switched on. You can reopen it afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep booking</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() =>
                update.mutate({ appointmentId: appointment.id, status: "cancelled" })
              }
            >
              Cancel booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
