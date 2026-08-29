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
import { COURSE_CATEGORIES, DEFAULT_COURSE_CATEGORY } from "@blush/shared/const";
import { trpc } from "@/lib/trpc";

export type SaveableCourse = {
  id: number;
  code: string;
  title: string;
  category?: string | null;
  summary: string;
  description: string;
  durationWeeks: number;
  tuition: number;
  productFee?: number | null;
  schedule?: string | null;
  certification?: string | null;
  requirements?: string | null;
  toiletries?: string | null;
  isFeatured?: boolean;
  isActive?: boolean;
  /** The advertised syllabus, in the order it is listed. */
  outline?: string[];
};

/** One item per line, blank lines ignored, so pasting a list just works. */
function parseOutline(text: string): string[] {
  return text
    .split("\n")
    .map(line => line.replace(/^\s*[-*\u2022]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 40);
}

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
  const [category, setCategory] = useState<string>(DEFAULT_COURSE_CATEGORY);
  const [durationWeeks, setDurationWeeks] = useState("12");
  const [tuition, setTuition] = useState("");
  const [productFee, setProductFee] = useState("");
  const [schedule, setSchedule] = useState("Monday - Saturday (8am - 5pm)");
  const [certification, setCertification] = useState("");
  const [summary, setSummary] = useState("");
  const [outline, setOutline] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [toiletries, setToiletries] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setCode(editing.code);
      setTitle(editing.title);
      setCategory(editing.category ?? DEFAULT_COURSE_CATEGORY);
      setDurationWeeks(String(editing.durationWeeks));
      setTuition(editing.tuition.toFixed(2));
      setProductFee(editing.productFee ? editing.productFee.toFixed(2) : "");
      setSchedule(editing.schedule ?? "Monday - Saturday (8am - 5pm)");
      setCertification(editing.certification ?? "");
      setSummary(editing.summary ?? "");
      setOutline((editing.outline ?? []).join("\n"));
      setDescription(editing.description ?? "");
      setRequirements(editing.requirements ?? "");
      setToiletries(editing.toiletries ?? "");
      setIsFeatured(Boolean(editing.isFeatured));
      setIsActive(editing.isActive ?? true);
    } else {
      setCode("");
      setTitle("");
      setCategory(DEFAULT_COURSE_CATEGORY);
      setDurationWeeks("12");
      setTuition("");
      setProductFee("");
      setSchedule("Monday - Saturday (8am - 5pm)");
      setCertification("");
      setSummary("");
      setOutline("");
      setDescription("");
      setRequirements("");
      setToiletries("One big size Omo, One big size Dettol, One big size paper roll, 2 big wet wipes, 1 full pack of blade");
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
  const outlineCount = useMemo(() => parseOutline(outline).length, [outline]);

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
      category: category.trim() || DEFAULT_COURSE_CATEGORY,
      durationWeeks: Number(durationWeeks),
      tuition: Number(tuition),
      productFee: productFee.trim() ? Number(productFee) : undefined,
      schedule: schedule.trim() || undefined,
      certification: certification.trim() || undefined,
      summary: summary.trim(),
      description: description.trim() || summary.trim(),
      requirements: requirements.trim() || undefined,
      toiletries: toiletries.trim() || undefined,
      isFeatured,
      isActive,
      outline: parseOutline(outline),
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
                placeholder="e.g. COSM-ADV"
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
                placeholder="e.g. Basic Cosmetology Course"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="prog-cat">Category</Label>
              <select
                id="prog-cat"
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {COURSE_CATEGORIES.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                General for the full programmes, Individual Courses for single skills.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prog-duration">
                Duration (Weeks) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prog-duration"
                type="number"
                min="1"
                max="200"
                placeholder="12"
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
                placeholder="5000.00"
                value={tuition}
                onChange={e => setTuition(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prog-product-fee">Product / Kit Fee (GH₵) (Optional)</Label>
              <Input
                id="prog-product-fee"
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 2500.00"
                value={productFee}
                onChange={e => setProductFee(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Tools & products purchased at school store</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prog-schedule">Training Hours / Schedule</Label>
              <Input
                id="prog-schedule"
                placeholder="e.g. Monday - Saturday (8am - 5pm)"
                value={schedule}
                onChange={e => setSchedule(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prog-cert">Certification Awarded</Label>
            <Input
              id="prog-cert"
              placeholder="e.g. Basic Cosmetology Certificate"
              value={certification}
              onChange={e => setCertification(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prog-summary">
              Modules / Short Summary <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="prog-summary"
              rows={2}
              placeholder="e.g. Makeup, Wigmaking and styling (machine), Installation, Frontal pony..."
              value={summary}
              onChange={e => setSummary(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prog-outline">Course Outline</Label>
            <Textarea
              id="prog-outline"
              rows={6}
              placeholder={"Makeup\nWigmaking and styling (machine)\nInstallation\nFrontal pony"}
              value={outline}
              onChange={e => setOutline(e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              One skill per line, in the order they are taught. This is the list applicants
              see on the website and on the application form
              {outlineCount ? ` — ${outlineCount} listed` : ""}.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prog-description">Comprehensive Curriculum Description</Label>
            <Textarea
              id="prog-description"
              rows={3}
              placeholder="Detailed syllabus, modules, practical studio sessions, and graduation criteria..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prog-toiletries">Required Toiletries to be Brought</Label>
            <Textarea
              id="prog-toiletries"
              rows={2}
              placeholder="e.g. One big size Omo, One big size Dettol, One big size paper roll, 2 big wet wipes, 1 full pack of blade"
              value={toiletries}
              onChange={e => setToiletries(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">Toiletries to be brought by students on the first day of class</p>
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
