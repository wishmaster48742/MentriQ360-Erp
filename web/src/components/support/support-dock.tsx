"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LifeBuoy,
  MessageSquareWarning,
  Send,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { ApiError, supportTicketApi, type SupportTicket, type SupportTicketPriority } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const SUPPORT_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "login", label: "Login" },
  { value: "attendance", label: "Attendance" },
  { value: "fees", label: "Fees" },
  { value: "student_portal", label: "Student portal" },
  { value: "technical", label: "Technical" },
];

const PRIORITIES: { value: SupportTicketPriority; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function ticketTone(priority: SupportTicketPriority) {
  if (priority === "urgent") return "border-rose-200 bg-rose-50 text-rose-700";
  if (priority === "high") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function statusIcon(status: SupportTicket["status"]) {
  if (status === "resolved") return CheckCircle2;
  if (status === "in_progress") return Wrench;
  return Clock3;
}

export function SupportDock() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState<SupportTicketPriority>("normal");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);

  const primaryCampus = user?.campuses?.find((campus) => campus.is_primary) ?? user?.campuses?.[0];
  const isSuperAdmin = user?.role === "super_admin";
  const openTickets = useMemo(() => tickets.filter((ticket) => ticket.status !== "resolved"), [tickets]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supportTicketApi
      .list(isSuperAdmin ? { status: "open" } : undefined)
      .then((data) => {
        if (active) setTickets(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Unable to load support requests.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isSuperAdmin]);

  useEffect(() => {
    function openSupport() {
      setPanelOpen(true);
    }

    window.addEventListener("mentriq360-open-support", openSupport);
    return () => window.removeEventListener("mentriq360-open-support", openSupport);
  }, []);

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const created = await supportTicketApi.create({
        campus: primaryCampus?.id ?? null,
        subject: subject.trim(),
        message: message.trim(),
        category,
        priority,
      });
      setTickets((current) => [created, ...current]);
      setSubject("");
      setCategory("general");
      setPriority("normal");
      setMessage("");
      setSuccess("Your request has been sent to the super admin team.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Support request could not be sent.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateTicket(ticket: SupportTicket, status: SupportTicket["status"]) {
    setError("");
    try {
      const updated = await supportTicketApi.update(ticket.id, { status });
      setTickets((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Support ticket could not be updated.");
    }
  }

  if (!user) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 flex flex-col items-end sm:inset-x-auto sm:right-4 sm:w-[min(44rem,calc(100vw-2rem))]">
      {panelOpen && (
        <section id="erp-support-panel" className="mb-3 w-full overflow-hidden rounded-lg border border-line/70 bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-line/70 bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <LifeBuoy size={16} />
                ERP Support
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Send a problem or message to the super admin team.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line/70 bg-white text-muted hover:text-ink"
              aria-label="Close support"
            >
              <X size={16} />
            </button>
          </div>
          <div className="max-h-[calc(100dvh-8.5rem)] overflow-y-auto">
          <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="border-b border-line/70 bg-slate-50/80 p-5 lg:border-b-0 lg:border-r">
              <span className="section-kicker">
                <LifeBuoy size={14} />
                ERP support
              </span>
              <h2 className="mt-4 text-xl font-semibold text-ink">
                {isSuperAdmin ? "User issues sent to super admin" : "Send a query or problem"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {isSuperAdmin
                  ? `${openTickets.length} open request${openTickets.length === 1 ? "" : "s"} need review.`
                  : "Your message will be visible to the super admin support queue."}
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {[
                  { label: "Campus", value: isSuperAdmin ? "Network" : primaryCampus?.code ?? "Unassigned", icon: ShieldCheck },
                  { label: "Open", value: openTickets.length, icon: MessageSquareWarning },
                  { label: "Status", value: loading ? "Syncing" : "Ready", icon: CheckCircle2 },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-line/70 bg-white px-4 py-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
                    </div>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-ink">
                      <Icon size={16} />
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5">
              {error && (
                <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {success}
                </div>
              )}

              {isSuperAdmin && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Issue queue</p>
                      <h3 className="mt-1 text-lg font-semibold text-ink">Latest open requests</h3>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {tickets.length === 0 && !loading ? (
                      <div className="rounded-lg border border-line/70 bg-slate-50 px-4 py-6 text-center text-sm text-muted">
                        No open support requests.
                      </div>
                    ) : (
                      tickets.slice(0, 5).map((ticket) => {
                        const StatusIcon = statusIcon(ticket.status);
                        return (
                          <article key={ticket.id} className="rounded-lg border border-line/70 bg-white p-4 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${ticketTone(ticket.priority)}`}>
                                    {ticket.priority}
                                  </span>
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line/70 bg-slate-50 px-2.5 py-1 text-xs font-semibold capitalize text-muted">
                                    <StatusIcon size={13} />
                                    {ticket.status.replace("_", " ")}
                                  </span>
                                </div>
                                <h4 className="mt-3 text-sm font-semibold text-ink">{ticket.subject}</h4>
                                <p className="mt-1 text-sm leading-6 text-muted">{ticket.message}</p>
                                <p className="mt-2 text-xs text-muted">
                                  {ticket.created_by_name} - {ticket.campus_name || "No campus"} - {ticket.category.replace("_", " ")}
                                </p>
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateTicket(ticket, "in_progress")}
                                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line/70 bg-white px-3 text-xs font-semibold text-ink hover:bg-slate-50"
                                >
                                  <Wrench size={14} />
                                  Review
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateTicket(ticket, "resolved")}
                                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-3 text-xs font-semibold text-white hover:bg-slate-900"
                                >
                                  <CheckCircle2 size={14} />
                                  Resolve
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

                <form onSubmit={submitTicket} className={`grid gap-4 ${isSuperAdmin ? "mt-5 border-t border-line/60 pt-5" : ""}`}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor="support-subject" className="block text-sm font-medium text-ink">Subject</label>
                      <input
                        id="support-subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        maxLength={160}
                        className="mt-1.5 w-full rounded-lg border border-line/80 bg-white px-3 py-2.5 text-sm text-ink outline-none"
                        placeholder="Short issue title"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="support-category" className="block text-sm font-medium text-ink">Category</label>
                        <select
                          id="support-category"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="mt-1.5 w-full rounded-lg border border-line/80 bg-white px-3 py-2.5 text-sm text-ink outline-none"
                        >
                          {SUPPORT_CATEGORIES.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="support-priority" className="block text-sm font-medium text-ink">Priority</label>
                        <select
                          id="support-priority"
                          value={priority}
                          onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}
                          className="mt-1.5 w-full rounded-lg border border-line/80 bg-white px-3 py-2.5 text-sm text-ink outline-none"
                        >
                          {PRIORITIES.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="support-message" className="block text-sm font-medium text-ink">Message</label>
                    <textarea
                      id="support-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={4}
                      className="mt-1.5 w-full resize-none rounded-lg border border-line/80 bg-white px-3 py-2.5 text-sm leading-6 text-ink outline-none"
                      placeholder="Describe the query or problem"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-2 text-xs text-muted">
                      <AlertTriangle size={14} />
                      {primaryCampus?.name ?? "Campus will be detected from your account."}
                    </p>
                    <button
                      type="submit"
                      disabled={submitting || !subject.trim() || !message.trim()}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Send size={16} />
                      {submitting ? "Sending..." : "Send to super admin"}
                    </button>
                  </div>
                </form>
            </div>
          </div>
        </div>
      </section>
      )}

      <button
        type="button"
        onClick={() => setPanelOpen((open) => !open)}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line/70 bg-ink px-4 text-sm font-semibold text-white shadow-2xl hover:bg-slate-900"
        aria-expanded={panelOpen}
        aria-controls="erp-support-panel"
      >
        <LifeBuoy size={18} />
        Support
        {openTickets.length > 0 && (
          <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-white/30">
            {openTickets.length}
          </span>
        )}
      </button>
    </div>
  );
}
