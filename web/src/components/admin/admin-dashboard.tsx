"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  Globe2,
  GraduationCap,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  Shield,
  Trash2,
  Upload,
  UserCog,
  Users,
  XCircle,
} from "lucide-react";

import {
  ApiError,
  campusApi,
  sectionApi,
  sessionApi,
  studentApi,
  userApi,
  type AcademicSession,
  type Campus,
  type ClassSection,
  type ERPUser,
  type Student,
  type UserDetail,
  type UserRole,
} from "@/lib/api";
import { Badge, statusBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { WebsiteCMS } from "@/components/admin/website-cms";
import { WorkspacePlaceholder } from "@/components/ui/workspace-placeholder";
import { useAuth } from "@/lib/auth-context";

type AdminView = "students" | "campuses" | "sessions" | "sections" | "users" | "website";

const adminViews: {
  id: AdminView;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: "students", icon: Users },
  { id: "campuses", icon: Building2 },
  { id: "sessions", icon: CalendarDays },
  { id: "sections", icon: BookOpen },
  { id: "users", icon: UserCog },
  { id: "website", icon: Globe2 },
];

const inputCls =
  "w-full rounded-2xl border border-line/80 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20";

function asArray<T>(value: T[] | { results?: T[] }): T[] {
  return Array.isArray(value) ? value : value.results ?? [];
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleDateString("en-IN") : "";
}

function StatCard({
  label,
  value,
  icon: Icon,
  colour,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  colour: string;
}) {
  return (
    <div className="surface rounded-3xl p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${colour} text-white`}>
          <Icon size={18} />
        </div>
      </div>
      <p className="display-font mt-3 text-4xl font-bold text-ink">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label className="block text-sm font-medium text-ink">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function FormActions({
  busy,
  label,
  onCancel,
}: {
  busy: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-3 border-t border-line/60 pt-4">
      <button type="button" onClick={onCancel} className="rounded-2xl border border-line/70 px-4 py-2 text-sm font-medium text-ink hover:bg-slate-50">
        Cancel
      </button>
      <button type="submit" disabled={busy} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-blue-700 px-5 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 disabled:opacity-60">
        {busy ? "Saving..." : label}
      </button>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{message}</p>;
}

function StudentForm({
  campuses,
  sections,
  studentUsers,
  initial,
  selectedCampusId,
  onSave,
  onCancel,
}: {
  campuses: Campus[];
  sections: ClassSection[];
  studentUsers: ERPUser[];
  initial?: Student;
  selectedCampusId?: string;
  onSave: (data: Partial<Student> & { campus: number; section: number; first_name: string; date_of_birth: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const defaultCampus = initial?.campus ?? (selectedCampusId && selectedCampusId !== "all" ? Number(selectedCampusId) : campuses[0]?.id);
  const defaultSection = initial?.section ?? sections.find((section) => section.campus === defaultCampus)?.id ?? sections[0]?.id;
  const [form, setForm] = useState({
    campus: String(defaultCampus ?? ""),
    section: String(defaultSection ?? ""),
    admission_number: initial?.admission_number ?? "",
    user: initial?.user ? String(initial.user) : "",
    first_name: initial?.first_name ?? "",
    last_name: initial?.last_name ?? "",
    date_of_birth: initial?.date_of_birth ?? "",
    father_name: initial?.father_name ?? "",
    mother_name: initial?.mother_name ?? "",
    contact_email: initial?.contact_email ?? "",
    phone_number: initial?.phone_number ?? "",
    alternate_phone_number: initial?.alternate_phone_number ?? "",
    address: initial?.address ?? "",
    blood_group: initial?.blood_group ?? "",
    medical_notes: initial?.medical_notes ?? "",
    status: initial?.status ?? "active",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const campusSections = sections.filter((section) => String(section.campus) === form.campus);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({
        campus: Number(form.campus),
        section: Number(form.section),
        admission_number: form.admission_number,
        user: form.user ? Number(form.user) : null,
        first_name: form.first_name,
        last_name: form.last_name,
        date_of_birth: form.date_of_birth,
        father_name: form.father_name,
        mother_name: form.mother_name,
        contact_email: form.contact_email,
        phone_number: form.phone_number,
        alternate_phone_number: form.alternate_phone_number,
        address: form.address,
        blood_group: form.blood_group,
        medical_notes: form.medical_notes,
        status: form.status as Student["status"],
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Student save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Academic identity</p>
        </div>
        <Field label="Campus *">
          <select className={inputCls} value={form.campus} onChange={(e) => setForm((f) => ({ ...f, campus: e.target.value, section: "" }))} required>
            <option value="">Select campus</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </Field>
        <Field label="Section *">
          <select className={inputCls} value={form.section} onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))} required>
            <option value="">Select section</option>
            {campusSections.map((section) => <option key={section.id} value={section.id}>{section.label ?? `${section.grade_name} - ${section.section_name}`}</option>)}
          </select>
        </Field>
        <Field label="Admission No. *">
          <input className={inputCls} value={form.admission_number} onChange={(e) => setForm((f) => ({ ...f, admission_number: e.target.value }))} required placeholder="ADM-2026-001" />
        </Field>
        <Field label="Student login">
          <select className={inputCls} value={form.user} onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}>
            <option value="">Unlinked</option>
            {studentUsers.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.username}</option>)}
          </select>
        </Field>
        <Field label="Date of Birth *">
          <input type="date" className={inputCls} value={form.date_of_birth} onChange={(e) => setForm((f) => ({ ...f, date_of_birth: e.target.value }))} required />
        </Field>
        <Field label="First Name *">
          <input className={inputCls} value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} required />
        </Field>
        <Field label="Last Name">
          <input className={inputCls} value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
        </Field>
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Student["status"] }))}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="alumni">Alumni</option>
          </select>
        </Field>
        <div className="border-t border-line/60 pt-4 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Family and contact details</p>
        </div>
        <Field label="Father name">
          <input className={inputCls} value={form.father_name} onChange={(e) => setForm((f) => ({ ...f, father_name: e.target.value }))} />
        </Field>
        <Field label="Mother name">
          <input className={inputCls} value={form.mother_name} onChange={(e) => setForm((f) => ({ ...f, mother_name: e.target.value }))} />
        </Field>
        <Field label="Gmail / Email">
          <input type="email" className={inputCls} value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} placeholder="student@gmail.com" />
        </Field>
        <Field label="Phone no.">
          <input className={inputCls} value={form.phone_number} onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))} />
        </Field>
        <Field label="Alternate phone">
          <input className={inputCls} value={form.alternate_phone_number} onChange={(e) => setForm((f) => ({ ...f, alternate_phone_number: e.target.value }))} />
        </Field>
        <Field label="Blood group">
          <select className={inputCls} value={form.blood_group} onChange={(e) => setForm((f) => ({ ...f, blood_group: e.target.value }))}>
            <option value="">Select blood group</option>
            {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        </Field>
        <Field label="Address" wide>
          <textarea className={`${inputCls} min-h-20 resize-y`} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </Field>
        <Field label="Medical notes" wide>
          <textarea className={`${inputCls} min-h-20 resize-y`} value={form.medical_notes} onChange={(e) => setForm((f) => ({ ...f, medical_notes: e.target.value }))} />
        </Field>
      </div>
      <FormActions busy={busy} label="Save student" onCancel={onCancel} />
    </form>
  );
}

function CampusForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Campus;
  onSave: (data: Pick<Campus, "name" | "code"> & Partial<Pick<Campus, "address" | "logo_url" | "logo_alt_text" | "database_alias" | "database_name">>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    code: initial?.code ?? "",
    address: initial?.address ?? "",
    database_alias: initial?.database_alias ?? "",
    database_name: initial?.database_name ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Campus save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Campus name *">
          <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        </Field>
        <Field label="Code *">
          <input className={inputCls} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} required />
        </Field>
        <Field label="Address" wide>
          <input className={inputCls} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </Field>
        <Field label="Database alias">
          <input className={inputCls} value={form.database_alias} onChange={(e) => setForm((f) => ({ ...f, database_alias: e.target.value }))} placeholder="campus_m360_main" />
        </Field>
        <Field label="Database name">
          <input className={inputCls} value={form.database_name} onChange={(e) => setForm((f) => ({ ...f, database_name: e.target.value }))} placeholder="mentriq360_main" />
        </Field>
      </div>
      <FormActions busy={busy} label="Save campus" onCancel={onCancel} />
    </form>
  );
}

function SessionForm({
  campuses,
  initial,
  selectedCampusId,
  onSave,
  onCancel,
}: {
  campuses: Campus[];
  initial?: AcademicSession;
  selectedCampusId?: string;
  onSave: (data: Omit<AcademicSession, "id">) => Promise<void>;
  onCancel: () => void;
}) {
  const defaultCampus = initial?.campus ?? (selectedCampusId && selectedCampusId !== "all" ? Number(selectedCampusId) : campuses[0]?.id);
  const [form, setForm] = useState({
    campus: String(defaultCampus ?? ""),
    name: initial?.name ?? "2026-27",
    start_date: initial?.start_date ?? "",
    end_date: initial?.end_date ?? "",
    is_active: initial?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ ...form, campus: Number(form.campus) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Session save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Campus *">
          <select className={inputCls} value={form.campus} onChange={(e) => setForm((f) => ({ ...f, campus: e.target.value }))} required>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </Field>
        <Field label="Session name *">
          <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        </Field>
        <Field label="Start date *">
          <input type="date" className={inputCls} value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} required />
        </Field>
        <Field label="End date *">
          <input type="date" className={inputCls} value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} required />
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
          Active session
        </label>
      </div>
      <FormActions busy={busy} label="Save session" onCancel={onCancel} />
    </form>
  );
}

function SectionForm({
  campuses,
  sessions,
  teachers,
  initial,
  selectedCampusId,
  onSave,
  onCancel,
}: {
  campuses: Campus[];
  sessions: AcademicSession[];
  teachers: ERPUser[];
  initial?: ClassSection;
  selectedCampusId?: string;
  onSave: (data: Omit<ClassSection, "id">) => Promise<void>;
  onCancel: () => void;
}) {
  const defaultCampus = initial?.campus ?? (selectedCampusId && selectedCampusId !== "all" ? Number(selectedCampusId) : campuses[0]?.id);
  const defaultSession = initial?.session ?? sessions.find((session) => session.campus === defaultCampus)?.id ?? sessions[0]?.id;
  const [form, setForm] = useState({
    campus: String(defaultCampus ?? ""),
    session: String(defaultSession ?? ""),
    grade_name: initial?.grade_name ?? "",
    section_name: initial?.section_name ?? "",
    class_teacher: initial?.class_teacher ? String(initial.class_teacher) : "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const campusSessions = sessions.filter((session) => String(session.campus) === form.campus);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({
        campus: Number(form.campus),
        session: Number(form.session),
        grade_name: form.grade_name,
        section_name: form.section_name,
        class_teacher: form.class_teacher ? Number(form.class_teacher) : null,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Section save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Campus *">
          <select className={inputCls} value={form.campus} onChange={(e) => setForm((f) => ({ ...f, campus: e.target.value, session: "" }))} required>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </Field>
        <Field label="Academic session *">
          <select className={inputCls} value={form.session} onChange={(e) => setForm((f) => ({ ...f, session: e.target.value }))} required>
            <option value="">Select session</option>
            {campusSessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}
          </select>
        </Field>
        <Field label="Grade *">
          <input className={inputCls} value={form.grade_name} onChange={(e) => setForm((f) => ({ ...f, grade_name: e.target.value }))} required placeholder="Grade 5" />
        </Field>
        <Field label="Section *">
          <input className={inputCls} value={form.section_name} onChange={(e) => setForm((f) => ({ ...f, section_name: e.target.value }))} required placeholder="A" />
        </Field>
        <Field label="Class teacher">
          <select className={inputCls} value={form.class_teacher} onChange={(e) => setForm((f) => ({ ...f, class_teacher: e.target.value }))}>
            <option value="">Unassigned</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name || teacher.username}</option>)}
          </select>
        </Field>
      </div>
      <FormActions busy={busy} label="Save section" onCancel={onCancel} />
    </form>
  );
}

function UserForm({
  campuses,
  initial,
  selectedCampusId,
  allowSuperAdmin,
  onSave,
  onCancel,
}: {
  campuses: Campus[];
  initial?: ERPUser;
  selectedCampusId?: string;
  allowSuperAdmin: boolean;
  onSave: (data: Partial<ERPUser> & { username: string; password?: string; role: UserRole; campus_ids?: number[] }) => Promise<void>;
  onCancel: () => void;
}) {
  const defaultCampusIds = initial?.campuses?.map((campus) => String(campus.id))
    ?? (selectedCampusId && selectedCampusId !== "all" ? [selectedCampusId] : campuses[0] ? [String(campuses[0].id)] : []);
  const [form, setForm] = useState({
    username: initial?.username ?? "",
    email: initial?.email ?? "",
    first_name: initial?.first_name ?? "",
    last_name: initial?.last_name ?? "",
    phone_number: initial?.phone_number ?? "",
    gender: initial?.gender ?? "",
    date_of_birth: initial?.date_of_birth ?? "",
    address: initial?.address ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "",
    pincode: initial?.pincode ?? "",
    blood_group: initial?.blood_group ?? "",
    emergency_contact_name: initial?.emergency_contact_name ?? "",
    emergency_contact_phone: initial?.emergency_contact_phone ?? "",
    qualification: initial?.qualification ?? "",
    profile_photo_url: initial?.profile_photo_url ?? "",
    bio: initial?.bio ?? "",
    role: (initial?.role ?? "teacher") as UserRole,
    is_active: initial?.is_active ?? true,
    password: "",
    campus_ids: defaultCampusIds,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isProtectedSuperAdmin = initial?.role === "super_admin";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (form.role !== "super_admin" && form.campus_ids.length === 0) {
        setError("Select at least one campus for this user.");
        return;
      }
      const payload = {
        ...form,
        role: isProtectedSuperAdmin ? "super_admin" as UserRole : form.role,
        is_active: isProtectedSuperAdmin ? true : form.is_active,
        campus_ids: form.role === "super_admin" ? [] : form.campus_ids.map(Number),
      };
      if (!payload.password) delete (payload as Partial<typeof payload>).password;
      await onSave(payload);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "User save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <ErrorNote message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Account identity</p>
        </div>
        <Field label="Username *">
          <input className={inputCls} value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required />
        </Field>
        <Field label="Role *">
          <select
            className={inputCls}
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
            disabled={isProtectedSuperAdmin}
          >
            {allowSuperAdmin && <option value="super_admin">Super Admin</option>}
            <option value="school_admin">School Admin</option>
            <option value="account">Account</option>
            <option value="teacher">Teacher</option>
            <option value="student">Student</option>
          </select>
        </Field>
        <Field label="First name">
          <input className={inputCls} value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
        </Field>
        <Field label="Last name">
          <input className={inputCls} value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
        </Field>
        <Field label={initial ? "New password" : "Password *"}>
          <input type="password" className={inputCls} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required={!initial} minLength={8} />
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={isProtectedSuperAdmin || form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            disabled={isProtectedSuperAdmin}
          />
          Active user
        </label>

        <div className="border-t border-line/60 pt-4 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Personal details</p>
        </div>
        <Field label="Gender">
          <select className={inputCls} value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Date of Birth">
          <input type="date" className={inputCls} value={form.date_of_birth} onChange={(e) => setForm((f) => ({ ...f, date_of_birth: e.target.value }))} />
        </Field>
        <Field label="Blood Group">
          <select className={inputCls} value={form.blood_group} onChange={(e) => setForm((f) => ({ ...f, blood_group: e.target.value }))}>
            <option value="">Select blood group</option>
            {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="Profile Photo URL">
          <input className={inputCls} value={form.profile_photo_url} onChange={(e) => setForm((f) => ({ ...f, profile_photo_url: e.target.value }))} placeholder="https://..." />
        </Field>
        <Field label="Bio" wide>
          <textarea className={`${inputCls} min-h-16 resize-y`} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} placeholder="Brief description..." />
        </Field>

        <div className="border-t border-line/60 pt-4 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Contact information</p>
        </div>
        <Field label="Email">
          <input type="email" className={inputCls} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </Field>
        <Field label="Phone">
          <input className={inputCls} value={form.phone_number} onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))} />
        </Field>
        <Field label="Emergency Contact Name">
          <input className={inputCls} value={form.emergency_contact_name} onChange={(e) => setForm((f) => ({ ...f, emergency_contact_name: e.target.value }))} />
        </Field>
        <Field label="Emergency Contact Phone">
          <input className={inputCls} value={form.emergency_contact_phone} onChange={(e) => setForm((f) => ({ ...f, emergency_contact_phone: e.target.value }))} />
        </Field>

        <div className="border-t border-line/60 pt-4 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Address</p>
        </div>
        <Field label="Address" wide>
          <textarea className={`${inputCls} min-h-16 resize-y`} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </Field>
        <Field label="City">
          <input className={inputCls} value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
        </Field>
        <Field label="State">
          <input className={inputCls} value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
        </Field>
        <Field label="Pincode">
          <input className={inputCls} value={form.pincode} onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))} />
        </Field>

        <div className="border-t border-line/60 pt-4 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Professional</p>
        </div>
        <Field label="Qualification" wide>
          <input className={inputCls} value={form.qualification} onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value }))} placeholder="e.g. M.Tech, B.Ed..." />
        </Field>

        {form.role !== "super_admin" && (
        <div className="border-t border-line/60 pt-4 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Campus access</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {campuses.map((campus) => (
              <label key={campus.id} className="flex items-center gap-2 rounded-2xl border border-line/70 bg-white px-3 py-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.campus_ids.includes(String(campus.id))}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    campus_ids: e.target.checked
                      ? [...f.campus_ids, String(campus.id)]
                      : f.campus_ids.filter((id) => id !== String(campus.id)),
                  }))}
                />
                <span>{campus.name}</span>
              </label>
            ))}
          </div>
        </div>
        )}
      </div>
      <FormActions busy={busy} label="Save user" onCancel={onCancel} />
    </form>
  );
}

function userProfileCompletionPct(user: ERPUser) {
  const items = [
    user.email,
    user.phone_number,
    user.gender,
    user.date_of_birth,
    user.address,
    user.city,
    user.blood_group,
    user.qualification,
    user.profile_photo_url,
    user.bio,
  ];
  return Math.round((items.filter((v) => v?.trim()).length / items.length) * 100);
}

function UserDetailModal({
  userId,
  open,
  onClose,
}: {
  userId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) { setDetail(null); return; }
    setLoading(true);
    userApi.detail(userId).then(setDetail).catch(() => setDetail(null)).finally(() => setLoading(false));
  }, [open, userId]);

  if (!open) return null;

  const avatarUrl = detail?.profile_photo_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent((detail?.first_name?.[0] ?? "") + (detail?.last_name?.[0] ?? ""))}`;

  return (
    <Modal open={open} onClose={onClose} title="User Profile" size="lg">
      {loading && <WorkspacePlaceholder title="Loading profile" detail="Fetching user details..." />}
      {!loading && detail && (
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Header */}
          <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-slate-50 to-teal-50 p-5">
            <span
              role="img"
              aria-label={detail.full_name || detail.username}
              className="h-16 w-16 rounded-2xl border-2 border-white bg-slate-100 bg-cover bg-center shadow-md"
              style={{ backgroundImage: `url(${JSON.stringify(avatarUrl)})` }}
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-ink truncate">{detail.full_name || detail.username}</h3>
              <p className="text-sm text-muted">@{detail.username}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <Badge variant={detail.is_active ? "success" : "danger"}>{detail.is_active ? "Active" : "Inactive"}</Badge>
                <Badge variant="info">{detail.role.replace("_", " ")}</Badge>
                {detail.gender && <Badge variant="neutral">{detail.gender}</Badge>}
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-xs text-muted">Profile</p>
              <p className="text-2xl font-bold text-teal-600">{userProfileCompletionPct(detail)}%</p>
            </div>
          </div>

          {/* Bio */}
          {detail.bio && (
            <div className="rounded-2xl border border-line/60 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-2">About</p>
              <p className="text-sm text-ink leading-relaxed">{detail.bio}</p>
            </div>
          )}

          {/* Personal & Contact Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-line/60 bg-white p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted flex items-center gap-2"><Shield size={12} /> Personal Info</p>
              <DetailRow label="Date of Birth" value={detail.date_of_birth ? new Date(detail.date_of_birth).toLocaleDateString("en-IN") : ""} />
              <DetailRow label="Gender" value={detail.gender} />
              <DetailRow label="Blood Group" value={detail.blood_group} />
              <DetailRow label="Qualification" value={detail.qualification} />
            </div>
            <div className="rounded-2xl border border-line/60 bg-white p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted flex items-center gap-2"><Phone size={12} /> Contact</p>
              <DetailRow label="Email" value={detail.email} icon={<Mail size={12} className="text-muted" />} />
              <DetailRow label="Phone" value={detail.phone_number} icon={<Phone size={12} className="text-muted" />} />
              <DetailRow label="Emergency" value={detail.emergency_contact_name ? `${detail.emergency_contact_name} (${detail.emergency_contact_phone})` : ""} />
            </div>
          </div>

          {/* Address */}
          {(detail.address || detail.city) && (
            <div className="rounded-2xl border border-line/60 bg-white p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted flex items-center gap-2"><MapPin size={12} /> Address</p>
              <p className="text-sm text-ink">{[detail.address, detail.city, detail.state, detail.pincode].filter(Boolean).join(", ")}</p>
            </div>
          )}

          {/* Campus Memberships */}
          {detail.campuses && detail.campuses.length > 0 && (
            <div className="rounded-2xl border border-line/60 bg-white p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted flex items-center gap-2"><Building2 size={12} /> Campus Access</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {detail.campuses.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <Building2 size={14} className="text-teal-600" />
                    <span className="font-semibold text-ink">{c.name}</span>
                    <Badge variant="neutral">{c.role.replace("_", " ")}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked Profiles */}
          {detail.linked_student && (
            <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-700 flex items-center gap-2"><GraduationCap size={12} /> Linked Student Profile</p>
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <DetailRow label="Admission No." value={detail.linked_student.admission_number} />
                <DetailRow label="Section" value={detail.linked_student.section} />
                <DetailRow label="Campus" value={detail.linked_student.campus} />
                <DetailRow label="Status" value={detail.linked_student.status} />
                <DetailRow label="Father" value={detail.linked_student.father_name} />
                <DetailRow label="Mother" value={detail.linked_student.mother_name} />
              </div>
            </div>
          )}
          {detail.linked_staff && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-700 flex items-center gap-2"><UserCog size={12} /> Linked Staff Profile</p>
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <DetailRow label="Employee Code" value={detail.linked_staff.employee_code} />
                <DetailRow label="Designation" value={detail.linked_staff.designation} />
                <DetailRow label="Department" value={detail.linked_staff.department} />
                <DetailRow label="Employment" value={detail.linked_staff.employment_type?.replace("_", " ")} />
                <DetailRow label="Joining Date" value={detail.linked_staff.joining_date ? new Date(detail.linked_staff.joining_date).toLocaleDateString("en-IN") : ""} />
                <DetailRow label="Status" value={detail.linked_staff.status} />
              </div>
            </div>
          )}

          {/* Recent Activity */}
          {detail.recent_activity && detail.recent_activity.length > 0 && (
            <div className="rounded-2xl border border-line/60 bg-white p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Recent Activity</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {detail.recent_activity.map((event, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm border-b border-line/30 pb-2 last:border-0">
                    <div className="mt-0.5 h-2 w-2 rounded-full bg-teal-400 shrink-0" />
                    <div>
                      <span className="font-medium text-ink capitalize">{event.action}</span>
                      <span className="text-muted"> · {event.entity_type}</span>
                      {event.summary && <span className="text-muted"> — {event.summary}</span>}
                      <p className="text-xs text-muted mt-0.5">{new Date(event.created_at).toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex gap-6 text-xs text-muted pt-2 border-t border-line/40">
            <span>Created: {detail.created_at ? new Date(detail.created_at).toLocaleDateString("en-IN") : "—"}</span>
            <span>Updated: {detail.updated_at ? new Date(detail.updated_at).toLocaleDateString("en-IN") : "—"}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}

function DetailRow({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-xs text-muted w-24 shrink-0">{label}</span>
      <span className="text-sm font-medium text-ink truncate">{value || "—"}</span>
    </div>
  );
}

function studentProfileCompletion(student: Student) {
  const items = [
    student.father_name,
    student.mother_name,
    student.contact_email,
    student.phone_number,
    student.address,
    student.blood_group,
  ];
  return Math.round((items.filter((item) => item?.trim()).length / items.length) * 100);
}

function studentContactLine(student: Student) {
  return student.contact_email || student.phone_number || "Not added";
}

type ImportTarget = "students" | "teachers";
type ParsedImportRow = Record<string, string>;
type ImportResult = {
  row: number;
  label: string;
  status: "success" | "error";
  message: string;
};

const studentTemplateHeaders = [
  "campus_code",
  "grade_name",
  "section_name",
  "admission_number",
  "first_name",
  "last_name",
  "date_of_birth",
  "father_name",
  "mother_name",
  "contact_email",
  "phone_number",
  "address",
  "blood_group",
  "status",
];

const teacherTemplateHeaders = [
  "campus_codes",
  "username",
  "password",
  "first_name",
  "last_name",
  "email",
  "phone_number",
];

function normaliseImportKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseDelimitedText(text: string): ParsedImportRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (!lines.length) return [];

  const headerLine = lines[0];
  const delimiter = headerLine.includes("\t")
    ? "\t"
    : headerLine.includes(";") && !headerLine.includes(",")
      ? ";"
      : ",";
  const headers = parseDelimitedLine(headerLine, delimiter).map(normaliseImportKey);

  return lines.slice(1).map((line) => {
    const cells = parseDelimitedLine(line, delimiter);
    return headers.reduce<ParsedImportRow>((row, header, index) => {
      row[header] = cells[index]?.trim() ?? "";
      return row;
    }, {});
  });
}

function escapeCsv(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadCsvTemplate(filename: string, headers: string[]) {
  downloadTextFile(`${filename}.csv`, `${headers.map(escapeCsv).join(",")}\n`, "text/csv;charset=utf-8");
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function exportRowsToExcel(filename: string, sheetName: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const rowsHtml = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  const workbook = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head>
        <meta charset="UTF-8" />
        <xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${escapeHtml(sheetName)}</x:Name><x:WorksheetOptions /></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml>
      </head>
      <body><table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></body>
    </html>`;
  downloadTextFile(`${filename}.xls`, workbook, "application/vnd.ms-excel;charset=utf-8");
}

function readImportFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read import file."));
    reader.readAsText(file);
  });
}

function splitCodes(value: string) {
  return value
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveCampus(row: ParsedImportRow, campuses: Campus[], fallbackCampus?: Campus) {
  const campusValue = row.campus_code || row.campus || row.campus_name;
  if (!campusValue && fallbackCampus) return fallbackCampus;
  const lookup = campusValue.toLowerCase();
  return campuses.find((campus) => (
    campus.code.toLowerCase() === lookup
    || campus.name.toLowerCase() === lookup
    || String(campus.id) === campusValue
  ));
}

function sectionMatches(section: ClassSection, row: ParsedImportRow, campusId: number) {
  if (section.campus !== campusId) return false;
  if (row.section_id && String(section.id) === row.section_id) return true;
  const grade = row.grade_name || row.grade || row.class;
  const sectionName = row.section_name || row.section;
  const label = row.section_label || (grade && sectionName ? `${grade} - ${sectionName}` : "");
  const sectionLabel = (section.label ?? `${section.grade_name} - ${section.section_name}`).toLowerCase();
  return Boolean(label && sectionLabel === label.toLowerCase());
}

function resolveSection(row: ParsedImportRow, sections: ClassSection[], campusId: number) {
  return sections.find((section) => sectionMatches(section, row, campusId));
}

function resolveCampusIds(row: ParsedImportRow, campuses: Campus[], fallbackCampus?: Campus) {
  const rawCodes = splitCodes(row.campus_codes || row.campus_code || row.campus || row.campus_name || "");
  if (!rawCodes.length && fallbackCampus) return [fallbackCampus.id];

  const campusIds = rawCodes
    .map((code) => campuses.find((campus) => (
      campus.code.toLowerCase() === code.toLowerCase()
      || campus.name.toLowerCase() === code.toLowerCase()
      || String(campus.id) === code
    ))?.id)
    .filter((id): id is number => typeof id === "number");

  return Array.from(new Set(campusIds));
}

function BulkImportModal({
  target,
  open,
  campuses,
  sections,
  selectedCampusId,
  onClose,
  onComplete,
}: {
  target: ImportTarget | null;
  open: boolean;
  campuses: Campus[];
  sections: ClassSection[];
  selectedCampusId: string;
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<ImportResult[]>([]);

  useEffect(() => {
    if (!open) {
      setRows([]);
      setFileName("");
      setError("");
      setResults([]);
      setBusy(false);
    }
  }, [open]);

  if (!target) return null;

  const fallbackCampus = selectedCampusId !== "all"
    ? campuses.find((campus) => String(campus.id) === selectedCampusId)
    : campuses.length === 1 ? campuses[0] : undefined;
  const title = target === "students" ? "Bulk Upload Students" : "Bulk Upload Teachers";
  const headers = target === "students" ? studentTemplateHeaders : teacherTemplateHeaders;
  const sample = target === "students"
    ? "campus_code, grade_name, section_name, admission_number, first_name, date_of_birth"
    : "campus_codes, username, password, first_name, last_name, email";

  async function handleFile(file?: File) {
    if (!file) return;
    setError("");
    setResults([]);
    setFileName(file.name);
    const content = await readImportFile(file);
    const parsed = parseDelimitedText(content).filter((row) => Object.values(row).some(Boolean));
    setRows(parsed);
    if (!parsed.length) setError("No rows found. Upload a CSV or TSV file exported from Excel.");
  }

  async function importRows() {
    setBusy(true);
    setError("");
    const importResults: ImportResult[] = [];

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;
      try {
        if (target === "students") {
          const campus = resolveCampus(row, campuses, fallbackCampus);
          if (!campus) throw new Error("Campus not found. Use campus_code or select a single campus.");
          const section = resolveSection(row, sections, campus.id);
          if (!section) throw new Error("Section not found. Use section_id or grade_name + section_name.");
          if (!row.admission_number) throw new Error("Admission number is required.");
          if (!row.first_name) throw new Error("First name is required.");
          if (!row.date_of_birth && !row.dob) throw new Error("Date of birth is required.");

          const status = ["active", "inactive", "alumni"].includes(row.status) ? row.status : "active";
          const student = await studentApi.create({
            campus: campus.id,
            section: section.id,
            user: null,
            admission_number: row.admission_number,
            first_name: row.first_name,
            last_name: row.last_name || "",
            date_of_birth: row.date_of_birth || row.dob,
            father_name: row.father_name || "",
            mother_name: row.mother_name || "",
            contact_email: row.contact_email || row.email || "",
            phone_number: row.phone_number || row.phone || "",
            alternate_phone_number: row.alternate_phone_number || "",
            address: row.address || "",
            blood_group: row.blood_group || "",
            medical_notes: row.medical_notes || "",
            status: status as Student["status"],
          });
          importResults.push({ row: rowNumber, label: student.full_name, status: "success", message: "Student created" });
        } else {
          if (!row.username) throw new Error("Username is required.");
          if (!row.password) throw new Error("Password is required for teacher imports.");
          const campusIds = resolveCampusIds(row, campuses, fallbackCampus);
          if (!campusIds.length) throw new Error("Campus not found. Use campus_codes or select a single campus.");
          const teacher = await userApi.create({
            username: row.username,
            password: row.password,
            first_name: row.first_name || "",
            last_name: row.last_name || "",
            email: row.email || "",
            phone_number: row.phone_number || row.phone || "",
            role: "teacher",
            campus_ids: campusIds,
            is_active: true,
          });
          importResults.push({ row: rowNumber, label: teacher.full_name || teacher.username, status: "success", message: "Teacher created" });
        }
      } catch (err) {
        importResults.push({
          row: rowNumber,
          label: row.admission_number || row.username || `Row ${rowNumber}`,
          status: "error",
          message: err instanceof Error ? err.message : "Import failed",
        });
      }
    }

    setResults(importResults);
    setBusy(false);
    if (importResults.some((item) => item.status === "success")) await onComplete();
  }

  const successCount = results.filter((item) => item.status === "success").length;
  const errorCount = results.filter((item) => item.status === "error").length;

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="space-y-5">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-semibold">Upload an Excel-exported CSV or TSV file.</p>
          <p className="mt-1 text-blue-800">Required columns: {sample}. Real .xlsx parsing is avoided to keep the deployment lightweight; Excel can save the template as CSV.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadCsvTemplate(`${target}-bulk-template`, headers)}
            className="inline-flex items-center gap-2 rounded-2xl border border-line/70 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-slate-50"
          >
            <Download size={14} />
            Download template
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-ink px-4 py-2 text-sm font-semibold text-white">
            <Upload size={14} />
            Choose file
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </label>
        </div>

        {fileName && (
          <div className="rounded-2xl border border-line/70 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Selected file</p>
            <p className="mt-1 font-semibold text-ink">{fileName}</p>
            <p className="mt-1 text-sm text-muted">{rows.length} row(s) ready for review</p>
          </div>
        )}

        {error && <ErrorNote message={error} />}

        {rows.length > 0 && !results.length && (
          <div className="max-h-64 overflow-auto rounded-2xl border border-line/70">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  {headers.slice(0, 6).map((header) => (
                    <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((row, index) => (
                  <tr key={index} className="border-t border-line/40">
                    {headers.slice(0, 6).map((header) => (
                      <td key={header} className="px-4 py-3 text-muted">{row[header]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">{successCount} created</Badge>
              <Badge variant={errorCount ? "danger" : "neutral"}>{errorCount} failed</Badge>
            </div>
            <div className="max-h-64 overflow-auto rounded-2xl border border-line/70">
              {results.map((item) => (
                <div key={`${item.row}-${item.label}`} className="flex items-start gap-3 border-b border-line/40 px-4 py-3 text-sm last:border-b-0">
                  {item.status === "success" ? <CheckCircle2 size={16} className="mt-0.5 text-emerald-600" /> : <XCircle size={16} className="mt-0.5 text-rose-600" />}
                  <div>
                    <p className="font-semibold text-ink">Row {item.row}: {item.label}</p>
                    <p className="text-muted">{item.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-line/60 pt-4">
          <button type="button" onClick={onClose} className="rounded-2xl border border-line/70 px-4 py-2 text-sm font-medium text-ink hover:bg-slate-50">
            Close
          </button>
          <button
            type="button"
            onClick={importRows}
            disabled={busy || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Upload size={14} />
            {busy ? "Importing..." : `Import ${rows.length} row(s)`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function AdminDashboard() {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<AdminView>("students");
  const [selectedCampusId, setSelectedCampusId] = useState("all");
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [users, setUsers] = useState<ERPUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Student | Campus | AcademicSession | ClassSection | ERPUser | null>(null);
  const [modal, setModal] = useState<AdminView | null>(null);
  const [bulkTarget, setBulkTarget] = useState<ImportTarget | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<number | null>(null);

  const canManageCampuses = user?.role === "super_admin";
  const campusScopedViews = canManageCampuses ? adminViews : adminViews.filter((view) => view.id !== "campuses");
  const visibleCampuses = useMemo(() => {
    if (selectedCampusId === "all") return campuses;
    return campuses.filter((campus) => String(campus.id) === selectedCampusId);
  }, [campuses, selectedCampusId]);
  const visibleCampusIds = useMemo(() => new Set(visibleCampuses.map((campus) => campus.id)), [visibleCampuses]);
  const visibleSessions = useMemo(
    () => sessions.filter((session) => selectedCampusId === "all" || visibleCampusIds.has(session.campus)),
    [sessions, selectedCampusId, visibleCampusIds]
  );
  const visibleSections = useMemo(
    () => sections.filter((section) => selectedCampusId === "all" || visibleCampusIds.has(section.campus)),
    [sections, selectedCampusId, visibleCampusIds]
  );
  const visibleStudents = useMemo(
    () => students.filter((student) => selectedCampusId === "all" || visibleCampusIds.has(student.campus)),
    [students, selectedCampusId, visibleCampusIds]
  );
  const visibleUsers = useMemo(
    () => users.filter((item) => selectedCampusId === "all" || item.campuses?.some((campus) => visibleCampusIds.has(campus.id))),
    [users, selectedCampusId, visibleCampusIds]
  );
  const teachers = useMemo(() => visibleUsers.filter((item) => item.role === "teacher"), [visibleUsers]);
  const studentUsers = useMemo(() => visibleUsers.filter((item) => item.role === "student"), [visibleUsers]);
  const selectedCampusName = selectedCampusId === "all"
    ? "All campuses"
    : campuses.find((campus) => String(campus.id) === selectedCampusId)?.name ?? "Selected campus";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [campusRes, sessionRes, sectionRes, studentRes, userRes] = await Promise.all([
        campusApi.list(),
        sessionApi.list(),
        sectionApi.list(),
        studentApi.list(),
        userApi.list(),
      ]);
      const campusArr = asArray(campusRes);
      setCampuses(campusArr);
      setSessions(asArray(sessionRes));
      setSections(asArray(sectionRes));
      setStudents(asArray(studentRes));
      setUsers(asArray(userRes));
      setSelectedCampusId((current) => {
        const allowedIds = campusArr.map((campus) => String(campus.id));
        if (user?.role === "super_admin") {
          return current === "all" || allowedIds.includes(current) ? current : "all";
        }
        return allowedIds.includes(current) ? current : allowedIds[0] ?? "";
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load ERP data.");
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredStudents = visibleStudents.filter((student) => {
    const q = search.toLowerCase();
    return !q || [
      student.full_name,
      student.admission_number,
      student.contact_email,
      student.phone_number,
      student.father_name,
      student.mother_name,
    ].some((value) => value?.toLowerCase().includes(q));
  });

  function openModal(view: AdminView, item: typeof editing = null) {
    setEditing(item);
    setModal(view);
  }

  function closeModal() {
    setEditing(null);
    setModal(null);
  }

  async function refreshAfterSave() {
    closeModal();
    await load();
  }

  async function removeRecord(kind: AdminView, id: number) {
    if (!confirm("Delete this record?")) return;
    try {
      if (kind === "students") await studentApi.remove(id);
      if (kind === "campuses") await campusApi.remove(id);
      if (kind === "sessions") await sessionApi.remove(id);
      if (kind === "sections") await sectionApi.remove(id);
      if (kind === "users") await userApi.remove(id);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  function exportStudents() {
    exportRowsToExcel(
      "mentriq360-students",
      "Students",
      ["Admission", "Name", "Campus", "Section", "Date of Birth", "Email", "Phone", "Father", "Mother", "Status"],
      filteredStudents.map((student) => [
        student.admission_number,
        student.full_name,
        student.campus_name ?? campuses.find((campus) => campus.id === student.campus)?.name ?? "",
        student.section_label ?? sections.find((section) => section.id === student.section)?.label ?? "",
        student.date_of_birth,
        student.contact_email,
        student.phone_number,
        student.father_name,
        student.mother_name,
        student.status,
      ])
    );
  }

  function exportUsers() {
    exportRowsToExcel(
      "mentriq360-users",
      "Users",
      ["Username", "Name", "Role", "Campus Access", "Email", "Phone", "Active"],
      visibleUsers.map((item) => [
        item.username,
        item.full_name,
        item.role.replace("_", " "),
        item.campuses?.map((campus) => `${campus.code} ${campus.role.replace("_", " ")}`).join(", ") ?? "",
        item.email,
        item.phone_number,
        item.is_active ? "Yes" : "No",
      ])
    );
  }

  function downloadCurrentTemplate() {
    downloadCsvTemplate(
      activeView === "users" ? "teacher-bulk-template" : "student-bulk-template",
      activeView === "users" ? teacherTemplateHeaders : studentTemplateHeaders
    );
  }

  if (loading) {
    return <WorkspacePlaceholder title="Admin dashboard" detail="Preparing records and access controls." />;
  }

  return (
    <div className="space-y-6">
      <section className="surface p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="section-kicker">
              <Users size={14} />
              Registry
            </span>
            <h1 className="display-font mt-3 text-2xl font-semibold text-ink">Institution records and user access</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Manage students, campuses, sessions, sections, teachers, and bulk Excel workflows for {selectedCampusName}.
            </p>
          </div>
          <button type="button" onClick={load} className="flex items-center gap-2 rounded-lg border border-line/70 bg-white px-4 py-2 text-sm font-medium text-muted hover:bg-slate-50 hover:text-ink">
            <RefreshCcw size={14} />
            Refresh
          </button>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={visibleStudents.length} icon={GraduationCap} colour="bg-gradient-to-br from-teal-500 to-teal-700" />
        <StatCard label="Active" value={visibleStudents.filter((student) => student.status === "active").length} icon={BadgeCheck} colour="bg-gradient-to-br from-emerald-500 to-emerald-700" />
        <StatCard label="Campuses" value={visibleCampuses.length} icon={Building2} colour="bg-gradient-to-br from-blue-500 to-blue-700" />
        <StatCard label="Sections" value={visibleSections.length} icon={BookOpen} colour="bg-gradient-to-br from-violet-500 to-violet-700" />
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
          <button className="ml-2 underline" onClick={load}>Retry</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="mr-2 flex items-center gap-2 rounded-2xl border border-line/70 bg-white px-3 py-2 text-sm text-muted">
          <Building2 size={14} />
          <select
            value={selectedCampusId}
            onChange={(event) => setSelectedCampusId(event.target.value)}
            className="bg-transparent font-medium text-ink outline-none"
            title="Campus workspace"
          >
            {canManageCampuses && <option value="all">All campuses</option>}
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>{campus.name}</option>
            ))}
          </select>
        </label>
        <span className="hidden rounded-full border border-line/70 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-muted sm:inline-flex">
          Workspace: {selectedCampusName}
        </span>
        {campusScopedViews.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setActiveView(id); setActionMenuOpen(false); }}
            className={`rounded-2xl px-4 py-2 text-sm font-medium capitalize transition ${
              activeView === id ? "bg-ink text-white shadow" : "border border-line/70 bg-white text-muted hover:bg-slate-50 hover:text-ink"
            }`}
          >
            <Icon size={14} className="mr-1.5 inline" />
            {id}
          </button>
        ))}
        <div className="flex w-full flex-wrap gap-2 sm:w-auto md:ml-auto">
          <button type="button" onClick={load} className="flex items-center gap-2 rounded-2xl border border-line/70 bg-white px-4 py-2 text-sm font-medium text-muted hover:bg-slate-50 hover:text-ink">
            <RefreshCcw size={14} />
            Refresh
          </button>
          {(activeView === "students" || activeView === "users") && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setActionMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-2xl border border-line/70 bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm hover:bg-slate-50"
                aria-expanded={actionMenuOpen}
              >
                <FileSpreadsheet size={14} />
                Excel actions
                <MoreHorizontal size={14} />
              </button>
              {actionMenuOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-[min(16rem,calc(100vw-1rem))] rounded-2xl border border-line/70 bg-white p-1.5 shadow-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkTarget(activeView === "students" ? "students" : "teachers");
                      setActionMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-slate-50"
                  >
                    <Upload size={14} />
                    {activeView === "students" ? "Bulk upload students" : "Bulk upload teachers"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeView === "students") exportStudents();
                      else exportUsers();
                      setActionMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-slate-50"
                  >
                    <Download size={14} />
                    Export visible records
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      downloadCurrentTemplate();
                      setActionMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-slate-50"
                  >
                    <FileSpreadsheet size={14} />
                    Download import template
                  </button>
                </div>
              )}
            </div>
          )}
          <button type="button" onClick={() => openModal(activeView)} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-blue-700 px-4 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5">
            <Plus size={14} />
            New
          </button>
        </div>
      </div>

      {activeView === "students" && (
        <div className="surface overflow-hidden shadow-soft">
          <div className="flex flex-wrap items-center gap-3 border-b border-line/60 px-4 py-4 sm:px-5">
            <div className="relative min-w-0 flex-1 basis-full sm:basis-72">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by student or admission no." className="w-full rounded-2xl border border-line/70 bg-white py-2.5 pl-9 pr-4 text-sm text-ink outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/60 bg-slate-50">
                  {["Admission", "Name", "Login", "Campus", "Section", "D.O.B", "Contact", "Status", "Actions"].map((head) => <th key={head} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{head}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="border-b border-line/40 hover:bg-slate-50/60">
                    <td className="px-5 py-3.5 font-mono text-xs text-muted">{student.admission_number}</td>
                    <td className="px-5 py-3.5 font-semibold text-ink">{student.full_name}</td>
                    <td className="px-5 py-3.5 text-muted">{student.user_name || "Unlinked"}</td>
                    <td className="px-5 py-3.5 text-muted">{student.campus_name ?? campuses.find((campus) => campus.id === student.campus)?.name ?? "-"}</td>
                    <td className="px-5 py-3.5 text-muted">{student.section_label ?? sections.find((section) => section.id === student.section)?.label ?? "-"}</td>
                    <td className="px-5 py-3.5 text-muted">{formatDate(student.date_of_birth)}</td>
                    <td className="px-5 py-3.5">
                      <p className="max-w-[12rem] truncate text-muted">{studentContactLine(student)}</p>
                      <p className="mt-1 text-xs font-medium text-ink">Profile {studentProfileCompletion(student)}%</p>
                    </td>
                    <td className="px-5 py-3.5"><Badge variant={statusBadge(student.status)}>{student.status}</Badge></td>
                    <td className="px-5 py-3.5">
                      <RowActions onEdit={() => openModal("students", student)} onDelete={() => removeRecord("students", student.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeView === "campuses" && (
        <CardGrid>
          {visibleCampuses.map((campus) => (
            <AdminCard key={campus.id} title={campus.name} subtitle={campus.code} meta={`${sections.filter((section) => section.campus === campus.id).length} sections`} onEdit={() => openModal("campuses", campus)} onDelete={() => removeRecord("campuses", campus.id)}>
              {campus.address && <p className="mt-3 text-sm text-muted">{campus.address}</p>}
            </AdminCard>
          ))}
        </CardGrid>
      )}

      {activeView === "sessions" && (
        <CardGrid>
          {visibleSessions.map((session) => (
            <AdminCard key={session.id} title={session.name} subtitle={session.campus_name ?? campuses.find((campus) => campus.id === session.campus)?.name ?? ""} meta={`${formatDate(session.start_date)} to ${formatDate(session.end_date)}`} onEdit={() => openModal("sessions", session)} onDelete={() => removeRecord("sessions", session.id)}>
              <Badge variant={session.is_active ? "success" : "neutral"}>{session.is_active ? "active" : "inactive"}</Badge>
            </AdminCard>
          ))}
        </CardGrid>
      )}

      {activeView === "sections" && (
        <CardGrid>
          {visibleSections.map((section) => (
            <AdminCard key={section.id} title={section.label ?? `${section.grade_name} - ${section.section_name}`} subtitle={section.campus_name ?? campuses.find((campus) => campus.id === section.campus)?.name ?? ""} meta={`${visibleStudents.filter((student) => student.section === section.id).length} students`} onEdit={() => openModal("sections", section)} onDelete={() => removeRecord("sections", section.id)}>
              <p className="text-sm text-muted">Teacher: {section.class_teacher_name || "Unassigned"}</p>
            </AdminCard>
          ))}
        </CardGrid>
      )}

      {activeView === "website" && <WebsiteCMS />}

      {activeView === "users" && (
        <div className="surface overflow-hidden shadow-soft">
          <div className="flex flex-wrap items-center gap-3 border-b border-line/60 px-4 py-4 sm:px-5">
            <div className="relative min-w-0 flex-1 basis-full sm:basis-72">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, phone, city..." className="w-full rounded-2xl border border-line/70 bg-white py-2.5 pl-9 pr-4 text-sm text-ink outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/60 bg-slate-50">
                  {["", "Name", "Username", "Role", "Email", "Phone", "City", "Profile", "Status", "Actions"].map((head) => <th key={head} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{head}</th>)}
                </tr>
              </thead>
              <tbody>
                {visibleUsers.filter((u) => {
                  const q = search.toLowerCase();
                  return !q || [u.full_name, u.username, u.email, u.phone_number, u.city, u.role].some((v) => v?.toLowerCase().includes(q));
                }).map((u) => {
                  const avatarUrl = u.profile_photo_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent((u.first_name?.[0] ?? "") + (u.last_name?.[0] ?? ""))}`;
                  return (
                    <tr key={u.id} className="border-b border-line/40 hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <span
                          role="img"
                          aria-label={u.full_name || u.username}
                          className="block h-9 w-9 rounded-xl border border-line/40 bg-slate-100 bg-cover bg-center"
                          style={{ backgroundImage: `url(${JSON.stringify(avatarUrl)})` }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{u.full_name || u.username}</p>
                        {u.gender && <p className="text-xs text-muted capitalize">{u.gender}</p>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted">{u.username}</td>
                      <td className="px-4 py-3"><Badge variant="info">{u.role.replace("_", " ")}</Badge></td>
                      <td className="px-4 py-3 text-muted">{u.email || "—"}</td>
                      <td className="px-4 py-3 text-muted">{u.phone_number || "—"}</td>
                      <td className="px-4 py-3 text-muted">{u.city || "—"}</td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium text-ink">Profile {userProfileCompletionPct(u)}%</p>
                        <div className="mt-1 h-1.5 w-16 rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-blue-500 transition-all" style={{ width: `${userProfileCompletionPct(u)}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge variant={u.is_active ? "success" : "danger"}>{u.is_active ? "active" : "inactive"}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => setViewingUserId(u.id)} className="flex items-center gap-1 rounded-xl border border-teal-200 px-2.5 py-1.5 text-xs font-medium text-teal-700 transition hover:bg-teal-50" title="View full profile">
                            <Eye size={12} />
                            View
                          </button>
                          <button type="button" onClick={() => openModal("users", u)} className="rounded-xl border border-line/70 px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-slate-100">
                            Edit
                          </button>
                          {u.role !== "super_admin" && (
                            <button type="button" onClick={() => removeRecord("users", u.id)} className="flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50" aria-label={`Delete ${u.username}`}>
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modal === "students"} onClose={closeModal} title={editing ? "Edit Student" : "Add Student"} size="lg">
        <StudentForm campuses={visibleCampuses} sections={visibleSections} studentUsers={studentUsers} selectedCampusId={selectedCampusId} initial={editing && "admission_number" in editing ? editing : undefined} onSave={async (data) => {
          if (editing && "admission_number" in editing) await studentApi.update(editing.id, data);
          else await studentApi.create(data);
          await refreshAfterSave();
        }} onCancel={closeModal} />
      </Modal>

      <Modal open={modal === "campuses"} onClose={closeModal} title={editing ? "Edit Campus" : "Add Campus"} size="md">
        <CampusForm initial={editing && "code" in editing ? editing : undefined} onSave={async (data) => {
          if (editing && "code" in editing) await campusApi.update(editing.id, data);
          else await campusApi.create(data);
          await refreshAfterSave();
        }} onCancel={closeModal} />
      </Modal>

      <Modal open={modal === "sessions"} onClose={closeModal} title={editing ? "Edit Session" : "Add Session"} size="md">
        <SessionForm campuses={visibleCampuses} selectedCampusId={selectedCampusId} initial={editing && "start_date" in editing ? editing : undefined} onSave={async (data) => {
          if (editing && "start_date" in editing) await sessionApi.update(editing.id, data);
          else await sessionApi.create(data);
          await refreshAfterSave();
        }} onCancel={closeModal} />
      </Modal>

      <Modal open={modal === "sections"} onClose={closeModal} title={editing ? "Edit Section" : "Add Section"} size="md">
        <SectionForm campuses={visibleCampuses} sessions={visibleSessions} teachers={teachers} selectedCampusId={selectedCampusId} initial={editing && "grade_name" in editing ? editing : undefined} onSave={async (data) => {
          if (editing && "grade_name" in editing) await sectionApi.update(editing.id, data);
          else await sectionApi.create(data);
          await refreshAfterSave();
        }} onCancel={closeModal} />
      </Modal>

      <Modal open={modal === "users"} onClose={closeModal} title={editing ? "Edit User" : "Add User"} size="lg">
        <UserForm campuses={visibleCampuses} selectedCampusId={selectedCampusId} allowSuperAdmin={canManageCampuses} initial={editing && "username" in editing ? editing : undefined} onSave={async (data) => {
          if (editing && "username" in editing) await userApi.update(editing.id, data);
          else await userApi.create(data);
          await refreshAfterSave();
        }} onCancel={closeModal} />
      </Modal>

      <UserDetailModal userId={viewingUserId} open={viewingUserId !== null} onClose={() => setViewingUserId(null)} />

      <BulkImportModal
        target={bulkTarget}
        open={bulkTarget !== null}
        campuses={visibleCampuses}
        sections={visibleSections}
        selectedCampusId={selectedCampusId}
        onClose={() => setBulkTarget(null)}
        onComplete={load}
      />

    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={onEdit} className="rounded-xl border border-line/70 px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-slate-100">
        Edit
      </button>
      <button type="button" onClick={onDelete} className="flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50">
        <Trash2 size={12} />
        Delete
      </button>
    </div>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function AdminCard({
  title,
  subtitle,
  meta,
  children,
  onEdit,
  onDelete,
}: {
  title: string;
  subtitle: string;
  meta: string;
  children?: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="surface rounded-3xl p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">{title}</h3>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <Badge variant="info">{meta}</Badge>
      </div>
      {children}
      <div className="mt-4">
        <RowActions onEdit={onEdit} onDelete={onDelete} />
      </div>
    </article>
  );
}
