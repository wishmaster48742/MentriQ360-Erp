"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ShieldAlert,
  RefreshCcw,
  Save,
  XCircle,
} from "lucide-react";
import {
  attendanceDeviceApi,
  attendanceApi,
  sectionApi,
  studentApi,
  teacherSubjectAllocationApi,
  type AttendanceCaptureMethod,
  type AttendanceDevice,
  type AttendanceRecord,
  type AttendanceStatus,
  type ClassSection,
  type Student,
  type TeacherSubjectAllocation,
  ApiError,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Badge, statusBadge, statusLabel } from "@/components/ui/badge";
import { WorkspacePlaceholder } from "@/components/ui/workspace-placeholder";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; colour: string }[] = [
  { value: "present", label: "Present", colour: "bg-emerald-500 text-white hover:bg-emerald-600" },
  { value: "absent", label: "Absent", colour: "bg-rose-500 text-white hover:bg-rose-600" },
  { value: "late", label: "Late", colour: "bg-amber-500 text-white hover:bg-amber-600" },
  { value: "half_day", label: "Half Day", colour: "bg-violet-600 text-white hover:bg-violet-700" },
  { value: "on_duty", label: "On Duty", colour: "bg-blue-600 text-white hover:bg-blue-700" },
];

function toISODate(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function todayISO() {
  return toISODate(new Date());
}

function asArray<T>(value: T[] | { results?: T[] }): T[] {
  return Array.isArray(value) ? value : value.results ?? [];
}

function earliestEditableISO() {
  const date = new Date();
  date.setDate(date.getDate() - 3);
  return toISODate(date);
}

export function AttendancePanel() {
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [allocations, setAllocations] = useState<TeacherSubjectAllocation[]>([]);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [date, setDate] = useState(todayISO());
  const [captureMethod, setCaptureMethod] = useState<AttendanceCaptureMethod>("manual");
  const [selectedDevice, setSelectedDevice] = useState("");
  const [markMap, setMarkMap] = useState<Record<number, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [error, setError] = useState("");

  // Load sections and teacher subject allotments
  useEffect(() => {
    Promise.all([
      sectionApi.list(),
      attendanceDeviceApi.list(),
      isTeacher ? teacherSubjectAllocationApi.list({ is_active: "true" }) : Promise.resolve([] as TeacherSubjectAllocation[]),
    ])
      .then(([r, d, a]) => {
        const arr = asArray<ClassSection>(r);
        const deviceArr = asArray<AttendanceDevice>(d);
        const allocationArr = asArray<TeacherSubjectAllocation>(a);
        const teacherSectionIds = new Set(allocationArr.map((allocation) => allocation.section));
        const visibleSections = isTeacher
          ? arr.filter((section) => section.class_teacher === user?.id || teacherSectionIds.has(section.id))
          : arr;
        setSections(visibleSections);
        setDevices(deviceArr);
        setAllocations(allocationArr);
        if (visibleSections.length > 0) {
          setSelectedSection((current) => current && visibleSections.some((section) => section.id === current) ? current : visibleSections[0].id);
        } else {
          setSelectedSection(null);
        }
      })
      .catch(() => setError("Failed to load sections, teacher subjects, or attendance devices."))
      .finally(() => setLoading(false));
  }, [isTeacher, user?.id]);

  const subjectOptions = useMemo(() => {
    if (!selectedSection) return [];
    return allocations.filter((allocation) => allocation.section === selectedSection && allocation.is_active);
  }, [allocations, selectedSection]);
  const selectedSectionInfo = useMemo(
    () => sections.find((section) => section.id === selectedSection),
    [sections, selectedSection]
  );
  const teacherNeedsSubject = Boolean(isTeacher && selectedSectionInfo?.class_teacher !== user?.id);

  useEffect(() => {
    if (!isTeacher) {
      setSelectedSubject("");
      return;
    }
    if (subjectOptions.length === 0) {
      setSelectedSubject("");
      return;
    }
    if (!subjectOptions.some((allocation) => allocation.subject === selectedSubject)) {
      setSelectedSubject(subjectOptions[0].subject);
    }
  }, [isTeacher, selectedSubject, subjectOptions]);

  // Load students + attendance whenever section/date changes
  const loadData = useCallback(async () => {
    if (!selectedSection) {
      setStudents([]);
      setMarkMap({});
      return;
    }
    if (teacherNeedsSubject && !selectedSubject) {
      setStudents([]);
      setMarkMap({});
      return;
    }
    setLoading(true);
    setError("");
    try {
      const attendanceParams: Record<string, string> = { section: String(selectedSection), date };
      if (isTeacher && selectedSubject) attendanceParams.subject = selectedSubject;
      const [st, att] = await Promise.all([
        studentApi.list({ section: String(selectedSection) }),
        attendanceApi.list(attendanceParams),
      ]);
      const stArr = asArray<Student>(st);
      const attArr = asArray<AttendanceRecord>(att);
      setStudents(stArr);
      // Pre-fill marks from existing records
      const map: Record<number, AttendanceStatus> = {};
      attArr.forEach((r) => { map[r.student] = r.status; });
      setMarkMap(map);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load attendance.");
    } finally {
      setLoading(false);
    }
  }, [isTeacher, selectedSection, selectedSubject, date, teacherNeedsSubject]);

  useEffect(() => { loadData(); }, [loadData]);

  function toggleMark(studentId: number, status: AttendanceStatus) {
    setMarkMap((m) => ({ ...m, [studentId]: status }));
  }

  function markAll(status: AttendanceStatus) {
    const map: Record<number, AttendanceStatus> = {};
    students.forEach((s) => { map[s.id] = status; });
    setMarkMap(map);
  }

  async function saveAttendance() {
    if (!selectedSection) return;
    const activeSubject = isTeacher ? selectedSubject.trim() : "";
    if (teacherNeedsSubject && !activeSubject) {
      setError("Select an allotted subject before saving attendance.");
      return;
    }
    setSaving(true);
    setSaveMsg("");
    setError("");
    try {
      const toSave = students.filter((s) => markMap[s.id]);
      await attendanceApi.bulkUpsert({
        section: selectedSection,
        date,
        subject: activeSubject || undefined,
        capture_method: captureMethod,
        device: selectedDevice ? Number(selectedDevice) : null,
        source_reference: activeSubject
          ? `subject:${activeSubject}|erp-${captureMethod}-${date}`
          : selectedDevice
            ? `erp-${captureMethod}-${date}`
            : "",
        records: toSave.map((s) => ({ student: s.id, status: markMap[s.id] })),
      });
      setSaveMsg(`Attendance saved for ${toSave.length} student(s)${activeSubject ? ` in ${activeSubject}` : ""}.`);
      loadData();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  // Date navigation
  function shiftDate(days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  }

  const markedCount = Object.keys(markMap).length;
  const presentCount = Object.values(markMap).filter((v) => v === "present").length;
  const absentCount = Object.values(markMap).filter((v) => v === "absent").length;
  const selectedAllocation = subjectOptions.find((allocation) => allocation.subject === selectedSubject);
  const campusDevices = devices.filter((device) => {
    if (!selectedSectionInfo) return device.is_enabled_for_students;
    return device.campus === selectedSectionInfo.campus && device.is_enabled_for_students;
  });
  const earliestEditableDate = earliestEditableISO();
  const currentDate = todayISO();
  const attendanceLocked = date < earliestEditableDate || date > currentDate;
  const teacherHasNoAllotments = Boolean(isTeacher && sections.length === 0);
  const teacherSubjectMissing = Boolean(teacherNeedsSubject && selectedSection && subjectOptions.length === 0);
  const markingDisabled = attendanceLocked || teacherHasNoAllotments || teacherSubjectMissing || (teacherNeedsSubject && !selectedSubject);
  const saveDisabled = saving || markedCount === 0 || markingDisabled;

  return (
    <div className="space-y-6">
      <section className="surface p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="section-kicker">
              <ClipboardCheck size={14} />
              {isTeacher ? "Teacher attendance" : "Attendance"}
            </span>
            <h1 className="display-font mt-3 text-2xl font-semibold text-ink">
              {isTeacher ? "Subject-wise attendance workspace" : "Student attendance operations"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              {isTeacher
                ? "Select an allotted subject and section, then mark attendance for the students in that class."
                : "Select a class, choose the capture source, and save daily attendance inside the allowed edit window."}
            </p>
          </div>
          <div className="rounded-lg border border-line/70 bg-slate-50 px-4 py-3 text-sm text-muted">
            Editable from <span className="font-semibold text-ink">{earliestEditableDate}</span> to <span className="font-semibold text-ink">{currentDate}</span>
          </div>
        </div>
      </section>

      {/* Header controls */}
      <div className="surface rounded-3xl p-4 shadow-soft sm:p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto] xl:items-end">
          {/* Section picker */}
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="att-section" className="text-xs font-semibold uppercase tracking-wider text-muted">Class / Section</label>
            <select
              id="att-section"
              value={selectedSection ?? ""}
              onChange={(e) => setSelectedSection(e.target.value ? Number(e.target.value) : null)}
              disabled={sections.length === 0}
              className="w-full rounded-2xl border border-line/70 bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20"
            >
              {sections.length === 0 && <option value="">No allotted classes</option>}
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.grade_name} - {s.section_name}</option>
              ))}
            </select>
          </div>

          {isTeacher && (
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="att-subject" className="text-xs font-semibold uppercase tracking-wider text-muted">Allotted Subject</label>
              <select
                id="att-subject"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                disabled={subjectOptions.length === 0}
                className="w-full rounded-2xl border border-line/70 bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20"
              >
                {subjectOptions.length === 0 && <option value="">No subject allotted</option>}
                {subjectOptions.map((allocation) => (
                  <option key={allocation.id} value={allocation.subject}>{allocation.subject}</option>
                ))}
              </select>
            </div>
          )}

          {/* Date picker */}
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="att-date" className="text-xs font-semibold uppercase tracking-wider text-muted">Date</label>
            <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-1">
              <button
                type="button"
                onClick={() => shiftDate(-1)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-line/70 bg-white text-muted hover:bg-slate-50 hover:text-ink"
                disabled={date <= earliestEditableDate}
              >
                <ChevronLeft size={16} />
              </button>
              <input
                id="att-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={earliestEditableDate}
                max={currentDate}
                className="w-full rounded-2xl border border-line/70 bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none focus:border-teal-400"
              />
              <button
                type="button"
                onClick={() => shiftDate(1)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-line/70 bg-white text-muted hover:bg-slate-50 hover:text-ink"
                disabled={date >= currentDate}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Attendance source</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex">
              {(["manual", "face_recognition", "fingerprint", "card_scan"] as AttendanceCaptureMethod[]).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => {
                    setCaptureMethod(method);
                    if (method === "manual") setSelectedDevice("");
                  }}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    captureMethod === method
                      ? "border-ink bg-ink text-white"
                      : "border-line/70 bg-white text-muted hover:bg-slate-50 hover:text-ink"
                  }`}
                >
                  {method === "face_recognition" ? "Face" : method === "card_scan" ? "Card" : method === "fingerprint" ? "Finger" : "Manual"}
                </button>
              ))}
            </div>
          </div>

          {captureMethod !== "manual" && (
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="att-device" className="text-xs font-semibold uppercase tracking-wider text-muted">Hardware device</label>
              <select
                id="att-device"
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="w-full rounded-2xl border border-line/70 bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20"
              >
                <option value="">No device selected</option>
                {campusDevices
                  .filter((device) => device.device_type === captureMethod)
                  .map((device) => (
                    <option key={device.id} value={device.id}>{device.name}</option>
                  ))}
              </select>
            </div>
          )}

          {/* Quick mark all */}
          <div className="flex min-w-0 flex-col gap-1 xl:ml-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Mark all</span>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                onClick={() => markAll("present")}
                disabled={markingDisabled}
                className="flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
              >
                <CheckCircle2 size={14} />
                All Present
              </button>
              <button
                type="button"
                onClick={() => markAll("absent")}
                disabled={markingDisabled}
                className="flex items-center justify-center gap-1.5 rounded-2xl bg-rose-50 px-3.5 py-2 text-sm font-medium text-rose-700 border border-rose-200 hover:bg-rose-100 transition"
              >
                <XCircle size={14} />
                All Absent
              </button>
            </div>
          </div>
        </div>

        {/* Summary pills */}
        <div className="mt-4 flex flex-wrap gap-3">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            {students.length} students
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            {presentCount} present
          </span>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
            {absentCount} absent
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
            {students.length - markedCount} unmarked
          </span>
          {isTeacher && selectedSubject && (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              <BookOpen size={12} />
              {selectedSubject}{selectedAllocation?.weekly_periods ? ` - ${selectedAllocation.weekly_periods} periods/week` : ""}
            </span>
          )}
        </div>
      </div>

      {(teacherHasNoAllotments || teacherSubjectMissing) && (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <BookOpen size={18} className="mt-0.5 shrink-0" />
          <p>
            {teacherHasNoAllotments
              ? "No subject allocations are assigned to your teacher account yet. Ask an administrator to allot a class and subject."
              : "No subject is allotted to your teacher account for the selected section. Ask an administrator to add a subject allocation."}
          </p>
        </div>
      )}

      {attendanceLocked && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <p>Attendance is locked outside today and the previous 3 days. Select a date from {earliestEditableDate} to {currentDate}.</p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
          <button className="ml-2 underline" onClick={loadData}>Retry</button>
        </div>
      )}
      {saveMsg && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {saveMsg}
        </div>
      )}

      {/* Student roster */}
      <div className="surface overflow-hidden shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-teal-600" />
            <h3 className="font-semibold text-ink">Student Roster</h3>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-2 rounded-xl border border-line/70 px-3 py-2 text-xs font-medium text-muted hover:bg-slate-50 hover:text-ink"
          >
            <RefreshCcw size={12} />
            Refresh
          </button>
        </div>

        {loading ? (
          <WorkspacePlaceholder compact title="Student roster" detail="Preparing section attendance records." />
        ) : students.length === 0 ? (
          <div className="py-16 text-center text-muted">
            {teacherHasNoAllotments
              ? "No class and subject allocation is assigned to your teacher account."
              : teacherSubjectMissing
                ? "Select an allotted subject to load the roster."
                : "No students in this section."}
          </div>
        ) : (
          <div className="divide-y divide-line/40">
            {students.map((s) => {
              const mark = markMap[s.id];
              return (
                <div
                  key={s.id}
                  className="flex flex-col gap-3 px-4 py-4 transition hover:bg-slate-50/50 sm:flex-row sm:flex-wrap sm:items-center sm:px-5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-blue-600 text-xs font-bold text-white">
                      {s.full_name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-ink text-sm">{s.full_name}</p>
                      <p className="text-xs font-mono text-muted">{s.admission_number}</p>
                    </div>
                  </div>

                  <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:flex sm:flex-wrap">
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleMark(s.id, opt.value)}
                        disabled={markingDisabled}
                        className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold transition sm:px-3.5 ${
                          mark === opt.value
                            ? opt.colour + " shadow-sm"
                            : "border border-line/70 bg-white text-muted hover:bg-slate-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {mark && (
                    <Badge variant={statusBadge(mark)}>{statusLabel(mark)}</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Save button */}
        {students.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-line/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-sm text-muted">{markedCount} of {students.length} marked</p>
            <button
              id="save-attendance-btn"
              type="button"
              onClick={saveAttendance}
              disabled={saveDisabled}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 disabled:opacity-60"
            >
              <Save size={14} />
              {saving ? "Saving..." : "Save Attendance"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
