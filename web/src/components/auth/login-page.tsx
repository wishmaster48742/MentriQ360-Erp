"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCcw,
  User,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ApiError, authApi, type CaptchaChallenge } from "@/lib/api";
import { BrandLogo } from "@/components/brand-logo";

const LOGIN_FEATURES = [
  { label: "Role access", value: "Super admin, school admin, account, teacher, student" },
  { label: "School suite", value: "Users, admissions, staff, fees, academics, reports" },
  { label: "Student portal", value: "Attendance, homework, results, fees, admit cards" },
];

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaChallenge, setCaptchaChallenge] = useState<CaptchaChallenge | null>(null);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showPasswordHelp, setShowPasswordHelp] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [apiRetryCount, setApiRetryCount] = useState(0);

  const loadCaptcha = useCallback(async (clearError = true) => {
    setCaptchaLoading(true);
    if (clearError) setError("");
    try {
      const challenge = await authApi.captcha();
      setCaptchaChallenge(challenge);
      setCaptcha("");
      setApiRetryCount(0);
    } catch (err) {
      console.error("[Mentriq360] Captcha load failed:", err);
      setCaptchaChallenge(null);
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Captcha could not be loaded. Check the server connection.");
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCaptcha(false);
  }, [loadCaptcha]);

  useEffect(() => {
    if (!captchaChallenge && !captchaLoading && apiRetryCount < 3) {
      const timer = setTimeout(() => {
        setApiRetryCount((c) => c + 1);
        void loadCaptcha(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [captchaChallenge, captchaLoading, apiRetryCount, loadCaptcha]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    if (!captchaChallenge) {
      setError("Captcha is not ready. Refresh the captcha and try again.");
      return;
    }
    if (!captcha.trim()) {
      setError("Enter the captcha code shown on the screen.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await login(username.trim(), password, captchaChallenge.challenge_id, captcha.trim());
    } catch (err) {
      console.error("[Mentriq360] Login failed:", err);
      let message = "Login failed. Please try again.";
      if (err instanceof ApiError) {
        const lower = err.message.toLowerCase();
        if (lower.includes("captcha")) {
          message = "Incorrect captcha. Please try again.";
        } else if (err.status === 403 || err.status === 401) {
          message = "Incorrect credentials. Please check your username and password.";
        } else {
          message = err.message;
        }
      } else if (err instanceof Error) {
        message = err.message;
      }
      setError(message);
      void loadCaptcha(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-frame">
        <aside className="login-hero" aria-label="MentriQ360 ERP overview">
          <div className="relative z-10 flex h-full flex-col gap-6 p-6 lg:p-8 xl:p-10">
            <div className="flex items-center gap-4">
              <BrandLogo size="lg" />
            </div>

            <div className="login-school-photo" aria-hidden="true">
              <Image
                src="/login-school-campus.jpg"
                alt=""
                fill
                priority
                sizes="(min-width: 1024px) 48vw, 0px"
                className="object-cover"
              />
            </div>

            <div className="max-w-2xl py-6">
              <span className="inline-flex rounded-md border border-blue-100 bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent-strong">
                Secure ERP login
              </span>
              <h1 className="mt-5 text-4xl font-bold leading-tight text-ink xl:text-5xl">
                One login for every campus workflow.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-muted">
                Manage admissions, attendance, academics, fees, reports, staff, documents, and student services from one responsive school ERP workspace.
              </p>
            </div>

            <div className="mt-auto grid gap-3 xl:grid-cols-3">
              {LOGIN_FEATURES.map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-line/70 bg-white/90 p-4 text-ink shadow-sm backdrop-blur">
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="login-panel-wrap">
          <form onSubmit={handleSubmit} className="login-card animate-fade-up" noValidate>
            {/* Header — logo + label */}
            <div className="mb-6 flex items-center justify-between gap-3 border-b border-line/70 pb-4">
              <BrandLogo />
              <p className="text-right text-xs leading-5 text-muted">
                MentriQ360 School ERP
                <span className="block font-semibold text-ink">Secure institutional access</span>
              </p>
            </div>

            <div className="mb-5">
              <p className="inline-flex rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-strong">
                Professional ERP login
              </p>
              <h1 className="mt-2 text-2xl font-bold text-ink">Sign in</h1>
              <p className="mt-1 text-sm leading-6 text-muted">Use the account assigned by your institution.</p>
            </div>

            {error && (
              <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <label htmlFor="login-username" className="block">
                <span className="mb-1.5 block text-sm font-semibold text-ink">User name</span>
                <span className="relative block">
                  <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    id="login-username"
                    type="text"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter user name"
                    className="w-full rounded-xl border border-line bg-white py-3.5 pl-10 pr-4 text-base text-ink outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </span>
              </label>

              <label htmlFor="login-password" className="block">
                <span className="mb-1.5 block text-sm font-semibold text-ink">Password</span>
                <span className="relative block">
                  <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    id="login-password"
                    type={showPwd ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full rounded-xl border border-line bg-white py-3.5 pl-10 pr-12 text-base text-ink outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-2.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-slate-50 hover:text-ink"
                    aria-label={showPwd ? "Hide password" : "Show password"}
                  >
                    {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>

              <div>
                <span className="mb-1.5 block text-sm font-semibold text-ink">Security check</span>
                <div className="flex items-stretch gap-2.5">
                  <div className="flex min-h-[3.25rem] flex-1 items-center gap-2 rounded-xl border border-line bg-slate-50 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void loadCaptcha()}
                      disabled={captchaLoading || busy}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-white hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Refresh security question"
                    >
                      <RefreshCcw size={17} />
                    </button>
                    {captchaChallenge?.question ? (
                      <span
                        aria-label={`Security question: ${captchaChallenge.question}`}
                        className="select-none font-mono text-lg font-bold tracking-wide text-ink"
                      >
                        {captchaChallenge.question}
                      </span>
                    ) : (
                      <span className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                        {captchaLoading ? "Loading…" : "Unavailable"}
                      </span>
                    )}
                  </div>
                  <label htmlFor="login-captcha" className="flex w-24 flex-col">
                    <span className="sr-only">Answer</span>
                    <input
                      id="login-captcha"
                      type="text"
                      inputMode="numeric"
                      value={captcha}
                      onChange={(e) => setCaptcha(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="Answer"
                      autoComplete="off"
                      maxLength={6}
                      className="h-full w-full rounded-xl border border-line bg-white px-3 py-3 text-base text-ink outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-line"
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => setShowPasswordHelp((open) => !open)}
                className="text-sm font-semibold text-accent hover:text-ink"
              >
                Forgot password?
              </button>
            </div>

            {showPasswordHelp && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
                <KeyRound size={15} className="mt-0.5 shrink-0" />
                <span>Contact the School Admin or Super Admin team to reset or rotate your user name or password.</span>
              </div>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={busy || captchaLoading || !captchaChallenge || !username || !password || !captcha}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-4 text-base font-semibold text-white shadow-md transition-all duration-200 hover:bg-red-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <RefreshCcw size={17} className="animate-spin" />
                  Signing in...
                </span>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={17} />
                </>
              )}
            </button>

            <div className="mt-4 hidden rounded-lg border border-line/70 bg-slate-50 p-3 text-xs leading-5 text-muted sm:block">
              Only authorized institution accounts can sign in. User names and passwords are issued by the Super Admin or School Admin.
            </div>

            {/* Mobile-only footer */}
            <p className="mt-4 text-center text-xs leading-5 text-muted sm:hidden">
              Use only authorized institution accounts.
            </p>
          </form>
        </section>
      </section>
    </main>
  );
}
