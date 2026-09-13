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

const DEPARTMENTS = [
  { value: "school", label: "School" },
  { value: "salon", label: "Salon" },
  { value: "shop", label: "Shop" },
] as const;

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On leave" },
  { value: "inactive", label: "Inactive" },
] as const;

export type EditableWorker = {
  id: number;
  name: string;
  email: string | null;
  accountEmail: string | null;
  phone: string | null;
  position: string;
  department: (typeof DEPARTMENTS)[number]["value"];
  staffNumber: string | null;
  employmentDate: Date | string | null;
  salary: number | null;
  status: (typeof STATUSES)[number]["value"];
  notes: string | null;
};

function dateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function SaveWorkerDialog({
  open,
  onOpenChange,
  onSaved,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: EditableWorker | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] =
    useState<EditableWorker["department"]>("school");
  const [staffNumber, setStaffNumber] = useState("");
  const [employmentDate, setEmploymentDate] = useState("");
  const [salary, setSalary] = useState("");
  const [status, setStatus] = useState<EditableWorker["status"]>("active");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setEmail(editing?.email ?? editing?.accountEmail ?? "");
    setPhone(editing?.phone ?? "");
    setPosition(editing?.position ?? "");
    setDepartment(editing?.department ?? "school");
    setStaffNumber(editing?.staffNumber ?? "");
    setEmploymentDate(dateInput(editing?.employmentDate));
    setSalary(editing?.salary == null ? "" : String(editing.salary));
    setStatus(editing?.status ?? "active");
    setNotes(editing?.notes ?? "");
    setError(null);
  }, [open, editing]);

  const save = trpc.staff.saveRecord.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const parsedSalary = salary.trim() ? Number(salary) : undefined;
  const validation = useMemo(() => {
    if (name.trim().length < 2) return "Enter the worker's full name.";
    if (position.trim().length < 2) return "Enter the worker's position.";
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return "Enter a valid email address or leave it blank.";
    }
    if (
      salary.trim() &&
      (!Number.isFinite(parsedSalary) || parsedSalary! < 0)
    ) {
      return "Salary must be a number that is 0 or more.";
    }
    return null;
  }, [name, position, email, salary, parsedSalary]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit worker record" : "Add worker record"}
          </DialogTitle>
          <DialogDescription>
            Keep the team register current for the school, salon and shop. A
            sign-in account is not created unless access is set up separately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="worker-name">Full name</Label>
              <Input
                id="worker-name"
                value={name}
                onChange={event => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="worker-position">Position</Label>
              <Input
                id="worker-position"
                value={position}
                onChange={event => setPosition(event.target.value)}
                placeholder="e.g. Salon stylist"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="worker-department">Work area</Label>
              <Select
                value={department}
                onValueChange={value =>
                  setDepartment(value as EditableWorker["department"])
                }
              >
                <SelectTrigger id="worker-department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(item => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="worker-number">Staff number (optional)</Label>
              <Input
                id="worker-number"
                value={staffNumber}
                onChange={event => setStaffNumber(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="worker-status">Status</Label>
              <Select
                value={status}
                onValueChange={value =>
                  setStatus(value as EditableWorker["status"])
                }
              >
                <SelectTrigger id="worker-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(item => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="worker-phone">Phone (optional)</Label>
              <Input
                id="worker-phone"
                value={phone}
                onChange={event => setPhone(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="worker-email">Email (optional)</Label>
              <Input
                id="worker-email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="worker-employment-date">
                Employment date (optional)
              </Label>
              <Input
                id="worker-employment-date"
                type="date"
                value={employmentDate}
                onChange={event => setEmploymentDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="worker-salary">Salary (optional)</Label>
              <Input
                id="worker-salary"
                type="number"
                min={0}
                step="0.01"
                value={salary}
                onChange={event => setSalary(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="worker-notes">Notes (optional)</Label>
            <Textarea
              id="worker-notes"
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={3}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={Boolean(validation) || save.isPending}
            onClick={() => {
              setError(null);
              if (validation) return setError(validation);
              save.mutate({
                id: editing?.id,
                name: name.trim(),
                email: email.trim() || undefined,
                phone: phone.trim() || undefined,
                position: position.trim(),
                department,
                staffNumber: staffNumber.trim() || undefined,
                employmentDate: employmentDate
                  ? new Date(`${employmentDate}T00:00:00.000Z`)
                  : undefined,
                salary: parsedSalary,
                status,
                notes: notes.trim() || undefined,
              });
            }}
            className="gap-2"
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {editing ? "Save changes" : "Add worker"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
