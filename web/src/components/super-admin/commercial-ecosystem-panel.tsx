"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Bot,
  Bus,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Globe2,
  Library,
  Package,
  Plug,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from "lucide-react";

import { Badge, statusBadge, statusLabel } from "@/components/ui/badge";
import { WorkspacePlaceholder } from "@/components/ui/workspace-placeholder";
import {
  ApiError,
  phase10Api,
  roleAiApi,
  schoolApi,
  type AdmissionApplication,
  type AdmissionFormTemplate,
  type AccountingLedgerEntry,
  type DigitalLibraryResource,
  type InventoryAsset,
  type MarketplacePlugin,
  type Phase10EcosystemDashboard,
  type ProductionAuditRun,
  type PushNotificationLog,
  type ReportDefinition,
  type School,
  type SchoolPluginConfig,
  type SchoolWebsiteContent,
  type SecurityEvent,
  type SecurityPolicy,
  type TransportDriver,
} from "@/lib/api";

type PanelTab = "overview" | "admissions" | "operations" | "website-mobile" | "marketplace" | "accounting" | "security" | "audit";

const inputCls =
  "w-full rounded-lg border border-line/80 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

const tabs: { id: PanelTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: Sparkles },
  { id: "admissions", label: "Admissions", icon: UserPlus },
  { id: "operations", label: "Transport, Library, Assets", icon: Bus },
  { id: "website-mobile", label: "Website & Push", icon: Globe2 },
  { id: "marketplace", label: "Marketplace", icon: Plug },
  { id: "accounting", label: "GST & Reports", icon: FileSpreadsheet },
  { id: "security", label: "Security Center", icon: ShieldCheck },
  { id: "audit", label: "Launch Audit", icon: ClipboardCheck },
];

function asArray<T>(value: T[] | { results?: T[] }): T[] {
  return Array.isArray(value) ? value : value.results ?? [];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "school-update";
}

function money(value?: string | number | null) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-lg border border-dashed border-line/80 bg-slate-50 px-4 py-8 text-center text-sm text-muted">{label}</div>;
}

function StatTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
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
      <p className="mt-2 text-xs leading-5 text-muted">{detail}</p>
    </div>
  );
}

function ActionButton({
  children,
  icon: Icon,
  onClick,
  disabled,
  variant = "dark",
}: {
  children: React.ReactNode;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  variant?: "dark" | "light";
}) {
  const classes =
    variant === "dark"
      ? "bg-ink text-white hover:bg-slate-800 disabled:bg-slate-300"
      : "border border-line/80 bg-white text-ink hover:bg-slate-50 disabled:text-muted";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed ${classes}`}
    >
      <Icon size={16} />
      <span>{children}</span>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
      <input className={`${inputCls} mt-1`} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted">{detail}</p>
    </div>
  );
}

function Row({
  title,
  detail,
  status,
  action,
}: {
  title: string;
  detail: string;
  status?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-line/70 px-4 py-3 first:border-t-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {status && <Badge variant={statusBadge(status)}>{statusLabel(status)}</Badge>}
        {action}
      </div>
    </div>
  );
}

export function CommercialEcosystemPanel() {
  const [activeTab, setActiveTab] = useState<PanelTab>("overview");
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);
  const [dashboard, setDashboard] = useState<Phase10EcosystemDashboard | null>(null);
  const [forms, setForms] = useState<AdmissionFormTemplate[]>([]);
  const [applications, setApplications] = useState<AdmissionApplication[]>([]);
  const [drivers, setDrivers] = useState<TransportDriver[]>([]);
  const [resources, setResources] = useState<DigitalLibraryResource[]>([]);
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [websiteContents, setWebsiteContents] = useState<SchoolWebsiteContent[]>([]);
  const [pushLogs, setPushLogs] = useState<PushNotificationLog[]>([]);
  const [plugins, setPlugins] = useState<MarketplacePlugin[]>([]);
  const [pluginConfigs, setPluginConfigs] = useState<SchoolPluginConfig[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<AccountingLedgerEntry[]>([]);
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [policies, setPolicies] = useState<SecurityPolicy[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [audits, setAudits] = useState<ProductionAuditRun[]>([]);
  const [gstReport, setGstReport] = useState<{ outputGst: string; inputGst: string } | null>(null);
  const [reportPreview, setReportPreview] = useState<{ headers: string[]; rows: string[][]; count: number } | null>(null);
  const [aiResponse, setAiResponse] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [admissionName, setAdmissionName] = useState("Admission Form");
  const [admissionYear, setAdmissionYear] = useState("2026-27");
  const [admissionFee, setAdmissionFee] = useState("500.00");
  const [driverName, setDriverName] = useState("Transport Driver");
  const [driverPhone, setDriverPhone] = useState("9000000000");
  const [driverLicense, setDriverLicense] = useState("DL-NEW");
  const [resourceTitle, setResourceTitle] = useState("Digital Library Resource");
  const [assetName, setAssetName] = useState("Smart Board");
  const [assetCode, setAssetCode] = useState("ASSET-NEW");
  const [websiteTitle, setWebsiteTitle] = useState("School News");
  const [pushTitle, setPushTitle] = useState("School update");
  const [pluginCode, setPluginCode] = useState("custom-provider");
  const [ledgerName, setLedgerName] = useState("GST Ledger Entry");
  const [reportName, setReportName] = useState("Student Report");
  const [twoFactorRequired, setTwoFactorRequired] = useState(true);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.schoolId === selectedSchoolId) ?? null,
    [schools, selectedSchoolId]
  );
  const selectedCampusForCreate = selectedSchoolId ?? schools[0]?.schoolId ?? 0;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const schoolList = asArray(await schoolApi.list());
      const params = selectedSchoolId ? { campus: String(selectedSchoolId) } : undefined;
      const [
        dashboardRes,
        formRes,
        applicationRes,
        driverRes,
        resourceRes,
        assetRes,
        websiteRes,
        pushRes,
        pluginRes,
        configRes,
        ledgerRes,
        reportRes,
        policyRes,
        eventRes,
        auditRes,
        gstRes,
      ] = await Promise.all([
        phase10Api.dashboard(selectedSchoolId),
        phase10Api.admissions.forms.list(params),
        phase10Api.admissions.applications.list(params),
        phase10Api.transportDrivers.list(params),
        phase10Api.digitalLibrary.list(params),
        phase10Api.inventoryAssets.list(params),
        phase10Api.website.list(params),
        phase10Api.pushNotifications.list(params),
        phase10Api.marketplace.plugins.list(),
        phase10Api.marketplace.configs.list(params),
        phase10Api.accounting.list(params),
        phase10Api.reports.list(params),
        phase10Api.security.policies.list(params),
        phase10Api.security.events.list(params),
        phase10Api.audits.list(params),
        phase10Api.accounting.gstReport(),
      ]);
      setSchools(schoolList);
      setDashboard(dashboardRes);
      setForms(asArray(formRes));
      setApplications(asArray(applicationRes));
      setDrivers(asArray(driverRes));
      setResources(asArray(resourceRes));
      setAssets(asArray(assetRes));
      setWebsiteContents(asArray(websiteRes));
      setPushLogs(asArray(pushRes));
      setPlugins(asArray(pluginRes));
      setPluginConfigs(asArray(configRes));
      setLedgerEntries(asArray(ledgerRes));
      setReports(asArray(reportRes));
      setPolicies(asArray(policyRes));
      setEvents(asArray(eventRes));
      setAudits(asArray(auditRes));
      setGstReport(gstRes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load commercial ecosystem data.");
    } finally {
      setLoading(false);
    }
  }, [selectedSchoolId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

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

  function requireSchool() {
    if (!selectedCampusForCreate) {
      throw new ApiError(400, "Select a school before creating school-scoped records.");
    }
    return selectedCampusForCreate;
  }

  const createAdmissionForm = () =>
    runAction(async () => {
      const campus = requireSchool();
      await phase10Api.admissions.forms.create({
        campus,
        name: admissionName,
        academic_year: admissionYear,
        form_schema: [{ name: "previousSchool", type: "text", required: false }],
        admission_fee: admissionFee,
        is_public: true,
        status: "active",
      });
    }, "Admission form could not be created.");

  const approveApplication = (application: AdmissionApplication) =>
    runAction(async () => {
      await phase10Api.admissions.applications.transition(application.id, { status: "approved", decision_note: "Approved from commercial ecosystem panel." });
    }, "Application status could not be updated.");

  const admitApplication = (application: AdmissionApplication) =>
    runAction(async () => {
      await phase10Api.admissions.applications.admit(application.id);
    }, "Application could not be admitted.");

  const createDriver = () =>
    runAction(async () => {
      await phase10Api.transportDrivers.create({
        campus: requireSchool(),
        user: null,
        full_name: driverName,
        phone: driverPhone,
        license_number: driverLicense,
        emergency_contact: "",
        status: "active",
      });
    }, "Driver could not be created.");

  const createResource = () =>
    runAction(async () => {
      await phase10Api.digitalLibrary.create({
        campus: requireSchool(),
        book: null,
        title: resourceTitle,
        resource_type: "ebook",
        file_url: "data:application/pdf;base64,JVBERi0xLjQK",
        file_name: `${slugify(resourceTitle)}.pdf`,
        file_content_type: "application/pdf",
        status: "active",
      });
    }, "Digital library resource could not be created.");

  const createAsset = () =>
    runAction(async () => {
      await phase10Api.inventoryAssets.create({
        campus: requireSchool(),
        asset_code: assetCode,
        name: assetName,
        category: "smart_board",
        serial_number: "",
        location: "",
        allocated_to_user: null,
        allocated_to_student: null,
        purchase_date: todayIso(),
        purchase_cost: "0.00",
        current_value: "0.00",
        depreciation_rate: "0.00",
        status: "available",
        metadata: {},
      });
    }, "Asset could not be created.");

  const createWebsiteContent = () =>
    runAction(async () => {
      await phase10Api.website.create({
        campus: requireSchool(),
        content_type: "news",
        title: websiteTitle,
        slug: slugify(websiteTitle),
        body: websiteTitle,
        summary: websiteTitle,
        media_url: "",
        metadata: {},
        publish_at: new Date().toISOString(),
        is_published: true,
        sort_order: 0,
      });
    }, "Website content could not be published.");

  const queuePushNotification = () =>
    runAction(async () => {
      await phase10Api.pushNotifications.create({
        campus: requireSchool(),
        user: null,
        student: null,
        event_type: "notice_published",
        title: pushTitle,
        body: pushTitle,
        payload: { source: "commercial_ecosystem_panel" },
        status: "queued",
      });
    }, "Push notification could not be queued.");

  const markFirstPushSent = () => {
    const item = pushLogs.find((push) => push.status === "queued");
    if (!item) return;
    void runAction(async () => {
      await phase10Api.pushNotifications.markSent(item.id);
    }, "Push notification could not be marked sent.");
  };

  const createPlugin = () =>
    runAction(async () => {
      await phase10Api.marketplace.plugins.create({
        code: pluginCode,
        name: pluginCode.split("-").map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" "),
        plugin_type: "custom",
        provider_name: "",
        description: "School ERP marketplace provider.",
        config_schema: { apiKey: "string" },
        is_enabled: true,
      });
    }, "Marketplace plugin could not be created.");

  const enablePluginForSchool = () => {
    const plugin = plugins[0];
    if (!plugin) return;
    void runAction(async () => {
      await phase10Api.marketplace.configs.create({
        campus: requireSchool(),
        plugin: plugin.id,
        is_enabled: true,
        config: { enabledFrom: "commercial_ecosystem_panel" },
      });
    }, "Plugin could not be enabled for the school.");
  };

  const createLedgerEntry = () =>
    runAction(async () => {
      await phase10Api.accounting.create({
        campus: requireSchool(),
        entry_type: "gst_output",
        ledger_name: ledgerName,
        reference_type: "manual",
        reference_id: `GST-${Date.now()}`,
        amount: "1000.00",
        tax_rate: "18.00",
        gst_amount: "180.00",
        entry_date: todayIso(),
        notes: "Created from commercial ecosystem panel.",
      });
    }, "GST ledger entry could not be created.");

  const createReportDefinition = () =>
    runAction(async () => {
      await phase10Api.reports.create({
        campus: requireSchool(),
        name: reportName,
        report_type: "student",
        description: "Student register report.",
        columns: ["admission_number", "student", "class", "status"],
        filters: {},
        sort: [],
        chart_config: {},
        is_public_to_school: true,
      });
    }, "Report definition could not be created.");

  const runFirstReport = () => {
    const report = reports[0];
    if (!report) return;
    void runAction(async () => {
      const result = await phase10Api.reports.run(report.id);
      setReportPreview(result);
    }, "Report could not be run.");
  };

  const exportFirstReport = () => {
    const report = reports[0];
    if (!report) return;
    void runAction(async () => {
      const blob = await phase10Api.reports.export(report.id, "csv");
      downloadBlob(blob, `${slugify(report.name)}.csv`);
    }, "Report could not be exported.");
  };

  const saveSecurityPolicy = () =>
    runAction(async () => {
      const campus = requireSchool();
      const existing = policies.find((policy) => policy.campus === campus);
      const payload = {
        campus,
        two_factor_required: twoFactorRequired,
        allowed_ip_ranges: [],
        blocked_ip_ranges: [],
        max_active_sessions: 5,
        force_password_change_days: 90,
        suspicious_login_threshold: 5,
      };
      if (existing) await phase10Api.security.policies.update(existing.id, payload);
      else await phase10Api.security.policies.create(payload);
    }, "Security policy could not be saved.");

  const resolveFirstSecurityEvent = () => {
    const event = events.find((item) => !item.resolved_at);
    if (!event) return;
    void runAction(async () => {
      await phase10Api.security.events.resolve(event.id);
    }, "Security event could not be resolved.");
  };

  const runProductionAudit = () =>
    runAction(async () => {
      await phase10Api.audits.runNow(selectedSchoolId);
    }, "Production audit could not be started.");

  const downloadLatestAudit = () => {
    const audit = audits[0];
    if (!audit) return;
    void runAction(async () => {
      const blob = await phase10Api.audits.report(audit.id);
      downloadBlob(blob, `production-audit-${audit.id}.pdf`);
    }, "Audit report could not be downloaded.");
  };

  const runAiSummary = () =>
    runAction(async () => {
      const result = await roleAiApi.run({ feature: "system_health", prompt: "commercial launch readiness", campus: selectedSchoolId });
      setAiResponse(result.response);
    }, "AI summary could not be generated.");

  if (loading) {
    return <WorkspacePlaceholder title="Commercial ecosystem" detail="Loading admissions, marketplace, compliance, mobile, security, and audit data." />;
  }

  const metrics = dashboard
    ? [
        ["Admissions", dashboard.admissions.total, `${money(dashboard.admissions.revenue)} collected`, UserPlus],
        ["Transport", dashboard.transport.drivers, `${dashboard.transport.vehicles} vehicles`, Bus],
        ["Library", dashboard.library.digitalResources, `${dashboard.library.requests} open requests`, Library],
        ["Assets", dashboard.inventory.assets, `${dashboard.inventory.maintenance} maintenance logs`, Package],
        ["Push", dashboard.mobile.pushDevices, `${dashboard.mobile.queuedNotifications} queued`, Bell],
        ["Security", dashboard.security.openAlerts, `${dashboard.security.activeSessions} active sessions`, ShieldCheck],
      ] as const
    : [];

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <SectionHeader
            title="Commercial School Ecosystem"
            detail="Admissions, transport, library, assets, website, mobile, marketplace, GST, security, and production audit are school-scoped from one Super Admin surface."
          />
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <select className={inputCls} value={selectedSchoolId ?? ""} onChange={(event) => setSelectedSchoolId(event.target.value ? Number(event.target.value) : null)}>
              <option value="">All schools</option>
              {schools.map((school) => (
                <option key={school.schoolId} value={school.schoolId}>
                  {school.schoolName}
                </option>
              ))}
            </select>
            <ActionButton icon={RefreshCcw} onClick={() => void loadAll()} disabled={busy} variant="light">
              Refresh
            </ActionButton>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          Current scope: {selectedSchool ? `${selectedSchool.schoolName} (${selectedSchool.schoolCode})` : "Platform-wide"}
        </p>
      </div>

      <ErrorNote message={error} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(([label, value, detail, Icon]) => (
          <StatTile key={label} label={label} value={value} detail={detail} icon={Icon} />
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line/70 bg-white p-2 shadow-sm">
        <div className="flex min-w-max gap-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                activeTab === id ? "bg-ink text-white" : "text-muted hover:bg-slate-50 hover:text-ink"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" && (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-line/70 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <h3 className="font-semibold text-ink">Launch Readiness Snapshot</h3>
              <Badge variant={dashboard?.audit.latestStatus === "passed" ? "success" : "warning"}>{statusLabel(dashboard?.audit.latestStatus ?? "not_run")}</Badge>
            </div>
            {[
              ["Admission workflow", `${forms.length} public forms, ${applications.length} applications`],
              ["Operations modules", `${drivers.length} drivers, ${resources.length} digital resources, ${assets.length} assets`],
              ["Website and mobile", `${websiteContents.length} website records, ${pushLogs.length} push notifications`],
              ["Marketplace and compliance", `${plugins.length} plugins, ${ledgerEntries.length} GST ledger entries`],
              ["Security center", `${policies.length} policies, ${events.filter((event) => !event.resolved_at).length} open alerts`],
            ].map(([title, detail]) => (
              <Row key={title} title={title} detail={detail} />
            ))}
          </div>
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <SectionHeader title="MentriQ360 AI Assistant" detail="Super Admin launch and health summary based on permitted platform data." />
              <ActionButton icon={Bot} onClick={runAiSummary} disabled={busy} variant="light">
                Run AI
              </ActionButton>
            </div>
            <div className="mt-4 rounded-lg border border-line/70 bg-slate-50 p-4 text-sm leading-6 text-ink">
              {aiResponse || "AI summary will appear after running the assistant."}
            </div>
          </div>
        </div>
      )}

      {activeTab === "admissions" && (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionHeader title="Online Admission Form" detail="Create public, fee-enabled admission forms with a schema that the public admission endpoint can render." />
            <div className="mt-4 grid gap-3">
              <Field label="Form name" value={admissionName} onChange={setAdmissionName} />
              <Field label="Academic year" value={admissionYear} onChange={setAdmissionYear} />
              <Field label="Admission fee" value={admissionFee} onChange={setAdmissionFee} type="number" />
              <ActionButton icon={Save} onClick={createAdmissionForm} disabled={busy || !selectedCampusForCreate}>
                Create Form
              </ActionButton>
            </div>
          </div>
          <div className="rounded-lg border border-line/70 bg-white shadow-sm">
            <div className="px-4 py-3">
              <h3 className="font-semibold text-ink">Admission Pipeline</h3>
            </div>
            {applications.length === 0 && <EmptyState label="No applications in the selected scope." />}
            {applications.slice(0, 8).map((application) => (
              <Row
                key={application.id}
                title={`${application.applicant_name} - ${application.application_number}`}
                detail={`${application.section_label || "Unassigned"} - ${money(application.admission_fee_amount)} - ${application.payment_status}`}
                status={application.status}
                action={
                  <>
                    <ActionButton icon={ClipboardCheck} onClick={() => approveApplication(application)} disabled={busy || application.status === "admitted"} variant="light">
                      Approve
                    </ActionButton>
                    <ActionButton icon={UserPlus} onClick={() => admitApplication(application)} disabled={busy || application.status === "admitted"} variant="light">
                      Admit
                    </ActionButton>
                  </>
                }
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === "operations" && (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionHeader title="Transport" detail="Driver records support vehicle attendance, route allocation, and GPS-ready trip logs." />
            <div className="mt-4 grid gap-3">
              <Field label="Driver name" value={driverName} onChange={setDriverName} />
              <Field label="Phone" value={driverPhone} onChange={setDriverPhone} />
              <Field label="License" value={driverLicense} onChange={setDriverLicense} />
              <ActionButton icon={Bus} onClick={createDriver} disabled={busy || !selectedCampusForCreate}>
                Add Driver
              </ActionButton>
            </div>
            <div className="mt-4 rounded-lg border border-line/70">
              {drivers.slice(0, 4).map((driver) => <Row key={driver.id} title={driver.full_name} detail={`${driver.phone} - ${driver.license_number}`} status={driver.status} />)}
              {drivers.length === 0 && <EmptyState label="No drivers found." />}
            </div>
          </div>
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionHeader title="Digital Library" detail="Protected PDF resources are delivered through permission-checked download APIs." />
            <div className="mt-4 grid gap-3">
              <Field label="Resource title" value={resourceTitle} onChange={setResourceTitle} />
              <ActionButton icon={BookOpen} onClick={createResource} disabled={busy || !selectedCampusForCreate}>
                Add Resource
              </ActionButton>
            </div>
            <div className="mt-4 rounded-lg border border-line/70">
              {resources.slice(0, 4).map((resource) => (
                <Row
                  key={resource.id}
                  title={resource.title}
                  detail={resource.file_name || resource.resource_type}
                  status={resource.status}
                  action={
                    <ActionButton
                      icon={Download}
                      onClick={() => void runAction(async () => downloadBlob(await phase10Api.digitalLibrary.download(resource.id), resource.file_name || "resource.pdf"), "Resource download failed.")}
                      disabled={busy}
                      variant="light"
                    >
                      Download
                    </ActionButton>
                  }
                />
              ))}
              {resources.length === 0 && <EmptyState label="No digital resources found." />}
            </div>
          </div>
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionHeader title="Assets" detail="Inventory tracks smart boards, computers, lab equipment, maintenance, and depreciation-ready values." />
            <div className="mt-4 grid gap-3">
              <Field label="Asset code" value={assetCode} onChange={setAssetCode} />
              <Field label="Asset name" value={assetName} onChange={setAssetName} />
              <ActionButton icon={Package} onClick={createAsset} disabled={busy || !selectedCampusForCreate}>
                Add Asset
              </ActionButton>
            </div>
            <div className="mt-4 rounded-lg border border-line/70">
              {assets.slice(0, 4).map((asset) => <Row key={asset.id} title={asset.name} detail={`${asset.asset_code} - ${asset.category}`} status={asset.status} />)}
              {assets.length === 0 && <EmptyState label="No assets found." />}
            </div>
          </div>
        </div>
      )}

      {activeTab === "website-mobile" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionHeader title="School Website" detail="Publish news, notice-board, event, gallery, admission, and contact content for each school's public site." />
            <div className="mt-4 grid gap-3">
              <Field label="Content title" value={websiteTitle} onChange={setWebsiteTitle} />
              <ActionButton icon={Globe2} onClick={createWebsiteContent} disabled={busy || !selectedCampusForCreate}>
                Publish Website Content
              </ActionButton>
            </div>
            <div className="mt-4 rounded-lg border border-line/70">
              {websiteContents.slice(0, 5).map((item) => <Row key={item.id} title={item.title} detail={`${item.content_type} - /${item.slug}`} status={item.is_published ? "active" : "inactive"} />)}
              {websiteContents.length === 0 && <EmptyState label="No website content found." />}
            </div>
          </div>
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionHeader title="Mobile Push Notifications" detail="Queue Firebase-ready browser or mobile notifications for school-scoped app events." />
            <div className="mt-4 grid gap-3">
              <Field label="Notification title" value={pushTitle} onChange={setPushTitle} />
              <div className="flex flex-col gap-2 sm:flex-row">
                <ActionButton icon={Bell} onClick={queuePushNotification} disabled={busy || !selectedCampusForCreate}>
                  Queue Push
                </ActionButton>
                <ActionButton icon={ClipboardCheck} onClick={markFirstPushSent} disabled={busy || !pushLogs.some((push) => push.status === "queued")} variant="light">
                  Mark Sent
                </ActionButton>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-line/70">
              {pushLogs.slice(0, 5).map((push) => <Row key={push.id} title={push.title} detail={push.event_type} status={push.status} />)}
              {pushLogs.length === 0 && <EmptyState label="No push notifications found." />}
            </div>
          </div>
        </div>
      )}

      {activeTab === "marketplace" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionHeader title="ERP Marketplace" detail="Register future-ready providers for biometric, SMS, WhatsApp, payment, AI, storage, and custom integrations." />
            <div className="mt-4 grid gap-3">
              <Field label="Plugin code" value={pluginCode} onChange={setPluginCode} />
              <div className="flex flex-col gap-2 sm:flex-row">
                <ActionButton icon={Plug} onClick={createPlugin} disabled={busy}>
                  Add Plugin
                </ActionButton>
                <ActionButton icon={Save} onClick={enablePluginForSchool} disabled={busy || !plugins.length || !selectedCampusForCreate} variant="light">
                  Enable for School
                </ActionButton>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-line/70 bg-white shadow-sm">
            <div className="px-4 py-3">
              <h3 className="font-semibold text-ink">Enabled Providers</h3>
            </div>
            {plugins.slice(0, 6).map((plugin) => (
              <Row key={plugin.id} title={plugin.name} detail={`${plugin.plugin_type} - ${plugin.code}`} status={plugin.is_enabled ? "active" : "inactive"} />
            ))}
            {pluginConfigs.slice(0, 4).map((config) => (
              <Row key={`config-${config.id}`} title={config.plugin_name || `Plugin ${config.plugin}`} detail={config.campus_name || "School configuration"} status={config.is_enabled ? "active" : "inactive"} />
            ))}
            {plugins.length === 0 && pluginConfigs.length === 0 && <EmptyState label="No marketplace providers found." />}
          </div>
        </div>
      )}

      {activeTab === "accounting" && (
        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionHeader title="GST and Accounting" detail="Create GST ledger entries and use the report builder for student, fee, attendance, staff, and custom exports." />
            <div className="mt-4 grid gap-3">
              <Field label="Ledger name" value={ledgerName} onChange={setLedgerName} />
              <ActionButton icon={Save} onClick={createLedgerEntry} disabled={busy || !selectedCampusForCreate}>
                Add GST Entry
              </ActionButton>
              <div className="rounded-lg border border-line/70 bg-slate-50 p-3 text-sm text-ink">
                Output GST: {money(gstReport?.outputGst)} | Input GST: {money(gstReport?.inputGst)}
              </div>
              <Field label="Report name" value={reportName} onChange={setReportName} />
              <div className="flex flex-col gap-2 sm:flex-row">
                <ActionButton icon={FileSpreadsheet} onClick={createReportDefinition} disabled={busy || !selectedCampusForCreate}>
                  Create Report
                </ActionButton>
                <ActionButton icon={RefreshCcw} onClick={runFirstReport} disabled={busy || !reports.length} variant="light">
                  Run
                </ActionButton>
                <ActionButton icon={Download} onClick={exportFirstReport} disabled={busy || !reports.length} variant="light">
                  Export CSV
                </ActionButton>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-line/70 bg-white shadow-sm">
            <div className="px-4 py-3">
              <h3 className="font-semibold text-ink">Report Preview</h3>
            </div>
            {reportPreview ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-muted">
                    <tr>{reportPreview.headers.map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {reportPreview.rows.slice(0, 6).map((row, index) => (
                      <tr key={`${row.join("-")}-${index}`} className="border-t border-line/70">
                        {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className="px-4 py-3 text-ink">{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState label="Run a report to preview rows." />
            )}
          </div>
        </div>
      )}

      {activeTab === "security" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionHeader title="Security Center" detail="Manage 2FA policy, session limits, IP controls, suspicious activity, and school-wise access logs." />
            <label className="mt-4 flex items-center gap-2 rounded-lg border border-line/70 bg-slate-50 px-3 py-2 text-sm font-semibold text-ink">
              <input type="checkbox" checked={twoFactorRequired} onChange={(event) => setTwoFactorRequired(event.target.checked)} />
              Require two-factor authentication
            </label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <ActionButton icon={ShieldCheck} onClick={saveSecurityPolicy} disabled={busy || !selectedCampusForCreate}>
                Save Policy
              </ActionButton>
              <ActionButton icon={AlertTriangle} onClick={resolveFirstSecurityEvent} disabled={busy || !events.some((event) => !event.resolved_at)} variant="light">
                Resolve Alert
              </ActionButton>
            </div>
          </div>
          <div className="rounded-lg border border-line/70 bg-white shadow-sm">
            <div className="px-4 py-3">
              <h3 className="font-semibold text-ink">Security Events</h3>
            </div>
            {events.slice(0, 7).map((event) => (
              <Row key={event.id} title={event.summary} detail={`${event.event_type} - ${event.ip_address || "no IP"}`} status={event.resolved_at ? "closed" : event.severity} />
            ))}
            {events.length === 0 && <EmptyState label="No security events found." />}
          </div>
        </div>
      )}

      {activeTab === "audit" && (
        <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <SectionHeader title="Production Audit" detail="Run commercial launch checks for protected routes, tenant isolation, file access, payment leakage, security alerts, routes, and role escalation." />
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <ActionButton icon={ClipboardCheck} onClick={runProductionAudit} disabled={busy}>
                Run Audit
              </ActionButton>
              <ActionButton icon={Download} onClick={downloadLatestAudit} disabled={busy || !audits.length} variant="light">
                Download Report
              </ActionButton>
            </div>
          </div>
          <div className="rounded-lg border border-line/70 bg-white shadow-sm">
            <div className="px-4 py-3">
              <h3 className="font-semibold text-ink">Recent Audit Runs</h3>
            </div>
            {audits.slice(0, 6).map((audit) => (
              <Row
                key={audit.id}
                title={`${audit.campus_name || "Platform"} audit #${audit.id}`}
                detail={`${audit.summary.passed}/${audit.summary.total} checks passed`}
                status={audit.status}
              />
            ))}
            {audits.length === 0 && <EmptyState label="No production audits found." />}
          </div>
        </div>
      )}
    </section>
  );
}
