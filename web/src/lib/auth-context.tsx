"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  authApi,
  clearTokens,
  getActiveTenantCampusCode,
  getRefresh,
  hasTokens,
  SESSION_EXPIRED_EVENT,
  storeTokens,
  storeTenantCampusCode,
  type User,
  type UserRole,
} from "./api";

const LAST_ACTIVITY_KEY = "erp_last_activity";
const IDLE_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_MINUTES ?? "30") * 60 * 1000;
const SESSION_VALIDATE_MS = Number(process.env.NEXT_PUBLIC_SESSION_VALIDATE_SECONDS ?? "300") * 1000;
const ACTIVITY_EVENTS = ["click", "keydown", "mousemove", "pointerdown", "scroll", "touchstart"];

function markActivity() {
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

function isIdleExpired() {
  const storedActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
  if (!storedActivity) return true;

  const lastActivity = Number(storedActivity);
  if (!Number.isFinite(lastActivity)) return true;

  return Date.now() - lastActivity >= IDLE_TIMEOUT_MS;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, captchaId: string, captchaAnswer: string, campusCode?: string) => Promise<void>;
  logout: () => void;
  isRole: (...roles: UserRole[]) => boolean;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  // Bootstrap from stored token on page load
  useEffect(() => {
    if (!hasTokens()) return;
    setLoading(true);
    if (isIdleExpired()) {
      clearTokens();
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then((currentUser) => {
        setUser(currentUser);
        markActivity();
      })
      .catch(() => {
        clearTokens();
        localStorage.removeItem(LAST_ACTIVITY_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string, captchaId: string, captchaAnswer: string, campusCode = "") => {
    const data = await authApi.login(username, password, captchaId, captchaAnswer, campusCode);
    const activeTenant = campusCode || getActiveTenantCampusCode();
    storeTokens(data.access, data.refresh);
    storeTenantCampusCode(activeTenant);
    markActivity();
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    const refresh = getRefresh();
    // Blacklist the refresh token server-side before clearing local storage so
    // the Authorization header is still valid when the request is sent.
    if (refresh) {
      authApi.logout(refresh).catch(() => {});
    }
    clearTokens();
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    function expireSession() {
      clearTokens();
      setUser(null);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      setLoading(false);
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
  }, []);

  useEffect(() => {
    if (!user) return;

    const recordActivity = () => markActivity();
    const expireIfIdle = () => {
      if (isIdleExpired()) logout();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") expireIfIdle();
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_KEY && event.newValue === null) {
        logout();
      }
    };

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", expireIfIdle);
    window.addEventListener("storage", handleStorageChange);

    const idleTimer = window.setInterval(expireIfIdle, 30_000);

    const validationTimer = window.setInterval(() => {
      if (isIdleExpired()) {
        logout();
        return;
      }
      authApi.me().then(setUser).catch(logout);
    }, SESSION_VALIDATE_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, recordActivity));
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", expireIfIdle);
      window.removeEventListener("storage", handleStorageChange);
      window.clearInterval(idleTimer);
      window.clearInterval(validationTimer);
    };
  }, [logout, user]);

  const isRole = useCallback(
    (...roles: UserRole[]) => !!user && roles.includes(user.role),
    [user]
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, isRole }),
    [user, loading, login, logout, isRole]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
