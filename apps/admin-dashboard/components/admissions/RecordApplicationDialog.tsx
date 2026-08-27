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

/**
 * Takes down an application at the desk.
 *
 * Produces the same row the public form does, so a walk-in and a web applicant
 * go through review identically — including the approval step that turns the
 * application into a student.
 */
export function RecordApplicationDialog({
  open,
  onOpenChange,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: (reference: string) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [courseId, setCourseId] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [education, setEducation] = useState("");
  const [statement, setStatement] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFullName("");
    setEmail("");
    setPhone("");
    setWhatsapp("");
    setCourseId("");
    setGender("");
    setBirthDate("");
    setAddress("");
    setEmergencyContact("");
    setEducation("");
    setStatement("");
    setError(null);
  }, [open]);

  const courses = trpc.content.courses.useQuery(undefined, { enabled: open });

  const create = trpc.admin.createApplication.useMutation({
    onSuccess: result => {
      onOpenChange(false);
      onRecorded(result.reference);
    },
    onError: mutationError => setError(mutationError.message),
  });

  const noCourses = courses.data && !courses.data.length;

  const validation = useMemo(() => {
    if (fullName.trim().length < 2) return "Enter the applicant's full name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return "Enter a valid email address.";
    }
    if (phone.trim().length < 7) return "Enter a phone number.";
    if (!courseId) return "Choose the programme they are applying for.";
    return null;
  }, [fullName, email, phone, courseId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record an application</DialogTitle>
          <DialogDescription>
            For an applicant who came in or called rather than using the website. It
            enters review the same way a web application does.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {noCourses ? (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              There are no active programmes yet, and an application has to name one.
              Add a programme first.
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="app-name">Full name</Label>
            <Input
              id="app-name"
              value={fullName}
              onChange={event => setFullName(event.target.value)}
              placeholder="Ama Mensah"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="app-email">Email</Label>
              <Input
                id="app-email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="app-phone">Phone</Label>
              <Input
                id="app-phone"
                value={phone}
                onChange={event => setPhone(event.target.value)}
                placeholder="024 000 0000"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="app-course">Programme</Label>
              <Select value={courseId} onValueChange={setCourseId} disabled={noCourses}>
                <SelectTrigger id="app-course">
                  <SelectValue placeholder="Choose a programme" />
                </SelectTrigger>
                <SelectContent>
                  {(courses.data ?? []).map(course => (
                    <SelectItem key={course.id} value={String(course.id)}>
                      {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="app-whatsapp">WhatsApp (optional)</Label>
              <Input
                id="app-whatsapp"
                value={whatsapp}
                onChange={event => setWhatsapp(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="app-gender">Gender (optional)</Label>
              <Input
                id="app-gender"
                value={gender}
                onChange={event => setGender(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="app-dob">Date of birth (optional)</Label>
              <Input
                id="app-dob"
                type="date"
                value={birthDate}
                onChange={event => setBirthDate(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="app-address">Address (optional)</Label>
            <Textarea
              id="app-address"
              value={address}
              onChange={event => setAddress(event.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="app-emergency">Emergency contact (optional)</Label>
            <Input
              id="app-emergency"
              value={emergencyContact}
              onChange={event => setEmergencyContact(event.target.value)}
              placeholder="Name and phone number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="app-education">Education background (optional)</Label>
            <Textarea
              id="app-education"
              value={education}
              onChange={event => setEducation(event.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="app-statement">Notes (optional)</Label>
            <Textarea
              id="app-statement"
              value={statement}
              onChange={event => setStatement(event.target.value)}
              rows={2}
              placeholder="Anything they said that is worth recording"
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
            disabled={Boolean(validation) || create.isPending || noCourses}
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
                whatsapp: whatsapp.trim() || undefined,
                courseId: Number(courseId),
                gender: gender.trim() || undefined,
                birthDate: birthDate ? new Date(birthDate) : undefined,
                address: address.trim() || undefined,
                emergencyContact: emergencyContact.trim() || undefined,
                education: education.trim() || undefined,
                statement: statement.trim() || undefined,
              });
            }}
            className="gap-2"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Record application
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
