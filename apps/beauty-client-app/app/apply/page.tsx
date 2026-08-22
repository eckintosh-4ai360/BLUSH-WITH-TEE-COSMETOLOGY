"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, FileUp, Search, Sparkles } from "lucide-react";
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

const APPLICATION_STEPS = ["submitted", "under_review", "more_information", "approved"] as const;

function ApplicationStatusTracker({ status }: { status: string }) {
  if (status === "rejected") {
    return <p className="mt-2 text-xs font-bold uppercase tracking-[.1em] text-[#e01a4f]">Application not approved</p>;
  }
  const stepIndex = APPLICATION_STEPS.indexOf(status as (typeof APPLICATION_STEPS)[number]);
  return (
    <div className="mt-3 flex items-center gap-1.5">
      {APPLICATION_STEPS.map((step, index) => (
        <span
          key={step}
          className={`h-2 flex-1 rounded-full transition-all ${
            index <= stepIndex ? "bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b]" : "bg-[#faeaf6]"
          }`}
          title={step.replaceAll("_", " ")}
        />
      ))}
    </div>
  );
}

export default function AdmissionsPage() {
  const { data: courses = [] } = trpc.content.courses.useQuery();
  const submit = trpc.admissions.submit.useMutation();
  const upload = trpc.admissions.uploadDocument.useMutation();
  const [lookupInput, setLookupInput] = useState<{ reference: string; email: string } | null>(null);
  const lookup = trpc.admissions.lookup.useQuery(
    lookupInput ?? { reference: "APP-000000", email: "placeholder@example.com" },
    { enabled: Boolean(lookupInput) }
  );
  const [transcript, setTranscript] = useState<File | null>(null);
  const [governmentId, setGovernmentId] = useState<File | null>(null);
  const [success, setSuccess] = useState<{ reference: string; email: string } | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    if (!transcript || !governmentId) {
      setError("Please attach both a transcript and government-issued ID.");
      return;
    }
    try {
      const result = await submit.mutateAsync({
        fullName: String(data.get("fullName")),
        email: String(data.get("email")),
        phone: String(data.get("phone")),
        whatsapp: String(data.get("whatsapp") || "") || undefined,
        birthDate: String(data.get("birthDate") || "") || undefined,
        gender: String(data.get("gender") || "") || undefined,
        address: String(data.get("address") || "") || undefined,
        emergencyContact: String(data.get("emergencyContact") || "") || undefined,
        education: String(data.get("education") || "") || undefined,
        courseId: Number(data.get("courseId")),
        statement: String(data.get("statement") || "") || undefined,
      });
      for (const [documentType, file] of [
        ["transcript", transcript],
        ["government_id", governmentId],
      ] as const) {
        await upload.mutateAsync({
          reference: result.reference,
          email: String(data.get("email")),
          documentType,
          fileName: file.name,
          mimeType: file.type,
          base64Data: await fileToDataUrl(file),
        });
      }
      setSuccess({ reference: result.reference, email: String(data.get("email")) });
      event.currentTarget.reset();
      setTranscript(null);
      setGovernmentId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your application could not be submitted.");
    }
  }

  return (
    <PublicShell>
      <main className="container py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="eyebrow">Admissions Office</p>
            <h1 className="mt-5 font-serif text-5xl font-bold leading-none text-[#8f0d6b] sm:text-6xl">
              Your beauty career begins here.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-[#692156]">
              Apply online in minutes to secure your spot at Blush With Tee School of Cosmetology. Please have your transcript / past certificates and a valid ID ready.
            </p>

            <div className="mt-10 rounded-3xl border border-[#8f0d6b]/15 bg-white/85 p-7 shadow-[0_12px_36px_rgba(143,13,107,.06)]">
              <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#8f0d6b]">
                Already Applied?
              </p>
              <form
                className="mt-4 grid gap-3"
                onSubmit={event => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  setLookupInput({
                    reference: String(form.get("reference")),
                    email: String(form.get("lookupEmail")),
                  });
                }}
              >
                <input name="reference" required placeholder="Application Reference (e.g. APP-0012)" className="soft-input" />
                <input name="lookupEmail" required type="email" placeholder="Applicant Email" className="soft-input" />
                <Button
                  type="submit"
                  variant="outline"
                  className="rounded-full border-[#8f0d6b]/25 bg-white text-[#8f0d6b] hover:bg-[#faeaf6]"
                >
                  <Search className="mr-2 h-4 w-4 text-[#fe00b6]" />
                  Track Application Status
                </Button>
              </form>

              {lookup.data && (
                <div className="mt-5 rounded-2xl bg-[#faeaf6] p-4 text-sm text-[#8f0d6b] border border-[#fe00b6]/30">
                  <b className="text-base">{lookup.data.reference}</b>
                  <br />
                  <span className="font-medium">{lookup.data.courseTitle}</span> · Status:{" "}
                  <span className="font-bold uppercase text-[#fe00b6]">{lookup.data.status.replaceAll("_", " ")}</span>
                  <ApplicationStatusTracker status={lookup.data.status} />
                </div>
              )}
              {lookup.error && <p className="mt-3 text-sm font-semibold text-[#e01a4f]">{lookup.error.message}</p>}
            </div>
          </div>

          <section className="rounded-[2.25rem] border border-[#8f0d6b]/15 bg-white/90 p-7 shadow-[0_18px_48px_rgba(143,13,107,.08)] sm:p-10">
            {success ? (
              <div className="py-12 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#faeaf6] text-[#fe00b6] shadow-md">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <p className="mt-6 font-serif text-4xl font-bold text-[#8f0d6b]">Application Received!</p>
                <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#6a2557]">
                  Congratulations on taking your first step with Blush With Tee. Keep this reference safe:{" "}
                  <b className="text-[#fe00b6] text-base">{success.reference}</b>. A confirmation email has been sent to{" "}
                  <b>{success.email}</b>.
                </p>
                <Button
                  className="mt-8 rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-8 font-bold text-white shadow-lg"
                  onClick={() => setSuccess(null)}
                >
                  Submit Another Application
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="grid gap-5">
                <div>
                  <p className="eyebrow">Student Admissions Form</p>
                  <h2 className="mt-2 font-serif text-3xl font-bold text-[#8f0d6b]">Tell Us About Yourself</h2>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="field-label">
                    Full Name
                    <input required name="fullName" placeholder="e.g. Jessica Mensah" className="soft-input" />
                  </label>
                  <label className="field-label">
                    Email Address
                    <input required type="email" name="email" placeholder="jessica@example.com" className="soft-input" />
                  </label>
                  <label className="field-label">
                    Phone Number
                    <input required name="phone" placeholder="+233..." className="soft-input" />
                  </label>
                  <label className="field-label">
                    WhatsApp Number
                    <input name="whatsapp" placeholder="+233..." className="soft-input" />
                  </label>
                  <label className="field-label">
                    Date of Birth
                    <input type="date" name="birthDate" className="soft-input" />
                  </label>
                  <label className="field-label">
                    Chosen Programme
                    <select required name="courseId" className="soft-input">
                      <option value="">Select a programme</option>
                      {courses.map(course => (
                        <option key={course.id} value={course.id}>
                          {course.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="field-label">
                  Residential Address
                  <textarea name="address" placeholder="Your residential town, city, or digital address" className="soft-input min-h-20" />
                </label>
                <label className="field-label">
                  Previous Education / Background
                  <textarea name="education" placeholder="High school, college, or previous beauty training" className="soft-input min-h-20" />
                </label>
                <label className="field-label">
                  Personal Statement (Why BWT?)
                  <textarea name="statement" placeholder="Share your passion for beauty and your future goals" className="soft-input min-h-24" />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="upload-box">
                    <FileUp className="h-5 w-5 text-[#fe00b6]" />
                    <span>
                      <b>Transcript or Certificate</b>
                      <small>PDF, JPG, PNG, or WEBP · max 8 MB</small>
                    </span>
                    <input
                      required
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={e => setTranscript(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label className="upload-box">
                    <FileUp className="h-5 w-5 text-[#fe00b6]" />
                    <span>
                      <b>Government ID (Ghana Card / Passport)</b>
                      <small>PDF, JPG, PNG, or WEBP · max 8 MB</small>
                    </span>
                    <input
                      required
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={e => setGovernmentId(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>

                {error && <p className="rounded-xl bg-[#fff0f4] p-3.5 text-sm font-semibold text-[#e01a4f]">{error}</p>}

                <Button
                  disabled={submit.isPending || upload.isPending}
                  type="submit"
                  className="mt-3 rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] py-6 text-sm font-bold text-white shadow-[0_10px_28px_rgba(254,0,182,0.35)] hover:scale-[1.01] transition-transform"
                >
                  {submit.isPending || upload.isPending ? "Submitting Application…" : "Submit Official Application"}
                </Button>
              </form>
            )}
          </section>
        </div>
      </main>
    </PublicShell>
  );
}

