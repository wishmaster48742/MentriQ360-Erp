"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Filter,
  Mail,
  MessageCircle,
  RadioTower,
  RefreshCcw,
  Save,
  Search,
  Send,
  ServerCog,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";

import { Badge, statusBadge, statusLabel } from "@/components/ui/badge";
import {
  aiLogApi,
  attendanceDeviceApi,
  campusApi,
  communicationSettingApi,
  deviceSyncLogApi,
  messageTemplateApi,
  outboundMessageApi,
  realTimeApi,
  roleAiApi,
  type AILog,
  type AttendanceDevice,
  type CommunicationSetting,
  type DeviceSyncLog,
  type MessageChannel,
  type MessageTemplate,
  type OutboundMessage,
  type RealTimeEvent,
  type User,
} from "@/lib/api";

const inputCls =
  "w-full rounded-lg border border-line/80 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";
const buttonCls =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-line/70 bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-60";
const primaryButtonCls =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60";

type PanelTab = "events" | "ai" | "messages" | "hardware" | "security";
type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral" | "purple";

interface CampusOption {
  id: number;
  name: string;
  code?: string;
}

interface SettingForm {
  channel: MessageChannel;
  provider_name: string;
  sender_id: string;
  api_url: string;
  api_key: string;
  api_secret: string;
  smtp_host: string;
  smtp_port: string;
  smtp_username: string;
  smtp_password: string;
  whatsapp_phone_number_id: string;
  is_active: boolean;
}

const emptySettingForm: SettingForm = {
  channel: "email",
  provider_name: "",
  sender_id: "",
  api_url: "",
  api_key: "",
  api_secret: "",
  smtp_host: "",
  smtp_port: "",
  smtp_username: "",
  smtp_password: "",
  whatsapp_phone_number_id: "",
  is_active: true,
};

function asArray<T>(value: T[] | { results?: T[] }): T[] {
  return Array.isArray(value) ? value : value.results ?? [];
}

function labelize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function primaryCampusFor(user: User): CampusOption | null {
  const campus = user.campuses?.find((item) => item.is_primary) ?? user.campuses?.[0];
  if (campus) return { id: campus.id, name: campus.name, code: campus.code };
  if (user.school) return { id: user.school, name: user.school_name ?? "Assigned school", code: user.school_code };
  return null;
}

function parseVariables(value: string): Record<string, string> {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, line) => {
      const [key, ...rest] = line.split("=");
      if (key?.trim()) acc[key.trim()] = rest.join("=").trim();
      return acc;
    }, {});
}

function dateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function campusOptionsFromUser(user: User): CampusOption[] {
  const scoped = user.campuses?.map((campus) => ({ id: campus.id, name: campus.name, code: campus.code })) ?? [];
  const primary = primaryCampusFor(user);
  if (!primary) return scoped;
  if (scoped.some((campus) => campus.id === primary.id)) return scoped;
  return [primary, ...scoped];
}

function buildSettingForm(setting?: CommunicationSetting, previous?: SettingForm): SettingForm {
  if (!setting) return { ...emptySettingForm, channel: previous?.channel ?? "email" };
  return {
    ...emptySettingForm,
    channel: setting.channel,
    provider_name: setting.provider_name ?? "",
    sender_id: setting.sender_id ?? "",
    api_url: setting.api_url ?? "",
    smtp_host: setting.smtp_host ?? "",
    smtp_port: setting.smtp_port ? String(setting.smtp_port) : "",
    smtp_username: setting.smtp_username ?? "",
    whatsapp_phone_number_id: setting.whatsapp_phone_number_id ?? "",
    is_active: setting.is_active,
  };
}

function eventTone(event: RealTimeEvent): BadgeTone {
  if (String(event.event).toLowerCase().includes("failed")) return "danger";
  if (["feePaid", "receiptGenerated", "resultPublished", "attendanceMarked", "deviceSynced"].includes(String(event.event))) return "success";
  if (String(event.event).toLowerCase().includes("changed")) return "warning";
  return "info";
}

export function RealtimeAiCommunicationPanel({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<PanelTab>("events");
  const [campuses, setCampuses] = useState<CampusOption[]>(() => campusOptionsFromUser(user));
  const [selectedCampusId, setSelectedCampusId] = useState<number | null>(() => primaryCampusFor(user)?.id ?? null);
  const [events, setEvents] = useState<RealTimeEvent[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [aiLogs, setAiLogs] = useState<AILog[]>([]);
  const [aiFeature, setAiFeature] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [settings, setSettings] = useState<CommunicationSetting[]>([]);
  const [messages, setMessages] = useState<OutboundMessage[]>([]);
  const [settingForm, setSettingForm] = useState<SettingForm>(emptySettingForm);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateVariables, setTemplateVariables] = useState("studentName=\nschoolName=\nfeeAmount=\ndueDate=");
  const [renderedTemplate, setRenderedTemplate] = useState<{ subject: string; body: string } | null>(null);
  const [messageRecipient, setMessageRecipient] = useState("");
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [deviceLogs, setDeviceLogs] = useState<DeviceSyncLog[]>([]);
  const [busy, setBusy] = useState("");
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const canUseCommunication = user.role === "super_admin" || user.role === "school_admin" || user.role === "account";
  const canUseHardware = user.role !== "student";

  const tabs = useMemo(
    () => [
      { id: "events" as const, label: "Events", icon: RadioTower },
      { id: "ai" as const, label: "AI", icon: Sparkles },
      ...(canUseCommunication ? [{ id: "messages" as const, label: "Messages", icon: Mail }] : []),
      ...(canUseHardware ? [{ id: "hardware" as const, label: "Hardware", icon: ServerCog }] : []),
      { id: "security" as const, label: "Security", icon: ShieldCheck },
    ],
    [canUseCommunication, canUseHardware]
  );

  const selectedCampus = useMemo(
    () => campuses.find((campus) => campus.id === selectedCampusId) ?? campuses[0] ?? null,
    [campuses, selectedCampusId]
  );

  const selectedTemplate = useMemo(
    () => templates.find((template) => String(template.id) === selectedTemplateId) ?? templates[0] ?? null,
    [selectedTemplateId, templates]
  );

  const selectedDevice = useMemo(
    () => devices.find((device) => String(device.id) === selectedDeviceId) ?? devices[0] ?? null,
    [devices, selectedDeviceId]
  );

  const matchingSetting = useMemo(
    () => settings.find((setting) => setting.campus === selectedCampus?.id && setting.channel === settingForm.channel),
    [selectedCampus?.id, settingForm.channel, settings]
  );

  const filteredEvents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return events;
    return events.filter((event) => {
      const text = `${event.event} ${event.source} ${event.campus_name ?? ""} ${JSON.stringify(event.payload)}`.toLowerCase();
      return text.includes(term);
    });
  }, [events, search]);

  const load = useCallback(async () => {
    setError("");
    const [eventResponse, featureResponse, logResponse] = await Promise.all([
      realTimeApi.list({ limit: 60 }),
      roleAiApi.features(),
      aiLogApi.list(),
    ]);
    setEvents(eventResponse.events);
    setFeatures(featureResponse.features);
    setAiLogs(asArray(logResponse));

    if (canUseCommunication) {
      const [campusResponse, templateResponse, settingResponse, messageResponse] = await Promise.all([
        campusApi.list(),
        messageTemplateApi.list(),
        communicationSettingApi.list(),
        outboundMessageApi.list(),
      ]);
      const nextCampuses = asArray(campusResponse).map((campus) => ({ id: campus.id, name: campus.name, code: campus.code }));
      setCampuses(nextCampuses.length ? nextCampuses : campusOptionsFromUser(user));
      setTemplates(asArray(templateResponse));
      setSettings(asArray(settingResponse));
      setMessages(asArray(messageResponse));
    }

    if (canUseHardware) {
      const [deviceResponse, logResponse] = await Promise.all([
        attendanceDeviceApi.list(),
        deviceSyncLogApi.list(),
      ]);
      setDevices(asArray(deviceResponse));
      setDeviceLogs(asArray(logResponse));
    }
  }, [canUseCommunication, canUseHardware, user]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Phase 6 data could not be loaded."));
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      realTimeApi.list({ limit: 60 }).then((response) => setEvents(response.events)).catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!features.length) return;
    setAiFeature((current) => current || features[0]);
  }, [features]);

  useEffect(() => {
    if (!selectedCampusId && campuses[0]) setSelectedCampusId(campuses[0].id);
  }, [campuses, selectedCampusId]);

  useEffect(() => {
    if (!selectedTemplateId && templates[0]) setSelectedTemplateId(String(templates[0].id));
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (!selectedDeviceId && devices[0]) setSelectedDeviceId(String(devices[0].id));
  }, [devices, selectedDeviceId]);

  useEffect(() => {
    setSettingForm((current) => buildSettingForm(matchingSetting, current));
  }, [matchingSetting]);

  async function runAi(event: FormEvent) {
    event.preventDefault();
    if (!aiFeature) return;
    setBusy("ai");
    setError("");
    try {
      const log = await roleAiApi.run({
        feature: aiFeature,
        prompt: aiPrompt,
        campus: user.role === "super_admin" ? selectedCampus?.id ?? null : undefined,
      });
      setAiResult(log.response);
      setAiLogs((current) => [log, ...current.filter((item) => item.id !== log.id)]);
      setStatusText("AI log saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI tool failed.");
    } finally {
      setBusy("");
    }
  }

  async function refreshAll() {
    setBusy("refresh");
    try {
      await load();
      setStatusText("Updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setBusy("");
    }
  }

  async function seedTemplates() {
    if (!selectedCampus) return;
    setBusy("seed");
    setError("");
    try {
      const seeded = await messageTemplateApi.seedDefaults(selectedCampus.id);
      setTemplates(seeded);
      setStatusText("Templates updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Templates could not be seeded.");
    } finally {
      setBusy("");
    }
  }

  async function saveSetting(event: FormEvent) {
    event.preventDefault();
    if (!selectedCampus) return;
    setBusy("setting");
    setError("");
    const payload = {
      campus: selectedCampus.id,
      channel: settingForm.channel,
      provider_name: settingForm.provider_name,
      sender_id: settingForm.sender_id,
      api_url: settingForm.api_url,
      api_key: settingForm.api_key,
      api_secret: settingForm.api_secret,
      smtp_host: settingForm.smtp_host,
      smtp_port: settingForm.smtp_port ? Number(settingForm.smtp_port) : null,
      smtp_username: settingForm.smtp_username,
      smtp_password: settingForm.smtp_password,
      whatsapp_phone_number_id: settingForm.whatsapp_phone_number_id,
      is_active: settingForm.is_active,
    };
    try {
      const saved = matchingSetting
        ? await communicationSettingApi.update(matchingSetting.id, payload)
        : await communicationSettingApi.create(payload);
      setSettings((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSettingForm(buildSettingForm(saved));
      setStatusText("Communication setting saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Communication setting could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function testSetting() {
    if (!matchingSetting) {
      setError("Save the communication setting first.");
      return;
    }
    setBusy("test-setting");
    setError("");
    try {
      const message = await communicationSettingApi.test(matchingSetting.id, messageRecipient);
      setMessages((current) => [message, ...current.filter((item) => item.id !== message.id)]);
      setStatusText("Test message queued.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test message could not be queued.");
    } finally {
      setBusy("");
    }
  }

  async function renderTemplate() {
    if (!selectedTemplate) return;
    setBusy("render");
    setError("");
    try {
      const rendered = await messageTemplateApi.render(selectedTemplate.id, parseVariables(templateVariables));
      setRenderedTemplate({ subject: rendered.subject, body: rendered.body });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Template could not be rendered.");
    } finally {
      setBusy("");
    }
  }

  async function sendTemplate() {
    if (!selectedTemplate || !selectedCampus) return;
    setBusy("send-template");
    setError("");
    try {
      const message = await outboundMessageApi.sendTemplate({
        template: selectedTemplate.id,
        campus: selectedCampus.id,
        recipient: messageRecipient,
        variables: parseVariables(templateVariables),
      });
      setMessages((current) => [message, ...current.filter((item) => item.id !== message.id)]);
      setStatusText("Message queued.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message could not be queued.");
    } finally {
      setBusy("");
    }
  }

  async function checkDeviceStatus() {
    if (!selectedDevice) return;
    setBusy("device-status");
    setError("");
    try {
      const response = await attendanceDeviceApi.statusCheck(selectedDevice.id);
      setStatusText(`${selectedDevice.name}: ${statusLabel(response.status)} at ${dateTime(response.lastSeenAt)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Device status could not be checked.");
    } finally {
      setBusy("");
    }
  }

  async function logFailedSync() {
    if (!selectedDevice) return;
    setBusy("device-log");
    setError("");
    try {
      const log = await attendanceDeviceApi.addSyncLog(selectedDevice.id, {
        status: "failed",
        log_type: "manual_check",
        payload: { source: "phase6_panel" },
        error_message: "Manual sync check recorded from dashboard.",
      });
      setDeviceLogs((current) => [log, ...current.filter((item) => item.id !== log.id)]);
      setStatusText("Failed sync log recorded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed sync log could not be recorded.");
    } finally {
      setBusy("");
    }
  }

  async function retryDeviceSync() {
    if (!selectedDevice) return;
    setBusy("device-retry");
    setError("");
    try {
      const response = await attendanceDeviceApi.retryFailedSync(selectedDevice.id);
      setDeviceLogs((current) => [...response.logs, ...current.filter((item) => !response.logs.some((log) => log.id === item.id))]);
      setStatusText(`${response.retried} sync retry queued.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Device sync retry failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Phase 6</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">Realtime, AI, Communication, Security</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {campuses.length > 0 && user.role !== "student" && (
              <select
                className={`${inputCls} w-auto min-w-52`}
                value={selectedCampus?.id ?? ""}
                onChange={(event) => setSelectedCampusId(Number(event.target.value))}
                aria-label="School"
              >
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className={buttonCls} onClick={refreshAll} disabled={busy === "refresh"}>
              <RefreshCcw size={16} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Metric icon={RadioTower} label="Scoped Events" value={events.length} />
          <Metric icon={Bot} label="AI Tools" value={features.length} />
          <Metric icon={MessageCircle} label="Messages" value={messages.length} />
          <Metric icon={ServerCog} label="Devices" value={devices.length} />
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Phase 6 tools">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                activeTab === id ? "bg-ink text-white" : "border border-line/70 bg-white text-ink hover:bg-slate-50"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {(error || statusText) && (
          <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {error || statusText}
          </div>
        )}
      </div>

      {activeTab === "events" && (
        <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-muted" />
              <h3 className="text-lg font-semibold text-ink">Scoped Event Feed</h3>
            </div>
            <label className="relative block md:w-72">
              <Search className="pointer-events-none absolute left-3 top-2.5 text-muted" size={16} />
              <input className={`${inputCls} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events" />
            </label>
          </div>
          <div className="mt-4 divide-y divide-line/70 overflow-hidden rounded-lg border border-line/70">
            {filteredEvents.slice(0, 30).map((event) => (
              <article key={`${event.source}-${event.id}`} className="grid gap-3 bg-white p-3 md:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={eventTone(event)}>{labelize(String(event.event))}</Badge>
                    <span className="text-xs font-medium uppercase text-muted">{event.source}</span>
                    <span className="text-xs text-muted">{event.campus_name ?? `School ${event.campus}`}</span>
                  </div>
                  <p className="mt-2 truncate text-sm text-ink">{JSON.stringify(event.payload)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {event.rooms.slice(0, 4).map((room) => (
                      <span key={room} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {room}
                      </span>
                    ))}
                  </div>
                </div>
                <time className="text-xs text-muted">{dateTime(event.createdAt)}</time>
              </article>
            ))}
            {!filteredEvents.length && <EmptyState label="No scoped events" />}
          </div>
        </div>
      )}

      {activeTab === "ai" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <form onSubmit={runAi} className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-muted" />
              <h3 className="text-lg font-semibold text-ink">Role AI Tool</h3>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block text-sm font-medium text-ink">
                Tool
                <select className={`${inputCls} mt-1`} value={aiFeature} onChange={(event) => setAiFeature(event.target.value)} required>
                  {features.map((feature) => (
                    <option key={feature} value={feature}>
                      {labelize(feature)}
                    </option>
                  ))}
                </select>
              </label>
              {user.role === "super_admin" && selectedCampus && (
                <label className="block text-sm font-medium text-ink">
                  School
                  <select className={`${inputCls} mt-1`} value={selectedCampus.id} onChange={(event) => setSelectedCampusId(Number(event.target.value))}>
                    {campuses.map((campus) => (
                      <option key={campus.id} value={campus.id}>
                        {campus.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <label className="mt-3 block text-sm font-medium text-ink">
              Prompt
              <textarea className={`${inputCls} mt-1 min-h-32`} value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} />
            </label>
            <button type="submit" className={`${primaryButtonCls} mt-4`} disabled={busy === "ai" || !aiFeature}>
              <Sparkles size={16} />
              Run AI
            </button>
            {aiResult && (
              <div className="mt-4 rounded-lg border border-line/70 bg-slate-50 p-3 text-sm leading-6 text-ink">
                {aiResult}
              </div>
            )}
          </form>
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-ink">AI Logs</h3>
            <div className="mt-3 space-y-3">
              {aiLogs.slice(0, 6).map((log) => (
                <article key={log.id} className="rounded-lg border border-line/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="info">{labelize(log.feature)}</Badge>
                    <span className="text-xs text-muted">{dateTime(log.created_at)}</span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{log.response}</p>
                </article>
              ))}
              {!aiLogs.length && <EmptyState label="No AI logs" />}
            </div>
          </div>
        </div>
      )}

      {activeTab === "messages" && canUseCommunication && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="space-y-4">
            <form onSubmit={saveSetting} className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <Mail size={18} className="text-muted" />
                  <h3 className="text-lg font-semibold text-ink">Communication Setting</h3>
                </div>
                <button type="button" className={buttonCls} onClick={seedTemplates} disabled={busy === "seed" || !selectedCampus}>
                  <Filter size={16} />
                  Seed Templates
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="block text-sm font-medium text-ink">
                  Channel
                  <select className={`${inputCls} mt-1`} value={settingForm.channel} onChange={(event) => setSettingForm((current) => ({ ...current, channel: event.target.value as MessageChannel }))}>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </label>
                <label className="block text-sm font-medium text-ink">
                  Provider
                  <input className={`${inputCls} mt-1`} value={settingForm.provider_name} onChange={(event) => setSettingForm((current) => ({ ...current, provider_name: event.target.value }))} required />
                </label>
                <label className="block text-sm font-medium text-ink">
                  Sender
                  <input className={`${inputCls} mt-1`} value={settingForm.sender_id} onChange={(event) => setSettingForm((current) => ({ ...current, sender_id: event.target.value }))} />
                </label>
                <label className="block text-sm font-medium text-ink">
                  API URL
                  <input className={`${inputCls} mt-1`} value={settingForm.api_url} onChange={(event) => setSettingForm((current) => ({ ...current, api_url: event.target.value }))} />
                </label>
                <label className="block text-sm font-medium text-ink">
                  API Key
                  <input className={`${inputCls} mt-1`} type="password" value={settingForm.api_key} onChange={(event) => setSettingForm((current) => ({ ...current, api_key: event.target.value }))} />
                </label>
                <label className="block text-sm font-medium text-ink">
                  API Secret
                  <input className={`${inputCls} mt-1`} type="password" value={settingForm.api_secret} onChange={(event) => setSettingForm((current) => ({ ...current, api_secret: event.target.value }))} />
                </label>
                <label className="block text-sm font-medium text-ink">
                  SMTP Host
                  <input className={`${inputCls} mt-1`} value={settingForm.smtp_host} onChange={(event) => setSettingForm((current) => ({ ...current, smtp_host: event.target.value }))} />
                </label>
                <label className="block text-sm font-medium text-ink">
                  SMTP Port
                  <input className={`${inputCls} mt-1`} inputMode="numeric" value={settingForm.smtp_port} onChange={(event) => setSettingForm((current) => ({ ...current, smtp_port: event.target.value }))} />
                </label>
                <label className="block text-sm font-medium text-ink">
                  SMTP User
                  <input className={`${inputCls} mt-1`} value={settingForm.smtp_username} onChange={(event) => setSettingForm((current) => ({ ...current, smtp_username: event.target.value }))} />
                </label>
                <label className="block text-sm font-medium text-ink">
                  SMTP Password
                  <input className={`${inputCls} mt-1`} type="password" value={settingForm.smtp_password} onChange={(event) => setSettingForm((current) => ({ ...current, smtp_password: event.target.value }))} />
                </label>
                <label className="block text-sm font-medium text-ink">
                  WhatsApp Phone ID
                  <input className={`${inputCls} mt-1`} value={settingForm.whatsapp_phone_number_id} onChange={(event) => setSettingForm((current) => ({ ...current, whatsapp_phone_number_id: event.target.value }))} />
                </label>
                <label className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-ink">
                  <input type="checkbox" checked={settingForm.is_active} onChange={(event) => setSettingForm((current) => ({ ...current, is_active: event.target.checked }))} />
                  Active
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="submit" className={primaryButtonCls} disabled={busy === "setting" || !selectedCampus}>
                  <Save size={16} />
                  Save Setting
                </button>
                <button type="button" className={buttonCls} onClick={testSetting} disabled={busy === "test-setting"}>
                  <Send size={16} />
                  Send Test
                </button>
              </div>
            </form>

            <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
              <h3 className="text-lg font-semibold text-ink">Templates</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block text-sm font-medium text-ink">
                  Template
                  <select className={`${inputCls} mt-1`} value={selectedTemplate?.id ?? ""} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · {template.channel}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-ink">
                  Recipient
                  <input className={`${inputCls} mt-1`} value={messageRecipient} onChange={(event) => setMessageRecipient(event.target.value)} />
                </label>
              </div>
              <label className="mt-3 block text-sm font-medium text-ink">
                Variables
                <textarea className={`${inputCls} mt-1 min-h-28`} value={templateVariables} onChange={(event) => setTemplateVariables(event.target.value)} />
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={buttonCls} onClick={renderTemplate} disabled={busy === "render" || !selectedTemplate}>
                  <CheckCircle2 size={16} />
                  Render
                </button>
                <button type="button" className={primaryButtonCls} onClick={sendTemplate} disabled={busy === "send-template" || !selectedTemplate}>
                  <Send size={16} />
                  Send Template
                </button>
              </div>
              {renderedTemplate && (
                <div className="mt-4 rounded-lg border border-line/70 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-ink">{renderedTemplate.subject}</p>
                  <p className="mt-2 text-sm leading-6 text-muted">{renderedTemplate.body}</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-ink">Queued Messages</h3>
            <div className="mt-3 space-y-3">
              {messages.slice(0, 8).map((message) => (
                <article key={message.id} className="rounded-lg border border-line/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={statusBadge(message.status)}>{statusLabel(message.status)}</Badge>
                    <span className="text-xs text-muted">{message.channel}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink">{message.subject || message.template_name || message.recipient}</p>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{message.body}</p>
                </article>
              ))}
              {!messages.length && <EmptyState label="No messages" />}
            </div>
          </div>
        </div>
      )}

      {activeTab === "hardware" && canUseHardware && (
        <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-ink">Devices</h3>
            <select className={`${inputCls} mt-4`} value={selectedDevice?.id ?? ""} onChange={(event) => setSelectedDeviceId(event.target.value)}>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name} · {device.device_code}
                </option>
              ))}
            </select>
            {selectedDevice && (
              <div className="mt-4 space-y-2 rounded-lg border border-line/70 bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-ink">{selectedDevice.name}</p>
                <p className="text-muted">{selectedDevice.location || selectedDevice.provider || selectedDevice.device_type}</p>
                <Badge variant={statusBadge(selectedDevice.status)}>{statusLabel(selectedDevice.status)}</Badge>
              </div>
            )}
            <div className="mt-4 grid gap-2">
              <button type="button" className={buttonCls} onClick={checkDeviceStatus} disabled={!selectedDevice || busy === "device-status"}>
                <Activity size={16} />
                Check Status
              </button>
              <button type="button" className={buttonCls} onClick={logFailedSync} disabled={!selectedDevice || busy === "device-log"}>
                <Smartphone size={16} />
                Log Failed Sync
              </button>
              <button type="button" className={primaryButtonCls} onClick={retryDeviceSync} disabled={!selectedDevice || busy === "device-retry"}>
                <RefreshCcw size={16} />
                Retry Failed Sync
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-ink">Sync Logs</h3>
            <div className="mt-4 divide-y divide-line/70 overflow-hidden rounded-lg border border-line/70">
              {deviceLogs
                .filter((log) => !selectedDevice || log.device === selectedDevice.id)
                .slice(0, 20)
                .map((log) => (
                  <article key={log.id} className="grid gap-2 bg-white p-3 md:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusBadge(log.status)}>{statusLabel(log.status)}</Badge>
                        <span className="text-sm font-semibold text-ink">{log.device_name ?? log.device_code}</span>
                        <span className="text-xs text-muted">{log.log_type}</span>
                      </div>
                      {log.error_message && <p className="mt-2 text-sm text-rose-700">{log.error_message}</p>}
                    </div>
                    <span className="text-xs text-muted">{dateTime(log.synced_at ?? log.created_at)}</span>
                  </article>
                ))}
              {!deviceLogs.length && <EmptyState label="No sync logs" />}
            </div>
          </div>
        </div>
      )}

      {activeTab === "security" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SecurityTile label="RBAC" value={user.role} />
          <SecurityTile label="Tenant Scope" value={selectedCampus?.name ?? user.school_name ?? "User scope"} />
          <SecurityTile label="Event Rooms" value={`${events.reduce((count, event) => count + event.rooms.length, 0)} scoped`} />
          <SecurityTile label="Audit Coverage" value={`${aiLogs.length + messages.length + deviceLogs.length} records`} />
        </div>
      )}
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-line/70 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
        <Icon size={16} className="text-muted" />
      </div>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="bg-white p-5 text-center text-sm text-muted">{label}</div>;
}

function SecurityTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted">
        <ShieldCheck size={17} />
        <span className="text-xs font-semibold uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="mt-3 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}
