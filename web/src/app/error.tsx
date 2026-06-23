"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const [errorCode, setErrorCode] = useState<string>("");
  const [errorDetails, setErrorDetails] = useState<string>("");

  useEffect(() => {
    const digest = (error as Error & { digest?: string })?.digest;
    if (digest) setErrorCode(`ERR-${digest.slice(0, 8)}`);
    const msg = error?.message;
    if (msg && msg !== "Something went wrong") setErrorDetails(msg);
  }, [error]);

  return (
    <main className="modern-shell flex min-h-screen items-center justify-center px-4 py-8">
      <section className="surface w-full max-w-lg p-6 text-center animate-fade-up">
        <div className="flex justify-center">
          <BrandLogo />
        </div>
        <div className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-50 to-red-50 text-red-600 shadow-sm ring-1 ring-red-100">
          <AlertTriangle size={24} />
        </div>
        <h1 className="display-font mt-5 text-2xl font-bold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          The workspace could not render this view. Your session and data are protected.
        </p>
        {errorDetails && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-mono text-muted break-all">
            {errorDetails}
          </p>
        )}
        {errorCode && (
          <p className="mt-2 text-xs text-muted">Reference: {errorCode}</p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-ink/90 hover:shadow-md active:scale-[0.97]"
          >
            <RefreshCcw size={14} />
            Reload view
          </button>
        </div>
      </section>
    </main>
  );
}
