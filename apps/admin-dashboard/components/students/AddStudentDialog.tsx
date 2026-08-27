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

const STATUS = ["active", "suspended", "completed", "graduated", "withdrawn"] as const;

const NO_COURSE = "none";

/**
 * Adds a student directly.
 *
 * Approving an application is still the main way a student arrives; this is
 * for the ones who never filled the form in — a walk-in enrolled at the desk,
 * or a paper register being typed up.
 */
export function AddStudentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (studentNumber: string) => void;
}) {
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

  useEffect(() => {
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
  }, [open]);

  const courses = trpc.content.courses.useQuery(undefined, { enabled: open });

  const create = trpc.students.create.useMutation({
    onSuccess: result => {
      onOpenChange(false);
      onCreated(result.studentNumber);
    },
    onError: mutationError => setError(mutationError.message),
  });

  const validation = useMemo(() => {
    if (fullName.trim().length < 2) return "Enter the student's full name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return "Enter a valid email address.";
    }
    if (phone.trim().length < 7) return "Enter a phone number.";
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      return "Date of birth must be a real date.";
    }
    return null;
  }, [fullName, email, phone, birthDate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a student</DialogTitle>
          <DialogDescription>
            Creates the record directly, without an application. A portal account with
            the same email is linked automatically if one already exists.
          </DialogDescription>
        </DialogHeader>

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
              <Label htmlFor="student-number">Student number (optional)</Label>
              <Input
                id="student-number"
                value={studentNumber}
                onChange={event => setStudentNumber(event.target.value)}
                placeholder="Generated if left blank"
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={Boolean(validation) || create.isPending}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              create.mutate({
                fullName: fullName.trim(),
                email: email.trim(),
                phone: phone.trim(),
                studentNumber: studentNumber.trim() || undefined,
                status,
                courseId: courseId === NO_COURSE ? undefined : Number(courseId),
                gender: gender.trim() || undefined,
                birthDate: birthDate ? new Date(birthDate) : undefined,
                address: address.trim() || undefined,
                emergencyContactName: emergencyContactName.trim() || undefined,
                emergencyContactPhone: emergencyContactPhone.trim() || undefined,
              });
            }}
            className="gap-2"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add student
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
