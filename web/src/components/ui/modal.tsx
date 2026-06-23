"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizes = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-5xl",
};

export function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className={`relative max-h-[calc(100dvh-1rem)] w-full overflow-hidden ${sizes[size]} rounded-lg border border-line/70 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]`}
        style={{ animation: "modal-in 0.18s ease-out both" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line/60 bg-slate-50/70 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="display-font text-lg font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-line/70 text-muted transition hover:bg-slate-50 hover:text-ink"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto px-4 py-4 sm:max-h-[calc(100dvh-7rem)] sm:px-6 sm:py-5">{children}</div>
      </div>
    </div>
  );
}
