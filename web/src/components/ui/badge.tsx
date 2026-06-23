import type { ReactNode } from "react";

type Variant = "success" | "warning" | "danger" | "info" | "neutral" | "purple";

const variants: Record<Variant, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-rose-50 text-rose-700 border-rose-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  neutral: "bg-slate-50 text-slate-700 border-slate-200",
  purple: "bg-slate-50 text-slate-700 border-slate-200",
};

export function Badge({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold capitalize ${variants[variant]}`}
    >
      {children}
    </span>
  );
}

export function statusBadge(status: string): Variant {
  const map: Record<string, Variant> = {
    active: "success",
    present: "success",
    paid: "success",
    inactive: "neutral",
    absent: "danger",
    overdue: "danger",
    late: "warning",
    half_day: "warning",
    on_duty: "info",
    partial: "warning",
    pending: "info",
    issued: "info",
    excused: "purple",
    alumni: "purple",
    draft: "neutral",
    closed: "neutral",
    blocked: "danger",
  };
  return map[status] ?? "neutral";
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}
