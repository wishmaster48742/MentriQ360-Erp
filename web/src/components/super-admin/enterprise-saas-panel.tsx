"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  CreditCard,
  DatabaseBackup,
  FileText,
  KeyRound,
  PackageCheck,
  RefreshCcw,
  Save,
  School,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import { Badge, statusBadge, statusLabel } from "@/components/ui/badge";
import { WorkspacePlaceholder } from "@/components/ui/workspace-placeholder";
import {
  ApiError,
  enterpriseApi,
  schoolApi,
  type BackupJob,
  type BackupPolicy,
  type BillingCycle,
  type DocumentAccessLog,
  type EnterpriseAnalytics,
  type EnterpriseMonitoring,
  type EnterprisePaymentStatus,
  type QueueJob,
  type SaaSPlan,
  type School as SchoolRecord,
  type SchoolEnterpriseAnalytics,
  type SchoolSubscription,
  type SecureApiToken,
  type SubscriptionInvoice,
  type SubscriptionPayment,
  type SystemHealthSnapshot,
  type UserActivityLog,
  type WhiteLabelConfig,
} from "@/lib/api";

type PanelTab = "plans" | "subscriptions" | "billing" | "white-label" | "analytics" | "compliance" | "recovery" | "monitoring";

type PlanForm = Partial<SaaSPlan> & { id?: number };
type SubscriptionForm = {
  id?: number;
  campus: number;
  plan: number;
  status: SchoolSubscription["status"];
  billing_cycle: BillingCycle;
  start_date: string;
  end_date: string;
  grace_period_days: number;
  custom_price: string;
  currency: string;
  gst_number: string;
  auto_disable_on_expiry: boolean;
};
type PaymentForm = {
  invoice: number;
  amount: string;
  payment_mode: string;
  provider: string;
  transaction_id: string;
  payment_status: EnterprisePaymentStatus;
};
type WhiteLabelForm = Omit<WhiteLabelConfig, "id" | "campus_name" | "plan_code" | "created_by" | "created_at" | "updated_at"> & { id?: number };
type BackupPolicyForm = Omit<BackupPolicy, "id" | "campus_name" | "created_by" | "created_at" | "updated_at">;
type SecureTokenForm = {
  campus: number | null;
  name: string;
  scopes: string;
  expires_at: string;
  is_active: boolean;
};

const inputCls =
  "w-full rounded-lg border border-line/80 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

const moduleKeys = [
  "academics",
  "finance",
  "teacherPortal",
  "studentPortal",
  "communication",
  "ai",
  "hardwareAttendance",
  "whiteLabel",
  "advancedAnalytics",
];

const tabs: { id: PanelTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "plans", label: "Plans", icon: PackageCheck },
  { id: "subscriptions", label: "Subscriptions", icon: School },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "white-label", label: "White Label", icon: Sparkles },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "compliance", label: "Compliance", icon: ShieldCheck },
  { id: "recovery", label: "Recovery", icon: DatabaseBackup },
  { id: "monitoring", label: "Monitoring", icon: Activity },
];

function asArray<T>(value: T[] | { results?: T[] }): T[] {
  return Array.isArray(value) ? value : value.results ?? [];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function money(value?: string | number | null) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("en-IN") : "Not set";
}

function limitLabel(value: number, suffix = "") {
  return value ? `${value.toLocaleString("en-IN")}${suffix}` : "Unlimited";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function defaultSubscriptionForm(campus = 0, plan = 0): SubscriptionForm {
  return {
    campus,
    plan,
    status: "active",
    billing_cycle: "monthly",
    start_date: todayIso(),
    end_date: addDaysIso(30),
    grace_period_days: 7,
    custom_price: "",
    currency: "INR",
    gst_number: "",
    auto_disable_on_expiry: true,
  };
}

function defaultWhiteLabelForm(campus = 0): WhiteLabelForm {
  return {
    campus,
    is_enabled: false,
    custom_logo_url: "",
    custom_domain: "",
    primary_color: "#2857d8",
    secondary_color: "#111827",
    accent_color: "#ff7a00",
    login_heading: "",
    login_subheading: "",
    login_background_url: "",
    email_template_header: "",
    email_template_footer: "",
    report_logo_url: "",
    report_footer: "",
  };
}

function defaultBackupPolicyForm(campus: number | null = null): BackupPolicyForm {
  return {
    campus,
    backup_type: "school_data",
    frequency: "daily",
    retention_days: 30,
    destination: "",
    encryption_required: true,
    is_active: true,
  };
}

function StatTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
          <Icon size={18} />
        </span>
      </div>
      {detail && <p className="mt-2 text-xs leading-5 text-muted">{detail}</p>}
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-lg border border-dashed border-line/80 bg-slate-50 px-4 py-8 text-center text-sm text-muted">{label}</div>;
}

function SectionHeader({
  kicker,
  title,
  detail,
}: {
  kicker: string;
  title: string;
  detail: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{kicker}</p>
      <h2 className="mt-1 text-xl font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted">{detail}</p>
    </div>
  );
}

function SchoolSelect({
  schools,
  value,
  onChange,
  includePlatform = false,
}: {
  schools: SchoolRecord[];
  value: number | null;
  onChange: (value: number | null) => void;
  includePlatform?: boolean;
}) {
  return (
    <select className={inputCls} value={value ?? ""} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}>
      {includePlatform && <option value="">Platform scope</option>}
      {!includePlatform && <option value="">Select school</option>}
      {schools.map((school) => (
        <option key={school.schoolId} value={school.schoolId}>
          {school.schoolName} ({school.schoolCode})
        </option>
      ))}
    </select>
  );
}

export function EnterpriseSaasPanel() {
  const [activeTab, setActiveTab] = useState<PanelTab>("plans");
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [plans, setPlans] = useState<SaaSPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<SchoolSubscription[]>([]);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [whiteLabels, setWhiteLabels] = useState<WhiteLabelConfig[]>([]);
  const [activityLogs, setActivityLogs] = useState<UserActivityLog[]>([]);
  const [documentLogs, setDocumentLogs] = useState<DocumentAccessLog[]>([]);
  const [backupPolicies, setBackupPolicies] = useState<BackupPolicy[]>([]);
  const [backupJobs, setBackupJobs] = useState<BackupJob[]>([]);
  const [queueJobs, setQueueJobs] = useState<QueueJob[]>([]);
  const [health, setHealth] = useState<SystemHealthSnapshot[]>([]);
  const [tokens, setTokens] = useState<SecureApiToken[]>([]);
  const [analytics, setAnalytics] = useState<EnterpriseAnalytics | null>(null);
  const [schoolAnalytics, setSchoolAnalytics] = useState<SchoolEnterpriseAnalytics | null>(null);
  const [monitoring, setMonitoring] = useState<EnterpriseMonitoring | null>(null);
  const [selectedCampus, setSelectedCampus] = useState<number | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm>({});
  const [subscriptionForm, setSubscriptionForm] = useState<SubscriptionForm>(() => defaultSubscriptionForm());
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    invoice: 0,
    amount: "",
    payment_mode: "online",
    provider: "razorpay",
    transaction_id: "",
    payment_status: "success",
  });
  const [whiteLabelForm, setWhiteLabelForm] = useState<WhiteLabelForm>(() => defaultWhiteLabelForm());
  const [backupPolicyForm, setBackupPolicyForm] = useState<BackupPolicyForm>(() => defaultBackupPolicyForm());
  const [tokenForm, setTokenForm] = useState<SecureTokenForm>({
    campus: null,
    name: "",
    scopes: "analytics.read,subscription.read",
    expires_at: "",
    is_active: true,
  });
  const [createdToken, setCreatedToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === selectedPlanId) ?? plans[0] ?? null, [plans, selectedPlanId]);
  const selectedSchool = useMemo(() => schools.find((school) => school.schoolId === selectedCampus) ?? null, [schools, selectedCampus]);
  const openInvoices = useMemo(() => invoices.filter((invoice) => invoice.status !== "paid" && Number(invoice.outstanding_amount) > 0), [invoices]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [
        schoolResult,
        planResult,
        subscriptionResult,
        invoiceResult,
        paymentResult,
        whiteLabelResult,
        activityResult,
        documentResult,
        backupPolicyResult,
        backupJobResult,
        queueJobResult,
        healthResult,
        tokenResult,
        analyticsResult,
        monitoringResult,
      ] = await Promise.all([
        schoolApi.list(),
        enterpriseApi.plans.list(),
        enterpriseApi.subscriptions.list(),
        enterpriseApi.invoices.list(),
        enterpriseApi.payments.list(),
        enterpriseApi.whiteLabel.list(),
        enterpriseApi.activityLogs.list(),
        enterpriseApi.documentAccessLogs.list(),
        enterpriseApi.backupPolicies.list(),
        enterpriseApi.backupJobs.list(),
        enterpriseApi.queueJobs.list(),
        enterpriseApi.healthSnapshots.list(),
        enterpriseApi.secureTokens.list(),
        enterpriseApi.analytics(),
        enterpriseApi.monitoring(),
      ]);

      const loadedSchools = asArray(schoolResult);
      const loadedPlans = asArray(planResult);
      const loadedSubscriptions = asArray(subscriptionResult);
      const loadedInvoices = asArray(invoiceResult);
      setSchools(loadedSchools);
      setPlans(loadedPlans);
      setSubscriptions(loadedSubscriptions);
      setInvoices(loadedInvoices);
      setPayments(asArray(paymentResult));
      setWhiteLabels(asArray(whiteLabelResult));
      setActivityLogs(asArray(activityResult));
      setDocumentLogs(asArray(documentResult));
      setBackupPolicies(asArray(backupPolicyResult));
      setBackupJobs(asArray(backupJobResult));
      setQueueJobs(asArray(queueJobResult));
      setHealth(asArray(healthResult));
      setTokens(asArray(tokenResult));
      setAnalytics(analyticsResult);
      setMonitoring(monitoringResult);

      const nextCampus = selectedCampus ?? loadedSchools[0]?.schoolId ?? null;
      const nextPlan = selectedPlanId ?? loadedPlans[0]?.id ?? null;
      if (nextCampus !== selectedCampus) setSelectedCampus(nextCampus);
      if (nextPlan !== selectedPlanId) setSelectedPlanId(nextPlan);
      if (!subscriptionForm.campus && nextCampus && nextPlan) setSubscriptionForm(defaultSubscriptionForm(nextCampus, nextPlan));
      if (!paymentForm.invoice && loadedInvoices[0]) setPaymentForm((current) => ({ ...current, invoice: loadedInvoices[0].id, amount: loadedInvoices[0].outstanding_amount }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Enterprise data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [paymentForm.invoice, selectedCampus, selectedPlanId, subscriptionForm.campus]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (selectedPlan) setPlanForm({ ...selectedPlan });
  }, [selectedPlan]);

  useEffect(() => {
    if (!selectedCampus) return;
    setSubscriptionForm((current) => ({ ...current, campus: current.campus || selectedCampus, plan: current.plan || selectedPlan?.id || 0 }));
    const config = whiteLabels.find((item) => item.campus === selectedCampus);
    setWhiteLabelForm(config ? { ...config } : defaultWhiteLabelForm(selectedCampus));
    setBackupPolicyForm((current) => ({ ...current, campus: current.campus ?? selectedCampus }));
    setTokenForm((current) => ({ ...current, campus: current.campus ?? selectedCampus }));
  }, [selectedCampus, selectedPlan?.id, whiteLabels]);

  async function runAction(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  async function loadSchoolAnalytics(campus = selectedCampus) {
    if (!campus) return;
    await runAction(async () => {
      const result = await enterpriseApi.schoolAnalytics(campus);
      setSchoolAnalytics(result);
    }, "School analytics could not be loaded.");
  }

  async function savePlan() {
    if (!planForm.id) return;
    await runAction(async () => {
      await enterpriseApi.plans.update(planForm.id as number, planForm);
    }, "Plan could not be saved.");
  }

  async function seedPlans() {
    await runAction(async () => {
      await enterpriseApi.plans.seedDefaults();
    }, "Default plans could not be seeded.");
  }

  async function saveSubscription() {
    if (!subscriptionForm.campus || !subscriptionForm.plan) return;
    const payload = {
      ...subscriptionForm,
      custom_price: subscriptionForm.custom_price ? subscriptionForm.custom_price : null,
    };
    await runAction(async () => {
      if (subscriptionForm.id) await enterpriseApi.subscriptions.update(subscriptionForm.id, payload);
      else await enterpriseApi.subscriptions.create(payload);
    }, "Subscription could not be saved.");
  }

  async function editSubscription(subscription: SchoolSubscription) {
    setSubscriptionForm({
      id: subscription.id,
      campus: subscription.campus,
      plan: subscription.plan,
      status: subscription.status,
      billing_cycle: subscription.billing_cycle,
      start_date: subscription.start_date,
      end_date: subscription.end_date,
      grace_period_days: subscription.grace_period_days,
      custom_price: subscription.custom_price ?? "",
      currency: subscription.currency,
      gst_number: subscription.gst_number,
      auto_disable_on_expiry: subscription.auto_disable_on_expiry,
    });
    setActiveTab("subscriptions");
  }

  async function generateInvoice(subscription: SchoolSubscription) {
    await runAction(async () => {
      await enterpriseApi.subscriptions.generateInvoice(subscription.id);
    }, "Invoice could not be generated.");
  }

  async function recordPayment() {
    if (!paymentForm.invoice || !paymentForm.amount) return;
    await runAction(async () => {
      await enterpriseApi.payments.create({
        ...paymentForm,
        raw_payload: { source: "super_admin_enterprise_panel" },
        paid_at: new Date().toISOString(),
      });
    }, "Subscription payment could not be recorded.");
  }

  async function downloadInvoice(invoice: SubscriptionInvoice) {
    await runAction(async () => {
      const blob = await enterpriseApi.invoices.downloadPdf(invoice.id);
      downloadBlob(blob, `${invoice.invoice_number}.pdf`);
    }, "Invoice PDF could not be downloaded.");
  }

  async function saveWhiteLabel() {
    if (!whiteLabelForm.campus) return;
    await runAction(async () => {
      if (whiteLabelForm.id) await enterpriseApi.whiteLabel.update(whiteLabelForm.id, whiteLabelForm);
      else await enterpriseApi.whiteLabel.create(whiteLabelForm);
    }, "White-label settings could not be saved.");
  }

  async function saveBackupPolicy() {
    await runAction(async () => {
      await enterpriseApi.backupPolicies.create(backupPolicyForm);
    }, "Backup policy could not be created.");
  }

  async function createBackupJob(policy: BackupPolicy) {
    await runAction(async () => {
      await enterpriseApi.backupJobs.create({
        policy: policy.id,
        campus: policy.campus,
        backup_type: policy.backup_type,
        status: "queued",
        started_at: null,
        completed_at: null,
        storage_location: "",
        size_bytes: 0,
        checksum: "",
        error_message: "",
        metadata: { source: "manual_enterprise_panel" },
      });
    }, "Backup job could not be queued.");
  }

  async function createSecureToken() {
    if (!tokenForm.name.trim()) return;
    await runAction(async () => {
      const token = await enterpriseApi.secureTokens.create({
        campus: tokenForm.campus,
        name: tokenForm.name,
        scopes: tokenForm.scopes.split(",").map((scope) => scope.trim()).filter(Boolean),
        expires_at: tokenForm.expires_at || null,
        is_active: tokenForm.is_active,
      });
      setCreatedToken(token.rawToken ?? "");
    }, "Secure API token could not be created.");
  }

  if (loading) {
    return <WorkspacePlaceholder title="Enterprise SaaS" detail="Loading plans, billing, analytics, compliance logs, and monitoring." />;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-line/70 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeader
            kicker="Enterprise SaaS"
            title="Subscription, compliance, and scalability center"
            detail="Manage commercial plans, school subscriptions, white-label controls, audit evidence, backup operations, secure API tokens, and platform monitoring."
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadAll()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-line/70 px-3 py-2 text-sm font-semibold text-ink hover:bg-slate-50 disabled:opacity-60">
              <RefreshCcw size={14} />
              Refresh
            </button>
            <button type="button" onClick={() => void enterpriseApi.subscriptions.enforceExpiry().then(loadAll)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              <ShieldCheck size={14} />
              Enforce expiry
            </button>
          </div>
        </div>
      </section>

      <ErrorNote message={error} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="MRR" value={money(analytics?.mrr)} detail="Subscription monthly run rate" icon={CreditCard} />
        <StatTile label="ARR" value={money(analytics?.arr)} detail="Annualized subscription revenue" icon={BarChart3} />
        <StatTile label="Active schools" value={analytics?.activeSchools ?? 0} detail={`${analytics?.totalSchools ?? 0} total schools`} icon={Building2} />
        <StatTile label="Churn" value={`${analytics?.churnRate ?? "0.00"}%`} detail="Expired or cancelled this month" icon={SlidersHorizontal} />
        <StatTile label="Alerts" value={(monitoring?.alerts.criticalHealth ?? 0) + (monitoring?.alerts.failedBackups ?? 0) + (monitoring?.alerts.failedQueueJobs ?? 0)} detail="Critical health, failed backup, failed queue" icon={Activity} />
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-lg border border-line/70 bg-white p-2 shadow-sm" aria-label="Enterprise panel sections">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
              activeTab === id ? "bg-ink text-white" : "text-ink hover:bg-slate-50"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "plans" && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(24rem,0.9fr)]">
          <div className="rounded-lg border border-line/70 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader kicker="Plans" title="Plan catalog" detail="Basic, Standard, Premium, and Enterprise limits drive module access, capacity, and AI/communication usage." />
              <button type="button" onClick={() => void seedPlans()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-line/70 px-3 py-2 text-sm font-semibold text-ink hover:bg-slate-50 disabled:opacity-60">
                <PackageCheck size={14} />
                Seed defaults
              </button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`rounded-lg border p-4 text-left transition ${selectedPlanId === plan.id ? "border-ink bg-slate-50" : "border-line/70 bg-white hover:bg-slate-50"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-ink">{plan.name}</h3>
                      <p className="mt-1 text-sm text-muted">{money(plan.monthly_price)} monthly</p>
                    </div>
                    <Badge variant={plan.is_active ? "success" : "neutral"}>{plan.is_active ? "active" : "inactive"}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted">
                    <span>Students: {limitLabel(plan.student_limit)}</span>
                    <span>Teachers: {limitLabel(plan.teacher_limit)}</span>
                    <span>Storage: {limitLabel(plan.storage_limit_mb, " MB")}</span>
                    <span>AI: {limitLabel(plan.ai_monthly_limit)}</span>
                    <span>WhatsApp: {limitLabel(plan.whatsapp_monthly_limit)}</span>
                    <span>SMS: {limitLabel(plan.sms_monthly_limit)}</span>
                  </div>
                </button>
              ))}
              {!plans.length && <EmptyState label="No SaaS plans found. Use Seed defaults to create the commercial plan catalog." />}
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void savePlan();
            }}
            className="rounded-lg border border-line/70 bg-white p-5 shadow-sm"
          >
            <SectionHeader kicker="Plan editor" title={planForm.name || "Select a plan"} detail="Adjust pricing, limits, module gates, and custom pricing availability." />
            {planForm.id ? (
              <div className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-ink">Monthly price<input className={`mt-1 ${inputCls}`} value={planForm.monthly_price ?? ""} onChange={(event) => setPlanForm((current) => ({ ...current, monthly_price: event.target.value }))} /></label>
                  <label className="block text-sm font-semibold text-ink">Annual price<input className={`mt-1 ${inputCls}`} value={planForm.annual_price ?? ""} onChange={(event) => setPlanForm((current) => ({ ...current, annual_price: event.target.value }))} /></label>
                  <label className="block text-sm font-semibold text-ink">Student limit<input type="number" className={`mt-1 ${inputCls}`} value={planForm.student_limit ?? 0} onChange={(event) => setPlanForm((current) => ({ ...current, student_limit: Number(event.target.value) }))} /></label>
                  <label className="block text-sm font-semibold text-ink">Teacher limit<input type="number" className={`mt-1 ${inputCls}`} value={planForm.teacher_limit ?? 0} onChange={(event) => setPlanForm((current) => ({ ...current, teacher_limit: Number(event.target.value) }))} /></label>
                  <label className="block text-sm font-semibold text-ink">Storage MB<input type="number" className={`mt-1 ${inputCls}`} value={planForm.storage_limit_mb ?? 0} onChange={(event) => setPlanForm((current) => ({ ...current, storage_limit_mb: Number(event.target.value) }))} /></label>
                  <label className="block text-sm font-semibold text-ink">AI monthly<input type="number" className={`mt-1 ${inputCls}`} value={planForm.ai_monthly_limit ?? 0} onChange={(event) => setPlanForm((current) => ({ ...current, ai_monthly_limit: Number(event.target.value) }))} /></label>
                  <label className="block text-sm font-semibold text-ink">WhatsApp monthly<input type="number" className={`mt-1 ${inputCls}`} value={planForm.whatsapp_monthly_limit ?? 0} onChange={(event) => setPlanForm((current) => ({ ...current, whatsapp_monthly_limit: Number(event.target.value) }))} /></label>
                  <label className="block text-sm font-semibold text-ink">SMS monthly<input type="number" className={`mt-1 ${inputCls}`} value={planForm.sms_monthly_limit ?? 0} onChange={(event) => setPlanForm((current) => ({ ...current, sms_monthly_limit: Number(event.target.value) }))} /></label>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {moduleKeys.map((key) => (
                    <label key={key} className="flex items-center gap-2 rounded-lg border border-line/70 px-3 py-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={!!planForm.modules?.[key]}
                        onChange={(event) =>
                          setPlanForm((current) => ({ ...current, modules: { ...(current.modules ?? {}), [key]: event.target.checked } }))
                        }
                      />
                      {key}
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={!!planForm.custom_pricing_enabled} onChange={(event) => setPlanForm((current) => ({ ...current, custom_pricing_enabled: event.target.checked }))} />Custom pricing</label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={!!planForm.is_active} onChange={(event) => setPlanForm((current) => ({ ...current, is_active: event.target.checked }))} />Active</label>
                </div>
                <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  <Save size={14} />
                  Save plan
                </button>
              </div>
            ) : (
              <EmptyState label="Select a plan to edit commercial limits." />
            )}
          </form>
        </section>
      )}

      {activeTab === "subscriptions" && (
        <section className="grid gap-5 xl:grid-cols-[minmax(24rem,0.85fr)_minmax(0,1.15fr)]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveSubscription();
            }}
            className="rounded-lg border border-line/70 bg-white p-5 shadow-sm"
          >
            <SectionHeader kicker="School subscription" title={subscriptionForm.id ? "Edit subscription" : "Assign plan"} detail="Bind each school to a plan, billing cycle, GST number, and expiry policy." />
            <div className="mt-5 grid gap-4">
              <label className="block text-sm font-semibold text-ink">School<SchoolSelect schools={schools} value={subscriptionForm.campus || null} onChange={(value) => setSubscriptionForm((current) => ({ ...current, campus: value ?? 0 }))} /></label>
              <label className="block text-sm font-semibold text-ink">Plan<select className={`mt-1 ${inputCls}`} value={subscriptionForm.plan || ""} onChange={(event) => setSubscriptionForm((current) => ({ ...current, plan: Number(event.target.value) }))}><option value="">Select plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-ink">Status<select className={`mt-1 ${inputCls}`} value={subscriptionForm.status} onChange={(event) => setSubscriptionForm((current) => ({ ...current, status: event.target.value as SchoolSubscription["status"] }))}><option value="trial">Trial</option><option value="active">Active</option><option value="grace">Grace</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select></label>
                <label className="block text-sm font-semibold text-ink">Billing<select className={`mt-1 ${inputCls}`} value={subscriptionForm.billing_cycle} onChange={(event) => setSubscriptionForm((current) => ({ ...current, billing_cycle: event.target.value as BillingCycle }))}><option value="monthly">Monthly</option><option value="annual">Annual</option><option value="custom">Custom</option></select></label>
                <label className="block text-sm font-semibold text-ink">Start date<input type="date" className={`mt-1 ${inputCls}`} value={subscriptionForm.start_date} onChange={(event) => setSubscriptionForm((current) => ({ ...current, start_date: event.target.value }))} /></label>
                <label className="block text-sm font-semibold text-ink">End date<input type="date" className={`mt-1 ${inputCls}`} value={subscriptionForm.end_date} onChange={(event) => setSubscriptionForm((current) => ({ ...current, end_date: event.target.value }))} /></label>
                <label className="block text-sm font-semibold text-ink">Grace days<input type="number" className={`mt-1 ${inputCls}`} value={subscriptionForm.grace_period_days} onChange={(event) => setSubscriptionForm((current) => ({ ...current, grace_period_days: Number(event.target.value) }))} /></label>
                <label className="block text-sm font-semibold text-ink">Custom price<input className={`mt-1 ${inputCls}`} value={subscriptionForm.custom_price} onChange={(event) => setSubscriptionForm((current) => ({ ...current, custom_price: event.target.value }))} placeholder="Premium/Enterprise only" /></label>
              </div>
              <label className="block text-sm font-semibold text-ink">GST number<input className={`mt-1 ${inputCls}`} value={subscriptionForm.gst_number} onChange={(event) => setSubscriptionForm((current) => ({ ...current, gst_number: event.target.value }))} /></label>
              <label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={subscriptionForm.auto_disable_on_expiry} onChange={(event) => setSubscriptionForm((current) => ({ ...current, auto_disable_on_expiry: event.target.checked }))} />Auto-disable after expiry and grace period</label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Save size={14} />Save subscription</button>
                <button type="button" onClick={() => setSubscriptionForm(defaultSubscriptionForm(selectedCampus ?? schools[0]?.schoolId ?? 0, plans[0]?.id ?? 0))} className="rounded-lg border border-line/70 px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50">Reset</button>
              </div>
            </div>
          </form>

          <div className="rounded-lg border border-line/70 bg-white p-5 shadow-sm">
            <SectionHeader kicker="Active subscriptions" title="School plan access" detail="Renew subscriptions, generate GST invoices, or open a row for editing." />
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr>{["School", "Plan", "Status", "End date", "Price", "Actions"].map((head) => <th key={head} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted">{head}</th>)}</tr></thead>
                <tbody>
                  {subscriptions.map((subscription) => (
                    <tr key={subscription.id} className="border-t border-line/50">
                      <td className="px-3 py-3"><span className="font-semibold text-ink">{subscription.campus_name}</span><span className="block font-mono text-xs text-muted">{subscription.campus_code}</span></td>
                      <td className="px-3 py-3 text-muted">{subscription.plan_name}</td>
                      <td className="px-3 py-3"><Badge variant={statusBadge(subscription.status)}>{statusLabel(subscription.status)}</Badge></td>
                      <td className="px-3 py-3 text-muted">{formatDate(subscription.end_date)}</td>
                      <td className="px-3 py-3 text-muted">{money(subscription.effective_price)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => void editSubscription(subscription)} className="rounded-lg border border-line/70 px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50">Edit</button>
                          <button type="button" onClick={() => void runAction(() => enterpriseApi.subscriptions.renew(subscription.id, 1).then(() => undefined), "Renewal failed.")} className="rounded-lg border border-line/70 px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50">Renew</button>
                          <button type="button" onClick={() => void generateInvoice(subscription)} className="rounded-lg border border-line/70 px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50">Invoice</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!subscriptions.length && <tr><td colSpan={6} className="px-3 py-10"><EmptyState label="No school subscriptions have been created yet." /></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {activeTab === "billing" && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
          <div className="rounded-lg border border-line/70 bg-white p-5 shadow-sm">
            <SectionHeader kicker="Billing" title="Invoices and payment history" detail="Generate, download, and settle school subscription invoices with GST totals and payment audit trail." />
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr>{["Invoice", "School", "Plan", "Total", "Outstanding", "Status", "Actions"].map((head) => <th key={head} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted">{head}</th>)}</tr></thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-t border-line/50">
                      <td className="px-3 py-3 font-mono text-xs text-ink">{invoice.invoice_number}</td>
                      <td className="px-3 py-3 text-muted">{invoice.campus_name}</td>
                      <td className="px-3 py-3 text-muted">{invoice.plan_name}</td>
                      <td className="px-3 py-3 text-muted">{money(invoice.total_amount)}</td>
                      <td className="px-3 py-3 text-muted">{money(invoice.outstanding_amount)}</td>
                      <td className="px-3 py-3"><Badge variant={statusBadge(invoice.status)}>{statusLabel(invoice.status)}</Badge></td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setPaymentForm((current) => ({ ...current, invoice: invoice.id, amount: invoice.outstanding_amount }))} className="rounded-lg border border-line/70 px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50">Collect</button>
                          <button type="button" onClick={() => void downloadInvoice(invoice)} className="rounded-lg border border-line/70 px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50">PDF</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!invoices.length && <tr><td colSpan={7} className="px-3 py-10"><EmptyState label="No subscription invoices have been generated yet." /></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void recordPayment();
            }}
            className="rounded-lg border border-line/70 bg-white p-5 shadow-sm"
          >
            <SectionHeader kicker="Payment" title="Record subscription payment" detail="Successful payments activate the subscription and mark the invoice as paid." />
            <div className="mt-5 grid gap-4">
              <label className="block text-sm font-semibold text-ink">Invoice<select className={`mt-1 ${inputCls}`} value={paymentForm.invoice || ""} onChange={(event) => setPaymentForm((current) => ({ ...current, invoice: Number(event.target.value), amount: openInvoices.find((invoice) => invoice.id === Number(event.target.value))?.outstanding_amount ?? current.amount }))}><option value="">Select invoice</option>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoice_number} - {invoice.campus_name}</option>)}</select></label>
              <label className="block text-sm font-semibold text-ink">Amount<input className={`mt-1 ${inputCls}`} value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} /></label>
              <label className="block text-sm font-semibold text-ink">Transaction ID<input className={`mt-1 ${inputCls}`} value={paymentForm.transaction_id} onChange={(event) => setPaymentForm((current) => ({ ...current, transaction_id: event.target.value }))} /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-ink">Provider<input className={`mt-1 ${inputCls}`} value={paymentForm.provider} onChange={(event) => setPaymentForm((current) => ({ ...current, provider: event.target.value }))} /></label>
                <label className="block text-sm font-semibold text-ink">Status<select className={`mt-1 ${inputCls}`} value={paymentForm.payment_status} onChange={(event) => setPaymentForm((current) => ({ ...current, payment_status: event.target.value as EnterprisePaymentStatus }))}><option value="success">Success</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="refunded">Refunded</option></select></label>
              </div>
              <button type="submit" disabled={busy || !paymentForm.invoice} className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><CreditCard size={14} />Record payment</button>
            </div>
            <div className="mt-6 border-t border-line/70 pt-4">
              <h3 className="text-sm font-semibold text-ink">Recent payments</h3>
              <div className="mt-3 space-y-2">
                {payments.slice(0, 5).map((payment) => (
                  <div key={payment.id} className="rounded-lg border border-line/70 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-ink">{payment.transaction_id || payment.invoice_number}</span><Badge variant={statusBadge(payment.payment_status)}>{payment.payment_status}</Badge></div>
                    <p className="mt-1 text-muted">{payment.campus_name} - {money(payment.amount)}</p>
                  </div>
                ))}
                {!payments.length && <EmptyState label="No subscription payment history found." />}
              </div>
            </div>
          </form>
        </section>
      )}

      {activeTab === "white-label" && (
        <section className="grid gap-5 xl:grid-cols-[minmax(24rem,0.85fr)_minmax(0,1.15fr)]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveWhiteLabel();
            }}
            className="rounded-lg border border-line/70 bg-white p-5 shadow-sm"
          >
            <SectionHeader kicker="White label" title="Premium and Enterprise branding" detail="Schools on Premium or Enterprise can use their own logo, domain, colors, login text, email templates, and report branding." />
            <div className="mt-5 grid gap-4">
              <label className="block text-sm font-semibold text-ink">School<SchoolSelect schools={schools} value={whiteLabelForm.campus || selectedCampus} onChange={(value) => { setSelectedCampus(value); setWhiteLabelForm(value ? defaultWhiteLabelForm(value) : defaultWhiteLabelForm()); }} /></label>
              <label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={whiteLabelForm.is_enabled} onChange={(event) => setWhiteLabelForm((current) => ({ ...current, is_enabled: event.target.checked }))} />Enable white-label branding</label>
              <label className="block text-sm font-semibold text-ink">Custom domain<input className={`mt-1 ${inputCls}`} value={whiteLabelForm.custom_domain} onChange={(event) => setWhiteLabelForm((current) => ({ ...current, custom_domain: event.target.value }))} placeholder="school.example.com" /></label>
              <label className="block text-sm font-semibold text-ink">Custom logo URL<input className={`mt-1 ${inputCls}`} value={whiteLabelForm.custom_logo_url} onChange={(event) => setWhiteLabelForm((current) => ({ ...current, custom_logo_url: event.target.value }))} /></label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-semibold text-ink">Primary<input type="color" className="mt-1 h-10 w-full rounded-lg border border-line/70 bg-white" value={whiteLabelForm.primary_color} onChange={(event) => setWhiteLabelForm((current) => ({ ...current, primary_color: event.target.value }))} /></label>
                <label className="block text-sm font-semibold text-ink">Secondary<input type="color" className="mt-1 h-10 w-full rounded-lg border border-line/70 bg-white" value={whiteLabelForm.secondary_color} onChange={(event) => setWhiteLabelForm((current) => ({ ...current, secondary_color: event.target.value }))} /></label>
                <label className="block text-sm font-semibold text-ink">Accent<input type="color" className="mt-1 h-10 w-full rounded-lg border border-line/70 bg-white" value={whiteLabelForm.accent_color} onChange={(event) => setWhiteLabelForm((current) => ({ ...current, accent_color: event.target.value }))} /></label>
              </div>
              <label className="block text-sm font-semibold text-ink">Login heading<input className={`mt-1 ${inputCls}`} value={whiteLabelForm.login_heading} onChange={(event) => setWhiteLabelForm((current) => ({ ...current, login_heading: event.target.value }))} /></label>
              <label className="block text-sm font-semibold text-ink">Login subheading<textarea className={`mt-1 min-h-20 ${inputCls}`} value={whiteLabelForm.login_subheading} onChange={(event) => setWhiteLabelForm((current) => ({ ...current, login_subheading: event.target.value }))} /></label>
              <label className="block text-sm font-semibold text-ink">Report footer<textarea className={`mt-1 min-h-20 ${inputCls}`} value={whiteLabelForm.report_footer} onChange={(event) => setWhiteLabelForm((current) => ({ ...current, report_footer: event.target.value }))} /></label>
              <button type="submit" disabled={busy || !whiteLabelForm.campus} className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Save size={14} />Save branding</button>
            </div>
          </form>
          <div className="rounded-lg border border-line/70 bg-white p-5 shadow-sm">
            <SectionHeader kicker="Configured schools" title="White-label status" detail="Super Admin branding remains protected; these settings apply only to each school-facing portal." />
            <div className="mt-5 space-y-3">
              {whiteLabels.map((config) => (
                <button key={config.id} type="button" onClick={() => { setSelectedCampus(config.campus); setWhiteLabelForm({ ...config }); }} className="w-full rounded-lg border border-line/70 px-4 py-3 text-left hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-3"><span className="font-semibold text-ink">{config.campus_name}</span><Badge variant={config.is_enabled ? "success" : "neutral"}>{config.is_enabled ? "enabled" : "disabled"}</Badge></div>
                  <p className="mt-1 text-sm text-muted">{config.custom_domain || "No custom domain"}</p>
                </button>
              ))}
              {!whiteLabels.length && <EmptyState label="No white-label configurations exist yet." />}
            </div>
          </div>
        </section>
      )}

      {activeTab === "analytics" && (
        <section className="space-y-5">
          <div className="rounded-lg border border-line/70 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeader kicker="Advanced analytics" title="Platform and school analytics" detail="Track SaaS revenue, subscription growth, attendance, fee collection, student performance, and teacher activity." />
              <div className="flex min-w-[min(100%,28rem)] flex-wrap gap-2">
                <SchoolSelect schools={schools} value={selectedCampus} onChange={setSelectedCampus} />
                <button type="button" onClick={() => void loadSchoolAnalytics()} disabled={!selectedCampus || busy} className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><BarChart3 size={14} />Load school</button>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Revenue total" value={money(analytics?.revenueAnalytics.total)} detail="Successful SaaS payments" icon={CreditCard} />
            <StatTile label="Monthly revenue" value={money(analytics?.revenueAnalytics.monthly)} detail="Current month collection" icon={BarChart3} />
            <StatTile label="Student overages" value={analytics?.limits.schoolsOverStudentLimit ?? 0} detail="Schools above plan student limit" icon={School} />
            <StatTile label="Teacher overages" value={analytics?.limits.schoolsOverTeacherLimit ?? 0} detail="Schools above plan teacher limit" icon={Building2} />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="rounded-lg border border-line/70 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-ink">Revenue by plan</h3>
              <div className="mt-4 space-y-3">
                {analytics?.revenueAnalytics.byPlan.map((row) => <div key={row.plan || "unknown"} className="flex items-center justify-between rounded-lg border border-line/70 px-3 py-2 text-sm"><span className="text-ink">{row.plan || "Unassigned"}</span><span className="font-semibold">{money(row.amount)}</span></div>)}
                {!analytics?.revenueAnalytics.byPlan.length && <EmptyState label="No SaaS revenue has been recorded yet." />}
              </div>
            </div>
            <div className="rounded-lg border border-line/70 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-ink">{schoolAnalytics ? `${schoolAnalytics.school.name} analytics` : selectedSchool ? `${selectedSchool.schoolName} analytics` : "School analytics"}</h3>
              {schoolAnalytics ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <StatTile label="Attendance" value={`${schoolAnalytics.attendanceAnalytics.attendancePercentage}%`} detail={`${schoolAnalytics.attendanceAnalytics.presentRecords} present records`} icon={Activity} />
                  <StatTile label="Fee collected" value={money(schoolAnalytics.feeCollectionAnalytics.collected)} detail={`${schoolAnalytics.feeCollectionAnalytics.pendingCount} pending assignments`} icon={CreditCard} />
                  <StatTile label="Avg result" value={Number(schoolAnalytics.studentPerformanceAnalytics.averageScore).toFixed(1)} detail={`${schoolAnalytics.studentPerformanceAnalytics.publishedResults} published results`} icon={FileText} />
                  <StatTile label="Teachers" value={schoolAnalytics.teacherPerformanceAnalytics.length} detail="Active teacher performance rows" icon={School} />
                </div>
              ) : (
                <EmptyState label="Select a school and load analytics." />
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === "compliance" && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.9fr)]">
          <div className="rounded-lg border border-line/70 bg-white p-5 shadow-sm">
            <SectionHeader kicker="Compliance" title="Audit trails and activity logs" detail="Critical subscription, billing, login, download, upload, and administrative actions are traceable." />
            <div className="mt-5 space-y-3">
              {activityLogs.slice(0, 12).map((log) => (
                <div key={log.id} className="rounded-lg border border-line/70 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-ink">{log.summary}</span><span className="text-xs text-muted">{formatDate(log.created_at)}</span></div>
                  <p className="mt-1 text-muted">{log.campus_name || "Platform"} - {log.activity_type} - {log.user_name || "System"}</p>
                </div>
              ))}
              {!activityLogs.length && <EmptyState label="No user activity logs available yet." />}
            </div>
          </div>
          <div className="space-y-5">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void createSecureToken();
              }}
              className="rounded-lg border border-line/70 bg-white p-5 shadow-sm"
            >
              <SectionHeader kicker="Secure API" title="Token access" detail="Create school-scoped API tokens with explicit scopes. Secret values are shown once." />
              {createdToken && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><span className="font-semibold">New token:</span> <span className="font-mono">{createdToken}</span></div>}
              <div className="mt-5 grid gap-4">
                <label className="block text-sm font-semibold text-ink">Scope<SchoolSelect schools={schools} value={tokenForm.campus} onChange={(value) => setTokenForm((current) => ({ ...current, campus: value }))} includePlatform /></label>
                <label className="block text-sm font-semibold text-ink">Name<input className={`mt-1 ${inputCls}`} value={tokenForm.name} onChange={(event) => setTokenForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="block text-sm font-semibold text-ink">Scopes<input className={`mt-1 ${inputCls}`} value={tokenForm.scopes} onChange={(event) => setTokenForm((current) => ({ ...current, scopes: event.target.value }))} /></label>
                <label className="block text-sm font-semibold text-ink">Expires at<input type="datetime-local" className={`mt-1 ${inputCls}`} value={tokenForm.expires_at} onChange={(event) => setTokenForm((current) => ({ ...current, expires_at: event.target.value ? new Date(event.target.value).toISOString() : "" }))} /></label>
                <button type="submit" disabled={busy || !tokenForm.name} className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><KeyRound size={14} />Create token</button>
              </div>
              <div className="mt-5 space-y-2">
                {tokens.slice(0, 5).map((token) => <div key={token.id} className="rounded-lg border border-line/70 px-3 py-2 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{token.name}</span><Badge variant={token.is_active ? "success" : "neutral"}>{token.prefix}</Badge></div><p className="mt-1 text-xs text-muted">{token.campus_name || "Platform"} - {token.scopes.join(", ") || "No scopes"}</p></div>)}
              </div>
            </form>
            <div className="rounded-lg border border-line/70 bg-white p-5 shadow-sm">
              <SectionHeader kicker="Documents" title="Protected download logs" detail="Document access is logged with school, user, student, and authorization result." />
              <div className="mt-4 space-y-2">
                {documentLogs.slice(0, 6).map((log) => <div key={log.id} className="rounded-lg border border-line/70 px-3 py-2 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{log.file_name || "Document"}</span><Badge variant={log.granted ? "success" : "danger"}>{log.granted ? "granted" : "blocked"}</Badge></div><p className="mt-1 text-xs text-muted">{log.campus_name} - {log.user_name || "System"}</p></div>)}
                {!documentLogs.length && <EmptyState label="No protected document downloads logged yet." />}
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === "recovery" && (
        <section className="grid gap-5 xl:grid-cols-[minmax(24rem,0.85fr)_minmax(0,1.15fr)]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveBackupPolicy();
            }}
            className="rounded-lg border border-line/70 bg-white p-5 shadow-sm"
          >
            <SectionHeader kicker="Disaster recovery" title="Backup policy" detail="Queue encrypted platform or school-wise backup jobs for database, files, payment logs, and audit logs." />
            <div className="mt-5 grid gap-4">
              <label className="block text-sm font-semibold text-ink">Scope<SchoolSelect schools={schools} value={backupPolicyForm.campus} onChange={(value) => setBackupPolicyForm((current) => ({ ...current, campus: value }))} includePlatform /></label>
              <label className="block text-sm font-semibold text-ink">Backup type<select className={`mt-1 ${inputCls}`} value={backupPolicyForm.backup_type} onChange={(event) => setBackupPolicyForm((current) => ({ ...current, backup_type: event.target.value }))}><option value="full_database">Full database</option><option value="school_data">School data</option><option value="files">Files</option><option value="payment_logs">Payment logs</option><option value="audit_logs">Audit logs</option></select></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-ink">Frequency<input className={`mt-1 ${inputCls}`} value={backupPolicyForm.frequency} onChange={(event) => setBackupPolicyForm((current) => ({ ...current, frequency: event.target.value }))} /></label>
                <label className="block text-sm font-semibold text-ink">Retention days<input type="number" className={`mt-1 ${inputCls}`} value={backupPolicyForm.retention_days} onChange={(event) => setBackupPolicyForm((current) => ({ ...current, retention_days: Number(event.target.value) }))} /></label>
              </div>
              <label className="block text-sm font-semibold text-ink">Destination<input className={`mt-1 ${inputCls}`} value={backupPolicyForm.destination} onChange={(event) => setBackupPolicyForm((current) => ({ ...current, destination: event.target.value }))} placeholder="s3://bucket/path or storage policy name" /></label>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={backupPolicyForm.encryption_required} onChange={(event) => setBackupPolicyForm((current) => ({ ...current, encryption_required: event.target.checked }))} />Encrypted</label>
                <label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={backupPolicyForm.is_active} onChange={(event) => setBackupPolicyForm((current) => ({ ...current, is_active: event.target.checked }))} />Active</label>
              </div>
              <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><DatabaseBackup size={14} />Create policy</button>
            </div>
          </form>
          <div className="rounded-lg border border-line/70 bg-white p-5 shadow-sm">
            <SectionHeader kicker="Backup jobs" title="Policies and restore testing" detail="Queue backup jobs and mark completed jobs as restore-tested for handover evidence." />
            <div className="mt-5 space-y-3">
              {backupPolicies.map((policy) => (
                <div key={policy.id} className="rounded-lg border border-line/70 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-ink">{policy.campus_name || "Platform"} - {statusLabel(policy.backup_type)}</span><Badge variant={policy.is_active ? "success" : "neutral"}>{policy.frequency}</Badge></div>
                  <p className="mt-1 text-muted">Retention {policy.retention_days} days - {policy.destination || "destination not set"}</p>
                  <button type="button" onClick={() => void createBackupJob(policy)} className="mt-3 rounded-lg border border-line/70 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50">Queue backup</button>
                </div>
              ))}
              {!backupPolicies.length && <EmptyState label="No backup policies configured." />}
            </div>
            <div className="mt-6 border-t border-line/70 pt-4">
              <h3 className="text-sm font-semibold text-ink">Recent backup jobs</h3>
              <div className="mt-3 space-y-2">
                {backupJobs.slice(0, 6).map((job) => <div key={job.id} className="rounded-lg border border-line/70 px-3 py-2 text-sm"><div className="flex items-center justify-between gap-2"><span>{job.campus_name || "Platform"} - {statusLabel(job.backup_type)}</span><Badge variant={statusBadge(job.status)}>{job.status}</Badge></div><button type="button" onClick={() => void runAction(() => enterpriseApi.backupJobs.markRestored(job.id, "Restore test completed from enterprise panel.").then(() => undefined), "Restore marker failed.")} className="mt-2 rounded-lg border border-line/70 px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50">Mark restored</button></div>)}
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === "monitoring" && (
        <section className="grid gap-5 xl:grid-cols-3">
          <div className="rounded-lg border border-line/70 bg-white p-5 shadow-sm">
            <SectionHeader kicker="Health" title="System health" detail={`Current scope: ${monitoring?.scope ?? "platform"}`} />
            <div className="mt-5 space-y-2">
              {(monitoring?.health ?? health).slice(0, 8).map((item) => <div key={item.id} className="rounded-lg border border-line/70 px-3 py-2 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{item.component}</span><Badge variant={item.status === "critical" ? "danger" : item.status === "warning" ? "warning" : "success"}>{item.status}</Badge></div><p className="mt-1 text-xs text-muted">{item.message || formatDate(item.checked_at)}</p></div>)}
              {!health.length && !monitoring?.health.length && <EmptyState label="No health snapshots recorded yet." />}
            </div>
          </div>
          <div className="rounded-lg border border-line/70 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <SectionHeader kicker="Queues" title="Background workers" detail="Monitor queued and failed jobs for scale-sensitive work." />
              <button type="button" onClick={() => void runAction(() => enterpriseApi.queueJobs.runNext().then(() => undefined), "Queue job failed.")} className="rounded-lg border border-line/70 px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-50">Run next</button>
            </div>
            <div className="mt-5 space-y-2">
              {(monitoring?.queueJobs ?? queueJobs).slice(0, 8).map((job) => <div key={job.id} className="rounded-lg border border-line/70 px-3 py-2 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{job.job_type}</span><Badge variant={statusBadge(job.status)}>{job.status}</Badge></div><p className="mt-1 text-xs text-muted">Priority {job.priority} - attempts {job.attempts}/{job.max_attempts}</p></div>)}
              {!queueJobs.length && !monitoring?.queueJobs.length && <EmptyState label="No queue jobs available." />}
            </div>
          </div>
          <div className="rounded-lg border border-line/70 bg-white p-5 shadow-sm">
            <SectionHeader kicker="Operations" title="Payment, AI, storage" detail="Track failed payments, monthly AI usage, storage metrics, and backup failures." />
            <div className="mt-5 grid gap-3">
              <StatTile label="Failed payments" value={monitoring?.paymentMonitoring.failedPayments ?? 0} icon={CreditCard} />
              <StatTile label="AI usage" value={monitoring?.aiUsageMonitoring.monthlyUsage ?? 0} icon={Sparkles} />
              <StatTile label="Failed backups" value={monitoring?.alerts.failedBackups ?? 0} icon={DatabaseBackup} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
