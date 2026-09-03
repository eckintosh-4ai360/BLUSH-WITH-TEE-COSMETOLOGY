"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blush/ui/components/ui/dialog";
import { Input } from "@blush/ui/components/ui/input";
import { Label } from "@blush/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import { Textarea } from "@blush/ui/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank", label: "Bank" },
  { value: "card", label: "Card" },
  { value: "online", label: "Online" },
] as const;

type Method = (typeof METHODS)[number]["value"];

/** The fields an edit fills back in. */
export type EditableService = {
  id: number;
  serviceDate: Date | string;
  serviceId: number | null;
  serviceName: string;
  clientName: string;
  amount: number;
  paymentMethod: string;
  workerUserId: number | null;
  workerName: string;
  note: string | null;
};

/** Today as YYYY-MM-DD in the recorder's own timezone, not UTC. */
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const asDateInput = (value: Date | string) => {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

/** Sentinel for "not in the catalogue", which is an ordinary case here. */
const OTHER_SERVICE = "other";
const NO_WORKER = "unlisted";

/**
 * Records one service carried out.
 *
 * Both pickers fall back to free text on purpose. A salon does work that is
 * not on the price list and is done by people who do not all have dashboard
 * accounts, and a form that refuses those is a form the takings get kept
 * outside of - on paper, where nothing else can see them.
 */
export function SaveServiceDialog({
  open,
  onOpenChange,
  onSaved,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: EditableService | null;
}) {
  const [serviceDate, setServiceDate] = useState(today());
  const [serviceKey, setServiceKey] = useState<string>(OTHER_SERVICE);
  const [serviceName, setServiceName] = useState("");
  const [clientName, setClientName] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [workerKey, setWorkerKey] = useState<string>(NO_WORKER);
  const [workerName, setWorkerName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const catalogue = trpc.services.catalogue.useQuery(undefined, { enabled: open });
  const workers = trpc.services.workers.useQuery(undefined, { enabled: open });

  // Seeded when it opens rather than when it closes, so reopening on a
  // different row never shows the previous one's figures for a frame.
  useEffect(() => {
    if (!open) return;
    setServiceDate(editing ? asDateInput(editing.serviceDate) : today());
    setServiceKey(editing?.serviceId ? String(editing.serviceId) : OTHER_SERVICE);
    setServiceName(editing?.serviceName ?? "");
    setClientName(editing?.clientName ?? "");
    setAmount(editing ? String(editing.amount) : "");
    setMethod((editing?.paymentMethod as Method | undefined) ?? "cash");
    setWorkerKey(editing?.workerUserId ? String(editing.workerUserId) : NO_WORKER);
    setWorkerName(editing?.workerName ?? "");
    setNote(editing?.note ?? "");
    setError(null);
  }, [open, editing]);

  const save = trpc.services.save.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const parsedAmount = Number(amount);

  const validation = useMemo(() => {
    if (serviceName.trim().length < 2) return "Name the service.";
    if (clientName.trim().length < 2) return "Name the client.";
    if (workerName.trim().length < 2) return "Say who carried it out.";
    if (!amount.trim()) return "Enter the amount charged.";
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      return "The amount must be a number, and not a negative one.";
    }
    if (!serviceDate) return "Choose the date.";
    return null;
  }, [serviceName, clientName, workerName, amount, parsedAmount, serviceDate]);

  /** Picking from the catalogue fills the name and price rather than locking them. */
  const chooseService = (value: string) => {
    setServiceKey(value);
    if (value === OTHER_SERVICE) return;
    const picked = catalogue.data?.find(item => String(item.id) === value);
    if (!picked) return;
    setServiceName(picked.name);
    if (!amount.trim()) setAmount(String(Number(picked.price)));
  };

  const chooseWorker = (value: string) => {
    setWorkerKey(value);
    if (value === NO_WORKER) return;
    const picked = workers.data?.find(item => String(item.userId) === value);
    if (picked) setWorkerName(picked.name ?? picked.email ?? "");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Correct this service" : "Record a service"}</DialogTitle>
          <DialogDescription>
            What was done, for whom, by whom, and what was taken. It goes straight into
            the day&apos;s income.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="service-date">Date</Label>
              <Input
                id="service-date"
                type="date"
                value={serviceDate}
                max={today()}
                onChange={event => setServiceDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="service-amount">Amount (GHS)</Label>
              <Input
                id="service-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amount}
                onChange={event => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="service-pick">Service</Label>
            <Select value={serviceKey} onValueChange={chooseService}>
              <SelectTrigger id="service-pick">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(catalogue.data ?? []).map(item => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER_SERVICE}>Something else</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={serviceName}
              onChange={event => {
                setServiceName(event.target.value);
                // Typing over a catalogue name means it is no longer that row.
                if (serviceKey !== OTHER_SERVICE) setServiceKey(OTHER_SERVICE);
              }}
              placeholder="e.g. Bridal hairstyling"
              aria-label="Service name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="service-client">Client name</Label>
            <Input
              id="service-client"
              value={clientName}
              onChange={event => setClientName(event.target.value)}
              placeholder="Who it was done for"
              autoComplete="off"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="service-method">Payment type</Label>
              <Select value={method} onValueChange={value => setMethod(value as Method)}>
                <SelectTrigger id="service-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map(item => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="service-worker">Worker in charge</Label>
              <Select value={workerKey} onValueChange={chooseWorker}>
                <SelectTrigger id="service-worker">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(workers.data ?? []).map(item => (
                    <SelectItem key={item.userId} value={String(item.userId)}>
                      {item.name ?? item.email}
                    </SelectItem>
                  ))}
                  <SelectItem value={NO_WORKER}>Someone else</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Input
            value={workerName}
            onChange={event => {
              setWorkerName(event.target.value);
              if (workerKey !== NO_WORKER) setWorkerKey(NO_WORKER);
            }}
            placeholder="Worker's name"
            aria-label="Worker name"
          />

          <div className="space-y-2">
            <Label htmlFor="service-note">Note (optional)</Label>
            <Textarea
              id="service-note"
              value={note}
              onChange={event => setNote(event.target.value)}
              rows={2}
              placeholder="Anything worth remembering about this one"
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            className="gap-2"
            disabled={Boolean(validation) || save.isPending}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              save.mutate({
                id: editing?.id,
                serviceDate,
                serviceId: serviceKey === OTHER_SERVICE ? null : Number(serviceKey),
                serviceName: serviceName.trim(),
                clientName: clientName.trim(),
                amount: parsedAmount,
                paymentMethod: method,
                workerUserId: workerKey === NO_WORKER ? null : Number(workerKey),
                workerName: workerName.trim(),
                note: note.trim() || undefined,
              });
            }}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Save changes" : "Record service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
