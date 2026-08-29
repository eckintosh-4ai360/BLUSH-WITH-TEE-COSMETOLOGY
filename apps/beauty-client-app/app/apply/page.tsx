"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  buildAdmissionFormHtml,
  type AdmissionFormData,
} from "@blush/shared/admission-form";
import Link from "next/link";
import {
  AlertCircle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileText,
  FileUp,
  GraduationCap,
  HeartHandshake,
  HelpCircle,
  Info,
  MapPin,
  Phone,
  Printer,
  ScrollText,
  Search,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import PublicShell from "@/components/PublicShell";
import { trpc } from "@/lib/trpc";

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

const APPLICATION_STEPS = [
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under Review" },
  { key: "more_information", label: "More Info" },
  { key: "approved", label: "Approved" },
] as const;

function ApplicationStatusTracker({ status }: { status: string }) {
  if (status === "rejected") {
    return (
      <p className="mt-2 text-xs font-bold uppercase tracking-[.1em] text-[#e01a4f]">
        Application not approved
      </p>
    );
  }
  const stepIndex = APPLICATION_STEPS.findIndex(s => s.key === status);
  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center gap-1.5">
        {APPLICATION_STEPS.map((step, index) => (
          <span
            key={step.key}
            className={`h-2 flex-1 rounded-full transition-all ${
              index <= stepIndex
                ? "bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b]"
                : "bg-[#faeaf6]"
            }`}
            title={step.label}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] font-semibold text-[#8f0d6b]/70">
        {APPLICATION_STEPS.map((step, index) => (
          <span
            key={step.key}
            className={index <= stepIndex ? "font-bold text-[#8f0d6b]" : ""}
          >
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ApplyFormContent() {
  const searchParams = useSearchParams();
  const initialCourseId = searchParams.get("courseId") || "";

  const { data: courses = [], isLoading: loadingCourses } = trpc.content.courses.useQuery();
  const { data: termsData } = trpc.content.terms.useQuery();
  const submit = trpc.admissions.submit.useMutation();
  const upload = trpc.admissions.uploadDocument.useMutation();

  const [lookupInput, setLookupInput] = useState<{ reference: string; email: string } | null>(null);
  const lookup = trpc.admissions.lookup.useQuery(
    lookupInput ?? { reference: "APP-000000", email: "placeholder@example.com" },
    { enabled: Boolean(lookupInput) }
  );

  // Form State
  const [selectedCourseId, setSelectedCourseId] = useState<string>(initialCourseId);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [hometown, setHometown] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("Female");
  const [maritalStatus, setMaritalStatus] = useState("single");
  const [address, setAddress] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [otherSocialMedia, setOtherSocialMedia] = useState("");
  const [educationalLevel, setEducationalLevel] = useState("SHS");
  const [paymentPlan, setPaymentPlan] = useState("Full Payment");
  const [startDate, setStartDate] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianAddress, setGuardianAddress] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [statement, setStatement] = useState("");

  const [transcript, setTranscript] = useState<File | null>(null);
  const [governmentId, setGovernmentId] = useState<File | null>(null);

  const [success, setSuccess] = useState<{
    reference: string;
    email: string;
    courseTitle: string;
    applicantName: string;
    /** Everything that was submitted, kept so it can be printed. */
    form: AdmissionFormData["application"];
  } | null>(null);
  const [error, setError] = useState("");

  // Sync url param if courses load later
  useEffect(() => {
    if (initialCourseId && !selectedCourseId) {
      setSelectedCourseId(initialCourseId);
    }
  }, [initialCourseId, selectedCourseId]);

  const selectedCourse = useMemo(() => {
    if (!selectedCourseId) return null;
    return courses.find(c => String(c.id) === selectedCourseId) || null;
  }, [selectedCourseId, courses]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!selectedCourseId) {
      setError("Please select the programme you are applying for.");
      return;
    }

    if (!agreedToTerms) {
      setError("You must read and agree to the school's terms, policies, and regulations.");
      return;
    }

    if (!signatureName.trim()) {
      setError("Please enter your full name as your digital signature.");
      return;
    }

    try {
      const result = await submit.mutateAsync({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        whatsapp: whatsapp.trim() || undefined,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        hometown: hometown.trim() || undefined,
        age: age.trim() ? Number(age) : undefined,
        gender: gender || undefined,
        maritalStatus: maritalStatus || undefined,
        address: address.trim() || undefined,
        emergencyContact: emergencyContact.trim() || undefined,
        emergencyRelationship: emergencyRelationship.trim() || undefined,
        instagram: instagram.trim() || undefined,
        tiktok: tiktok.trim() || undefined,
        otherSocialMedia: otherSocialMedia.trim() || undefined,
        educationalLevel: educationalLevel || undefined,
        courseId: Number(selectedCourseId),
        paymentPlan: paymentPlan || undefined,
        duration: selectedCourse ? `${selectedCourse.durationWeeks} weeks` : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        guardianName: guardianName.trim() || undefined,
        guardianAddress: guardianAddress.trim() || undefined,
        guardianPhone: guardianPhone.trim() || undefined,
        signatureData: signatureName.trim(),
        agreedToTerms: true,
        statement: statement.trim() || undefined,
      });

      // Upload documents if provided
      if (transcript) {
        await upload.mutateAsync({
          reference: result.reference,
          email: email.trim().toLowerCase(),
          documentType: "transcript",
          fileName: transcript.name,
          mimeType: transcript.type,
          base64Data: await fileToDataUrl(transcript),
        });
      }

      if (governmentId) {
        await upload.mutateAsync({
          reference: result.reference,
          email: email.trim().toLowerCase(),
          documentType: "government_id",
          fileName: governmentId.name,
          mimeType: governmentId.type,
          base64Data: await fileToDataUrl(governmentId),
        });
      }

      setSuccess({
        reference: result.reference,
        email: email.trim(),
        courseTitle: result.courseTitle || selectedCourse?.title || "Cosmetology Programme",
        applicantName: fullName.trim(),
        form: {
          reference: result.reference,
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          whatsapp: whatsapp.trim() || null,
          birthDate: birthDate || null,
          hometown: hometown.trim() || null,
          age: age.trim() ? Number(age) : null,
          gender: gender || null,
          maritalStatus: maritalStatus || null,
          address: address.trim() || null,
          emergencyContact: emergencyContact.trim() || null,
          emergencyRelationship: emergencyRelationship.trim() || null,
          instagram: instagram.trim() || null,
          tiktok: tiktok.trim() || null,
          otherSocialMedia: otherSocialMedia.trim() || null,
          educationalLevel: educationalLevel || null,
          paymentPlan: paymentPlan || null,
          duration: selectedCourse ? `${selectedCourse.durationWeeks} weeks` : null,
          startDate: startDate || null,
          guardianName: guardianName.trim() || null,
          guardianAddress: guardianAddress.trim() || null,
          guardianPhone: guardianPhone.trim() || null,
          signatureData: signatureName.trim(),
          agreedToTerms: true,
          statement: statement.trim() || null,
          status: "submitted",
          createdAt: new Date(),
        },
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your application could not be submitted. Please try again."
      );
    }
  }

  function printAdmissionForm() {
    if (!success) return;

    const html = buildAdmissionFormHtml(
      success.form,
      success.courseTitle,
      `${window.location.origin}/logo.png`,
    );

    const win = window.open("", "_blank", "width=850,height=1100");
    if (!win) {
      setError("Your browser blocked the print window. Allow pop-ups and try again.");
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  return (
    <PublicShell>
      <main className="container py-12 sm:py-20">
        {/* Top Official Banner */}
        <div className="mb-10 text-center max-w-3xl mx-auto">
          <Badge className="bg-[#faeaf6] text-[#8f0d6b] px-4 py-1.5 text-xs font-bold uppercase tracking-widest hover:bg-[#faeaf6]">
            Official Admissions Portal
          </Badge>
          <h1 className="mt-4 font-serif text-4xl font-bold tracking-tight text-[#8f0d6b] sm:text-5xl">
            BLUSH WITH TEE BEAUTY SCHOOL
          </h1>
          <p className="mt-2 text-sm font-semibold text-[#fe00b6] flex items-center justify-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" />
            Allied Filling Station, A&apos;koon - Tarkwa
          </p>
          <p className="mt-1 text-xs text-[#692156] flex items-center justify-center gap-4 flex-wrap">
            <span>Phone: <b>059 770 6250</b></span>
            <span>·</span>
            <span>WhatsApp: <b>054 556 3536</b></span>
          </p>
        </div>

        <div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]">
          {/* Left Column: School Information, Policies & Tracker */}
          <aside className="space-y-6">
            {/* Quick Track Application Card */}
            <div className="rounded-3xl border border-[#8f0d6b]/15 bg-white/90 p-6 shadow-[0_12px_36px_rgba(143,13,107,.06)] backdrop-blur">
              <div className="flex items-center gap-2 text-[#8f0d6b]">
                <Search className="h-5 w-5 text-[#fe00b6]" />
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  Track Application Status
                </h3>
              </div>
              <p className="mt-1 text-xs text-[#692156]">
                Already submitted your form? Check your admission progress anytime.
              </p>
              <form
                className="mt-4 grid gap-3"
                onSubmit={event => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  setLookupInput({
                    reference: String(form.get("reference")).trim().toUpperCase(),
                    email: String(form.get("lookupEmail")).trim().toLowerCase(),
                  });
                }}
              >
                <input
                  name="reference"
                  required
                  placeholder="Application Ref (e.g. APP-0012)"
                  className="soft-input font-mono uppercase"
                />
                <input
                  name="lookupEmail"
                  required
                  type="email"
                  placeholder="Applicant Email Address"
                  className="soft-input"
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full rounded-full border-[#8f0d6b]/25 bg-white text-[#8f0d6b] hover:bg-[#faeaf6]"
                >
                  <Search className="mr-2 h-4 w-4 text-[#fe00b6]" />
                  Check Status
                </Button>
              </form>

              {lookup.data && (
                <div className="mt-5 rounded-2xl bg-[#faeaf6] p-4 text-sm text-[#8f0d6b] border border-[#fe00b6]/30">
                  <div className="flex items-center justify-between">
                    <b className="font-mono text-base">{lookup.data.reference}</b>
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold uppercase text-[#fe00b6]">
                      {lookup.data.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[#8f0d6b]">
                    {lookup.data.courseTitle}
                  </p>
                  <ApplicationStatusTracker status={lookup.data.status} />
                </div>
              )}
              {lookup.error && (
                <p className="mt-3 text-xs font-semibold text-[#e01a4f]">
                  {lookup.error.message}
                </p>
              )}
            </div>

            {/* Training Schedule & Toiletries Requirements */}
            <div className="rounded-3xl border border-[#8f0d6b]/15 bg-gradient-to-br from-white/95 to-[#fdf2fa] p-6 shadow-sm">
              <div className="flex items-center gap-2 text-[#8f0d6b]">
                <Clock className="h-5 w-5 text-[#fe00b6]" />
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  Class Hours & Schedule
                </h3>
              </div>
              <ul className="mt-3 space-y-2 text-xs text-[#692156]">
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#fe00b6] mt-1.5 shrink-0" />
                  <span><b>Regular Classes:</b> Monday – Saturday (8:00 AM – 5:00 PM)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#fe00b6] mt-1.5 shrink-0" />
                  <span><b>Weekday Beginners:</b> Tuesday – Friday (9:00 AM – 2:00 PM)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#fe00b6] mt-1.5 shrink-0" />
                  <span><b>Weekday Advanced:</b> Tuesday – Friday (9:00 AM – 5:00 PM)</span>
                </li>
                <li className="flex items-start gap-2 text-[#8f0d6b] font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#fe00b6] mt-1.5 shrink-0" />
                  <span><b>Reporting Time:</b> 8:00 AM sharp</span>
                </li>
              </ul>

              <div className="mt-5 border-t border-[#8f0d6b]/10 pt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[#8f0d6b] flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-[#fe00b6]" />
                  Toiletries to be Brought (Day 1)
                </p>
                <div className="mt-2 rounded-2xl bg-white/80 p-3 text-xs leading-relaxed text-[#692156] border border-[#8f0d6b]/10">
                  <p>• One big size Omo</p>
                  <p>• One big size Dettol</p>
                  <p>• One big size Paper Roll</p>
                  <p>• 2 big wet wipes</p>
                  <p>• 1 full pack of razor blades</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-amber-500/10 p-3 text-xs text-amber-900 border border-amber-500/20">
                <b>Tools & Products:</b> All training products and tools are purchased at the school store to guarantee authentic quality and uniformity.
              </div>
            </div>

            {/* School Policies / Terms & Conditions Governing the School */}
            <div className="rounded-3xl border border-[#8f0d6b]/20 bg-gradient-to-br from-white via-[#fdf2fa]/40 to-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-[#8f0d6b]/15 pb-3">
                <div className="flex items-center gap-2 text-[#8f0d6b]">
                  <ScrollText className="h-5 w-5 text-[#fe00b6]" />
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#8f0d6b]">
                      Terms &amp; Conditions
                    </h3>
                    <p className="text-[10px] text-[#692156]">Governing the School</p>
                  </div>
                </div>
                <Link
                  href="/terms"
                  target="_blank"
                  className="inline-flex items-center gap-1 rounded-full bg-[#faeaf6] px-2.5 py-1 text-[10px] font-bold text-[#8f0d6b] hover:bg-[#8f0d6b] hover:text-white transition-colors"
                >
                  Policy Page <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              {/* Terms list */}
              <div className="mt-4 max-h-[380px] overflow-y-auto space-y-3 pr-1 text-xs text-[#521340]">
                {termsData?.sections?.map((section, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[#8f0d6b]/10 bg-white/80 p-3 shadow-[0_2px_8px_rgba(143,13,107,0.03)]"
                  >
                    <p className="font-bold text-[#8f0d6b] flex items-center gap-1.5">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#8f0d6b] text-[9px] font-bold text-white">
                        {idx + 1}
                      </span>
                      <span>{section.title}</span>
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#521340]">
                      {section.body}
                    </p>
                  </div>
                )) ?? (
                  <>
                    <p><b>1. Discipline &amp; Personal Hygiene:</b> High standards of cleanliness and professional grooming are strictly required.</p>
                    <p><b>2. Student Modeling:</b> Students are expected to model for each other during practical sessions.</p>
                    <p><b>3. Prescribed Uniform:</b> School T-shirt &amp; Lacoste (Tue–Thu), Mufti on Friday. Flat shoes/Crocs/sandals only.</p>
                    <p><b>4. Class Attendance:</b> Reporting time is 8:00 AM sharp.</p>
                    <p><b>5. Protective Gear:</b> Aprons and protective wear are mandatory in practicals.</p>
                    <p><b>6. School Property:</b> Damages to tools or school properties are payable.</p>
                    <p><b>7. Graduation:</b> Final project works and full fee clearance are required for graduation.</p>
                  </>
                )}
              </div>

              {/* Bottom Notice */}
              <div className="mt-4 rounded-xl border border-[#e01a4f]/30 bg-rose-50/80 p-3 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#e01a4f]">
                  ⚠️ {termsData?.footer || "FEES PAID IS STRICTLY NON REFUNDABLE"}
                </p>
              </div>
            </div>
          </aside>

          {/* Right Column: Official Admission Form */}
          <section className="rounded-[2.5rem] border border-[#8f0d6b]/15 bg-white/95 p-6 shadow-[0_20px_50px_rgba(143,13,107,.08)] backdrop-blur sm:p-10">
            {success ? (
              <div className="py-12 text-center space-y-6">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#faeaf6] text-[#fe00b6] shadow-lg ring-8 ring-[#faeaf6]/50">
                  <CheckCircle2 className="h-12 w-12" />
                </div>
                <div>
                  <Badge className="bg-[#faeaf6] text-[#8f0d6b] font-bold">
                    Official Application Submitted
                  </Badge>
                  <h2 className="mt-3 font-serif text-3xl font-bold text-[#8f0d6b] sm:text-4xl">
                    Welcome to Blush With Tee!
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#692156]">
                    Congratulations <b>{success.applicantName}</b>, your admission form for <b>{success.courseTitle}</b> has been received and logged in the official school register.
                  </p>
                </div>

                <div className="mx-auto max-w-md rounded-2xl border border-[#fe00b6]/30 bg-[#fdf2fa] p-5 text-left space-y-2">
                  <p className="text-xs text-[#8f0d6b]/80 uppercase tracking-wider font-semibold">
                    Your Official Application Reference
                  </p>
                  <p className="font-mono text-2xl font-bold text-[#fe00b6]">
                    {success.reference}
                  </p>
                  <p className="text-xs text-[#692156] pt-1">
                    A confirmation has been sent to <b>{success.email}</b>. Our admissions office will contact you via phone/WhatsApp to confirm your orientation date and stationery list.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-3 flex-wrap pt-4">
                  <Button
                    onClick={printAdmissionForm}
                    variant="outline"
                    className="rounded-full border-[#8f0d6b]/30 text-[#8f0d6b] gap-2"
                  >
                    <Printer className="h-4 w-4" /> Print Admission Form
                  </Button>
                  <Button
                    onClick={() => {
                      setSuccess(null);
                      setSelectedCourseId("");
                    }}
                    className="rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-6 text-white font-bold shadow-md"
                  >
                    Submit Another Application
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Form Header */}
                <div className="border-b border-[#8f0d6b]/15 pb-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#fe00b6]">
                      Student Admission & Registration
                    </p>
                    <span className="text-xs font-mono text-[#8f0d6b]/60">Form Ref: BWT-ADM-2026</span>
                  </div>
                  <h2 className="mt-1 font-serif text-3xl font-bold text-[#8f0d6b]">
                    Student Admission Form
                  </h2>
                  <p className="mt-1 text-xs text-[#692156]">
                    Please complete all required fields accurately. All information will form part of your permanent student records.
                  </p>
                </div>

                {/* Section 1: Personal Details */}
                <div className="space-y-4">
                  <h3 className="font-serif text-lg font-bold text-[#8f0d6b] flex items-center gap-2">
                    <User className="h-4 w-4 text-[#fe00b6]" />
                    1. Personal Information
                  </h3>

                  <div className="space-y-2">
                    <label className="field-label">
                      Full Name (Surname First or Full Name as on ID) <span className="text-[#fe00b6]">*</span>
                      <input
                        required
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        placeholder="e.g. Mensah Jessica Akosua"
                        className="soft-input"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="field-label">
                      Email Address <span className="text-[#fe00b6]">*</span>
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="jessica@example.com"
                        className="soft-input"
                      />
                    </label>
                    <label className="field-label">
                      Primary Contact Number <span className="text-[#fe00b6]">*</span>
                      <input
                        required
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="059 770 6250"
                        className="soft-input"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="field-label">
                      WhatsApp Number
                      <input
                        value={whatsapp}
                        onChange={e => setWhatsapp(e.target.value)}
                        placeholder="054 556 3536"
                        className="soft-input"
                      />
                    </label>
                    <label className="field-label">
                      Date of Birth
                      <input
                        type="date"
                        value={birthDate}
                        onChange={e => setBirthDate(e.target.value)}
                        className="soft-input"
                      />
                    </label>
                    <label className="field-label">
                      Age
                      <input
                        type="number"
                        min="10"
                        max="100"
                        value={age}
                        onChange={e => setAge(e.target.value)}
                        placeholder="e.g. 21"
                        className="soft-input"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="field-label">
                      Hometown (Town / Region)
                      <input
                        value={hometown}
                        onChange={e => setHometown(e.target.value)}
                        placeholder="e.g. Tarkwa, Western Region"
                        className="soft-input"
                      />
                    </label>
                    <label className="field-label">
                      Gender
                      <select
                        value={gender}
                        onChange={e => setGender(e.target.value)}
                        className="soft-input"
                      >
                        <option value="Female">Female</option>
                        <option value="Male">Male</option>
                        <option value="Other">Other</option>
                      </select>
                    </label>
                    <label className="field-label">
                      Marital Status
                      <select
                        value={maritalStatus}
                        onChange={e => setMaritalStatus(e.target.value)}
                        className="soft-input"
                      >
                        <option value="single">Single</option>
                        <option value="married">Married</option>
                        <option value="divorced">Divorced</option>
                        <option value="widowed">Widowed</option>
                        <option value="separated">Separated</option>
                      </select>
                    </label>
                  </div>

                  <label className="field-label">
                    Residential / Postal Address <span className="text-[#fe00b6]">*</span>
                    <textarea
                      required
                      rows={2}
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      placeholder="e.g. House No. 24, Akoon Inside Allied Filling Station, Tarkwa"
                      className="soft-input min-h-20"
                    />
                  </label>
                </div>

                {/* Section 2: Emergency Contact & Social Media */}
                <div className="space-y-4 border-t border-[#8f0d6b]/15 pt-6">
                  <h3 className="font-serif text-lg font-bold text-[#8f0d6b] flex items-center gap-2">
                    <Phone className="h-4 w-4 text-[#fe00b6]" />
                    2. Emergency Contact & Social Media
                  </h3>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="field-label">
                      Emergency Contact (Name & Phone) <span className="text-[#fe00b6]">*</span>
                      <input
                        required
                        value={emergencyContact}
                        onChange={e => setEmergencyContact(e.target.value)}
                        placeholder="e.g. Madam Mary Mensah (024 123 4567)"
                        className="soft-input"
                      />
                    </label>
                    <label className="field-label">
                      Relationship to Contact <span className="text-[#fe00b6]">*</span>
                      <input
                        required
                        value={emergencyRelationship}
                        onChange={e => setEmergencyRelationship(e.target.value)}
                        placeholder="e.g. Mother / Father / Spouse / Sibling"
                        className="soft-input"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="field-label">
                      Instagram Handle
                      <input
                        value={instagram}
                        onChange={e => setInstagram(e.target.value)}
                        placeholder="@your_instagram"
                        className="soft-input"
                      />
                    </label>
                    <label className="field-label">
                      TikTok Handle
                      <input
                        value={tiktok}
                        onChange={e => setTiktok(e.target.value)}
                        placeholder="@your_tiktok"
                        className="soft-input"
                      />
                    </label>
                    <label className="field-label">
                      Other Social Media Handle
                      <input
                        value={otherSocialMedia}
                        onChange={e => setOtherSocialMedia(e.target.value)}
                        placeholder="Facebook / Twitter"
                        className="soft-input"
                      />
                    </label>
                  </div>
                </div>

                {/* Section 3: Course Selection & Payment Plan */}
                <div className="space-y-4 border-t border-[#8f0d6b]/15 pt-6">
                  <h3 className="font-serif text-lg font-bold text-[#8f0d6b] flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-[#fe00b6]" />
                    3. Programme Choice & Payment Plan
                  </h3>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="field-label">
                      Educational Level
                      <select
                        value={educationalLevel}
                        onChange={e => setEducationalLevel(e.target.value)}
                        className="soft-input"
                      >
                        <option value="JHS">Junior High School (JHS)</option>
                        <option value="SHS">Senior High School (SHS)</option>
                        <option value="Tertiary">Tertiary / University</option>
                        <option value="Vocational">Vocational / Technical</option>
                        <option value="Other">Other / Self-Trained</option>
                      </select>
                    </label>

                    <label className="field-label">
                      Desired Programme <span className="text-[#fe00b6]">*</span>
                      <select
                        required
                        value={selectedCourseId}
                        onChange={e => setSelectedCourseId(e.target.value)}
                        className="soft-input"
                      >
                        <option value="">-- Select a Programme --</option>
                        {courses.map(c => (
                          <option key={c.id} value={String(c.id)}>
                            {c.title} — GH₵ {Number(c.tuition).toLocaleString()} ({c.durationWeeks} wks)
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* Selected Course Live Summary Card */}
                  {selectedCourse && (
                    <div className="rounded-2xl border border-[#fe00b6]/30 bg-gradient-to-br from-[#faeaf6]/80 to-white p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <Badge className="bg-[#8f0d6b] text-white font-mono text-[11px]">
                            {selectedCourse.code}
                          </Badge>
                          <h4 className="mt-1 font-serif text-lg font-bold text-[#8f0d6b]">
                            {selectedCourse.title}
                          </h4>
                          <p className="text-xs text-[#692156]">
                            {selectedCourse.summary}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-[#8f0d6b]/70 font-semibold block">Tuition Fee</span>
                          <span className="font-serif text-2xl font-bold text-[#8f0d6b]">
                            GH₵ {Number(selectedCourse.tuition).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-3 text-xs text-[#692156] border-t border-[#8f0d6b]/10 pt-3">
                        <div>
                          <b>Duration:</b> {selectedCourse.durationWeeks} weeks
                        </div>
                        <div>
                          <b>Schedule:</b> {selectedCourse.schedule || "Monday - Saturday (8am - 5pm)"}
                        </div>
                        <div>
                          <b>Certification:</b> {selectedCourse.certification || "Certificate"}
                        </div>
                      </div>

                      {selectedCourse.productFee ? (
                        <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-900 flex items-center justify-between">
                          <span>Required Tools & Product Kit Fee (School Store):</span>
                          <b>GH₵ {Number(selectedCourse.productFee).toLocaleString()}</b>
                        </div>
                      ) : null}

                      {selectedCourse.toiletries ? (
                        <div className="text-[11px] text-[#692156] bg-white/70 rounded-xl p-2.5 border border-[#8f0d6b]/10">
                          <b>Required Toiletries on Day 1:</b> {selectedCourse.toiletries}
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="field-label">
                      Payment Plan Preference
                      <select
                        value={paymentPlan}
                        onChange={e => setPaymentPlan(e.target.value)}
                        className="soft-input"
                      >
                        <option value="Full Payment">Full Payment (Upfront)</option>
                        <option value="2 Installments">2 Installments (60% Deposit / 40% Balance)</option>
                        <option value="3 Installments">3 Installments</option>
                        <option value="Weekly/Monthly">Weekly / Monthly Plan</option>
                      </select>
                    </label>

                    <label className="field-label">
                      Preferred Start Date
                      <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="soft-input"
                      />
                    </label>
                  </div>
                </div>

                {/* Section 4: References / Parents / Guardian */}
                <div className="space-y-4 border-t border-[#8f0d6b]/15 pt-6">
                  <h3 className="font-serif text-lg font-bold text-[#8f0d6b] flex items-center gap-2">
                    <HeartHandshake className="h-4 w-4 text-[#fe00b6]" />
                    4. Parent / Guardian / Reference
                  </h3>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="field-label">
                      Guardian / Reference Full Name
                      <input
                        value={guardianName}
                        onChange={e => setGuardianName(e.target.value)}
                        placeholder="e.g. Mr. Samuel Mensah"
                        className="soft-input"
                      />
                    </label>
                    <label className="field-label">
                      Guardian Phone Number
                      <input
                        value={guardianPhone}
                        onChange={e => setGuardianPhone(e.target.value)}
                        placeholder="024 456 7890"
                        className="soft-input"
                      />
                    </label>
                  </div>

                  <label className="field-label">
                    Guardian Residential / Postal Address
                    <input
                      value={guardianAddress}
                      onChange={e => setGuardianAddress(e.target.value)}
                      placeholder="e.g. Tarkwa, Western Region"
                      className="soft-input"
                    />
                  </label>
                </div>

                {/* Section 5: Document Uploads */}
                <div className="space-y-4 border-t border-[#8f0d6b]/15 pt-6">
                  <h3 className="font-serif text-lg font-bold text-[#8f0d6b] flex items-center gap-2">
                    <FileUp className="h-4 w-4 text-[#fe00b6]" />
                    5. Supporting Documents (Optional)
                  </h3>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="upload-box cursor-pointer">
                      <FileUp className="h-5 w-5 text-[#fe00b6]" />
                      <span>
                        <b>{transcript ? transcript.name : "Transcript or Past Certificate"}</b>
                        <small>PDF, JPG, PNG, or WEBP · max 8 MB</small>
                      </span>
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        onChange={e => setTranscript(e.target.files?.[0] ?? null)}
                      />
                    </label>

                    <label className="upload-box cursor-pointer">
                      <FileUp className="h-5 w-5 text-[#fe00b6]" />
                      <span>
                        <b>{governmentId ? governmentId.name : "Ghana Card / Passport / Valid ID"}</b>
                        <small>PDF, JPG, PNG, or WEBP · max 8 MB</small>
                      </span>
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        onChange={e => setGovernmentId(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                </div>

                {/* Section 6: Terms & Conditions Agreement & Signature */}
                <div className="space-y-4 border-t border-[#8f0d6b]/15 pt-6">
                  <h3 className="font-serif text-lg font-bold text-[#8f0d6b] flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#fe00b6]" />
                    6. Declaration & Agreement
                  </h3>

                  <div className="max-h-52 overflow-y-auto rounded-2xl border border-[#8f0d6b]/20 bg-[#faeaf6]/40 p-4 text-xs leading-relaxed text-[#692156] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-[#8f0d6b] uppercase tracking-wider">
                        TERMS &amp; CONDITIONS GOVERNING BLUSH WITH TEE:
                      </p>
                      <Link
                        href="/terms"
                        target="_blank"
                        className="text-[10px] font-bold text-[#fe00b6] hover:underline inline-flex items-center gap-0.5"
                      >
                        Read Full Policy <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    </div>
                    {termsData?.sections?.map((section, idx) => (
                      <p key={idx}>
                        <b>{idx + 1}. {section.title}:</b> {section.body}
                      </p>
                    )) ?? (
                      <>
                        <p><b>1. Discipline &amp; Personal Hygiene:</b> High standards of cleanliness and professional grooming are strictly required.</p>
                        <p><b>2. Student Modeling:</b> Students are required to model for each other during practical sessions.</p>
                        <p><b>3. Prescribed Uniform:</b> School T-shirt and Lacoste (Tue–Thu), Mufti on Friday. Flat shoes/Crocs/sandals only.</p>
                        <p><b>4. Attendance:</b> Punctuality is strictly enforced; reporting time is 8:00 AM.</p>
                        <p><b>5. Protective Gear:</b> Aprons, therapy shoes, and protective clothes are mandatory in practicals.</p>
                        <p><b>6. School Property:</b> Students handle tools and equipment responsibly; damages are payable.</p>
                        <p><b>7. Graduation:</b> Final project works and full fee settlement are mandatory for certificate award.</p>
                      </>
                    )}
                    <p className="font-bold text-[#e01a4f] pt-1">
                      ⚠️ {termsData?.footer || "FEES PAID IS STRICTLY NON REFUNDABLE"}
                    </p>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer pt-2">
                    <input
                      type="checkbox"
                      required
                      checked={agreedToTerms}
                      onChange={e => setAgreedToTerms(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-[#8f0d6b]/30 text-[#fe00b6] focus:ring-[#fe00b6]"
                    />
                    <span className="text-xs text-[#692156] leading-relaxed">
                      I have read, understood, and agreed to all the rules, terms, policies, and regulations governing Blush With Tee Beauty School as stated in the{" "}
                      <Link href="/terms" target="_blank" className="font-bold text-[#8f0d6b] underline hover:text-[#fe00b6]">
                        Terms &amp; Conditions
                      </Link>.
                    </span>
                  </label>

                  <label className="field-label pt-2">
                    Student Signature (Type your Full Legal Name as signature) <span className="text-[#fe00b6]">*</span>
                    <input
                      required
                      value={signatureName}
                      onChange={e => setSignatureName(e.target.value)}
                      placeholder="e.g. Jessica Mensah"
                      className="soft-input font-serif italic text-base"
                    />
                  </label>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-2xl bg-[#fff0f4] p-4 text-xs font-semibold text-[#e01a4f] border border-[#e01a4f]/20">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  disabled={submit.isPending || upload.isPending}
                  type="submit"
                  className="w-full rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] py-6 text-base font-bold text-white shadow-[0_12px_32px_rgba(254,0,182,0.35)] hover:scale-[1.01] transition-transform"
                >
                  {submit.isPending || upload.isPending ? "Submitting Official Application…" : "Submit Official Admission Form"}
                </Button>
              </form>
            )}
          </section>
        </div>
      </main>
    </PublicShell>
  );
}

export default function AdmissionsPage() {
  return (
    <Suspense fallback={<div className="container py-24 text-center">Loading admissions portal…</div>}>
      <ApplyFormContent />
    </Suspense>
  );
}
