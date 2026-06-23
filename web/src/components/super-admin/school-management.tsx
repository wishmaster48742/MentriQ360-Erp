"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  DatabaseZap,
  Image as ImageIcon,
  LockKeyhole,
  PencilLine,
  Plus,
  RefreshCcw,
  School as SchoolIcon,
  ShieldCheck,
  Upload,
  Users,
  XCircle,
} from "lucide-react";

import { LoginPage } from "@/components/auth/login-page";
import { BrandLogo } from "@/components/brand-logo";
import { Badge, statusBadge } from "@/components/ui/badge";
import { WorkspacePlaceholder } from "@/components/ui/workspace-placeholder";
import { useAuth } from "@/lib/auth-context";
import {
  ApiError,
  schoolApi,
  type School,
  type SchoolAdminCredentials,
  type SchoolPayload,
  type SchoolStatus,
} from "@/lib/api";

export type SuperAdminSchoolView = "dashboard" | "list" | "add" | "details" | "edit" | "admin" | "branding";

const inputCls =
  "w-full rounded-lg border border-line/80 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

const navLinks: { href: Route; label: string }[] = [
  { href: "/dashboard/super-admin", label: "Dashboard" },
  { href: "/dashboard/super-admin/schools", label: "Schools" },
  { href: "/dashboard/super-admin/schools/new", label: "Add School" },
];

function route(path: string): Route {
  return path as Route;
}

function asArray<T>(value: T[] | { results?: T[] }): T[] {
  return Array.isArray(value) ? value : value.results ?? [];
}

function blankSchoolForm(): SchoolPayload {
  return {
    schoolName: "",
    logo: "",
    bannerImage: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    contactNumber: "",
    email: "",
    website: "",
    principalName: "",
    status: "active",
    subscriptionStatus: "trial",
    databaseName: "",
    tenantId: "",
    adminUsername: "",
    adminEmail: "",
    adminFirstName: "",
    adminLastName: "",
    adminContactNumber: "",
  };
}

function formFromSchool(school: School): SchoolPayload {
  return {
    schoolName: school.schoolName,
    logo: school.logo || "",
    bannerImage: school.bannerImage || "",
    address: school.address || "",
    city: school.city || "",
    state: school.state || "",
    pincode: school.pincode || "",
    contactNumber: school.contactNumber || "",
    email: school.email || "",
    website: school.website || "",
    principalName: school.principalName || "",
    status: school.status,
    subscriptionStatus: school.subscriptionStatus || "",
    databaseName: school.databaseName || "",
    tenantId: school.tenantId || "",
  };
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleDateString("en-IN") : "";
}

function connectionLabel(school: School) {
  const status = school.databaseConnectionStatus;
  if (!status) return "Hidden";
  if (!status.configured) return "Not configured";
  return status.connected ? "Connected" : "Failed";
}

function connectionTone(school: School): ReturnType<typeof statusBadge> {
  const status = school.databaseConnectionStatus;
  if (!status) return "neutral";
  if (!status.configured || !status.connected) return "danger";
  return "success";
}

function PageHeader({
  title,
  detail,
  actions,
}: {
  title: string;
  detail: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="surface p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="section-kicker">
            <ShieldCheck size={14} />
            Super Admin
          </span>
          <h1 className="display-font mt-3 text-3xl font-semibold text-ink">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">{detail}</p>
        </div>
        {actions}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="surface p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink text-white">
          <Icon size={18} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>;
}

function CredentialsPanel({ credentials }: { credentials: SchoolAdminCredentials | null }) {
  if (!credentials) return null;
  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      <div className="flex items-start gap-3">
        <LockKeyhole size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Temporary school admin credentials</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <p><span className="font-semibold">Username:</span> {credentials.username}</p>
            <p><span className="font-semibold">Email:</span> {credentials.email || "Not set"}</p>
            <p><span className="font-semibold">Password:</span> <span className="font-mono">{credentials.temporaryPassword}</span></p>
          </div>
          <p className="mt-2 text-xs">The user must change this password on first login.</p>
        </div>
      </div>
    </section>
  );
}

function SchoolForm({
  initial,
  includeAdmin,
  submitLabel,
  onSubmit,
}: {
  initial?: School;
  includeAdmin: boolean;
  submitLabel: string;
  onSubmit: (payload: SchoolPayload) => Promise<void>;
}) {
  const [form, setForm] = useState<SchoolPayload>(() => (initial ? formFromSchool(initial) : blankSchoolForm()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initial) setForm(formFromSchool(initial));
  }, [initial]);

  function setField<K extends keyof SchoolPayload>(key: K, value: SchoolPayload[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "School save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <ErrorNote message={error} />
      <div className="surface p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-ink">School Details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-ink">
            School name *
            <input className={`mt-1 ${inputCls}`} value={form.schoolName} onChange={(event) => setField("schoolName", event.target.value)} required />
          </label>
          <label className="block text-sm font-medium text-ink">
            Principal name
            <input className={`mt-1 ${inputCls}`} value={form.principalName || ""} onChange={(event) => setField("principalName", event.target.value)} />
          </label>
          <label className="block text-sm font-medium text-ink md:col-span-2">
            Address
            <textarea className={`mt-1 min-h-20 ${inputCls}`} value={form.address || ""} onChange={(event) => setField("address", event.target.value)} />
          </label>
          <label className="block text-sm font-medium text-ink">
            City
            <input className={`mt-1 ${inputCls}`} value={form.city || ""} onChange={(event) => setField("city", event.target.value)} />
          </label>
          <label className="block text-sm font-medium text-ink">
            State
            <input className={`mt-1 ${inputCls}`} value={form.state || ""} onChange={(event) => setField("state", event.target.value)} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Pincode
            <input className={`mt-1 ${inputCls}`} value={form.pincode || ""} onChange={(event) => setField("pincode", event.target.value)} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Contact number
            <input className={`mt-1 ${inputCls}`} value={form.contactNumber || ""} onChange={(event) => setField("contactNumber", event.target.value)} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Email
            <input type="email" className={`mt-1 ${inputCls}`} value={form.email || ""} onChange={(event) => setField("email", event.target.value)} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Website
            <input className={`mt-1 ${inputCls}`} value={form.website || ""} onChange={(event) => setField("website", event.target.value)} placeholder="https://school.example.com" />
          </label>
          <label className="block text-sm font-medium text-ink">
            School status
            <select className={`mt-1 ${inputCls}`} value={form.status || "active"} onChange={(event) => setField("status", event.target.value as SchoolStatus)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-ink">
            Subscription status
            <select className={`mt-1 ${inputCls}`} value={form.subscriptionStatus || "trial"} onChange={(event) => setField("subscriptionStatus", event.target.value)}>
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="past_due">Past due</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-ink">
            Tenant alias
            <input className={`mt-1 ${inputCls}`} value={form.tenantId || ""} onChange={(event) => setField("tenantId", event.target.value)} placeholder="Optional separate DB alias" />
          </label>
          <label className="block text-sm font-medium text-ink">
            Database name
            <input className={`mt-1 ${inputCls}`} value={form.databaseName || ""} onChange={(event) => setField("databaseName", event.target.value)} placeholder="Optional operator reference" />
          </label>
        </div>
      </div>

      {includeAdmin && (
        <div className="surface p-5 shadow-soft">
          <h2 className="text-lg font-semibold text-ink">School Admin Login</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-ink">
              Admin username
              <input className={`mt-1 ${inputCls}`} value={form.adminUsername || ""} onChange={(event) => setField("adminUsername", event.target.value)} placeholder="Auto generated if blank" />
            </label>
            <label className="block text-sm font-medium text-ink">
              Admin email
              <input type="email" className={`mt-1 ${inputCls}`} value={form.adminEmail || ""} onChange={(event) => setField("adminEmail", event.target.value)} />
            </label>
            <label className="block text-sm font-medium text-ink">
              First name
              <input className={`mt-1 ${inputCls}`} value={form.adminFirstName || ""} onChange={(event) => setField("adminFirstName", event.target.value)} />
            </label>
            <label className="block text-sm font-medium text-ink">
              Last name
              <input className={`mt-1 ${inputCls}`} value={form.adminLastName || ""} onChange={(event) => setField("adminLastName", event.target.value)} />
            </label>
            <label className="block text-sm font-medium text-ink md:col-span-2">
              Contact number
              <input className={`mt-1 ${inputCls}`} value={form.adminContactNumber || ""} onChange={(event) => setField("adminContactNumber", event.target.value)} />
            </label>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Link href="/dashboard/super-admin/schools" className="inline-flex items-center rounded-lg border border-line/70 px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50">
          Cancel
        </Link>
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-2 text-sm font-semibold text-white shadow-soft disabled:opacity-60">
          {busy ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function SchoolList({
  schools,
  onRefresh,
  onStatus,
}: {
  schools: School[];
  onRefresh: () => void;
  onStatus: (school: School, action: "activate" | "deactivate" | "suspend") => Promise<void>;
}) {
  return (
    <section className="surface overflow-hidden shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-4 py-4">
        <h2 className="text-lg font-semibold text-ink">School List</h2>
        <button type="button" onClick={onRefresh} className="inline-flex items-center gap-2 rounded-lg border border-line/70 px-3 py-2 text-sm font-semibold text-ink hover:bg-slate-50">
          <RefreshCcw size={14} />
          Refresh
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {["School", "Status", "Subscription", "Connection", "Students", "Teachers", "Staff", "Actions"].map((head) => (
                <th key={head} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-muted">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schools.map((school) => (
              <tr key={school.schoolId} className="border-b border-line/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="block h-11 w-11 shrink-0 rounded-lg border border-line/70 bg-white bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url(${JSON.stringify(school.logo || "/erp-logo-mark.png")})` }}
                    />
                    <span>
                      <span className="block font-semibold text-ink">{school.schoolName}</span>
                      <span className="block font-mono text-xs text-muted">{school.schoolCode}</span>
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3"><Badge variant={statusBadge(school.status)}>{school.status}</Badge></td>
                <td className="px-4 py-3"><Badge variant={school.subscriptionStatus === "active" ? "success" : "warning"}>{school.subscriptionStatus || "not set"}</Badge></td>
                <td className="px-4 py-3"><Badge variant={connectionTone(school)}>{connectionLabel(school)}</Badge></td>
                <td className="px-4 py-3 text-muted">{school.totalStudents}</td>
                <td className="px-4 py-3 text-muted">{school.totalTeachers}</td>
                <td className="px-4 py-3 text-muted">{school.totalStaff}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link href={route(`/dashboard/super-admin/schools/${school.schoolId}`)} className="rounded-lg border border-line/70 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50">View</Link>
                    <Link href={route(`/dashboard/super-admin/schools/${school.schoolId}/edit`)} className="rounded-lg border border-line/70 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50">Edit</Link>
                    <button type="button" onClick={() => onStatus(school, school.status === "active" ? "deactivate" : "activate")} className="rounded-lg border border-line/70 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50">
                      {school.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                    <button type="button" onClick={() => onStatus(school, "suspend")} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                      Suspend
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!schools.length && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-muted">No schools have been created yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SchoolDetails({ school }: { school: School }) {
  const status = school.databaseConnectionStatus;
  return (
    <div className="space-y-5">
      <section className="surface overflow-hidden shadow-soft">
        {school.bannerImage && (
          <div className="h-44 bg-slate-100 bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(school.bannerImage)})` }} />
        )}
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <span className="block h-20 w-20 rounded-lg border border-line/70 bg-white bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(school.logo || "/erp-logo-mark.png")})` }} />
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted">{school.schoolCode}</p>
                <h2 className="mt-1 text-2xl font-semibold text-ink">{school.schoolName}</h2>
                <p className="mt-2 text-sm text-muted">{school.address || "Address not configured."}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={statusBadge(school.status)}>{school.status}</Badge>
              <Badge variant={school.subscriptionStatus === "active" ? "success" : "warning"}>{school.subscriptionStatus || "subscription not set"}</Badge>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Students" value={school.totalStudents} icon={Users} />
        <Metric label="Teachers" value={school.totalTeachers} icon={SchoolIcon} />
        <Metric label="Staff" value={school.totalStaff} icon={BadgeCheck} />
        <Metric label="Admins" value={school.schoolAdmins} icon={ShieldCheck} />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="surface p-5 shadow-soft">
          <h3 className="text-lg font-semibold text-ink">School Profile</h3>
          <dl className="mt-4 grid gap-3 text-sm">
            <div><dt className="font-semibold text-muted">Principal</dt><dd className="text-ink">{school.principalName || "Not set"}</dd></div>
            <div><dt className="font-semibold text-muted">Contact</dt><dd className="text-ink">{school.contactNumber || "Not set"}</dd></div>
            <div><dt className="font-semibold text-muted">Email</dt><dd className="text-ink">{school.email || "Not set"}</dd></div>
            <div><dt className="font-semibold text-muted">Website</dt><dd className="text-ink">{school.website || "Not set"}</dd></div>
            <div><dt className="font-semibold text-muted">Created</dt><dd className="text-ink">{formatDate(school.createdAt)}</dd></div>
          </dl>
        </div>
        <div className="surface p-5 shadow-soft">
          <h3 className="text-lg font-semibold text-ink">Tenant Connection</h3>
          <div className="mt-4 rounded-lg border border-line/70 bg-slate-50 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-ink">{connectionLabel(school)}</span>
              <Badge variant={connectionTone(school)}>{status?.mode || "hidden"}</Badge>
            </div>
            <p className="mt-3 text-muted">{status?.detail || "Connection details are visible only to Super Admin."}</p>
            {status && (
              <div className="mt-3 grid gap-2 font-mono text-xs text-muted">
                <p>Alias: {status.alias}</p>
                <p>Database: {status.databaseName || school.databaseName || "default"}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href={route(`/dashboard/super-admin/schools/${school.schoolId}/edit`)} className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">
          <PencilLine size={14} />
          Edit School
        </Link>
        <Link href={route(`/dashboard/super-admin/schools/${school.schoolId}/admin`)} className="inline-flex items-center gap-2 rounded-lg border border-line/70 px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50">
          <ShieldCheck size={14} />
          Create Admin
        </Link>
        <Link href={route(`/dashboard/super-admin/schools/${school.schoolId}/branding`)} className="inline-flex items-center gap-2 rounded-lg border border-line/70 px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50">
          <ImageIcon size={14} />
          Branding
        </Link>
      </div>
    </div>
  );
}

function BrandingUpload({ school, onRefresh }: { school: School; onRefresh: () => Promise<void> }) {
  const [logo, setLogo] = useState<File | null>(null);
  const [banner, setBanner] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(kind: "logo" | "banner") {
    const file = kind === "logo" ? logo : banner;
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "logo") await schoolApi.uploadLogo(school.schoolId, file, `${school.schoolName} logo`);
      else await schoolApi.uploadBanner(school.schoolId, file);
      await onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <ErrorNote message={error} />
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="surface p-5 shadow-soft">
          <h2 className="text-lg font-semibold text-ink">Logo</h2>
          <span className="mt-4 block h-28 w-28 rounded-lg border border-line/70 bg-white bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(school.logo || "/erp-logo-mark.png")})` }} />
          <label className="mt-4 block text-sm font-medium text-ink">
            Upload logo
            <input className="mt-2 block w-full text-sm" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => setLogo(event.target.files?.[0] ?? null)} />
          </label>
          <button type="button" disabled={!logo || busy} onClick={() => upload("logo")} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            <Upload size={14} />
            Upload logo
          </button>
        </div>
        <div className="surface p-5 shadow-soft">
          <h2 className="text-lg font-semibold text-ink">Banner</h2>
          <div className="mt-4 h-28 rounded-lg border border-line/70 bg-slate-100 bg-cover bg-center" style={{ backgroundImage: school.bannerImage ? `url(${JSON.stringify(school.bannerImage)})` : undefined }} />
          <label className="mt-4 block text-sm font-medium text-ink">
            Upload banner
            <input className="mt-2 block w-full text-sm" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setBanner(event.target.files?.[0] ?? null)} />
          </label>
          <button type="button" disabled={!banner || busy} onClick={() => upload("banner")} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            <Upload size={14} />
            Upload banner
          </button>
        </div>
      </section>
    </div>
  );
}

function SuperAdminStandaloneShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-page py-5">
      <div className="page-shell space-y-5">
        <header className="surface flex flex-wrap items-center justify-between gap-4 p-4 shadow-soft">
          <BrandLogo subtitle="Super Admin" />
          <nav className="flex flex-wrap gap-2 text-sm font-semibold text-ink" aria-label="Super admin school pages">
            {navLinks.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-lg border border-line/70 px-3 py-2 hover:bg-slate-50">
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        {children}
      </div>
    </main>
  );
}

export function SuperAdminSchoolManagement({
  view = "dashboard",
  schoolId,
  embedded = false,
}: {
  view?: SuperAdminSchoolView;
  schoolId?: number;
  embedded?: boolean;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [credentials, setCredentials] = useState<SchoolAdminCredentials | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      if (schoolId) {
        const item = await schoolApi.get(schoolId);
        setSchool(item);
      }
      const list = await schoolApi.list();
      setSchools(asArray(list));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load schools.");
    } finally {
      setBusy(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (user?.role === "super_admin") void load();
  }, [load, user]);

  const stats = useMemo(() => {
    return {
      total: schools.length,
      active: schools.filter((item) => item.status === "active").length,
      suspended: schools.filter((item) => item.status === "suspended").length,
      disconnected: schools.filter((item) => item.databaseConnectionStatus && !item.databaseConnectionStatus.connected).length,
    };
  }, [schools]);

  async function changeStatus(target: School, actionName: "activate" | "deactivate" | "suspend") {
    if (actionName === "activate") await schoolApi.activate(target.schoolId);
    if (actionName === "deactivate") await schoolApi.deactivate(target.schoolId);
    if (actionName === "suspend") await schoolApi.suspend(target.schoolId);
    await load();
  }

  if (loading || busy) {
    const placeholder = <WorkspacePlaceholder title="Super Admin schools" detail="Preparing school creation and tenant connection status." />;
    return embedded ? placeholder : <SuperAdminStandaloneShell>{placeholder}</SuperAdminStandaloneShell>;
  }

  if (!user) return <LoginPage />;
  if (user.role !== "super_admin") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page px-4">
        <section className="surface max-w-md p-6 text-center shadow-soft">
          <ShieldCheck size={24} className="mx-auto text-muted" />
          <h1 className="mt-3 text-xl font-semibold text-ink">Super Admin access required</h1>
          <p className="mt-2 text-sm text-muted">This page is restricted to the MentriQ360 Super Admin panel.</p>
        </section>
      </main>
    );
  }

  const content = (
    <div className="space-y-5">
      <ErrorNote message={error} />

      {view === "dashboard" && (
        <>
          <PageHeader
            title="Super Admin Dashboard"
            detail="Create schools, manage school admins, monitor tenant database status, and control subscriptions from the central MentriQ360 panel."
            actions={
              <Link href="/dashboard/super-admin/schools/new" className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">
                <Plus size={14} />
                Add school
              </Link>
            }
          />
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Schools" value={stats.total} icon={Building2} />
            <Metric label="Active" value={stats.active} icon={CheckCircle2} />
            <Metric label="Suspended" value={stats.suspended} icon={XCircle} />
            <Metric label="DB Issues" value={stats.disconnected} icon={DatabaseZap} />
          </section>
          <SchoolList schools={schools} onRefresh={load} onStatus={changeStatus} />
        </>
      )}

      {view === "list" && (
        <>
          <PageHeader
            title="School List"
            detail="View every school, status, subscription state, database connection, and school-level user counts."
            actions={<Link href="/dashboard/super-admin/schools/new" className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"><Plus size={14} />Add school</Link>}
          />
          <SchoolList schools={schools} onRefresh={load} onStatus={changeStatus} />
        </>
      )}

      {view === "add" && (
        <>
          <PageHeader title="Add School" detail="Create a school tenant, generate a unique school code, and issue the first School Admin login." />
          <CredentialsPanel credentials={credentials} />
          <SchoolForm
            includeAdmin
            submitLabel="Create school"
            onSubmit={async (payload) => {
              const created = await schoolApi.create(payload);
              setCredentials(created.adminUser ?? null);
              await load();
            }}
          />
        </>
      )}

      {view === "details" && school && (
        <>
          <PageHeader title="School Details" detail="Review status, counts, connection state, subscription, and administrative actions for this school." />
          <SchoolDetails school={school} />
        </>
      )}

      {view === "edit" && school && (
        <>
          <PageHeader title="Edit School" detail="Update school profile, subscription status, tenant reference, and activation state." />
          <SchoolForm
            initial={school}
            includeAdmin={false}
            submitLabel="Save school"
            onSubmit={async (payload) => {
              await schoolApi.update(school.schoolId, payload);
              await load();
              router.push(`/dashboard/super-admin/schools/${school.schoolId}`);
            }}
          />
        </>
      )}

      {view === "admin" && school && (
        <>
          <PageHeader title="Create School Admin" detail={`Create an additional School Admin login for ${school.schoolName}.`} />
          <CredentialsPanel credentials={credentials} />
          <SchoolForm
            initial={school}
            includeAdmin
            submitLabel="Create admin"
            onSubmit={async (payload) => {
              const created = await schoolApi.createAdmin(school.schoolId, payload);
              setCredentials(created);
              await load();
            }}
          />
        </>
      )}

      {view === "branding" && school && (
        <>
          <PageHeader title="School Branding Upload" detail={`Upload logo and banner assets for ${school.schoolName}. These assets appear inside that school's dashboard only.`} />
          <BrandingUpload school={school} onRefresh={load} />
        </>
      )}

      {schoolId && !school && !error && (
        <div className="surface p-6 text-center text-sm text-muted shadow-soft">School not found.</div>
      )}
    </div>
  );

  return embedded ? content : <SuperAdminStandaloneShell>{content}</SuperAdminStandaloneShell>;
}
