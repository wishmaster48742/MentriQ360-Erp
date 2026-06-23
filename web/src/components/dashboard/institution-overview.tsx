"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarRange,
  ClipboardCheck,
  CreditCard,
  FileText,
  GraduationCap,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";

import {
  admitCardApi,
  assignedWorkApi,
  campusApi,
  learningResourceApi,
  reportApi,
  resultRecordApi,
  sessionApi,
  studentApi,
  userApi,
  ApiError,
  type AdmitCard,
  type AssignedWork,
  type Campus,
  type DashboardSummary,
  type ERPUser,
  type LearningResource,
  type ResultRecord,
  type UserRole,
} from "@/lib/api";
import { Badge, statusBadge } from "@/components/ui/badge";
import { WorkspacePlaceholder } from "@/components/ui/workspace-placeholder";

type OverviewTab = "dashboard" | "records" | "attendance" | "operations" | "academics" | "finance" | "reports";
type AllowedTab = OverviewTab | "modules" | "campus" | "fees" | "student" | "schools" | "students" | "staff" | "classes" | "exams" | "notices" | "realtime";

function asArray<T>(value: T[] | { results?: T[] }): T[] {
  return Array.isArray(value) ? value : value.results ?? [];
}

function formatCurrency(value: string) {
  return Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function AdminMetric({
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
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink text-white">
          <Icon size={18} />
        </div>
      </div>
      <p className="display-font mt-3 text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

export function InstitutionOverview({
  role,
  allowedTabs,
  onNavigate,
}: {
  role: UserRole;
  allowedTabs?: AllowedTab[];
  onNavigate: (tab: OverviewTab) => void;
}) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [activeSessionName, setActiveSessionName] = useState("");
  const [users, setUsers] = useState<ERPUser[]>([]);
  const [work, setWork] = useState<AssignedWork[]>([]);
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [admitCards, setAdmitCards] = useState<AdmitCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOverview() {
      setLoading(true);
      setError("");
      try {
        const [
          summaryRes,
          campusRes,
          sessionRes,
          studentRes,
          workRes,
          resourceRes,
          resultRes,
          admitRes,
          userRes,
        ] = await Promise.all([
          reportApi.summary(),
          campusApi.list(),
          sessionApi.list(),
          studentApi.list(),
          assignedWorkApi.list(),
          learningResourceApi.list(),
          resultRecordApi.list(),
          admitCardApi.list(),
          role === "school_admin" || role === "super_admin" ? userApi.list() : Promise.resolve([] as ERPUser[]),
        ]);

        const sessionList = asArray(sessionRes);
        const studentList = asArray(studentRes);
        setSummary(summaryRes);
        setCampuses(asArray(campusRes));
        setActiveSessionName(sessionList.find((session) => session.is_active)?.name ?? sessionList[0]?.name ?? "");
        setUsers(asArray(userRes));
        setWork(asArray(workRes));
        setResources(asArray(resourceRes));
        setResults(asArray(resultRes));
        setAdmitCards(asArray(admitRes));

        if ((role === "teacher" || role === "school_admin" || role === "super_admin") && !summaryRes.students.total && studentList.length) {
          setSummary({
            ...summaryRes,
            students: {
              total: studentList.length,
              active: studentList.filter((student) => student.status === "active").length,
            },
          });
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load institution overview.");
      } finally {
        setLoading(false);
      }
    }

    void loadOverview();
  }, [role]);

  if (loading) {
    return <WorkspacePlaceholder title="Institution overview" detail="Preparing campus, attendance, finance, and academic totals." />;
  }

  if (error || !summary) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error || "No overview data available."}
      </div>
    );
  }

  const institutionLabel = campuses[0]?.name ?? "Institution Network";
  const institutionAddress = campuses[0]?.address ?? "Centralized academic and finance operations";
  const recentResults = results.slice(0, 4);
  const recentResources = resources.slice(0, 4);
  const upcomingWork = work.slice(0, 4);
  const issuedCards = admitCards.filter((card) => card.status === "issued").length;
  const studentCount = summary.students.total;
  const isTeacher = role === "teacher";
  const canOpen = (tab: OverviewTab | "campus" | "fees") => !allowedTabs || allowedTabs.includes(tab) || (tab === "finance" && allowedTabs.includes("fees"));
  const showFinance = !isTeacher && canOpen("finance");
  const overviewDescription = isTeacher
    ? `${institutionAddress}. This workspace keeps class attendance, assigned work, resources, results, and exam documents in one academic surface.`
    : showFinance
      ? `${institutionAddress}. The workspace below keeps permitted operations, academics, finance, and reporting in one role-scoped surface.`
      : `${institutionAddress}. The workspace below keeps permitted records, attendance, academics, and reporting in one role-scoped surface.`;
  const roleWorkspace = isTeacher
    ? {
        label: "Teacher workspace",
        title: "Class duties",
        action: "Open Class Work",
      }
    : role === "account"
      ? {
          label: "Account workspace",
          title: "Finance control",
          action: "Open Finance",
        }
    : role === "super_admin"
      ? {
          label: "Super Admin workspace",
          title: "Institution control",
          action: "Open Dashboard",
        }
      : {
          label: "Admin workspace",
          title: "Campus operations",
          action: "Open Workspace",
        };

  const adminModules = [
    {
      id: "records" as const,
      label: "Institution Records",
      description: "Campuses, sessions, sections, users, and linked student identities.",
      icon: Building2,
    },
    {
      id: "attendance" as const,
      label: "Attendance Operations",
      description: "Daily section tracking with fast status visibility.",
      icon: ClipboardCheck,
    },
    {
      id: "operations" as const,
      label: "School Operations",
      description: "Staff profiles, timetables, library, transport, and hostel services.",
      icon: BriefcaseBusiness,
    },
    {
      id: "academics" as const,
      label: "Academic Delivery",
      description: "Assignments, resources, results, and admit cards.",
      icon: BookOpen,
    },
    {
      id: "finance" as const,
      label: "Fees and Payments",
      description: "Fee assignment, receipt capture, and outstanding monitoring.",
      icon: ReceiptText,
    },
    {
      id: "reports" as const,
      label: "Reports and Audit",
      description: "Operational KPIs, cash position, and activity trail.",
      icon: ShieldCheck,
    },
  ];

  const teacherModules = [
    {
      id: "attendance" as const,
      label: "Take Attendance",
      description: "Mark daily presence and follow up on absences.",
      icon: ClipboardCheck,
    },
    {
      id: "academics" as const,
      label: "Run Academics",
      description: "Manage work, resources, results, and exam documents.",
      icon: BookOpen,
    },
  ];

  const moduleCards = (isTeacher ? teacherModules : adminModules).filter((item) => canOpen(item.id));

  return (
    <div className="space-y-6">
      <section className="surface overflow-hidden p-6 shadow-soft">
        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div>
            <div className="section-kicker">
              <BriefcaseBusiness size={14} />
              Institution ERP
            </div>
            <h1 className="display-font mt-4 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              {institutionLabel}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
              {overviewDescription}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                Active session: {activeSessionName || "Current academic cycle"}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                Students: {studentCount}
              </span>
              {!isTeacher && users.length > 0 && canOpen("records") && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  Staff accounts: {users.length}
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-line/70 bg-ink p-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Operational pulse</p>
              <p className="mt-3 text-3xl font-semibold">{summary.attendance.total}</p>
              <p className="mt-1 text-sm text-white/80">Attendance records currently in scope</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line/70 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Resources</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{resources.length}</p>
              </div>
              <div className="rounded-2xl border border-line/70 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Issued Admit Cards</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{issuedCards}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetric
          label="Active Students"
          value={summary.students.active}
          note={`${summary.students.total} total in current scope`}
          icon={GraduationCap}
        />
        <AdminMetric
          label="Attendance Rate"
          value={`${summary.attendance.total ? Math.round(((summary.attendance.by_status.present ?? 0) / summary.attendance.total) * 100) : 0}%`}
          note={`${summary.attendance.by_status.present ?? 0} present records`}
          icon={ClipboardCheck}
        />
        <AdminMetric
          label={showFinance ? "Collected" : "Published Results"}
          value={showFinance ? formatCurrency(summary.fees.total_collected) : results.length}
          note={showFinance ? "Captured through finance workflows" : "Academic outcomes visible to classes"}
          icon={showFinance ? CreditCard : FileText}
        />
        <AdminMetric
          label={showFinance ? "Outstanding" : "Learning Resources"}
          value={showFinance ? formatCurrency(summary.fees.total_outstanding) : resources.length}
          note={showFinance ? "Open dues to follow up" : "Study material available to classes"}
          icon={showFinance ? ReceiptText : BookOpen}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="surface p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{roleWorkspace.label}</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">{roleWorkspace.title}</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate((moduleCards[0]?.id ?? (isTeacher ? "academics" : "records")) as OverviewTab)}
              disabled={!moduleCards.length}
              className="inline-flex items-center gap-2 rounded-2xl border border-line/70 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
            >
              {roleWorkspace.action}
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {moduleCards.map(({ id, label, description, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className="group rounded-2xl border border-line/70 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-ink">
                    <Icon size={18} />
                  </div>
                  <ArrowRight size={16} className="text-muted transition group-hover:text-ink" />
                </div>
                <h3 className="mt-4 font-semibold text-ink">{label}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="surface p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Institution Detail</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">Operational footprint</h2>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-line/70 bg-white text-muted transition hover:bg-slate-50 hover:text-ink"
              aria-label="Reload page"
            >
              <RefreshCcw size={15} />
            </button>
          </div>

          <div className="mt-5 grid gap-3">
            {campuses.map((campus) => (
              <div key={campus.id} className="rounded-2xl border border-line/70 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{campus.code}</p>
                    <h3 className="mt-1 font-semibold text-ink">{campus.name}</h3>
                    <p className="mt-2 text-sm text-muted">{campus.address || "Institution address not configured."}</p>
                  </div>
                  <Badge variant="info">Campus</Badge>
                </div>
              </div>
            ))}
            {!campuses.length && (
              <div className="rounded-2xl border border-line/70 bg-white p-4 text-sm text-muted">
                Campus profile details are not configured yet.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="surface overflow-hidden shadow-soft">
          <div className="flex items-center gap-2 border-b border-line/60 px-5 py-4">
            <CalendarRange size={18} className="text-teal-700" />
            <h2 className="font-semibold text-ink">Upcoming Academic Work</h2>
          </div>
          <div className="divide-y divide-line/40">
            {upcomingWork.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted">No upcoming work published.</p>
            ) : (
              upcomingWork.map((item) => (
                <div key={item.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{item.subject}</p>
                      <h3 className="mt-1 font-semibold text-ink">{item.title}</h3>
                      <p className="mt-2 text-sm text-muted">{item.section_label}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={statusBadge(item.status)}>{item.status}</Badge>
                      <p className="mt-2 text-xs text-muted">{formatDate(item.due_date)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid gap-6">
          {!showFinance ? (
            <div className="surface overflow-hidden shadow-soft">
              <div className="flex items-center gap-2 border-b border-line/60 px-5 py-4">
                <BookOpen size={18} className="text-teal-700" />
                <h2 className="font-semibold text-ink">Class Academic Activity</h2>
              </div>
              <div className="divide-y divide-line/40">
                {recentResources.length === 0 && recentResults.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-muted">No academic activity published yet.</p>
                ) : (
                  <>
                    {recentResources.slice(0, 2).map((item) => (
                      <div key={`resource-${item.id}`} className="px-5 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Resource</p>
                        <p className="mt-1 font-semibold text-ink">{item.title}</p>
                        <p className="mt-1 text-sm text-muted">{item.subject} - {item.section_label}</p>
                      </div>
                    ))}
                    {recentResults.slice(0, 2).map((item) => (
                      <div key={`result-${item.id}`} className="px-5 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Result</p>
                        <p className="mt-1 font-semibold text-ink">{item.exam_name}</p>
                        <p className="mt-1 text-sm text-muted">{item.student_name} - {item.subject}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="surface overflow-hidden shadow-soft">
              <div className="flex items-center gap-2 border-b border-line/60 px-5 py-4">
                <ReceiptText size={18} className="text-teal-700" />
                <h2 className="font-semibold text-ink">Recent Finance Activity</h2>
              </div>
              <div className="divide-y divide-line/40">
                {summary.recent_payments.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-muted">No recent payments captured.</p>
                ) : (
                  summary.recent_payments.slice(0, 4).map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between gap-4 px-5 py-4">
                      <div>
                        <p className="font-semibold text-ink">{payment.student_name}</p>
                        <p className="text-sm text-muted">{payment.fee_title}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-ink">{formatCurrency(payment.amount_paid)}</p>
                        <p className="text-xs text-muted">{formatDate(payment.paid_on)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <div className="surface overflow-hidden shadow-soft">
              <div className="flex items-center gap-2 border-b border-line/60 px-5 py-4">
                <FileText size={18} className="text-teal-700" />
                <h2 className="font-semibold text-ink">Resources</h2>
              </div>
              <div className="divide-y divide-line/40">
                {recentResources.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-muted">No resources available.</p>
                ) : (
                  recentResources.map((item) => (
                    <div key={item.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink">{item.title}</p>
                          <p className="mt-1 text-sm text-muted">{item.subject}</p>
                        </div>
                        <Badge variant="info">{item.resource_type.replace("_", " ")}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="surface overflow-hidden shadow-soft">
              <div className="flex items-center gap-2 border-b border-line/60 px-5 py-4">
                <BadgeCheck size={18} className="text-teal-700" />
                <h2 className="font-semibold text-ink">Results and Exams</h2>
              </div>
              <div className="divide-y divide-line/40">
                {recentResults.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-muted">No results published.</p>
                ) : (
                  recentResults.map((item) => (
                    <div key={item.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink">{item.exam_name}</p>
                          <p className="mt-1 text-sm text-muted">{item.student_name} - {item.subject}</p>
                        </div>
                        <Badge variant={statusBadge(item.grade || "active")}>{item.grade || `${item.percentage ?? 0}%`}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
