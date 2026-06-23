"use client";

import { useEffect, useMemo, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { Activity, ClipboardCopy, Cpu, Network, Save, Server, ShieldCheck } from "lucide-react";

import {
  ApiError,
  type AttendanceCaptureMethod,
  type AttendanceDevice,
  type AttendanceRS485Function,
  type Campus,
} from "@/lib/api";

export type AttendanceDeviceConfigurationPayload = Omit<
  AttendanceDevice,
  "id" | "campus_name" | "configured_by" | "configured_by_name" | "last_seen_at"
>;

const inputCls =
  "w-full rounded-lg border border-line/80 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

const DEFAULT_ATTENDANCE_HARDWARE_CONFIG = {
  name: "Main Gate Nialabs Terminal",
  device_code: "NIALABS-MAIN-01",
  device_type: "face_recognition" as AttendanceCaptureMethod,
  location: "Main gate",
  provider: "Nialabs",
  status: "active" as AttendanceDevice["status"],
  is_enabled_for_students: true,
  is_enabled_for_staff: true,
  server_required: true,
  use_domain_name: true,
  domain_name: "",
  server_ip: "",
  server_port: 7743,
  heartbeat_seconds: 3,
  server_approval_required: false,
  device_numeric_id: 1,
  local_port: 5005,
  baud_rate: 38400,
  rs485_function: "software" as AttendanceRS485Function,
};

type DeviceFormState = {
  campus: string;
  name: string;
  device_code: string;
  device_type: AttendanceCaptureMethod;
  location: string;
  provider: string;
  status: AttendanceDevice["status"];
  is_enabled_for_students: boolean;
  is_enabled_for_staff: boolean;
  server_required: boolean;
  use_domain_name: boolean;
  domain_name: string;
  server_ip: string;
  server_port: string;
  heartbeat_seconds: string;
  server_approval_required: boolean;
  device_numeric_id: string;
  local_port: string;
  baud_rate: string;
  rs485_function: AttendanceRS485Function;
};

function initialState(campuses: Campus[], device?: AttendanceDevice | null): DeviceFormState {
  const defaults = DEFAULT_ATTENDANCE_HARDWARE_CONFIG;
  return {
    campus: String(device?.campus ?? campuses[0]?.id ?? ""),
    name: device?.name ?? defaults.name,
    device_code: device?.device_code ?? defaults.device_code,
    device_type: device?.device_type ?? defaults.device_type,
    location: device?.location ?? defaults.location,
    provider: device?.provider ?? defaults.provider,
    status: device?.status ?? defaults.status,
    is_enabled_for_students: device?.is_enabled_for_students ?? defaults.is_enabled_for_students,
    is_enabled_for_staff: device?.is_enabled_for_staff ?? defaults.is_enabled_for_staff,
    server_required: device?.server_required ?? defaults.server_required,
    use_domain_name: device?.use_domain_name ?? defaults.use_domain_name,
    domain_name: device?.domain_name ?? defaults.domain_name,
    server_ip: device?.server_ip ?? defaults.server_ip,
    server_port: String(device?.server_port ?? defaults.server_port),
    heartbeat_seconds: String(device?.heartbeat_seconds ?? defaults.heartbeat_seconds),
    server_approval_required: device?.server_approval_required ?? defaults.server_approval_required,
    device_numeric_id: String(device?.device_numeric_id ?? defaults.device_numeric_id),
    local_port: String(device?.local_port ?? defaults.local_port),
    baud_rate: String(device?.baud_rate ?? defaults.baud_rate),
    rs485_function: device?.rs485_function ?? defaults.rs485_function,
  };
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function numberValue(value: string, fallback: number) {
  if (!value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function SectionHeader({
  icon: Icon,
  title,
  note,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  note?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-ink">
        <Icon size={17} />
      </div>
      <div>
        <h3 className="font-semibold text-ink">{title}</h3>
        {note && <p className="mt-1 text-xs leading-5 text-muted">{note}</p>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line/80 bg-white px-3.5 py-2 text-sm font-medium text-ink">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-blue-600"
      />
    </label>
  );
}

export function HardwareDeviceConfiguration({
  campuses,
  device,
  onSave,
  onCancel,
}: {
  campuses: Campus[];
  device?: AttendanceDevice | null;
  onSave: (data: AttendanceDeviceConfigurationPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(() => initialState(campuses, device));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setForm(initialState(campuses, device));
    setError("");
    setCopied(false);
  }, [campuses, device]);

  const setupSummary = useMemo(
    () =>
      [
        `Server Req: ${yesNo(form.server_required)}`,
        `Use domainNm: ${yesNo(form.use_domain_name)}`,
        `DomainNm: ${form.domain_name || "-"}`,
        `Server IP: ${form.server_ip || "-"}`,
        `SerPortNo: ${form.server_port || "-"}`,
        `Heartbeat: ${form.heartbeat_seconds || "-"}`,
        `Server approval: ${yesNo(form.server_approval_required)}`,
        `Device ID: ${form.device_numeric_id || "-"}`,
        `Port No: ${form.local_port || "-"}`,
        `Baudrate: ${form.baud_rate || "-"}`,
        `RS485 function: ${form.rs485_function}`,
      ].join("\n"),
    [form],
  );

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(setupSummary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard is not available in this browser.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!form.campus) {
        throw new Error("Select a campus before saving this device.");
      }

      await onSave({
        campus: Number(form.campus),
        name: form.name.trim(),
        device_code: form.device_code.trim(),
        device_type: form.device_type,
        location: form.location.trim(),
        provider: form.provider.trim(),
        status: form.status,
        is_enabled_for_students: form.is_enabled_for_students,
        is_enabled_for_staff: form.is_enabled_for_staff,
        server_required: form.server_required,
        use_domain_name: form.use_domain_name,
        domain_name: form.domain_name.trim(),
        server_ip: form.server_ip.trim(),
        server_port: numberValue(form.server_port, DEFAULT_ATTENDANCE_HARDWARE_CONFIG.server_port),
        heartbeat_seconds: numberValue(form.heartbeat_seconds, DEFAULT_ATTENDANCE_HARDWARE_CONFIG.heartbeat_seconds),
        server_approval_required: form.server_approval_required,
        device_numeric_id: numberValue(form.device_numeric_id, DEFAULT_ATTENDANCE_HARDWARE_CONFIG.device_numeric_id),
        local_port: numberValue(form.local_port, DEFAULT_ATTENDANCE_HARDWARE_CONFIG.local_port),
        baud_rate: numberValue(form.baud_rate, DEFAULT_ATTENDANCE_HARDWARE_CONFIG.baud_rate),
        rs485_function: form.rs485_function,
      });
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Device configuration save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="space-y-5">
          <section className="space-y-4 rounded-lg border border-line/70 bg-slate-50/50 p-4">
            <SectionHeader icon={Cpu} title="Device Profile" note="Campus hardware identity and attendance usage." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Campus">
                <select className={inputCls} value={form.campus} onChange={(event) => setForm((current) => ({ ...current, campus: event.target.value }))} required>
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>
                      {campus.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Device type">
                <select
                  className={inputCls}
                  value={form.device_type}
                  onChange={(event) => setForm((current) => ({ ...current, device_type: event.target.value as AttendanceCaptureMethod }))}
                >
                  <option value="face_recognition">Face Recognition</option>
                  <option value="fingerprint">Fingerprint</option>
                  <option value="card_scan">Card Scan</option>
                  <option value="manual">Manual Kiosk</option>
                </select>
              </Field>
              <Field label="Device name">
                <input className={inputCls} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </Field>
              <Field label="Device code">
                <input className={inputCls} value={form.device_code} onChange={(event) => setForm((current) => ({ ...current, device_code: event.target.value }))} required />
              </Field>
              <Field label="Location">
                <input className={inputCls} value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} />
              </Field>
              <Field label="Provider">
                <input className={inputCls} value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))} />
              </Field>
              <Field label="Status">
                <select className={inputCls} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as AttendanceDevice["status"] }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </Field>
              <div className="grid gap-2">
                <ToggleRow label="Enable students" checked={form.is_enabled_for_students} onChange={(checked) => setForm((current) => ({ ...current, is_enabled_for_students: checked }))} />
                <ToggleRow label="Enable staff" checked={form.is_enabled_for_staff} onChange={(checked) => setForm((current) => ({ ...current, is_enabled_for_staff: checked }))} />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-line/70 bg-white p-4">
            <SectionHeader icon={Server} title="Server Settings" note="Values aligned with the uploaded device server screens." />
            <div className="grid gap-4 sm:grid-cols-2">
              <ToggleRow label="Server Req" checked={form.server_required} onChange={(checked) => setForm((current) => ({ ...current, server_required: checked }))} />
              <ToggleRow label="Use domainNm" checked={form.use_domain_name} onChange={(checked) => setForm((current) => ({ ...current, use_domain_name: checked }))} />
              <Field label="DomainNm">
                <input className={inputCls} value={form.domain_name} onChange={(event) => setForm((current) => ({ ...current, domain_name: event.target.value }))} placeholder="device.example.com" />
              </Field>
              <Field label="Server IP">
                <input className={inputCls} value={form.server_ip} onChange={(event) => setForm((current) => ({ ...current, server_ip: event.target.value }))} placeholder="192.168.1.100" />
              </Field>
              <Field label="SerPortNo">
                <input type="number" min={1} max={65535} className={inputCls} value={form.server_port} onChange={(event) => setForm((current) => ({ ...current, server_port: event.target.value }))} />
              </Field>
              <Field label="Heartbeat">
                <input type="number" min={1} max={3600} className={inputCls} value={form.heartbeat_seconds} onChange={(event) => setForm((current) => ({ ...current, heartbeat_seconds: event.target.value }))} />
              </Field>
              <ToggleRow label="Server approval" checked={form.server_approval_required} onChange={(checked) => setForm((current) => ({ ...current, server_approval_required: checked }))} />
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-line/70 bg-white p-4">
            <SectionHeader icon={Network} title="Communication Settings" note="Values aligned with the uploaded communication screen." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Device ID">
                <input type="number" min={1} className={inputCls} value={form.device_numeric_id} onChange={(event) => setForm((current) => ({ ...current, device_numeric_id: event.target.value }))} />
              </Field>
              <Field label="Port No">
                <input type="number" min={1} max={65535} className={inputCls} value={form.local_port} onChange={(event) => setForm((current) => ({ ...current, local_port: event.target.value }))} />
              </Field>
              <Field label="Baudrate">
                <input type="number" min={1200} max={921600} className={inputCls} value={form.baud_rate} onChange={(event) => setForm((current) => ({ ...current, baud_rate: event.target.value }))} />
              </Field>
              <Field label="RS485 function">
                <select className={inputCls} value={form.rs485_function} onChange={(event) => setForm((current) => ({ ...current, rs485_function: event.target.value as AttendanceRS485Function }))}>
                  <option value="software">Software</option>
                  <option value="hardware">Hardware</option>
                  <option value="disabled">Disabled</option>
                </select>
              </Field>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-line/70 bg-slate-50 p-4">
            <SectionHeader icon={ShieldCheck} title="System Requirement" />
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Network</dt>
                <dd className="font-medium text-ink">TCP/IP</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Server</dt>
                <dd className="font-medium text-ink">{form.use_domain_name ? form.domain_name || "-" : form.server_ip || "-"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Server port</dt>
                <dd className="font-medium text-ink">{form.server_port || "-"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Device port</dt>
                <dd className="font-medium text-ink">{form.local_port || "-"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Heartbeat</dt>
                <dd className="font-medium text-ink">{form.heartbeat_seconds || "-"} sec</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Baudrate</dt>
                <dd className="font-medium text-ink">{form.baud_rate || "-"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-line/70 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <SectionHeader icon={Activity} title="Device Setup" />
              <button
                type="button"
                onClick={copySummary}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-line/70 text-muted hover:bg-slate-50 hover:text-ink"
                aria-label="Copy device setup"
              >
                <ClipboardCopy size={15} />
              </button>
            </div>
            <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-50">{setupSummary}</pre>
            {copied && <p className="mt-2 text-xs font-medium text-emerald-700">Copied</p>}
          </section>
        </aside>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-line/60 pt-4 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-lg border border-line/70 px-4 py-2 text-sm font-medium text-ink hover:bg-slate-50">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="flex items-center justify-center gap-2 rounded-lg bg-ink px-5 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 disabled:opacity-60">
          <Save size={14} />
          {busy ? "Saving..." : device ? "Update device" : "Save device"}
        </button>
      </div>
    </form>
  );
}
