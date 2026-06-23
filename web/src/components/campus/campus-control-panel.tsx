"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  BookOpen,
  Camera,
  CheckCircle2,
  Clock3,
  Cpu,
  Fingerprint,
  Image as ImageIcon,
  IdCard,
  Layers3,
  PencilLine,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";

import {
  ApiError,
  approvalRequestApi,
  attendanceDeviceApi,
  campusApi,
  campusMembershipApi,
  sectionApi,
  staffAttendanceApi,
  teacherSubjectAllocationApi,
  userApi,
  type ApprovalRequest,
  type AttendanceCaptureMethod,
  type AttendanceDevice,
  type Campus,
  type CampusMembership,
  type CampusMemberRole,
  type ClassSection,
  type ERPUser,
  type StaffAttendanceRecord,
  type StaffAttendanceStatus,
  type TeacherSubjectAllocation,
} from "@/lib/api";
import { Badge, statusBadge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import {
  HardwareDeviceConfiguration,
  type AttendanceDeviceConfigurationPayload,
} from "@/components/attendance/hardware-device-configuration";
import { Modal } from "@/components/ui/modal";
import { WorkspacePlaceholder } from "@/components/ui/workspace-placeholder";

type ControlView = "branding" | "members" | "subjects" | "devices" | "staff" | "approvals";

const inputCls =
  "w-full rounded-lg border border-line/80 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

const views: {
  id: ControlView;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: "branding", label: "Campus Branding", icon: Building2 },
  { id: "members", label: "Campus Admins", icon: ShieldCheck },
  { id: "subjects", label: "Teacher Subjects", icon: BookOpen },
  { id: "devices", label: "Hardware Devices", icon: Cpu },
  { id: "staff", label: "Staff Attendance", icon: Clock3 },
  { id: "approvals", label: "Approvals", icon: CheckCircle2 },
];

const captureLabels: Record<AttendanceCaptureMethod, string> = {
  manual: "Manual",
  face_recognition: "Face Recognition",
  fingerprint: "Fingerprint",
  card_scan: "Card Scan",
};

const methodIcons: Record<AttendanceCaptureMethod, React.ComponentType<{ size?: number; className?: string }>> = {
  manual: Users,
  face_recognition: Camera,
  fingerprint: Fingerprint,
  card_scan: IdCard,
};

const campusBrandModules = ["Login", "Topbar", "Dashboards", "Student portal", "Reports"];

function asArray<T>(value: T[] | { results?: T[] }): T[] {
  return Array.isArray(value) ? value : value.results ?? [];
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{message}</p>;
}

function Metric({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="surface p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink text-white">
          <Icon size={18} />
        </div>
      </div>
      <p className="display-font mt-3 text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
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
      <button type="button" onClick={onCancel} className="rounded-lg border border-line/70 px-4 py-2 text-sm font-medium text-ink hover:bg-slate-50">
        Cancel
      </button>
      <button type="submit" disabled={busy} className="flex items-center gap-2 rounded-lg bg-ink px-5 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 disabled:opacity-60">
        {busy ? "Saving..." : label}
      </button>
    </div>
  );
}

function CampusLogoPreview({ campus, className = "" }: { campus: Campus; className?: string }) {
  return (
    <span
      role="img"
      aria-label={campus.logo_alt_text || `${campus.name} logo`}
      className={`block shrink-0 rounded-lg border border-line/70 bg-white bg-contain bg-center bg-no-repeat shadow-sm ${className}`}
      style={{ backgroundImage: `url(${JSON.stringify(campus.logo_url || "/erp-logo-mark.png")})` }}
    />
  );
}

function CampusBrandingWorkspace({
  campuses,
  isSuperAdmin,
  onConfigure,
}: {
  campuses: Campus[];
  isSuperAdmin: boolean;
  onConfigure: (campus: Campus) => void;
}) {
  const configuredCount = campuses.filter((campus) => Boolean(campus.logo_url)).length;

  return (
    <section className="space-y-4">
      <div className="surface overflow-hidden p-5 shadow-soft">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
          <div>
            <span className="section-kicker">
              <Layers3 size={14} />
              Multi-campus branding
            </span>
            <h2 className="mt-3 text-xl font-semibold text-ink">Separate logo identity for every campus</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Super admin can configure each campus logo once, and campus-aware modules use that identity across the ERP workspace.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {campusBrandModules.map((module) => (
                <span key={module} className="inline-flex items-center gap-1 rounded-md border border-line/70 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-muted">
                  <CheckCircle2 size={12} />
                  {module}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-line/70 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Configured</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{configuredCount}</p>
              <p className="mt-1 text-xs text-muted">campus logos</p>
            </div>
            <div className="rounded-lg border border-line/70 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Pending</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{Math.max(campuses.length - configuredCount, 0)}</p>
              <p className="mt-1 text-xs text-muted">using default logo</p>
            </div>
          </div>
        </div>
      </div>

      {!isSuperAdmin && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Campus logo changes are restricted to super admin. Current users can view the configured branding status only.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {campuses.map((campus) => {
          const configured = Boolean(campus.logo_url);
          return (
            <article key={campus.id} className="surface flex min-h-full flex-col p-5 shadow-soft">
              <div className="flex items-start gap-4">
                <CampusLogoPreview campus={campus} className="h-16 w-16" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{campus.name}</p>
                    <Badge variant={configured ? "success" : "neutral"}>{configured ? "configured" : "default"}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{campus.code}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{campus.address || "No campus address added."}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 rounded-lg border border-line/70 bg-slate-50 px-3 py-3 text-xs text-muted">
                <p><span className="font-semibold text-ink">Logo source:</span> {configured ? "Custom campus logo" : "Default ERP logo"}</p>
                <p><span className="font-semibold text-ink">Alt text:</span> {campus.logo_alt_text || `${campus.name} logo`}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {campusBrandModules.slice(0, 4).map((module) => (
                    <span key={module} className="rounded-md border border-line/70 bg-white px-2 py-1 text-[11px] font-medium text-muted">
                      {module}
                    </span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={!isSuperAdmin}
                onClick={() => onConfigure(campus)}
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line/70 bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <PencilLine size={14} />
                {isSuperAdmin ? (configured ? "Update logo" : "Add logo") : "Super admin only"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CampusBrandingForm({
  campus,
  onSave,
  onCancel,
}: {
  campus: Campus;
  onSave: (id: number, data: Pick<Campus, "logo_url" | "logo_alt_text">) => Promise<void>;
  onCancel: () => void;
}) {
  const [logoUrl, setLogoUrl] = useState(campus.logo_url || "");
  const [logoAltText, setLogoAltText] = useState(campus.logo_alt_text || `${campus.name} logo`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previewCampus = { ...campus, logo_url: logoUrl, logo_alt_text: logoAltText };

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      setError("Use PNG, JPG, WEBP, or SVG logo files only.");
      return;
    }
    if (file.size > 500 * 1024) {
      setError("Logo file is too large. Use an image below 500 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoUrl(String(reader.result || ""));
      setError("");
    };
    reader.onerror = () => setError("Logo file could not be read.");
    reader.readAsDataURL(file);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(campus.id, {
        logo_url: logoUrl.trim(),
        logo_alt_text: logoAltText.trim(),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Campus branding could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <ErrorNote message={error} />
      <div className="rounded-lg border border-line/70 bg-slate-50 p-4">
        <div className="flex items-center gap-4">
          <CampusLogoPreview campus={previewCampus} className="h-20 w-20" />
          <div className="min-w-0">
            <p className="font-semibold text-ink">{campus.name}</p>
            <p className="mt-1 text-sm text-muted">{campus.code}</p>
            <p className="mt-2 text-xs leading-5 text-muted">
              This logo is shared by every campus-aware ERP module for this campus only.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink sm:col-span-2">
          Upload logo
          <span className="mt-1.5 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line/90 bg-white px-4 py-4">
            <ImageIcon size={18} className="text-muted" />
            <span className="min-w-0 flex-1 text-sm text-muted">PNG, JPG, WEBP, or SVG below 500 KB. Square transparent logos work best.</span>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleFile} className="max-w-[14rem] text-xs" />
          </span>
        </label>
        <label className="block text-sm font-medium text-ink sm:col-span-2">
          Logo URL or stored data
          <textarea
            className={`mt-1 min-h-24 ${inputCls}`}
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            placeholder="Paste https:// logo URL or upload a logo file"
          />
        </label>
        <label className="block text-sm font-medium text-ink sm:col-span-2">
          Logo alt text
          <input className={`mt-1 ${inputCls}`} value={logoAltText} onChange={(event) => setLogoAltText(event.target.value)} />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4">
        <button
          type="button"
          onClick={() => {
            setLogoUrl("");
            setLogoAltText(`${campus.name} logo`);
            setError("");
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-line/70 px-4 py-2 text-sm font-medium text-ink hover:bg-slate-50"
        >
          <RefreshCcw size={14} />
          Use default logo
        </button>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="rounded-lg border border-line/70 px-4 py-2 text-sm font-medium text-ink hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="flex items-center gap-2 rounded-lg bg-ink px-5 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 disabled:opacity-60">
            {busy ? "Saving..." : "Save campus logo"}
          </button>
        </div>
      </div>
    </form>
  );
}

function MembershipForm({
  campuses,
  users,
  onSave,
  onCancel,
}: {
  campuses: Campus[];
  users: ERPUser[];
  onSave: (data: Omit<CampusMembership, "id" | "campus_name" | "user_name" | "user_role">) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    campus: String(campuses[0]?.id ?? ""),
    user: String(users[0]?.id ?? ""),
    role: "it_admin" as CampusMemberRole,
    is_primary: true,
    can_manage_users: true,
    can_configure_attendance: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({
        campus: Number(form.campus),
        user: Number(form.user),
        role: form.role,
        is_primary: form.is_primary,
        can_manage_users: form.can_manage_users,
        can_configure_attendance: form.can_configure_attendance,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Membership save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">
          Campus
          <select className={`mt-1 ${inputCls}`} value={form.campus} onChange={(e) => setForm((f) => ({ ...f, campus: e.target.value }))} required>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          User
          <select className={`mt-1 ${inputCls}`} value={form.user} onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))} required>
            {users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.username} ({user.role.replace("_", " ")})</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Campus role
          <select className={`mt-1 ${inputCls}`} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as CampusMemberRole }))}>
            <option value="it_admin">School Admin</option>
            <option value="finance_admin">Account</option>
            <option value="teacher">Teacher</option>
            <option value="support">Student Portal</option>
          </select>
        </label>
        <div className="grid content-end gap-2">
          {[
            ["is_primary", "Primary campus"],
            ["can_manage_users", "Can manage users"],
            ["can_configure_attendance", "Can configure attendance"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={Boolean(form[key as keyof typeof form])}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <FormActions busy={busy} label="Save membership" onCancel={onCancel} />
    </form>
  );
}

function SubjectAllocationForm({
  campuses,
  sections,
  users,
  onSave,
  onCancel,
}: {
  campuses: Campus[];
  sections: ClassSection[];
  users: ERPUser[];
  onSave: (data: Omit<TeacherSubjectAllocation, "id" | "campus_name" | "section_label" | "teacher_name">) => Promise<void>;
  onCancel: () => void;
}) {
  const teachers = users.filter((item) => item.role === "teacher");
  const [form, setForm] = useState({
    campus: String(campuses[0]?.id ?? ""),
    section: "",
    teacher: String(teachers[0]?.id ?? ""),
    subject: "",
    weekly_periods: "5",
    is_active: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const campusSections = useMemo(
    () => sections.filter((section) => String(section.campus) === form.campus),
    [form.campus, sections],
  );

  useEffect(() => {
    if (!campusSections.length) {
      if (form.section) setForm((current) => ({ ...current, section: "" }));
      return;
    }
    if (!campusSections.some((section) => String(section.id) === form.section)) {
      setForm((current) => ({ ...current, section: String(campusSections[0].id) }));
    }
  }, [campusSections, form.section]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({
        campus: Number(form.campus),
        section: Number(form.section),
        teacher: Number(form.teacher),
        subject: form.subject.trim(),
        weekly_periods: Number(form.weekly_periods || 0),
        is_active: form.is_active,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Subject allocation save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">
          Campus
          <select className={`mt-1 ${inputCls}`} value={form.campus} onChange={(e) => setForm((f) => ({ ...f, campus: e.target.value }))} required>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Class / Section
          <select className={`mt-1 ${inputCls}`} value={form.section} onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))} required>
            {campusSections.length === 0 && <option value="">No sections</option>}
            {campusSections.map((section) => <option key={section.id} value={section.id}>{section.grade_name} - {section.section_name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Teacher
          <select className={`mt-1 ${inputCls}`} value={form.teacher} onChange={(e) => setForm((f) => ({ ...f, teacher: e.target.value }))} required>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name || teacher.username}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Subject
          <input className={`mt-1 ${inputCls}`} value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Mathematics" required />
        </label>
        <label className="block text-sm font-medium text-ink">
          Weekly periods
          <input className={`mt-1 ${inputCls}`} type="number" min={0} max={60} value={form.weekly_periods} onChange={(e) => setForm((f) => ({ ...f, weekly_periods: e.target.value }))} />
        </label>
        <label className="flex items-end gap-2 pb-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
          Active allocation
        </label>
      </div>
      <FormActions busy={busy} label="Save allocation" onCancel={onCancel} />
    </form>
  );
}

function StaffAttendanceForm({
  campuses,
  users,
  devices,
  onSave,
  onCancel,
}: {
  campuses: Campus[];
  users: ERPUser[];
  devices: AttendanceDevice[];
  onSave: (data: Omit<StaffAttendanceRecord, "id" | "marked_by" | "marked_by_name" | "campus_name" | "staff_name" | "staff_role" | "device_name">) => Promise<void>;
  onCancel: () => void;
}) {
  const staffUsers = users.filter((user) => user.role !== "student");
  const [form, setForm] = useState({
    campus: String(campuses[0]?.id ?? ""),
    staff_user: String(staffUsers[0]?.id ?? ""),
    date: todayISO(),
    clock_in: "08:00",
    clock_out: "",
    status: "present" as StaffAttendanceStatus,
    capture_method: "manual" as AttendanceCaptureMethod,
    device: "",
    source_reference: "",
    confidence_score: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const campusDevices = devices.filter((device) => String(device.campus) === form.campus && device.is_enabled_for_staff);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({
        campus: Number(form.campus),
        staff_user: Number(form.staff_user),
        date: form.date,
        clock_in: form.clock_in || null,
        clock_out: form.clock_out || null,
        status: form.status,
        capture_method: form.capture_method,
        device: form.device ? Number(form.device) : null,
        source_reference: form.source_reference,
        confidence_score: form.confidence_score || null,
        notes: form.notes,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Staff attendance save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">
          Campus
          <select className={`mt-1 ${inputCls}`} value={form.campus} onChange={(e) => setForm((f) => ({ ...f, campus: e.target.value, device: "" }))}>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Staff user
          <select className={`mt-1 ${inputCls}`} value={form.staff_user} onChange={(e) => setForm((f) => ({ ...f, staff_user: e.target.value }))}>
            {staffUsers.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.username} ({user.role.replace("_", " ")})</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Date
          <input type="date" className={`mt-1 ${inputCls}`} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
        </label>
        <label className="block text-sm font-medium text-ink">
          Status
          <select className={`mt-1 ${inputCls}`} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as StaffAttendanceStatus }))}>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="half_day">Half Day</option>
            <option value="on_leave">On Leave</option>
            <option value="absent">Absent</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Clock in
          <input type="time" className={`mt-1 ${inputCls}`} value={form.clock_in} onChange={(e) => setForm((f) => ({ ...f, clock_in: e.target.value }))} />
        </label>
        <label className="block text-sm font-medium text-ink">
          Clock out
          <input type="time" className={`mt-1 ${inputCls}`} value={form.clock_out} onChange={(e) => setForm((f) => ({ ...f, clock_out: e.target.value }))} />
        </label>
        <label className="block text-sm font-medium text-ink">
          Capture method
          <select className={`mt-1 ${inputCls}`} value={form.capture_method} onChange={(e) => setForm((f) => ({ ...f, capture_method: e.target.value as AttendanceCaptureMethod }))}>
            <option value="manual">Manual</option>
            <option value="face_recognition">Face Recognition</option>
            <option value="fingerprint">Fingerprint</option>
            <option value="card_scan">Card Scan</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Device
          <select className={`mt-1 ${inputCls}`} value={form.device} onChange={(e) => setForm((f) => ({ ...f, device: e.target.value }))}>
            <option value="">Manual entry</option>
            {campusDevices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Source reference
          <input className={`mt-1 ${inputCls}`} value={form.source_reference} onChange={(e) => setForm((f) => ({ ...f, source_reference: e.target.value }))} placeholder="hardware event id" />
        </label>
        <label className="block text-sm font-medium text-ink">
          Confidence
          <input type="number" min="0" max="100" step="0.01" className={`mt-1 ${inputCls}`} value={form.confidence_score} onChange={(e) => setForm((f) => ({ ...f, confidence_score: e.target.value }))} placeholder="98.50" />
        </label>
        <label className="block text-sm font-medium text-ink sm:col-span-2">
          Notes
          <input className={`mt-1 ${inputCls}`} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </label>
      </div>
      <FormActions busy={busy} label="Save attendance" onCancel={onCancel} />
    </form>
  );
}

function ApprovalForm({
  campuses,
  onSave,
  onCancel,
}: {
  campuses: Campus[];
  onSave: (data: Omit<ApprovalRequest, "id" | "status" | "requested_by" | "requested_by_name" | "reviewed_by" | "reviewed_by_name" | "decided_at" | "decision_note">) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    campus: String(campuses[0]?.id ?? ""),
    title: "",
    entity_type: "Student",
    entity_id: "",
    description: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({
        campus: Number(form.campus),
        title: form.title,
        entity_type: form.entity_type,
        entity_id: form.entity_id,
        description: form.description,
        payload: {},
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Approval request save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">
          Campus
          <select className={`mt-1 ${inputCls}`} value={form.campus} onChange={(e) => setForm((f) => ({ ...f, campus: e.target.value }))}>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Entity type
          <select className={`mt-1 ${inputCls}`} value={form.entity_type} onChange={(e) => setForm((f) => ({ ...f, entity_type: e.target.value }))}>
            <option value="Student">Student</option>
            <option value="StaffAttendanceRecord">Staff Attendance</option>
            <option value="FeeAssignment">Fee Assignment</option>
            <option value="AttendanceDevice">Attendance Device</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-ink sm:col-span-2">
          Title
          <input className={`mt-1 ${inputCls}`} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
        </label>
        <label className="block text-sm font-medium text-ink">
          Entity ID
          <input className={`mt-1 ${inputCls}`} value={form.entity_id} onChange={(e) => setForm((f) => ({ ...f, entity_id: e.target.value }))} placeholder="ADM-2026-001" />
        </label>
        <label className="block text-sm font-medium text-ink sm:col-span-2">
          Description
          <textarea className={`mt-1 min-h-24 ${inputCls}`} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </label>
      </div>
      <FormActions busy={busy} label="Create request" onCancel={onCancel} />
    </form>
  );
}

export function CampusControlPanel() {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<ControlView>("branding");
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [users, setUsers] = useState<ERPUser[]>([]);
  const [memberships, setMemberships] = useState<CampusMembership[]>([]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [subjectAllocations, setSubjectAllocations] = useState<TeacherSubjectAllocation[]>([]);
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [staffAttendance, setStaffAttendance] = useState<StaffAttendanceRecord[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ControlView | null>(null);
  const [deviceToEdit, setDeviceToEdit] = useState<AttendanceDevice | null>(null);
  const [brandingCampus, setBrandingCampus] = useState<Campus | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [campusRes, userRes, membershipRes, sectionRes, allocationRes, deviceRes, staffRes, approvalRes] = await Promise.all([
        campusApi.list(),
        userApi.list(),
        campusMembershipApi.list(),
        sectionApi.list(),
        teacherSubjectAllocationApi.list(),
        attendanceDeviceApi.list(),
        staffAttendanceApi.list(),
        approvalRequestApi.list(),
      ]);
      setCampuses(asArray(campusRes));
      setUsers(asArray(userRes));
      setMemberships(asArray(membershipRes));
      setSections(asArray(sectionRes));
      setSubjectAllocations(asArray(allocationRes));
      setDevices(asArray(deviceRes));
      setStaffAttendance(asArray(staffRes));
      setApprovals(asArray(approvalRes));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load campus control data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const staffUsers = useMemo(() => users.filter((user) => user.role === "teacher" || user.role === "school_admin"), [users]);
  const isSuperAdmin = user?.role === "super_admin";
  const activeDevices = devices.filter((device) => device.status === "active").length;
  const activeSubjectAllocations = subjectAllocations.filter((allocation) => allocation.is_active).length;
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending").length;

  async function refreshAfterSave() {
    setModal(null);
    setDeviceToEdit(null);
    setBrandingCampus(null);
    await load();
  }

  async function removeMembership(id: number) {
    if (!confirm("Remove this campus membership?")) return;
    await campusMembershipApi.remove(id);
    await load();
  }

  async function removeDevice(id: number) {
    if (!confirm("Remove this attendance device?")) return;
    await attendanceDeviceApi.remove(id);
    await load();
  }

  async function removeSubjectAllocation(id: number) {
    if (!confirm("Remove this teacher subject allocation?")) return;
    await teacherSubjectAllocationApi.remove(id);
    await load();
  }

  async function decideApproval(id: number, action: "approve" | "reject") {
    if (action === "approve") await approvalRequestApi.approve(id);
    else await approvalRequestApi.reject(id);
    await load();
  }

  if (loading) {
    return <WorkspacePlaceholder title="Campus control" detail="Preparing branding, users, devices, and approvals." />;
  }

  return (
    <div className="space-y-6">
      <section className="surface p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="section-kicker">
              <ShieldCheck size={14} />
              Campus control
            </span>
            <h1 className="display-font mt-3 text-3xl font-semibold text-ink">Institution operations and access</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
              Manage campus-specific branding, school admins, account access, attendance hardware, teacher attendance records, and approval requests from one operational surface.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-2 rounded-lg border border-line/70 bg-white px-4 py-2 text-sm font-medium text-muted hover:bg-slate-50 hover:text-ink"
          >
            <RefreshCcw size={14} />
            Refresh
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
          <button className="ml-2 underline" onClick={load}>Retry</button>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Campuses" value={campuses.length} note="campus-scoped ERP records" icon={Building2} />
        <Metric label="Campus admins" value={memberships.filter((item) => item.can_manage_users).length} note={`${memberships.length} total memberships`} icon={ShieldCheck} />
        <Metric label="Subject allotments" value={activeSubjectAllocations} note={`${subjectAllocations.length} teacher mappings`} icon={BookOpen} />
        <Metric label="Active devices" value={activeDevices} note={`${devices.length} hardware profiles`} icon={Cpu} />
        <Metric label="Pending approvals" value={pendingApprovals} note={`${approvals.length} requests in queue`} icon={CheckCircle2} />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {views.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveView(id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeView === id ? "bg-ink text-white shadow" : "border border-line/70 bg-white text-muted hover:bg-slate-50 hover:text-ink"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
        {activeView !== "branding" && (
          <button
            type="button"
            onClick={() => {
              if (activeView === "devices") setDeviceToEdit(null);
              setModal(activeView);
            }}
            className="ml-auto flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5"
          >
            <Plus size={14} />
            New
          </button>
        )}
      </div>

      {activeView === "branding" && (
        <CampusBrandingWorkspace
          campuses={campuses}
          isSuperAdmin={isSuperAdmin}
          onConfigure={(campus) => {
            setBrandingCampus(campus);
            setModal("branding");
          }}
        />
      )}

      {activeView === "members" && (
        <div className="surface overflow-hidden shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/60 bg-slate-50">
                  {["User", "System role", "Campus", "Campus role", "Capabilities", "Actions"].map((head) => (
                    <th key={head} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {memberships.map((membership) => (
                  <tr key={membership.id} className="border-b border-line/40 hover:bg-slate-50/60">
                    <td className="px-5 py-3.5 font-semibold text-ink">{membership.user_name}</td>
                    <td className="px-5 py-3.5 text-muted">{membership.user_role?.replace("_", " ")}</td>
                    <td className="px-5 py-3.5 text-muted">{membership.campus_name}</td>
                    <td className="px-5 py-3.5"><Badge variant="info">{membership.role.replace("_", " ")}</Badge></td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-2">
                        {membership.is_primary && <Badge variant="success">primary</Badge>}
                        {membership.can_manage_users && <Badge variant="purple">users</Badge>}
                        {membership.can_configure_attendance && <Badge variant="warning">attendance</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <button type="button" onClick={() => removeMembership(membership.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50">
                        <Trash2 size={12} />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {memberships.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-muted">No campus memberships configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeView === "subjects" && (
        <div className="surface overflow-hidden shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/60 bg-slate-50">
                  {["Teacher", "Campus", "Class / Section", "Subject", "Weekly periods", "Status", "Actions"].map((head) => (
                    <th key={head} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subjectAllocations.map((allocation) => (
                  <tr key={allocation.id} className="border-b border-line/40 hover:bg-slate-50/60">
                    <td className="px-5 py-3.5 font-semibold text-ink">{allocation.teacher_name}</td>
                    <td className="px-5 py-3.5 text-muted">{allocation.campus_name}</td>
                    <td className="px-5 py-3.5 text-muted">{allocation.section_label}</td>
                    <td className="px-5 py-3.5"><Badge variant="info">{allocation.subject}</Badge></td>
                    <td className="px-5 py-3.5 text-muted">{allocation.weekly_periods}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant={allocation.is_active ? "success" : "neutral"}>{allocation.is_active ? "active" : "inactive"}</Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <button type="button" onClick={() => removeSubjectAllocation(allocation.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50">
                        <Trash2 size={12} />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {subjectAllocations.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-12 text-center text-muted">No teacher subject allocations configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeView === "devices" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {devices.map((device) => {
            const Icon = methodIcons[device.device_type];
            const serverTarget = device.use_domain_name ? device.domain_name : device.server_ip;
            return (
              <article key={device.id} className="surface p-5 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                      <Icon size={18} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-ink">{device.name}</h3>
                      <p className="mt-1 font-mono text-xs text-muted">{device.device_code}</p>
                    </div>
                  </div>
                  <Badge variant={statusBadge(device.status)}>{device.status}</Badge>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-muted">
                  <p>{device.campus_name}</p>
                  <p>{captureLabels[device.device_type]} - {device.location || "No location"}</p>
                  <p>Students: {device.is_enabled_for_students ? "enabled" : "disabled"} / Staff: {device.is_enabled_for_staff ? "enabled" : "disabled"}</p>
                  <div className="rounded-lg border border-line/70 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                    <p><span className="font-semibold text-ink">Server:</span> {serverTarget || "not configured"}:{device.server_port || "-"}</p>
                    <p><span className="font-semibold text-ink">Heartbeat:</span> {device.heartbeat_seconds || "-"} sec / Approval: {device.server_approval_required ? "Yes" : "No"}</p>
                    <p><span className="font-semibold text-ink">Comm:</span> ID {device.device_numeric_id || "-"}, Port {device.local_port || "-"}, Baud {device.baud_rate || "-"}</p>
                    <p><span className="font-semibold text-ink">RS485:</span> {device.rs485_function || "software"}</p>
                  </div>
                  <p>Last seen: {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString("en-IN") : "not reported"}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeviceToEdit(device);
                      setModal("devices");
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-line/70 px-3 py-1.5 text-xs font-medium text-ink hover:bg-slate-50"
                  >
                    <PencilLine size={12} />
                    Configure
                  </button>
                  <button type="button" onClick={() => removeDevice(device.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50">
                    <Trash2 size={12} />
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
          {devices.length === 0 && (
            <div className="surface p-8 text-center text-sm text-muted shadow-soft md:col-span-2 xl:col-span-3">No attendance hardware profiles configured.</div>
          )}
        </div>
      )}

      {activeView === "staff" && (
        <div className="surface overflow-hidden shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/60 bg-slate-50">
                  {["Date", "Staff", "Campus", "Status", "Time", "Source", "Device"].map((head) => (
                    <th key={head} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffAttendance.map((record) => (
                  <tr key={record.id} className="border-b border-line/40 hover:bg-slate-50/60">
                    <td className="px-5 py-3.5 text-ink">{record.date}</td>
                    <td className="px-5 py-3.5 font-semibold text-ink">{record.staff_name}</td>
                    <td className="px-5 py-3.5 text-muted">{record.campus_name}</td>
                    <td className="px-5 py-3.5"><Badge variant={statusBadge(record.status)}>{record.status.replace("_", " ")}</Badge></td>
                    <td className="px-5 py-3.5 text-muted">{record.clock_in || "-"} to {record.clock_out || "-"}</td>
                    <td className="px-5 py-3.5 text-muted">{captureLabels[record.capture_method]}</td>
                    <td className="px-5 py-3.5 text-muted">{record.device_name || "Manual"}</td>
                  </tr>
                ))}
                {staffAttendance.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-12 text-center text-muted">No staff attendance records yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeView === "approvals" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {approvals.map((approval) => (
            <article key={approval.id} className="surface p-5 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{approval.campus_name}</p>
                  <h3 className="mt-1 font-semibold text-ink">{approval.title}</h3>
                  <p className="mt-1 text-sm text-muted">{approval.entity_type}{approval.entity_id ? ` - ${approval.entity_id}` : ""}</p>
                </div>
                <Badge variant={statusBadge(approval.status)}>{approval.status}</Badge>
              </div>
              {approval.description && <p className="mt-3 text-sm leading-6 text-muted">{approval.description}</p>}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                <span>Requested by {approval.requested_by_name || "System"}</span>
                <span>{approval.created_at ? new Date(approval.created_at).toLocaleString("en-IN") : ""}</span>
              </div>
              {approval.status === "pending" && (
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => decideApproval(approval.id, "approve")} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                    <CheckCircle2 size={12} />
                    Approve
                  </button>
                  <button type="button" onClick={() => decideApproval(approval.id, "reject")} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100">
                    <XCircle size={12} />
                    Reject
                  </button>
                </div>
              )}
            </article>
          ))}
          {approvals.length === 0 && (
            <div className="surface p-8 text-center text-sm text-muted shadow-soft lg:col-span-2">No approval requests yet.</div>
          )}
        </div>
      )}

      <Modal
        open={modal === "branding" && Boolean(brandingCampus)}
        onClose={() => {
          setBrandingCampus(null);
          setModal(null);
        }}
        title="Configure Campus Branding"
        size="lg"
      >
        {brandingCampus && (
          <CampusBrandingForm
            campus={brandingCampus}
            onSave={async (id, data) => {
              await campusApi.update(id, data);
              await refreshAfterSave();
            }}
            onCancel={() => {
              setBrandingCampus(null);
              setModal(null);
            }}
          />
        )}
      </Modal>

      <Modal open={modal === "members"} onClose={() => setModal(null)} title="Add Campus Membership" size="lg">
        <MembershipForm campuses={campuses} users={users} onSave={async (data) => {
          await campusMembershipApi.create(data);
          await refreshAfterSave();
        }} onCancel={() => setModal(null)} />
      </Modal>

      <Modal open={modal === "subjects"} onClose={() => setModal(null)} title="Allot Teacher Subject" size="lg">
        <SubjectAllocationForm campuses={campuses} sections={sections} users={users} onSave={async (data) => {
          await teacherSubjectAllocationApi.create(data);
          await refreshAfterSave();
        }} onCancel={() => setModal(null)} />
      </Modal>

      <Modal
        open={modal === "devices"}
        onClose={() => {
          setDeviceToEdit(null);
          setModal(null);
        }}
        title={deviceToEdit ? "Configure Attendance Device" : "Add Attendance Device"}
        size="xl"
      >
        <HardwareDeviceConfiguration campuses={campuses} device={deviceToEdit} onSave={async (data: AttendanceDeviceConfigurationPayload) => {
          if (deviceToEdit) await attendanceDeviceApi.update(deviceToEdit.id, data);
          else await attendanceDeviceApi.create(data);
          await refreshAfterSave();
        }} onCancel={() => {
          setDeviceToEdit(null);
          setModal(null);
        }} />
      </Modal>

      <Modal open={modal === "staff"} onClose={() => setModal(null)} title="Record Staff Attendance" size="lg">
        <StaffAttendanceForm campuses={campuses} users={staffUsers} devices={devices} onSave={async (data) => {
          await staffAttendanceApi.create(data);
          await refreshAfterSave();
        }} onCancel={() => setModal(null)} />
      </Modal>

      <Modal open={modal === "approvals"} onClose={() => setModal(null)} title="Create Approval Request" size="lg">
        <ApprovalForm campuses={campuses} onSave={async (data) => {
          await approvalRequestApi.create(data);
          await refreshAfterSave();
        }} onCancel={() => setModal(null)} />
      </Modal>
    </div>
  );
}
