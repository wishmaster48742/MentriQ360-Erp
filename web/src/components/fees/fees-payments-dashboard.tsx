"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Download,
  FileText,
  Filter,
  Mail,
  MessageCircle,
  Plus,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  ApiError,
  feeApi,
  feeStructureApi,
  financeEventApi,
  paymentApi,
  paymentGatewayApi,
  paymentTransactionApi,
  reportApi,
  salaryRecordApi,
  salarySetupApi,
  schoolApi,
  sectionApi,
  staffProfileApi,
  studentApi,
  type ClassSection,
  type DashboardSummary,
  type FeeAssignment,
  type FeeStructure,
  type FinanceEvent,
  type GatewayProvider,
  type Payment,
  type PaymentGatewayConfig,
  type PaymentMethod,
  type PaymentTransaction,
  type SalaryRecord,
  type SalarySetup,
  type School,
  type StaffProfile,
  type Student,
} from "@/lib/api";
import { Badge, statusBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { WorkspacePlaceholder } from "@/components/ui/workspace-placeholder";

type Tab = "dashboard" | "fees" | "payments" | "gateway" | "salaries" | "reports";

const inputCls =
  "w-full rounded-lg border border-line/80 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";
const buttonCls =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-line/70 bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50";
const primaryButtonCls =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60";

function asArray<T>(value: T[] | { results?: T[] }): T[] {
  return Array.isArray(value) ? value : value.results ?? [];
}

function money(value?: string | number | null) {
  const parsed = Number(value ?? 0);
  return `INR ${Number.isFinite(parsed) ? parsed.toLocaleString("en-IN") : "0"}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function FeeStructureForm({
  campusId,
  sections,
  editing,
  onSave,
  onCancel,
}: {
  campusId: number;
  sections: ClassSection[];
  editing?: FeeStructure | null;
  onSave: (data: Parameters<typeof feeStructureApi.create>[0], id?: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    section: editing?.section ? String(editing.section) : "",
    title: editing?.title ?? "",
    description: editing?.description ?? "",
    amount: editing?.amount ?? "",
    late_fee: editing?.late_fee ?? "0.00",
    discount_amount: editing?.discount_amount ?? "0.00",
    due_day: String(editing?.due_day ?? 10),
    is_active: editing?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = event.target instanceof HTMLInputElement && event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(
        {
          campus: campusId,
          section: form.section ? Number(form.section) : null,
          title: form.title,
          description: form.description,
          amount: form.amount,
          late_fee: form.late_fee,
          discount_amount: form.discount_amount,
          due_day: Number(form.due_day),
          is_active: form.is_active,
        },
        editing?.id
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Fee structure save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Class / section">
          <select className={inputCls} value={form.section} onChange={set("section")}>
            <option value="">All sections</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.grade_name} - {section.section_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fee title">
          <input className={inputCls} value={form.title} onChange={set("title")} required />
        </Field>
        <Field label="Amount">
          <input className={inputCls} type="number" min="0.01" step="0.01" value={form.amount} onChange={set("amount")} required />
        </Field>
        <Field label="Due day">
          <input className={inputCls} type="number" min="1" max="31" value={form.due_day} onChange={set("due_day")} required />
        </Field>
        <Field label="Late fee">
          <input className={inputCls} type="number" min="0" step="0.01" value={form.late_fee} onChange={set("late_fee")} />
        </Field>
        <Field label="Discount">
          <input className={inputCls} type="number" min="0" step="0.01" value={form.discount_amount} onChange={set("discount_amount")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description">
            <textarea className={inputCls} rows={3} value={form.description} onChange={set("description")} />
          </Field>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={form.is_active} onChange={set("is_active")} />
        Active fee structure
      </label>
      <div className="flex justify-end gap-2 border-t border-line/60 pt-4">
        <button type="button" className={buttonCls} onClick={onCancel}>
          <ArrowLeft size={14} /> Back
        </button>
        <button type="submit" className={primaryButtonCls} disabled={busy}>
          <Save size={14} /> {editing ? "Update Fee" : "Save"}
        </button>
      </div>
    </form>
  );
}

function FeeAssignmentForm({
  students,
  editing,
  onSave,
  onCancel,
}: {
  students: Student[];
  editing?: FeeAssignment | null;
  onSave: (data: Parameters<typeof feeApi.create>[0], id?: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    student: String(editing?.student ?? students[0]?.id ?? ""),
    title: editing?.title ?? "",
    amount: editing?.amount ?? "",
    discount_amount: editing?.discount_amount ?? "0.00",
    late_fee: editing?.late_fee ?? "0.00",
    due_date: editing?.due_date ?? todayISO(),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(
        {
          student: Number(form.student),
          title: form.title,
          amount: form.amount,
          discount_amount: form.discount_amount,
          late_fee: form.late_fee,
          due_date: form.due_date,
        },
        editing?.id
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Fee save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Student">
            <select className={inputCls} value={form.student} onChange={set("student")} required disabled={!!editing}>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name} ({student.admission_number})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Fee title">
          <input className={inputCls} value={form.title} onChange={set("title")} required />
        </Field>
        <Field label="Due date">
          <input className={inputCls} type="date" value={form.due_date} onChange={set("due_date")} required />
        </Field>
        <Field label="Amount">
          <input className={inputCls} type="number" min="0.01" step="0.01" value={form.amount} onChange={set("amount")} required />
        </Field>
        <Field label="Discount">
          <input className={inputCls} type="number" min="0" step="0.01" value={form.discount_amount} onChange={set("discount_amount")} />
        </Field>
        <Field label="Late fee">
          <input className={inputCls} type="number" min="0" step="0.01" value={form.late_fee} onChange={set("late_fee")} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-line/60 pt-4">
        <button type="button" className={buttonCls} onClick={onCancel}>
          <ArrowLeft size={14} /> Back
        </button>
        <button type="submit" className={primaryButtonCls} disabled={busy}>
          <Save size={14} /> {editing ? "Update" : "Save"}
        </button>
      </div>
    </form>
  );
}

function PaymentForm({
  fee,
  onSave,
  onCancel,
}: {
  fee: FeeAssignment;
  onSave: (data: Parameters<typeof paymentApi.create>[0]) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    amount_paid: fee.outstanding_amount || fee.payable_amount || fee.amount,
    paid_on: todayISO(),
    payment_method: "cash" as PaymentMethod,
    reference_number: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ fee_assignment: fee.id, ...form });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Offline collection failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="rounded-lg border border-line/60 bg-slate-50 px-4 py-3 text-sm">
        <p className="font-semibold text-ink">{fee.student_name}</p>
        <p className="text-muted">{fee.title} | Outstanding {money(fee.outstanding_amount || fee.payable_amount || fee.amount)}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount paid">
          <input className={inputCls} type="number" min="0.01" step="0.01" value={form.amount_paid} onChange={set("amount_paid")} required />
        </Field>
        <Field label="Payment date">
          <input className={inputCls} type="date" value={form.paid_on} onChange={set("paid_on")} required />
        </Field>
        <Field label="Payment mode">
          <select className={inputCls} value={form.payment_method} onChange={set("payment_method")}>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="net_banking">Net banking</option>
            <option value="wallet">Wallet</option>
          </select>
        </Field>
        <Field label="Reference number">
          <input className={inputCls} value={form.reference_number} onChange={set("reference_number")} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-line/60 pt-4">
        <button type="button" className={buttonCls} onClick={onCancel}>
          <ArrowLeft size={14} /> Back
        </button>
        <button type="submit" className={primaryButtonCls} disabled={busy}>
          <Banknote size={14} /> Collect Offline Payment
        </button>
      </div>
    </form>
  );
}

function GatewayForm({
  campusId,
  editing,
  onSave,
  onCancel,
}: {
  campusId: number;
  editing?: PaymentGatewayConfig | null;
  onSave: (data: Parameters<typeof paymentGatewayApi.create>[0], id?: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    provider: editing?.provider ?? ("razorpay" as GatewayProvider),
    key_id: editing?.key_id ?? "",
    key_secret: "",
    webhook_secret: "",
    upi_id: editing?.upi_id ?? "",
    allowed_methods: editing?.allowed_methods?.join(",") || "upi,card,net_banking,wallet",
    is_active: editing?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = event.target instanceof HTMLInputElement && event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(
        {
          campus: campusId,
          provider: form.provider,
          key_id: form.key_id,
          key_secret: form.key_secret,
          webhook_secret: form.webhook_secret,
          upi_id: form.upi_id,
          allowed_methods: form.allowed_methods.split(",").map((item) => item.trim()).filter(Boolean) as PaymentMethod[],
          is_active: form.is_active,
        },
        editing?.id
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gateway save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Gateway">
          <select className={inputCls} value={form.provider} onChange={set("provider")}>
            <option value="razorpay">Razorpay</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="net_banking">Net banking</option>
            <option value="wallet">Wallet</option>
          </select>
        </Field>
        <Field label="Key ID">
          <input className={inputCls} value={form.key_id} onChange={set("key_id")} />
        </Field>
        <Field label="Key secret">
          <input className={inputCls} type="password" value={form.key_secret} onChange={set("key_secret")} placeholder={editing ? "Leave blank to keep existing" : ""} />
        </Field>
        <Field label="Webhook secret">
          <input className={inputCls} type="password" value={form.webhook_secret} onChange={set("webhook_secret")} placeholder={editing ? "Leave blank to keep existing" : ""} />
        </Field>
        <Field label="UPI ID">
          <input className={inputCls} value={form.upi_id} onChange={set("upi_id")} />
        </Field>
        <Field label="Allowed methods">
          <input className={inputCls} value={form.allowed_methods} onChange={set("allowed_methods")} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={form.is_active} onChange={set("is_active")} />
        Active gateway
      </label>
      <div className="flex justify-end gap-2 border-t border-line/60 pt-4">
        <button type="button" className={buttonCls} onClick={onCancel}>
          <ArrowLeft size={14} /> Back
        </button>
        <button type="submit" className={primaryButtonCls} disabled={busy}>
          <ShieldCheck size={14} /> {editing ? "Update" : "Save"}
        </button>
      </div>
    </form>
  );
}

function VerifyPaymentForm({
  transaction,
  onSave,
  onCancel,
}: {
  transaction: PaymentTransaction;
  onSave: (id: number, data: Pick<PaymentTransaction, "gateway_payment_id" | "gateway_signature">) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ gateway_payment_id: transaction.gateway_payment_id || "", gateway_signature: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(transaction.id, form);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Payment verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="rounded-lg border border-line/60 bg-slate-50 px-4 py-3 text-sm">
        <p className="font-semibold text-ink">{transaction.gateway_order_id}</p>
        <p className="text-muted">{money(transaction.amount)} via {transaction.provider}</p>
      </div>
      <Field label="Gateway payment ID">
        <input className={inputCls} value={form.gateway_payment_id} onChange={set("gateway_payment_id")} required />
      </Field>
      <Field label="Gateway signature">
        <input className={inputCls} value={form.gateway_signature} onChange={set("gateway_signature")} required />
      </Field>
      <div className="flex justify-end gap-2 border-t border-line/60 pt-4">
        <button type="button" className={buttonCls} onClick={onCancel}>
          <ArrowLeft size={14} /> Back
        </button>
        <button type="submit" className={primaryButtonCls} disabled={busy}>
          <CheckCircle2 size={14} /> Verify Payment
        </button>
      </div>
    </form>
  );
}

function SalarySetupForm({
  campusId,
  staff,
  editing,
  onSave,
  onCancel,
}: {
  campusId: number;
  staff: StaffProfile[];
  editing?: SalarySetup | null;
  onSave: (data: Parameters<typeof salarySetupApi.create>[0], id?: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    staff_user: String(editing?.staff_user ?? staff[0]?.user ?? ""),
    gross_salary: editing?.gross_salary ?? "",
    default_deductions: editing?.default_deductions ?? "0.00",
    default_bonus: editing?.default_bonus ?? "0.00",
    is_active: editing?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = event.target instanceof HTMLInputElement && event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(
        {
          campus: campusId,
          staff_user: Number(form.staff_user),
          gross_salary: form.gross_salary,
          default_deductions: form.default_deductions,
          default_bonus: form.default_bonus,
          is_active: form.is_active,
        },
        editing?.id
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Salary setup save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Teacher / staff">
            <select className={inputCls} value={form.staff_user} onChange={set("staff_user")} required disabled={!!editing}>
              {staff.map((profile) => (
                <option key={profile.id} value={profile.user}>
                  {profile.user_name} ({profile.employee_code})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Gross salary">
          <input className={inputCls} type="number" min="0.01" step="0.01" value={form.gross_salary} onChange={set("gross_salary")} required />
        </Field>
        <Field label="Default deductions">
          <input className={inputCls} type="number" min="0" step="0.01" value={form.default_deductions} onChange={set("default_deductions")} />
        </Field>
        <Field label="Default bonus">
          <input className={inputCls} type="number" min="0" step="0.01" value={form.default_bonus} onChange={set("default_bonus")} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={form.is_active} onChange={set("is_active")} />
        Active salary setup
      </label>
      <div className="flex justify-end gap-2 border-t border-line/60 pt-4">
        <button type="button" className={buttonCls} onClick={onCancel}>
          <ArrowLeft size={14} /> Back
        </button>
        <button type="submit" className={primaryButtonCls} disabled={busy}>
          <Save size={14} /> {editing ? "Update" : "Save"}
        </button>
      </div>
    </form>
  );
}

export function FeesPaymentsDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [school, setSchool] = useState<School | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [fees, setFees] = useState<FeeAssignment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [gateways, setGateways] = useState<PaymentGatewayConfig[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [salarySetups, setSalarySetups] = useState<SalarySetup[]>([]);
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);
  const [events, setEvents] = useState<FinanceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [feeStructureModal, setFeeStructureModal] = useState<FeeStructure | null | "new">(null);
  const [feeModal, setFeeModal] = useState<FeeAssignment | null | "new">(null);
  const [paymentModal, setPaymentModal] = useState<FeeAssignment | null>(null);
  const [gatewayModal, setGatewayModal] = useState<PaymentGatewayConfig | null | "new">(null);
  const [verifyModal, setVerifyModal] = useState<PaymentTransaction | null>(null);
  const [salarySetupModal, setSalarySetupModal] = useState<SalarySetup | null | "new">(null);
  const [detail, setDetail] = useState<FeeAssignment | Payment | PaymentTransaction | SalaryRecord | null>(null);

  const campusId = school?.schoolId ?? students[0]?.campus ?? staff[0]?.campus ?? 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [profile, summaryData, sectionData, studentData, staffData, structureData, feeData, paymentData, gatewayData, txData, setupData, salaryData, eventData] =
        await Promise.all([
          schoolApi.profile(),
          reportApi.summary(),
          sectionApi.list(),
          studentApi.list(),
          staffProfileApi.list(),
          feeStructureApi.list(),
          feeApi.list(),
          paymentApi.list(),
          paymentGatewayApi.list(),
          paymentTransactionApi.list(),
          salarySetupApi.list(),
          salaryRecordApi.list(),
          financeEventApi.list(),
        ]);
      setSchool(profile);
      setSummary(summaryData);
      setSections(asArray(sectionData));
      setStudents(asArray(studentData));
      setStaff(asArray(staffData));
      setFeeStructures(asArray(structureData));
      setFees(asArray(feeData));
      setPayments(asArray(paymentData));
      setGateways(asArray(gatewayData));
      setTransactions(asArray(txData));
      setSalarySetups(asArray(setupData));
      setSalaryRecords(asArray(salaryData));
      setEvents(asArray(eventData).slice(0, 12));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load account data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const [summaryData, eventData] = await Promise.all([reportApi.summary(), financeEventApi.list()]);
        setSummary(summaryData);
        setEvents(asArray(eventData).slice(0, 12));
      } catch {
        // Keep the current panel stable during transient polling failures.
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleFees = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return fees.filter((fee) => {
      const searchable = `${fee.title} ${fee.student_name ?? ""} ${fee.invoice_number ?? ""}`.toLowerCase();
      return (!needle || searchable.includes(needle)) && (!statusFilter || fee.status === statusFilter);
    });
  }, [fees, search, statusFilter]);

  const pendingFees = fees.filter((fee) => fee.status !== "paid");

  async function saveFeeStructure(data: Parameters<typeof feeStructureApi.create>[0], id?: number) {
    if (id) await feeStructureApi.update(id, data);
    else await feeStructureApi.create(data);
    setFeeStructureModal(null);
    await load();
  }

  async function saveFee(data: Parameters<typeof feeApi.create>[0], id?: number) {
    if (id) await feeApi.update(id, data);
    else await feeApi.create(data);
    setFeeModal(null);
    await load();
  }

  async function saveGateway(data: Parameters<typeof paymentGatewayApi.create>[0], id?: number) {
    if (id) await paymentGatewayApi.update(id, data);
    else await paymentGatewayApi.create(data);
    setGatewayModal(null);
    await load();
  }

  async function saveSalarySetup(data: Parameters<typeof salarySetupApi.create>[0], id?: number) {
    if (id) await salarySetupApi.update(id, data);
    else await salarySetupApi.create(data);
    setSalarySetupModal(null);
    await load();
  }

  async function collectOfflinePayment(data: Parameters<typeof paymentApi.create>[0]) {
    await paymentApi.create(data);
    setPaymentModal(null);
    await load();
  }

  async function exportReport(reportType: string, format: "pdf" | "excel") {
    const blob = await reportApi.financeReport(reportType, format);
    downloadBlob(blob, `${reportType}.${format === "pdf" ? "pdf" : "xls"}`);
  }

  async function exportBlob(action: () => Promise<Blob>, filename: string) {
    const blob = await action();
    downloadBlob(blob, filename);
  }

  if (loading) {
    return <WorkspacePlaceholder title="Account panel" detail="Loading finance, payments, salary, and report data." />;
  }

  const finance = summary?.finance;
  const stats = [
    ["Total fee collection", money(finance?.total_fee_collection ?? summary?.fees.total_collected), `${payments.length} receipts`],
    ["Today collection", money(finance?.today_collection), "Recorded today"],
    ["Monthly collection", money(finance?.monthly_collection), "Current month"],
    ["Pending fees", money(finance?.pending_fees ?? summary?.fees.total_outstanding), `${pendingFees.length} open fees`],
    ["Overdue fees", money(finance?.overdue_fees), "Past due date"],
    ["Failed payments", String(finance?.failed_payments ?? transactions.filter((tx) => tx.status === "failed").length), "Gateway failures"],
    ["Teacher salary payable", money(finance?.teacher_salary_payable), "Attendance based"],
    ["Staff salary payable", money(finance?.staff_salary_payable), "Attendance based"],
  ];

  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "fees", label: "Fees" },
    { id: "payments", label: "Payments" },
    { id: "gateway", label: "Gateway" },
    { id: "salaries", label: "Salaries" },
    { id: "reports", label: "Reports" },
  ];

  return (
    <div className="space-y-5">
      <section className="surface p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="section-kicker">
              <Banknote size={14} />
              Account panel
            </span>
            <h1 className="display-font mt-3 text-2xl font-semibold text-ink">{school?.schoolName ?? "School finance"}</h1>
            <p className="mt-2 text-sm text-muted">Fees, gateway payments, salary, receipts, invoices, and finance reports are scoped to this school.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonCls} onClick={() => window.history.back()}>
              <ArrowLeft size={14} /> Back
            </button>
            <button type="button" className={buttonCls} onClick={load}>
              <RefreshCcw size={14} /> Refresh
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
          <button type="button" className="ml-3 font-semibold underline" onClick={load}>
            Reset
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeTab === tab.id ? "bg-ink text-white" : "border border-line/70 bg-white text-muted hover:bg-slate-50 hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map(([label, value, detailText]) => (
              <div key={label} className="surface p-4 shadow-soft">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
                <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
                <p className="mt-1 text-xs text-muted">{detailText}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="surface overflow-hidden shadow-soft">
              <div className="border-b border-line/60 px-4 py-3">
                <h2 className="font-semibold text-ink">Recent transactions</h2>
              </div>
              <div className="divide-y divide-line/50">
                {(finance?.recent_transactions ?? transactions.slice(0, 8)).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-ink">{"student_name" in tx ? tx.student_name : tx.student_name}</p>
                      <p className="text-xs text-muted">{"gateway_order_id" in tx ? tx.gateway_order_id : ""}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-ink">{money(tx.amount)}</p>
                      <Badge variant={statusBadge(tx.status)}>{tx.status}</Badge>
                    </div>
                  </div>
                ))}
                {(finance?.recent_transactions?.length ?? transactions.length) === 0 && <p className="px-4 py-8 text-center text-sm text-muted">No payment activity yet.</p>}
              </div>
            </div>
            <div className="surface overflow-hidden shadow-soft">
              <div className="border-b border-line/60 px-4 py-3">
                <h2 className="font-semibold text-ink">Live finance events</h2>
              </div>
              <div className="divide-y divide-line/50">
                {events.map((event) => (
                  <div key={event.id} className="px-4 py-3 text-sm">
                    <p className="font-medium text-ink">{event.event_type}</p>
                    <p className="truncate text-xs text-muted">{JSON.stringify(event.payload)}</p>
                  </div>
                ))}
                {events.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">No live finance events yet.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "fees" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              <div className="relative min-w-64 flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input className={`${inputCls} pl-8`} placeholder="Search fees, students, invoices" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <select className={inputCls} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
              <button type="button" className={buttonCls} onClick={() => { setSearch(""); setStatusFilter(""); }}>
                <Filter size={14} /> Reset
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonCls} onClick={() => setFeeStructureModal("new")}>
                <Plus size={14} /> Add Fee Structure
              </button>
              <button type="button" className={primaryButtonCls} onClick={() => setFeeModal("new")}>
                <Plus size={14} /> Assign Fee
              </button>
            </div>
          </div>

          <div className="surface overflow-hidden shadow-soft">
            <div className="border-b border-line/60 px-4 py-3">
              <h2 className="font-semibold text-ink">Fee structures</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted">
                  <tr>{["Title", "Section", "Amount", "Late", "Discount", "Actions"].map((head) => <th key={head} className="px-4 py-3 text-left">{head}</th>)}</tr>
                </thead>
                <tbody>
                  {feeStructures.map((structure) => (
                    <tr key={structure.id} className="border-t border-line/50">
                      <td className="px-4 py-3 font-medium text-ink">{structure.title}</td>
                      <td className="px-4 py-3 text-muted">{structure.section_label}</td>
                      <td className="px-4 py-3">{money(structure.amount)}</td>
                      <td className="px-4 py-3">{money(structure.late_fee)}</td>
                      <td className="px-4 py-3">{money(structure.discount_amount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button className={buttonCls} onClick={() => setFeeStructureModal(structure)} type="button">Edit</button>
                          <button className={buttonCls} onClick={async () => { await feeStructureApi.assign(structure.id, {}); await load(); }} type="button">Assign Fee</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {feeStructures.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No fee structures created.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="surface overflow-hidden shadow-soft">
            <div className="border-b border-line/60 px-4 py-3">
              <h2 className="font-semibold text-ink">Student fee assignments</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted">
                  <tr>{["Student", "Fee", "Payable", "Paid", "Pending", "Due", "Status", "Actions"].map((head) => <th key={head} className="px-4 py-3 text-left">{head}</th>)}</tr>
                </thead>
                <tbody>
                  {visibleFees.map((fee) => (
                    <tr key={fee.id} className="border-t border-line/50 align-top">
                      <td className="px-4 py-3 font-medium text-ink">{fee.student_name}</td>
                      <td className="px-4 py-3">{fee.title}<p className="text-xs text-muted">{fee.invoice_number || "No invoice"}</p></td>
                      <td className="px-4 py-3">{money(fee.payable_amount || fee.amount)}</td>
                      <td className="px-4 py-3">{money(fee.amount_paid)}</td>
                      <td className="px-4 py-3">{money(fee.outstanding_amount)}</td>
                      <td className="px-4 py-3 text-muted">{fee.due_date}</td>
                      <td className="px-4 py-3"><Badge variant={statusBadge(fee.status)}>{fee.status}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button className={buttonCls} onClick={() => setDetail(fee)} type="button">View</button>
                          <button className={buttonCls} onClick={() => setFeeModal(fee)} type="button">Edit Fee</button>
                          <button className={buttonCls} onClick={() => setPaymentModal(fee)} type="button">Collect Offline Payment</button>
                          <button className={buttonCls} onClick={async () => { await feeApi.generateInvoice(fee.id); await load(); }} type="button">Generate Invoice</button>
                          <button className={buttonCls} onClick={() => exportBlob(() => feeApi.downloadInvoice(fee.id), `${fee.invoice_number || "invoice"}.pdf`)} type="button"><Download size={14} /> Download</button>
                          <button className={buttonCls} onClick={async () => { await feeApi.sendReminder(fee.id, { channel: "email" }); await load(); }} type="button"><Mail size={14} /> Send Email</button>
                          <button className={buttonCls} onClick={async () => { await feeApi.sendReminder(fee.id, { channel: "whatsapp" }); await load(); }} type="button"><MessageCircle size={14} /> Send WhatsApp</button>
                          <button className={buttonCls} onClick={async () => { await feeApi.remove(fee.id); await load(); }} type="button"><Trash2 size={14} /> Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visibleFees.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">No fee assignments found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "payments" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="surface overflow-hidden shadow-soft">
            <div className="border-b border-line/60 px-4 py-3">
              <h2 className="font-semibold text-ink">Receipts and offline payments</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted">
                  <tr>{["Student", "Fee", "Amount", "Mode", "Receipt", "Actions"].map((head) => <th key={head} className="px-4 py-3 text-left">{head}</th>)}</tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-line/50">
                      <td className="px-4 py-3 font-medium text-ink">{payment.student_name}</td>
                      <td className="px-4 py-3">{payment.fee_title}</td>
                      <td className="px-4 py-3">{money(payment.amount_paid)}</td>
                      <td className="px-4 py-3"><Badge variant="info">{payment.payment_method}</Badge></td>
                      <td className="px-4 py-3 font-mono text-xs">{payment.receipt_number || payment.reference_number || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button className={buttonCls} onClick={() => setDetail(payment)} type="button">View</button>
                          <button className={buttonCls} onClick={() => exportBlob(() => paymentApi.downloadReceipt(payment.id), `${payment.receipt_number || "receipt"}.pdf`)} type="button">
                            <Download size={14} /> Download Receipt
                          </button>
                          <button className={buttonCls} onClick={async () => { await paymentApi.sendReceipt(payment.id, { channel: "email" }); await load(); }} type="button"><Mail size={14} /> Send Email</button>
                          <button className={buttonCls} onClick={async () => { await paymentApi.sendReceipt(payment.id, { channel: "whatsapp" }); await load(); }} type="button"><MessageCircle size={14} /> Send WhatsApp</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No receipts generated.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="surface overflow-hidden shadow-soft">
            <div className="border-b border-line/60 px-4 py-3">
              <h2 className="font-semibold text-ink">Online transactions</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted">
                  <tr>{["Student", "Order", "Amount", "Status", "Actions"].map((head) => <th key={head} className="px-4 py-3 text-left">{head}</th>)}</tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-t border-line/50">
                      <td className="px-4 py-3 font-medium text-ink">{tx.student_name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{tx.gateway_order_id}</td>
                      <td className="px-4 py-3">{money(tx.amount)}</td>
                      <td className="px-4 py-3"><Badge variant={statusBadge(tx.status)}>{tx.status}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button className={buttonCls} onClick={() => setDetail(tx)} type="button">View</button>
                          {tx.status !== "success" && <button className={buttonCls} onClick={() => setVerifyModal(tx)} type="button">Verify Payment</button>}
                          {tx.payment && <button className={buttonCls} onClick={() => exportBlob(() => paymentTransactionApi.downloadReceipt(tx.id), `${tx.receipt_number || "receipt"}.pdf`)} type="button"><Download size={14} /> Generate Receipt</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No online transactions.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "gateway" && (
        <div className="surface overflow-hidden shadow-soft">
          <div className="flex items-center justify-between border-b border-line/60 px-4 py-3">
            <h2 className="font-semibold text-ink">School-wise payment gateway</h2>
            <button type="button" className={primaryButtonCls} onClick={() => setGatewayModal("new")}>
              <Plus size={14} /> Add Gateway
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted">
                <tr>{["Provider", "Key", "UPI", "Methods", "Status", "Actions"].map((head) => <th key={head} className="px-4 py-3 text-left">{head}</th>)}</tr>
              </thead>
              <tbody>
                {gateways.map((gateway) => (
                  <tr key={gateway.id} className="border-t border-line/50">
                    <td className="px-4 py-3 font-medium text-ink">{gateway.provider}</td>
                    <td className="px-4 py-3 font-mono text-xs">{gateway.masked_key_id || gateway.key_id || "-"}</td>
                    <td className="px-4 py-3">{gateway.upi_id || "-"}</td>
                    <td className="px-4 py-3">{gateway.allowed_methods.join(", ")}</td>
                    <td className="px-4 py-3"><Badge variant={gateway.is_active ? "success" : "neutral"}>{gateway.is_active ? "active" : "inactive"}</Badge></td>
                    <td className="px-4 py-3"><button className={buttonCls} onClick={() => setGatewayModal(gateway)} type="button">Edit</button></td>
                  </tr>
                ))}
                {gateways.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No payment gateway configured.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "salaries" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button type="button" className={primaryButtonCls} onClick={() => setSalarySetupModal("new")}>
              <Plus size={14} /> Add Salary Setup
            </button>
          </div>
          <div className="surface overflow-hidden shadow-soft">
            <div className="border-b border-line/60 px-4 py-3">
              <h2 className="font-semibold text-ink">Salary setup</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted">
                  <tr>{["Staff", "Gross", "Deductions", "Bonus", "Actions"].map((head) => <th key={head} className="px-4 py-3 text-left">{head}</th>)}</tr>
                </thead>
                <tbody>
                  {salarySetups.map((setup) => (
                    <tr key={setup.id} className="border-t border-line/50">
                      <td className="px-4 py-3 font-medium text-ink">{setup.staff_name}</td>
                      <td className="px-4 py-3">{money(setup.gross_salary)}</td>
                      <td className="px-4 py-3">{money(setup.default_deductions)}</td>
                      <td className="px-4 py-3">{money(setup.default_bonus)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button className={buttonCls} onClick={() => setSalarySetupModal(setup)} type="button">Edit</button>
                          <button className={buttonCls} onClick={async () => { await salaryRecordApi.calculate({ salary_setup: setup.id }); await load(); }} type="button">Calculate Salary</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {salarySetups.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No salary setup records.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="surface overflow-hidden shadow-soft">
            <div className="border-b border-line/60 px-4 py-3">
              <h2 className="font-semibold text-ink">Salary records</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted">
                  <tr>{["Staff", "Month", "Present", "Absent", "Final", "Status", "Actions"].map((head) => <th key={head} className="px-4 py-3 text-left">{head}</th>)}</tr>
                </thead>
                <tbody>
                  {salaryRecords.map((salary) => (
                    <tr key={salary.id} className="border-t border-line/50 align-top">
                      <td className="px-4 py-3 font-medium text-ink">{salary.staff_name}</td>
                      <td className="px-4 py-3">{salary.month}/{salary.year}</td>
                      <td className="px-4 py-3">{salary.present_days}</td>
                      <td className="px-4 py-3">{salary.absent_days}</td>
                      <td className="px-4 py-3">{money(salary.final_salary)}</td>
                      <td className="px-4 py-3"><Badge variant={statusBadge(salary.payment_status)}>{salary.payment_status}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button className={buttonCls} onClick={() => setDetail(salary)} type="button">View</button>
                          {salary.payment_status !== "paid" && <button className={buttonCls} onClick={async () => { await salaryRecordApi.markPaid(salary.id, { paid_on: todayISO() }); await load(); }} type="button">Mark Salary Paid</button>}
                          <button className={buttonCls} onClick={() => exportBlob(() => salaryRecordApi.downloadSalarySlip(salary.id), `${salary.slip_number || "salary-slip"}.pdf`)} type="button"><Download size={14} /> Download Salary Slip</button>
                          <button className={buttonCls} onClick={async () => { await salaryRecordApi.sendSlip(salary.id, { channel: "email" }); await load(); }} type="button"><Mail size={14} /> Send Email</button>
                          <button className={buttonCls} onClick={async () => { await salaryRecordApi.sendSlip(salary.id, { channel: "whatsapp" }); await load(); }} type="button"><MessageCircle size={14} /> Send WhatsApp</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {salaryRecords.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No salary records calculated.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "reports" && (
        <div className="surface p-4 shadow-soft">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["fee-collection", "Fee collection report"],
              ["pending-fees", "Pending fee report"],
              ["overdue-fees", "Overdue fee report"],
              ["student-payments", "Student payment report"],
              ["online-transactions", "Online transaction report"],
              ["offline-payments", "Offline payment report"],
              ["salary-report", "Salary report"],
              ["monthly-finance", "Monthly finance report"],
            ].map(([id, label]) => (
              <div key={id} className="rounded-lg border border-line/70 p-3">
                <p className="font-medium text-ink">{label}</p>
                <div className="mt-3 flex gap-2">
                  <button className={buttonCls} type="button" onClick={() => exportReport(id, "pdf")}><FileText size={14} /> Export PDF</button>
                  <button className={buttonCls} type="button" onClick={() => exportReport(id, "excel")}><Download size={14} /> Export Excel</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={feeStructureModal !== null} onClose={() => setFeeStructureModal(null)} title={feeStructureModal === "new" ? "Add Fee Structure" : "Edit Fee Structure"} size="lg">
        <FeeStructureForm
          campusId={campusId}
          sections={sections}
          editing={feeStructureModal && feeStructureModal !== "new" ? feeStructureModal : null}
          onSave={saveFeeStructure}
          onCancel={() => setFeeStructureModal(null)}
        />
      </Modal>

      <Modal open={feeModal !== null} onClose={() => setFeeModal(null)} title={feeModal === "new" ? "Assign Fee" : "Edit Fee"} size="lg">
        <FeeAssignmentForm
          students={students}
          editing={feeModal && feeModal !== "new" ? feeModal : null}
          onSave={saveFee}
          onCancel={() => setFeeModal(null)}
        />
      </Modal>

      {paymentModal && (
        <Modal open onClose={() => setPaymentModal(null)} title="Collect Offline Payment" size="lg">
          <PaymentForm fee={paymentModal} onSave={collectOfflinePayment} onCancel={() => setPaymentModal(null)} />
        </Modal>
      )}

      <Modal open={gatewayModal !== null} onClose={() => setGatewayModal(null)} title={gatewayModal === "new" ? "Add Gateway" : "Edit Gateway"} size="lg">
        <GatewayForm
          campusId={campusId}
          editing={gatewayModal && gatewayModal !== "new" ? gatewayModal : null}
          onSave={saveGateway}
          onCancel={() => setGatewayModal(null)}
        />
      </Modal>

      {verifyModal && (
        <Modal open onClose={() => setVerifyModal(null)} title="Verify Payment" size="lg">
          <VerifyPaymentForm
            transaction={verifyModal}
            onSave={async (id, data) => {
              await paymentTransactionApi.verifyPayment(id, data);
              setVerifyModal(null);
              await load();
            }}
            onCancel={() => setVerifyModal(null)}
          />
        </Modal>
      )}

      <Modal open={salarySetupModal !== null} onClose={() => setSalarySetupModal(null)} title={salarySetupModal === "new" ? "Add Salary Setup" : "Edit Salary Setup"} size="lg">
        <SalarySetupForm
          campusId={campusId}
          staff={staff}
          editing={salarySetupModal && salarySetupModal !== "new" ? salarySetupModal : null}
          onSave={saveSalarySetup}
          onCancel={() => setSalarySetupModal(null)}
        />
      </Modal>

      {detail && (
        <Modal open onClose={() => setDetail(null)} title="View Details" size="lg">
          <pre className="max-h-[60vh] overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(detail, null, 2)}</pre>
        </Modal>
      )}
    </div>
  );
}
