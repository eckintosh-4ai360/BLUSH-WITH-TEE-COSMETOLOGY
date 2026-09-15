"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@blush/ui/components/ui/card";
import { Checkbox } from "@blush/ui/components/ui/checkbox";
import { Input } from "@blush/ui/components/ui/input";
import { Label } from "@blush/ui/components/ui/label";
import { toast } from "@blush/ui/components/ui/sonner";
import { trpc } from "@/lib/trpc";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

type Draft = {
  openDays: number[];
  opensAt: string;
  closesAt: string;
  noticeHours: string;
  maxDaysAhead: string;
  bookingsPerSlot: string;
};

// When the website takes bookings. Bookings made at the desk are not held to these hours.
export function BookingHoursCard({ writable }: { writable: boolean }) {
  const query = trpc.services.bookingRules.useQuery();
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!query.data) return;
    setDraft({
      openDays: query.data.openDays,
      opensAt: query.data.opensAt,
      closesAt: query.data.closesAt,
      noticeHours: String(query.data.minNoticeMinutes / 60),
      maxDaysAhead: String(query.data.maxDaysAhead),
      bookingsPerSlot: String(query.data.bookingsPerSlot),
    });
  }, [query.data]);

  const save = trpc.services.saveBookingRules.useMutation({
    onSuccess: saved => {
      toast.success(`Online booking hours saved: ${saved.summary}.`);
      void query.refetch();
    },
    onError: error => toast.error(error.message),
  });

  const update = (change: Partial<Draft>) => setDraft(current => (current ? { ...current, ...change } : current));

  const toggleDay = (day: number, checked: boolean) =>
    update({
      openDays: checked
        ? [...(draft?.openDays ?? []), day]
        : (draft?.openDays ?? []).filter(value => value !== day),
    });

  const submit = () => {
    if (!draft) return;
    const noticeHours = Number(draft.noticeHours);
    const maxDaysAhead = Number(draft.maxDaysAhead);
    const bookingsPerSlot = Number(draft.bookingsPerSlot);
    if (!Number.isFinite(noticeHours) || noticeHours < 0 || noticeHours > 168) {
      toast.error("Notice must be between 0 and 168 hours.");
      return;
    }
    if (!Number.isInteger(maxDaysAhead) || maxDaysAhead < 1 || maxDaysAhead > 365) {
      toast.error("Days ahead must be a whole number from 1 to 365.");
      return;
    }
    if (!Number.isInteger(bookingsPerSlot) || bookingsPerSlot < 1 || bookingsPerSlot > 50) {
      toast.error("Bookings at the same time must be a whole number from 1 to 50.");
      return;
    }
    save.mutate({
      openDays: draft.openDays,
      opensAt: draft.opensAt,
      closesAt: draft.closesAt,
      minNoticeMinutes: Math.round(noticeHours * 60),
      maxDaysAhead,
      bookingsPerSlot,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Online booking hours</CardTitle>
        <CardDescription>
          {query.data
            ? `The website takes bookings ${query.data.openDays.length ? query.data.summary.charAt(0).toLowerCase() + query.data.summary.slice(1) : "on no days: online booking is closed"}, Ghana time. Bookings made here at the desk are not limited by these hours.`
            : "When the website takes bookings."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.error ? (
          <p className="text-sm text-destructive">{query.error.message}</p>
        ) : !draft ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading booking hours…
          </p>
        ) : (
          <div className="space-y-5">
            <fieldset className="space-y-2" disabled={!writable}>
              <legend className="text-sm font-medium">Open days</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {DAYS.map(day => (
                  <label key={day.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={draft.openDays.includes(day.value)}
                      disabled={!writable}
                      onCheckedChange={checked => toggleDay(day.value, checked === true)}
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1.5">
                <Label htmlFor="booking-opens">Opens</Label>
                <Input
                  id="booking-opens"
                  type="time"
                  value={draft.opensAt}
                  disabled={!writable}
                  onChange={event => update({ opensAt: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="booking-closes">Closes</Label>
                <Input
                  id="booking-closes"
                  type="time"
                  value={draft.closesAt}
                  disabled={!writable}
                  onChange={event => update({ closesAt: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="booking-notice">Notice (hours)</Label>
                <Input
                  id="booking-notice"
                  type="number"
                  min={0}
                  max={168}
                  step={0.5}
                  value={draft.noticeHours}
                  disabled={!writable}
                  onChange={event => update({ noticeHours: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="booking-ahead">Up to (days ahead)</Label>
                <Input
                  id="booking-ahead"
                  type="number"
                  min={1}
                  max={365}
                  value={draft.maxDaysAhead}
                  disabled={!writable}
                  onChange={event => update({ maxDaysAhead: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="booking-per-slot">Bookings at once</Label>
                <Input
                  id="booking-per-slot"
                  type="number"
                  min={1}
                  max={50}
                  value={draft.bookingsPerSlot}
                  disabled={!writable}
                  onChange={event => update({ bookingsPerSlot: event.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Bookings at once is how many overlapping website bookings one service can take, for
              example how many chairs can do it at the same time. Cancelled bookings do not count.
            </p>

            {writable ? (
              <div className="flex justify-end">
                <Button onClick={submit} disabled={save.isPending} className="gap-2">
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save booking hours
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
