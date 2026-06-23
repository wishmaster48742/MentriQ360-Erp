"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  BriefcaseBusiness,
  ClipboardCheck,
  Crown,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  RadioTower,
  ReceiptText,
  RefreshCcw,
  Rocket,
  School,
  ShieldCheck,
  UserCog,
  Users,
  X,
} from "lucide-react";

import { LoginPage } from "@/components/auth/login-page";
import { BrandLogo } from "@/components/brand-logo";
import type { SchoolAdminModule } from "@/components/school-admin/school-admin-core";
import { SupportDock } from "@/components/support/support-dock";
import { useAuth } from "@/lib/auth-context";
import {
  ROLE_LABELS,
  dashboardRouteForRole,
  type DashboardRole,
} from "@/lib/routes";
import { ApiError, authApi, type User, type UserRole } from "@/lib/api";

export type AppTab =
  | "dashboard"
  | "schools"
  | "enterprise"
  | "ecosystem"
  | "records"
  | "students"
  | "staff"
  | "classes"
  | "campus"
  | "attendance"
  | "operations"
  | "academics"
  | "exams"
  | "notices"
  | "fees"
  | "reports"
  | "realtime"
  | "student";

function PanelLoading() {
  return (
    <section className="rounded-lg border border-line/70 bg-white p-5 shadow-sm" aria-live="polite">
      <p className="text-sm font-medium text-muted">Loading workspace...</p>
    </section>
  );
}

const AcademicManagementPanel = dynamic(
  () => import("@/components/academics/academic-management-panel").then((mod) => mod.AcademicManagementPanel),
  { loading: PanelLoading }
);
const AdminDashboard = dynamic(
  () => import("@/components/admin/admin-dashboard").then((mod) => mod.AdminDashboard),
  { loading: PanelLoading }
);
const AttendancePanel = dynamic(
  () => import("@/components/attendance/attendance-panel").then((mod) => mod.AttendancePanel),
  { loading: PanelLoading }
);
const CampusControlPanel = dynamic(
  () => import("@/components/campus/campus-control-panel").then((mod) => mod.CampusControlPanel),
  { loading: PanelLoading }
);
const InstitutionOverview = dynamic(
  () => import("@/components/dashboard/institution-overview").then((mod) => mod.InstitutionOverview),
  { loading: PanelLoading }
);
const FeesPaymentsDashboard = dynamic(
  () => import("@/components/fees/fees-payments-dashboard").then((mod) => mod.FeesPaymentsDashboard),
  { loading: PanelLoading }
);
const SchoolOperationsPanel = dynamic(
  () => import("@/components/operations/school-operations-panel").then((mod) => mod.SchoolOperationsPanel),
  { loading: PanelLoading }
);
const ReportsDashboard = dynamic(
  () => import("@/components/reports/reports-dashboard").then((mod) => mod.ReportsDashboard),
  { loading: PanelLoading }
);
const RealtimeAiCommunicationPanel = dynamic(
  () => import("@/components/realtime/realtime-ai-communication-panel").then((mod) => mod.RealtimeAiCommunicationPanel),
  { loading: PanelLoading }
);
const SchoolAdminCoreModules = dynamic(
  () => import("@/components/school-admin/school-admin-core").then((mod) => mod.SchoolAdminCoreModules),
  { loading: PanelLoading }
);
const StudentDashboard = dynamic(
  () => import("@/components/student/student-dashboard").then((mod) => mod.StudentDashboard),
  { loading: PanelLoading }
);
const TeacherPanel = dynamic(
  () => import("@/components/teacher/teacher-panel").then((mod) => mod.TeacherPanel),
  { loading: PanelLoading }
);
const SuperAdminSchoolManagement = dynamic(
  () => import("@/components/super-admin/school-management").then((mod) => mod.SuperAdminSchoolManagement),
  { loading: PanelLoading }
);
const EnterpriseSaasPanel = dynamic(
  () => import("@/components/super-admin/enterprise-saas-panel").then((mod) => mod.EnterpriseSaasPanel),
  { loading: PanelLoading }
);
const CommercialEcosystemPanel = dynamic(
  () => import("@/components/super-admin/commercial-ecosystem-panel").then((mod) => mod.CommercialEcosystemPanel),
  { loading: PanelLoading }
);

type NavItem = {
  id: AppTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const roleNav: Record<UserRole, NavItem[]> = {
  super_admin: [
    { id: "dashboard", label: "Overview", description: "Network-wide status", icon: LayoutDashboard },
    { id: "schools", label: "Schools", description: "Create schools, admins, branding", icon: School },
    { id: "enterprise", label: "Enterprise SaaS", description: "Plans, billing, white label, compliance", icon: Crown },
    { id: "ecosystem", label: "Commercial Ecosystem", description: "Admissions, mobile, marketplace, audit", icon: Rocket },
    { id: "records", label: "Records & Users", description: "Sessions, users, students", icon: UserCog },
    { id: "campus", label: "Administration", description: "Access, approvals, devices", icon: ShieldCheck },
    { id: "operations", label: "Operations", description: "Staff, timetable, library, transport", icon: BriefcaseBusiness },
    { id: "fees", label: "Finance", description: "Fees, payments, salary", icon: ReceiptText },
    { id: "realtime", label: "Realtime & AI", description: "Events, AI, communication, sync", icon: RadioTower },
    { id: "reports", label: "Reports", description: "Audit and operational reports", icon: UserCog },
  ],
  school_admin: [
    { id: "dashboard", label: "Overview", description: "School status", icon: LayoutDashboard },
    { id: "students", label: "Students", description: "Admissions and profiles", icon: GraduationCap },
    { id: "staff", label: "Teachers & Staff", description: "Profiles and assignments", icon: Users },
    { id: "classes", label: "Classes", description: "Sections, subjects, timetable", icon: FileText },
    { id: "attendance", label: "Attendance", description: "Student and staff attendance", icon: ClipboardCheck },
    { id: "exams", label: "Exams", description: "Schedules, marks, results", icon: BookOpen },
    { id: "notices", label: "Notices", description: "Publish school notices", icon: UserCog },
    { id: "realtime", label: "Realtime & AI", description: "Events, AI, communication, sync", icon: RadioTower },
  ],
  account: [
    { id: "dashboard", label: "Overview", description: "Finance status", icon: LayoutDashboard },
    { id: "fees", label: "Fees", description: "Dues, payments, receipts", icon: ReceiptText },
    { id: "realtime", label: "Realtime & AI", description: "Events, AI, communication, sync", icon: RadioTower },
    { id: "reports", label: "Reports", description: "Finance and audit reports", icon: UserCog },
  ],
  teacher: [
    { id: "dashboard", label: "Overview", description: "Class status", icon: LayoutDashboard },
    { id: "attendance", label: "Attendance", description: "Mark assigned classes", icon: ClipboardCheck },
    { id: "academics", label: "Academics", description: "Work, resources, results", icon: BookOpen },
    { id: "realtime", label: "Realtime & AI", description: "Events, AI, sync", icon: RadioTower },
    { id: "reports", label: "Reports", description: "Class reports", icon: UserCog },
  ],
  student: [
    { id: "student", label: "Student Portal", description: "Profile, attendance, fees, results", icon: GraduationCap },
    { id: "realtime", label: "AI & Updates", description: "Study AI and live updates", icon: RadioTower },
  ],
};

function defaultTabFor(user: User): AppTab {
  return user.role === "student" ? "student" : "dashboard";
}

function initials(user: User) {
  return (user.full_name || user.username)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4">
      <section className="surface w-full max-w-sm p-6 text-center shadow-soft animate-fade-up">
        <div className="flex justify-center">
          <BrandLogo compact animated />
        </div>
        <div className="mt-5 flex justify-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft">
            <RefreshCcw size={18} className="animate-spin text-accent-strong" />
          </span>
        </div>
        <p className="mt-4 text-sm font-medium text-muted">Checking secure session...</p>
      </section>
    </main>
  );
}

function SchoolBrandLockup({
  user,
  compact = false,
  subtitle,
}: {
  user: User;
  compact?: boolean;
  subtitle?: string;
}) {
  if (user.role === "super_admin") {
    return <BrandLogo compact={compact} subtitle={subtitle ?? "School ERP"} />;
  }

  const primaryCampus = user.campuses?.find((campus) => campus.is_primary) ?? user.campuses?.[0];
  const schoolName = primaryCampus?.name ?? user.school_name ?? "School Dashboard";
  const logoUrl = primaryCampus?.logo_url;
  const markSize = compact ? "h-10 w-10" : "h-12 w-12";

  return (
    <div className="flex min-w-0 items-center gap-3">
      {logoUrl ? (
        <span
          className={`${markSize} block shrink-0 rounded-lg border border-line/70 bg-white bg-contain bg-center bg-no-repeat shadow-sm`}
          style={{ backgroundImage: `url(${JSON.stringify(logoUrl)})` }}
          aria-label={`${schoolName} logo`}
          role="img"
        />
      ) : (
        <span className={`${markSize} flex shrink-0 items-center justify-center rounded-lg bg-ink text-sm font-semibold text-white`}>
          {schoolName.slice(0, 1).toUpperCase()}
        </span>
      )}
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{schoolName}</span>
          <span className="block truncate text-xs text-muted">{subtitle ?? "School ERP"}</span>
        </span>
      )}
    </div>
  );
}

function PasswordChangeGate({ user }: { user: User }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await authApi.changePassword(currentPassword, newPassword);
      window.location.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Password could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4">
      <form onSubmit={submit} className="surface w-full max-w-md p-6 shadow-soft animate-fade-up">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ink to-slate-800 text-white shadow-sm">
            <LockKeyhole size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">Change temporary password</h1>
            <p className="mt-1 text-sm leading-6 text-muted">
              {user.full_name || user.username}, create a new password before opening the dashboard.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 animate-fade-in">
            {error}
          </div>
        )}

        <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-ink">
            Temporary password
            <input type="password" className="control-ring mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
          </label>
          <label className="block text-sm font-semibold text-ink">
            New password
            <input type="password" className="control-ring mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Confirm new password
            <input type="password" className="control-ring mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} />
          </label>
        </div>

        <button type="submit" disabled={busy} className="mt-6 w-full rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-ink/90 hover:shadow-md active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100">
          {busy ? "Updating..." : "Change password"}
        </button>
      </form>
    </main>
  );
}

function RoleGuardNotice({ user }: { user: User }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4">
      <section className="surface w-full max-w-md p-6 text-center shadow-soft animate-fade-up">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <ShieldCheck size={24} />
        </div>
        <h1 className="mt-4 text-xl font-bold text-ink">Redirecting to your dashboard</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Your account is assigned to <strong className="text-ink">{ROLE_LABELS[user.role]}</strong>.
        </p>
      </section>
    </main>
  );
}

function Sidebar({
  user,
  navItems,
  activeTab,
  setActiveTab,
  logout,
}: {
  user: User;
  navItems: NavItem[];
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  logout: () => void;
}) {
  const primaryCampus = user.campuses?.find((campus) => campus.is_primary) ?? user.campuses?.[0];

  return (
    <aside className="hidden min-h-screen max-h-screen w-72 shrink-0 border-r border-line/70 bg-white px-4 py-5 lg:sticky lg:top-0 lg:flex lg:flex-col animate-slide-right">
      <SchoolBrandLockup user={user} subtitle={user.role === "super_admin" ? "Super Admin" : "School ERP"} />

      <div className="mt-6 rounded-lg border border-line/70 bg-slate-50 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ink text-sm font-semibold text-white">
            {initials(user)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{user.full_name || user.username}</p>
            <p className="truncate text-xs text-muted">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
        <p className="mt-3 truncate text-xs text-muted">
          {user.role === "super_admin" ? "All schools" : primaryCampus?.name ?? user.school_name ?? "School not assigned"}
        </p>
      </div>

      <nav className="mt-5 flex-1 space-y-1 overflow-y-auto" aria-label="Dashboard navigation">
        {navItems.map(({ id, label, description, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition ${
                active ? "bg-ink text-white shadow-sm" : "text-ink hover:bg-slate-50"
              }`}
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${active ? "text-white" : "text-muted"}`} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                <span className={`block text-xs leading-5 ${active ? "text-white/70" : "text-muted"}`}>{description}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={logout}
        className="mt-5 flex w-full items-center gap-2 rounded-lg border border-line/70 px-3 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
      >
        <LogOut size={16} />
        Sign out
      </button>
    </aside>
  );
}

function MobileHeader({
  user,
  navItems,
  activeTab,
  setActiveTab,
  logout,
}: {
  user: User;
  navItems: NavItem[];
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  logout: () => void;
}) {
  const [open, setOpen] = useState(false);

  function choose(tab: AppTab) {
    setActiveTab(tab);
    setOpen(false);
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <SchoolBrandLockup user={user} compact subtitle={user.role === "super_admin" ? "Super Admin" : "School ERP"} />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-line/70 text-ink"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setOpen(false)}
            aria-label="Close navigation backdrop"
          />
          <aside className="absolute right-0 top-0 flex h-full w-[min(22rem,88vw)] flex-col bg-white px-4 pt-4 shadow-2xl" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 1rem))" }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{user.full_name || user.username}</p>
                <p className="text-xs text-muted">{ROLE_LABELS[user.role]}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-line/70 text-ink"
                aria-label="Close navigation"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="mt-5 flex-1 space-y-1 overflow-y-auto" aria-label="Mobile dashboard navigation">
              {navItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => choose(id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold ${
                    activeTab === id ? "bg-ink text-white" : "text-ink hover:bg-slate-50"
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </nav>

            <div className="mt-3 shrink-0 border-t border-line/70 pt-3">
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-line/70 px-3 py-3.5 text-sm font-semibold text-ink active:bg-slate-50"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export function AppShell({ requiredRole }: { requiredRole?: DashboardRole }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");

  useEffect(() => {
    if (!user) return;
    const target = dashboardRouteForRole(user.role);
    if (requiredRole && user.role !== requiredRole) {
      router.replace(target);
      return;
    }
    if (!requiredRole && (pathname === "/" || pathname === "/dashboard")) {
      router.replace(target);
    }
  }, [pathname, requiredRole, router, user]);

  useEffect(() => {
    if (user) setActiveTab(defaultTabFor(user));
  }, [user]);

  const navItems = useMemo(() => (user ? roleNav[user.role] : []), [user]);
  const allowedTabIds = useMemo(() => navItems.map((item) => item.id), [navItems]);
  const overviewAllowedTabIds = useMemo(
    () => allowedTabIds.filter((tab) => tab !== "enterprise" && tab !== "ecosystem") as Exclude<AppTab, "enterprise" | "ecosystem">[],
    [allowedTabIds]
  );

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginPage />;
  if (user.must_change_password) return <PasswordChangeGate user={user} />;
  if (requiredRole && user.role !== requiredRole) return <RoleGuardNotice user={user} />;

  const currentTab = navItems.some((item) => item.id === activeTab)
    ? activeTab
    : defaultTabFor(user);

  return (
    <div className="min-h-screen bg-page text-ink lg:flex" key={currentTab}>
      <Sidebar
        user={user}
        navItems={navItems}
        activeTab={currentTab}
        setActiveTab={setActiveTab}
        logout={logout}
      />
      <div className="min-w-0 flex-1">
        <MobileHeader
          user={user}
          navItems={navItems}
          activeTab={currentTab}
          setActiveTab={setActiveTab}
          logout={logout}
        />
        <main className="page-shell py-5 pb-28 lg:py-6 animate-fade-up">
          <section className="mb-5 rounded-lg border border-line/70 bg-white px-4 py-4 shadow-sm md:px-5 hover-lift">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{ROLE_LABELS[user.role]}</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                  {navItems.find((item) => item.id === currentTab)?.label ?? "Dashboard"}
                </h1>
              </div>
              <p className="max-w-xl text-sm leading-6 text-muted">
                Secure school ERP workspace for your assigned role.
              </p>
            </div>
          </section>

          {currentTab === "dashboard" && user.role === "school_admin" && (
            <SchoolAdminCoreModules
              module="dashboard"
              onNavigate={(target) => setActiveTab(target)}
            />
          )}
          {currentTab === "dashboard" && user.role === "teacher" && (
            <TeacherPanel initialView="dashboard" />
          )}
          {currentTab === "dashboard" && user.role !== "student" && user.role !== "school_admin" && user.role !== "teacher" && (
            <InstitutionOverview
              role={user.role}
              allowedTabs={overviewAllowedTabIds}
              onNavigate={(tab) => {
                const target = (tab === "finance" ? "fees" : tab) as AppTab;
                if (allowedTabIds.includes(target)) setActiveTab(target);
              }}
            />
          )}
          {user.role === "school_admin" && ["students", "staff", "classes", "attendance", "exams", "notices"].includes(currentTab) && (
            <SchoolAdminCoreModules
              module={currentTab as SchoolAdminModule}
              onNavigate={(target) => setActiveTab(target)}
            />
          )}
          {currentTab === "schools" && user.role === "super_admin" && <SuperAdminSchoolManagement view="dashboard" embedded />}
          {currentTab === "enterprise" && user.role === "super_admin" && <EnterpriseSaasPanel />}
          {currentTab === "ecosystem" && user.role === "super_admin" && <CommercialEcosystemPanel />}
          {currentTab === "records" && user.role !== "school_admin" && <AdminDashboard />}
          {currentTab === "campus" && <CampusControlPanel />}
          {currentTab === "attendance" && user.role !== "school_admin" && <AttendancePanel />}
          {currentTab === "operations" && <SchoolOperationsPanel />}
          {currentTab === "academics" && user.role === "teacher" && <TeacherPanel initialView="notes" />}
          {currentTab === "academics" && user.role !== "school_admin" && user.role !== "teacher" && <AcademicManagementPanel />}
          {currentTab === "fees" && <FeesPaymentsDashboard />}
          {currentTab === "realtime" && <RealtimeAiCommunicationPanel user={user} />}
          {currentTab === "reports" && <ReportsDashboard />}
          {currentTab === "student" && <StudentDashboard />}
        </main>
        <SupportDock />
      </div>
    </div>
  );
}
