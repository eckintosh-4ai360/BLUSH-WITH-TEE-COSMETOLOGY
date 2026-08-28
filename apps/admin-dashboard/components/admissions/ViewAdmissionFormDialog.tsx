"use client";

import { useState } from "react";
import {
  Check,
  CheckCircle2,
  FileCheck,
  MapPin,
  Printer,
  ShieldCheck,
  X,
} from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@blush/ui/components/ui/dialog";
import { Input } from "@blush/ui/components/ui/input";
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

// ─── Utility ─────────────────────────────────────────────────────────────────
function d(val: string | null | undefined, fallback = "—") {
  return val && val.trim() ? val : fallback;
}

// ─── Generate A4 HTML for print window ───────────────────────────────────────
function buildPrintHtml(application: AdmissionApplicationData["application"], courseTitle: string, logoAbsUrl: string) {
  const fmtDate = (v: Date | string | null | undefined) =>
    v ? new Date(v).toLocaleDateString("en-GB") : "—";

  const fmtLong = (v: Date | string | null | undefined) =>
    v
      ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "—";

  const status = application.status.replaceAll("_", " ");
  const submitted = fmtLong(application.createdAt);
  const dob = fmtDate(application.birthDate);
  const startDate = fmtDate(application.startDate);
  const ceoDate = fmtDate(application.ceoEndorsementDate);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Admission Form – ${application.reference}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 8mm 10mm;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 9pt;
    color: #1a1a1a;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── HEADER ── */
  .header {
    border: 1.5pt solid #8f0d6b;
    border-radius: 6pt;
    padding: 7pt 10pt 6pt;
    display: flex;
    align-items: center;
    gap: 10pt;
    background: #fdf2fa;
    margin-bottom: 5pt;
  }
  .header img {
    width: 52pt;
    height: 52pt;
    border-radius: 50%;
    border: 1.5pt solid #8f0d6b;
    object-fit: contain;
    background: #fff;
    padding: 2pt;
    flex-shrink: 0;
  }
  .header-text { flex: 1; }
  .header-badge {
    font-size: 6pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #8f0d6b;
    border: 0.75pt solid #8f0d6b;
    border-radius: 20pt;
    padding: 1pt 6pt;
    display: inline-block;
    margin-bottom: 2pt;
  }
  .school-name {
    font-size: 15pt;
    font-weight: 800;
    color: #8f0d6b;
    line-height: 1.15;
    letter-spacing: -0.02em;
  }
  .school-sub {
    font-size: 7.5pt;
    font-weight: 700;
    color: #fe00b6;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: 1pt;
  }
  .school-contact {
    font-size: 7pt;
    color: #4a1a38;
    margin-top: 1pt;
  }
  .header-meta {
    text-align: right;
    flex-shrink: 0;
  }
  .form-title-badge {
    background: #8f0d6b;
    color: #fff;
    font-size: 9pt;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 3pt 10pt;
    border-radius: 4pt;
    display: inline-block;
    margin-bottom: 4pt;
  }
  .ref-meta {
    font-size: 7.5pt;
    color: #3a1028;
    line-height: 1.5;
  }
  .ref-meta b { color: #1a1a1a; }
  .status-badge {
    display: inline-block;
    border: 0.75pt solid #8f0d6b;
    border-radius: 3pt;
    padding: 1pt 5pt;
    font-size: 7pt;
    font-weight: 700;
    text-transform: capitalize;
    color: #8f0d6b;
    margin-top: 2pt;
  }

  /* ── SECTIONS ── */
  .section {
    border: 0.75pt solid #ccbbcc;
    border-radius: 4pt;
    padding: 5pt 7pt 4pt;
    margin-bottom: 4pt;
    page-break-inside: avoid;
  }
  .section-title {
    font-size: 7pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #8f0d6b;
    border-bottom: 0.5pt solid #ddd;
    padding-bottom: 2pt;
    margin-bottom: 4pt;
  }

  /* ── GRID ── */
  .grid { display: grid; gap: 3pt 8pt; }
  .g2 { grid-template-columns: 1fr 1fr; }
  .g3 { grid-template-columns: 1fr 1fr 1fr; }
  .g4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
  .g5 { grid-template-columns: 1fr 1fr 1fr 1fr 1fr; }
  .span2 { grid-column: span 2; }
  .span3 { grid-column: span 3; }

  .field { line-height: 1.3; }
  .field-label {
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #666;
    display: block;
  }
  .field-value {
    font-size: 8.5pt;
    font-weight: 600;
    color: #111;
    display: block;
    word-break: break-word;
  }
  .field-value.accent { color: #8f0d6b; }
  .field-value.italic { font-style: italic; font-family: Georgia, serif; font-size: 10pt; }
  .field-value.mono { font-family: "Courier New", monospace; }

  /* ── DECLARATION ── */
  .declaration {
    border: 0.75pt solid #c9a8c9;
    border-radius: 4pt;
    background: #fdf6fc;
    padding: 5pt 7pt;
    margin-bottom: 4pt;
    page-break-inside: avoid;
  }
  .declaration-text {
    font-size: 7.5pt;
    color: #4a1a38;
    font-style: italic;
    line-height: 1.5;
    margin-bottom: 4pt;
  }
  .sig-row {
    border-top: 0.5pt dashed #ccc;
    padding-top: 3pt;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8pt;
  }

  /* ── OFFICIAL USE ── */
  .official {
    border: 1.5pt dashed #8f0d6b;
    border-radius: 4pt;
    padding: 5pt 7pt;
    background: #fffcfe;
    page-break-inside: avoid;
  }
  .official-title {
    font-size: 7.5pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #8f0d6b;
    border-bottom: 0.5pt solid #d8a8d0;
    padding-bottom: 2pt;
    margin-bottom: 4pt;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .endorsed-badge {
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    background: #14844a;
    color: #fff;
    padding: 1pt 5pt;
    border-radius: 3pt;
  }
  .pending-badge {
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    background: #f59e0b;
    color: #fff;
    padding: 1pt 5pt;
    border-radius: 3pt;
  }
  .stamp-box {
    border: 1pt dashed #8f0d6b;
    border-radius: 3pt;
    padding: 3pt 8pt;
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    color: #8f0d6b;
    letter-spacing: 0.06em;
    display: inline-block;
    margin-top: 2pt;
  }

  /* ── FOOTER ── */
  .footer {
    text-align: center;
    font-size: 6.5pt;
    color: #888;
    margin-top: 5pt;
    border-top: 0.5pt solid #eee;
    padding-top: 3pt;
  }
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <img src="${logoAbsUrl}" alt="Blush With Tee Logo" />
  <div class="header-text">
    <div class="header-badge">Official Student Admission File</div>
    <div class="school-name">BLUSH WITH TEE BEAUTY SCHOOL</div>
    <div class="school-sub">Allied Filling Station, A'koon – Tarkwa</div>
    <div class="school-contact">Phone: <b>059 770 6250</b> &nbsp;|&nbsp; WhatsApp: <b>054 556 3536</b></div>
  </div>
  <div class="header-meta">
    <div class="form-title-badge">ADMISSION FORM</div>
    <div class="ref-meta">
      Ref: <b class="mono">${application.reference}</b><br/>
      Date: <b>${submitted}</b><br/>
      <span class="status-badge">${status}</span>
    </div>
  </div>
</div>

<!-- SECTION 1: PERSONAL DETAILS -->
<div class="section">
  <div class="section-title">1. Applicant Personal Details</div>
  <div class="grid g4">
    <div class="field span2">
      <span class="field-label">Full Name</span>
      <span class="field-value">${d(application.fullName)}</span>
    </div>
    <div class="field span2">
      <span class="field-label">Email Address</span>
      <span class="field-value">${d(application.email)}</span>
    </div>

    <div class="field">
      <span class="field-label">Primary Contact</span>
      <span class="field-value">${d(application.phone)}</span>
    </div>
    <div class="field">
      <span class="field-label">WhatsApp</span>
      <span class="field-value">${d(application.whatsapp)}</span>
    </div>
    <div class="field">
      <span class="field-label">Date of Birth</span>
      <span class="field-value">${dob}</span>
    </div>
    <div class="field">
      <span class="field-label">Age</span>
      <span class="field-value">${application.age ? application.age + " yrs" : "—"}</span>
    </div>

    <div class="field">
      <span class="field-label">Hometown</span>
      <span class="field-value">${d(application.hometown)}</span>
    </div>
    <div class="field">
      <span class="field-label">Gender</span>
      <span class="field-value">${d(application.gender, "Female")}</span>
    </div>
    <div class="field">
      <span class="field-label">Marital Status</span>
      <span class="field-value" style="text-transform:capitalize">${d(application.maritalStatus, "Single")}</span>
    </div>
    <div class="field">
      <span class="field-label">Educational Level</span>
      <span class="field-value">${d(application.educationalLevel)}</span>
    </div>

    <div class="field span4">
      <span class="field-label">Residential / Postal Address</span>
      <span class="field-value">${d(application.address)}</span>
    </div>
  </div>
</div>

<!-- SECTION 2: EMERGENCY CONTACT & SOCIAL MEDIA -->
<div class="section">
  <div class="section-title">2. Emergency Contact &amp; Social Media Handles</div>
  <div class="grid g5">
    <div class="field span2">
      <span class="field-label">Emergency Contact</span>
      <span class="field-value">${d(application.emergencyContact)}</span>
    </div>
    <div class="field span2">
      <span class="field-label">Relationship to Applicant</span>
      <span class="field-value">${d(application.emergencyRelationship)}</span>
    </div>
    <div class="field"></div>
    <div class="field span2">
      <span class="field-label">Instagram Handle</span>
      <span class="field-value accent mono">${d(application.instagram)}</span>
    </div>
    <div class="field">
      <span class="field-label">TikTok Handle</span>
      <span class="field-value mono">${d(application.tiktok)}</span>
    </div>
    <div class="field span2">
      <span class="field-label">Other Social Media</span>
      <span class="field-value">${d(application.otherSocialMedia)}</span>
    </div>
  </div>
</div>

<!-- SECTION 3: PROGRAMME & PAYMENT -->
<div class="section">
  <div class="section-title">3. Academic Programme &amp; Payment Terms</div>
  <div class="grid g4">
    <div class="field span2">
      <span class="field-label">Enrolled Programme</span>
      <span class="field-value accent" style="font-weight:800">${courseTitle}</span>
    </div>
    <div class="field">
      <span class="field-label">Course Duration</span>
      <span class="field-value">${d(application.duration)}</span>
    </div>
    <div class="field">
      <span class="field-label">Preferred Start Date</span>
      <span class="field-value">${startDate}</span>
    </div>
    <div class="field span2">
      <span class="field-label">Payment Plan</span>
      <span class="field-value">${d(application.paymentPlan, "Full Payment")}</span>
    </div>
    <div class="field span2">
      <span class="field-label">&nbsp;</span>
      <span class="field-value">&nbsp;</span>
    </div>
  </div>
</div>

<!-- SECTION 4: GUARDIAN -->
<div class="section">
  <div class="section-title">4. References / Parent / Guardian</div>
  <div class="grid g3">
    <div class="field">
      <span class="field-label">Guardian Full Name</span>
      <span class="field-value">${d(application.guardianName)}</span>
    </div>
    <div class="field">
      <span class="field-label">Guardian Phone</span>
      <span class="field-value">${d(application.guardianPhone)}</span>
    </div>
    <div class="field">
      <span class="field-label">Guardian Address</span>
      <span class="field-value">${d(application.guardianAddress)}</span>
    </div>
  </div>
</div>

<!-- SECTION 5: STUDENT DECLARATION -->
<div class="declaration">
  <div class="section-title" style="border-color:#c9a8c9">5. Student Signature &amp; Declaration</div>
  <div class="declaration-text">
    "I hereby declare that all information provided above is accurate and truthful. I have read, understood, and agreed to abide by all the rules, terms, policies, and regulations governing Blush With Tee Beauty School."
  </div>
  <div class="sig-row">
    <div>
      <span class="field-label">Applicant Signature</span>
      <span class="field-value italic accent">${d(application.signatureData, application.fullName)}</span>
    </div>
    <div style="text-align:right">
      <span class="field-label">Date Signed</span>
      <span class="field-value mono">${submitted}</span>
    </div>
  </div>
</div>

<!-- SECTION 6: OFFICIAL USE -->
<div class="official">
  <div class="official-title">
    <span>6. For Official Use Only — CEO / Director Endorsement</span>
    ${application.ceoEndorsed
      ? `<span class="endorsed-badge">✓ CEO Endorsed</span>`
      : `<span class="pending-badge">Pending Endorsement</span>`}
  </div>
  <div class="grid g3">
    <div class="field">
      <span class="field-label">CEO / Director Signature</span>
      <span class="field-value italic accent">${d(application.ceoEndorsementSignature, application.ceoEndorsed ? "Blush With Tee Director" : "—")}</span>
    </div>
    <div class="field">
      <span class="field-label">Endorsement Date</span>
      <span class="field-value">${application.ceoEndorsed ? ceoDate : "—"}</span>
    </div>
    <div class="field" style="text-align:right">
      <span class="field-label">Academic Board Stamp</span>
      <div class="stamp-box">BLUSH WITH TEE<br/>ACADEMIC BOARD</div>
    </div>
  </div>
  ${application.decisionNote ? `<div style="margin-top:4pt;font-size:7.5pt;color:#333"><b>Decision Note:</b> ${application.decisionNote}</div>` : ""}
</div>

<!-- FOOTER -->
<div class="footer">
  BLUSH WITH TEE BEAUTY SCHOOL — Allied Filling Station, A'koon – Tarkwa &nbsp;·&nbsp; Tel: 059 770 6250 / 054 556 3536 &nbsp;·&nbsp; This document is an official school admission record.
</div>

<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
}

// ─── Component ────────────────────────────────────────────────────────────────
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

  const fmtDate = (v: Date | string | null | undefined) =>
    v ? new Date(v).toLocaleDateString("en-GB") : "—";

  const fmtLong = (v: Date | string | null | undefined) =>
    v
      ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "—";

  const submitted = fmtLong(application.createdAt);
  const dob = fmtDate(application.birthDate);
  const startDate = fmtDate(application.startDate);
  const ceoDate = fmtDate(application.ceoEndorsementDate);

  function handlePrint() {
    const logoUrl = `${window.location.origin}/logo.png`;
    const html = buildPrintHtml(application, courseTitle, logoUrl);
    const win = window.open("", "_blank", "width=850,height=1100");
    if (!win) {
      toast.error("Pop-up blocked. Please allow pop-ups to print.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

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
      <DialogContent className="max-h-[93vh] overflow-y-auto sm:max-w-4xl p-0 border-[#8f0d6b]/20">

        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-[#fdf2fa] border-b border-[#8f0d6b]/20 rounded-t-lg">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#8f0d6b]">
            <FileCheck className="h-4 w-4 text-[#fe00b6]" />
            Official Admission File — <span className="font-mono">{application.reference}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-1.5 rounded-full border-[#8f0d6b]/40 text-[#8f0d6b] bg-white hover:bg-[#faeaf6] text-xs h-8"
          >
            <Printer className="h-3.5 w-3.5" /> Print A4 Sheet
          </Button>
        </div>

        {/* Dossier Preview — on-screen only */}
        <div className="p-5 sm:p-6 space-y-3 text-[10.5px] leading-snug">

          {/* Header */}
          <div className="rounded-xl border border-[#8f0d6b]/25 bg-gradient-to-b from-[#fdf2fa] to-white p-3.5 print:border print:p-2.5">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-[#8f0d6b]/30 bg-white p-1 shadow-sm">
                <img src="/logo.png" alt="Blush With Tee Logo" className="h-full w-full object-contain" />
              </div>
              <div className="text-center sm:text-left flex-1">
                <span className="inline-block rounded-full bg-white px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#8f0d6b] border border-[#8f0d6b]/20 mb-0.5">
                  Official Student Admission File
                </span>
                <h2 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#8f0d6b] leading-tight">
                  BLUSH WITH TEE BEAUTY SCHOOL
                </h2>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#fe00b6] flex items-center justify-center sm:justify-start gap-1">
                  <MapPin className="h-3 w-3" />
                  Allied Filling Station, A&apos;koon - Tarkwa
                </p>
                <p className="text-[10px] text-[#692156] font-medium">
                  Phone: <b className="text-slate-900">059 770 6250</b> | WhatsApp: <b className="text-slate-900">054 556 3536</b>
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="inline-block rounded bg-[#8f0d6b] px-3 py-1 font-bold uppercase tracking-wider text-white text-[10px] mb-1.5">
                  ADMISSION FORM
                </span>
                <div className="text-[10px] text-slate-600 space-y-0.5">
                  <div>Ref: <b className="font-mono text-slate-900">{application.reference}</b></div>
                  <div>Date: <b>{submitted}</b></div>
                  <Badge variant="outline" className="capitalize text-[9px] py-0 px-2 font-bold border-[#8f0d6b]/30 text-[#8f0d6b]">
                    {application.status.replaceAll("_", " ")}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Section 1 */}
          <div className="rounded-lg border border-slate-300 p-3 bg-slate-50/50">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#8f0d6b] border-b border-slate-200 pb-1 mb-2">
              1. Applicant Personal Details
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
              <div className="col-span-2">
                <span className="text-slate-500 block text-[9px] uppercase">Full Name</span>
                <span className="font-bold text-slate-900 text-xs">{d(application.fullName)}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 block text-[9px] uppercase">Email Address</span>
                <span className="font-semibold text-slate-800">{d(application.email)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Primary Contact</span>
                <span className="font-semibold text-slate-900">{d(application.phone)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">WhatsApp</span>
                <span>{d(application.whatsapp)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Date of Birth</span>
                <span>{dob}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Age</span>
                <span>{application.age ? `${application.age} yrs` : "—"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Hometown</span>
                <span>{d(application.hometown)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Gender</span>
                <span className="capitalize">{d(application.gender, "Female")}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Marital Status</span>
                <span className="capitalize">{d(application.maritalStatus, "Single")}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Educational Level</span>
                <span>{d(application.educationalLevel)}</span>
              </div>
              <div className="col-span-4">
                <span className="text-slate-500 block text-[9px] uppercase">Residential / Postal Address</span>
                <span>{d(application.address)}</span>
              </div>
            </div>
          </div>

          {/* Section 2 */}
          <div className="rounded-lg border border-slate-300 p-3 bg-slate-50/50">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#8f0d6b] border-b border-slate-200 pb-1 mb-2">
              2. Emergency Contact &amp; Social Media Handles
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-2">
              <div className="col-span-2">
                <span className="text-slate-500 block text-[9px] uppercase">Emergency Contact</span>
                <span className="font-bold text-slate-900">{d(application.emergencyContact)}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 block text-[9px] uppercase">Relationship to Applicant</span>
                <span>{d(application.emergencyRelationship)}</span>
              </div>
              <div />
              <div className="col-span-2">
                <span className="text-slate-500 block text-[9px] uppercase">Instagram</span>
                <span className="font-mono text-[#8f0d6b] font-medium">{d(application.instagram)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">TikTok</span>
                <span className="font-mono">{d(application.tiktok)}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 block text-[9px] uppercase">Other Social</span>
                <span>{d(application.otherSocialMedia)}</span>
              </div>
            </div>
          </div>

          {/* Section 3 */}
          <div className="rounded-lg border border-slate-300 p-3 bg-slate-50/50">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#8f0d6b] border-b border-slate-200 pb-1 mb-2">
              3. Academic Programme &amp; Payment Terms
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
              <div className="col-span-2">
                <span className="text-slate-500 block text-[9px] uppercase">Enrolled Programme</span>
                <span className="font-bold text-xs text-[#8f0d6b]">{courseTitle}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Duration</span>
                <span className="font-semibold">{d(application.duration)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Preferred Start Date</span>
                <span>{startDate}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 block text-[9px] uppercase">Payment Plan</span>
                <span className="font-semibold">{d(application.paymentPlan, "Full Payment")}</span>
              </div>
            </div>
          </div>

          {/* Section 4 */}
          <div className="rounded-lg border border-slate-300 p-3 bg-slate-50/50">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#8f0d6b] border-b border-slate-200 pb-1 mb-2">
              4. References / Parent / Guardian
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2">
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Guardian Full Name</span>
                <span className="font-bold">{d(application.guardianName)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Guardian Phone</span>
                <span className="font-semibold">{d(application.guardianPhone)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Guardian Address</span>
                <span>{d(application.guardianAddress)}</span>
              </div>
            </div>
          </div>

          {/* Section 5 */}
          <div className="rounded-lg border border-[#8f0d6b]/30 bg-[#faeaf6]/20 p-3">
            <div className="flex items-center justify-between text-[9.5px] font-bold uppercase tracking-wider text-[#8f0d6b] border-b border-[#8f0d6b]/15 pb-1 mb-2">
              5. Student Signature &amp; Declaration
              <span className="text-[9px] font-semibold text-emerald-700">✓ Agreed to Terms &amp; Regulations</span>
            </div>
            <p className="text-[9.5px] text-slate-600 italic leading-relaxed mb-2">
              &quot;I hereby declare that all information provided is accurate and truthful. I have read, understood, and agreed to abide by all the rules, terms, policies, and regulations governing Blush With Tee Beauty School.&quot;
            </p>
            <div className="flex items-end justify-between border-t border-dashed border-slate-200 pt-2">
              <div>
                <span className="text-[9px] text-slate-500 uppercase block">Applicant Signature</span>
                <p className="font-serif italic font-bold text-sm text-[#8f0d6b]">
                  {d(application.signatureData, application.fullName)}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-500 uppercase block">Date Signed</span>
                <p className="font-mono font-semibold text-xs">{submitted}</p>
              </div>
            </div>
          </div>

          {/* Section 6 */}
          <div className="rounded-lg border-2 border-dashed border-[#8f0d6b]/50 bg-gradient-to-r from-white via-[#fdf2fa]/30 to-white p-3">
            <div className="flex items-center justify-between text-[9.5px] font-bold uppercase tracking-wider text-[#8f0d6b] border-b border-[#8f0d6b]/20 pb-1 mb-2">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[#fe00b6]" />
                6. For Official Use Only — CEO Endorsement
              </span>
              {application.ceoEndorsed ? (
                <span className="rounded bg-emerald-600 px-2 py-0.5 text-[9px] font-bold text-white uppercase">
                  ✓ CEO Endorsed
                </span>
              ) : (
                <span className="rounded bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[9px] font-bold uppercase">
                  Pending
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4 items-center">
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">CEO / Director Signature</span>
                <span className="font-serif italic font-bold text-sm text-[#8f0d6b]">
                  {d(application.ceoEndorsementSignature, application.ceoEndorsed ? "Blush With Tee Director" : "—")}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Endorsement Date</span>
                <span className="font-semibold">{application.ceoEndorsed ? ceoDate : "—"}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[9px] uppercase">Academic Board Stamp</span>
                <div className="inline-block border border-dashed border-[#8f0d6b]/50 rounded px-2 py-1 text-[9px] font-bold uppercase text-[#8f0d6b]">
                  BLUSH WITH TEE<br />ACADEMIC BOARD
                </div>
              </div>
            </div>

            {!application.ceoEndorsed && can("admissions.review") && (
              <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center gap-2">
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
              <div className="mt-2 pt-1.5 border-t border-slate-200 text-[10px] text-slate-700">
                <b className="text-slate-900">Decision Note:</b> {application.decisionNote}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="border-t p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20">
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
                onClick={() => review.mutate({ applicationId: application.id, status: "under_review" })}
              >
                Set Under Review
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1"
                disabled={review.isPending || application.status === "rejected"}
                onClick={() => review.mutate({ applicationId: application.id, status: "rejected" })}
              >
                <X className="h-3.5 w-3.5" /> Decline
              </Button>
              <Button
                size="sm"
                className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={review.isPending || application.status === "approved"}
                onClick={() => review.mutate({ applicationId: application.id, status: "approved" })}
              >
                <Check className="h-3.5 w-3.5" /> Approve &amp; Admit Student
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
