"use client";

import { useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileText,
  MapPin,
  Phone,
  Printer,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
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
import { Textarea } from "@blush/ui/components/ui/textarea";
import { toast } from "@blush/ui/components/ui/sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

export type AdmissionApplicationData = {
  application: {
    id: number;
    reference: string;
    fullName: string;
    email: string;
    phone: string;
    whatsapp?: string | null;
    birthDate?: Date | string | null;
    hometown?: string | null;
    age?: number | null;
    gender?: string | null;
    maritalStatus?: string | null;
    address?: string | null;
    emergencyContact?: string | null;
    emergencyRelationship?: string | null;
    instagram?: string | null;
    tiktok?: string | null;
    otherSocialMedia?: string | null;
    educationalLevel?: string | null;
    education?: string | null;
    paymentPlan?: string | null;
    duration?: string | null;
    startDate?: Date | string | null;
    guardianName?: string | null;
    guardianAddress?: string | null;
    guardianPhone?: string | null;
    signatureData?: string | null;
    agreedToTerms?: boolean | null;
    ceoEndorsed?: boolean | null;
    ceoEndorsementDate?: Date | string | null;
    ceoEndorsementSignature?: string | null;
    statement?: string | null;
    status: string;
    decisionNote?: string | null;
    createdAt: Date | string;
  };
  courseTitle: string;
};

export function ViewAdmissionFormDialog({
  open,
  onOpenChange,
  data,
  onStatusChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: AdmissionApplicationData | null;
  onStatusChanged?: () => void;
}) {
  const { can } = usePermissions();
  const utils = trpc.useUtils();
  const [ceoSignature, setCeoSignature] = useState("");
  const [decisionNote, setDecisionNote] = useState("");

  const review = trpc.admin.reviewApplication.useMutation({
    onSuccess: () => {
      toast.success("Application status updated.");
      utils.admin.applications.invalidate();
      onStatusChanged?.();
    },
    onError: err => toast.error(err.message),
  });

  const endorse = trpc.admin.endorseApplication.useMutation({
    onSuccess: () => {
      toast.success("Application endorsed by CEO.");
      utils.admin.applications.invalidate();
      onStatusChanged?.();
    },
    onError: err => toast.error(err.message),
  });

  if (!data) return null;

  const { application, courseTitle } = data;

  const formattedDob = application.birthDate
    ? new Date(application.birthDate).toLocaleDateString("en-GB")
    : "—";

  const formattedStartDate = application.startDate
    ? new Date(application.startDate).toLocaleDateString("en-GB")
    : "—";

  const formattedCreatedAt = new Date(application.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  async function handleEndorse() {
    if (!ceoSignature.trim()) {
      toast.error("Please provide the CEO endorsement signature.");
      return;
    }
    await endorse.mutateAsync({
      applicationId: application.id,
      signature: ceoSignature.trim(),
      endorsed: true,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl p-0">
        {/* Printable Physical Admission Sheet Header */}
        <div className="bg-[#fdf2fa] p-6 border-b border-[#8f0d6b]/20 sm:p-8 text-center relative">
          <div className="absolute top-4 right-4 flex items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5 rounded-full border-[#8f0d6b]/30 text-[#8f0d6b] bg-white hover:bg-[#faeaf6]"
            >
              <Printer className="h-4 w-4" /> Print Form
            </Button>
          </div>

          <div className="inline-block rounded-full bg-white px-4 py-1 text-xs font-bold uppercase tracking-widest text-[#8f0d6b] shadow-sm mb-2">
            Official Student Admission File
          </div>
          <h2 className="font-serif text-3xl font-bold tracking-tight text-[#8f0d6b] sm:text-4xl">
            BLUSH WITH TEE BEAUTY SCHOOL
          </h2>
          <p className="text-xs font-bold uppercase tracking-wider text-[#fe00b6] mt-1">
            Allied Filling Station, A&apos;koon - Tarkwa
          </p>
          <p className="text-xs text-[#692156] mt-0.5">
            Phone: <b>059 770 6250</b> | WhatsApp: <b>054 556 3536</b>
          </p>

          <div className="mt-4 inline-block rounded-xl border border-[#8f0d6b]/30 bg-white/90 px-6 py-2 shadow-sm">
            <span className="font-serif text-xl font-bold tracking-wider text-[#8f0d6b]">
              ADMISSION FORM
            </span>
          </div>

          <div className="mt-3 flex items-center justify-center gap-4 text-xs text-[#8f0d6b]">
            <span>Ref: <b className="font-mono">{application.reference}</b></span>
            <span>·</span>
            <span>Date: <b>{formattedCreatedAt}</b></span>
            <span>·</span>
            <Badge className="capitalize">
              {application.status.replaceAll("_", " ")}
            </Badge>
          </div>
        </div>

        {/* Paper Form Content Body */}
        <div className="p-6 sm:p-8 space-y-6 text-xs text-foreground">
          {/* Section 1: Personal Particulars */}
          <div className="rounded-xl border border-border/80 p-4 space-y-3 bg-card/60">
            <h4 className="font-bold text-xs uppercase tracking-wider text-primary border-b pb-1.5">
              1. Applicant Personal Details
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground block text-[11px]">Full Name:</span>
                <span className="font-semibold text-sm text-foreground">{application.fullName}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Email Address:</span>
                <span className="font-semibold text-foreground">{application.email}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground block text-[11px]">Primary Contact:</span>
                <span className="font-semibold">{application.phone}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">WhatsApp:</span>
                <span>{application.whatsapp || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Date of Birth / Age:</span>
                <span>{formattedDob} ({application.age ? `${application.age} years` : "—"})</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground block text-[11px]">Hometown:</span>
                <span>{application.hometown || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Gender:</span>
                <span>{application.gender || "Female"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Marital Status:</span>
                <span className="capitalize">{application.maritalStatus || "Single"}</span>
              </div>
            </div>

            <div>
              <span className="text-muted-foreground block text-[11px]">Residential / Postal Address:</span>
              <span className="leading-relaxed">{application.address || "—"}</span>
            </div>
          </div>

          {/* Section 2: Emergency Contact & Social Media */}
          <div className="rounded-xl border border-border/80 p-4 space-y-3 bg-card/60">
            <h4 className="font-bold text-xs uppercase tracking-wider text-primary border-b pb-1.5">
              2. Emergency Contact & Social Media
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground block text-[11px]">Emergency Contact:</span>
                <span className="font-semibold">{application.emergencyContact || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Relationship to Contact:</span>
                <span>{application.emergencyRelationship || "—"}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground block text-[11px]">Instagram Handle:</span>
                <span className="font-mono text-primary">{application.instagram || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">TikTok Handle:</span>
                <span className="font-mono">{application.tiktok || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Other Social Handle:</span>
                <span>{application.otherSocialMedia || "—"}</span>
              </div>
            </div>
          </div>

          {/* Section 3: Academic Programme & Payment Plan */}
          <div className="rounded-xl border border-border/80 p-4 space-y-3 bg-card/60">
            <h4 className="font-bold text-xs uppercase tracking-wider text-primary border-b pb-1.5">
              3. Academic Programme & Payment Terms
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground block text-[11px]">Enrolled Programme:</span>
                <span className="font-bold text-sm text-primary">{courseTitle}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Educational Level:</span>
                <span>{application.educationalLevel || "—"}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground block text-[11px]">Payment Plan:</span>
                <span className="font-semibold">{application.paymentPlan || "Full Payment"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Course Duration:</span>
                <span>{application.duration || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Desired Start Date:</span>
                <span>{formattedStartDate}</span>
              </div>
            </div>
          </div>

          {/* Section 4: References / Parent / Guardian */}
          <div className="rounded-xl border border-border/80 p-4 space-y-3 bg-card/60">
            <h4 className="font-bold text-xs uppercase tracking-wider text-primary border-b pb-1.5">
              4. References / Parent / Guardian
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground block text-[11px]">Guardian Name:</span>
                <span className="font-semibold">{application.guardianName || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Guardian Phone:</span>
                <span>{application.guardianPhone || "—"}</span>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">Guardian Address:</span>
              <span>{application.guardianAddress || "—"}</span>
            </div>
          </div>

          {/* Section 5: Student Declaration */}
          <div className="rounded-xl border border-[#8f0d6b]/20 bg-[#faeaf6]/30 p-4 space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-primary">
              Student Signature & Declaration
            </h4>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              &quot;I have read, understood, and agreed to all the rules, terms, policies, and regulations governing Blush With Tee Beauty School.&quot;
            </p>
            <div className="flex items-center justify-between pt-2 border-t border-[#8f0d6b]/10">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase">Student Digital Signature:</span>
                <p className="font-serif italic font-bold text-sm text-primary">
                  {application.signatureData || application.fullName}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-muted-foreground uppercase">Date Signed:</span>
                <p className="font-mono text-xs">{formattedCreatedAt}</p>
              </div>
            </div>
          </div>

          {/* Section 6: Official Use Only (CEO Endorsement & Approval) */}
          <div className="rounded-xl border-2 border-dashed border-[#8f0d6b]/40 bg-gradient-to-br from-white to-[#fdf2fa] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-serif font-bold text-sm uppercase tracking-wider text-[#8f0d6b] flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[#fe00b6]" />
                FOR OFFICIAL USE ONLY (CEO Endorsement)
              </h4>
              {application.ceoEndorsed ? (
                <Badge className="bg-emerald-600 text-white gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Endorsed by CEO
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-700 border-amber-400">
                  Pending CEO Endorsement
                </Badge>
              )}
            </div>

            {application.ceoEndorsed ? (
              <div className="grid gap-3 sm:grid-cols-2 text-xs bg-white/80 p-3 rounded-lg border border-emerald-500/20">
                <div>
                  <span className="text-muted-foreground block text-[11px]">CEO Signature:</span>
                  <span className="font-serif italic font-bold text-sm text-emerald-800">
                    {application.ceoEndorsementSignature || "Blush With Tee Director"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Endorsement Date:</span>
                  <span>
                    {application.ceoEndorsementDate
                      ? new Date(application.ceoEndorsementDate).toLocaleDateString("en-GB")
                      : "—"}
                  </span>
                </div>
              </div>
            ) : can("admissions.review") ? (
              <div className="space-y-3 pt-2">
                <Label htmlFor="ceo-sig">CEO / Director Signature</Label>
                <div className="flex gap-2">
                  <Input
                    id="ceo-sig"
                    placeholder="Enter CEO Name / Signature"
                    value={ceoSignature}
                    onChange={e => setCeoSignature(e.target.value)}
                    className="font-serif italic"
                  />
                  <Button
                    onClick={handleEndorse}
                    disabled={endorse.isPending || !ceoSignature.trim()}
                    className="bg-[#8f0d6b] text-white shrink-0"
                  >
                    Endorse Form
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Decision note */}
            {application.decisionNote && (
              <div className="text-xs bg-muted/40 p-2.5 rounded-lg">
                <b className="text-foreground">Admissions Decision Note:</b> {application.decisionNote}
              </div>
            )}
          </div>
        </div>

        {/* Dialog Actions & Decision Controls */}
        <DialogFooter className="border-t p-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close Form
          </Button>

          {can("admissions.review") && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                disabled={review.isPending || application.status === "under_review"}
                onClick={() =>
                  review.mutate({
                    applicationId: application.id,
                    status: "under_review",
                  })
                }
              >
                Set Under Review
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1"
                disabled={review.isPending || application.status === "rejected"}
                onClick={() =>
                  review.mutate({
                    applicationId: application.id,
                    status: "rejected",
                  })
                }
              >
                <X className="h-3.5 w-3.5" /> Decline
              </Button>
              <Button
                size="sm"
                className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={review.isPending || application.status === "approved"}
                onClick={() =>
                  review.mutate({
                    applicationId: application.id,
                    status: "approved",
                  })
                }
              >
                <Check className="h-3.5 w-3.5" /> Approve & Admit Student
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
