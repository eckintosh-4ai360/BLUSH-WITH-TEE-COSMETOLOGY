"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
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
import { Switch } from "@blush/ui/components/ui/switch";
import { Textarea } from "@blush/ui/components/ui/textarea";
import { toast } from "@blush/ui/components/ui/sonner";
import { trpc } from "@/lib/trpc";

export type SaveableCourse = {
  id: number;
  code: string;
  title: string;
  summary: string;
  description: string;
  durationWeeks: number;
  tuition: number;
  schedule?: string | null;
  certification?: string | null;
  requirements?: string | null;
  isFeatured?: boolean;
  isActive?: boolean;
};

export function SaveCourseDialog({
  open,
  onOpenChange,
  onSaved,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (course: { id: number; title: string; code: string }) => void;
  editing?: SaveableCourse | null;
}) {
  const utils = trpc.useUtils();

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [durationWeeks, setDurationWeeks] = useState("12");
  const [tuition, setTuition] = useState("");
  const [schedule, setSchedule] = useState("");
  const [certification, setCertification] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setCode(editing.code);
      setTitle(editing.title);
      setDurationWeeks(String(editing.durationWeeks));
      setTuition(editing.tuition.toFixed(2));
      setSchedule(editing.schedule ?? "");
      setCertification(editing.certification ?? "");
      setSummary(editing.summary ?? "");
      setDescription(editing.description ?? "");
      setRequirements(editing.requirements ?? "");
      setIsFeatured(Boolean(editing.isFeatured));
      setIsActive(editing.isActive ?? true);
    } else {
      setCode("");
      setTitle("");
      setDurationWeeks("12");
      setTuition("");
      setSchedule("");
      setCertification("");
      setSummary("");
      setDescription("");
      setRequirements("");
      setIsFeatured(false);
      setIsActive(true);
    }
    setError(null);
  }, [open, editing]);

  const createCourse = trpc.admin.createCourse.useMutation({
    onSuccess: result => {
      toast.success(`Programme "${result.title}" created successfully.`);
      utils.admin.courses.invalidate();
      utils.content.courses.invalidate();
      utils.attendance.markableCourses.invalidate();
      onOpenChange(false);
      onSaved?.({ id: result.id, title: result.title, code: result.code });
    },
    onError: err => setError(err.message),
  });

  const updateCourse = trpc.admin.updateCourse.useMutation({
    onSuccess: result => {
      toast.success(`Programme "${result.title}" updated successfully.`);
      utils.admin.courses.invalidate();
      utils.content.courses.invalidate();
      utils.attendance.markableCourses.invalidate();
      onOpenChange(false);
      onSaved?.({ id: result.id, title: result.title, code: result.code });
    },
    onError: err => setError(err.message),
  });

  const isPending = createCourse.isPending || updateCourse.isPending;

  const validation = useMemo(() => {
    if (code.trim().length < 2) return "Enter a valid programme code (e.g. ESTH-ADV).";
    if (title.trim().length < 2) return "Enter the programme title.";
    const weeks = Number(durationWeeks);
    if (!weeks || weeks < 1) return "Duration must be at least 1 week.";
    const fee = Number(tuition);
    if (isNaN(fee) || fee < 0) return "Enter a valid tuition fee.";
    if (summary.trim().length < 5) return "Enter a short summary (at least 5 characters).";
    return null;
  }, [code, title, durationWeeks, tuition, summary]);

  async function handleSave() {
    setError(null);
    if (validation) {
      setError(validation);
      return;
    }

    const payload = {
      code: code.trim().toUpperCase(),
      title: title.trim(),
      durationWeeks: Number(durationWeeks),
      tuition: Number(tuition),
      schedule: schedule.trim() || undefined,
      certification: certification.trim() || undefined,
      summary: summary.trim(),
      description: description.trim() || summary.trim(),
      requirements: requirements.trim() || undefined,
      isFeatured,
      isActive,
    };

    if (editing) {
      await updateCourse.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createCourse.mutateAsync(payload);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {editing ? "Edit Academic Programme" : "Add New Academic Programme"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update programme specifications, tuition fees, and admission settings."
              : "Register a new programme to make it available for online and in-person admissions, student enrolments, and certificates."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="prog-code">
                Programme Code <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prog-code"
                placeholder="e.g. ESTH-PRO"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                className="font-mono uppercase"
              />
              <p className="text-[11px] text-muted-foreground">Unique identifier code</p>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="prog-title">
                Programme Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prog-title"
                placeholder="e.g. Advanced Esthetics & Clinical Skincare"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prog-duration">
                Duration (Weeks) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prog-duration"
                type="number"
                min="1"
                max="200"
                placeholder="16"
                value={durationWeeks}
                onChange={e => setDurationWeeks(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prog-tuition">
                Tuition Fee (GH₵) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prog-tuition"
                type="number"
                step="0.01"
                min="0"
                placeholder="2500.00"
                value={tuition}
                onChange={e => setTuition(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prog-schedule">Schedule / Timetable</Label>
              <Input
                id="prog-schedule"
                placeholder="e.g. Weekday mornings (9:00 AM - 1:00 PM)"
                value={schedule}
                onChange={e => setSchedule(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prog-cert">Certification Awarded</Label>
              <Input
                id="prog-cert"
                placeholder="e.g. Professional Diploma in Cosmetology"
                value={certification}
                onChange={e => setCertification(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prog-summary">
              Short Summary <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="prog-summary"
              rows={2}
              placeholder="A brief punchy overview for admissions listings and programme cards..."
              value={summary}
              onChange={e => setSummary(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prog-description">Comprehensive Curriculum Description</Label>
            <Textarea
              id="prog-description"
              rows={3}
              placeholder="Detailed syllabus, modules, practical laboratory components, and learning outcomes..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prog-reqs">Entry Requirements</Label>
            <Input
              id="prog-reqs"
              placeholder="e.g. Open to beginners · JHS/SHS certificate or equivalent"
              value={requirements}
              onChange={e => setRequirements(e.target.value)}
            />
          </div>

          <div className="grid gap-4 rounded-xl border border-border/70 bg-muted/30 p-4 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor="prog-active" className="text-sm font-medium">
                  Active for Admissions
                </Label>
                <p className="text-xs text-muted-foreground">
                  Available in admissions dropdowns & enrolment
                </p>
              </div>
              <Switch
                id="prog-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor="prog-featured" className="text-sm font-medium">
                  Featured Programme
                </Label>
                <p className="text-xs text-muted-foreground">
                  Highlighted on website & public catalogue
                </p>
              </div>
              <Switch
                id="prog-featured"
                checked={isFeatured}
                onCheckedChange={setIsFeatured}
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            disabled={Boolean(validation) || isPending}
            onClick={handleSave}
            className="gap-2"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Save changes" : "Create programme"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
