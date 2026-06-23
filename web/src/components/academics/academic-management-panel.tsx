"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award,
  BadgeCheck,
  BookOpen,
  ExternalLink,
  FileText,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react";

import {
  admitCardApi,
  assignedWorkApi,
  learningResourceApi,
  resultRecordApi,
  sectionApi,
  studentApi,
  ApiError,
  type AcademicWorkStatus,
  type AdmitCard,
  type AdmitCardStatus,
  type AssignedWork,
  type ClassSection,
  type LearningResource,
  type ResourceType,
  type ResultRecord,
  type Student,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Badge, statusBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { WorkspacePlaceholder } from "@/components/ui/workspace-placeholder";

type AcademicView = "work" | "resources" | "results" | "admit";

const academicViews: {
  id: AcademicView;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: "work", label: "Assigned Work", icon: BookOpen },
  { id: "resources", label: "Resources", icon: FileText },
  { id: "results", label: "Results", icon: Award },
  { id: "admit", label: "Admit Cards", icon: BadgeCheck },
];

const inputCls =
  "w-full rounded-2xl border border-line/80 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20";

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

function FormFooter({ busy, label, onCancel }: { busy: boolean; label: string; onCancel: () => void }) {
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

function WorkForm({
  sections,
  onSave,
  onCancel,
}: {
  sections: ClassSection[];
  onSave: (data: { section: number; title: string; subject: string; description: string; due_date: string; status: AcademicWorkStatus }) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    section: String(sections[0]?.id ?? ""),
    title: "",
    subject: "",
    description: "",
    due_date: "",
    status: "published" as AcademicWorkStatus,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ ...form, section: Number(form.section) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Assigned work save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Section *">
          <select className={inputCls} value={form.section} onChange={(event) => setForm((state) => ({ ...state, section: event.target.value }))} required>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>{section.label ?? `${section.grade_name} - ${section.section_name}`}</option>
            ))}
          </select>
        </Field>
        <Field label="Subject *">
          <input className={inputCls} value={form.subject} onChange={(event) => setForm((state) => ({ ...state, subject: event.target.value }))} required />
        </Field>
        <Field label="Title *" wide>
          <input className={inputCls} value={form.title} onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))} required />
        </Field>
        <Field label="Due date *">
          <input type="date" className={inputCls} value={form.due_date} onChange={(event) => setForm((state) => ({ ...state, due_date: event.target.value }))} required />
        </Field>
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={(event) => setForm((state) => ({ ...state, status: event.target.value as AcademicWorkStatus }))}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="closed">Closed</option>
          </select>
        </Field>
        <Field label="Description" wide>
          <textarea className={`${inputCls} min-h-24 resize-y`} value={form.description} onChange={(event) => setForm((state) => ({ ...state, description: event.target.value }))} />
        </Field>
      </div>
      <FormFooter busy={busy} label="Save work" onCancel={onCancel} />
    </form>
  );
}

function ResourceForm({
  sections,
  onSave,
  onCancel,
}: {
  sections: ClassSection[];
  onSave: (data: { section: number; title: string; subject: string; resource_type: ResourceType; description: string; file_url: string; published_on: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    section: String(sections[0]?.id ?? ""),
    title: "",
    subject: "",
    resource_type: "notes" as ResourceType,
    description: "",
    file_url: "",
    published_on: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ ...form, section: Number(form.section) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Resource save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Section *">
          <select className={inputCls} value={form.section} onChange={(event) => setForm((state) => ({ ...state, section: event.target.value }))} required>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>{section.label ?? `${section.grade_name} - ${section.section_name}`}</option>
            ))}
          </select>
        </Field>
        <Field label="Subject *">
          <input className={inputCls} value={form.subject} onChange={(event) => setForm((state) => ({ ...state, subject: event.target.value }))} required />
        </Field>
        <Field label="Title *" wide>
          <input className={inputCls} value={form.title} onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))} required />
        </Field>
        <Field label="Type">
          <select className={inputCls} value={form.resource_type} onChange={(event) => setForm((state) => ({ ...state, resource_type: event.target.value as ResourceType }))}>
            <option value="notes">Notes</option>
            <option value="syllabus">Syllabus</option>
            <option value="assignment_help">Assignment Help</option>
            <option value="reference">Reference</option>
          </select>
        </Field>
        <Field label="Published on *">
          <input type="date" className={inputCls} value={form.published_on} onChange={(event) => setForm((state) => ({ ...state, published_on: event.target.value }))} required />
        </Field>
        <Field label="Resource URL">
          <input className={inputCls} value={form.file_url} onChange={(event) => setForm((state) => ({ ...state, file_url: event.target.value }))} placeholder="https://..." />
        </Field>
        <Field label="Description" wide>
          <textarea className={`${inputCls} min-h-24 resize-y`} value={form.description} onChange={(event) => setForm((state) => ({ ...state, description: event.target.value }))} />
        </Field>
      </div>
      <FormFooter busy={busy} label="Save resource" onCancel={onCancel} />
    </form>
  );
}

function ResultForm({
  students,
  onSave,
  onCancel,
}: {
  students: Student[];
  onSave: (data: { student: number; exam_name: string; subject: string; score: string; max_score: string; grade: string; remarks: string; published_on: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    student: String(students[0]?.id ?? ""),
    exam_name: "",
    subject: "",
    score: "",
    max_score: "100",
    grade: "",
    remarks: "",
    published_on: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ ...form, student: Number(form.student) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Result save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Student *" wide>
          <select className={inputCls} value={form.student} onChange={(event) => setForm((state) => ({ ...state, student: event.target.value }))} required>
            {students.map((student) => (
              <option key={student.id} value={student.id}>{student.full_name} ({student.admission_number})</option>
            ))}
          </select>
        </Field>
        <Field label="Exam *">
          <input className={inputCls} value={form.exam_name} onChange={(event) => setForm((state) => ({ ...state, exam_name: event.target.value }))} required />
        </Field>
        <Field label="Subject *">
          <input className={inputCls} value={form.subject} onChange={(event) => setForm((state) => ({ ...state, subject: event.target.value }))} required />
        </Field>
        <Field label="Score *">
          <input type="number" min="0" step="0.01" className={inputCls} value={form.score} onChange={(event) => setForm((state) => ({ ...state, score: event.target.value }))} required />
        </Field>
        <Field label="Max score *">
          <input type="number" min="1" step="0.01" className={inputCls} value={form.max_score} onChange={(event) => setForm((state) => ({ ...state, max_score: event.target.value }))} required />
        </Field>
        <Field label="Grade">
          <input className={inputCls} value={form.grade} onChange={(event) => setForm((state) => ({ ...state, grade: event.target.value }))} />
        </Field>
        <Field label="Published on *">
          <input type="date" className={inputCls} value={form.published_on} onChange={(event) => setForm((state) => ({ ...state, published_on: event.target.value }))} required />
        </Field>
        <Field label="Remarks" wide>
          <textarea className={`${inputCls} min-h-24 resize-y`} value={form.remarks} onChange={(event) => setForm((state) => ({ ...state, remarks: event.target.value }))} />
        </Field>
      </div>
      <FormFooter busy={busy} label="Save result" onCancel={onCancel} />
    </form>
  );
}

function AdmitCardForm({
  students,
  onSave,
  onCancel,
}: {
  students: Student[];
  onSave: (data: { student: number; exam_name: string; roll_number: string; exam_date: string; reporting_time: string; venue: string; instructions: string; status: AdmitCardStatus; issued_on: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    student: String(students[0]?.id ?? ""),
    exam_name: "",
    roll_number: "",
    exam_date: "",
    reporting_time: "08:30",
    venue: "",
    instructions: "",
    status: "issued" as AdmitCardStatus,
    issued_on: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ ...form, student: Number(form.student) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Admit card save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Student *" wide>
          <select className={inputCls} value={form.student} onChange={(event) => setForm((state) => ({ ...state, student: event.target.value }))} required>
            {students.map((student) => (
              <option key={student.id} value={student.id}>{student.full_name} ({student.admission_number})</option>
            ))}
          </select>
        </Field>
        <Field label="Exam *">
          <input className={inputCls} value={form.exam_name} onChange={(event) => setForm((state) => ({ ...state, exam_name: event.target.value }))} required />
        </Field>
        <Field label="Roll number *">
          <input className={inputCls} value={form.roll_number} onChange={(event) => setForm((state) => ({ ...state, roll_number: event.target.value }))} required />
        </Field>
        <Field label="Exam date *">
          <input type="date" className={inputCls} value={form.exam_date} onChange={(event) => setForm((state) => ({ ...state, exam_date: event.target.value }))} required />
        </Field>
        <Field label="Reporting time *">
          <input type="time" className={inputCls} value={form.reporting_time} onChange={(event) => setForm((state) => ({ ...state, reporting_time: event.target.value }))} required />
        </Field>
        <Field label="Venue *">
          <input className={inputCls} value={form.venue} onChange={(event) => setForm((state) => ({ ...state, venue: event.target.value }))} required />
        </Field>
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={(event) => setForm((state) => ({ ...state, status: event.target.value as AdmitCardStatus }))}>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="blocked">Blocked</option>
          </select>
        </Field>
        <Field label="Issued on *">
          <input type="date" className={inputCls} value={form.issued_on} onChange={(event) => setForm((state) => ({ ...state, issued_on: event.target.value }))} required />
        </Field>
        <Field label="Instructions" wide>
          <textarea className={`${inputCls} min-h-24 resize-y`} value={form.instructions} onChange={(event) => setForm((state) => ({ ...state, instructions: event.target.value }))} />
        </Field>
      </div>
      <FormFooter busy={busy} label="Save admit card" onCancel={onCancel} />
    </form>
  );
}

export function AcademicManagementPanel() {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<AcademicView>("work");
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [work, setWork] = useState<AssignedWork[]>([]);
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [admitCards, setAdmitCards] = useState<AdmitCard[]>([]);
  const [modal, setModal] = useState<AcademicView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sectionRes, studentRes, workRes, resourceRes, resultRes, admitRes] = await Promise.all([
        sectionApi.list(),
        studentApi.list(),
        assignedWorkApi.list(),
        learningResourceApi.list(),
        resultRecordApi.list(),
        admitCardApi.list(),
      ]);
      setSections(asArray(sectionRes));
      setStudents(asArray(studentRes));
      setWork(asArray(workRes));
      setResources(asArray(resourceRes));
      setResults(asArray(resultRes));
      setAdmitCards(asArray(admitRes));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load academic records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refreshAfterSave() {
    setModal(null);
    await load();
  }

  async function removeRecord(view: AcademicView, id: number) {
    if (!confirm("Delete this record?")) return;
    try {
      if (view === "work") await assignedWorkApi.remove(id);
      if (view === "resources") await learningResourceApi.remove(id);
      if (view === "results") await resultRecordApi.remove(id);
      if (view === "admit") await admitCardApi.remove(id);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  if (loading) {
    return <WorkspacePlaceholder title="Academic workspace" detail="Preparing work, resources, results, and admit cards." />;
  }

  const title = user?.role === "teacher" ? "Class Academics" : "Academic Management";

  return (
    <div className="space-y-6">
      <section className="surface p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="section-kicker">{title}</span>
            <h1 className="display-font mt-3 text-2xl font-semibold text-ink">Work, resources, results, and admit cards</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Publish class work, learning resources, exam results, and admit card records from a single academic desk.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={load} className="flex items-center gap-2 rounded-2xl border border-line/70 bg-white px-4 py-2 text-sm font-medium text-muted hover:bg-slate-50 hover:text-ink">
              <RefreshCcw size={14} />
              Refresh
            </button>
            <button type="button" onClick={() => setModal(activeView)} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-blue-700 px-4 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5">
              <Plus size={14} />
              New
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
          <button className="ml-2 underline" onClick={load}>Retry</button>
        </div>
      )}

      <nav className="flex flex-wrap gap-2" aria-label="Academic management sections">
        {academicViews.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveView(id)}
            className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition ${
              activeView === id
                ? "bg-ink text-white shadow"
                : "border border-line/70 bg-white text-muted hover:bg-slate-50 hover:text-ink"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </nav>

      {activeView === "work" && (
        <RecordGrid emptyLabel="No assigned work created.">
          {work.map((item) => (
            <RecordCard key={item.id} title={item.title} subtitle={`${item.subject} - ${item.section_label ?? ""}`} meta={`Due ${formatDate(item.due_date)}`} status={item.status} onDelete={() => removeRecord("work", item.id)}>
              {item.description && <p className="mt-3 text-sm text-muted">{item.description}</p>}
            </RecordCard>
          ))}
        </RecordGrid>
      )}

      {activeView === "resources" && (
        <RecordGrid emptyLabel="No resources published.">
          {resources.map((item) => (
            <RecordCard key={item.id} title={item.title} subtitle={`${item.subject} - ${item.section_label ?? ""}`} meta={formatDate(item.published_on)} status={item.resource_type.replace("_", " ")} onDelete={() => removeRecord("resources", item.id)}>
              {item.description && <p className="mt-3 text-sm text-muted">{item.description}</p>}
              {item.file_url && (
                <a href={item.file_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-line/70 px-3 py-1.5 text-xs font-medium text-ink hover:bg-slate-50">
                  <ExternalLink size={12} />
                  Open resource
                </a>
              )}
            </RecordCard>
          ))}
        </RecordGrid>
      )}

      {activeView === "results" && (
        <RecordGrid emptyLabel="No result records published.">
          {results.map((item) => (
            <RecordCard key={item.id} title={`${item.exam_name} - ${item.subject}`} subtitle={item.student_name ?? ""} meta={`${item.score} / ${item.max_score}`} status={item.grade || `${item.percentage ?? "0"}%`} onDelete={() => removeRecord("results", item.id)}>
              {item.remarks && <p className="mt-3 text-sm text-muted">{item.remarks}</p>}
            </RecordCard>
          ))}
        </RecordGrid>
      )}

      {activeView === "admit" && (
        <RecordGrid emptyLabel="No admit cards issued.">
          {admitCards.map((item) => (
            <RecordCard key={item.id} title={item.exam_name} subtitle={item.student_name ?? ""} meta={`${formatDate(item.exam_date)} - ${item.roll_number}`} status={item.status} onDelete={() => removeRecord("admit", item.id)}>
              <p className="mt-3 text-sm text-muted">{item.venue}</p>
            </RecordCard>
          ))}
        </RecordGrid>
      )}

      <Modal open={modal === "work"} onClose={() => setModal(null)} title="Assign Work" size="lg">
        <WorkForm sections={sections} onSave={async (data) => {
          await assignedWorkApi.create(data);
          await refreshAfterSave();
        }} onCancel={() => setModal(null)} />
      </Modal>

      <Modal open={modal === "resources"} onClose={() => setModal(null)} title="Publish Resource" size="lg">
        <ResourceForm sections={sections} onSave={async (data) => {
          await learningResourceApi.create(data);
          await refreshAfterSave();
        }} onCancel={() => setModal(null)} />
      </Modal>

      <Modal open={modal === "results"} onClose={() => setModal(null)} title="Record Result" size="lg">
        <ResultForm students={students} onSave={async (data) => {
          await resultRecordApi.create(data);
          await refreshAfterSave();
        }} onCancel={() => setModal(null)} />
      </Modal>

      <Modal open={modal === "admit"} onClose={() => setModal(null)} title="Issue Admit Card" size="lg">
        <AdmitCardForm students={students} onSave={async (data) => {
          await admitCardApi.create(data);
          await refreshAfterSave();
        }} onCancel={() => setModal(null)} />
      </Modal>
    </div>
  );
}

function RecordGrid({ children, emptyLabel }: { children: React.ReactNode; emptyLabel: string }) {
  const count = Array.isArray(children) ? children.length : 1;
  if (!count) {
    return (
      <div className="surface py-14 text-center shadow-soft">
        <p className="text-sm text-muted">{emptyLabel}</p>
      </div>
    );
  }
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function RecordCard({
  title,
  subtitle,
  meta,
  status,
  children,
  onDelete,
}: {
  title: string;
  subtitle: string;
  meta: string;
  status: string;
  children?: React.ReactNode;
  onDelete: () => void;
}) {
  return (
    <article className="surface p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">{title}</h3>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <Badge variant={statusBadge(status)}>{status}</Badge>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-muted">{meta}</p>
      {children}
      <div className="mt-4">
        <button type="button" onClick={onDelete} className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50">
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    </article>
  );
}
