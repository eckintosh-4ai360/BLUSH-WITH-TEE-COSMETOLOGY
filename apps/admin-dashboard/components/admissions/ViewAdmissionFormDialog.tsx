"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Check,
  CheckCircle2,
  Download,
  Eye,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blush/ui/components/ui/dialog";
import { Input } from "@blush/ui/components/ui/input";
import { Label } from "@blush/ui/components/ui/label";
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

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl p-0 border-[#8f0d6b]/20 print:p-0 print:border-none print:shadow-none print:max-h-none print:overflow-visible">
        {/* CSS for Seamless A4 Single Sheet Printing */}
        <style dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page {
                size: A4 portrait;
                margin: 6mm 8mm;
              }
              html, body {
                height: auto !important;
                overflow: visible !important;
                background: #ffffff !important;
                color: #000000 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              body * {
                visibility: hidden !important;
              }
              #printable-admission-dossier,
              #printable-admission-dossier * {
                visibility: visible !important;
              }
              #printable-admission-dossier {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                box-shadow: none !important;
                border: none !important;
                background: #ffffff !important;
                color: #1a1a1a !important;
                display: block !important;
                overflow: visible !important;
              }
              .no-print,
              button,
              [role="dialog"] > button {
                display: none !important;
              }
              div[role="dialog"],
              [data-state="open"] {
                position: static !important;
                overflow: visible !important;
                height: auto !important;
                max-height: none !important;
                transform: none !important;
                box-shadow: none !important;
                border: none !important;
                padding: 0 !important;
                margin: 0 !important;
              }
            }
          `
        }} />

        {/* Printable Dossier Container */}
        <div id="printable-admission-dossier" className="w-full bg-white text-slate-900 font-sans">
          
          {/* Top Control Bar (Screen Only) */}
          <div className="no-print flex items-center justify-between px-6 py-3 bg-[#fdf2fa] border-b border-[#8f0d6b]/20">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#8f0d6b]">
              <FileCheck className="h-4 w-4 text-[#fe00b6]" />
              <span>Official Student Admission File — {application.reference}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-1.5 rounded-full border-[#8f0d6b]/40 text-[#8f0d6b] bg-white hover:bg-[#faeaf6] shadow-sm font-semibold text-xs h-8"
              >
                <Printer className="h-3.5 w-3.5" /> Print A4 Sheet
              </Button>
            </div>
          </div>

          {/* Form Printable Body: Specially designed to fit beautifully on an A4 sheet */}
          <div className="p-5 sm:p-6 print:p-0 space-y-3">
            
            {/* Header: School Logo, Name, Location & Admission Banner */}
            <div className="rounded-xl border border-[#8f0d6b]/25 bg-gradient-to-b from-[#fdf2fa] to-white p-3.5 text-center relative print:border print:border-[#8f0d6b]/40 print:p-2.5">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                {/* School Logo */}
                <div className="relative h-14 w-14 sm:h-16 sm:w-16 shrink-0 overflow-hidden rounded-full border-2 border-[#8f0d6b]/30 bg-white p-1 shadow-sm print:h-13 print:w-13">
                  <img
                    src="/logo.png"
                    alt="Blush With Tee Logo"
                    className="h-full w-full object-contain"
                  />
                </div>

                {/* School Title & Subtitle */}
                <div className="text-center sm:text-left">
                  <span className="inline-block rounded-full bg-white px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#8f0d6b] border border-[#8f0d6b]/20 mb-0.5 print:py-0">
                    Official Student Admission File
                  </span>
                  <h2 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#8f0d6b] leading-tight print:text-xl">
                    BLUSH WITH TEE BEAUTY SCHOOL
                  </h2>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#fe00b6] flex items-center justify-center sm:justify-start gap-1">
                    <MapPin className="h-3 w-3 inline print:hidden" />
                    Allied Filling Station, A&apos;koon - Tarkwa
                  </p>
                  <p className="text-[10px] text-[#692156] font-medium">
                    Phone: <b className="text-slate-900">059 770 6250</b> | WhatsApp: <b className="text-slate-900">054 556 3536</b>
                  </p>
                </div>
              </div>

              {/* Admission Form Tag & Reference Meta */}
              <div className="mt-2.5 pt-2 border-t border-[#8f0d6b]/15 flex items-center justify-between text-[10.5px] px-2 print:mt-1.5 print:pt-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-[#8f0d6b] px-2.5 py-0.5 font-bold uppercase tracking-wider text-white text-[10px] print:bg-[#8f0d6b]">
                    ADMISSION FORM
                  </span>
                  <span className="text-slate-600">Ref: <b className="font-mono text-slate-900 font-bold">{application.reference}</b></span>
                </div>
                <div className="flex items-center gap-3 text-slate-600">
                  <span>Date: <b className="text-slate-900">{formattedCreatedAt}</b></span>
                  <Badge variant="outline" className="capitalize text-[10px] py-0 px-2 font-bold border-[#8f0d6b]/30 text-[#8f0d6b]">
                    {application.status.replaceAll("_", " ")}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Grid Container for Sections */}
            <div className="space-y-2.5 print:space-y-2 text-[10.5px] leading-snug">
              
              {/* Section 1: Applicant Personal Details */}
              <div className="rounded-lg border border-slate-300 p-2.5 bg-slate-50/50 print:bg-white print:border-slate-400 print:p-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1.5 print:mb-1">
                  <h4 className="font-bold uppercase tracking-wider text-[#8f0d6b] text-[10.5px]">
                    1. Applicant Personal Details
                  </h4>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 print:grid-cols-4 print:gap-y-1">
                  <div className="col-span-2">
                    <span className="text-slate-500 block text-[9.5px] uppercase">Full Name:</span>
                    <span className="font-bold text-slate-900 text-xs">{application.fullName}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500 block text-[9.5px] uppercase">Email Address:</span>
                    <span className="font-semibold text-slate-800">{application.email}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[9.5px] uppercase">Primary Contact:</span>
                    <span className="font-semibold text-slate-900">{application.phone}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9.5px] uppercase">WhatsApp:</span>
                    <span className="text-slate-800">{application.whatsapp || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9.5px] uppercase">Date of Birth / Age:</span>
                    <span className="text-slate-800">{formattedDob} {application.age ? `(${application.age} yrs)` : ""}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9.5px] uppercase">Hometown:</span>
                    <span className="text-slate-800">{application.hometown || "—"}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[9.5px] uppercase">Gender:</span>
                    <span className="text-slate-800 capitalize">{application.gender || "Female"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9.5px] uppercase">Marital Status:</span>
                    <span className="text-slate-800 capitalize">{application.maritalStatus || "Single"}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500 block text-[9.5px] uppercase">Residential / Postal Address:</span>
                    <span className="text-slate-800">{application.address || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Section 2: Emergency Contact & Social Media */}
              <div className="rounded-lg border border-slate-300 p-2.5 bg-slate-50/50 print:bg-white print:border-slate-400 print:p-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1.5 print:mb-1">
                  <h4 className="font-bold uppercase tracking-wider text-[#8f0d6b] text-[10.5px]">
                    2. Emergency Contact & Social Media Handles
                  </h4>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1.5 print:grid-cols-5 print:gap-y-1">
                  <div className="col-span-1">
                    <span className="text-slate-500 block text-[9.5px] uppercase">Emergency Contact:</span>
                    <span className="font-bold text-slate-900">{application.emergencyContact || "—"}</span>
                  </div>
                  <div className="col-span-1">
                    <span className="text-slate-500 block text-[9.5px] uppercase">Relationship:</span>
                    <span className="text-slate-800">{application.emergencyRelationship || "—"}</span>
                  </div>
                  <div className="col-span-1">
                    <span className="text-slate-500 block text-[9.5px] uppercase">Instagram:</span>
                    <span className="font-mono text-[#8f0d6b] font-medium">{application.instagram || "—"}</span>
                  </div>
                  <div className="col-span-1">
                    <span className="text-slate-500 block text-[9.5px] uppercase">TikTok:</span>
                    <span className="font-mono text-slate-800">{application.tiktok || "—"}</span>
                  </div>
                  <div className="col-span-1">
                    <span className="text-slate-500 block text-[9.5px] uppercase">Other Social:</span>
                    <span className="text-slate-800">{application.otherSocialMedia || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Academic Programme & Payment Terms */}
              <div className="rounded-lg border border-slate-300 p-2.5 bg-slate-50/50 print:bg-white print:border-slate-400 print:p-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1.5 print:mb-1">
                  <h4 className="font-bold uppercase tracking-wider text-[#8f0d6b] text-[10.5px]">
                    3. Academic Programme & Payment Terms
                  </h4>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1.5 print:grid-cols-5 print:gap-y-1">
                  <div className="col-span-2">
                    <span className="text-slate-500 block text-[9.5px] uppercase">Enrolled Programme:</span>
                    <span className="font-bold text-xs text-[#8f0d6b]">{courseTitle}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9.5px] uppercase">Educational Level:</span>
                    <span className="text-slate-800">{application.educationalLevel || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9.5px] uppercase">Course Duration:</span>
                    <span className="font-semibold text-slate-900">{application.duration || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9.5px] uppercase">Payment Plan:</span>
                    <span className="font-semibold text-slate-900">{application.paymentPlan || "Full Payment"}</span>
                  </div>
                </div>
              </div>

              {/* Section 4: References / Parent / Guardian */}
              <div className="rounded-lg border border-slate-300 p-2.5 bg-slate-50/50 print:bg-white print:border-slate-400 print:p-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1.5 print:mb-1">
                  <h4 className="font-bold uppercase tracking-wider text-[#8f0d6b] text-[10.5px]">
                    4. References / Parent / Guardian
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-1.5 print:grid-cols-3 print:gap-y-1">
                  <div>
                    <span className="text-slate-500 block text-[9.5px] uppercase">Guardian Name:</span>
                    <span className="font-bold text-slate-900">{application.guardianName || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9.5px] uppercase">Guardian Phone:</span>
                    <span className="font-semibold text-slate-900">{application.guardianPhone || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9.5px] uppercase">Guardian Address:</span>
                    <span className="text-slate-800">{application.guardianAddress || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Section 5: Student Declaration */}
              <div className="rounded-lg border border-[#8f0d6b]/30 bg-[#faeaf6]/20 p-2.5 print:bg-white print:border-slate-400 print:p-2">
                <div className="flex items-center justify-between border-b border-[#8f0d6b]/15 pb-1 mb-1 print:mb-0.5">
                  <h4 className="font-bold uppercase tracking-wider text-[#8f0d6b] text-[10.5px]">
                    5. Student Signature & Declaration
                  </h4>
                  <span className="text-[9.5px] font-semibold text-emerald-700">✓ Agreed to Terms & Regulations</span>
                </div>
                <p className="text-[9.5px] text-slate-600 italic leading-snug">
                  &quot;I hereby declare that the particulars provided above are accurate and truthful. I agree to abide by all the rules, terms, policies, and regulations of Blush With Tee Beauty School.&quot;
                </p>
                <div className="flex items-end justify-between pt-1.5 mt-1 border-t border-dashed border-slate-200">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block">Applicant Digital Signature:</span>
                    <p className="font-serif italic font-bold text-sm text-[#8f0d6b] leading-tight">
                      {application.signatureData || application.fullName}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-slate-500 uppercase block">Signed Date:</span>
                    <p className="font-mono font-semibold text-xs text-slate-800">{formattedCreatedAt}</p>
                  </div>
                </div>
              </div>

              {/* Section 6: Official Use Only (CEO Endorsement & Approval) */}
              <div className="rounded-lg border-2 border-dashed border-[#8f0d6b]/50 bg-gradient-to-r from-white via-[#fdf2fa]/40 to-white p-2.5 print:bg-white print:border-slate-500 print:p-2">
                <div className="flex items-center justify-between border-b border-[#8f0d6b]/20 pb-1 mb-1.5 print:mb-1">
                  <h4 className="font-serif font-bold text-xs uppercase tracking-wider text-[#8f0d6b] flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#fe00b6]" />
                    6. FOR OFFICIAL USE ONLY (CEO Endorsement & Admissions Sign-off)
                  </h4>
                  {application.ceoEndorsed ? (
                    <span className="rounded bg-emerald-600 px-2 py-0.5 text-[9.5px] font-bold text-white uppercase print:bg-emerald-700">
                      ✓ CEO Endorsed
                    </span>
                  ) : (
                    <span className="rounded bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[9.5px] font-bold uppercase">
                      Pending CEO Endorsement
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                  <div>
                    <span className="text-slate-500 block text-[9.5px] uppercase">CEO / Director Signature:</span>
                    <span className="font-serif italic font-bold text-sm text-[#8f0d6b] block">
                      {application.ceoEndorsementSignature || (application.ceoEndorsed ? "Blush With Tee Director" : "—")}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[9.5px] uppercase">Endorsement Date:</span>
                    <span className="font-semibold text-slate-800">
                      {application.ceoEndorsementDate
                        ? new Date(application.ceoEndorsementDate).toLocaleDateString("en-GB")
                        : "—"}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-slate-500 block text-[9.5px] uppercase">Official School Stamp:</span>
                    <div className="inline-block border border-dashed border-[#8f0d6b]/40 rounded px-2 py-0.5 text-[9px] font-bold uppercase text-[#8f0d6b]">
                      BLUSH WITH TEE ACADEMIC BOARD
                    </div>
                  </div>
                </div>

                {/* On-screen CEO endorsement input if not yet endorsed */}
                {!application.ceoEndorsed && can("admissions.review") && (
                  <div className="no-print mt-2 pt-2 border-t border-slate-200 flex items-center gap-2">
                    <Input
                      placeholder="Enter CEO Name / Signature to endorse"
                      value={ceoSignature}
                      onChange={e => setCeoSignature(e.target.value)}
                      className="font-serif italic h-8 text-xs max-w-sm"
                    />
                    <Button
                      size="sm"
                      onClick={handleEndorse}
                      disabled={endorse.isPending || !ceoSignature.trim()}
                      className="bg-[#8f0d6b] text-white hover:bg-[#691152] h-8 text-xs"
                    >
                      Endorse Form
                    </Button>
                  </div>
                )}

                {application.decisionNote && (
                  <div className="mt-1.5 pt-1 border-t border-slate-200 text-[10px] text-slate-700">
                    <b className="text-slate-900">Decision Note:</b> {application.decisionNote}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* Dialog Actions & Decision Controls (Screen Only) */}
        <DialogFooter className="no-print border-t p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 border-[#8f0d6b]/30 text-[#8f0d6b] hover:bg-[#faeaf6]"
            >
              <Printer className="h-3.5 w-3.5" /> Print A4 Sheet
            </Button>
          </div>

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
