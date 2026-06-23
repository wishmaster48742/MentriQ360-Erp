"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Filter,
  GraduationCap,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";

import {
  academicEventApi,
  assignedWorkApi,
  assignmentSubmissionApi,
  examScheduleApi,
  learningResourceApi,
  resultRecordApi,
  sectionApi,
  studentApi,
  teacherSubjectAllocationApi,
  timetableApi,
  ApiError,
  type AcademicEvent,
  type AssignedWork,
  type AssignmentSubmission,
  type ClassSection,
  type ExamSchedule,
  type LearningResource,
  type ResultRecord,
  type Student,
  type TeacherSubjectAllocation,
  type TimetableSlot,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Badge, statusBadge, statusLabel } from "@/components/ui/badge";
import { WorkspacePlaceholder } from "@/components/ui/workspace-placeholder";

type TeacherView = "dashboard" | "notes" | "assignments" | "marks" | "events";

type NoteForm = {
  id?: number;
  section: string;
  title: string;
  subject: string;
  description: string;
  is_published: boolean;
  file: File | null;
};

type AssignmentForm = {
  id?: number;
  section: string;
  title: string;
  subject: string;
  description: string;
  due_date: string;
  status: "draft" | "published" | "closed";
  file: File | null;
};

type MarkForm = {
  id?: number;
  student: string;
  exam_name: string;
  subject: string;
  score: string;
  max_score: string;
  grade: string;
  remarks: string;
  file: File | null;
};

const emptyNoteForm: NoteForm = {
  section: "",
  title: "",
  subject: "",
  description: "",
  is_published: true,
  file: null,
};

const emptyAssignmentForm: AssignmentForm = {
  section: "",
  title: "",
  subject: "",
  description: "",
  due_date: "",
  status: "published",
  file: null,
};

const emptyMarkForm: MarkForm = {
  student: "",
  exam_name: "",
  subject: "",
  score: "",
  max_score: "100",
  grade: "",
  remarks: "",
  file: null,
};

function asArray<T>(value: T[] | { results?: T[] }): T[] {
  return Array.isArray(value) ? value : value.results ?? [];
}

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

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

function sectionLabel(section?: ClassSection) {
  if (!section) return "";
  return section.label || `${section.grade_name} - ${section.section_name}`;
}

function fileInputLabel(file: File | null, fallback = "Choose file") {
  return file?.name || fallback;
}

function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  type = "button",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line/70 bg-white px-3 py-2 text-sm font-semibold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</span>;
}

export function TeacherPanel({
  initialView = "dashboard",
  onNavigate,
}: {
  initialView?: TeacherView;
  onNavigate?: (view: TeacherView) => void;
}) {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<TeacherView>(initialView);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [allocations, setAllocations] = useState<TeacherSubjectAllocation[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [notes, setNotes] = useState<LearningResource[]>([]);
  const [assignments, setAssignments] = useState<AssignedWork[]>([]);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [timetable, setTimetable] = useState<TimetableSlot[]>([]);
  const [exams, setExams] = useState<ExamSchedule[]>([]);
  const [events, setEvents] = useState<AcademicEvent[]>([]);
  const [noteForm, setNoteForm] = useState<NoteForm>(emptyNoteForm);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>(emptyAssignmentForm);
  const [markForm, setMarkForm] = useState<MarkForm>(emptyMarkForm);
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [selectedAssignment, setSelectedAssignment] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => setActiveView(initialView), [initialView]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [
        sectionRes,
        allocationRes,
        studentRes,
        notesRes,
        assignmentRes,
        submissionRes,
        resultRes,
        timetableRes,
        examRes,
        eventRes,
      ] = await Promise.all([
        sectionApi.list(),
        teacherSubjectAllocationApi.list({ is_active: "true" }),
        studentApi.list(),
        learningResourceApi.list(),
        assignedWorkApi.list(),
        assignmentSubmissionApi.list(),
        resultRecordApi.list(),
        timetableApi.list(),
        examScheduleApi.list(),
        academicEventApi.list(),
      ]);
      const sectionList = asArray(sectionRes);
      const studentList = asArray(studentRes);
      setSections(sectionList);
      setAllocations(asArray(allocationRes));
      setStudents(studentList);
      setNotes(asArray(notesRes));
      setAssignments(asArray(assignmentRes));
      setSubmissions(asArray(submissionRes));
      setResults(asArray(resultRes));
      setTimetable(asArray(timetableRes));
      setExams(asArray(examRes));
      setEvents(asArray(eventRes));
      setNoteForm((current) => ({ ...current, section: current.section || String(sectionList[0]?.id ?? "") }));
      setAssignmentForm((current) => ({ ...current, section: current.section || String(sectionList[0]?.id ?? "") }));
      setMarkForm((current) => ({ ...current, student: current.student || String(studentList[0]?.id ?? "") }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load teacher workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      academicEventApi.list().then((res) => setEvents(asArray(res))).catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  const sectionIds = useMemo(() => new Set(sections.map((section) => section.id)), [sections]);
  const subjects = useMemo(() => {
    const values = new Set<string>();
    allocations.forEach((allocation) => values.add(allocation.subject));
    timetable.forEach((slot) => values.add(slot.subject));
    notes.forEach((note) => values.add(note.subject));
    assignments.forEach((assignment) => values.add(assignment.subject));
    results.forEach((result) => values.add(result.subject));
    return Array.from(values).filter(Boolean).sort();
  }, [allocations, assignments, notes, results, timetable]);

  const teacherStudents = useMemo(
    () => students.filter((student) => sectionIds.has(student.section)),
    [sectionIds, students]
  );

  const filteredNotes = useMemo(() => notes.filter((note) => {
    const matchesSearch = !search || `${note.title} ${note.subject} ${note.description}`.toLowerCase().includes(search.toLowerCase());
    const matchesSection = !sectionFilter || note.section === Number(sectionFilter);
    const matchesSubject = !subjectFilter || note.subject === subjectFilter;
    return matchesSearch && matchesSection && matchesSubject;
  }), [notes, search, sectionFilter, subjectFilter]);

  const filteredAssignments = useMemo(() => assignments.filter((assignment) => {
    const matchesSearch = !search || `${assignment.title} ${assignment.subject} ${assignment.description}`.toLowerCase().includes(search.toLowerCase());
    const matchesSection = !sectionFilter || assignment.section === Number(sectionFilter);
    const matchesSubject = !subjectFilter || assignment.subject === subjectFilter;
    return matchesSearch && matchesSection && matchesSubject;
  }), [assignments, search, sectionFilter, subjectFilter]);

  const filteredResults = useMemo(() => results.filter((result) => {
    const matchesSearch = !search || `${result.student_name ?? ""} ${result.exam_name} ${result.subject}`.toLowerCase().includes(search.toLowerCase());
    const matchesSubject = !subjectFilter || result.subject === subjectFilter;
    return matchesSearch && matchesSubject;
  }), [results, search, subjectFilter]);

  const todayDay = new Date().getDay() || 7;
  const todaySlots = timetable.filter((slot) => slot.day_of_week === todayDay);
  const pendingAttendance = sections.filter((section) => !events.some((event) => {
    const payload = event.payload as { sectionId?: number; date?: string };
    return event.event_type === "attendanceMarked" && payload.sectionId === section.id && payload.date === todayISO();
  }));
  const upcomingExams = exams.filter((exam) => new Date(exam.exam_date) >= new Date(todayISO())).slice(0, 5);

  function chooseView(view: TeacherView) {
    setActiveView(view);
    onNavigate?.(view);
  }

  function resetFilters() {
    setSearch("");
    setSectionFilter("");
    setSubjectFilter("");
  }

  async function runAction(label: string, action: () => Promise<void>) {
    setBusy(label);
    setMessage("");
    setError("");
    try {
      await action();
      setMessage(label);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy("");
    }
  }

  async function saveNote(event: React.FormEvent) {
    event.preventDefault();
    await runAction(noteForm.id ? "Notes updated." : "Notes uploaded.", async () => {
      if (noteForm.id) {
        await learningResourceApi.update(noteForm.id, {
          section: Number(noteForm.section),
          title: noteForm.title,
          subject: noteForm.subject,
          description: noteForm.description,
          resource_type: "notes",
          is_published: noteForm.is_published,
        });
      } else {
        if (!noteForm.file) throw new ApiError(400, "Choose a notes file.");
        await learningResourceApi.upload({
          section: Number(noteForm.section),
          title: noteForm.title,
          subject: noteForm.subject,
          description: noteForm.description,
          is_published: noteForm.is_published,
          file: noteForm.file,
        });
      }
      setNoteForm({ ...emptyNoteForm, section: noteForm.section });
    });
  }

  async function saveAssignment(event: React.FormEvent) {
    event.preventDefault();
    await runAction(assignmentForm.id ? "Assignment updated." : "Assignment uploaded.", async () => {
      if (assignmentForm.id) {
        await assignedWorkApi.update(assignmentForm.id, {
          section: Number(assignmentForm.section),
          title: assignmentForm.title,
          subject: assignmentForm.subject,
          description: assignmentForm.description,
          due_date: assignmentForm.due_date,
          status: assignmentForm.status,
        });
      } else {
        if (!assignmentForm.file) throw new ApiError(400, "Choose an assignment file.");
        await assignedWorkApi.upload({
          section: Number(assignmentForm.section),
          title: assignmentForm.title,
          subject: assignmentForm.subject,
          description: assignmentForm.description,
          due_date: assignmentForm.due_date,
          status: assignmentForm.status,
          file: assignmentForm.file,
        });
      }
      setAssignmentForm({ ...emptyAssignmentForm, section: assignmentForm.section });
    });
  }

  async function saveMarks(event: React.FormEvent) {
    event.preventDefault();
    await runAction(markForm.id ? "Marks updated." : "Marks uploaded.", async () => {
      const payload = {
        student: Number(markForm.student),
        exam_name: markForm.exam_name,
        subject: markForm.subject,
        score: markForm.score,
        max_score: markForm.max_score,
        grade: markForm.grade,
        remarks: markForm.remarks,
        is_published: false,
      };
      const result = markForm.id
        ? await resultRecordApi.update(markForm.id, payload)
        : await resultRecordApi.create(payload);
      if (markForm.file) await resultRecordApi.uploadMarks(result.id, markForm.file);
      setMarkForm({ ...emptyMarkForm, student: markForm.student });
    });
  }

  if (loading) return <WorkspacePlaceholder title="Teacher workspace" detail="Preparing assigned classes, notes, assignments, and marks." />;

  return (
    <div className="space-y-5">
      <div className="surface p-4 shadow-soft">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <span className="section-kicker"><GraduationCap size={14} /> Teacher Panel</span>
            <h2 className="mt-2 text-xl font-semibold text-ink">{user?.full_name || user?.username || "Teacher"}</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Dashboard", "dashboard", GraduationCap],
              ["Upload Notes", "notes", Upload],
              ["Assignments", "assignments", FileText],
              ["Marks", "marks", BadgeCheck],
              ["Events", "events", RefreshCcw],
            ].map(([label, id, Icon]) => {
              const ActiveIcon = Icon as React.ComponentType<{ size?: number }>;
              return (
                <button
                  key={String(id)}
                  type="button"
                  onClick={() => chooseView(id as TeacherView)}
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
                    activeView === id ? "border-ink bg-ink text-white" : "border-line/70 bg-white text-ink hover:bg-slate-50"
                  }`}
                >
                  <ActiveIcon size={15} />
                  {String(label)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {(message || error) && (
        <div className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </div>
      )}

      {activeView !== "dashboard" && (
        <div className="surface p-4 shadow-soft">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem_auto_auto] md:items-end">
            <label className="block">
              <FieldLabel>Search</FieldLabel>
              <div className="mt-1 flex items-center gap-2 rounded-md border border-line/70 bg-white px-3">
                <Search size={15} className="text-muted" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-10 w-full bg-transparent text-sm outline-none" placeholder="Search records" />
              </div>
            </label>
            <label className="block">
              <FieldLabel>Class</FieldLabel>
              <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-line/70 bg-white px-3 text-sm">
                <option value="">All classes</option>
                {sections.map((section) => <option key={section.id} value={section.id}>{sectionLabel(section)}</option>)}
              </select>
            </label>
            <label className="block">
              <FieldLabel>Subject</FieldLabel>
              <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-line/70 bg-white px-3 text-sm">
                <option value="">All subjects</option>
                {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
              </select>
            </label>
            <SecondaryButton onClick={resetFilters}><Filter size={15} /> Reset</SecondaryButton>
            <SecondaryButton onClick={() => chooseView("dashboard")}><ArrowLeft size={15} /> Back</SecondaryButton>
          </div>
        </div>
      )}

      {activeView === "dashboard" && (
        <TeacherDashboard
          sections={sections}
          subjects={subjects}
          todaySlots={todaySlots}
          pendingAttendance={pendingAttendance}
          notes={notes}
          assignments={assignments}
          submissions={submissions}
          results={results}
          upcomingExams={upcomingExams}
          events={events}
          onNavigate={chooseView}
          refresh={() => runAction("Teacher dashboard refreshed.", async () => { await load(); })}
        />
      )}

      {activeView === "notes" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)]">
          <form onSubmit={saveNote} className="surface space-y-4 p-4 shadow-soft">
            <h3 className="font-semibold text-ink">{noteForm.id ? "Edit Notes" : "Upload Notes"}</h3>
            <TeacherFormFields
              sections={sections}
              subjects={subjects}
              section={noteForm.section}
              subject={noteForm.subject}
              onSection={(value) => setNoteForm((form) => ({ ...form, section: value }))}
              onSubject={(value) => setNoteForm((form) => ({ ...form, subject: value }))}
            />
            <label className="block"><FieldLabel>Title</FieldLabel><input required value={noteForm.title} onChange={(event) => setNoteForm((form) => ({ ...form, title: event.target.value }))} className="mt-1 min-h-10 w-full rounded-md border border-line/70 px-3 text-sm" /></label>
            <label className="block"><FieldLabel>Description</FieldLabel><textarea value={noteForm.description} onChange={(event) => setNoteForm((form) => ({ ...form, description: event.target.value }))} className="mt-1 min-h-24 w-full rounded-md border border-line/70 px-3 py-2 text-sm" /></label>
            {!noteForm.id && (
              <label className="block"><FieldLabel>File</FieldLabel><input required type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,image/*" onChange={(event) => setNoteForm((form) => ({ ...form, file: event.target.files?.[0] ?? null }))} className="mt-1 w-full rounded-md border border-line/70 bg-white px-3 py-2 text-sm" /><span className="mt-1 block text-xs text-muted">{fileInputLabel(noteForm.file)}</span></label>
            )}
            <label className="flex items-center gap-2 text-sm font-medium text-ink"><input type="checkbox" checked={noteForm.is_published} onChange={(event) => setNoteForm((form) => ({ ...form, is_published: event.target.checked }))} /> Publish notes</label>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="submit" disabled={Boolean(busy)}>{noteForm.id ? <Pencil size={15} /> : <Upload size={15} />}{noteForm.id ? "Edit Notes" : "Upload Notes"}</PrimaryButton>
              <SecondaryButton onClick={() => setNoteForm({ ...emptyNoteForm, section: noteForm.section })}>Reset</SecondaryButton>
            </div>
          </form>
          <NotesTable
            notes={filteredNotes}
            busy={busy}
            onEdit={(note) => setNoteForm({ id: note.id, section: String(note.section), title: note.title, subject: note.subject, description: note.description, is_published: note.is_published, file: null })}
            onDelete={(note) => runAction("Notes deleted.", async () => { await learningResourceApi.remove(note.id); })}
            onDownload={(note) => runAction("Notes downloaded.", async () => { downloadBlob(await learningResourceApi.download(note.id), note.file_name || `${note.title}.pdf`); })}
            onPublish={(note) => runAction(note.is_published ? "Notes unpublished." : "Notes published.", async () => { if (note.is_published) await learningResourceApi.unpublish(note.id); else await learningResourceApi.publish(note.id); })}
          />
        </div>
      )}

      {activeView === "assignments" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)]">
          <form onSubmit={saveAssignment} className="surface space-y-4 p-4 shadow-soft">
            <h3 className="font-semibold text-ink">{assignmentForm.id ? "Edit Assignment" : "Create Assignment"}</h3>
            <TeacherFormFields
              sections={sections}
              subjects={subjects}
              section={assignmentForm.section}
              subject={assignmentForm.subject}
              onSection={(value) => setAssignmentForm((form) => ({ ...form, section: value }))}
              onSubject={(value) => setAssignmentForm((form) => ({ ...form, subject: value }))}
            />
            <label className="block"><FieldLabel>Title</FieldLabel><input required value={assignmentForm.title} onChange={(event) => setAssignmentForm((form) => ({ ...form, title: event.target.value }))} className="mt-1 min-h-10 w-full rounded-md border border-line/70 px-3 text-sm" /></label>
            <label className="block"><FieldLabel>Description</FieldLabel><textarea value={assignmentForm.description} onChange={(event) => setAssignmentForm((form) => ({ ...form, description: event.target.value }))} className="mt-1 min-h-24 w-full rounded-md border border-line/70 px-3 py-2 text-sm" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><FieldLabel>Deadline</FieldLabel><input required type="date" value={assignmentForm.due_date} onChange={(event) => setAssignmentForm((form) => ({ ...form, due_date: event.target.value }))} className="mt-1 min-h-10 w-full rounded-md border border-line/70 px-3 text-sm" /></label>
              <label className="block"><FieldLabel>Status</FieldLabel><select value={assignmentForm.status} onChange={(event) => setAssignmentForm((form) => ({ ...form, status: event.target.value as AssignmentForm["status"] }))} className="mt-1 min-h-10 w-full rounded-md border border-line/70 px-3 text-sm"><option value="published">Published</option><option value="draft">Draft</option><option value="closed">Closed</option></select></label>
            </div>
            {!assignmentForm.id && (
              <label className="block"><FieldLabel>File</FieldLabel><input required type="file" accept=".pdf,.doc,.docx,image/*" onChange={(event) => setAssignmentForm((form) => ({ ...form, file: event.target.files?.[0] ?? null }))} className="mt-1 w-full rounded-md border border-line/70 bg-white px-3 py-2 text-sm" /><span className="mt-1 block text-xs text-muted">{fileInputLabel(assignmentForm.file)}</span></label>
            )}
            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="submit" disabled={Boolean(busy)}>{assignmentForm.id ? <Pencil size={15} /> : <Plus size={15} />}{assignmentForm.id ? "Update" : "Create Assignment"}</PrimaryButton>
              <SecondaryButton onClick={() => setAssignmentForm({ ...emptyAssignmentForm, section: assignmentForm.section })}>Reset</SecondaryButton>
            </div>
          </form>
          <AssignmentsTable
            assignments={filteredAssignments}
            selectedAssignment={selectedAssignment}
            submissions={submissions}
            busy={busy}
            onSelect={setSelectedAssignment}
            onEdit={(assignment) => setAssignmentForm({ id: assignment.id, section: String(assignment.section), title: assignment.title, subject: assignment.subject, description: assignment.description, due_date: assignment.due_date, status: assignment.status, file: null })}
            onDelete={(assignment) => runAction("Assignment deleted.", async () => { await assignedWorkApi.remove(assignment.id); })}
            onDownload={(assignment) => runAction("Assignment downloaded.", async () => { downloadBlob(await assignedWorkApi.download(assignment.id), assignment.file_name || `${assignment.title}.pdf`); })}
            onPublish={(assignment) => runAction(assignment.status === "published" ? "Assignment unpublished." : "Assignment published.", async () => { if (assignment.status === "published") await assignedWorkApi.unpublish(assignment.id); else await assignedWorkApi.publish(assignment.id); })}
            onDownloadSubmission={(submission) => runAction("Submission downloaded.", async () => { downloadBlob(await assignmentSubmissionApi.download(submission.id), submission.file_name || `submission-${submission.id}.pdf`); })}
            onMarkChecked={(submission) => runAction("Submission checked.", async () => { await assignmentSubmissionApi.markChecked(submission.id, submission.remarks || "Checked"); })}
            onAddRemarks={(submission) => {
              const remarks = window.prompt("Remarks", submission.remarks || "");
              if (remarks !== null) runAction("Remarks added.", async () => { await assignmentSubmissionApi.addRemarks(submission.id, remarks); });
            }}
          />
        </div>
      )}

      {activeView === "marks" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)]">
          <form onSubmit={saveMarks} className="surface space-y-4 p-4 shadow-soft">
            <h3 className="font-semibold text-ink">{markForm.id ? "Edit Marks" : "Upload Marks"}</h3>
            <label className="block"><FieldLabel>Student</FieldLabel><select required value={markForm.student} onChange={(event) => setMarkForm((form) => ({ ...form, student: event.target.value }))} className="mt-1 min-h-10 w-full rounded-md border border-line/70 px-3 text-sm"><option value="">Select student</option>{teacherStudents.map((student) => <option key={student.id} value={student.id}>{student.full_name} - {student.admission_number}</option>)}</select></label>
            <label className="block"><FieldLabel>Exam</FieldLabel><input required value={markForm.exam_name} onChange={(event) => setMarkForm((form) => ({ ...form, exam_name: event.target.value }))} className="mt-1 min-h-10 w-full rounded-md border border-line/70 px-3 text-sm" /></label>
            <label className="block"><FieldLabel>Subject</FieldLabel><input required list="teacher-subjects" value={markForm.subject} onChange={(event) => setMarkForm((form) => ({ ...form, subject: event.target.value }))} className="mt-1 min-h-10 w-full rounded-md border border-line/70 px-3 text-sm" /></label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block"><FieldLabel>Score</FieldLabel><input required type="number" min="0" step="0.01" value={markForm.score} onChange={(event) => setMarkForm((form) => ({ ...form, score: event.target.value }))} className="mt-1 min-h-10 w-full rounded-md border border-line/70 px-3 text-sm" /></label>
              <label className="block"><FieldLabel>Max</FieldLabel><input required type="number" min="1" step="0.01" value={markForm.max_score} onChange={(event) => setMarkForm((form) => ({ ...form, max_score: event.target.value }))} className="mt-1 min-h-10 w-full rounded-md border border-line/70 px-3 text-sm" /></label>
              <label className="block"><FieldLabel>Grade</FieldLabel><input value={markForm.grade} onChange={(event) => setMarkForm((form) => ({ ...form, grade: event.target.value }))} className="mt-1 min-h-10 w-full rounded-md border border-line/70 px-3 text-sm" /></label>
            </div>
            <label className="block"><FieldLabel>Remarks</FieldLabel><textarea value={markForm.remarks} onChange={(event) => setMarkForm((form) => ({ ...form, remarks: event.target.value }))} className="mt-1 min-h-20 w-full rounded-md border border-line/70 px-3 py-2 text-sm" /></label>
            <label className="block"><FieldLabel>Marks File</FieldLabel><input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(event) => setMarkForm((form) => ({ ...form, file: event.target.files?.[0] ?? null }))} className="mt-1 w-full rounded-md border border-line/70 bg-white px-3 py-2 text-sm" /><span className="mt-1 block text-xs text-muted">{fileInputLabel(markForm.file, "Optional file")}</span></label>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="submit" disabled={Boolean(busy)}>{markForm.id ? <Pencil size={15} /> : <Upload size={15} />}{markForm.id ? "Update" : "Upload Marks"}</PrimaryButton>
              <SecondaryButton onClick={() => setMarkForm({ ...emptyMarkForm, student: markForm.student })}>Reset</SecondaryButton>
            </div>
          </form>
          <MarksTable
            results={filteredResults}
            busy={busy}
            onEdit={(result) => setMarkForm({ id: result.id, student: String(result.student), exam_name: result.exam_name, subject: result.subject, score: result.score, max_score: result.max_score, grade: result.grade, remarks: result.remarks, file: null })}
            onSubmit={(result) => runAction("Marks submitted for review.", async () => { await resultRecordApi.submitReview(result.id); })}
            onDownload={(result) => runAction("Result downloaded.", async () => { downloadBlob(await resultRecordApi.downloadResult(result.id), `result-${result.id}.pdf`); })}
            onDownloadMarks={(result) => runAction("Marks file downloaded.", async () => { downloadBlob(await resultRecordApi.downloadMarksFile(result.id), result.marks_file_name || `marks-${result.id}.pdf`); })}
          />
        </div>
      )}

      {activeView === "events" && <EventsPanel events={events} />}
      <datalist id="teacher-subjects">{subjects.map((subject) => <option key={subject} value={subject} />)}</datalist>
    </div>
  );
}

function TeacherFormFields({
  sections,
  subjects,
  section,
  subject,
  onSection,
  onSubject,
}: {
  sections: ClassSection[];
  subjects: string[];
  section: string;
  subject: string;
  onSection: (value: string) => void;
  onSubject: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <FieldLabel>Class / Section</FieldLabel>
        <select required value={section} onChange={(event) => onSection(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-line/70 px-3 text-sm">
          <option value="">Select class</option>
          {sections.map((item) => <option key={item.id} value={item.id}>{sectionLabel(item)}</option>)}
        </select>
      </label>
      <label className="block">
        <FieldLabel>Subject</FieldLabel>
        <input required list="teacher-subjects" value={subject} onChange={(event) => onSubject(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-line/70 px-3 text-sm" />
        {subjects.length > 0 && <span className="mt-1 block text-xs text-muted">Use an allotted subject.</span>}
      </label>
    </div>
  );
}

function TeacherDashboard({
  sections,
  subjects,
  todaySlots,
  pendingAttendance,
  notes,
  assignments,
  submissions,
  results,
  upcomingExams,
  events,
  onNavigate,
  refresh,
}: {
  sections: ClassSection[];
  subjects: string[];
  todaySlots: TimetableSlot[];
  pendingAttendance: ClassSection[];
  notes: LearningResource[];
  assignments: AssignedWork[];
  submissions: AssignmentSubmission[];
  results: ResultRecord[];
  upcomingExams: ExamSchedule[];
  events: AcademicEvent[];
  onNavigate: (view: TeacherView) => void;
  refresh: () => void;
}) {
  const cards = [
    ["Assigned Classes", sections.length, GraduationCap],
    ["Assigned Subjects", subjects.length, BookOpen],
    ["Pending Attendance", pendingAttendance.length, FileCheck2],
    ["Uploaded Notes", notes.length, Upload],
    ["Assignments", assignments.length, FileText],
    ["Submissions", submissions.length, CheckCircle2],
    ["Upcoming Exams", upcomingExams.length, BadgeCheck],
    ["Uploaded Marks", results.length, BadgeCheck],
  ];
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon]) => {
          const CardIcon = Icon as React.ComponentType<{ size?: number; className?: string }>;
          return (
            <div key={String(label)} className="surface p-4 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-muted">{String(label)}</p>
                <CardIcon size={18} className="text-ink" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-ink">{String(value)}</p>
            </div>
          );
        })}
      </section>
      <section className="grid gap-5 xl:grid-cols-3">
        <div className="surface p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-ink">Today Timetable</h3><BookOpen size={16} /></div>
          <div className="mt-3 divide-y divide-line/50">
            {todaySlots.length ? todaySlots.map((slot) => <p key={slot.id} className="py-2 text-sm text-muted"><span className="font-semibold text-ink">{slot.start_time}</span> {slot.subject} - {slot.section_label}</p>) : <p className="py-6 text-sm text-muted">No timetable slots today.</p>}
          </div>
        </div>
        <div className="surface p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-ink">Upcoming Exams</h3><BadgeCheck size={16} /></div>
          <div className="mt-3 divide-y divide-line/50">
            {upcomingExams.length ? upcomingExams.map((exam) => <p key={exam.id} className="py-2 text-sm text-muted"><span className="font-semibold text-ink">{exam.subject_name || exam.subject}</span> {formatDate(exam.exam_date)}</p>) : <p className="py-6 text-sm text-muted">No upcoming exams.</p>}
          </div>
        </div>
        <div className="surface p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-ink">Recent Events</h3><RefreshCcw size={16} /></div>
          <div className="mt-3 divide-y divide-line/50">
            {events.slice(0, 5).map((event) => <p key={event.id} className="py-2 text-sm text-muted"><span className="font-semibold text-ink">{statusLabel(event.event_type)}</span> {formatDate(event.created_at)}</p>)}
            {events.length === 0 && <p className="py-6 text-sm text-muted">No recent academic events.</p>}
          </div>
        </div>
      </section>
      <section className="surface p-4 shadow-soft">
        <div className="flex flex-wrap gap-2">
          <PrimaryButton onClick={() => onNavigate("notes")}><Upload size={15} /> Upload Notes</PrimaryButton>
          <PrimaryButton onClick={() => onNavigate("assignments")}><Plus size={15} /> Create Assignment</PrimaryButton>
          <PrimaryButton onClick={() => onNavigate("marks")}><Upload size={15} /> Upload Marks</PrimaryButton>
          <SecondaryButton onClick={refresh}><RefreshCcw size={15} /> Refresh</SecondaryButton>
        </div>
      </section>
    </div>
  );
}

function NotesTable({
  notes,
  busy,
  onEdit,
  onDelete,
  onDownload,
  onPublish,
}: {
  notes: LearningResource[];
  busy: string;
  onEdit: (note: LearningResource) => void;
  onDelete: (note: LearningResource) => void;
  onDownload: (note: LearningResource) => void;
  onPublish: (note: LearningResource) => void;
}) {
  return (
    <section className="surface overflow-hidden shadow-soft">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line/60 bg-slate-50">{["Title", "Class", "Subject", "Status", "File", "Actions"].map((head) => <th key={head} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{head}</th>)}</tr></thead>
          <tbody>
            {notes.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No notes found.</td></tr> : notes.map((note) => (
              <tr key={note.id} className="border-b border-line/40">
                <td className="px-4 py-3 font-semibold text-ink">{note.title}</td>
                <td className="px-4 py-3 text-muted">{note.section_label}</td>
                <td className="px-4 py-3 text-muted">{note.subject}</td>
                <td className="px-4 py-3"><Badge variant={note.is_published ? "success" : "neutral"}>{note.is_published ? "Published" : "Unpublished"}</Badge></td>
                <td className="px-4 py-3 text-muted">{note.file_name || "No file"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <SecondaryButton onClick={() => onEdit(note)} disabled={Boolean(busy)}><Pencil size={14} /> Edit Notes</SecondaryButton>
                    <SecondaryButton onClick={() => onPublish(note)} disabled={Boolean(busy)}>{note.is_published ? <XCircle size={14} /> : <Send size={14} />}{note.is_published ? "Unpublish" : "Publish"}</SecondaryButton>
                    <SecondaryButton onClick={() => onDownload(note)} disabled={Boolean(busy) || !note.file_name}><Download size={14} /> Download Notes</SecondaryButton>
                    <SecondaryButton onClick={() => onDelete(note)} disabled={Boolean(busy)}><Trash2 size={14} /> Delete Notes</SecondaryButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AssignmentsTable({
  assignments,
  selectedAssignment,
  submissions,
  busy,
  onSelect,
  onEdit,
  onDelete,
  onDownload,
  onPublish,
  onDownloadSubmission,
  onMarkChecked,
  onAddRemarks,
}: {
  assignments: AssignedWork[];
  selectedAssignment: number | null;
  submissions: AssignmentSubmission[];
  busy: string;
  onSelect: (id: number | null) => void;
  onEdit: (assignment: AssignedWork) => void;
  onDelete: (assignment: AssignedWork) => void;
  onDownload: (assignment: AssignedWork) => void;
  onPublish: (assignment: AssignedWork) => void;
  onDownloadSubmission: (submission: AssignmentSubmission) => void;
  onMarkChecked: (submission: AssignmentSubmission) => void;
  onAddRemarks: (submission: AssignmentSubmission) => void;
}) {
  const visibleSubmissions = selectedAssignment ? submissions.filter((submission) => submission.assignment === selectedAssignment) : [];
  return (
    <section className="space-y-5">
      <div className="surface overflow-hidden shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line/60 bg-slate-50">{["Assignment", "Class", "Subject", "Deadline", "Status", "Actions"].map((head) => <th key={head} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{head}</th>)}</tr></thead>
            <tbody>
              {assignments.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No assignments found.</td></tr> : assignments.map((assignment) => (
                <tr key={assignment.id} className="border-b border-line/40">
                  <td className="px-4 py-3 font-semibold text-ink">{assignment.title}</td>
                  <td className="px-4 py-3 text-muted">{assignment.section_label}</td>
                  <td className="px-4 py-3 text-muted">{assignment.subject}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(assignment.due_date)}</td>
                  <td className="px-4 py-3"><Badge variant={statusBadge(assignment.status)}>{assignment.status}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <SecondaryButton onClick={() => onSelect(selectedAssignment === assignment.id ? null : assignment.id)}><Eye size={14} /> View</SecondaryButton>
                      <SecondaryButton onClick={() => onEdit(assignment)} disabled={Boolean(busy)}><Pencil size={14} /> Edit</SecondaryButton>
                      <SecondaryButton onClick={() => onPublish(assignment)} disabled={Boolean(busy)}>{assignment.status === "published" ? <XCircle size={14} /> : <Send size={14} />}{assignment.status === "published" ? "Unpublish" : "Publish"}</SecondaryButton>
                      <SecondaryButton onClick={() => onDownload(assignment)} disabled={Boolean(busy) || !assignment.file_name}><Download size={14} /> Download</SecondaryButton>
                      <SecondaryButton onClick={() => onDelete(assignment)} disabled={Boolean(busy)}><Trash2 size={14} /> Delete</SecondaryButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selectedAssignment && (
        <div className="surface overflow-hidden shadow-soft">
          <div className="border-b border-line/60 px-4 py-3"><h3 className="font-semibold text-ink">Student Submissions</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line/60 bg-slate-50">{["Student", "Submitted", "Status", "Remarks", "Actions"].map((head) => <th key={head} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{head}</th>)}</tr></thead>
              <tbody>
                {visibleSubmissions.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No submissions for this assignment.</td></tr> : visibleSubmissions.map((submission) => (
                  <tr key={submission.id} className="border-b border-line/40">
                    <td className="px-4 py-3 font-semibold text-ink">{submission.student_name}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(submission.submitted_at)}</td>
                    <td className="px-4 py-3"><Badge variant={statusBadge(submission.status)}>{submission.status}</Badge></td>
                    <td className="px-4 py-3 text-muted">{submission.remarks || "No remarks"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <SecondaryButton onClick={() => onDownloadSubmission(submission)}><Download size={14} /> Download Submission</SecondaryButton>
                        <SecondaryButton onClick={() => onMarkChecked(submission)}><CheckCircle2 size={14} /> Mark Checked</SecondaryButton>
                        <SecondaryButton onClick={() => onAddRemarks(submission)}><Pencil size={14} /> Add Remarks</SecondaryButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function MarksTable({
  results,
  busy,
  onEdit,
  onSubmit,
  onDownload,
  onDownloadMarks,
}: {
  results: ResultRecord[];
  busy: string;
  onEdit: (result: ResultRecord) => void;
  onSubmit: (result: ResultRecord) => void;
  onDownload: (result: ResultRecord) => void;
  onDownloadMarks: (result: ResultRecord) => void;
}) {
  return (
    <section className="surface overflow-hidden shadow-soft">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line/60 bg-slate-50">{["Student", "Exam", "Subject", "Score", "Review", "Published", "Actions"].map((head) => <th key={head} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{head}</th>)}</tr></thead>
          <tbody>
            {results.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No marks uploaded.</td></tr> : results.map((result) => (
              <tr key={result.id} className="border-b border-line/40">
                <td className="px-4 py-3 font-semibold text-ink">{result.student_name}</td>
                <td className="px-4 py-3 text-muted">{result.exam_name}</td>
                <td className="px-4 py-3 text-muted">{result.subject}</td>
                <td className="px-4 py-3 text-muted">{result.score} / {result.max_score}</td>
                <td className="px-4 py-3"><Badge variant={statusBadge(result.review_status || "draft")}>{result.review_status || "draft"}</Badge></td>
                <td className="px-4 py-3"><Badge variant={result.is_published ? "success" : "neutral"}>{result.is_published ? "Published" : "Hidden"}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <SecondaryButton onClick={() => onEdit(result)} disabled={Boolean(busy)}><Pencil size={14} /> Edit</SecondaryButton>
                    <SecondaryButton onClick={() => onSubmit(result)} disabled={Boolean(busy)}><Send size={14} /> Submit for Review</SecondaryButton>
                    <SecondaryButton onClick={() => onDownloadMarks(result)} disabled={!result.marks_file_name}><Download size={14} /> Download Marks</SecondaryButton>
                    <SecondaryButton onClick={() => onDownload(result)}><Download size={14} /> Download Result</SecondaryButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EventsPanel({ events }: { events: AcademicEvent[] }) {
  return (
    <section className="surface overflow-hidden shadow-soft">
      <div className="border-b border-line/60 px-4 py-3"><h3 className="font-semibold text-ink">Real-Time Academic Updates</h3></div>
      <div className="divide-y divide-line/50">
        {events.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted">No academic events yet.</p> : events.map((event) => (
          <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-semibold text-ink">{statusLabel(event.event_type)}</p>
              <p className="text-xs text-muted">{event.student_name || event.teacher_name || event.campus_name}</p>
            </div>
            <span className="text-xs text-muted">{formatDate(event.created_at)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
