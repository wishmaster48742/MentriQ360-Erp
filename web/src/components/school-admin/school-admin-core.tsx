"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  Megaphone,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  Upload,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";

import { Badge, statusBadge, statusLabel } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { WorkspacePlaceholder } from "@/components/ui/workspace-placeholder";
import {
  ApiError,
  announcementApi,
  attendanceApi,
  examScheduleApi,
  examSubjectSetupApi,
  examTypeApi,
  reportApi,
  resultRecordApi,
  schoolApi,
  sectionApi,
  sessionApi,
  staffAttendanceApi,
  staffProfileApi,
  studentApi,
  subjectApi,
  teacherSubjectAllocationApi,
  timetableApi,
  userApi,
  type AcademicSession,
  type Announcement,
  type AttendanceRecord,
  type AttendanceStatus,
  type ClassSection,
  type DashboardSummary,
  type ERPUser,
  type ExamSchedule,
  type ExamSubjectSetup,
  type ExamType,
  type ResultRecord,
  type School,
  type StaffAttendanceRecord,
  type StaffAttendanceStatus,
  type StaffProfile,
  type Student,
  type Subject,
  type TeacherSubjectAllocation,
  type TimetableSlot,
  type UserRole,
} from "@/lib/api";

export type SchoolAdminModule = "dashboard" | "students" | "staff" | "classes" | "attendance" | "exams" | "notices";

type ModalKind =
  | "student"
  | "staff"
  | "session"
  | "section"
  | "subject"
  | "allocation"
  | "timetable"
  | "studentAttendance"
  | "staffAttendance"
  | "examType"
  | "marks"
  | "schedule"
  | "result"
  | "notice"
  | null;

type StudentForm = {
  id?: number;
  campus: number;
  section: number;
  admission_number: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  father_name: string;
  mother_name: string;
  contact_email: string;
  phone_number: string;
  address: string;
  status: "active" | "inactive" | "alumni";
};

type StaffForm = {
  id?: number;
  mode: "teacher" | "staff";
  campus: number;
  user: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  employee_code: string;
  designation: string;
  department: string;
  employment_type: "full_time" | "part_time" | "contract";
  joining_date: string;
  qualification: string;
  emergency_contact: string;
  status: "active" | "inactive" | "exited";
};

type SessionForm = {
  id?: number;
  campus: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

type SectionForm = {
  id?: number;
  campus: number;
  session: number;
  grade_name: string;
  section_name: string;
  class_teacher: number | null;
};

type SubjectForm = {
  id?: number;
  campus: number;
  name: string;
  code: string;
  grade_name: string;
  description: string;
  is_active: boolean;
};

type AllocationForm = {
  id?: number;
  campus: number;
  section: number;
  teacher: number;
  subject: string;
  weekly_periods: number;
  is_active: boolean;
};

type TimetableForm = {
  id?: number;
  campus: number;
  section: number;
  teacher: number | null;
  subject: string;
  day_of_week: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  start_time: string;
  end_time: string;
  room: string;
  effective_from: string;
  effective_to: string | null;
};

type StudentAttendanceForm = {
  section: number;
  date: string;
  subject: string;
  capture_method: "manual" | "face_recognition" | "fingerprint" | "card_scan";
};

type StaffAttendanceForm = {
  id?: number;
  campus: number;
  staff_user: number;
  date: string;
  clock_in: string;
  clock_out: string;
  status: StaffAttendanceStatus;
  notes: string;
};

type ExamTypeForm = {
  id?: number;
  campus: number;
  name: string;
  description: string;
  is_active: boolean;
};

type MarksForm = {
  id?: number;
  campus: number;
  exam_type: number;
  section: number;
  subject: number;
  max_marks: string;
  pass_marks: string;
  weightage: string;
  is_active: boolean;
};

type ScheduleForm = {
  id?: number;
  campus: number;
  exam_type: number;
  section: number;
  subject: number;
  title: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  max_marks: string;
  venue: string;
  instructions: string;
  status: "draft" | "published" | "archived";
};

type ResultForm = {
  id?: number;
  student: number;
  exam_name: string;
  subject: string;
  score: string;
  max_score: string;
  grade: string;
  remarks: string;
  published_on: string;
  is_published: boolean;
};

type NoticeForm = {
  id?: number;
  title: string;
  message: string;
  audience: "all" | "admins" | "staff" | "learners";
  is_active: boolean;
};

const moduleMeta: Record<SchoolAdminModule, { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  dashboard: { label: "Dashboard", icon: ClipboardCheck },
  students: { label: "Students", icon: GraduationCap },
  staff: { label: "Teachers & Staff", icon: Users },
  classes: { label: "Classes", icon: FileText },
  attendance: { label: "Attendance", icon: ClipboardCheck },
  exams: { label: "Exams & Results", icon: FileSpreadsheet },
  notices: { label: "Notices", icon: Megaphone },
};

const today = () => new Date().toISOString().slice(0, 10);

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function includesSearch(values: Array<string | number | null | undefined>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

function currency(value?: string) {
  return `INR ${Number(value ?? 0).toLocaleString("en-IN")}`;
}

function teacherName(users: ERPUser[], id: number | null | undefined) {
  if (!id) return "Unassigned";
  const user = users.find((item) => item.id === id);
  return user?.full_name || user?.username || "Unassigned";
}

function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
}) {
  const variants = {
    primary: "border-ink bg-ink text-white hover:bg-slate-800",
    secondary: "border-line bg-white text-ink hover:bg-slate-50",
    danger: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
    ghost: "border-transparent bg-transparent text-ink hover:bg-slate-50",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-ink";

function SelectField({
  value,
  onChange,
  children,
  required = true,
}: {
  value: string | number;
  onChange: (value: string) => void;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <select className={inputClass} value={String(value)} onChange={(event) => onChange(event.target.value)} required={required}>
      {children}
    </select>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted">{label}</td>
    </tr>
  );
}

function PhotoThumb({ src, label, size = "h-10 w-10" }: { src?: string; label: string; size?: string }) {
  if (src) {
    return (
      <span
        className={`${size} block shrink-0 rounded-lg border border-line/70 bg-white bg-cover bg-center shadow-sm`}
        style={{ backgroundImage: `url(${JSON.stringify(src)})` }}
        aria-label={label}
        role="img"
      />
    );
  }
  return (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-ink`}>
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

function SectionTitle({
  title,
  note,
  actions,
}: {
  title: string;
  note?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {note && <p className="mt-1 text-sm leading-6 text-muted">{note}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

function DataToolbar({
  search,
  setSearch,
  filter,
  setFilter,
  onReset,
}: {
  search: string;
  setSearch: (value: string) => void;
  filter: string;
  setFilter: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="mb-4 grid gap-2 md:grid-cols-[1fr_12rem_auto]">
      <label className="relative block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className={`${inputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" />
      </label>
      <label className="relative block">
        <Filter size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <select className={`${inputClass} pl-9`} value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <Button variant="secondary" onClick={onReset}><RefreshCcw size={16} />Reset</Button>
    </div>
  );
}

export function SchoolAdminCoreModules({
  module,
  onNavigate,
}: {
  module: SchoolAdminModule;
  onNavigate?: (module: SchoolAdminModule) => void;
}) {
  const [school, setSchool] = useState<School | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [users, setUsers] = useState<ERPUser[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [allocations, setAllocations] = useState<TeacherSubjectAllocation[]>([]);
  const [timetable, setTimetable] = useState<TimetableSlot[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [staffAttendance, setStaffAttendance] = useState<StaffAttendanceRecord[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [marksSetups, setMarksSetups] = useState<ExamSubjectSetup[]>([]);
  const [examSchedules, setExamSchedules] = useState<ExamSchedule[]>([]);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [notices, setNotices] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modal, setModal] = useState<ModalKind>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [viewStaffSummary, setViewStaffSummary] = useState<{ staff: StaffProfile; total: number; byStatus: Partial<Record<StaffAttendanceStatus, number>> } | null>(null);

  const schoolId = school?.schoolId ?? students[0]?.campus ?? sections[0]?.campus ?? 0;
  const activeSession = sessions.find((item) => item.is_active) ?? sessions[0];
  const teachers = users.filter((item) => item.role === "teacher");
  const staffUsers = users.filter((item) => item.role !== "student" && item.role !== "super_admin");
  const currentModule = moduleMeta[module];

  const defaultStudentForm = useCallback((): StudentForm => ({
    campus: schoolId,
    section: sections[0]?.id ?? 0,
    admission_number: "",
    first_name: "",
    last_name: "",
    date_of_birth: "2015-01-01",
    father_name: "",
    mother_name: "",
    contact_email: "",
    phone_number: "",
    address: "",
    status: "active",
  }), [schoolId, sections]);

  const defaultStaffForm = useCallback((mode: "teacher" | "staff" = "teacher"): StaffForm => ({
    mode,
    campus: schoolId,
    user: 0,
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    employee_code: "",
    designation: mode === "teacher" ? "Teacher" : "Staff",
    department: mode === "teacher" ? "Academics" : "Operations",
    employment_type: "full_time",
    joining_date: today(),
    qualification: "",
    emergency_contact: "",
    status: "active",
  }), [schoolId]);

  const defaultSessionForm = useCallback((): SessionForm => ({
    campus: schoolId,
    name: "2026-27",
    start_date: "2026-04-01",
    end_date: "2027-03-31",
    is_active: true,
  }), [schoolId]);

  const defaultSectionForm = useCallback((): SectionForm => ({
    campus: schoolId,
    session: activeSession?.id ?? 0,
    grade_name: "",
    section_name: "A",
    class_teacher: teachers[0]?.id ?? null,
  }), [activeSession?.id, schoolId, teachers]);

  const defaultSubjectForm = useCallback((): SubjectForm => ({
    campus: schoolId,
    name: "",
    code: "",
    grade_name: "",
    description: "",
    is_active: true,
  }), [schoolId]);

  const defaultAllocationForm = useCallback((): AllocationForm => ({
    campus: schoolId,
    section: sections[0]?.id ?? 0,
    teacher: teachers[0]?.id ?? 0,
    subject: subjects[0]?.name ?? "",
    weekly_periods: 5,
    is_active: true,
  }), [schoolId, sections, subjects, teachers]);

  const defaultTimetableForm = useCallback((): TimetableForm => ({
    campus: schoolId,
    section: sections[0]?.id ?? 0,
    teacher: teachers[0]?.id ?? null,
    subject: subjects[0]?.name ?? "",
    day_of_week: 1,
    start_time: "09:00",
    end_time: "09:40",
    room: "",
    effective_from: today(),
    effective_to: null,
  }), [schoolId, sections, subjects, teachers]);

  const defaultStudentAttendanceForm = useCallback((): StudentAttendanceForm => ({
    section: sections[0]?.id ?? 0,
    date: today(),
    subject: "",
    capture_method: "manual",
  }), [sections]);

  const defaultStaffAttendanceForm = useCallback((): StaffAttendanceForm => ({
    campus: schoolId,
    staff_user: staffUsers[0]?.id ?? teachers[0]?.id ?? 0,
    date: today(),
    clock_in: "08:30",
    clock_out: "",
    status: "present",
    notes: "",
  }), [schoolId, staffUsers, teachers]);

  const defaultExamTypeForm = useCallback((): ExamTypeForm => ({
    campus: schoolId,
    name: "",
    description: "",
    is_active: true,
  }), [schoolId]);

  const defaultMarksForm = useCallback((): MarksForm => ({
    campus: schoolId,
    exam_type: examTypes[0]?.id ?? 0,
    section: sections[0]?.id ?? 0,
    subject: subjects[0]?.id ?? 0,
    max_marks: "100.00",
    pass_marks: "33.00",
    weightage: "100.00",
    is_active: true,
  }), [examTypes, schoolId, sections, subjects]);

  const defaultScheduleForm = useCallback((): ScheduleForm => ({
    campus: schoolId,
    exam_type: examTypes[0]?.id ?? 0,
    section: sections[0]?.id ?? 0,
    subject: subjects[0]?.id ?? 0,
    title: "",
    exam_date: today(),
    start_time: "09:00",
    end_time: "10:00",
    max_marks: "100.00",
    venue: "",
    instructions: "",
    status: "draft",
  }), [examTypes, schoolId, sections, subjects]);

  const defaultResultForm = useCallback((): ResultForm => ({
    student: students[0]?.id ?? 0,
    exam_name: examTypes[0]?.name ?? "",
    subject: subjects[0]?.name ?? "",
    score: "0.00",
    max_score: "100.00",
    grade: "",
    remarks: "",
    published_on: today(),
    is_published: false,
  }), [examTypes, students, subjects]);

  const defaultNoticeForm = (): NoticeForm => ({
    title: "",
    message: "",
    audience: "all",
    is_active: true,
  });

  const [studentForm, setStudentForm] = useState<StudentForm>(() => ({
    campus: 0,
    section: 0,
    admission_number: "",
    first_name: "",
    last_name: "",
    date_of_birth: "2015-01-01",
    father_name: "",
    mother_name: "",
    contact_email: "",
    phone_number: "",
    address: "",
    status: "active",
  }));
  const [staffForm, setStaffForm] = useState<StaffForm>(() => ({
    mode: "teacher",
    campus: 0,
    user: 0,
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    employee_code: "",
    designation: "Teacher",
    department: "Academics",
    employment_type: "full_time",
    joining_date: today(),
    qualification: "",
    emergency_contact: "",
    status: "active",
  }));
  const [sessionForm, setSessionForm] = useState<SessionForm>(() => ({ campus: 0, name: "2026-27", start_date: "2026-04-01", end_date: "2027-03-31", is_active: true }));
  const [sectionForm, setSectionForm] = useState<SectionForm>(() => ({ campus: 0, session: 0, grade_name: "", section_name: "A", class_teacher: null }));
  const [subjectForm, setSubjectForm] = useState<SubjectForm>(() => ({ campus: 0, name: "", code: "", grade_name: "", description: "", is_active: true }));
  const [allocationForm, setAllocationForm] = useState<AllocationForm>(() => ({ campus: 0, section: 0, teacher: 0, subject: "", weekly_periods: 5, is_active: true }));
  const [timetableForm, setTimetableForm] = useState<TimetableForm>(() => ({ campus: 0, section: 0, teacher: null, subject: "", day_of_week: 1, start_time: "09:00", end_time: "09:40", room: "", effective_from: today(), effective_to: null }));
  const [studentAttendanceForm, setStudentAttendanceForm] = useState<StudentAttendanceForm>(() => ({ section: 0, date: today(), subject: "", capture_method: "manual" }));
  const [studentAttendanceStatuses, setStudentAttendanceStatuses] = useState<Record<number, AttendanceStatus>>({});
  const [staffAttendanceForm, setStaffAttendanceForm] = useState<StaffAttendanceForm>(() => ({ campus: 0, staff_user: 0, date: today(), clock_in: "08:30", clock_out: "", status: "present", notes: "" }));
  const [examTypeForm, setExamTypeForm] = useState<ExamTypeForm>(() => ({ campus: 0, name: "", description: "", is_active: true }));
  const [marksForm, setMarksForm] = useState<MarksForm>(() => ({ campus: 0, exam_type: 0, section: 0, subject: 0, max_marks: "100.00", pass_marks: "33.00", weightage: "100.00", is_active: true }));
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>(() => ({ campus: 0, exam_type: 0, section: 0, subject: 0, title: "", exam_date: today(), start_time: "09:00", end_time: "10:00", max_marks: "100.00", venue: "", instructions: "", status: "draft" }));
  const [resultForm, setResultForm] = useState<ResultForm>(() => ({ student: 0, exam_name: "", subject: "", score: "0.00", max_score: "100.00", grade: "", remarks: "", published_on: today(), is_published: false }));
  const [noticeForm, setNoticeForm] = useState<NoticeForm>(() => defaultNoticeForm());

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [
        schoolRes,
        summaryRes,
        sessionsRes,
        sectionsRes,
        usersRes,
        studentsRes,
        staffRes,
        subjectsRes,
        allocationsRes,
        timetableRes,
        attendanceRes,
        staffAttendanceRes,
        examTypeRes,
        marksRes,
        scheduleRes,
        resultRes,
        noticesRes,
      ] = await Promise.all([
        schoolApi.profile(),
        reportApi.summary(),
        sessionApi.list(),
        sectionApi.list(),
        userApi.list(),
        studentApi.list(),
        staffProfileApi.list(),
        subjectApi.list(),
        teacherSubjectAllocationApi.list(),
        timetableApi.list(),
        attendanceApi.list(),
        staffAttendanceApi.list(),
        examTypeApi.list(),
        examSubjectSetupApi.list(),
        examScheduleApi.list(),
        resultRecordApi.list(),
        announcementApi.list(),
      ]);
      setSchool(schoolRes);
      setSummary(summaryRes);
      setSessions(sessionsRes);
      setSections(sectionsRes);
      setUsers(usersRes);
      setStudents(studentsRes);
      setStaffProfiles(staffRes);
      setSubjects(subjectsRes);
      setAllocations(allocationsRes);
      setTimetable(timetableRes);
      setAttendance(attendanceRes);
      setStaffAttendance(staffAttendanceRes);
      setExamTypes(examTypeRes);
      setMarksSetups(marksRes);
      setExamSchedules(scheduleRes);
      setResults(resultRes);
      setNotices(noticesRes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load school admin modules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!schoolId) return;
    setStudentForm((form) => ({ ...form, campus: form.campus || schoolId, section: form.section || sections[0]?.id || 0 }));
    setStaffForm((form) => ({ ...form, campus: form.campus || schoolId }));
    setSessionForm((form) => ({ ...form, campus: form.campus || schoolId }));
    setSectionForm((form) => ({ ...form, campus: form.campus || schoolId, session: form.session || activeSession?.id || 0 }));
    setSubjectForm((form) => ({ ...form, campus: form.campus || schoolId }));
    setAllocationForm((form) => ({ ...form, campus: form.campus || schoolId, section: form.section || sections[0]?.id || 0, teacher: form.teacher || teachers[0]?.id || 0, subject: form.subject || subjects[0]?.name || "" }));
    setTimetableForm((form) => ({ ...form, campus: form.campus || schoolId, section: form.section || sections[0]?.id || 0, teacher: form.teacher || teachers[0]?.id || null, subject: form.subject || subjects[0]?.name || "" }));
    setStudentAttendanceForm((form) => ({ ...form, section: form.section || sections[0]?.id || 0 }));
    setStaffAttendanceForm((form) => ({ ...form, campus: form.campus || schoolId, staff_user: form.staff_user || staffUsers[0]?.id || teachers[0]?.id || 0 }));
    setExamTypeForm((form) => ({ ...form, campus: form.campus || schoolId }));
    setMarksForm((form) => ({ ...form, campus: form.campus || schoolId, exam_type: form.exam_type || examTypes[0]?.id || 0, section: form.section || sections[0]?.id || 0, subject: form.subject || subjects[0]?.id || 0 }));
    setScheduleForm((form) => ({ ...form, campus: form.campus || schoolId, exam_type: form.exam_type || examTypes[0]?.id || 0, section: form.section || sections[0]?.id || 0, subject: form.subject || subjects[0]?.id || 0 }));
    setResultForm((form) => ({ ...form, student: form.student || students[0]?.id || 0, exam_name: form.exam_name || examTypes[0]?.name || "", subject: form.subject || subjects[0]?.name || "" }));
  }, [activeSession?.id, examTypes, schoolId, sections, staffUsers, students, subjects, teachers]);

  const sectionStudents = useMemo(
    () => students.filter((student) => student.section === studentAttendanceForm.section && student.status === "active"),
    [studentAttendanceForm.section, students]
  );

  useEffect(() => {
    if (!sectionStudents.length) return;
    const statuses: Record<number, AttendanceStatus> = {};
    for (const student of sectionStudents) {
      const existing = attendance.find((item) => item.student === student.id && item.date === studentAttendanceForm.date && item.subject === studentAttendanceForm.subject);
      statuses[student.id] = existing?.status ?? "present";
    }
    setStudentAttendanceStatuses(statuses);
  }, [attendance, sectionStudents, studentAttendanceForm.date, studentAttendanceForm.subject]);

  function resetFilters() {
    setSearch("");
    setFilter("");
  }

  function showSuccess(message: string) {
    setSuccess(message);
    window.setTimeout(() => setSuccess(""), 3500);
  }

  async function runAction(label: string, action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await loadData();
      setModal(null);
      showSuccess(label);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  function openStudent(student?: Student) {
    if (student) {
      setStudentForm({
        id: student.id,
        campus: student.campus,
        section: student.section,
        admission_number: student.admission_number,
        first_name: student.first_name,
        last_name: student.last_name,
        date_of_birth: student.date_of_birth,
        father_name: student.father_name,
        mother_name: student.mother_name,
        contact_email: student.contact_email,
        phone_number: student.phone_number,
        address: student.address,
        status: student.status,
      });
    } else {
      setStudentForm(defaultStudentForm());
    }
    setModal("student");
  }

  function openStaff(profile?: StaffProfile, mode: "teacher" | "staff" = "teacher") {
    if (profile) {
      setStaffForm({
        id: profile.id,
        mode: profile.user_role === "teacher" ? "teacher" : "staff",
        campus: profile.campus,
        user: profile.user,
        username: "",
        email: "",
        first_name: "",
        last_name: "",
        password: "",
        employee_code: profile.employee_code,
        designation: profile.designation,
        department: profile.department,
        employment_type: profile.employment_type,
        joining_date: profile.joining_date,
        qualification: profile.qualification,
        emergency_contact: profile.emergency_contact,
        status: profile.status,
      });
    } else {
      setStaffForm(defaultStaffForm(mode));
    }
    setModal("staff");
  }

  function openSession(session?: AcademicSession) {
    setSessionForm(session ? { id: session.id, campus: session.campus, name: session.name, start_date: session.start_date, end_date: session.end_date, is_active: session.is_active } : defaultSessionForm());
    setModal("session");
  }

  function openSection(section?: ClassSection) {
    setSectionForm(section ? { id: section.id, campus: section.campus, session: section.session, grade_name: section.grade_name, section_name: section.section_name, class_teacher: section.class_teacher } : defaultSectionForm());
    setModal("section");
  }

  function openSubject(subject?: Subject) {
    setSubjectForm(subject ? { id: subject.id, campus: subject.campus, name: subject.name, code: subject.code, grade_name: subject.grade_name, description: subject.description, is_active: subject.is_active } : defaultSubjectForm());
    setModal("subject");
  }

  function openAllocation(allocation?: TeacherSubjectAllocation) {
    setAllocationForm(allocation ? { id: allocation.id, campus: allocation.campus, section: allocation.section, teacher: allocation.teacher, subject: allocation.subject, weekly_periods: allocation.weekly_periods, is_active: allocation.is_active } : defaultAllocationForm());
    setModal("allocation");
  }

  function openTimetable(slot?: TimetableSlot) {
    setTimetableForm(slot ? { id: slot.id, campus: slot.campus, section: slot.section, teacher: slot.teacher, subject: slot.subject, day_of_week: slot.day_of_week, start_time: slot.start_time.slice(0, 5), end_time: slot.end_time.slice(0, 5), room: slot.room, effective_from: slot.effective_from, effective_to: slot.effective_to } : defaultTimetableForm());
    setModal("timetable");
  }

  function openStudentAttendance() {
    setStudentAttendanceForm(defaultStudentAttendanceForm());
    setModal("studentAttendance");
  }

  function openStaffAttendance() {
    setStaffAttendanceForm(defaultStaffAttendanceForm());
    setModal("staffAttendance");
  }

  function openExamType(examType?: ExamType) {
    setExamTypeForm(examType ? { id: examType.id, campus: examType.campus, name: examType.name, description: examType.description, is_active: examType.is_active } : defaultExamTypeForm());
    setModal("examType");
  }

  function openMarks(setup?: ExamSubjectSetup) {
    setMarksForm(setup ? { id: setup.id, campus: setup.campus, exam_type: setup.exam_type, section: setup.section, subject: setup.subject, max_marks: setup.max_marks, pass_marks: setup.pass_marks, weightage: setup.weightage, is_active: setup.is_active } : defaultMarksForm());
    setModal("marks");
  }

  function openSchedule(schedule?: ExamSchedule) {
    setScheduleForm(schedule ? { id: schedule.id, campus: schedule.campus, exam_type: schedule.exam_type, section: schedule.section, subject: schedule.subject, title: schedule.title, exam_date: schedule.exam_date, start_time: schedule.start_time.slice(0, 5), end_time: schedule.end_time.slice(0, 5), max_marks: schedule.max_marks, venue: schedule.venue, instructions: schedule.instructions, status: schedule.status } : defaultScheduleForm());
    setModal("schedule");
  }

  function openResult(result?: ResultRecord) {
    setResultForm(result ? { id: result.id, student: result.student, exam_name: result.exam_name, subject: result.subject, score: result.score, max_score: result.max_score, grade: result.grade, remarks: result.remarks, published_on: result.published_on, is_published: result.is_published } : defaultResultForm());
    setModal("result");
  }

  function openNotice(notice?: Announcement) {
    setNoticeForm(notice ? { id: notice.id, title: notice.title, message: notice.message, audience: notice.audience, is_active: notice.is_active } : defaultNoticeForm());
    setModal("notice");
  }

  async function saveStudent(event: React.FormEvent) {
    event.preventDefault();
    await runAction(studentForm.id ? "Student updated." : "Student added.", async () => {
      const payload = { ...studentForm };
      if (!payload.admission_number.trim()) delete (payload as Partial<StudentForm>).admission_number;
      if (studentForm.id) await studentApi.update(studentForm.id, payload);
      else await studentApi.create(payload);
    });
  }

  async function saveStaff(event: React.FormEvent) {
    event.preventDefault();
    await runAction(staffForm.id ? "Staff profile updated." : "Staff profile added.", async () => {
      let userId = staffForm.user;
      if (!staffForm.id && !userId) {
        const role: UserRole = staffForm.mode === "teacher" ? "teacher" : "account";
        const user = await userApi.create({
          username: staffForm.username,
          email: staffForm.email,
          first_name: staffForm.first_name,
          last_name: staffForm.last_name,
          password: staffForm.password,
          role,
          campus_ids: [staffForm.campus],
        });
        userId = user.id;
      }
      const payload = {
        campus: staffForm.campus,
        user: userId,
        employee_code: staffForm.employee_code || undefined,
        designation: staffForm.designation,
        department: staffForm.department,
        employment_type: staffForm.employment_type,
        joining_date: staffForm.joining_date,
        qualification: staffForm.qualification,
        emergency_contact: staffForm.emergency_contact,
        status: staffForm.status,
      };
      if (staffForm.id) await staffProfileApi.update(staffForm.id, payload);
      else await staffProfileApi.create(payload);
    });
  }

  async function saveSession(event: React.FormEvent) {
    event.preventDefault();
    await runAction(sessionForm.id ? "Session updated." : "Session added.", async () => {
      if (sessionForm.id) await sessionApi.update(sessionForm.id, sessionForm);
      else await sessionApi.create(sessionForm);
    });
  }

  async function saveSection(event: React.FormEvent) {
    event.preventDefault();
    await runAction(sectionForm.id ? "Class section updated." : "Class section added.", async () => {
      if (sectionForm.id) await sectionApi.update(sectionForm.id, sectionForm);
      else await sectionApi.create(sectionForm);
    });
  }

  async function saveSubject(event: React.FormEvent) {
    event.preventDefault();
    await runAction(subjectForm.id ? "Subject updated." : "Subject added.", async () => {
      if (subjectForm.id) await subjectApi.update(subjectForm.id, subjectForm);
      else await subjectApi.create(subjectForm);
    });
  }

  async function saveAllocation(event: React.FormEvent) {
    event.preventDefault();
    await runAction(allocationForm.id ? "Subject teacher updated." : "Subject teacher assigned.", async () => {
      if (allocationForm.id) await teacherSubjectAllocationApi.update(allocationForm.id, allocationForm);
      else await teacherSubjectAllocationApi.create(allocationForm);
    });
  }

  async function saveTimetable(event: React.FormEvent) {
    event.preventDefault();
    await runAction(timetableForm.id ? "Timetable updated." : "Timetable slot added.", async () => {
      if (timetableForm.id) await timetableApi.update(timetableForm.id, timetableForm);
      else await timetableApi.create(timetableForm);
    });
  }

  async function saveStudentAttendance(event: React.FormEvent) {
    event.preventDefault();
    await runAction("Student attendance saved.", async () => {
      await attendanceApi.bulkUpsert({
        section: studentAttendanceForm.section,
        date: studentAttendanceForm.date,
        subject: studentAttendanceForm.subject,
        capture_method: studentAttendanceForm.capture_method,
        records: sectionStudents.map((student) => ({
          student: student.id,
          status: studentAttendanceStatuses[student.id] ?? "present",
        })),
      });
    });
  }

  async function saveStaffAttendance(event: React.FormEvent) {
    event.preventDefault();
    await runAction(staffAttendanceForm.id ? "Staff attendance updated." : "Staff attendance saved.", async () => {
      const payload = {
        campus: staffAttendanceForm.campus,
        staff_user: staffAttendanceForm.staff_user,
        date: staffAttendanceForm.date,
        clock_in: staffAttendanceForm.clock_in || null,
        clock_out: staffAttendanceForm.clock_out || null,
        status: staffAttendanceForm.status,
        capture_method: "manual" as const,
        device: null,
        notes: staffAttendanceForm.notes,
      };
      if (staffAttendanceForm.id) await staffAttendanceApi.update(staffAttendanceForm.id, payload);
      else await staffAttendanceApi.create(payload);
    });
  }

  async function saveExamType(event: React.FormEvent) {
    event.preventDefault();
    await runAction(examTypeForm.id ? "Exam type updated." : "Exam type added.", async () => {
      if (examTypeForm.id) await examTypeApi.update(examTypeForm.id, examTypeForm);
      else await examTypeApi.create(examTypeForm);
    });
  }

  async function saveMarks(event: React.FormEvent) {
    event.preventDefault();
    await runAction(marksForm.id ? "Marks setup updated." : "Marks setup added.", async () => {
      if (marksForm.id) await examSubjectSetupApi.update(marksForm.id, marksForm);
      else await examSubjectSetupApi.create(marksForm);
    });
  }

  async function saveSchedule(event: React.FormEvent) {
    event.preventDefault();
    await runAction(scheduleForm.id ? "Exam schedule updated." : "Exam schedule added.", async () => {
      if (scheduleForm.id) await examScheduleApi.update(scheduleForm.id, scheduleForm);
      else await examScheduleApi.create(scheduleForm);
    });
  }

  async function saveResult(event: React.FormEvent) {
    event.preventDefault();
    await runAction(resultForm.id ? "Result updated." : "Result added.", async () => {
      if (resultForm.id) await resultRecordApi.update(resultForm.id, resultForm);
      else await resultRecordApi.create(resultForm);
    });
  }

  async function saveNotice(event: React.FormEvent) {
    event.preventDefault();
    await runAction(noticeForm.id ? "Notice updated." : "Notice created.", async () => {
      if (noticeForm.id) await announcementApi.update(noticeForm.id, noticeForm);
      else await announcementApi.create(noticeForm);
    });
  }

  async function removeRecord(label: string, action: () => Promise<void>) {
    if (!window.confirm(`Delete ${label}?`)) return;
    await runAction(`${label} deleted.`, action);
  }

  async function uploadStudentPhoto(student: Student, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await runAction("Student photo uploaded.", async () => {
      await studentApi.uploadPhoto(student.id, file);
    });
  }

  async function uploadStudentDocument(student: Student, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await runAction("Student document uploaded.", async () => {
      await studentApi.uploadDocument(student.id, file, `${student.full_name} document`, "student_document");
    });
  }

  async function uploadStaffPhoto(profile: StaffProfile, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await runAction("Staff photo uploaded.", async () => {
      await staffProfileApi.uploadPhoto(profile.id, file);
    });
  }

  async function uploadStaffDocument(profile: StaffProfile, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await runAction("Staff document uploaded.", async () => {
      await staffProfileApi.uploadDocument(profile.id, file, `${profile.user_name || profile.employee_code} document`, "staff_document");
    });
  }

  async function downloadStudentProfile(student: Student) {
    await runAction("Student profile downloaded.", async () => {
      const blob = await studentApi.downloadProfilePdf(student.id);
      downloadBlob(blob, `student-${student.admission_number}.pdf`);
    });
  }

  async function exportAttendance(kind: "student" | "staff", fileFormat: "pdf" | "excel") {
    await runAction(`${kind === "student" ? "Student" : "Staff"} attendance exported.`, async () => {
      const blob = kind === "student"
        ? await attendanceApi.export(fileFormat)
        : await staffAttendanceApi.export(fileFormat);
      downloadBlob(blob, `${kind}-attendance.${fileFormat === "pdf" ? "pdf" : "xls"}`);
    });
  }

  async function showStaffAttendanceSummary(profile: StaffProfile) {
    setBusy(true);
    setError("");
    try {
      const summaryRes = await staffProfileApi.attendanceSummary(profile.id);
      setViewStaffSummary({ staff: profile, total: summaryRes.total, byStatus: summaryRes.byStatus });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Attendance summary could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  const filteredStudents = students.filter((student) =>
    includesSearch([student.admission_number, student.full_name, student.section_label, student.phone_number], search)
    && (!filter || student.status === filter)
  );
  const filteredStaff = staffProfiles.filter((profile) =>
    includesSearch([profile.employee_code, profile.user_name, profile.designation, profile.department], search)
    && (!filter || profile.status === filter)
  );
  const filteredSubjects = subjects.filter((subject) =>
    includesSearch([subject.name, subject.code, subject.grade_name], search)
    && (!filter || (filter === "active" ? subject.is_active : filter === "inactive" ? !subject.is_active : true))
  );
  const filteredSchedules = examSchedules.filter((schedule) =>
    includesSearch([schedule.title, schedule.exam_type_name, schedule.subject_name, schedule.section_label], search)
    && (!filter || schedule.status === filter)
  );
  const filteredNotices = notices.filter((notice) =>
    includesSearch([notice.title, notice.message, notice.audience], search)
    && (!filter || (filter === "active" ? notice.is_active : filter === "inactive" ? !notice.is_active : true))
  );

  if (loading) {
    return <WorkspacePlaceholder title="School admin modules" detail="Preparing students, staff, classes, attendance, exams, and notices." />;
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{school?.schoolName ?? "School Admin"}</p>
            <h1 className="mt-1 text-2xl font-semibold text-ink">{currentModule.label}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(moduleMeta) as SchoolAdminModule[]).map((item) => {
              const Icon = moduleMeta[item].icon;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => onNavigate?.(item)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                    item === module ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:bg-slate-50"
                  }`}
                >
                  <Icon size={16} />
                  {moduleMeta[item].label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      {module === "dashboard" && renderDashboard()}
      {module === "students" && renderStudents()}
      {module === "staff" && renderStaff()}
      {module === "classes" && renderClasses()}
      {module === "attendance" && renderAttendance()}
      {module === "exams" && renderExams()}
      {module === "notices" && renderNotices()}

      {renderForms()}
      {renderViewModals()}
    </section>
  );

  function renderDashboard() {
    const cards = [
      { label: "Students", value: summary?.students.total ?? students.length, note: `${summary?.students.active ?? students.filter((item) => item.status === "active").length} active` },
      { label: "Teachers", value: summary?.users?.teachers ?? teachers.length, note: "Assigned to this school" },
      { label: "Staff", value: summary?.staff?.total ?? staffProfiles.length, note: `${summary?.staff?.active ?? staffProfiles.filter((item) => item.status === "active").length} active` },
      { label: "Classes", value: summary?.classes?.total ?? sections.length, note: `${subjects.length} subjects` },
      { label: "Student Attendance", value: summary?.attendance.today_present ?? 0, note: `${summary?.attendance.today_total ?? 0} records today` },
      { label: "Staff Attendance", value: summary?.staff_attendance?.today_present ?? 0, note: `${summary?.staff_attendance?.today_late ?? 0} late today` },
      { label: "Pending Fees", value: currency(summary?.fees.total_outstanding), note: `${summary?.fees.by_status.pending ?? 0} pending assignments` },
      { label: "Upcoming Exams", value: summary?.upcoming_exams?.length ?? examSchedules.filter((item) => item.exam_date >= today()).length, note: "Next schedules" },
    ];
    return (
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold text-ink">{card.value}</p>
              <p className="mt-1 text-sm text-muted">{card.note}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionTitle
              title="Quick Actions"
              actions={
                <>
                  <Button onClick={() => openStudent()}><Plus size={16} />Add Student</Button>
                  <Button onClick={() => openStaff(undefined, "teacher")}><Plus size={16} />Add Teacher</Button>
                  <Button onClick={() => openSection()}><Plus size={16} />Add Class</Button>
                  <Button onClick={() => openNotice()}><Plus size={16} />Create Notice</Button>
                </>
              }
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={openStudentAttendance}><ClipboardCheck size={16} />Student Attendance</Button>
              <Button variant="secondary" onClick={openStaffAttendance}><UserRound size={16} />Staff Attendance</Button>
              <Button variant="secondary" onClick={() => openSchedule()}><FileSpreadsheet size={16} />Exam Schedule</Button>
              <Button variant="secondary" onClick={() => onNavigate?.("notices")}><Megaphone size={16} />Notice List</Button>
            </div>
          </div>
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionTitle title="Upcoming Exams" />
            <div className="space-y-3">
              {(summary?.upcoming_exams ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No upcoming exams scheduled.</p>
              ) : (summary?.upcoming_exams ?? []).map((exam) => (
                <div key={exam.id} className="rounded-lg border border-line/70 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{exam.title}</p>
                    <Badge variant={statusBadge(exam.status)}>{statusLabel(exam.status)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">{exam.exam_date} at {exam.start_time} | {exam.section} | {exam.subject}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
          <SectionTitle title="Recent Notices" />
          <div className="grid gap-3 md:grid-cols-2">
            {(summary?.recent_notices ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted md:col-span-2">No notices published yet.</p>
            ) : (summary?.recent_notices ?? []).map((notice) => (
              <div key={notice.id} className="rounded-lg border border-line/70 px-3 py-2">
                <p className="text-sm font-semibold text-ink">{notice.title}</p>
                <p className="mt-1 text-xs text-muted">{statusLabel(notice.audience)} | {notice.campus}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderStudents() {
    return (
      <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
        <SectionTitle
          title="Student Management"
          note="Admissions, profiles, photos, documents, class assignment, deactivation, and profile PDF downloads."
          actions={
            <>
              <Button onClick={() => openStudent()}><Plus size={16} />Add</Button>
              <Button variant="secondary" onClick={() => window.history.back()}><ArrowLeft size={16} />Back</Button>
            </>
          }
        />
        <DataToolbar search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onReset={resetFilters} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {filteredStudents.length === 0 ? <EmptyRow colSpan={5} label="No students found." /> : filteredStudents.map((student) => (
                <tr key={student.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <PhotoThumb src={student.photo_url} label={student.full_name} />
                      <div>
                        <p className="font-semibold text-ink">{student.full_name}</p>
                        <p className="text-xs text-muted">{student.admission_number}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{student.section_label}</td>
                  <td className="px-4 py-3 text-muted">{student.phone_number || student.contact_email || "Not set"}</td>
                  <td className="px-4 py-3"><Badge variant={statusBadge(student.status)}>{statusLabel(student.status)}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="secondary" onClick={() => setViewStudent(student)}><Eye size={16} />View</Button>
                      <Button variant="secondary" onClick={() => openStudent(student)}><Pencil size={16} />Edit</Button>
                      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:bg-slate-50">
                        <Upload size={16} />Upload
                        <input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadStudentPhoto(student, event.target.files)} />
                      </label>
                      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:bg-slate-50">
                        <FileText size={16} />Document
                        <input type="file" className="sr-only" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => uploadStudentDocument(student, event.target.files)} />
                      </label>
                      <Button variant="secondary" onClick={() => downloadStudentProfile(student)}><Download size={16} />Download</Button>
                      <Button variant="danger" onClick={() => runAction("Student deactivated.", async () => { await studentApi.update(student.id, { status: "inactive" }); })}><Trash2 size={16} />Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderStaff() {
    return (
      <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
        <SectionTitle
          title="Teacher & Staff Management"
          note="Create teacher and staff profiles, upload records, assign subjects, and review attendance summaries."
          actions={
            <>
              <Button onClick={() => openStaff(undefined, "teacher")}><Plus size={16} />Add Teacher</Button>
              <Button onClick={() => openStaff(undefined, "staff")}><Plus size={16} />Add Staff</Button>
              <Button variant="secondary" onClick={() => window.history.back()}><ArrowLeft size={16} />Back</Button>
            </>
          }
        />
        <DataToolbar search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onReset={resetFilters} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Employment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {filteredStaff.length === 0 ? <EmptyRow colSpan={5} label="No teacher or staff profiles found." /> : filteredStaff.map((profile) => (
                <tr key={profile.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <PhotoThumb src={profile.photo_url} label={profile.user_name || "Staff"} />
                      <div>
                        <p className="font-semibold text-ink">{profile.user_name}</p>
                        <p className="text-xs text-muted">{profile.employee_code} | {statusLabel(profile.user_role ?? "staff")}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{profile.department || profile.designation}</td>
                  <td className="px-4 py-3 text-muted">{statusLabel(profile.employment_type)}</td>
                  <td className="px-4 py-3"><Badge variant={statusBadge(profile.status)}>{statusLabel(profile.status)}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="secondary" onClick={() => showStaffAttendanceSummary(profile)}><Eye size={16} />View</Button>
                      <Button variant="secondary" onClick={() => openStaff(profile)}><Pencil size={16} />Edit</Button>
                      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:bg-slate-50">
                        <Upload size={16} />Upload
                        <input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadStaffPhoto(profile, event.target.files)} />
                      </label>
                      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:bg-slate-50">
                        <FileText size={16} />Document
                        <input type="file" className="sr-only" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => uploadStaffDocument(profile, event.target.files)} />
                      </label>
                      <Button variant="secondary" onClick={() => runAction("Profile deactivated.", async () => { await staffProfileApi.update(profile.id, { status: "inactive" }); })}><Trash2 size={16} />Deactivate</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderClasses() {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
          <SectionTitle
            title="Class, Section & Subject Management"
            note="Manage academic sessions, class sections, subjects, subject teachers, and timetable slots."
            actions={
              <>
                <Button onClick={() => openSession()}><Plus size={16} />Add Session</Button>
                <Button onClick={() => openSection()}><Plus size={16} />Add Class</Button>
                <Button onClick={() => openSubject()}><Plus size={16} />Add Subject</Button>
                <Button onClick={() => openAllocation()}><Plus size={16} />Assign Teacher</Button>
                <Button onClick={() => openTimetable()}><Plus size={16} />Timetable</Button>
              </>
            }
          />
          <DataToolbar search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onReset={resetFilters} />
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted">
                  <tr><th className="px-4 py-3">Class</th><th className="px-4 py-3">Teacher</th><th className="px-4 py-3 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {sections.filter((section) => includesSearch([section.label, section.grade_name, section.section_name], search)).length === 0 ? <EmptyRow colSpan={3} label="No classes found." /> : sections.filter((section) => includesSearch([section.label, section.grade_name, section.section_name], search)).map((section) => (
                    <tr key={section.id}>
                      <td className="px-4 py-3 font-semibold text-ink">{section.label ?? `${section.grade_name} - ${section.section_name}`}</td>
                      <td className="px-4 py-3 text-muted">{section.class_teacher_name || teacherName(users, section.class_teacher)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" onClick={() => openSection(section)}><Pencil size={16} />Edit</Button>
                          <Button variant="danger" onClick={() => removeRecord("class", async () => { await sectionApi.remove(section.id); })}><Trash2 size={16} />Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted">
                  <tr><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {filteredSubjects.length === 0 ? <EmptyRow colSpan={4} label="No subjects found." /> : filteredSubjects.map((subject) => (
                    <tr key={subject.id}>
                      <td className="px-4 py-3"><p className="font-semibold text-ink">{subject.name}</p><p className="text-xs text-muted">{subject.code || "No code"}</p></td>
                      <td className="px-4 py-3 text-muted">{subject.grade_name || "All"}</td>
                      <td className="px-4 py-3"><Badge variant={subject.is_active ? "success" : "neutral"}>{subject.is_active ? "active" : "inactive"}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" onClick={() => openSubject(subject)}><Pencil size={16} />Edit</Button>
                          <Button variant="danger" onClick={() => removeRecord("subject", async () => { await subjectApi.remove(subject.id); })}><Trash2 size={16} />Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionTitle title="Subject Teacher Assignments" />
            <div className="space-y-2">
              {allocations.length === 0 ? <p className="py-8 text-center text-sm text-muted">No subject teachers assigned.</p> : allocations.map((allocation) => (
                <div key={allocation.id} className="flex flex-col gap-2 rounded-lg border border-line/70 px-3 py-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-ink"><span className="font-semibold">{allocation.subject}</span> | {allocation.section_label} | {allocation.teacher_name}</p>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => openAllocation(allocation)}><Pencil size={16} />Edit</Button>
                    <Button variant="danger" onClick={() => removeRecord("assignment", async () => { await teacherSubjectAllocationApi.remove(allocation.id); })}><Trash2 size={16} />Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionTitle title="Timetable" />
            <div className="space-y-2">
              {timetable.length === 0 ? <p className="py-8 text-center text-sm text-muted">No timetable slots configured.</p> : timetable.slice(0, 12).map((slot) => (
                <div key={slot.id} className="flex flex-col gap-2 rounded-lg border border-line/70 px-3 py-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-ink"><span className="font-semibold">{slot.subject}</span> | {slot.day_name} {slot.start_time.slice(0, 5)} | {slot.section_label}</p>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => openTimetable(slot)}><Pencil size={16} />Edit</Button>
                    <Button variant="danger" onClick={() => removeRecord("slot", async () => { await timetableApi.remove(slot.id); })}><Trash2 size={16} />Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderAttendance() {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
          <SectionTitle
            title="Attendance Management"
            note="Manual corrections, daily and monthly reports, absentee and late lists, plus PDF/Excel exports."
            actions={
              <>
                <Button onClick={openStudentAttendance}><Plus size={16} />Student Correction</Button>
                <Button onClick={openStaffAttendance}><Plus size={16} />Staff Correction</Button>
                <Button variant="secondary" onClick={() => exportAttendance("student", "pdf")}><Printer size={16} />Export PDF</Button>
                <Button variant="secondary" onClick={() => exportAttendance("student", "excel")}><FileSpreadsheet size={16} />Export Excel</Button>
              </>
            }
          />
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-line/70 p-4"><p className="text-xs font-semibold text-muted">Student records</p><p className="mt-2 text-2xl font-semibold">{attendance.length}</p></div>
            <div className="rounded-lg border border-line/70 p-4"><p className="text-xs font-semibold text-muted">Absentees</p><p className="mt-2 text-2xl font-semibold">{attendance.filter((item) => item.status === "absent").length}</p></div>
            <div className="rounded-lg border border-line/70 p-4"><p className="text-xs font-semibold text-muted">Staff records</p><p className="mt-2 text-2xl font-semibold">{staffAttendance.length}</p></div>
            <div className="rounded-lg border border-line/70 p-4"><p className="text-xs font-semibold text-muted">Late entries</p><p className="mt-2 text-2xl font-semibold">{staffAttendance.filter((item) => item.status === "late").length}</p></div>
          </div>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionTitle title="Student Attendance" actions={<><Button variant="secondary" onClick={() => exportAttendance("student", "pdf")}><Printer size={16} />Export PDF</Button><Button variant="secondary" onClick={() => exportAttendance("student", "excel")}><FileSpreadsheet size={16} />Export Excel</Button></>} />
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <tbody className="divide-y divide-line/70">
                  {attendance.slice(0, 12).map((record) => (
                    <tr key={record.id}><td className="px-4 py-3">{record.date}</td><td className="px-4 py-3">{record.student_name}</td><td className="px-4 py-3">{record.section_label}</td><td className="px-4 py-3"><Badge variant={statusBadge(record.status)}>{statusLabel(record.status)}</Badge></td></tr>
                  ))}
                  {attendance.length === 0 && <EmptyRow colSpan={4} label="No student attendance records." />}
                </tbody>
              </table>
            </div>
          </div>
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionTitle title="Teacher & Staff Attendance" actions={<><Button variant="secondary" onClick={() => exportAttendance("staff", "pdf")}><Printer size={16} />Export PDF</Button><Button variant="secondary" onClick={() => exportAttendance("staff", "excel")}><FileSpreadsheet size={16} />Export Excel</Button></>} />
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <tbody className="divide-y divide-line/70">
                  {staffAttendance.slice(0, 12).map((record) => (
                    <tr key={record.id}><td className="px-4 py-3">{record.date}</td><td className="px-4 py-3">{record.staff_name}</td><td className="px-4 py-3">{record.clock_in ?? ""}</td><td className="px-4 py-3"><Badge variant={statusBadge(record.status)}>{statusLabel(record.status)}</Badge></td></tr>
                  ))}
                  {staffAttendance.length === 0 && <EmptyRow colSpan={4} label="No staff attendance records." />}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderExams() {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
          <SectionTitle
            title="Exam & Result Setup"
            note="Create exam types, subject-wise marks setup, exam schedules, and publish or unpublish results."
            actions={
              <>
                <Button onClick={() => openExamType()}><Plus size={16} />Exam Type</Button>
                <Button onClick={() => openMarks()}><Plus size={16} />Marks Setup</Button>
                <Button onClick={() => openSchedule()}><Plus size={16} />Schedule</Button>
                <Button onClick={() => openResult()}><Plus size={16} />Result</Button>
              </>
            }
          />
          <DataToolbar search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onReset={resetFilters} />
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted">
                <tr><th className="px-4 py-3">Exam</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {filteredSchedules.length === 0 ? <EmptyRow colSpan={5} label="No exam schedules found." /> : filteredSchedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td className="px-4 py-3"><p className="font-semibold text-ink">{schedule.title}</p><p className="text-xs text-muted">{schedule.exam_type_name} | {schedule.subject_name}</p></td>
                    <td className="px-4 py-3 text-muted">{schedule.section_label}</td>
                    <td className="px-4 py-3 text-muted">{schedule.exam_date} {schedule.start_time.slice(0, 5)}</td>
                    <td className="px-4 py-3"><Badge variant={statusBadge(schedule.status)}>{statusLabel(schedule.status)}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="secondary" onClick={() => openSchedule(schedule)}><Pencil size={16} />Edit</Button>
                        <Button variant="secondary" onClick={() => runAction("Exam schedule published.", async () => { await examScheduleApi.publish(schedule.id); })}><Upload size={16} />Publish</Button>
                        <Button variant="secondary" onClick={() => runAction("Exam schedule unpublished.", async () => { await examScheduleApi.unpublish(schedule.id); })}><Download size={16} />Unpublish</Button>
                        <Button variant="danger" onClick={() => runAction("Exam schedule archived.", async () => { await examScheduleApi.archive(schedule.id); })}><Trash2 size={16} />Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionTitle title="Subject-wise Marks Setup" />
            <div className="space-y-2">
              {marksSetups.length === 0 ? <p className="py-8 text-center text-sm text-muted">No marks setup configured.</p> : marksSetups.map((setup) => (
                <div key={setup.id} className="flex flex-col gap-2 rounded-lg border border-line/70 px-3 py-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-ink"><span className="font-semibold">{setup.exam_type_name}</span> | {setup.subject_name} | {setup.section_label} | {setup.max_marks} marks</p>
                  <Button variant="secondary" onClick={() => openMarks(setup)}><Pencil size={16} />Edit</Button>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionTitle title="Result Reports" />
            <div className="space-y-2">
              {results.length === 0 ? <p className="py-8 text-center text-sm text-muted">No results recorded.</p> : results.slice(0, 12).map((result) => (
                <div key={result.id} className="flex flex-col gap-2 rounded-lg border border-line/70 px-3 py-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-ink"><span className="font-semibold">{result.student_name}</span> | {result.exam_name} | {result.subject} | {result.score}/{result.max_score}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={result.is_published ? "success" : "neutral"}>{result.is_published ? "published" : "draft"}</Badge>
                    <Badge variant={statusBadge(result.review_status || "draft")}>{statusLabel(result.review_status || "draft")}</Badge>
                    <Button variant="secondary" onClick={() => openResult(result)}><Pencil size={16} />Edit</Button>
                    <Button variant="secondary" onClick={() => runAction("Result approved.", async () => { await resultRecordApi.approve(result.id, "Approved by School Admin."); })}><CheckCircle2 size={16} />Approve Result</Button>
                    <Button variant="secondary" onClick={() => runAction("Result rejected.", async () => { await resultRecordApi.reject(result.id, "Rejected by School Admin."); })}><XCircle size={16} />Reject Result</Button>
                    <Button variant="secondary" onClick={() => runAction("Result published.", async () => { await resultRecordApi.publish(result.id); })}><Upload size={16} />Publish</Button>
                    <Button variant="secondary" onClick={() => runAction("Result unpublished.", async () => { await resultRecordApi.unpublish(result.id); })}><Download size={16} />Unpublish</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderNotices() {
    return (
      <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
        <SectionTitle
          title="Notice Management"
          note="Create, edit, publish, unpublish, target, and archive school notices."
          actions={<><Button onClick={() => openNotice()}><Plus size={16} />Add</Button><Button variant="secondary" onClick={() => window.history.back()}><ArrowLeft size={16} />Back</Button></>}
        />
        <DataToolbar search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onReset={resetFilters} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted">
              <tr><th className="px-4 py-3">Notice</th><th className="px-4 py-3">Audience</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {filteredNotices.length === 0 ? <EmptyRow colSpan={4} label="No notices found." /> : filteredNotices.map((notice) => (
                <tr key={notice.id}>
                  <td className="px-4 py-3"><p className="font-semibold text-ink">{notice.title}</p><p className="line-clamp-1 text-xs text-muted">{notice.message}</p></td>
                  <td className="px-4 py-3 text-muted">{statusLabel(notice.audience)}</td>
                  <td className="px-4 py-3"><Badge variant={notice.is_active ? "success" : "neutral"}>{notice.is_active ? "published" : "unpublished"}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="secondary" onClick={() => openNotice(notice)}><Pencil size={16} />Edit</Button>
                      <Button variant="secondary" onClick={() => runAction("Notice published.", async () => { await announcementApi.publish(notice.id); })}><Upload size={16} />Publish</Button>
                      <Button variant="secondary" onClick={() => runAction("Notice unpublished.", async () => { await announcementApi.unpublish(notice.id); })}><Download size={16} />Unpublish</Button>
                      <Button variant="danger" onClick={() => runAction("Notice archived.", async () => { await announcementApi.archive(notice.id); })}><Trash2 size={16} />Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderForms() {
    return (
      <>
        <Modal open={modal === "student"} onClose={() => setModal(null)} title={studentForm.id ? "Edit Student" : "Add Student"} size="lg">
          <form onSubmit={saveStudent} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="First name"><input className={inputClass} value={studentForm.first_name} onChange={(event) => setStudentForm({ ...studentForm, first_name: event.target.value })} required /></Field>
              <Field label="Last name"><input className={inputClass} value={studentForm.last_name} onChange={(event) => setStudentForm({ ...studentForm, last_name: event.target.value })} /></Field>
              <Field label="Student ID"><input className={inputClass} value={studentForm.admission_number} onChange={(event) => setStudentForm({ ...studentForm, admission_number: event.target.value })} placeholder="Auto generated if blank" /></Field>
              <Field label="Date of birth"><input type="date" className={inputClass} value={studentForm.date_of_birth} onChange={(event) => setStudentForm({ ...studentForm, date_of_birth: event.target.value })} required /></Field>
              <Field label="Class/Section"><SelectField value={studentForm.section} onChange={(value) => setStudentForm({ ...studentForm, section: Number(value) })}>{sections.map((section) => <option key={section.id} value={section.id}>{section.label ?? `${section.grade_name} - ${section.section_name}`}</option>)}</SelectField></Field>
              <Field label="Status"><SelectField value={studentForm.status} onChange={(value) => setStudentForm({ ...studentForm, status: value as StudentForm["status"] })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="alumni">Alumni</option></SelectField></Field>
              <Field label="Father name"><input className={inputClass} value={studentForm.father_name} onChange={(event) => setStudentForm({ ...studentForm, father_name: event.target.value })} /></Field>
              <Field label="Mother name"><input className={inputClass} value={studentForm.mother_name} onChange={(event) => setStudentForm({ ...studentForm, mother_name: event.target.value })} /></Field>
              <Field label="Phone"><input className={inputClass} value={studentForm.phone_number} onChange={(event) => setStudentForm({ ...studentForm, phone_number: event.target.value })} /></Field>
              <Field label="Email"><input type="email" className={inputClass} value={studentForm.contact_email} onChange={(event) => setStudentForm({ ...studentForm, contact_email: event.target.value })} /></Field>
            </div>
            <Field label="Address"><textarea className={inputClass} value={studentForm.address} onChange={(event) => setStudentForm({ ...studentForm, address: event.target.value })} rows={3} /></Field>
            <FormButtons editing={!!studentForm.id} />
          </form>
        </Modal>

        <Modal open={modal === "staff"} onClose={() => setModal(null)} title={staffForm.id ? "Edit Profile" : staffForm.mode === "teacher" ? "Add Teacher" : "Add Staff"} size="lg">
          <form onSubmit={saveStaff} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {!staffForm.id && (
                <>
                  <Field label="Profile type"><SelectField value={staffForm.mode} onChange={(value) => setStaffForm({ ...staffForm, mode: value as StaffForm["mode"], designation: value === "teacher" ? "Teacher" : "Staff" })}><option value="teacher">Teacher</option><option value="staff">Staff</option></SelectField></Field>
                  <Field label="Existing user"><SelectField value={staffForm.user} onChange={(value) => setStaffForm({ ...staffForm, user: Number(value) })} required={false}><option value={0}>Create new login</option>{staffUsers.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.username} ({statusLabel(user.role)})</option>)}</SelectField></Field>
                  {!staffForm.user && (
                    <>
                      <Field label="Username"><input className={inputClass} value={staffForm.username} onChange={(event) => setStaffForm({ ...staffForm, username: event.target.value })} required /></Field>
                      <Field label="Temporary password"><input className={inputClass} value={staffForm.password} onChange={(event) => setStaffForm({ ...staffForm, password: event.target.value })} required minLength={8} /></Field>
                      <Field label="First name"><input className={inputClass} value={staffForm.first_name} onChange={(event) => setStaffForm({ ...staffForm, first_name: event.target.value })} /></Field>
                      <Field label="Last name"><input className={inputClass} value={staffForm.last_name} onChange={(event) => setStaffForm({ ...staffForm, last_name: event.target.value })} /></Field>
                      <Field label="Email"><input type="email" className={inputClass} value={staffForm.email} onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })} /></Field>
                    </>
                  )}
                </>
              )}
              <Field label="Employee ID"><input className={inputClass} value={staffForm.employee_code} onChange={(event) => setStaffForm({ ...staffForm, employee_code: event.target.value })} placeholder="Auto generated if blank" /></Field>
              <Field label="Designation"><input className={inputClass} value={staffForm.designation} onChange={(event) => setStaffForm({ ...staffForm, designation: event.target.value })} required /></Field>
              <Field label="Department"><input className={inputClass} value={staffForm.department} onChange={(event) => setStaffForm({ ...staffForm, department: event.target.value })} /></Field>
              <Field label="Employment type"><SelectField value={staffForm.employment_type} onChange={(value) => setStaffForm({ ...staffForm, employment_type: value as StaffForm["employment_type"] })}><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option></SelectField></Field>
              <Field label="Joining date"><input type="date" className={inputClass} value={staffForm.joining_date} onChange={(event) => setStaffForm({ ...staffForm, joining_date: event.target.value })} required /></Field>
              <Field label="Status"><SelectField value={staffForm.status} onChange={(value) => setStaffForm({ ...staffForm, status: value as StaffForm["status"] })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="exited">Exited</option></SelectField></Field>
              <Field label="Qualification"><input className={inputClass} value={staffForm.qualification} onChange={(event) => setStaffForm({ ...staffForm, qualification: event.target.value })} /></Field>
              <Field label="Emergency contact"><input className={inputClass} value={staffForm.emergency_contact} onChange={(event) => setStaffForm({ ...staffForm, emergency_contact: event.target.value })} /></Field>
            </div>
            <FormButtons editing={!!staffForm.id} />
          </form>
        </Modal>

        <Modal open={modal === "session"} onClose={() => setModal(null)} title={sessionForm.id ? "Edit Session" : "Add Session"}>
          <form onSubmit={saveSession} className="space-y-4">
            <Field label="Name"><input className={inputClass} value={sessionForm.name} onChange={(event) => setSessionForm({ ...sessionForm, name: event.target.value })} required /></Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Start date"><input type="date" className={inputClass} value={sessionForm.start_date} onChange={(event) => setSessionForm({ ...sessionForm, start_date: event.target.value })} required /></Field>
              <Field label="End date"><input type="date" className={inputClass} value={sessionForm.end_date} onChange={(event) => setSessionForm({ ...sessionForm, end_date: event.target.value })} required /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={sessionForm.is_active} onChange={(event) => setSessionForm({ ...sessionForm, is_active: event.target.checked })} /> Active</label>
            <FormButtons editing={!!sessionForm.id} />
          </form>
        </Modal>

        <Modal open={modal === "section"} onClose={() => setModal(null)} title={sectionForm.id ? "Edit Class Section" : "Add Class Section"}>
          <form onSubmit={saveSection} className="space-y-4">
            <Field label="Session"><SelectField value={sectionForm.session} onChange={(value) => setSectionForm({ ...sectionForm, session: Number(value) })}>{sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}</SelectField></Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Class"><input className={inputClass} value={sectionForm.grade_name} onChange={(event) => setSectionForm({ ...sectionForm, grade_name: event.target.value })} required /></Field>
              <Field label="Section"><input className={inputClass} value={sectionForm.section_name} onChange={(event) => setSectionForm({ ...sectionForm, section_name: event.target.value })} required /></Field>
            </div>
            <Field label="Class teacher"><SelectField value={sectionForm.class_teacher ?? 0} onChange={(value) => setSectionForm({ ...sectionForm, class_teacher: Number(value) || null })} required={false}><option value={0}>Unassigned</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name || teacher.username}</option>)}</SelectField></Field>
            <FormButtons editing={!!sectionForm.id} />
          </form>
        </Modal>

        <Modal open={modal === "subject"} onClose={() => setModal(null)} title={subjectForm.id ? "Edit Subject" : "Add Subject"}>
          <form onSubmit={saveSubject} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Subject"><input className={inputClass} value={subjectForm.name} onChange={(event) => setSubjectForm({ ...subjectForm, name: event.target.value })} required /></Field>
              <Field label="Code"><input className={inputClass} value={subjectForm.code} onChange={(event) => setSubjectForm({ ...subjectForm, code: event.target.value })} /></Field>
              <Field label="Class"><input className={inputClass} value={subjectForm.grade_name} onChange={(event) => setSubjectForm({ ...subjectForm, grade_name: event.target.value })} /></Field>
              <label className="mt-7 flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={subjectForm.is_active} onChange={(event) => setSubjectForm({ ...subjectForm, is_active: event.target.checked })} /> Active</label>
            </div>
            <Field label="Description"><textarea className={inputClass} value={subjectForm.description} onChange={(event) => setSubjectForm({ ...subjectForm, description: event.target.value })} rows={3} /></Field>
            <FormButtons editing={!!subjectForm.id} />
          </form>
        </Modal>

        <Modal open={modal === "allocation"} onClose={() => setModal(null)} title={allocationForm.id ? "Edit Subject Teacher" : "Assign Subject Teacher"}>
          <form onSubmit={saveAllocation} className="space-y-4">
            <Field label="Class/Section"><SelectField value={allocationForm.section} onChange={(value) => setAllocationForm({ ...allocationForm, section: Number(value) })}>{sections.map((section) => <option key={section.id} value={section.id}>{section.label ?? `${section.grade_name} - ${section.section_name}`}</option>)}</SelectField></Field>
            <Field label="Teacher"><SelectField value={allocationForm.teacher} onChange={(value) => setAllocationForm({ ...allocationForm, teacher: Number(value) })}>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name || teacher.username}</option>)}</SelectField></Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Subject"><input className={inputClass} value={allocationForm.subject} onChange={(event) => setAllocationForm({ ...allocationForm, subject: event.target.value })} required /></Field>
              <Field label="Weekly periods"><input type="number" className={inputClass} value={allocationForm.weekly_periods} onChange={(event) => setAllocationForm({ ...allocationForm, weekly_periods: Number(event.target.value) })} min={0} max={60} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={allocationForm.is_active} onChange={(event) => setAllocationForm({ ...allocationForm, is_active: event.target.checked })} /> Active</label>
            <FormButtons editing={!!allocationForm.id} />
          </form>
        </Modal>

        <Modal open={modal === "timetable"} onClose={() => setModal(null)} title={timetableForm.id ? "Edit Timetable Slot" : "Add Timetable Slot"} size="lg">
          <form onSubmit={saveTimetable} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Class/Section"><SelectField value={timetableForm.section} onChange={(value) => setTimetableForm({ ...timetableForm, section: Number(value) })}>{sections.map((section) => <option key={section.id} value={section.id}>{section.label ?? `${section.grade_name} - ${section.section_name}`}</option>)}</SelectField></Field>
              <Field label="Teacher"><SelectField value={timetableForm.teacher ?? 0} onChange={(value) => setTimetableForm({ ...timetableForm, teacher: Number(value) || null })} required={false}><option value={0}>Unassigned</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name || teacher.username}</option>)}</SelectField></Field>
              <Field label="Subject"><input className={inputClass} value={timetableForm.subject} onChange={(event) => setTimetableForm({ ...timetableForm, subject: event.target.value })} required /></Field>
              <Field label="Day"><SelectField value={timetableForm.day_of_week} onChange={(value) => setTimetableForm({ ...timetableForm, day_of_week: Number(value) as TimetableForm["day_of_week"] })}><option value={1}>Monday</option><option value={2}>Tuesday</option><option value={3}>Wednesday</option><option value={4}>Thursday</option><option value={5}>Friday</option><option value={6}>Saturday</option><option value={7}>Sunday</option></SelectField></Field>
              <Field label="Start time"><input type="time" className={inputClass} value={timetableForm.start_time} onChange={(event) => setTimetableForm({ ...timetableForm, start_time: event.target.value })} required /></Field>
              <Field label="End time"><input type="time" className={inputClass} value={timetableForm.end_time} onChange={(event) => setTimetableForm({ ...timetableForm, end_time: event.target.value })} required /></Field>
              <Field label="Room"><input className={inputClass} value={timetableForm.room} onChange={(event) => setTimetableForm({ ...timetableForm, room: event.target.value })} /></Field>
              <Field label="Effective from"><input type="date" className={inputClass} value={timetableForm.effective_from} onChange={(event) => setTimetableForm({ ...timetableForm, effective_from: event.target.value })} required /></Field>
            </div>
            <FormButtons editing={!!timetableForm.id} />
          </form>
        </Modal>

        <Modal open={modal === "studentAttendance"} onClose={() => setModal(null)} title="Student Attendance Correction" size="lg">
          <form onSubmit={saveStudentAttendance} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Class/Section"><SelectField value={studentAttendanceForm.section} onChange={(value) => setStudentAttendanceForm({ ...studentAttendanceForm, section: Number(value) })}>{sections.map((section) => <option key={section.id} value={section.id}>{section.label ?? `${section.grade_name} - ${section.section_name}`}</option>)}</SelectField></Field>
              <Field label="Date"><input type="date" className={inputClass} value={studentAttendanceForm.date} onChange={(event) => setStudentAttendanceForm({ ...studentAttendanceForm, date: event.target.value })} required /></Field>
              <Field label="Subject"><input className={inputClass} value={studentAttendanceForm.subject} onChange={(event) => setStudentAttendanceForm({ ...studentAttendanceForm, subject: event.target.value })} /></Field>
            </div>
            <div className="rounded-lg border border-line/70">
              {sectionStudents.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted">No active students in this section.</p> : sectionStudents.map((student) => (
                <div key={student.id} className="flex flex-col gap-2 border-b border-line/70 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm font-semibold text-ink">{student.full_name}<span className="ml-2 text-xs text-muted">{student.admission_number}</span></p>
                  <SelectField value={studentAttendanceStatuses[student.id] ?? "present"} onChange={(value) => setStudentAttendanceStatuses({ ...studentAttendanceStatuses, [student.id]: value as AttendanceStatus })}>
                    <option value="present">Present</option><option value="absent">Absent</option><option value="on_duty">On duty</option>
                  </SelectField>
                </div>
              ))}
            </div>
            <FormButtons editing />
          </form>
        </Modal>

        <Modal open={modal === "staffAttendance"} onClose={() => setModal(null)} title="Teacher & Staff Attendance Correction">
          <form onSubmit={saveStaffAttendance} className="space-y-4">
            <Field label="Staff user"><SelectField value={staffAttendanceForm.staff_user} onChange={(value) => setStaffAttendanceForm({ ...staffAttendanceForm, staff_user: Number(value) })}>{staffUsers.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.username}</option>)}</SelectField></Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Date"><input type="date" className={inputClass} value={staffAttendanceForm.date} onChange={(event) => setStaffAttendanceForm({ ...staffAttendanceForm, date: event.target.value })} required /></Field>
              <Field label="Status"><SelectField value={staffAttendanceForm.status} onChange={(value) => setStaffAttendanceForm({ ...staffAttendanceForm, status: value as StaffAttendanceStatus })}><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="half_day">Half day</option><option value="on_leave">On leave</option></SelectField></Field>
              <Field label="Clock in"><input type="time" className={inputClass} value={staffAttendanceForm.clock_in} onChange={(event) => setStaffAttendanceForm({ ...staffAttendanceForm, clock_in: event.target.value })} /></Field>
              <Field label="Clock out"><input type="time" className={inputClass} value={staffAttendanceForm.clock_out} onChange={(event) => setStaffAttendanceForm({ ...staffAttendanceForm, clock_out: event.target.value })} /></Field>
            </div>
            <Field label="Notes"><textarea className={inputClass} value={staffAttendanceForm.notes} onChange={(event) => setStaffAttendanceForm({ ...staffAttendanceForm, notes: event.target.value })} rows={3} /></Field>
            <FormButtons editing={!!staffAttendanceForm.id} />
          </form>
        </Modal>

        <Modal open={modal === "examType"} onClose={() => setModal(null)} title={examTypeForm.id ? "Edit Exam Type" : "Add Exam Type"}>
          <form onSubmit={saveExamType} className="space-y-4">
            <Field label="Name"><input className={inputClass} value={examTypeForm.name} onChange={(event) => setExamTypeForm({ ...examTypeForm, name: event.target.value })} required /></Field>
            <Field label="Description"><textarea className={inputClass} value={examTypeForm.description} onChange={(event) => setExamTypeForm({ ...examTypeForm, description: event.target.value })} rows={3} /></Field>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={examTypeForm.is_active} onChange={(event) => setExamTypeForm({ ...examTypeForm, is_active: event.target.checked })} /> Active</label>
            <FormButtons editing={!!examTypeForm.id} />
          </form>
        </Modal>

        <Modal open={modal === "marks"} onClose={() => setModal(null)} title={marksForm.id ? "Edit Marks Setup" : "Subject-wise Marks Setup"}>
          <form onSubmit={saveMarks} className="space-y-4">
            <Field label="Exam type"><SelectField value={marksForm.exam_type} onChange={(value) => setMarksForm({ ...marksForm, exam_type: Number(value) })}>{examTypes.map((examType) => <option key={examType.id} value={examType.id}>{examType.name}</option>)}</SelectField></Field>
            <Field label="Class/Section"><SelectField value={marksForm.section} onChange={(value) => setMarksForm({ ...marksForm, section: Number(value) })}>{sections.map((section) => <option key={section.id} value={section.id}>{section.label ?? `${section.grade_name} - ${section.section_name}`}</option>)}</SelectField></Field>
            <Field label="Subject"><SelectField value={marksForm.subject} onChange={(value) => setMarksForm({ ...marksForm, subject: Number(value) })}>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</SelectField></Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Max marks"><input className={inputClass} value={marksForm.max_marks} onChange={(event) => setMarksForm({ ...marksForm, max_marks: event.target.value })} required /></Field>
              <Field label="Pass marks"><input className={inputClass} value={marksForm.pass_marks} onChange={(event) => setMarksForm({ ...marksForm, pass_marks: event.target.value })} required /></Field>
              <Field label="Weightage"><input className={inputClass} value={marksForm.weightage} onChange={(event) => setMarksForm({ ...marksForm, weightage: event.target.value })} required /></Field>
            </div>
            <FormButtons editing={!!marksForm.id} />
          </form>
        </Modal>

        <Modal open={modal === "schedule"} onClose={() => setModal(null)} title={scheduleForm.id ? "Edit Exam Schedule" : "Add Exam Schedule"} size="lg">
          <form onSubmit={saveSchedule} className="space-y-4">
            <Field label="Title"><input className={inputClass} value={scheduleForm.title} onChange={(event) => setScheduleForm({ ...scheduleForm, title: event.target.value })} required /></Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Exam type"><SelectField value={scheduleForm.exam_type} onChange={(value) => setScheduleForm({ ...scheduleForm, exam_type: Number(value) })}>{examTypes.map((examType) => <option key={examType.id} value={examType.id}>{examType.name}</option>)}</SelectField></Field>
              <Field label="Subject"><SelectField value={scheduleForm.subject} onChange={(value) => setScheduleForm({ ...scheduleForm, subject: Number(value) })}>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</SelectField></Field>
              <Field label="Class/Section"><SelectField value={scheduleForm.section} onChange={(value) => setScheduleForm({ ...scheduleForm, section: Number(value) })}>{sections.map((section) => <option key={section.id} value={section.id}>{section.label ?? `${section.grade_name} - ${section.section_name}`}</option>)}</SelectField></Field>
              <Field label="Exam date"><input type="date" className={inputClass} value={scheduleForm.exam_date} onChange={(event) => setScheduleForm({ ...scheduleForm, exam_date: event.target.value })} required /></Field>
              <Field label="Start time"><input type="time" className={inputClass} value={scheduleForm.start_time} onChange={(event) => setScheduleForm({ ...scheduleForm, start_time: event.target.value })} required /></Field>
              <Field label="End time"><input type="time" className={inputClass} value={scheduleForm.end_time} onChange={(event) => setScheduleForm({ ...scheduleForm, end_time: event.target.value })} required /></Field>
              <Field label="Max marks"><input className={inputClass} value={scheduleForm.max_marks} onChange={(event) => setScheduleForm({ ...scheduleForm, max_marks: event.target.value })} required /></Field>
              <Field label="Status"><SelectField value={scheduleForm.status} onChange={(value) => setScheduleForm({ ...scheduleForm, status: value as ScheduleForm["status"] })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></SelectField></Field>
            </div>
            <Field label="Venue"><input className={inputClass} value={scheduleForm.venue} onChange={(event) => setScheduleForm({ ...scheduleForm, venue: event.target.value })} /></Field>
            <Field label="Instructions"><textarea className={inputClass} value={scheduleForm.instructions} onChange={(event) => setScheduleForm({ ...scheduleForm, instructions: event.target.value })} rows={3} /></Field>
            <FormButtons editing={!!scheduleForm.id} />
          </form>
        </Modal>

        <Modal open={modal === "result"} onClose={() => setModal(null)} title={resultForm.id ? "Edit Result" : "Add Result"} size="lg">
          <form onSubmit={saveResult} className="space-y-4">
            <Field label="Student"><SelectField value={resultForm.student} onChange={(value) => setResultForm({ ...resultForm, student: Number(value) })}>{students.map((student) => <option key={student.id} value={student.id}>{student.full_name} ({student.admission_number})</option>)}</SelectField></Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Exam"><input className={inputClass} value={resultForm.exam_name} onChange={(event) => setResultForm({ ...resultForm, exam_name: event.target.value })} required /></Field>
              <Field label="Subject"><input className={inputClass} value={resultForm.subject} onChange={(event) => setResultForm({ ...resultForm, subject: event.target.value })} required /></Field>
              <Field label="Score"><input className={inputClass} value={resultForm.score} onChange={(event) => setResultForm({ ...resultForm, score: event.target.value })} required /></Field>
              <Field label="Max score"><input className={inputClass} value={resultForm.max_score} onChange={(event) => setResultForm({ ...resultForm, max_score: event.target.value })} required /></Field>
              <Field label="Grade"><input className={inputClass} value={resultForm.grade} onChange={(event) => setResultForm({ ...resultForm, grade: event.target.value })} /></Field>
              <Field label="Publish date"><input type="date" className={inputClass} value={resultForm.published_on} onChange={(event) => setResultForm({ ...resultForm, published_on: event.target.value })} required /></Field>
            </div>
            <Field label="Remarks"><textarea className={inputClass} value={resultForm.remarks} onChange={(event) => setResultForm({ ...resultForm, remarks: event.target.value })} rows={3} /></Field>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={resultForm.is_published} onChange={(event) => setResultForm({ ...resultForm, is_published: event.target.checked })} /> Published</label>
            <FormButtons editing={!!resultForm.id} />
          </form>
        </Modal>

        <Modal open={modal === "notice"} onClose={() => setModal(null)} title={noticeForm.id ? "Edit Notice" : "Create Notice"}>
          <form onSubmit={saveNotice} className="space-y-4">
            <Field label="Title"><input className={inputClass} value={noticeForm.title} onChange={(event) => setNoticeForm({ ...noticeForm, title: event.target.value })} required /></Field>
            <Field label="Audience"><SelectField value={noticeForm.audience} onChange={(value) => setNoticeForm({ ...noticeForm, audience: value as NoticeForm["audience"] })}><option value="all">All</option><option value="admins">Admins</option><option value="staff">Teachers and staff</option><option value="learners">Students</option></SelectField></Field>
            <Field label="Message"><textarea className={inputClass} value={noticeForm.message} onChange={(event) => setNoticeForm({ ...noticeForm, message: event.target.value })} rows={5} required /></Field>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={noticeForm.is_active} onChange={(event) => setNoticeForm({ ...noticeForm, is_active: event.target.checked })} /> Published</label>
            <FormButtons editing={!!noticeForm.id} />
          </form>
        </Modal>
      </>
    );
  }

  function FormButtons({ editing }: { editing?: boolean }) {
    return (
      <div className="flex flex-wrap justify-end gap-2 border-t border-line/70 pt-4">
        <Button variant="secondary" onClick={() => setModal(null)}><ArrowLeft size={16} />Back</Button>
        <Button type="submit" disabled={busy}><Save size={16} />{busy ? "Saving..." : editing ? "Update" : "Save"}</Button>
      </div>
    );
  }

  function renderViewModals() {
    return (
      <>
        <Modal open={!!viewStudent} onClose={() => setViewStudent(null)} title="Student Profile" size="lg">
          {viewStudent && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <PhotoThumb src={viewStudent.photo_url} label={viewStudent.full_name} size="h-16 w-16" />
                <div>
                  <h2 className="text-xl font-semibold text-ink">{viewStudent.full_name}</h2>
                  <p className="text-sm text-muted">{viewStudent.admission_number} | {viewStudent.section_label}</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <p className="rounded-lg border border-line/70 p-3 text-sm"><span className="font-semibold">Date of birth:</span> {viewStudent.date_of_birth}</p>
                <p className="rounded-lg border border-line/70 p-3 text-sm"><span className="font-semibold">Status:</span> {statusLabel(viewStudent.status)}</p>
                <p className="rounded-lg border border-line/70 p-3 text-sm"><span className="font-semibold">Father:</span> {viewStudent.father_name || "Not set"}</p>
                <p className="rounded-lg border border-line/70 p-3 text-sm"><span className="font-semibold">Mother:</span> {viewStudent.mother_name || "Not set"}</p>
                <p className="rounded-lg border border-line/70 p-3 text-sm"><span className="font-semibold">Phone:</span> {viewStudent.phone_number || "Not set"}</p>
                <p className="rounded-lg border border-line/70 p-3 text-sm"><span className="font-semibold">Email:</span> {viewStudent.contact_email || "Not set"}</p>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => downloadStudentProfile(viewStudent)}><Download size={16} />Download</Button>
              </div>
            </div>
          )}
        </Modal>
        <Modal open={!!viewStaffSummary} onClose={() => setViewStaffSummary(null)} title="Attendance Summary">
          {viewStaffSummary && (
            <div className="space-y-3">
              <p className="text-sm text-muted">{viewStaffSummary.staff.user_name} | {viewStaffSummary.staff.employee_code}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-line/70 p-4"><p className="text-xs font-semibold text-muted">Total</p><p className="mt-2 text-2xl font-semibold">{viewStaffSummary.total}</p></div>
                {Object.entries(viewStaffSummary.byStatus).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-line/70 p-4"><p className="text-xs font-semibold text-muted">{statusLabel(key)}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>
                ))}
              </div>
            </div>
          )}
        </Modal>
      </>
    );
  }
}
