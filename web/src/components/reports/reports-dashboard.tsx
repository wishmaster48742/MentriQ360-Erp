"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  ClipboardCheck,
  CreditCard,
  FileClock,
  GraduationCap,
  RefreshCcw,
  ReceiptText,
} from "lucide-react";

import { ApiError, auditApi, reportApi, type AuditEvent, type DashboardSummary } from "@/lib/api";
import { Badge, statusBadge } from "@/components/ui/badge";
import { WorkspacePlaceholder } from "@/components/ui/workspace-placeholder";

function money(value: string) {
  return Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function asArray<T>(value: T[] | { results?: T[] }): T[] {
  return Array.isArray(value) ? value : value.results ?? [];
}

function Metric({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="surface rounded-3xl p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink text-white">
          <Icon size={18} />
        </div>
      </div>
      <p className="display-font mt-3 text-3xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

export function ReportsDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [summaryRes, auditRes] = await Promise.all([reportApi.summary(), auditApi.list()]);
      setSummary(summaryRes);
      setAuditEvents(asArray(auditRes).slice(0, 10));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const attendanceRate = useMemo(() => {
    if (!summary || summary.attendance.total === 0) return 0;
    const present = summary.attendance.by_status.present ?? 0;
    return Math.round((present / summary.attendance.total) * 100);
  }, [summary]);

  if (loading) {
    return <WorkspacePlaceholder title="Reports" detail="Preparing analytics, audit activity, and summaries." />;
  }

  if (error || !summary) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error || "No report data available."}
        <button className="ml-2 underline" onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="surface p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="section-kicker">
            <BarChart3 size={14} />
            Reports
          </span>
          <h1 className="display-font mt-3 text-2xl font-semibold text-ink">Dashboard analytics</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Track institution health, collections, attendance patterns, and audit events from a role-scoped reporting view.
          </p>
        </div>
        <button type="button" onClick={load} className="flex items-center gap-2 rounded-lg border border-line/70 bg-white px-4 py-2 text-sm font-medium text-muted hover:bg-slate-50 hover:text-ink">
          <RefreshCcw size={14} />
          Refresh
        </button>
      </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Students" value={summary.students.total} note={`${summary.students.active} active`} icon={GraduationCap} />
        <Metric label="Attendance" value={`${attendanceRate}%`} note={`${summary.attendance.total} records`} icon={ClipboardCheck} />
        <Metric label="Collected" value={money(summary.fees.total_collected)} note="payment records included" icon={CreditCard} />
        <Metric label="Outstanding" value={money(summary.fees.total_outstanding)} note="unpaid receivables" icon={ReceiptText} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="surface overflow-hidden shadow-soft">
          <div className="flex items-center gap-2 border-b border-line/60 px-5 py-4">
            <BarChart3 size={18} className="text-teal-600" />
            <h2 className="font-semibold text-ink">Attendance by Section</h2>
          </div>
          <div className="divide-y divide-line/40">
            {summary.attendance.by_section.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">No attendance records yet.</p>
            ) : summary.attendance.by_section.map((row) => {
              const pct = row.total ? Math.round((row.present / row.total) * 100) : 0;
              return (
                <div key={row.section} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{row.label}</p>
                      <p className="text-xs text-muted">{row.present} present / {row.total} records</p>
                    </div>
                    <Badge variant={pct >= 75 ? "success" : pct >= 50 ? "warning" : "danger"}>{pct}%</Badge>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-blue-600" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="surface overflow-hidden shadow-soft">
          <div className="flex items-center gap-2 border-b border-line/60 px-5 py-4">
            <ReceiptText size={18} className="text-teal-600" />
            <h2 className="font-semibold text-ink">Fee Status</h2>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {(["pending", "partial", "paid", "overdue"] as const).map((status) => (
              <div key={status} className="rounded-2xl border border-line/70 bg-page p-4">
                <Badge variant={statusBadge(status)}>{status}</Badge>
                <p className="display-font mt-3 text-3xl font-bold text-ink">{summary.fees.by_status[status] ?? 0}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="surface overflow-hidden shadow-soft">
          <div className="flex items-center gap-2 border-b border-line/60 px-5 py-4">
            <Activity size={18} className="text-teal-600" />
            <h2 className="font-semibold text-ink">Recent Payments</h2>
          </div>
          <div className="divide-y divide-line/40">
            {summary.recent_payments.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">No payments recorded yet.</p>
            ) : summary.recent_payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="font-medium text-ink">{payment.student_name}</p>
                  <p className="text-xs text-muted">{payment.fee_title}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-emerald-700">{money(payment.amount_paid)}</p>
                  <p className="text-xs text-muted">{payment.paid_on}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="surface overflow-hidden shadow-soft">
          <div className="flex items-center gap-2 border-b border-line/60 px-5 py-4">
            <FileClock size={18} className="text-teal-600" />
            <h2 className="font-semibold text-ink">Audit Trail</h2>
          </div>
          <div className="divide-y divide-line/40">
            {auditEvents.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">No audit events yet.</p>
            ) : auditEvents.map((event) => (
              <div key={event.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{event.summary || `${event.action} ${event.entity_type}`}</p>
                    <p className="text-xs text-muted">{event.actor_name || "System"} - {event.created_at}</p>
                  </div>
                  <Badge variant="neutral">{event.action}</Badge>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
