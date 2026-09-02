"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
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
import { SaveCourseDialog } from "@/components/academics/SaveCourseDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { ageFromBirthDate } from "@/lib/ageFromBirthDate";
import { describeDuration } from "@/lib/describeDuration";
import { trpc } from "@/lib/trpc";

/**
 * Takes down an official admission form at the desk.
 *
 * Faithfully captures all fields from the official physical admission form,
 * ensuring complete alignment between walk-in/desk applications and online submissions.
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
  const { can } = usePermissions();
  const [courseDialogOpen, setCourseDialogOpen] = useState(false);

  // Form Fields matching Image 1 Official Form
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
  const [courseId, setCourseId] = useState("");
  const [paymentPlan, setPaymentPlan] = useState("Full Payment");
  const [duration, setDuration] = useState("");
  const [startDate, setStartDate] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianAddress, setGuardianAddress] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [education, setEducation] = useState("");
  const [statement, setStatement] = useState("");
  const [error, setError] = useState<string | null>(null);

  /**
   * The age field follows the date of birth rather than being typed twice.
   *
   * The paper form asks for both, and a desk copying it out has no reason to
   * work the subtraction out by hand - nor to be trusted with it, since an age
   * that disagrees with the date above it is the kind of thing nobody notices
   * until the certificate is printed. While a date is present the field is
   * derived and locked; clearing the date hands it back, because an applicant
   * who knows they are 24 but not the day they were born still has to be
   * written down.
   */
  const derivedAge = useMemo(() => ageFromBirthDate(birthDate), [birthDate]);
  const ageIsDerived = derivedAge !== null;

  function handleBirthDateChange(value: string) {
    setBirthDate(value);
    const nextAge = ageFromBirthDate(value);
    if (nextAge !== null) setAge(String(nextAge));
    else if (ageIsDerived) setAge("");
  }

  useEffect(() => {
    setFullName("");
    setEmail("");
    setPhone("");
    setWhatsapp("");
    setBirthDate("");
    setHometown("");
    setAge("");
    setGender("Female");
    setMaritalStatus("single");
    setAddress("");
    setEmergencyContact("");
    setEmergencyRelationship("");
    setInstagram("");
    setTiktok("");
    setOtherSocialMedia("");
    setEducationalLevel("SHS");
    setCourseId("");
    setPaymentPlan("Full Payment");
    setDuration("");
    setStartDate("");
    setGuardianName("");
    setGuardianAddress("");
    setGuardianPhone("");
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

  const selectedCourse = useMemo(() => {
    if (!courseId || !courses.data) return null;
    return courses.data.find(c => String(c.id) === courseId);
  }, [courseId, courses.data]);

  const validation = useMemo(() => {
    if (fullName.trim().length < 2) return "Enter the applicant's full name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return "Enter a valid email address.";
    }
    if (phone.trim().length < 7) return "Enter a valid phone number.";
    if (!courseId) return "Choose the programme they are applying for.";
    return null;
  }, [fullName, email, phone, courseId]);

  async function handleRecord() {
    setError(null);
    if (validation) {
      setError(validation);
      return;
    }

    await create.mutateAsync({
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
      education: education.trim() || undefined,
      courseId: Number(courseId),
      paymentPlan: paymentPlan || undefined,
      duration:
        duration.trim() ||
        (selectedCourse ? describeDuration(selectedCourse.durationWeeks) : undefined),
      startDate: startDate ? new Date(startDate) : undefined,
      guardianName: guardianName.trim() || undefined,
      guardianAddress: guardianAddress.trim() || undefined,
      guardianPhone: guardianPhone.trim() || undefined,
      signatureData: fullName.trim(),
      agreedToTerms: true,
      statement: statement.trim() || undefined,
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div>
                <DialogTitle>Record Official Admission Form</DialogTitle>
                <DialogDescription>
                  Blush With Tee Beauty School · Tarkwa Branch (Allied Filling Station, A&apos;koon)
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {noCourses ? (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                There are no active programmes yet. Please add a programme first.
              </p>
            ) : null}

            {/* Section 1: Personal Information */}
            <div className="rounded-xl border border-border/70 bg-card p-4 space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-primary">
                1. Personal Information
              </h3>

              <div className="space-y-2">
                <Label htmlFor="app-name">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="app-name"
                  value={fullName}
                  onChange={event => setFullName(event.target.value)}
                  placeholder="e.g. Jessica Mensah"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="app-email">
                    Email Address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="app-email"
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="jessica@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="app-phone">
                    Primary Phone Contact <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="app-phone"
                    value={phone}
                    onChange={event => setPhone(event.target.value)}
                    placeholder="059 770 6250"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="app-whatsapp">WhatsApp Number</Label>
                  <Input
                    id="app-whatsapp"
                    value={whatsapp}
                    onChange={event => setWhatsapp(event.target.value)}
                    placeholder="054 556 3536"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="app-dob">Date of Birth</Label>
                  <Input
                    id="app-dob"
                    type="date"
                    value={birthDate}
                    onChange={event => handleBirthDateChange(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="app-age">Age</Label>
                  <Input
                    id="app-age"
                    type="number"
                    min="10"
                    max="100"
                    value={age}
                    onChange={event => setAge(event.target.value)}
                    placeholder="e.g. 21"
                    readOnly={ageIsDerived}
                    aria-describedby={ageIsDerived ? "app-age-hint" : undefined}
                    className={ageIsDerived ? "bg-muted text-muted-foreground" : undefined}
                  />
                  {ageIsDerived ? (
                    <p id="app-age-hint" className="text-xs text-muted-foreground">
                      Worked out from the date of birth.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="app-hometown">Hometown</Label>
                  <Input
                    id="app-hometown"
                    value={hometown}
                    onChange={event => setHometown(event.target.value)}
                    placeholder="e.g. Tarkwa / Kumasi"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="app-gender">Gender</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger id="app-gender">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="app-marital">Marital Status</Label>
                  <Select value={maritalStatus} onValueChange={setMaritalStatus}>
                    <SelectTrigger id="app-marital">
                      <SelectValue placeholder="Marital status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="married">Married</SelectItem>
                      <SelectItem value="divorced">Divorced</SelectItem>
                      <SelectItem value="widowed">Widowed</SelectItem>
                      <SelectItem value="separated">Separated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="app-address">Residential / Postal Address</Label>
                <Textarea
                  id="app-address"
                  rows={2}
                  value={address}
                  onChange={event => setAddress(event.target.value)}
                  placeholder="Residential address / digital address..."
                />
              </div>
            </div>

            {/* Section 2: Emergency Contact & Social Media */}
            <div className="rounded-xl border border-border/70 bg-card p-4 space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-primary">
                2. Emergency Contact & Social Handles
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="app-emergency">Emergency Contact (Name & Phone)</Label>
                  <Input
                    id="app-emergency"
                    value={emergencyContact}
                    onChange={event => setEmergencyContact(event.target.value)}
                    placeholder="e.g. Mary Mensah (024 123 4567)"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="app-emergency-rel">Relationship to Contact</Label>
                  <Input
                    id="app-emergency-rel"
                    value={emergencyRelationship}
                    onChange={event => setEmergencyRelationship(event.target.value)}
                    placeholder="e.g. Mother, Spouse, Sibling"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="app-insta">Instagram Handle</Label>
                  <Input
                    id="app-insta"
                    value={instagram}
                    onChange={event => setInstagram(event.target.value)}
                    placeholder="@jessica_glam"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="app-tiktok">TikTok Handle</Label>
                  <Input
                    id="app-tiktok"
                    value={tiktok}
                    onChange={event => setTiktok(event.target.value)}
                    placeholder="@jessica_beauty"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="app-other-social">Other Social Media</Label>
                  <Input
                    id="app-other-social"
                    value={otherSocialMedia}
                    onChange={event => setOtherSocialMedia(event.target.value)}
                    placeholder="Facebook / Twitter / LinkedIn"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Programme Selection & Payment Plan */}
            <div className="rounded-xl border border-border/70 bg-card p-4 space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-primary">
                3. Programme Selection & Payment Plan
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="app-edu-level">Educational Level</Label>
                  <Select value={educationalLevel} onValueChange={setEducationalLevel}>
                    <SelectTrigger id="app-edu-level">
                      <SelectValue placeholder="Educational level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="JHS">Junior High School (JHS)</SelectItem>
                      <SelectItem value="SHS">Senior High School (SHS)</SelectItem>
                      <SelectItem value="Tertiary">Tertiary / University</SelectItem>
                      <SelectItem value="Vocational">Vocational / Technical</SelectItem>
                      <SelectItem value="Other">Other / Self-Taught</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="app-course">
                      Programme <span className="text-destructive">*</span>
                    </Label>
                    {can("academics.write") ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-primary hover:text-primary"
                        onClick={() => setCourseDialogOpen(true)}
                      >
                        <Plus className="mr-1 h-3 w-3" /> Add new programme
                      </Button>
                    ) : null}
                  </div>
                  <Select value={courseId} onValueChange={setCourseId} disabled={noCourses}>
                    <SelectTrigger id="app-course">
                      <SelectValue placeholder="Choose a programme" />
                    </SelectTrigger>
                    <SelectContent>
                      {courses.data?.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.title} ({c.code}) · GHS {Number(c.tuition).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedCourse ? (
                <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-primary/15 pb-2">
                    <span className="font-semibold">Fees for this programme</span>
                    <span className="font-serif text-base font-bold text-primary">
                      GHS {Number(selectedCourse.tuition).toLocaleString()}
                    </span>
                  </div>
                  {selectedCourse.productFee ? (
                    <p>
                      <b>Tools &amp; product kit:</b> GHS{" "}
                      {Number(selectedCourse.productFee).toLocaleString()}
                    </p>
                  ) : null}
                  <p><b>Duration:</b> {describeDuration(selectedCourse.durationWeeks)}</p>
                  <p><b>Schedule:</b> {selectedCourse.schedule || "Monday - Saturday (8am - 5pm)"}</p>
                  {selectedCourse.outline.length ? (
                    <p><b>Covers:</b> {selectedCourse.outline.join(", ")}</p>
                  ) : null}
                  {selectedCourse.toiletries ? (
                    <p><b>Toiletries:</b> {selectedCourse.toiletries}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="app-plan">Payment Plan</Label>
                  <Select value={paymentPlan} onValueChange={setPaymentPlan}>
                    <SelectTrigger id="app-plan">
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Full Payment">Full Payment (Upfront)</SelectItem>
                      <SelectItem value="2 Installments">2 Installments</SelectItem>
                      <SelectItem value="3 Installments">3 Installments</SelectItem>
                      <SelectItem value="Weekly/Monthly">Weekly / Monthly Plan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="app-duration">Duration</Label>
                  <Input
                    id="app-duration"
                    value={duration}
                    onChange={event => setDuration(event.target.value)}
                    placeholder={
                      selectedCourse
                        ? describeDuration(selectedCourse.durationWeeks)
                        : "e.g. 3 months / 6 months"
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="app-start-date">Desired Start Date</Label>
                  <Input
                    id="app-start-date"
                    type="date"
                    value={startDate}
                    onChange={event => setStartDate(event.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Section 4: References / Parent / Guardian */}
            <div className="rounded-xl border border-border/70 bg-card p-4 space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-primary">
                4. References / Parent / Guardian
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="app-guardian-name">Guardian / Reference Name</Label>
                  <Input
                    id="app-guardian-name"
                    value={guardianName}
                    onChange={event => setGuardianName(event.target.value)}
                    placeholder="e.g. Mr. Samuel Mensah"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="app-guardian-phone">Guardian Phone Number</Label>
                  <Input
                    id="app-guardian-phone"
                    value={guardianPhone}
                    onChange={event => setGuardianPhone(event.target.value)}
                    placeholder="024 456 7890"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="app-guardian-address">Guardian Residential / Postal Address</Label>
                <Input
                  id="app-guardian-address"
                  value={guardianAddress}
                  onChange={event => setGuardianAddress(event.target.value)}
                  placeholder="Guardian residential town / location..."
                />
              </div>
            </div>

            {/* Section 5: Notes & Additional Background */}
            <div className="space-y-2">
              <Label htmlFor="app-statement">Applicant Notes / Background</Label>
              <Textarea
                id="app-statement"
                rows={2}
                value={statement}
                onChange={event => setStatement(event.target.value)}
                placeholder="Any special notes or prior training experience..."
              />
            </div>

            {error ? (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleRecord}
              disabled={Boolean(validation) || create.isPending}
              className="gap-2"
            >
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Record Admission Form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {can("academics.write") ? (
        <SaveCourseDialog
          open={courseDialogOpen}
          onOpenChange={setCourseDialogOpen}
          onSaved={newCourse => {
            courses.refetch();
            setCourseId(String(newCourse.id));
          }}
        />
      ) : null}
    </>
  );
}
