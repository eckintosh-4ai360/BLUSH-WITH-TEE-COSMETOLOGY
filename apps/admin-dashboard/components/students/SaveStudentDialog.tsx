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
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { Textarea } from "@blush/ui/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const STATUS = ["active", "suspended", "completed", "graduated", "withdrawn"] as const;

const NO_COURSE = "none";

/** Only the identity is needed to open the dialog; the rest is fetched. */
export type EditableStudent = { id: number; fullName: string };

/** `<input type="date">` speaks yyyy-mm-dd and nothing else. */
function toDateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * Adds a student directly, or corrects one already on the register.
 *
 * Approving an application is still the main way a student arrives; adding is
 * for the ones who never filled the form in - a walk-in enrolled at the desk,
 * or a paper register being typed up.
 *
 * Editing deliberately stops at who the student is. Programmes are not offered
 * here: an enrolment carries attendance, results and fee charges, so moving
 * somebody between programmes is its own decision rather than a field on a
 * contact form.
 */
export function SaveStudentDialog({
  open,
  onOpenChange,
  onSaved,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Told what happened so the page can word its own confirmation. */
  onSaved: (result: { studentNumber: string; edited: boolean }) => void;
  editing?: EditableStudent | null;
}) {
  const isEdit = Boolean(editing);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [status, setStatus] = useState<(typeof STATUS)[number]>("active");
  const [courseId, setCourseId] = useState(NO_COURSE);
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Date of birth, address and next of kin live on the shared person record
  // rather than on the row the table renders, so an edit has to read them back
  // before it can show them.
  const existing = trpc.students.get.useQuery(
    { id: editing?.id ?? 0 },
    { enabled: open && isEdit, staleTime: 0 },
  );

  useEffect(() => {
    if (!open) return;
    if (!isEdit) {
      setFullName("");
      setEmail("");
      setPhone("");
      setStudentNumber("");
      setStatus("active");
      setCourseId(NO_COURSE);
      setGender("");
      setBirthDate("");
      setAddress("");
      setEmergencyContactName("");
      setEmergencyContactPhone("");
      setError(null);
      return;
    }

    const row = existing.data;
    if (!row) return;
    setFullName(row.fullName);
    setEmail(row.email);
    setPhone(row.phone);
    setStudentNumber(row.studentNumber);
    setStatus(row.status as (typeof STATUS)[number]);
    setGender(row.gender ?? "");
    setBirthDate(toDateInput(row.birthDate));
    setAddress(row.address ?? "");
    setEmergencyContactName(row.emergencyContactName ?? "");
    setEmergencyContactPhone(row.emergencyContactPhone ?? "");
    setError(null);
  }, [open, isEdit, existing.data]);

  const courses = trpc.content.courses.useQuery(undefined, { enabled: open && !isEdit });

  const create = trpc.students.create.useMutation({
    onSuccess: result => {
      onOpenChange(false);
      onSaved({ studentNumber: result.studentNumber, edited: false });
    },
    onError: mutationError => setError(mutationError.message),
  });

  const update = trpc.students.update.useMutation({
    onSuccess: result => {
      onOpenChange(false);
      onSaved({ studentNumber: result.studentNumber, edited: true });
    },
    onError: mutationError => setError(mutationError.message),
  });

  const isPending = create.isPending || update.isPending;
  const isLoading = isEdit && existing.isLoading;

  const validation = useMemo(() => {
    if (fullName.trim().length < 2) return "Enter the student's full name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return "Enter a valid email address.";
    }
    if (phone.trim().length < 7) return "Enter a phone number.";
    // Blank is fine when adding - one is generated. It is not fine on an edit,
    // where blanking it would take away a number already in use on paperwork.
    if (isEdit && !studentNumber.trim()) return "A student number is required.";
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      return "Date of birth must be a real date.";
    }
    return null;
  }, [fullName, email, phone, studentNumber, birthDate, isEdit]);

  const submit = () => {
    setError(null);
    if (validation) {
      setError(validation);
      return;
    }

    const person = {
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      gender: gender.trim() || undefined,
      birthDate: birthDate ? new Date(birthDate) : undefined,
      address: address.trim() || undefined,
      emergencyContactName: emergencyContactName.trim() || undefined,
      emergencyContactPhone: emergencyContactPhone.trim() || undefined,
    };

    if (editing) {
      update.mutate({
        ...person,
        id: editing.id,
        studentNumber: studentNumber.trim(),
        status,
      });
      return;
    }

    create.mutate({
      ...person,
      studentNumber: studentNumber.trim() || undefined,
      status,
      courseId: courseId === NO_COURSE ? undefined : Number(courseId),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit student" : "Add a student"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Corrects the student's own details. Programmes, fees and results are unaffected."
              : "Creates the record directly, without an application. A portal account with the same email is linked automatically if one already exists."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4" aria-busy>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : existing.error ? (
          <p role="alert" className="text-sm text-destructive">
            {existing.error.message}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="student-name">Full name</Label>
              <Input
                id="student-name"
                value={fullName}
                onChange={event => setFullName(event.target.value)}
                placeholder="Ama Mensah"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="student-email">Email</Label>
                <Input
                  id="student-email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="student-phone">Phone</Label>
                <Input
                  id="student-phone"
                  value={phone}
                  onChange={event => setPhone(event.target.value)}
                  placeholder="024 000 0000"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="student-number">
                  {isEdit ? "Student number" : "Student number (optional)"}
                </Label>
                <Input
                  id="student-number"
                  value={studentNumber}
                  onChange={event => setStudentNumber(event.target.value)}
                  placeholder={isEdit ? undefined : "Generated if left blank"}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="student-status">Status</Label>
                <Select value={status} onValueChange={value => setStatus(value as typeof status)}>
                  <SelectTrigger id="student-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS.map(item => (
                      <SelectItem key={item} value={item} className="capitalize">
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isEdit ? null : (
              <div className="space-y-2">
                <Label htmlFor="student-course">Enrol on a programme (optional)</Label>
                <Select value={courseId} onValueChange={setCourseId}>
                  <SelectTrigger id="student-course">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_COURSE}>Not yet enrolled</SelectItem>
                    {(courses.data ?? []).map(course => (
                      <SelectItem key={course.id} value={String(course.id)}>
                        {course.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {courses.data && !courses.data.length ? (
                  <p className="text-xs text-muted-foreground">
                    No programmes exist yet, so the student is added without one.
                  </p>
                ) : null}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="student-gender">Gender (optional)</Label>
                <Input
                  id="student-gender"
                  value={gender}
                  onChange={event => setGender(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="student-dob">Date of birth (optional)</Label>
                <Input
                  id="student-dob"
                  type="date"
                  value={birthDate}
                  onChange={event => setBirthDate(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="student-address">Address (optional)</Label>
              <Textarea
                id="student-address"
                value={address}
                onChange={event => setAddress(event.target.value)}
                rows={2}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="student-ec-name">Emergency contact (optional)</Label>
                <Input
                  id="student-ec-name"
                  value={emergencyContactName}
                  onChange={event => setEmergencyContactName(event.target.value)}
                  placeholder="Name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="student-ec-phone">Emergency phone (optional)</Label>
                <Input
                  id="student-ec-phone"
                  value={emergencyContactPhone}
                  onChange={event => setEmergencyContactPhone(event.target.value)}
                />
              </div>
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
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={Boolean(validation) || isPending || isLoading}
            onClick={submit}
            className="gap-2"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isEdit ? "Save changes" : "Add student"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
