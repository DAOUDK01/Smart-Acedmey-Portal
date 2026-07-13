"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarDays,
  FileUp,
  GraduationCap,
  IdCard,
  Link2,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { API_BASE_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

type StaffInvitation = {
  email: string;
  name: string;
  role: "TEACHER";
  status: "INVITED" | "SUBMITTED" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED";
  adminNotes: string | null;
};

type DocumentField =
  | "profilePhoto"
  | "cnicFront"
  | "cnicBack"
  | "cv"
  | "educationalDocuments"
  | "experienceLetters"
  | "certificates"
  | "otherDocuments";

const statusCopy: Record<StaffInvitation["status"], string> = {
  INVITED: "Invitation active",
  SUBMITTED: "Submitted for review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REVISION_REQUESTED: "Revision requested",
};

const initialFiles: Record<DocumentField, File[]> = {
  profilePhoto: [],
  cnicFront: [],
  cnicBack: [],
  cv: [],
  educationalDocuments: [],
  experienceLetters: [],
  certificates: [],
  otherDocuments: [],
};

function FieldLabel({ children }: { children: string }) {
  return <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{children}</span>;
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent-cyan/20 bg-accent-cyan/10">
        <Icon className="h-5 w-5 text-accent-cyan" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export default function StaffRegistrationPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [invitation, setInvitation] = useState<StaffInvitation | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [statusVariant, setStatusVariant] = useState<"info" | "success" | "error" | "warning">("info");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [files, setFiles] = useState<Record<DocumentField, File[]>>(initialFiles);
  const [form, setForm] = useState({
    phoneNumber: "",
    alternatePhone: "",
    password: "",
    confirmPassword: "",
    fatherName: "",
    dateOfBirth: "",
    gender: "",
    cnicNumber: "",
    nationality: "",
    maritalStatus: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    highestQualification: "",
    degreeTitle: "",
    institution: "",
    graduationYear: "",
    specialization: "",
    subjects: "",
    totalExperience: "",
    lastInstitute: "",
    currentEmploymentStatus: "",
    expectedSalary: "",
    availability: "",
    teachingMode: "",
    bankName: "",
    accountTitle: "",
    iban: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelation: "",
    professionalSummary: "",
    documentLinks: "",
  });

  const canSubmit = useMemo(() => {
    return invitation && invitation.status !== "APPROVED" && invitation.status !== "REJECTED";
  }, [invitation]);

  useEffect(() => {
    async function loadInvitation() {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/users/staff-invitations/token/${encodeURIComponent(token)}`);
        if (!response.ok) throw new Error("Invalid invitation");
        setInvitation(await response.json());
      } catch (error) {
        setStatus("This registration link is invalid, expired, or has already been replaced.");
        setStatusVariant("error");
      } finally {
        setIsLoading(false);
      }
    }

    if (token) loadInvitation();
  }, [token]);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateFiles(field: DocumentField, event: ChangeEvent<HTMLInputElement>) {
    setFiles((current) => ({
      ...current,
      [field]: Array.from(event.target.files || []),
    }));
  }

  async function uploadDocuments() {
    const formData = new FormData();
    Object.entries(files).forEach(([field, fieldFiles]) => {
      fieldFiles.forEach((file) => formData.append(field, file));
    });

    if (Array.from(formData.keys()).length === 0) return [];

    const response = await fetch(`${API_BASE_URL}/api/admin/users/staff-invitations/documents`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error(await response.text());
    const data = (await response.json()) as { files: { field: string; originalName: string; url: string }[] };
    return data.files.map((file) => `${file.field}: ${file.url}`);
  }

  async function submitRegistration(event: FormEvent) {
    event.preventDefault();
    setStatus(null);

    if (form.password !== form.confirmPassword) {
      setStatus("Password and confirmation password do not match.");
      setStatusVariant("warning");
      return;
    }

    const missingRequiredDocuments = [
      ["profilePhoto", "Profile photo"],
      ["cv", "CV / resume"],
      ["cnicFront", "CNIC front side"],
      ["cnicBack", "CNIC back side"],
      ["educationalDocuments", "Educational documents"],
    ].filter(([field]) => files[field as DocumentField].length === 0);

    if (missingRequiredDocuments.length > 0) {
      setStatus(`Please upload: ${missingRequiredDocuments.map(([, label]) => label).join(", ")}.`);
      setStatusVariant("warning");
      return;
    }

    setIsSubmitting(true);

    try {
      const uploadedDocumentLinks = await uploadDocuments();
      const manualDocumentLinks = form.documentLinks
        .split("\n")
        .map((link) => link.trim())
        .filter(Boolean);

      const personalDetails = [
        `Father name: ${form.fatherName}`,
        `Date of birth: ${form.dateOfBirth}`,
        `Gender: ${form.gender}`,
        `CNIC: ${form.cnicNumber}`,
        `Nationality: ${form.nationality}`,
        `Marital status: ${form.maritalStatus}`,
        `Address: ${form.address}, ${form.city}, ${form.province}, ${form.postalCode}`,
        `Alternate phone: ${form.alternatePhone}`,
        `Emergency contact: ${form.emergencyContactName} (${form.emergencyContactRelation}) - ${form.emergencyContactPhone}`,
        `Bank: ${form.bankName}, Account title: ${form.accountTitle}, IBAN: ${form.iban}`,
      ].join("\n");

      const educationDetails = [
        `Highest qualification: ${form.highestQualification}`,
        `Degree title: ${form.degreeTitle}`,
        `Institution: ${form.institution}`,
        `Graduation year: ${form.graduationYear}`,
        `Specialization: ${form.specialization}`,
        `Subjects: ${form.subjects}`,
        `Total experience: ${form.totalExperience}`,
        `Last institute: ${form.lastInstitute}`,
        `Employment status: ${form.currentEmploymentStatus}`,
        `Expected salary: ${form.expectedSalary}`,
        `Availability: ${form.availability}`,
        `Teaching mode: ${form.teachingMode}`,
        `Professional summary: ${form.professionalSummary}`,
      ].join("\n");

      const response = await fetch(`${API_BASE_URL}/api/admin/users/staff-invitations/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: form.password,
          phoneNumber: form.phoneNumber,
          personalDetails,
          educationDetails,
          documentLinks: [...uploadedDocumentLinks, ...manualDocumentLinks],
        }),
      });

      if (!response.ok) throw new Error(await response.text());
      setStatus("Your registration has been submitted for admin review. You will be notified after review.");
      setStatusVariant("success");
      setInvitation((current) => (current ? { ...current, status: "SUBMITTED" } : current));
    } catch (error) {
      setStatus("Could not submit registration. Please check your details, documents, and try again.");
      setStatusVariant("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  function DocumentInput({
    field,
    label,
    multiple,
    required,
  }: {
    field: DocumentField;
    label: string;
    multiple?: boolean;
    required?: boolean;
  }) {
    return (
      <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-accent-cyan/30">
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <FileUp className="h-4 w-4 text-accent-cyan" />
          {label}
        </span>
        <input
          type="file"
          multiple={multiple}
          className="mt-3 block w-full text-sm text-slate-400 file:mr-4 file:rounded-xl file:border-0 file:bg-accent-purple file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-accent-purple/90"
          onChange={(event) => updateFiles(field, event)}
        />
        {files[field].length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {files[field].map((file) => file.name).join(", ")}
          </p>
        )}
      </label>
    );
  }

  return (
    <main className="min-h-screen bg-ink-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-3 text-lg font-bold text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent-cyan/40 bg-accent-cyan/10">
              <GraduationCap className="h-5 w-5 text-accent-cyan" />
            </span>
            SmartAcademy
          </Link>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
            Staff onboarding portal
          </div>
        </header>

        <section className="grid gap-8 py-10 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-accent-purple">Staff Registration</p>
              <h1 className="mt-4 text-4xl font-bold leading-tight text-white">Complete your profile</h1>
              <p className="mt-4 text-sm leading-6 text-slate-400">
                Provide complete identity, contact, education, experience, and verification documents before admin review.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Invitation</p>
              {isLoading ? (
                <div className="mt-4 space-y-3">
                  <div className="h-4 w-2/3 rounded bg-white/10" />
                  <div className="h-4 w-1/2 rounded bg-white/10" />
                </div>
              ) : invitation ? (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <UserRound className="h-5 w-5 text-accent-cyan" />
                    <div>
                      <p className="text-sm font-semibold text-white">{invitation.name}</p>
                      <p className="text-xs text-slate-500">{invitation.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-accent-cyan" />
                    <p className="break-all text-sm text-slate-300">{invitation.email}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-widest text-accent-purple">
                    {statusCopy[invitation.status]}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">Invitation unavailable.</p>
              )}
            </div>

            {invitation?.adminNotes && <Alert variant="warning">Admin notes: {invitation.adminNotes}</Alert>}
          </aside>

          <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-accent-cyan/[0.04] p-6 shadow-2xl">
            {status && (
              <Alert variant={statusVariant} className="mb-6">
                {status}
              </Alert>
            )}

            {!isLoading && canSubmit && (
              <form onSubmit={submitRegistration} className="space-y-10">
                <section className="space-y-5">
                  <SectionTitle icon={LockKeyhole} title="Account Access" description="Set login credentials and primary contact information." />
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="space-y-2">
                      <FieldLabel>Phone</FieldLabel>
                      <Input required placeholder="+92..." value={form.phoneNumber} onChange={(e) => updateField("phoneNumber", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Alternate Phone</FieldLabel>
                      <Input placeholder="+92..." value={form.alternatePhone} onChange={(e) => updateField("alternatePhone", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Password</FieldLabel>
                      <Input required minLength={6} type="password" placeholder="Minimum 6 characters" value={form.password} onChange={(e) => updateField("password", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Confirm Password</FieldLabel>
                      <Input required minLength={6} type="password" placeholder="Repeat password" value={form.confirmPassword} onChange={(e) => updateField("confirmPassword", e.target.value)} />
                    </label>
                  </div>
                </section>

                <section className="space-y-5">
                  <SectionTitle icon={IdCard} title="Personal Details" description="Identity details used for academy verification." />
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="space-y-2">
                      <FieldLabel>Father Name</FieldLabel>
                      <Input required value={form.fatherName} onChange={(e) => updateField("fatherName", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Date Of Birth</FieldLabel>
                      <Input required type="date" value={form.dateOfBirth} onChange={(e) => updateField("dateOfBirth", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Gender</FieldLabel>
                      <Select required value={form.gender} onChange={(e) => updateField("gender", e.target.value)}>
                        <option value="">Select gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </Select>
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>CNIC Number</FieldLabel>
                      <Input required placeholder="00000-0000000-0" value={form.cnicNumber} onChange={(e) => updateField("cnicNumber", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Nationality</FieldLabel>
                      <Input required value={form.nationality} onChange={(e) => updateField("nationality", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Marital Status</FieldLabel>
                      <Select value={form.maritalStatus} onChange={(e) => updateField("maritalStatus", e.target.value)}>
                        <option value="">Select status</option>
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                      </Select>
                    </label>
                  </div>
                </section>

                <section className="space-y-5">
                  <SectionTitle icon={MapPin} title="Address" description="Current residential address and city information." />
                  <div className="grid gap-4 md:grid-cols-4">
                    <label className="space-y-2 md:col-span-4">
                      <FieldLabel>Complete Address</FieldLabel>
                      <Input required value={form.address} onChange={(e) => updateField("address", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>City</FieldLabel>
                      <Input required value={form.city} onChange={(e) => updateField("city", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Province</FieldLabel>
                      <Input required value={form.province} onChange={(e) => updateField("province", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Postal Code</FieldLabel>
                      <Input value={form.postalCode} onChange={(e) => updateField("postalCode", e.target.value)} />
                    </label>
                  </div>
                </section>

                <section className="space-y-5">
                  <SectionTitle icon={GraduationCap} title="Educational Details" description="Qualification, specialization, and academic background." />
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="space-y-2">
                      <FieldLabel>Highest Qualification</FieldLabel>
                      <Input required placeholder="MS, BS, MPhil..." value={form.highestQualification} onChange={(e) => updateField("highestQualification", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Degree Title</FieldLabel>
                      <Input required value={form.degreeTitle} onChange={(e) => updateField("degreeTitle", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Institution</FieldLabel>
                      <Input required value={form.institution} onChange={(e) => updateField("institution", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Graduation Year</FieldLabel>
                      <Input required value={form.graduationYear} onChange={(e) => updateField("graduationYear", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Specialization</FieldLabel>
                      <Input required value={form.specialization} onChange={(e) => updateField("specialization", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Subjects To Teach</FieldLabel>
                      <Input required placeholder="Math, Physics..." value={form.subjects} onChange={(e) => updateField("subjects", e.target.value)} />
                    </label>
                  </div>
                </section>

                <section className="space-y-5">
                  <SectionTitle icon={BriefcaseBusiness} title="Professional Details" description="Experience, availability, and teaching preferences." />
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="space-y-2">
                      <FieldLabel>Total Experience</FieldLabel>
                      <Input required placeholder="5 years" value={form.totalExperience} onChange={(e) => updateField("totalExperience", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Last Institute</FieldLabel>
                      <Input value={form.lastInstitute} onChange={(e) => updateField("lastInstitute", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Employment Status</FieldLabel>
                      <Select required value={form.currentEmploymentStatus} onChange={(e) => updateField("currentEmploymentStatus", e.target.value)}>
                        <option value="">Select status</option>
                        <option value="Currently employed">Currently employed</option>
                        <option value="Not employed">Not employed</option>
                        <option value="Freelance teacher">Freelance teacher</option>
                      </Select>
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Expected Salary</FieldLabel>
                      <Input value={form.expectedSalary} onChange={(e) => updateField("expectedSalary", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Teaching Mode</FieldLabel>
                      <Select required value={form.teachingMode} onChange={(e) => updateField("teachingMode", e.target.value)}>
                        <option value="">Select mode</option>
                        <option value="Online">Online</option>
                        <option value="On-campus">On-campus</option>
                        <option value="Hybrid">Hybrid</option>
                      </Select>
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Availability</FieldLabel>
                      <Input required placeholder="Weekdays, evenings..." value={form.availability} onChange={(e) => updateField("availability", e.target.value)} />
                    </label>
                    <label className="space-y-2 md:col-span-3">
                      <FieldLabel>Professional Summary</FieldLabel>
                      <Textarea required className="min-h-28" value={form.professionalSummary} onChange={(e) => updateField("professionalSummary", e.target.value)} />
                    </label>
                  </div>
                </section>

                <section className="space-y-5">
                  <SectionTitle icon={Phone} title="Emergency & Payment Details" description="Backup contact and optional payment account information." />
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="space-y-2">
                      <FieldLabel>Emergency Contact Name</FieldLabel>
                      <Input required value={form.emergencyContactName} onChange={(e) => updateField("emergencyContactName", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Emergency Contact Phone</FieldLabel>
                      <Input required value={form.emergencyContactPhone} onChange={(e) => updateField("emergencyContactPhone", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Relation</FieldLabel>
                      <Input required value={form.emergencyContactRelation} onChange={(e) => updateField("emergencyContactRelation", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Bank Name</FieldLabel>
                      <Input value={form.bankName} onChange={(e) => updateField("bankName", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>Account Title</FieldLabel>
                      <Input value={form.accountTitle} onChange={(e) => updateField("accountTitle", e.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <FieldLabel>IBAN / Account Number</FieldLabel>
                      <Input value={form.iban} onChange={(e) => updateField("iban", e.target.value)} />
                    </label>
                  </div>
                </section>

                <section className="space-y-5">
                  <SectionTitle icon={ShieldCheck} title="Documents" description="Upload required verification and qualification documents." />
                  <div className="grid gap-4 md:grid-cols-2">
                    <DocumentInput field="profilePhoto" label="Profile Photo" required />
                    <DocumentInput field="cv" label="CV / Resume" required />
                    <DocumentInput field="cnicFront" label="CNIC Front Side" required />
                    <DocumentInput field="cnicBack" label="CNIC Back Side" required />
                    <DocumentInput field="educationalDocuments" label="Educational Documents" multiple required />
                    <DocumentInput field="experienceLetters" label="Experience Letters" multiple />
                    <DocumentInput field="certificates" label="Certificates" multiple />
                    <DocumentInput field="otherDocuments" label="Other Documents" multiple />
                  </div>
                  <label className="block space-y-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Link2 className="h-4 w-4 text-accent-cyan" />
                      Additional Document Links
                    </span>
                    <Textarea
                      className="min-h-24"
                      placeholder="Paste optional Google Drive / OneDrive links, one per line"
                      value={form.documentLinks}
                      onChange={(e) => updateField("documentLinks", e.target.value)}
                    />
                  </label>
                </section>

                <div className="flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-500">Admin will review your details and documents before portal access is enabled.</p>
                  <Button type="submit" variant="primary" disabled={isSubmitting} className={cn("gap-2", isSubmitting && "opacity-80")}>
                    <Send className="h-4 w-4" />
                    {isSubmitting ? "Uploading & Submitting..." : "Submit For Review"}
                  </Button>
                </div>
              </form>
            )}

            {!isLoading && invitation?.status === "APPROVED" && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6">
                <h2 className="text-xl font-bold text-emerald-100">Your application is approved</h2>
                <p className="mt-2 text-sm text-emerald-100/80">You can sign in with your email and password now.</p>
                <Link href="/login" className="mt-4 inline-flex rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white">
                  Go to Login
                </Link>
              </div>
            )}

            {!isLoading && invitation?.status === "REJECTED" && (
              <Alert variant="error">This application was rejected. Please contact SmartAcademy administration for more information.</Alert>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
