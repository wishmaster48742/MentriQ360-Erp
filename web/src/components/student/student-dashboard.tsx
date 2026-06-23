"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  BadgeCheck,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileText,
  GraduationCap,
  MapPin,
  Printer,
  RefreshCcw,
  ReceiptText,
  Upload,
  Users,
  X,
  UserRound,
} from "lucide-react";

import {
  academicEventApi,
  admitCardApi,
  announcementApi,
  assignedWorkApi,
  assignmentSubmissionApi,
  attendanceApi,
  documentApi,
  feeApi,
  learningResourceApi,
  paymentApi,
  paymentTransactionApi,
  resultRecordApi,
  studentApi,
  ApiError,
  type AcademicEvent,
  type AdmitCard,
  type Announcement,
  type AssignmentSubmission,
  type AssignedWork,
  type AttendanceRecord,
  type DocumentRecord,
  type FeeAssignment,
  type LearningResource,
  type Payment,
  type PaymentTransaction,
  type ResultRecord,
  type Student,
} from "@/lib/api";
import { Badge, statusBadge, statusLabel } from "@/components/ui/badge";
import { WorkspacePlaceholder } from "@/components/ui/workspace-placeholder";

type StudentView = "overview" | "profile" | "lms" | "fees" | "attendance" | "results" | "work" | "resources" | "notices" | "documents" | "parent" | "admit";

const studentViews: {
  id: StudentView;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: "overview", label: "Dashboard", icon: GraduationCap },
  { id: "profile", label: "My Profile", icon: UserRound },
  { id: "attendance", label: "My Attendance", icon: ClipboardCheck },
  { id: "fees", label: "My Fees", icon: ReceiptText },
  { id: "resources", label: "My Notes", icon: BadgeCheck },
  { id: "work", label: "My Assignments", icon: FileText },
  { id: "results", label: "My Results", icon: Award },
  { id: "notices", label: "My Notices", icon: Bell },
  { id: "documents", label: "My Documents", icon: FileText },
  { id: "parent", label: "Parent View", icon: Users },
  { id: "lms", label: "Learning Center", icon: BookOpen },
  { id: "admit", label: "Admit Card", icon: BadgeCheck },
];

function asArray<T>(value: T[] | { results?: T[] }): T[] {
  return Array.isArray(value) ? value : value.results ?? [];
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function amountValue(value?: string | number | null) {
  return Number(value ?? 0) || 0;
}

function formatMoney(value?: string | number | null) {
  return amountValue(value).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function downloadStudentBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatResourceType(value: string) {
  return value.replace("_", " ");
}

function scorePercent(result: ResultRecord) {
  if (result.percentage) return Number(result.percentage);
  const max = Number(result.max_score || 0);
  return max ? Math.round((Number(result.score) / max) * 100) : 0;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="surface py-14 text-center shadow-soft">
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

function profileValue(value?: string | null) {
  return value?.trim() || "Not added";
}

function pageTitleFor(view: StudentView) {
  if (view === "overview") return "Student Dashboard";
  if (view === "profile") return "Student Complete Detail";
  if (view === "lms") return "Learning Center";
  if (view === "fees") return "Online Payment";
  if (view === "attendance") return "Attendance Details";
  if (view === "results") return "Result Details";
  if (view === "work") return "Homework & Assignment";
  if (view === "resources") return "Learning Resources";
  if (view === "notices") return "My Notices";
  if (view === "documents") return "My Documents";
  if (view === "parent") return "Parent View";
  if (view === "admit") return "Admit Card";
  return "Student Dashboard";
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="grid grid-cols-[minmax(8rem,0.55fr)_minmax(0,1fr)] border-b border-line/70 py-2 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <span className="min-w-0 break-words text-muted">{profileValue(String(value ?? ""))}</span>
    </div>
  );
}

function PanelHeader({
  title,
  icon: Icon = RefreshCcw,
}: {
  title: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <Icon size={17} className="text-ink" />
    </div>
  );
}

function DateNotice({ day, month, title }: { day: string; month: string; title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line/70 px-2 py-3">
      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-cyan-600 text-white">
        <span className="text-xs font-semibold">{month}</span>
        <span className="text-3xl font-bold leading-none">{day}</span>
      </div>
      <p className="text-sm font-semibold leading-6 text-black">{title}</p>
    </div>
  );
}

function StudentHomePage({
  attendancePct,
  presentCount,
  attendanceTotal,
  openWork,
  visibleWork,
  visibleAdmitCards,
  notices,
  events,
  setActiveView,
}: {
  attendancePct: number;
  presentCount: number;
  attendanceTotal: number;
  openWork: AssignedWork[];
  visibleWork: AssignedWork[];
  visibleAdmitCards: AdmitCard[];
  notices: Announcement[];
  events: AcademicEvent[];
  setActiveView: (view: StudentView) => void;
}) {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-3">
        <button type="button" onClick={() => setActiveView("attendance")} className="surface flex items-center justify-center gap-4 p-6 text-left shadow-soft hover:border-accent">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white">
            <span className="text-2xl font-bold">%</span>
          </div>
          <div>
            <p className="text-4xl font-semibold text-ink">{attendancePct} %</p>
            <p className="text-sm text-muted">Attendance</p>
          </div>
        </button>
        <button type="button" onClick={() => setActiveView("work")} className="surface flex items-center justify-center gap-4 p-6 text-left shadow-soft hover:border-accent">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-600 text-white">
            <ClipboardCheck size={24} />
          </div>
          <div>
            <p className="text-4xl font-semibold text-ink">{openWork.length}</p>
            <p className="text-sm text-muted">Assignments</p>
          </div>
        </button>
        <button type="button" onClick={() => setActiveView("admit")} className="surface flex items-center justify-center gap-4 p-6 text-left shadow-soft hover:border-accent">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Bell size={24} />
          </div>
          <div>
            <p className="text-4xl font-semibold text-ink">{visibleAdmitCards.length}</p>
            <p className="text-sm text-muted">Admit Cards</p>
          </div>
        </button>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr_0.8fr_2fr]">
        <div className="surface overflow-hidden shadow-soft">
          <PanelHeader title="Attendance" />
          <div className="compact-table p-5">
            <table className="min-w-full text-sm">
              <thead>
                <tr>{["Subject", "Lectures", "%"].map((head) => <th key={head} className="px-4 py-3 text-center">{head}</th>)}</tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-4 text-center text-muted">All Subjects</td>
                  <td className="px-4 py-4 text-center text-muted">{presentCount} / {attendanceTotal}</td>
                  <td className="px-4 py-4 text-center font-semibold text-ink">{attendancePct}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="surface overflow-hidden shadow-soft">
          <PanelHeader title="Quick Access" />
          <div className="grid gap-2 p-4">
            {[
              ["Student Complete Detail", "profile"],
              ["Online Payment", "fees"],
              ["Learning Center", "lms"],
              ["Result Details", "results"],
            ].map(([label, view]) => (
              <button key={label} type="button" onClick={() => setActiveView(view as StudentView)} className="rounded-md border border-line/70 bg-white px-3 py-2 text-left text-sm font-medium text-accent hover:border-accent hover:bg-accent-soft hover:text-accent-strong">
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="surface overflow-hidden shadow-soft">
          <PanelHeader title="Tasks" />
          <div className="divide-y divide-line/60">
            {visibleWork.slice(0, 3).map((item) => (
              <button key={item.id} type="button" onClick={() => setActiveView("work")} className="block w-full px-4 py-3 text-left">
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                <p className="mt-1 text-xs text-muted">{item.subject} - Due {formatDate(item.due_date)}</p>
              </button>
            ))}
            {!visibleWork.length && <p className="px-4 py-10 text-center text-sm text-muted">No task available.</p>}
          </div>
        </div>

        <div className="surface overflow-hidden shadow-soft">
          <PanelHeader title="Active Notice/News" icon={Bell} />
          <div className="px-4">
            {notices.slice(0, 3).map((notice) => {
              const date = notice.publish_on ? new Date(notice.publish_on) : new Date();
              return (
                <DateNotice
                  key={notice.id}
                  day={date.toLocaleDateString("en-IN", { day: "2-digit" })}
                  month={date.toLocaleDateString("en-IN", { month: "short" })}
                  title={notice.title}
                />
              );
            })}
            {!notices.length && <p className="px-2 py-10 text-center text-sm text-muted">No notices published yet.</p>}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.8fr_2.1fr_2.1fr]">
        <div className="surface overflow-hidden shadow-soft">
          <PanelHeader title="Today's Time Table" />
          <div className="compact-table p-5">
            <table className="min-w-full text-sm">
              <thead><tr>{["Slot", "CCode"].map((head) => <th key={head} className="px-4 py-3 text-center">{head}</th>)}</tr></thead>
              <tbody><tr><td className="px-4 py-10 text-center text-muted" colSpan={2}>No lecture scheduled.</td></tr></tbody>
            </table>
          </div>
        </div>

        <div className="surface overflow-hidden shadow-soft">
          <PanelHeader title="Class Time Table" />
          <div className="overflow-x-auto p-5">
            <table className="text-sm">
              <thead><tr>{["Time/Day", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((head) => <th key={head} className="px-4 py-3 text-center">{head}</th>)}</tr></thead>
              <tbody><tr><td className="px-4 py-10 text-center text-muted" colSpan={7}>Time table will be published by school admin.</td></tr></tbody>
            </table>
          </div>
        </div>

        <div className="surface overflow-hidden shadow-soft">
          <PanelHeader title="Exam Time Table" />
          <div className="overflow-x-auto p-5">
            <table className="text-sm">
              <thead><tr>{["EXAMDATE", "SLOTNAME", "CCODE", "COURSENAME", "SEMESTERNAME", "REGULAR_BACKLOG"].map((head) => <th key={head} className="px-4 py-3 text-center">{head}</th>)}</tr></thead>
              <tbody><tr><td className="px-4 py-10 text-center text-muted" colSpan={6}>No exam schedule published.</td></tr></tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="surface overflow-hidden shadow-soft">
        <PanelHeader title="Latest Updates" icon={RefreshCcw} />
        <div className="divide-y divide-line/60">
          {events.slice(0, 5).map((event) => (
            <button key={event.id} type="button" onClick={() => setActiveView("parent")} className="block w-full px-4 py-3 text-left">
              <p className="text-sm font-semibold text-ink">{statusLabel(event.event_type)}</p>
              <p className="mt-1 text-xs text-muted">{formatDate(event.created_at)}</p>
            </button>
          ))}
          {!events.length && <p className="px-4 py-8 text-center text-sm text-muted">No live academic updates yet.</p>}
        </div>
      </section>
    </div>
  );
}

function StudentCompleteDetailPage({ student }: { student: Student }) {
  const detailRows = [
    ["Admission No.", student.admission_number],
    ["Student Name", student.full_name],
    ["User Login Status", "Enabled"],
    ["Admission Status", student.status],
    ["Current Student Status", student.status],
  ];
  const schoolRows = [
    ["Academic Year", "Current session"],
    ["School", student.campus_name || "MentriQ School"],
    ["Class / Section", student.section_label || "Class / Section"],
    ["Admission Number", student.admission_number],
    ["ERP Scheme", "School ERP Academic Session"],
  ];
  const sidebar = [
    "Student Information",
    "Personal Details",
    "Address Details",
    "Family Details",
    "Fees Details",
    "Learning Resources",
    "Attendance Details",
    "Result Details",
    "Assignments",
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="surface h-fit p-3 shadow-soft">
        {sidebar.map((item, index) => (
          <div key={item} className={`flex items-center gap-2 rounded-md px-3 py-3 text-sm ${index === 0 ? "bg-accent-soft font-semibold text-accent-strong" : "text-slate-700 hover:bg-slate-50"}`}>
            <FileText size={15} />
            {item}
          </div>
        ))}
      </aside>

      <section className="surface overflow-hidden p-4 shadow-soft md:p-6">
        <div className="grid gap-6 rounded-md border border-line/60 bg-white p-4 xl:grid-cols-[1fr_1fr_14rem]">
          <div>{detailRows.map(([label, value]) => <InfoRow key={label} label={label} value={value} />)}</div>
          <div>{schoolRows.map(([label, value]) => <InfoRow key={label} label={label} value={value} />)}</div>
          <div className="flex flex-col items-center justify-start border-l border-line/70 px-4">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-md bg-slate-100 text-4xl font-bold text-muted">
              {student.full_name[0]?.toUpperCase()}
            </div>
            <div className="mt-2 rounded-sm bg-slate-200 px-3 py-1 text-center text-xs font-bold text-muted">SIGNATURE<br />NOT AVAILABLE</div>
          </div>
        </div>

        <label className="mt-5 block max-w-md">
          <span className="text-sm font-medium text-ink"><span className="text-red-600">*</span> Session</span>
          <span className="relative mt-1.5 block">
            <select className="w-full rounded-md border border-blue-200 bg-white px-4 py-3 text-sm text-muted outline-none">
              <option>Jan-June 2025-2026</option>
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" />
          </span>
        </label>

        <div className="mt-5">
          <h2 className="mastersoft-section-title">Student Information</h2>
          <div className="mt-3 grid gap-8 xl:grid-cols-2">
            <div>
              <InfoRow label="Student Name" value={student.full_name} />
              <InfoRow label="Gender" value="Not added" />
              <InfoRow label="Father's Name" value={student.father_name} />
              <InfoRow label="Mother's Name" value={student.mother_name} />
              <InfoRow label="Admission No." value={student.admission_number} />
            </div>
            <div>
              <InfoRow label="School/Institute Name" value={student.campus_name || "MentriQ School"} />
              <InfoRow label="Class / Section" value={student.section_label || "Class / Section"} />
              <InfoRow label="Campus" value={student.campus_name || "MentriQ School"} />
              <InfoRow label="Academic Year" value="Current session" />
              <InfoRow label="Scheme" value="School ERP Academic Session" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function LmsSelectCoursePage({ student }: { student: Student }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="surface min-h-[34rem] p-4 shadow-soft">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-medium text-ink">Transactions</h2>
          <X size={18} className="text-muted" />
        </div>
        <div className="border-l-4 border-accent px-4 py-3 text-sm font-semibold text-accent">Learning Resources</div>
      </aside>

      <section className="surface min-h-[34rem] overflow-hidden p-4 shadow-soft md:p-6">
        <h2 className="mb-4 text-xl font-semibold text-ink">Learning Resources</h2>
        <div className="mb-8 flex max-w-5xl items-center gap-3 rounded-md border border-line/70 bg-white px-3 py-3 text-sm font-semibold text-green-700">
          <span className="flex h-11 w-11 items-center justify-center bg-accent text-white"><Bell size={18} /></span>
          Resources are shown according to your assigned class and section.
        </div>
        <label className="block max-w-2xl">
          <span className="text-sm font-medium text-ink"><span className="text-red-600">*</span> Session</span>
          <select className="mt-2 w-full rounded-md border border-blue-200 bg-white px-4 py-3 text-sm text-ink outline-none">
            <option>Current academic session - {student.campus_name || "MentriQ School"} ({student.section_label || "Class"})</option>
          </select>
        </label>

        <div className="mt-16 rounded-md border border-line/70 bg-white p-5 shadow-soft">
          <div className="max-w-lg rounded-lg bg-blue-50 p-6 shadow-soft">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-sm leading-7 text-blue-700">{student.section_label || "Assigned class"} learning workspace</p>
                <p className="mt-2 text-sm"><strong>School:</strong> {student.campus_name || "MentriQ School"}</p>
                <p className="mt-2 text-sm"><strong>Admission No.:</strong> {student.admission_number}</p>
              </div>
              <GraduationCap size={58} className="text-slate-800" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StudentQuickTabs({
  activeView,
  setActiveView,
}: {
  activeView: StudentView;
  setActiveView: (view: StudentView) => void;
}) {
  return (
    <nav className="surface student-tabs shadow-soft" aria-label="Student workspace">
      {studentViews.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setActiveView(id)}
          aria-current={activeView === id ? "page" : undefined}
          className={`student-tab ${activeView === id ? "student-tab-active" : ""}`}
        >
          <Icon size={15} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function StudentDashboard() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [work, setWork] = useState<AssignedWork[]>([]);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [admitCards, setAdmitCards] = useState<AdmitCard[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [fees, setFees] = useState<FeeAssignment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<AcademicEvent[]>([]);
  const [activeView, setActiveView] = useState<StudentView>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [studentRes, workRes, submissionRes, attendanceRes, resultRes, resourceRes, admitRes, documentRes, feeRes, paymentRes, transactionRes, announcementRes, eventRes] = await Promise.all([
        studentApi.list(),
        assignedWorkApi.list(),
        assignmentSubmissionApi.list(),
        attendanceApi.list(),
        resultRecordApi.list(),
        learningResourceApi.list(),
        admitCardApi.list(),
        documentApi.list(),
        feeApi.list(),
        paymentApi.list(),
        paymentTransactionApi.list(),
        announcementApi.list(),
        academicEventApi.list(),
      ]);
      const studentList = asArray(studentRes);
      setStudents(studentList);
      setSelectedStudentId((current) => (
        studentList.some((item) => item.id === current)
          ? current
          : studentList[0]?.id ?? null
      ));
      setWork(asArray(workRes));
      setSubmissions(asArray(submissionRes));
      setAttendance(asArray(attendanceRes));
      setResults(asArray(resultRes));
      setResources(asArray(resourceRes));
      setAdmitCards(asArray(admitRes));
      setDocuments(asArray(documentRes));
      setFees(asArray(feeRes));
      setPayments(asArray(paymentRes));
      setTransactions(asArray(transactionRes));
      setAnnouncements(asArray(announcementRes));
      setEvents(asArray(eventRes));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load student workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      Promise.all([academicEventApi.list(), assignmentSubmissionApi.list(), paymentTransactionApi.list()])
        .then(([eventRes, submissionRes, transactionRes]) => {
          setEvents(asArray(eventRes));
          setSubmissions(asArray(submissionRes));
          setTransactions(asArray(transactionRes));
        })
        .catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(timer);
  }, []);

  const student = useMemo(
    () => students.find((item) => item.id === selectedStudentId) ?? students[0] ?? null,
    [selectedStudentId, students]
  );
  const visibleWork = useMemo(
    () => student ? work.filter((item) => item.section === student.section) : [],
    [student, work]
  );
  const visibleSubmissions = useMemo(
    () => student ? submissions.filter((item) => item.student === student.id) : [],
    [student, submissions]
  );
  const visibleAttendance = useMemo(
    () => student ? attendance.filter((item) => item.student === student.id) : [],
    [attendance, student]
  );
  const visibleResults = useMemo(
    () => student ? results.filter((item) => item.student === student.id) : [],
    [results, student]
  );
  const visibleResources = useMemo(
    () => student ? resources.filter((item) => item.section === student.section) : [],
    [resources, student]
  );
  const visibleAdmitCards = useMemo(
    () => student ? admitCards.filter((card) => card.student === student.id) : [],
    [admitCards, student]
  );
  const visibleDocuments = useMemo(
    () => student ? documents.filter((document) => document.student === student.id) : [],
    [documents, student]
  );
  const visibleFees = useMemo(
    () => student ? fees.filter((item) => item.student === student.id) : [],
    [fees, student]
  );
  const visiblePayments = useMemo(() => {
    const feeIds = new Set(visibleFees.map((item) => item.id));
    return payments.filter((payment) => feeIds.has(payment.fee_assignment));
  }, [payments, visibleFees]);
  const visibleTransactions = useMemo(
    () => student ? transactions.filter((transaction) => transaction.student === student.id) : [],
    [student, transactions]
  );
  const visibleEvents = useMemo(
    () => student
      ? events.filter((event) => {
          const payload = event.payload as { studentId?: number; sectionId?: number };
          return event.student === student.id || payload.studentId === student.id || payload.sectionId === student.section || event.event_type === "noticePublished";
        })
      : [],
    [events, student]
  );

  const presentCount = visibleAttendance.filter((item) => item.status === "present").length;
  const attendancePct = visibleAttendance.length ? Math.round((presentCount / visibleAttendance.length) * 100) : 0;
  const openWork = visibleWork.filter((item) => item.status !== "closed");
  const latestAdmitCard = visibleAdmitCards.find((card) => card.status === "issued") ?? visibleAdmitCards[0];
  const outstandingAmount = visibleFees.reduce((total, item) => {
    const openAmount = item.outstanding_amount ?? (item.status === "paid" ? 0 : item.amount);
    return total + amountValue(openAmount);
  }, 0);
  const paidAmount = visibleFees.reduce((total, item) => total + amountValue(item.amount_paid), 0);

  if (loading) {
    return <WorkspacePlaceholder title="Student workspace" detail="Preparing attendance, LMS, fees, and results." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-sm text-rose-600">{error}</p>
        <button type="button" onClick={load} className="flex items-center gap-2 rounded-2xl bg-ink px-4 py-2 text-sm font-medium text-white">
          <RefreshCcw size={14} />
          Retry
        </button>
      </div>
    );
  }

  if (!student) {
    return <EmptyState label="No learner profile is linked to this login." />;
  }

  return (
    <div className="space-y-6">
      <div className="mastersoft-page-title flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span className="block truncate">{pageTitleFor(activeView)}</span>
          <span className="mt-1 block text-sm font-medium text-muted">
            {student.full_name} - {student.admission_number}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {students.length > 1 && (
            <label className="flex min-w-0 items-center gap-2 rounded-md border border-line/70 bg-white px-3 py-2 text-sm text-muted shadow-sm">
              <span className="shrink-0 font-medium">Learner</span>
              <select
                value={student.id}
                onChange={(event) => setSelectedStudentId(Number(event.target.value))}
                className="min-h-0 min-w-0 max-w-[13rem] border-0 bg-transparent p-0 font-medium text-ink outline-none"
                aria-label="Select learner"
              >
                {students.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.full_name} ({item.admission_number})
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={load}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line/70 bg-white px-3 text-sm font-medium text-muted shadow-sm hover:bg-slate-50 hover:text-ink"
          >
            <RefreshCcw size={14} />
            Refresh
          </button>
        </div>
      </div>

      <StudentQuickTabs activeView={activeView} setActiveView={setActiveView} />

      <div className="min-w-0 space-y-6">
          {activeView === "overview" && (
            <StudentHomePage
              attendancePct={attendancePct}
              presentCount={presentCount}
              attendanceTotal={visibleAttendance.length}
              openWork={openWork}
              visibleWork={visibleWork}
              visibleAdmitCards={visibleAdmitCards}
              notices={announcements}
              events={visibleEvents}
              setActiveView={setActiveView}
            />
          )}

          {activeView === "profile" && <StudentCompleteDetailPage student={student} />}
          {activeView === "lms" && <LmsSelectCoursePage student={student} />}
          {activeView === "work" && <StudentAssignmentsPage items={visibleWork} submissions={visibleSubmissions} onRefresh={load} />}
          {activeView === "attendance" && (
        <section className="surface overflow-hidden shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-5 py-4">
            <h2 className="font-semibold text-ink">Attendance History</h2>
            <Badge variant={attendancePct >= 75 ? "success" : attendancePct >= 50 ? "warning" : "danger"}>{attendancePct}%</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/60 bg-slate-50">
                  {["Date", "Section", "Status"].map((head) => (
                    <th key={head} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleAttendance.length === 0 ? (
                  <tr><td colSpan={3} className="px-5 py-12 text-center text-muted">No attendance records.</td></tr>
                ) : visibleAttendance.map((item) => (
                  <tr key={item.id} className="border-b border-line/40 hover:bg-slate-50/60">
                    <td className="px-5 py-3.5 text-ink">{formatDate(item.date)}</td>
                    <td className="px-5 py-3.5 text-muted">{item.section_label}</td>
                    <td className="px-5 py-3.5"><Badge variant={statusBadge(item.status)}>{statusLabel(item.status)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
          )}
          {activeView === "results" && <ResultList items={visibleResults} framed />}
          {activeView === "fees" && (
            <OnlinePaymentPage
              student={student}
              items={visibleFees}
              payments={visiblePayments}
              transactions={visibleTransactions}
              outstandingAmount={outstandingAmount}
              paidAmount={paidAmount}
            />
          )}
          {activeView === "resources" && <ResourceList items={visibleResources} />}
          {activeView === "notices" && <NoticeList items={announcements} />}
          {activeView === "documents" && <DocumentsPanel documents={visibleDocuments} admitCards={visibleAdmitCards} payments={visiblePayments} />}
          {activeView === "parent" && (
            <ParentViewPanel
              student={student}
              attendancePct={attendancePct}
              attendance={visibleAttendance}
              fees={visibleFees}
              payments={visiblePayments}
              results={visibleResults}
              notices={announcements}
              assignments={visibleWork}
              submissions={visibleSubmissions}
              documents={visibleDocuments}
            />
          )}
          {activeView === "admit" && <AdmitCardPanel card={latestAdmitCard} />}
      </div>
    </div>
  );
}

function StudentAssignmentsPage({
  items,
  submissions,
  onRefresh,
}: {
  items: AssignedWork[];
  submissions: AssignmentSubmission[];
  onRefresh: () => Promise<void>;
}) {
  const [fileMap, setFileMap] = useState<Record<number, File | null>>({});
  const [noteMap, setNoteMap] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submissionByAssignment = new Map(submissions.map((submission) => [submission.assignment, submission]));

  async function run(label: string, action: () => Promise<void>, assignmentId?: number) {
    setBusyId(assignmentId ?? null);
    setMessage("");
    setError("");
    try {
      await action();
      setMessage(label);
      await onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) return <EmptyState label="No assignments published yet." />;

  return (
    <section className="space-y-4">
      {(message || error) && (
        <div className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </div>
      )}
      <div className="surface overflow-hidden shadow-soft">
        <div className="divide-y divide-line/40">
          {items.map((item) => {
            const submission = submissionByAssignment.get(item.id);
            return (
              <article key={item.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted">{item.subject}</p>
                    <h3 className="mt-1 font-semibold text-ink">{item.title}</h3>
                    {item.description && <p className="mt-2 max-w-3xl text-sm text-muted">{item.description}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant={statusBadge(item.status)}>{item.status}</Badge>
                      <Badge variant={submission ? statusBadge(submission.status) : "neutral"}>{submission ? `Submission ${submission.status}` : "Not submitted"}</Badge>
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">Due {formatDate(item.due_date)}</span>
                    </div>
                    {submission?.remarks && <p className="mt-3 text-sm font-medium text-ink">Teacher remarks: <span className="font-normal text-muted">{submission.remarks}</span></p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => run("Assignment downloaded.", async () => {
                        const blob = await assignedWorkApi.download(item.id);
                        downloadStudentBlob(blob, item.file_name || `${item.title}.pdf`);
                      }, item.id)}
                      className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line/70 px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-50"
                    >
                      <Download size={13} />
                      Download
                    </button>
                    {submission && (
                      <button
                        type="button"
                        onClick={() => run("Submission downloaded.", async () => {
                          const blob = await assignmentSubmissionApi.download(submission.id);
                          downloadStudentBlob(blob, submission.file_name || `submission-${submission.id}.pdf`);
                        }, item.id)}
                        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line/70 px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-50"
                      >
                        <Download size={13} />
                        Download Submission
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 rounded-md border border-line/70 bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">Submission File</span>
                    <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(event) => setFileMap((current) => ({ ...current, [item.id]: event.target.files?.[0] ?? null }))} className="mt-1 w-full rounded-md border border-line/70 bg-white px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">Note</span>
                    <input value={noteMap[item.id] ?? ""} onChange={(event) => setNoteMap((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-1 min-h-10 w-full rounded-md border border-line/70 bg-white px-3 text-sm" />
                  </label>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => run("Assignment submitted.", async () => {
                      const file = fileMap[item.id];
                      if (!file) throw new ApiError(400, "Choose a submission file.");
                      await assignedWorkApi.submit(item.id, file, noteMap[item.id] ?? "");
                    }, item.id)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    <Upload size={14} />
                    Submit Assignment
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ResultList({ items, framed = false }: { items: ResultRecord[]; framed?: boolean }) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function downloadResult(item: ResultRecord) {
    setBusyId(item.id);
    setError("");
    try {
      const blob = await resultRecordApi.downloadResult(item.id);
      downloadStudentBlob(blob, `result-${item.id}.pdf`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to download result.");
    } finally {
      setBusyId(null);
    }
  }

  const content = items.length === 0 ? (
    <p className="px-5 py-10 text-center text-sm text-muted">No result records available.</p>
  ) : (
    <div className="divide-y divide-line/40">
      {error && <p className="px-5 py-3 text-sm text-rose-600">{error}</p>}
      {items.map((item) => {
        const pct = scorePercent(item);
        return (
          <article key={item.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">{item.exam_name}</p>
                <h3 className="mt-1 font-semibold text-ink">{item.subject}</h3>
                {item.remarks && <p className="mt-2 max-w-3xl text-sm text-muted">{item.remarks}</p>}
              </div>
              <div className="text-right">
                <p className="display-font text-2xl font-bold text-ink">{pct}%</p>
                <p className="text-xs text-muted">{item.score} / {item.max_score}</p>
                {item.grade && <Badge variant={pct >= 75 ? "success" : pct >= 50 ? "warning" : "danger"}>{item.grade}</Badge>}
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => downloadResult(item)}
                  className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-md border border-line/70 px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-50 disabled:opacity-60"
                >
                  <Download size={13} />
                  Download Result
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );

  if (!framed) return content;
  return <section className="surface overflow-hidden shadow-soft">{content}</section>;
}

function OnlinePaymentPage({
  student,
  items,
  payments,
  transactions,
  outstandingAmount,
  paidAmount,
}: {
  student: Student;
  items: FeeAssignment[];
  payments: Payment[];
  transactions: PaymentTransaction[];
  outstandingAmount: number;
  paidAmount: number;
}) {
  const [payBusy, setPayBusy] = useState(false);
  const [payMessage, setPayMessage] = useState("");
  const [payError, setPayError] = useState("");
  const payableFee = items.find((item) => item.status !== "paid" && amountValue(item.outstanding_amount ?? item.amount) > 0);
  const tableRows = items.length
    ? items.map((item, index) => ({
        id: item.id,
        receiptType: item.title,
        term: `Term ${index + 1}`,
        payable: item.amount,
        paid: item.amount_paid ?? "0",
        balance: item.outstanding_amount ?? "0",
      }))
    : [];

  async function startPayment() {
    if (!payableFee) return;
    setPayBusy(true);
    setPayError("");
    setPayMessage("");
    try {
      const order = await paymentTransactionApi.createOrder({
        fee_assignment: payableFee.id,
        amount: String(amountValue(payableFee.outstanding_amount ?? payableFee.payable_amount ?? payableFee.amount)),
        provider: "razorpay",
        method: "upi",
      });
      setPayMessage(`Payment order ${order.gateway_order_id} created for ${formatMoney(order.amount)} using ${order.gateway.maskedKeyId || order.gateway.provider}. Complete checkout from the school's configured gateway.`);
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : "Unable to start payment.");
    } finally {
      setPayBusy(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="surface min-h-[34rem] p-4 shadow-soft">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-medium text-ink">Online Payment</h2>
          <X size={18} className="text-muted" />
        </div>
        <div className="border-l-4 border-line/70 px-4 py-3 text-sm text-muted">Online Payment</div>
      </aside>

      <section className="surface overflow-hidden p-4 shadow-soft md:p-6">
        <h2 className="mb-4 border-b border-line/70 pb-3 text-xl font-semibold text-ink">Online Payment</h2>

        <div className="grid gap-x-10 gap-y-0 xl:grid-cols-2">
          <div>
            <InfoRow label="Student Name" value={student.full_name} />
            <InfoRow label="Admission No." value={student.admission_number} />
            <InfoRow label="School/Institute Name" value={student.campus_name || "MentriQ School"} />
            <InfoRow label="E-Mail ID" value={student.contact_email} />
          </div>
          <div>
            <InfoRow label="Class / Section" value={student.section_label || "Class / Section"} />
            <InfoRow label="Campus" value={student.campus_name || "MentriQ School"} />
            <InfoRow label="Mobile No." value={student.phone_number} />
            <InfoRow label="Total Amount" value={formatMoney(outstandingAmount || paidAmount)} />
          </div>
        </div>

        <div className="mt-8 grid max-w-3xl gap-5 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-ink"><span className="text-red-600">*</span> Receipt Type</span>
            <select className="mt-2 w-full rounded-md border border-blue-200 bg-white px-4 py-3 text-sm text-ink outline-none">
              <option>Academic Fees</option>
              <option>Transport Fees</option>
              <option>Hostel Fees</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink"><span className="text-red-600">*</span> Term</span>
            <select className="mt-2 w-full rounded-md border border-blue-200 bg-white px-4 py-3 text-sm text-ink outline-none">
              <option>Current Term</option>
            </select>
          </label>
        </div>

        <div className="mt-12 flex justify-center">
          <button
            type="button"
            onClick={startPayment}
            disabled={!payableFee || payBusy}
            className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {payBusy ? "Starting..." : "Pay Now"}
          </button>
        </div>
        {payMessage && <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-700">{payMessage}</p>}
        {payError && <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">{payError}</p>}

        <div className="mt-7">
          <h2 className="mastersoft-section-title">Payment Details</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr>
                {["Receipt Type", "Term", "Payable Fee / Applicable Fee", "Paid", "Balance", "Status"].map((head) => (
                  <th key={head} className="px-4 py-3 text-left">{head}</th>
                ))}
              </tr>
              </thead>
              <tbody>
                {tableRows.length ? tableRows.map((row) => (
                  <tr key={row.id} className="border-b border-white even:bg-slate-100">
                    <td className="px-4 py-3">{row.receiptType}</td>
                    <td className="px-4 py-3 text-blue-700">{row.term}</td>
                    <td className="px-4 py-3">{Number(row.payable || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">{Number(row.paid || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">{Number(row.balance || 0).toFixed(2)}</td>
                    <td className="px-4 py-3"><Badge variant={statusBadge(items.find((item) => item.id === row.id)?.status ?? "pending")}>{items.find((item) => item.id === row.id)?.status ?? "pending"}</Badge></td>
                  </tr>
                )) : (
                  <tr><td className="px-4 py-8 text-center text-muted" colSpan={6}>No fee payment records available.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6">
          <h2 className="mastersoft-section-title">Payment Status</h2>
          <div className="mt-4 divide-y divide-line/60 rounded-md border border-line/70 bg-white">
            {transactions.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">No online transactions started.</p>
            ) : transactions.map((transaction) => (
              <div key={transaction.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-ink">{transaction.gateway_order_id || "Gateway order"}</p>
                  <p className="text-xs text-muted">{transaction.provider} - {transaction.gateway_payment_id || "Awaiting payment"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={statusBadge(transaction.status)}>{transaction.status}</Badge>
                  <span className="font-semibold text-ink">{formatMoney(transaction.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h2 className="mastersoft-section-title">Previous Receipts Information</h2>
          <div className="mt-4 divide-y divide-line/60 rounded-md border border-line/70 bg-white">
            {payments.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">No previous receipt records available.</p>
            ) : payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-ink">{payment.fee_title ?? "Academic Fees"}</p>
                  <p className="text-xs capitalize text-muted">{payment.payment_method} - {payment.reference_number || "No reference"}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-ink">{formatMoney(payment.amount_paid)}</p>
                  <p className="text-xs text-muted">{formatDate(payment.paid_on)}</p>
                  <button
                    type="button"
                    onClick={async () => {
                      const blob = await paymentApi.downloadReceipt(payment.id);
                      downloadStudentBlob(blob, `${payment.receipt_number || "receipt"}.pdf`);
                    }}
                    className="mt-2 rounded-md border border-line/70 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent-soft"
                  >
                    Download Receipt
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function NoticeList({ items }: { items: Announcement[] }) {
  if (items.length === 0) return <EmptyState label="No notices published yet." />;
  return (
    <section className="surface overflow-hidden shadow-soft">
      <div className="divide-y divide-line/50">
        {items.map((notice) => (
          <article key={notice.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">{notice.audience}</p>
                <h3 className="mt-1 font-semibold text-ink">{notice.title}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{notice.message}</p>
              </div>
              <span className="text-xs text-muted">{formatDate(notice.publish_on)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DocumentsPanel({
  documents,
  admitCards,
  payments,
}: {
  documents: DocumentRecord[];
  admitCards: AdmitCard[];
  payments: Payment[];
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <section className="surface overflow-hidden shadow-soft">
        <PanelHeader title="Uploaded Documents" icon={FileText} />
        <div className="divide-y divide-line/50">
          {documents.map((document) => (
            <div key={document.id} className="px-4 py-3 text-sm">
              <p className="font-semibold text-ink">{document.title}</p>
              <p className="text-xs text-muted">{document.document_type} - {statusLabel(document.status)}</p>
            </div>
          ))}
          {documents.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">No documents uploaded yet.</p>}
        </div>
      </section>
      <section className="surface overflow-hidden shadow-soft">
        <PanelHeader title="Admit Cards" icon={BadgeCheck} />
        <div className="divide-y divide-line/50">
          {admitCards.map((card) => (
            <div key={card.id} className="px-4 py-3 text-sm">
              <p className="font-semibold text-ink">{card.exam_name}</p>
              <p className="text-xs text-muted">{formatDate(card.exam_date)} - {card.status}</p>
            </div>
          ))}
          {admitCards.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">No admit cards issued yet.</p>}
        </div>
      </section>
      <section className="surface overflow-hidden shadow-soft">
        <PanelHeader title="Receipts" icon={ReceiptText} />
        <div className="divide-y divide-line/50">
          {payments.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-semibold text-ink">{payment.receipt_number || payment.fee_title || "Receipt"}</p>
                <p className="text-xs text-muted">{formatMoney(payment.amount_paid)} - {formatDate(payment.paid_on)}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const blob = await paymentApi.downloadReceipt(payment.id);
                  downloadStudentBlob(blob, `${payment.receipt_number || "receipt"}.pdf`);
                }}
                className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line/70 px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-50"
              >
                <Download size={13} />
                Download Receipt
              </button>
            </div>
          ))}
          {payments.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">No receipts generated yet.</p>}
        </div>
      </section>
    </div>
  );
}

function ParentViewPanel({
  student,
  attendancePct,
  attendance,
  fees,
  payments,
  results,
  notices,
  assignments,
  submissions,
  documents,
}: {
  student: Student;
  attendancePct: number;
  attendance: AttendanceRecord[];
  fees: FeeAssignment[];
  payments: Payment[];
  results: ResultRecord[];
  notices: Announcement[];
  assignments: AssignedWork[];
  submissions: AssignmentSubmission[];
  documents: DocumentRecord[];
}) {
  const pendingFees = fees.filter((fee) => fee.status !== "paid");
  const pendingAssignments = assignments.filter((assignment) => !submissions.some((submission) => submission.assignment === assignment.id));
  return (
    <div className="space-y-5">
      <section className="surface p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Parent View</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">{student.full_name}</h2>
            <p className="mt-1 text-sm text-muted">{student.section_label} - {student.admission_number}</p>
          </div>
          <Badge variant={student.status === "active" ? "success" : "neutral"}>{student.status}</Badge>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="surface p-4 shadow-soft"><p className="text-sm text-muted">Attendance</p><p className="mt-2 text-2xl font-semibold text-ink">{attendancePct}%</p></div>
        <div className="surface p-4 shadow-soft"><p className="text-sm text-muted">Pending Fees</p><p className="mt-2 text-2xl font-semibold text-ink">{formatMoney(pendingFees.reduce((sum, fee) => sum + amountValue(fee.outstanding_amount ?? fee.amount), 0))}</p></div>
        <div className="surface p-4 shadow-soft"><p className="text-sm text-muted">Pending Assignments</p><p className="mt-2 text-2xl font-semibold text-ink">{pendingAssignments.length}</p></div>
        <div className="surface p-4 shadow-soft"><p className="text-sm text-muted">Latest Result</p><p className="mt-2 text-2xl font-semibold text-ink">{results[0]?.grade || "NA"}</p></div>
      </section>
      <section className="grid gap-5 xl:grid-cols-3">
        <SummaryList title="Attendance" items={attendance.slice(0, 5).map((item) => `${formatDate(item.date)} - ${statusLabel(item.status)}`)} />
        <SummaryList title="Fees & Receipts" items={[...pendingFees.map((fee) => `${fee.title} pending ${formatMoney(fee.outstanding_amount ?? fee.amount)}`), ...payments.slice(0, 3).map((payment) => `${payment.receipt_number || "Receipt"} ${formatMoney(payment.amount_paid)}`)]} />
        <SummaryList title="Notices" items={notices.slice(0, 5).map((notice) => notice.title)} />
        <SummaryList title="Assignments" items={assignments.slice(0, 5).map((assignment) => `${assignment.title} - ${statusLabel(submissions.find((submission) => submission.assignment === assignment.id)?.status || "pending")}`)} />
        <SummaryList title="Results" items={results.slice(0, 5).map((result) => `${result.exam_name} ${result.subject}: ${result.score}/${result.max_score}`)} />
        <SummaryList title="Documents" items={documents.slice(0, 5).map((document) => document.title)} />
      </section>
    </div>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="surface overflow-hidden shadow-soft">
      <PanelHeader title={title} />
      <div className="divide-y divide-line/50">
        {items.map((item) => <p key={item} className="px-4 py-3 text-sm text-muted">{item}</p>)}
        {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">No records available.</p>}
      </div>
    </section>
  );
}

function ResourceList({ items }: { items: LearningResource[] }) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function downloadResource(item: LearningResource) {
    setBusyId(item.id);
    setError("");
    try {
      const blob = await learningResourceApi.download(item.id);
      downloadStudentBlob(blob, item.file_name || `${item.title}.pdf`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to download notes.");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) return <EmptyState label="No resources or notes published yet." />;

  return (
    <section className="space-y-3">
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <article key={item.id} className="surface p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">{item.subject}</p>
              <h3 className="mt-1 font-semibold text-ink">{item.title}</h3>
            </div>
            <Badge variant="info">{formatResourceType(item.resource_type)}</Badge>
          </div>
          {item.description && <p className="mt-3 text-sm text-muted">{item.description}</p>}
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs text-muted">{formatDate(item.published_on)}</span>
            <button
              type="button"
              onClick={() => downloadResource(item)}
              disabled={busyId === item.id}
              className="flex min-h-9 items-center gap-1.5 rounded-md border border-line/70 px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-50 disabled:opacity-60"
            >
              <Download size={12} />
              Download Notes
            </button>
          </div>
        </article>
      ))}
      </div>
    </section>
  );
}

function AdmitCardPanel({ card }: { card?: AdmitCard }) {
  if (!card) return <EmptyState label="No admit card issued yet." />;

  return (
    <section className="surface p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line/60 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Admit Card</p>
          <h2 className="display-font mt-1 text-2xl font-bold text-ink">{card.exam_name}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant={statusBadge(card.status)}>{card.status}</Badge>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
              Roll No. {card.roll_number}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-2xl border border-line/70 bg-white px-4 py-2 text-sm font-medium text-muted transition hover:bg-slate-50 hover:text-ink"
        >
          <Printer size={14} />
          Print
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-line/70 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Student</p>
          <p className="mt-2 font-semibold text-ink">{card.student_name}</p>
          <p className="mt-1 text-sm text-muted">{card.admission_number} - {card.section_label}</p>
        </div>
        <div className="rounded-2xl border border-line/70 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Schedule</p>
          <p className="mt-2 flex items-center gap-2 font-semibold text-ink">
            <CalendarDays size={15} className="text-teal-600" />
            {formatDate(card.exam_date)}
          </p>
          <p className="mt-1 text-sm text-muted">Reporting {card.reporting_time?.slice(0, 5)}</p>
        </div>
        <div className="rounded-2xl border border-line/70 bg-white p-4 md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Venue</p>
          <p className="mt-2 flex items-center gap-2 font-semibold text-ink">
            <MapPin size={15} className="text-teal-600" />
            {card.venue}
          </p>
        </div>
      </div>

      {card.instructions && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">Instructions</p>
          <p className="mt-2 text-sm text-amber-800">{card.instructions}</p>
        </div>
      )}
    </section>
  );
}
