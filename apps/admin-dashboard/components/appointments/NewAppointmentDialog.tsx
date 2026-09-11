"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@blush/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blush/ui/components/ui/dialog";
import { trpc } from "@/lib/trpc";

type AppointmentLocation = "salon" | "home";
type AppointmentStatus =
  | "requested"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

const OTHER_SERVICE = "other";
const pad = (value: number) => String(value).padStart(2, "0");

function toDateTimeLocal(date: Date) {
  const value = new Date(date);
  value.setHours(9, 0, 0, 0);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function NewAppointmentDialog({
  open,
  onOpenChange,
  initialDate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate: Date;
  onSaved: (startsAt: Date) => void;
}) {
  const services = trpc.content.clinicServices.useQuery(undefined, {
    enabled: open,
  });
  const create = trpc.staff.createAppointment.useMutation({
    onSuccess: () => {
      onSaved(new Date(startsAt));
      onOpenChange(false);
    },
    onError: error => setError(error.message),
  });

  const [serviceId, setServiceId] = useState("");
  const [customServiceName, setCustomServiceName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [startsAt, setStartsAt] = useState(() => toDateTimeLocal(initialDate));
  const [location, setLocation] = useState<AppointmentLocation>("salon");
  const [locationDetails, setLocationDetails] = useState("");
  const [status, setStatus] = useState<AppointmentStatus>("confirmed");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setServiceId("");
    setCustomServiceName("");
    setCustomerName("");
    setCustomerPhone("");
    setStartsAt(toDateTimeLocal(initialDate));
    setLocation("salon");
    setLocationDetails("");
    setStatus("confirmed");
    setNote("");
    setError(null);
  }, [open, initialDate]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!serviceId) {
      setError("Choose a service.");
      return;
    }
    if (serviceId === OTHER_SERVICE && customServiceName.trim().length < 2) {
      setError("Enter the other service name.");
      return;
    }
    if (customerName.trim().length < 2) {
      setError("Enter the customer's full name.");
      return;
    }
    if (customerPhone.trim().length < 7) {
      setError("Enter a customer phone number.");
      return;
    }
    if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) {
      setError("Choose a valid appointment date and time.");
      return;
    }
    if (location === "home" && !locationDetails.trim()) {
      setError("Enter the home-service address.");
      return;
    }

    create.mutate({
      serviceId: serviceId === OTHER_SERVICE ? undefined : Number(serviceId),
      customServiceName:
        serviceId === OTHER_SERVICE ? customServiceName.trim() : undefined,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      startsAt: new Date(startsAt),
      location,
      locationDetails: locationDetails.trim() || undefined,
      note: note.trim() || undefined,
      status,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add an appointment</DialogTitle>
          <DialogDescription>
            Add a salon or home-service booking directly to the schedule. It
            will appear on the selected day after saving.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Service
              <select
                required
                value={serviceId}
                onChange={event => setServiceId(event.target.value)}
                className="soft-input"
                disabled={services.isLoading}
              >
                <option value="">
                  {services.isLoading
                    ? "Loading services..."
                    : "Choose a service"}
                </option>
                {services.data?.map(service => (
                  <option key={service.id} value={service.id}>
                    {service.name} · {service.durationMinutes} minutes
                  </option>
                ))}
                <option value={OTHER_SERVICE}>Other service...</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Appointment status
              <select
                value={status}
                onChange={event =>
                  setStatus(event.target.value as AppointmentStatus)
                }
                className="soft-input"
              >
                <option value="confirmed">Confirmed</option>
                <option value="requested">Requested</option>
                <option value="completed">Completed</option>
              </select>
            </label>
          </div>

          {serviceId === OTHER_SERVICE ? (
            <label className="grid gap-2 text-sm font-medium">
              Other service name
              <input
                required
                value={customServiceName}
                onChange={event => setCustomServiceName(event.target.value)}
                placeholder="Enter the service name"
                className="soft-input"
              />
              <span className="text-xs font-normal text-muted-foreground">
                This will be saved as an internal service for future records.
              </span>
            </label>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Customer name
              <input
                required
                value={customerName}
                onChange={event => setCustomerName(event.target.value)}
                placeholder="Ama Mensah"
                className="soft-input"
                autoComplete="name"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Customer phone
              <input
                required
                value={customerPhone}
                onChange={event => setCustomerPhone(event.target.value)}
                placeholder="024 000 0000"
                className="soft-input"
                autoComplete="tel"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Date and time
              <input
                required
                type="datetime-local"
                value={startsAt}
                onChange={event => setStartsAt(event.target.value)}
                className="soft-input"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Service location
              <select
                required
                value={location}
                onChange={event =>
                  setLocation(event.target.value as AppointmentLocation)
                }
                className="soft-input"
              >
                <option value="salon">Salon</option>
                <option value="home">Home service</option>
              </select>
            </label>
          </div>

          {location === "home" ? (
            <label className="grid gap-2 text-sm font-medium">
              Home-service address
              <input
                required
                value={locationDetails}
                onChange={event => setLocationDetails(event.target.value)}
                placeholder="House number, street and area"
                className="soft-input"
              />
            </label>
          ) : null}

          <label className="grid gap-2 text-sm font-medium">
            Notes
            <textarea
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder="Special requests or staff notes"
              className="soft-input min-h-24"
            />
          </label>

          {services.error ? (
            <p role="alert" className="text-sm text-destructive">
              Could not load services: {services.error.message}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={create.isPending || services.isLoading}
            >
              {create.isPending ? "Saving..." : "Add appointment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
