/**
 * The official admission form, as one self-contained A4 document.
 *
 * Shared deliberately. An applicant prints their copy the moment they submit
 * and the office prints one from the dossier later; those have to be the same
 * sheet, or two copies of a signed document disagree.
 *
 * Returns a complete HTML document, meant to be written into a window of its
 * own. Built that way rather than as print styles over the page, because a
 * print stylesheet still prints the page it sits on - the navigation, the
 * marketing copy, the sidebar - and an admission form is not a screenshot of a
 * website.
 */

export type AdmissionFormData = {
  application: {
    /** Absent when printing straight after an online submission. */
    id?: number;
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
    status?: string;
    decisionNote?: string | null;
    createdAt: Date | string;
  };
  courseTitle: string;
  /** Tuition quoted for the programme, as agreed on this form. */
  tuition?: number | string | null;
  /** Tools and product kit, where the programme charges for one. */
  productFee?: number | string | null;
};

/** An empty field prints as a dash rather than as a gap. */
function d(val: string | null | undefined, fallback = "\u2014") {
  return val && val.trim() ? val : fallback;
}

/**
 * A figure the applicant can check against a receipt: "GH¢ 13,000.00".
 *
 * Returns null rather than a zero for anything unset, so a programme with no
 * product fee prints no product fee line at all.
 */
function cedis(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `GH\u00a2 ${amount.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function buildAdmissionFormHtml(
  application: AdmissionFormData["application"],
  courseTitle: string,
  logoAbsUrl: string,
  fees?: { tuition?: number | string | null; productFee?: number | string | null },
) {
  const tuition = cedis(fees?.tuition);
  const productFee = cedis(fees?.productFee);
  const fmtDate = (v: Date | string | null | undefined) =>
    v ? new Date(v).toLocaleDateString("en-GB") : "—";

  const fmtLong = (v: Date | string | null | undefined) =>
    v
      ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "—";

  const status = (application.status ?? "submitted").replaceAll("_", " ");
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
    margin: 7mm 9mm;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    width: 100%;
    height: 100%;
  }

  body {
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 9pt;
    color: #1a1a1a;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .page-wrap {
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
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
    padding: 8pt 9pt 6pt;
    margin-bottom: 0;
    page-break-inside: avoid;
    display: flex;
    flex-direction: column;
  }
  /* sections that flex-grow to fill remaining space */
  .section.grow { flex: 1; }
  .section-title {
    font-size: 7pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #8f0d6b;
    border-bottom: 0.5pt solid #ddd;
    padding-bottom: 3pt;
    margin-bottom: 6pt;
  }
  /* vertical spacer between sections */
  .gap { flex-shrink: 0; height: 5pt; }

  /* ── GRID ── */
  .grid { display: grid; gap: 5pt 10pt; }
  .g2 { grid-template-columns: 1fr 1fr; }
  .g3 { grid-template-columns: 1fr 1fr 1fr; }
  .g4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
  .g5 { grid-template-columns: 1fr 1fr 1fr 1fr 1fr; }
  .span2 { grid-column: span 2; }
  .span3 { grid-column: span 3; }

  .field { line-height: 1.4; }
  .field-label {
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #666;
    display: block;
    margin-bottom: 1pt;
  }
  .field-value {
    font-size: 9pt;
    font-weight: 600;
    color: #111;
    display: block;
    word-break: break-word;
    min-height: 11pt;
  }
  .field-value.accent { color: #8f0d6b; }
  .field-value.italic { font-style: italic; font-family: Georgia, serif; font-size: 11pt; }
  .field-value.mono { font-family: "Courier New", monospace; }

  /* ── DECLARATION ── */
  .declaration {
    border: 0.75pt solid #c9a8c9;
    border-radius: 4pt;
    background: #fdf6fc;
    padding: 8pt 9pt;
    page-break-inside: avoid;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .declaration-text {
    font-size: 8pt;
    color: #4a1a38;
    font-style: italic;
    line-height: 1.7;
    margin-bottom: 8pt;
    flex: 1;
  }
  .sig-row {
    border-top: 0.5pt dashed #ccc;
    padding-top: 5pt;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8pt;
  }

  /* ── OFFICIAL USE ── */
  .official {
    border: 1.5pt dashed #8f0d6b;
    border-radius: 4pt;
    padding: 8pt 9pt;
    background: #fffcfe;
    page-break-inside: avoid;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .official-title {
    font-size: 7.5pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #8f0d6b;
    border-bottom: 0.5pt solid #d8a8d0;
    padding-bottom: 3pt;
    margin-bottom: 6pt;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .official-fields { flex: 1; }
  .endorsed-badge {
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    background: #14844a;
    color: #fff;
    padding: 1.5pt 6pt;
    border-radius: 3pt;
  }
  .pending-badge {
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    background: #f59e0b;
    color: #fff;
    padding: 1.5pt 6pt;
    border-radius: 3pt;
  }
  .stamp-box {
    border: 1pt dashed #8f0d6b;
    border-radius: 3pt;
    padding: 6pt 10pt;
    font-size: 7pt;
    font-weight: 700;
    text-transform: uppercase;
    color: #8f0d6b;
    letter-spacing: 0.06em;
    display: inline-block;
    text-align: center;
    line-height: 1.5;
  }

  /* ── FOOTER ── */
  .footer {
    text-align: center;
    font-size: 6.5pt;
    color: #888;
    margin-top: 6pt;
    border-top: 0.5pt solid #eee;
    padding-top: 4pt;
    flex-shrink: 0;
  }
</style>
</head>
<body>
<div class="page-wrap">

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
<div class="gap"></div>

<!-- SECTION 1: PERSONAL DETAILS -->
<div class="section grow">
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
<div class="gap"></div>

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
<div class="gap"></div>

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
    <div class="field">
      <span class="field-label">Tuition Fee</span>
      <span class="field-value accent" style="font-weight:800">${d(tuition)}</span>
    </div>
    <div class="field">
      <span class="field-label">Tools &amp; Product Kit</span>
      <span class="field-value">${productFee ?? "Not applicable"}</span>
    </div>
  </div>
</div>
<div class="gap"></div>

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
<div class="gap"></div>

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
<div class="gap"></div>

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

</div><!-- end page-wrap -->

<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
}

// ─── Component ────────────────────────────────────────────────────────────────
