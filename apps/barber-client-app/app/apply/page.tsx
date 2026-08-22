"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, FileUp, Search } from "lucide-react";
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

export default function AdmissionsPage() {
  const { data: courses = [] } = trpc.content.courses.useQuery();
  const submit = trpc.admissions.submit.useMutation();
  const upload = trpc.admissions.uploadDocument.useMutation();
  const [lookupInput, setLookupInput] = useState<{ reference: string; email: string } | null>(null);
  const lookup = trpc.admissions.lookup.useQuery(lookupInput ?? { reference: "APP-000000", email: "placeholder@example.com" }, { enabled: Boolean(lookupInput) });
  const [transcript, setTranscript] = useState<File | null>(null);
  const [governmentId, setGovernmentId] = useState<File | null>(null);
  const [success, setSuccess] = useState<{ reference: string; email: string } | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    if (!transcript || !governmentId) { setError("Please attach both a transcript and government-issued ID."); return; }
    try {
      const result = await submit.mutateAsync({
        fullName: String(data.get("fullName")), email: String(data.get("email")), phone: String(data.get("phone")), whatsapp: String(data.get("whatsapp") || "") || undefined,
        birthDate: String(data.get("birthDate") || "") || undefined, gender: String(data.get("gender") || "") || undefined, address: String(data.get("address") || "") || undefined,
        emergencyContact: String(data.get("emergencyContact") || "") || undefined, education: String(data.get("education") || "") || undefined,
        courseId: Number(data.get("courseId")), statement: String(data.get("statement") || "") || undefined,
      });
      for (const [documentType, file] of [["transcript", transcript], ["government_id", governmentId]] as const) {
        await upload.mutateAsync({ reference: result.reference, email: String(data.get("email")), documentType, fileName: file.name, mimeType: file.type, base64Data: await fileToDataUrl(file) });
      }
      setSuccess({ reference: result.reference, email: String(data.get("email")) });
      event.currentTarget.reset(); setTranscript(null); setGovernmentId(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your application could not be submitted."); }
  }

  return <PublicShell><main className="container py-16 sm:py-24"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]"><div><p className="eyebrow">Admissions</p><h1 className="mt-5 font-serif text-5xl leading-none text-[#474057] sm:text-6xl">Your next chapter starts here.</h1><p className="mt-6 max-w-md text-lg leading-8 text-[#716a7d]">Your application, supporting documents, and admissions updates all live in one protected record. Please prepare a transcript and government-issued ID before you begin.</p><div className="mt-10 rounded-3xl border border-white bg-white/65 p-6"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#887c91]">Already applied?</p><form className="mt-4 grid gap-3" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); setLookupInput({ reference: String(form.get("reference")), email: String(form.get("lookupEmail")) }); }}><input name="reference" required placeholder="Application reference" className="soft-input" /><input name="lookupEmail" required type="email" placeholder="Application email" className="soft-input" /><Button type="submit" variant="outline" className="rounded-full border-[#645574]/20 bg-white text-[#5d5068] hover:bg-[#f9f5fa]"><Search className="mr-2 h-4 w-4" />Track application</Button></form>{lookup.data && <div className="mt-4 rounded-2xl bg-[#eef5f0] p-4 text-sm text-[#4c6759]"><b>{lookup.data.reference}</b><br />{lookup.data.courseTitle} · Status: {lookup.data.status.replaceAll("_", " ")}</div>}{lookup.error && <p className="mt-3 text-sm text-[#a14d65]">{lookup.error.message}</p>}</div></div>
        <section className="rounded-[2rem] border border-white bg-white/70 p-6 shadow-[0_18px_48px_rgba(86,70,102,.08)] sm:p-9">{success ? <div className="py-12 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-[#5b8c6d]" /><p className="mt-6 font-serif text-4xl text-[#50455b]">Application received.</p><p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#746d7d]">Keep this reference safe: <b>{success.reference}</b>. Use it with <b>{success.email}</b> to follow your application status.</p><Button className="mt-8 rounded-full bg-[#5f5277] text-white" onClick={() => setSuccess(null)}>Submit another application</Button></div> : <form onSubmit={handleSubmit} className="grid gap-5"><div><p className="eyebrow">Application form</p><h2 className="mt-3 font-serif text-3xl text-[#51465c]">Tell us about you.</h2></div><div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Full name<input required name="fullName" className="soft-input" /></label><label className="field-label">Email<input required type="email" name="email" className="soft-input" /></label><label className="field-label">Phone<input required name="phone" className="soft-input" /></label><label className="field-label">WhatsApp<input name="whatsapp" className="soft-input" /></label><label className="field-label">Date of birth<input type="date" name="birthDate" className="soft-input" /></label><label className="field-label">Programme<select required name="courseId" className="soft-input"><option value="">Select a programme</option>{courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label></div><label className="field-label">Residential address<textarea name="address" className="soft-input min-h-20" /></label><label className="field-label">Previous education<textarea name="education" className="soft-input min-h-20" /></label><label className="field-label">Why this pathway?<textarea name="statement" className="soft-input min-h-24" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="upload-box"> <FileUp className="h-5 w-5" /><span><b>Transcript</b><small>PDF, JPG, PNG, or WEBP · max 8 MB</small></span><input required type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setTranscript(e.target.files?.[0] ?? null)} /></label><label className="upload-box"><FileUp className="h-5 w-5" /><span><b>Government-issued ID</b><small>PDF, JPG, PNG, or WEBP · max 8 MB</small></span><input required type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setGovernmentId(e.target.files?.[0] ?? null)} /></label></div>{error && <p className="rounded-xl bg-[#fff0f4] p-3 text-sm text-[#a14d65]">{error}</p>}<Button disabled={submit.isPending || upload.isPending} type="submit" className="mt-2 rounded-full bg-[#5f5277] text-white hover:bg-[#4d4264]">{submit.isPending || upload.isPending ? "Submitting securely…" : "Submit application"}</Button></form>}</section></div></main></PublicShell>;
}
