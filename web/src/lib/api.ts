/**
 * Mentriq360 typed API client
 * All backend calls go through this module so token management is centralised.
 */

const CONFIGURED_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const LOCAL_API_PORT = process.env.NEXT_PUBLIC_LOCAL_API_PORT ?? "8000";
const configuredTimeout = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS ?? "60000");
const REQUEST_TIMEOUT_MS = Number.isFinite(configuredTimeout) ? Math.max(configuredTimeout, 60000) : 60000;
export const SESSION_EXPIRED_EVENT = "mentriq360-session-expired";
const TENANT_CAMPUS_CODE_KEY = "erp_campus_code";
const DEFAULT_TENANT_CAMPUS_CODE = process.env.NEXT_PUBLIC_DEFAULT_TENANT_CODE ?? "";
const TENANT_DOMAIN_SUFFIX = process.env.NEXT_PUBLIC_TENANT_DOMAIN_SUFFIX ?? "";
const RESERVED_TENANT_HOSTS = new Set(["admin", "app", "erp", "login", "portal", "www"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

const UPLOAD_SIZE_LIMITS: Record<string, number> = {
  logo: 524288,
  banner: 1048576,
  photo: 2097152,
  document: 5242880,
  marks: 5242880,
  academic: 10485760,
};

export function assertFileSize(file: File, category: keyof typeof UPLOAD_SIZE_LIMITS): void {
  const limit = UPLOAD_SIZE_LIMITS[category];
  if (file.size > limit) {
    const mb = (limit / 1048576).toFixed(1);
    throw new ApiError(413, `File exceeds the ${mb} MB limit for ${category} uploads.`);
  }
}

export function assertFileSizeWithLimit(file: File, maxBytes: number, label: string): void {
  if (file.size > maxBytes) {
    const mb = (maxBytes / 1048576).toFixed(1);
    throw new ApiError(413, `File exceeds the ${mb} MB limit for ${label}.`);
  }
}

function localApiBase(hostname = "localhost") {
  const host = hostname === "[::1]" || hostname === "::1" ? "[::1]" : hostname;
  return `http://${host}:${LOCAL_API_PORT}/api/v1`;
}

function configuredApiBase() {
  const configuredBase = CONFIGURED_API_BASE?.trim();
  return configuredBase ? trimTrailingSlash(configuredBase) : "";
}

function getApiBase() {
  const configuredBase = configuredApiBase();
  if (configuredBase) return configuredBase;
  if (typeof window === "undefined") {
    if (process.env.NODE_ENV !== "production") return localApiBase();
    console.warn("[Mentriq360] NEXT_PUBLIC_API_BASE_URL is not set. Falling back to relative path /api/v1. Set this environment variable in Vercel and redeploy.");
    return "/api/v1";
  }

  try {
    const pageHost = window.location.hostname;
    if (LOOPBACK_HOSTS.has(pageHost)) return localApiBase(pageHost);
    if (window.location.protocol === "http:" && window.location.port) {
      return localApiBase(pageHost);
    }
    console.warn("[Mentriq360] NEXT_PUBLIC_API_BASE_URL is not set. Falling back to relative path /api/v1. Set this environment variable in Vercel and redeploy.");
    return "/api/v1";
  } catch {
    if (process.env.NODE_ENV !== "production") return localApiBase();
    console.warn("[Mentriq360] NEXT_PUBLIC_API_BASE_URL is not set. Falling back to relative path /api/v1. Set this environment variable in Vercel and redeploy.");
    return "/api/v1";
  }
}

function getAuthBase() {
  return `${getApiBase()}/auth`;
}

function isResolvedApiPath(path: string) {
  return path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/api/");
}

// ─── Token helpers ────────────────────────────────────────────────────────────
function getAccess() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("erp_access");
}
export function getRefresh() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("erp_refresh");
}
export function storeTokens(access: string, refresh: string) {
  localStorage.setItem("erp_access", access);
  localStorage.setItem("erp_refresh", refresh);
}
export function clearTokens() {
  localStorage.removeItem("erp_access");
  localStorage.removeItem("erp_refresh");
  localStorage.removeItem(TENANT_CAMPUS_CODE_KEY);
}
export function hasTokens() {
  return !!getAccess();
}

function normalizeCampusCode(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "").toUpperCase();
}

function tenantCodeFromHost(hostname: string) {
  const suffix = TENANT_DOMAIN_SUFFIX.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!suffix) return "";

  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host || LOOPBACK_HOSTS.has(host) || !host.endsWith(`.${suffix}`)) return "";

  const tenantHost = host.slice(0, -(suffix.length + 1)).split(".").filter(Boolean).pop() ?? "";
  if (!tenantHost || RESERVED_TENANT_HOSTS.has(tenantHost)) return "";
  return normalizeCampusCode(tenantHost);
}

function tenantCodeFromUrl() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return normalizeCampusCode(params.get("campus_code") ?? params.get("campus") ?? params.get("tenant") ?? "");
}

export function getActiveTenantCampusCode() {
  const fallback = normalizeCampusCode(DEFAULT_TENANT_CAMPUS_CODE);
  if (typeof window === "undefined") return fallback;

  const stored = normalizeCampusCode(localStorage.getItem(TENANT_CAMPUS_CODE_KEY) ?? "");
  if (stored) return stored;

  const urlTenant = tenantCodeFromUrl();
  if (urlTenant) return urlTenant;

  return tenantCodeFromHost(window.location.hostname) || fallback;
}

function getTenantCampusCode() {
  return getActiveTenantCampusCode();
}

export function storeTenantCampusCode(campusCode: string) {
  const cleaned = normalizeCampusCode(campusCode);
  if (cleaned) localStorage.setItem(TENANT_CAMPUS_CODE_KEY, cleaned);
  else localStorage.removeItem(TENANT_CAMPUS_CODE_KEY);
}

function notifySessionExpired() {
  clearTokens();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  const refresh = getRefresh();
  if (!refresh) return null;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${getAuthBase()}/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (!res.ok) { clearTokens(); return null; }
      const data = await res.json();
      storeTokens(data.access, refresh);
      return data.access;
    } catch {
      clearTokens();
      return null;
    }
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retried = false
): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };
  const token = getAccess();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const campusCode = getTenantCampusCode();
  if (campusCode && !headers["X-Campus-Code"]) headers["X-Campus-Code"] = campusCode;

  const url = isResolvedApiPath(path) ? path : `${getApiBase()}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Request timed out. Please check the network and try again.");
    }
    throw new ApiError(0, "Cannot reach the Mentriq360 API. Make sure the backend server is running and reachable from this device.");
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401 && !retried) {
    const newToken = await refreshAccessToken();
    if (newToken) return apiFetch<T>(path, options, true);
    notifySessionExpired();
    throw new ApiError(401, "Session expired. Please log in again.");
  }

  if (res.status === 401) {
    notifySessionExpired();
    throw new ApiError(401, "Session expired. Please log in again.");
  }

  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json();
      if (typeof err.detail === "string") {
        detail = err.detail;
      } else if (Array.isArray(err.non_field_errors) && typeof err.non_field_errors[0] === "string") {
        detail = err.non_field_errors[0];
      } else if (err && typeof err === "object") {
        const firstField = Object.values(err).find((v) => Array.isArray(v) && typeof (v as string[])[0] === "string") as string[] | undefined;
        if (firstField) detail = firstField[0];
      }
    } catch { /* ignore */ }
    if (res.status >= 500) {
      throw new ApiError(res.status, "Something went wrong. Please try again later.");
    }
    if (res.status === 429) {
      throw new ApiError(res.status, "Too many requests. Please wait a moment and try again.");
    }
    throw new ApiError(res.status, detail || "An unexpected error occurred. Please try again.");
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ApiError(res.status, "The API returned an invalid response. Check the deployed API URL and backend server.");
  }

  return res.json() as Promise<T>;
}

async function apiDownload(path: string, options: RequestInit = {}, retried = false): Promise<Blob> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  const token = getAccess();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const campusCode = getTenantCampusCode();
  if (campusCode && !headers["X-Campus-Code"]) headers["X-Campus-Code"] = campusCode;

  const url = isResolvedApiPath(path) ? path : `${getApiBase()}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Request timed out. Please check the network and try again.");
    }
    throw new ApiError(0, "Cannot reach the Mentriq360 API. Make sure the backend server is running and reachable from this device.");
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401 && !retried) {
    const newToken = await refreshAccessToken();
    if (newToken) return apiDownload(path, options, true);
    notifySessionExpired();
    throw new ApiError(401, "Session expired. Please log in again.");
  }

  if (res.status === 401) {
    notifySessionExpired();
    throw new ApiError(401, "Session expired. Please log in again.");
  }

  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json();
      if (typeof err.detail === "string") {
        detail = err.detail;
      } else if (Array.isArray(err.non_field_errors) && typeof err.non_field_errors[0] === "string") {
        detail = err.non_field_errors[0];
      } else if (err && typeof err === "object") {
        const firstField = Object.values(err).find((v) => Array.isArray(v) && typeof (v as string[])[0] === "string") as string[] | undefined;
        if (firstField) detail = firstField[0];
      }
    } catch { /* ignore */ }
    if (res.status >= 500) {
      throw new ApiError(res.status, "Something went wrong. Please try again later.");
    }
    throw new ApiError(res.status, detail || "An unexpected error occurred. Please try again.");
  }

  return res.blob();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Type definitions ─────────────────────────────────────────────────────────
export type UserRole = "super_admin" | "school_admin" | "account" | "teacher" | "student";

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: UserRole;
  school: number | null;
  school_name?: string;
  school_code?: string;
  school_status?: string;
  phone_number: string;
  must_change_password: boolean;
  gender: string;
  date_of_birth: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  blood_group: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  qualification: string;
  profile_photo_url: string;
  bio: string;
  campuses?: UserCampusScope[];
  is_active: boolean;
}

export interface ERPUser extends User {
  must_change_password: boolean;
  is_staff: boolean;
  campuses?: UserCampusScope[];
  created_at: string;
  updated_at: string;
}

export interface LinkedStudent {
  id: number;
  admission_number: string;
  full_name: string;
  section: string;
  campus: string;
  status: string;
  date_of_birth: string;
  father_name: string;
  mother_name: string;
}

export interface LinkedStaff {
  id: number;
  employee_code: string;
  designation: string;
  department: string;
  employment_type: string;
  joining_date: string;
  qualification: string;
  campus: string;
  status: string;
}

export interface UserActivityEvent {
  action: string;
  entity_type: string;
  summary: string;
  created_at: string;
}

export interface UserDetail extends ERPUser {
  linked_student: LinkedStudent | null;
  linked_staff: LinkedStaff | null;
  recent_activity: UserActivityEvent[];
}

export interface UserCampusScope {
  id: number;
  name: string;
  code: string;
  logo_url?: string;
  logo_alt_text?: string;
  role: string;
  is_primary: boolean;
  can_manage_users?: boolean;
  can_configure_attendance?: boolean;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface CaptchaChallenge {
  challenge_id: string;
  question: string;   // arithmetic challenge shown to the user, e.g. "23 + 47 = ?"
  expires_in: number;
  expires_at: string;
}

export interface Campus {
  id: number;
  name: string;
  code: string;
  address: string;
  city?: string;
  state?: string;
  pincode?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  principal_name?: string;
  logo_url?: string;
  logo_alt_text?: string;
  banner_url?: string;
  status?: "active" | "inactive" | "suspended";
  subscription_plan?: string;
  subscription_status?: string;
  monthly_subscription_amount?: string;
  billing_due_date?: string | null;
  academic_year_label?: string;
  enabled_modules?: Record<string, boolean>;
  payment_gateway_settings?: Record<string, unknown>;
  messaging_settings?: Record<string, unknown>;
  attendance_hardware_settings?: Record<string, unknown>;
  created_by?: number | null;
  database_alias?: string;
  database_name?: string;
  created_at?: string;
  updated_at?: string;
}

export type SchoolStatus = "active" | "inactive" | "suspended";

export interface SchoolConnectionStatus {
  mode: "single_database" | "separate_database";
  alias: string;
  databaseName: string;
  configured: boolean;
  connected: boolean;
  detail: string;
}

export interface School {
  schoolId: number;
  schoolCode: string;
  schoolName: string;
  logo: string;
  bannerImage: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  contactNumber: string;
  email: string;
  website: string;
  principalName: string;
  status: SchoolStatus;
  subscriptionStatus: string;
  databaseName?: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
  totalStudents: number;
  totalTeachers: number;
  totalStaff: number;
  schoolAdmins: number;
  databaseConnectionStatus?: SchoolConnectionStatus;
}

export type SchoolPayload = Partial<Omit<School, "schoolId" | "createdAt" | "updatedAt" | "totalStudents" | "totalTeachers" | "totalStaff" | "schoolAdmins" | "databaseConnectionStatus">> & {
  schoolName: string;
  adminUsername?: string;
  adminEmail?: string;
  adminFirstName?: string;
  adminLastName?: string;
  adminContactNumber?: string;
  temporaryPassword?: string;
};

export interface SchoolAdminCredentials {
  id: number;
  username: string;
  email: string;
  temporaryPassword: string;
  mustChangePassword: boolean;
  schoolId?: number;
}

export interface SchoolCreateResponse extends School {
  adminUser?: SchoolAdminCredentials;
}

export type CampusMemberRole =
  | "it_admin"
  | "finance_admin"
  | "teacher"
  | "support";

export interface CampusMembership {
  id: number;
  campus: number;
  campus_name?: string;
  user: number;
  user_name?: string;
  user_role?: UserRole;
  role: CampusMemberRole;
  is_primary: boolean;
  can_manage_users: boolean;
  can_configure_attendance: boolean;
  created_at?: string;
  updated_at?: string;
}

export type AttendanceCaptureMethod = "manual" | "face_recognition" | "fingerprint" | "card_scan";
export type AttendanceDeviceStatus = "active" | "inactive" | "maintenance";
export type AttendanceRS485Function = "software" | "hardware" | "disabled";

export interface AttendanceDevice {
  id: number;
  campus: number;
  campus_name?: string;
  name: string;
  device_code: string;
  device_type: AttendanceCaptureMethod;
  location: string;
  provider: string;
  status: AttendanceDeviceStatus;
  is_enabled_for_students: boolean;
  is_enabled_for_staff: boolean;
  server_required: boolean;
  use_domain_name: boolean;
  domain_name: string;
  server_ip: string;
  server_port: number;
  heartbeat_seconds: number;
  server_approval_required: boolean;
  device_numeric_id: number;
  local_port: number;
  baud_rate: number;
  rs485_function: AttendanceRS485Function;
  last_seen_at: string | null;
  configured_by: number | null;
  configured_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export type DeviceSyncStatus = "success" | "failed" | "retrying";

export interface DeviceSyncLog {
  id: number;
  campus: number;
  campus_name?: string;
  device: number;
  device_name?: string;
  device_code?: string;
  status: DeviceSyncStatus;
  log_type: string;
  payload: Record<string, unknown>;
  error_message: string;
  attempt_count: number;
  synced_at: string | null;
  created_by: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AttendanceDeviceConnectionStatus {
  device: number;
  deviceCode: string;
  status: "online" | "offline";
  lastSeenAt: string | null;
  heartbeatWindowSeconds: number;
}

export interface AcademicSession {
  id: number;
  campus: number;
  campus_name?: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ClassSection {
  id: number;
  campus: number;
  campus_name?: string;
  session: number;
  grade_name: string;
  section_name: string;
  label?: string;
  class_teacher: number | null;
  class_teacher_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TeacherSubjectAllocation {
  id: number;
  campus: number;
  campus_name?: string;
  section: number;
  section_label?: string;
  teacher: number;
  teacher_name?: string;
  subject: string;
  weekly_periods: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type StudentStatus = "active" | "inactive" | "alumni";

export interface Student {
  id: number;
  campus: number;
  campus_name?: string;
  section: number;
  section_label?: string;
  user?: number | null;
  user_name?: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string;
  photo_url: string;
  father_name: string;
  mother_name: string;
  contact_email: string;
  phone_number: string;
  alternate_phone_number: string;
  address: string;
  blood_group: string;
  medical_notes: string;
  status: StudentStatus;
  created_at?: string;
  updated_at?: string;
}

export type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "on_duty";

export interface AttendanceRecord {
  id: number;
  student: number;
  student_name?: string;
  section: number;
  section_label?: string;
  date: string;
  subject: string;
  status: AttendanceStatus;
  marked_by: number | null;
  capture_method: AttendanceCaptureMethod;
  device: number | null;
  device_name?: string;
  source_reference: string;
  confidence_score: string | null;
  created_at: string;
  updated_at?: string;
}

export type StaffAttendanceStatus = "present" | "absent" | "late" | "half_day" | "on_leave";

export interface StaffAttendanceRecord {
  id: number;
  campus: number;
  campus_name?: string;
  staff_user: number;
  staff_name?: string;
  staff_role?: UserRole;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: StaffAttendanceStatus;
  capture_method: AttendanceCaptureMethod;
  device: number | null;
  device_name?: string;
  marked_by: number | null;
  marked_by_name?: string;
  source_reference: string;
  confidence_score: string | null;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export type StaffEmploymentType = "full_time" | "part_time" | "contract";
export type StaffProfileStatus = "active" | "inactive" | "exited";

export interface StaffProfile {
  id: number;
  campus: number;
  campus_name?: string;
  user: number;
  user_name?: string;
  user_role?: UserRole;
  employee_code: string;
  designation: string;
  department: string;
  photo_url: string;
  employment_type: StaffEmploymentType;
  joining_date: string;
  qualification: string;
  emergency_contact: string;
  status: StaffProfileStatus;
  created_at?: string;
  updated_at?: string;
}

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TimetableSlot {
  id: number;
  campus: number;
  campus_name?: string;
  section: number;
  section_label?: string;
  teacher: number | null;
  teacher_name?: string;
  subject: string;
  day_of_week: Weekday;
  day_name?: string;
  start_time: string;
  end_time: string;
  room: string;
  effective_from: string;
  effective_to: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Subject {
  id: number;
  campus: number;
  campus_name?: string;
  name: string;
  code: string;
  grade_name: string;
  description: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ExamType {
  id: number;
  campus: number;
  campus_name?: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ExamSubjectSetup {
  id: number;
  campus: number;
  campus_name?: string;
  exam_type: number;
  exam_type_name?: string;
  section: number;
  section_label?: string;
  subject: number;
  subject_name?: string;
  max_marks: string;
  pass_marks: string;
  weightage: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type ExamScheduleStatus = "draft" | "published" | "archived";

export interface ExamSchedule {
  id: number;
  campus: number;
  campus_name?: string;
  exam_type: number;
  exam_type_name?: string;
  section: number;
  section_label?: string;
  subject: number;
  subject_name?: string;
  title: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  max_marks: string;
  venue: string;
  instructions: string;
  status: ExamScheduleStatus;
  created_by: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export type LibraryBookStatus = "active" | "inactive" | "lost";
export type LibraryLoanStatus = "issued" | "returned" | "overdue";

export interface LibraryBook {
  id: number;
  campus: number;
  campus_name?: string;
  accession_number: string;
  title: string;
  author: string;
  isbn: string;
  category: string;
  total_copies: number;
  available_copies: number;
  shelf_location: string;
  status: LibraryBookStatus;
  created_at?: string;
  updated_at?: string;
}

export interface LibraryLoan {
  id: number;
  campus: number;
  campus_name?: string;
  book: number;
  book_title?: string;
  student: number | null;
  staff_user: number | null;
  borrower_name?: string;
  issued_on: string;
  due_on: string;
  returned_on: string | null;
  fine_amount: string;
  status: LibraryLoanStatus;
  created_at?: string;
  updated_at?: string;
}

export interface TransportRoute {
  id: number;
  campus: number;
  campus_name?: string;
  name: string;
  route_code: string;
  start_point: string;
  end_point: string;
  stops: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TransportVehicle {
  id: number;
  campus: number;
  campus_name?: string;
  route: number | null;
  route_name?: string;
  vehicle_number: string;
  driver_name: string;
  driver_phone: string;
  capacity: number;
  gps_device_id: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StudentTransportAssignment {
  id: number;
  student: number;
  student_name?: string;
  route: number;
  route_name?: string;
  vehicle: number | null;
  vehicle_number?: string;
  pickup_stop: string;
  drop_stop: string;
  start_date: string;
  end_date: string | null;
  fee_amount: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface HostelRoom {
  id: number;
  campus: number;
  campus_name?: string;
  hostel_name: string;
  room_number: string;
  floor: string;
  capacity: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface HostelAllocation {
  id: number;
  student: number;
  student_name?: string;
  room: number;
  room_label?: string;
  bed_number: string;
  start_date: string;
  end_date: string | null;
  fee_amount: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type AcademicWorkStatus = "draft" | "published" | "closed";

export interface AssignedWork {
  id: number;
  section: number;
  section_label?: string;
  assigned_by: number | null;
  assigned_by_name?: string;
  title: string;
  subject: string;
  description: string;
  due_date: string;
  status: AcademicWorkStatus;
  file_url?: string;
  file_name?: string;
  file_content_type?: string;
  published_on?: string | null;
  submission_count?: number;
  created_at?: string;
  updated_at?: string;
}

export type AssignmentSubmissionStatus = "pending" | "checked";

export interface AssignmentSubmission {
  id: number;
  assignment: number;
  assignment_title?: string;
  assignment_subject?: string;
  section_label?: string;
  student: number;
  student_name?: string;
  admission_number?: string;
  submitted_by: number | null;
  submitted_by_name?: string;
  file_url?: string;
  file_name?: string;
  file_content_type?: string;
  notes: string;
  status: AssignmentSubmissionStatus;
  remarks: string;
  checked_by: number | null;
  checked_by_name?: string;
  checked_at: string | null;
  submitted_at: string;
  created_at?: string;
  updated_at?: string;
}

export type ResourceType = "notes" | "syllabus" | "assignment_help" | "reference";

export interface LearningResource {
  id: number;
  section: number;
  section_label?: string;
  uploaded_by: number | null;
  uploaded_by_name?: string;
  title: string;
  subject: string;
  resource_type: ResourceType;
  description: string;
  file_url: string;
  file_name?: string;
  file_content_type?: string;
  published_on: string;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
}

export type ResultReviewStatus = "draft" | "submitted" | "approved" | "rejected";

export interface ResultRecord {
  id: number;
  student: number;
  student_name?: string;
  section_label?: string;
  recorded_by: number | null;
  recorded_by_name?: string;
  exam_name: string;
  subject: string;
  score: string;
  max_score: string;
  percentage?: string;
  grade: string;
  remarks: string;
  published_on: string;
  is_published: boolean;
  review_status?: ResultReviewStatus;
  marks_file_url?: string;
  marks_file_name?: string;
  marks_file_content_type?: string;
  reviewed_by?: number | null;
  reviewed_by_name?: string;
  reviewed_at?: string | null;
  review_note?: string;
  created_at?: string;
  updated_at?: string;
}

export type AdmitCardStatus = "draft" | "issued" | "blocked";

export interface AdmitCard {
  id: number;
  student: number;
  student_name?: string;
  admission_number?: string;
  section_label?: string;
  issued_by: number | null;
  issued_by_name?: string;
  exam_name: string;
  roll_number: string;
  exam_date: string;
  reporting_time: string;
  venue: string;
  instructions: string;
  status: AdmitCardStatus;
  issued_on: string;
  created_at?: string;
  updated_at?: string;
}

export type FeeStatus = "pending" | "partial" | "paid" | "overdue";

export interface FeeStructure {
  id: number;
  campus: number;
  campus_name?: string;
  section: number | null;
  section_label?: string;
  title: string;
  description: string;
  amount: string;
  late_fee: string;
  discount_amount: string;
  due_day: number;
  is_active: boolean;
  created_by: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface FeeAssignment {
  id: number;
  fee_structure?: number | null;
  fee_structure_title?: string;
  student: number;
  student_name?: string;
  section_label?: string;
  title: string;
  amount: string;
  discount_amount?: string;
  late_fee?: string;
  payable_amount?: string;
  amount_paid?: string;
  outstanding_amount?: string;
  due_date: string;
  invoice_number?: string | null;
  invoice_generated_at?: string | null;
  reminder_count?: number;
  last_reminder_at?: string | null;
  status: FeeStatus;
  created_at?: string;
  updated_at?: string;
}

export type PaymentMethod = "cash" | "card" | "bank" | "online" | "upi" | "net_banking" | "wallet";
export type GatewayProvider = "razorpay" | "upi" | "card" | "net_banking" | "wallet";

export interface PaymentGatewayConfig {
  id: number;
  campus: number;
  campus_name?: string;
  provider: GatewayProvider;
  key_id: string;
  masked_key_id?: string;
  upi_id: string;
  allowed_methods: PaymentMethod[];
  is_active: boolean;
  created_by: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Payment {
  id: number;
  campus?: number | null;
  campus_name?: string;
  fee_assignment: number;
  fee_title?: string;
  student_name?: string;
  amount_paid: string;
  discount_amount?: string;
  late_fee?: string;
  pending_amount?: string;
  paid_on: string;
  payment_method: PaymentMethod;
  reference_number: string;
  payment_status?: TransactionStatus;
  gateway_name?: string;
  gateway_order_id?: string;
  transaction_id?: string;
  receipt_number?: string | null;
  invoice_number?: string;
  webhook_verified?: boolean;
  paid_at?: string | null;
  receipt_pdf_url?: string;
  collected_by: number | null;
  created_at?: string;
  updated_at?: string;
}

export type TransactionStatus = "created" | "pending" | "success" | "failed" | "refunded";

export interface PaymentTransaction {
  id: number;
  campus: number;
  campus_name?: string;
  student: number | null;
  student_name?: string;
  fee_assignment: number | null;
  fee_title?: string;
  payment: number | null;
  provider: string;
  method: PaymentMethod;
  amount: string;
  discount_amount?: string;
  late_fee?: string;
  pending_amount?: string;
  currency: string;
  status: TransactionStatus;
  gateway_name?: string;
  gateway_order_id: string;
  gateway_payment_id: string;
  gateway_signature: string;
  transaction_id?: string;
  receipt_number: string | null;
  invoice_number?: string;
  webhook_verified: boolean;
  paid_at?: string | null;
  raw_payload: Record<string, unknown>;
  created_by: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export type SalaryPaymentStatus = "draft" | "payable" | "paid" | "hold";

export interface SalarySetup {
  id: number;
  campus: number;
  campus_name?: string;
  staff_user: number;
  staff_name?: string;
  staff_role?: UserRole;
  gross_salary: string;
  default_deductions: string;
  default_bonus: string;
  is_active: boolean;
  created_by: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SalaryRecord {
  id: number;
  campus: number;
  campus_name?: string;
  salary_setup?: number | null;
  staff_user: number;
  staff_name?: string;
  staff_role?: UserRole;
  month: number;
  year: number;
  present_days: string;
  absent_days: string;
  leave_days: string;
  half_days: string;
  gross_salary: string;
  deductions: string;
  bonus: string;
  final_salary: string;
  payment_status: SalaryPaymentStatus;
  paid_on: string | null;
  slip_url: string;
  slip_number?: string | null;
  payment_reference?: string;
  paid_by?: number | null;
  status: "active" | "inactive" | "archived";
  created_by: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export type FinanceEventType = "feePaid" | "paymentFailed" | "offlinePaymentAdded" | "receiptGenerated" | "salaryPaid" | "feeReminderSent";

export interface FinanceEvent {
  id: number;
  campus: number;
  campus_name?: string;
  event_type: FinanceEventType;
  payload: Record<string, unknown>;
  created_by: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export type MessageChannel = "email" | "sms" | "whatsapp";
export type MessageStatus = "draft" | "queued" | "sent" | "failed";

export interface MessageTemplate {
  id: number;
  campus: number | null;
  campus_name?: string;
  name: string;
  trigger: string;
  channel: MessageChannel;
  subject: string;
  body: string;
  variables: string[];
  status: "active" | "inactive" | "archived";
  created_by: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface OutboundMessage {
  id: number;
  campus: number;
  campus_name?: string;
  template: number | null;
  template_name?: string;
  recipient_user: number | null;
  recipient_user_name?: string;
  student: number | null;
  student_name?: string;
  channel: MessageChannel;
  recipient: string;
  subject: string;
  body: string;
  status: MessageStatus;
  provider: string;
  provider_reference: string;
  error_message: string;
  sent_at: string | null;
  created_by: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CommunicationSetting {
  id: number;
  campus: number;
  campus_name?: string;
  channel: MessageChannel;
  provider_name: string;
  sender_id: string;
  api_url: string;
  smtp_host: string;
  smtp_port: number | null;
  smtp_username: string;
  whatsapp_phone_number_id: string;
  is_active: boolean;
  has_api_key: boolean;
  has_api_secret: boolean;
  has_smtp_password: boolean;
  created_by: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AILog {
  id: number;
  campus: number | null;
  campus_name?: string;
  user: number | null;
  user_name?: string;
  role: UserRole;
  feature: string;
  prompt: string;
  response: string;
  metadata: Record<string, unknown>;
  status: "active" | "inactive" | "archived";
  created_by: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentRecord {
  id: number;
  campus: number;
  campus_name?: string;
  student: number | null;
  student_name?: string;
  staff_user: number | null;
  staff_user_name?: string;
  uploaded_by: number | null;
  uploaded_by_name?: string;
  title: string;
  document_type: string;
  file_url: string;
  status: "active" | "inactive" | "archived";
  created_by: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PlatformSetting {
  id: number;
  campus: number | null;
  campus_name?: string;
  key: string;
  value: Record<string, unknown>;
  status: "active" | "inactive" | "archived";
  created_by: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuditEvent {
  id: number;
  actor: number | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type SaaSPlanCode = "basic" | "standard" | "premium" | "enterprise";
export type SaaSSubscriptionStatus = "trial" | "active" | "grace" | "expired" | "cancelled";
export type BillingCycle = "monthly" | "annual" | "custom";
export type SubscriptionInvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "cancelled";
export type EnterprisePaymentStatus = "pending" | "success" | "failed" | "refunded";
export type EnterpriseJobStatus = "queued" | "running" | "success" | "failed" | "cancelled";
export type EnterpriseHealthStatus = "ok" | "warning" | "critical";

export interface SaaSPlan {
  id: number;
  code: SaaSPlanCode;
  name: string;
  description: string;
  monthly_price: string;
  annual_price: string;
  custom_pricing_enabled: boolean;
  student_limit: number;
  teacher_limit: number;
  storage_limit_mb: number;
  ai_monthly_limit: number;
  whatsapp_monthly_limit: number;
  sms_monthly_limit: number;
  modules: Record<string, boolean>;
  enabled_module_count: number;
  is_active: boolean;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SchoolSubscription {
  id: number;
  campus: number;
  campus_name: string;
  campus_code: string;
  plan: number;
  plan_name: string;
  plan_code: SaaSPlanCode;
  status: SaaSSubscriptionStatus;
  billing_cycle: BillingCycle;
  start_date: string;
  end_date: string;
  grace_period_days: number;
  grace_ends_on: string;
  next_billing_date: string | null;
  custom_price: string | null;
  effective_price: string;
  currency: string;
  gst_number: string;
  auto_disable_on_expiry: boolean;
  access_allowed: boolean;
  last_alert_at: string | null;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SubscriptionInvoice {
  id: number;
  subscription: number;
  campus: number;
  campus_name: string;
  plan_name: string;
  invoice_number: string;
  billing_period_start: string;
  billing_period_end: string;
  base_amount: string;
  discount_amount: string;
  gst_rate: string;
  gst_amount: string;
  total_amount: string;
  paid_amount: string;
  outstanding_amount: string;
  currency: string;
  status: SubscriptionInvoiceStatus;
  due_date: string;
  paid_at: string | null;
  pdf_url: string;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SubscriptionPayment {
  id: number;
  invoice: number;
  invoice_number: string;
  campus: number;
  campus_name: string;
  amount: string;
  payment_mode: string;
  provider: string;
  transaction_id: string;
  payment_status: EnterprisePaymentStatus;
  paid_at: string;
  raw_payload: Record<string, unknown>;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface WhiteLabelConfig {
  id: number;
  campus: number;
  campus_name: string;
  plan_code: SaaSPlanCode | string;
  is_enabled: boolean;
  custom_logo_url: string;
  custom_domain: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  login_heading: string;
  login_subheading: string;
  login_background_url: string;
  email_template_header: string;
  email_template_footer: string;
  report_logo_url: string;
  report_footer: string;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserActivityLog {
  id: number;
  campus: number | null;
  campus_name: string;
  user: number | null;
  user_name: string;
  activity_type: string;
  summary: string;
  request_path: string;
  method: string;
  ip_address: string | null;
  user_agent: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export interface DocumentAccessLog {
  id: number;
  campus: number;
  campus_name: string;
  document: number | null;
  user: number | null;
  user_name: string;
  student: number | null;
  student_name: string;
  access_type: string;
  file_name: string;
  granted: boolean;
  reason: string;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export interface EnterpriseUsageMetric {
  id: number;
  campus: number | null;
  campus_name: string;
  metric_type: string;
  period_start: string;
  period_end: string;
  quantity: string;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface BackupPolicy {
  id: number;
  campus: number | null;
  campus_name: string;
  backup_type: string;
  frequency: string;
  retention_days: number;
  destination: string;
  encryption_required: boolean;
  is_active: boolean;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface BackupJob {
  id: number;
  policy: number | null;
  policy_label: string;
  campus: number | null;
  campus_name: string;
  backup_type: string;
  status: EnterpriseJobStatus;
  started_at: string | null;
  completed_at: string | null;
  storage_location: string;
  size_bytes: number;
  checksum: string;
  error_message: string;
  metadata: Record<string, unknown>;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface QueueJob {
  id: number;
  campus: number | null;
  campus_name: string;
  job_type: string;
  status: EnterpriseJobStatus;
  priority: number;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SystemHealthSnapshot {
  id: number;
  campus: number | null;
  campus_name?: string;
  component: string;
  status: EnterpriseHealthStatus;
  latency_ms: number;
  metric_value: string | null;
  message: string;
  metadata: Record<string, unknown>;
  checked_at: string;
  created_at?: string;
  updated_at?: string;
}

export interface SecureApiToken {
  id: number;
  campus: number | null;
  campus_name: string;
  name: string;
  prefix: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
  rawToken?: string;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SubscriptionLimitSnapshot {
  subscription: {
    id: number | null;
    status: string;
    startDate: string | null;
    endDate: string | null;
    graceEndsOn: string | null;
    accessAllowed: boolean;
  };
  plan: {
    id: number | null;
    code: string;
    name: string;
    modules: Record<string, boolean>;
    customPricingEnabled: boolean;
  };
  students: { used: number; limit: number };
  teachers: { used: number; limit: number };
  storageMb: { used: number; limit: number };
  ai: { used: number; limit: number };
  whatsapp: { used: number; limit: number };
  sms: { used: number; limit: number };
}

export interface EnterpriseAnalytics {
  mrr: string;
  arr: string;
  activeSchools: number;
  totalSchools: number;
  churnRate: string;
  subscriptionGrowth: { date: string; subscriptions: number }[];
  revenueAnalytics: {
    total: string;
    monthly: string;
    byPlan: { plan: string; amount: string }[];
  };
  plans: Pick<SaaSPlan, "code" | "name" | "monthly_price" | "annual_price" | "is_active">[];
  limits: {
    schoolsOverStudentLimit: number;
    schoolsOverTeacherLimit: number;
  };
}

export interface SchoolEnterpriseAnalytics {
  school: { id: number; name: string; code: string };
  subscription: SubscriptionLimitSnapshot;
  attendanceAnalytics: {
    totalRecords: number;
    presentRecords: number;
    attendancePercentage: string;
    todayPresent: number;
    todayAbsent: number;
  };
  feeCollectionAnalytics: {
    assigned: string;
    collected: string;
    monthlyCollection: string;
    pendingCount: number;
    overdueCount: number;
  };
  studentPerformanceAnalytics: {
    studentCount: number;
    averageScore: string;
    publishedResults: number;
    topSubjects: { subject: string; avg: string | number | null; count: number }[];
  };
  teacherPerformanceAnalytics: {
    teacherId: number;
    name: string;
    assignedSubjects: number;
    attendanceMarked: number;
    notesUploaded: number;
    assignmentsCreated: number;
  }[];
}

export interface EnterpriseMonitoring {
  scope: string;
  health: SystemHealthSnapshot[];
  backupJobs: BackupJob[];
  queueJobs: QueueJob[];
  paymentMonitoring: { failedPayments: number };
  aiUsageMonitoring: { monthlyUsage: number };
  storageMonitoring: Pick<EnterpriseUsageMetric, "campus" | "quantity" | "period_start" | "period_end">[];
  alerts: {
    criticalHealth: number;
    failedBackups: number;
    failedQueueJobs: number;
  };
}

export type AdmissionApplicationStatus = "new" | "under_review" | "interview_scheduled" | "approved" | "rejected" | "waitlisted" | "admitted";
export type AdmissionPaymentStatus = "pending" | "success" | "failed" | "refunded";
export type RecordLifecycleStatus = "active" | "inactive" | "archived";
export type MarketplacePluginType = "biometric" | "sms" | "whatsapp" | "payment" | "ai" | "storage" | "custom";
export type AccountingEntryType = "income" | "expense" | "gst_output" | "gst_input" | "ledger_adjustment";
export type ReportDefinitionType = "attendance" | "fees" | "student" | "staff" | "accounting" | "custom";
export type ProductionAuditStatus = "queued" | "running" | "passed" | "failed" | "warning";

export interface Phase10EcosystemDashboard {
  scope: string;
  admissions: { total: number; approved: number; rejected: number; revenue: string };
  transport: { routes: number; vehicles: number; drivers: number; activeAssignments: number };
  library: { books: number; issued: number; digitalResources: number; requests: number };
  inventory: { assets: number; maintenance: number };
  website: { published: number };
  mobile: { pushDevices: number; queuedNotifications: number };
  security: { activeSessions: number; openAlerts: number };
  audit: { latestStatus: ProductionAuditStatus | "not_run" };
}

export interface AdmissionFormTemplate {
  id: number;
  campus: number;
  campus_name?: string;
  name: string;
  academic_year: string;
  form_schema: unknown[];
  admission_fee: string;
  is_public: boolean;
  status: RecordLifecycleStatus;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface AdmissionApplication {
  id: number;
  campus: number;
  campus_name?: string;
  form_template: number | null;
  form_name?: string;
  target_section: number | null;
  section_label?: string;
  application_number: string;
  tracking_code: string;
  applicant_first_name: string;
  applicant_last_name: string;
  applicant_name: string;
  date_of_birth: string | null;
  guardian_name: string;
  contact_email: string;
  contact_phone: string;
  form_data: Record<string, unknown>;
  status: AdmissionApplicationStatus;
  admission_fee_amount: string;
  payment_status: AdmissionPaymentStatus;
  payment_reference: string;
  interview_at: string | null;
  decision_note: string;
  admitted_student: number | null;
  reviewed_by: number | null;
  created_by: number | null;
  document_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface TransportDriver {
  id: number;
  campus: number;
  campus_name?: string;
  user: number | null;
  user_name?: string;
  full_name: string;
  phone: string;
  license_number: string;
  emergency_contact: string;
  status: RecordLifecycleStatus;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface DigitalLibraryResource {
  id: number;
  campus: number;
  campus_name?: string;
  book: number | null;
  book_title?: string;
  title: string;
  resource_type: string;
  file_url: string;
  file_name: string;
  file_content_type: string;
  status: RecordLifecycleStatus;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryAsset {
  id: number;
  campus: number;
  campus_name?: string;
  asset_code: string;
  name: string;
  category: string;
  serial_number: string;
  location: string;
  allocated_to_user: number | null;
  allocated_to_user_name?: string;
  allocated_to_student: number | null;
  allocated_to_student_name?: string;
  purchase_date: string | null;
  purchase_cost: string;
  current_value: string;
  depreciation_rate: string;
  status: string;
  metadata: Record<string, unknown>;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SchoolWebsiteContent {
  id: number;
  campus: number;
  campus_name?: string;
  content_type: string;
  title: string;
  slug: string;
  body: string;
  summary: string;
  media_url: string;
  metadata: Record<string, unknown>;
  publish_at: string;
  is_published: boolean;
  sort_order: number;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface PushNotificationLog {
  id: number;
  campus: number | null;
  campus_name?: string;
  user: number | null;
  user_name?: string;
  student: number | null;
  student_name?: string;
  event_type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  status: "queued" | "sent" | "failed" | "read";
  sent_at: string | null;
  error_message: string;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface MarketplacePlugin {
  id: number;
  code: string;
  name: string;
  plugin_type: MarketplacePluginType;
  provider_name: string;
  description: string;
  config_schema: Record<string, unknown>;
  is_enabled: boolean;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SchoolPluginConfig {
  id: number;
  campus: number;
  campus_name?: string;
  plugin: number;
  plugin_name?: string;
  plugin_type?: MarketplacePluginType;
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface AccountingLedgerEntry {
  id: number;
  campus: number;
  campus_name?: string;
  entry_type: AccountingEntryType;
  ledger_name: string;
  reference_type: string;
  reference_id: string;
  amount: string;
  tax_rate: string;
  gst_amount: string;
  entry_date: string;
  notes: string;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface ReportDefinition {
  id: number;
  campus: number | null;
  campus_name?: string;
  name: string;
  report_type: ReportDefinitionType;
  description: string;
  columns: string[];
  filters: Record<string, unknown>;
  sort: unknown[];
  chart_config: Record<string, unknown>;
  is_public_to_school: boolean;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SecurityPolicy {
  id: number;
  campus: number | null;
  campus_name?: string;
  two_factor_required: boolean;
  allowed_ip_ranges: string[];
  blocked_ip_ranges: string[];
  max_active_sessions: number;
  force_password_change_days: number;
  suspicious_login_threshold: number;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SecurityEvent {
  id: number;
  campus: number | null;
  campus_name?: string;
  user: number | null;
  user_name?: string;
  event_type: string;
  severity: string;
  summary: string;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  resolved_at: string | null;
  resolved_by: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProductionAuditRun {
  id: number;
  campus: number | null;
  campus_name?: string;
  status: ProductionAuditStatus;
  checks: { key: string; label: string; passed: boolean; detail: string }[];
  summary: { total: number; passed: number; failed: number };
  report_url: string;
  started_at: string | null;
  completed_at: string | null;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type AnnouncementAudience = "all" | "admins" | "staff" | "learners";
export type SupportTicketStatus = "open" | "in_progress" | "resolved";
export type SupportTicketPriority = "normal" | "high" | "urgent";

export interface ApprovalRequest {
  id: number;
  campus: number;
  campus_name?: string;
  title: string;
  entity_type: string;
  entity_id: string;
  description: string;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  requested_by: number | null;
  requested_by_name?: string;
  reviewed_by: number | null;
  reviewed_by_name?: string;
  decided_at: string | null;
  decision_note: string;
  created_at?: string;
  updated_at?: string;
}

export interface Announcement {
  id: number;
  campus: number | null;
  campus_name?: string;
  title: string;
  message: string;
  audience: AnnouncementAudience;
  created_by: number | null;
  created_by_name: string;
  is_active: boolean;
  publish_on: string;
  created_at?: string;
  updated_at?: string;
}

export type AcademicEventType =
  | "attendanceMarked"
  | "notesUploaded"
  | "assignmentUploaded"
  | "assignmentPublished"
  | "assignmentSubmitted"
  | "marksUploaded"
  | "resultPublished"
  | "noticePublished"
  | "paymentUpdated"
  | "deviceSynced"
  | "schoolStatusChanged";

export interface AcademicEvent {
  id: number;
  campus: number;
  campus_name?: string;
  event_type: AcademicEventType;
  payload: Record<string, unknown>;
  student: number | null;
  student_name?: string;
  teacher: number | null;
  teacher_name?: string;
  created_by: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RealTimeEvent {
  id: number;
  source: "academic" | "finance";
  event: AcademicEventType | FinanceEventType;
  campus: number;
  campus_name?: string;
  rooms: string[];
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SupportTicket {
  id: number;
  campus: number | null;
  campus_name?: string;
  created_by: number;
  created_by_name: string;
  created_by_role: UserRole;
  reviewed_by: number | null;
  reviewed_by_name?: string;
  subject: string;
  message: string;
  category: string;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  response_note: string;
  resolved_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DashboardSummary {
  students: {
    total: number;
    active: number;
  };
  classes?: {
    total: number;
  };
  schools?: {
    total: number;
    active: number;
    inactive: number;
    suspended: number;
    subscription_due: number;
  };
  users?: {
    total: number;
    teachers: number;
    accounts: number;
    school_admins: number;
    active: number;
  };
  attendance: {
    total: number;
    today_total?: number;
    today_present?: number;
    today_absent?: number;
    by_status: Partial<Record<AttendanceStatus, number>>;
    by_section: {
      section: number;
      label: string;
      total: number;
      present: number;
      absent: number;
    }[];
  };
  fees: {
    total_assigned: string;
    total_collected: string;
    total_outstanding: string;
    monthly_subscriptions?: string;
    pending_school_payments?: number;
    salary_payable?: string;
    by_status: Partial<Record<FeeStatus, number>>;
  };
  finance?: {
    total_fee_collection: string;
    today_collection: string;
    monthly_collection: string;
    pending_fees: string;
    overdue_fees: string;
    online_payments: string;
    offline_payments: string;
    failed_payments: number;
    teacher_salary_payable: string;
    staff_salary_payable: string;
    recent_transactions: {
      id: number;
      student_name: string;
      fee_title: string;
      provider: string;
      amount: string;
      status: TransactionStatus;
      gateway_order_id: string;
      transaction_id: string;
      created_at: string;
    }[];
  };
  staff?: {
    total: number;
    active: number;
    teachers: number;
  };
  staff_attendance?: {
    total: number;
    today_total?: number;
    today_present?: number;
    today_absent?: number;
    today_late?: number;
    by_status: Partial<Record<StaffAttendanceStatus, number>>;
  };
  devices?: {
    total: number;
    active: number;
    by_type: Partial<Record<AttendanceCaptureMethod, number>>;
  };
  approvals?: {
    pending: number;
    approved: number;
    rejected: number;
  };
  recent_payments: {
    id: number;
    student_name: string;
    fee_title: string;
    amount_paid: string;
    paid_on: string;
    payment_method: PaymentMethod;
    reference_number: string;
  }[];
  upcoming_exams?: {
    id: number;
    title: string;
    exam_type: string;
    section: string;
    subject: string;
    exam_date: string;
    start_time: string;
    status: ExamScheduleStatus;
  }[];
  recent_notices?: {
    id: number;
    title: string;
    audience: AnnouncementAudience;
    campus: string;
    publish_on: string;
  }[];
}

// Paginated DRF response wrapper
export interface PagedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  captcha: () => apiFetch<CaptchaChallenge>(`${getAuthBase()}/captcha/`),

  login: (username: string, password: string, captcha_id: string, captcha_answer: string, campusCode = "") =>
    apiFetch<LoginResponse>(`${getAuthBase()}/token/`, {
      method: "POST",
      headers: campusCode.trim() ? { "X-Campus-Code": campusCode.trim().toUpperCase() } : undefined,
      body: JSON.stringify({ username, password, captcha_id, captcha_answer }),
    }),

  me: () => apiFetch<User>(`${getAuthBase()}/me/`),

  changePassword: (current_password: string, new_password: string) =>
    apiFetch<User>(`${getAuthBase()}/change-password/`, {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),

  logout: (refresh: string) =>
    apiFetch<{ detail: string }>(`${getAuthBase()}/logout/`, {
      method: "POST",
      body: JSON.stringify({ refresh }),
    }),
};

export const userApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<ERPUser[]>(`${getAuthBase()}/users/${q}`);
  },
  detail: (id: number) =>
    apiFetch<UserDetail>(`${getAuthBase()}/users/${id}/detail/`),
  create: (data: Partial<ERPUser> & { username: string; password?: string; role: UserRole; campus_ids?: number[] }) =>
    apiFetch<ERPUser>(`${getAuthBase()}/users/`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ERPUser> & { password?: string; campus_ids?: number[] }) =>
    apiFetch<ERPUser>(`${getAuthBase()}/users/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`${getAuthBase()}/users/${id}/`, { method: "DELETE" }),
};

// ─── Campus ──────────────────────────────────────────────────────────────────
export const campusApi = {
  list: () => apiFetch<Campus[]>("/campuses/"),
  get: (id: number) => apiFetch<Campus>(`/campuses/${id}/`),
  create: (data: Pick<Campus, "name" | "code"> & Partial<Campus>) =>
    apiFetch<Campus>("/campuses/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Campus>) =>
    apiFetch<Campus>(`/campuses/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  activate: (id: number) =>
    apiFetch<Campus>(`/campuses/${id}/activate/`, { method: "POST", body: JSON.stringify({}) }),
  suspend: (id: number) =>
    apiFetch<Campus>(`/campuses/${id}/suspend/`, { method: "POST", body: JSON.stringify({}) }),
  remove: (id: number) => apiFetch<void>(`/campuses/${id}/`, { method: "DELETE" }),
};

export const campusMembershipApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<CampusMembership[]>(`/campus-memberships/${q}`);
  },
  create: (data: Omit<CampusMembership, "id" | "campus_name" | "user_name" | "user_role">) =>
    apiFetch<CampusMembership>("/campus-memberships/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<CampusMembership>) =>
    apiFetch<CampusMembership>(`/campus-memberships/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/campus-memberships/${id}/`, { method: "DELETE" }),
};

export const schoolApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<School[]>(`/schools/${q}`);
  },
  get: (id: number) => apiFetch<School>(`/schools/${id}/`),
  profile: () => apiFetch<School>("/schools/me/"),
  create: (data: SchoolPayload) =>
    apiFetch<SchoolCreateResponse>("/schools/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<SchoolPayload>) =>
    apiFetch<School>(`/schools/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  activate: (id: number) =>
    apiFetch<School>(`/schools/${id}/activate/`, { method: "POST", body: JSON.stringify({}) }),
  deactivate: (id: number) =>
    apiFetch<School>(`/schools/${id}/deactivate/`, { method: "POST", body: JSON.stringify({}) }),
  suspend: (id: number) =>
    apiFetch<School>(`/schools/${id}/suspend/`, { method: "POST", body: JSON.stringify({}) }),
  remove: (id: number) => apiFetch<void>(`/schools/${id}/`, { method: "DELETE" }),
  connectionStatus: (id: number) => apiFetch<SchoolConnectionStatus>(`/schools/${id}/connection-status/`),
  createAdmin: (id: number, data: Partial<SchoolPayload>) =>
    apiFetch<SchoolAdminCredentials>(`/schools/${id}/create-admin/`, { method: "POST", body: JSON.stringify(data) }),
  uploadLogo: (id: number, file: File, altText?: string) => {
    assertFileSize(file, "logo");
    const form = new FormData();
    form.append("file", file);
    if (altText) form.append("altText", altText);
    return apiFetch<School>(`/schools/${id}/upload-logo/`, { method: "POST", body: form });
  },
  uploadBanner: (id: number, file: File) => {
    assertFileSize(file, "banner");
    const form = new FormData();
    form.append("file", file);
    return apiFetch<School>(`/schools/${id}/upload-banner/`, { method: "POST", body: form });
  },
};

export const attendanceDeviceApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<AttendanceDevice[]>(`/attendance-devices/${q}`);
  },
  create: (data: Omit<AttendanceDevice, "id" | "campus_name" | "configured_by" | "configured_by_name" | "last_seen_at">) =>
    apiFetch<AttendanceDevice>("/attendance-devices/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<AttendanceDevice>) =>
    apiFetch<AttendanceDevice>(`/attendance-devices/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/attendance-devices/${id}/`, { method: "DELETE" }),
  capture: (
    id: number,
    data: {
      person_type: "student" | "staff";
      external_id: string;
      captured_at?: string;
      status?: AttendanceStatus | StaffAttendanceStatus;
      source_reference?: string;
      confidence_score?: string;
    }
  ) =>
    apiFetch<AttendanceRecord | StaffAttendanceRecord>(`/attendance-devices/${id}/capture/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  statusCheck: (id: number) => apiFetch<AttendanceDeviceConnectionStatus>(`/attendance-devices/${id}/status-check/`),
  syncLogs: (id: number, params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<DeviceSyncLog[]>(`/attendance-devices/${id}/sync-logs/${q}`);
  },
  addSyncLog: (
    id: number,
    data: {
      status?: DeviceSyncStatus;
      log_type?: string;
      payload?: Record<string, unknown>;
      error_message?: string;
      attempt_count?: number;
    }
  ) => apiFetch<DeviceSyncLog>(`/attendance-devices/${id}/sync-logs/`, { method: "POST", body: JSON.stringify(data) }),
  errorLogs: (id: number) => apiFetch<DeviceSyncLog[]>(`/attendance-devices/${id}/error-logs/`),
  retryFailedSync: (id: number) => apiFetch<{ retried: number; logs: DeviceSyncLog[] }>(`/attendance-devices/${id}/retry-failed-sync/`, { method: "POST", body: JSON.stringify({}) }),
};

export const deviceSyncLogApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<DeviceSyncLog[]>(`/device-sync-logs/${q}`);
  },
  create: (data: Omit<DeviceSyncLog, "id" | "campus_name" | "device_name" | "device_code" | "created_by" | "created_by_name" | "created_at" | "updated_at">) =>
    apiFetch<DeviceSyncLog>("/device-sync-logs/", { method: "POST", body: JSON.stringify(data) }),
  retry: (id: number) => apiFetch<DeviceSyncLog>(`/device-sync-logs/${id}/retry/`, { method: "POST", body: JSON.stringify({}) }),
};

export const sessionApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<AcademicSession[]>(`/academic-sessions/${q}`);
  },
  create: (data: Omit<AcademicSession, "id">) =>
    apiFetch<AcademicSession>("/academic-sessions/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<AcademicSession>) =>
    apiFetch<AcademicSession>(`/academic-sessions/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/academic-sessions/${id}/`, { method: "DELETE" }),
};

// ─── Sections ────────────────────────────────────────────────────────────────
export const sectionApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<ClassSection[]>(`/sections/${q}`);
  },
  get: (id: number) => apiFetch<ClassSection>(`/sections/${id}/`),
  create: (data: Omit<ClassSection, "id">) =>
    apiFetch<ClassSection>("/sections/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ClassSection>) =>
    apiFetch<ClassSection>(`/sections/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/sections/${id}/`, { method: "DELETE" }),
};

// ─── Students ────────────────────────────────────────────────────────────────
export const teacherSubjectAllocationApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<TeacherSubjectAllocation[]>(`/teacher-subject-allocations/${q}`);
  },
  create: (data: Omit<TeacherSubjectAllocation, "id" | "campus_name" | "section_label" | "teacher_name">) =>
    apiFetch<TeacherSubjectAllocation>("/teacher-subject-allocations/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number, data: Partial<TeacherSubjectAllocation>) =>
    apiFetch<TeacherSubjectAllocation>(`/teacher-subject-allocations/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: number) => apiFetch<void>(`/teacher-subject-allocations/${id}/`, { method: "DELETE" }),
};

export const studentApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Student[]>(`/students/${q}`);
  },
  get: (id: number) => apiFetch<Student>(`/students/${id}/`),
  create: (data: Partial<Student> & { campus: number; section: number; first_name: string; date_of_birth: string }) =>
    apiFetch<Student>("/students/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Student>) =>
    apiFetch<Student>(`/students/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/students/${id}/`, { method: "DELETE" }),
  uploadPhoto: (id: number, file: File) => {
    assertFileSize(file, "photo");
    const form = new FormData();
    form.append("file", file);
    return apiFetch<Student>(`/students/${id}/upload-photo/`, { method: "POST", body: form });
  },
  uploadDocument: (id: number, file: File, title: string, document_type: string) => {
    assertFileSize(file, "document");
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("document_type", document_type);
    return apiFetch<DocumentRecord>(`/students/${id}/upload-document/`, { method: "POST", body: form });
  },
  downloadProfilePdf: (id: number) => apiDownload(`/students/${id}/profile-pdf/`),
};

// ─── Attendance ───────────────────────────────────────────────────────────────
export const attendanceApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<AttendanceRecord[]>(`/attendance-records/${q}`);
  },
  create: (data: {
    student: number;
    section: number;
    date: string;
    subject?: string;
    status: AttendanceStatus;
    capture_method?: AttendanceCaptureMethod;
    device?: number | null;
    source_reference?: string;
    confidence_score?: string | null;
  }) =>
    apiFetch<AttendanceRecord>("/attendance-records/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number, data: Partial<AttendanceRecord>) =>
    apiFetch<AttendanceRecord>(`/attendance-records/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  bulkCreate: (records: {
    student: number;
    section: number;
    date: string;
    subject?: string;
    status: AttendanceStatus;
    capture_method?: AttendanceCaptureMethod;
    device?: number | null;
    source_reference?: string;
    confidence_score?: string | null;
  }[]) =>
    Promise.all(records.map((r) => attendanceApi.create(r))),
  bulkUpsert: (data: {
    section: number;
    date: string;
    subject?: string;
    capture_method?: AttendanceCaptureMethod;
    device?: number | null;
    source_reference?: string;
    confidence_score?: string;
    records: { student: number; status: AttendanceStatus }[];
  }) =>
    apiFetch<AttendanceRecord[]>("/attendance-records/bulk-upsert/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  export: (file_format: "pdf" | "excel", params?: Record<string, string>) => {
    const query = new URLSearchParams({ ...(params ?? {}), file_format }).toString();
    return apiDownload(`/attendance-records/export/?${query}`);
  },
};

export const staffAttendanceApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<StaffAttendanceRecord[]>(`/staff-attendance-records/${q}`);
  },
  create: (data: Partial<StaffAttendanceRecord> & { campus: number; staff_user: number; date: string; status: StaffAttendanceStatus }) =>
    apiFetch<StaffAttendanceRecord>("/staff-attendance-records/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<StaffAttendanceRecord>) =>
    apiFetch<StaffAttendanceRecord>(`/staff-attendance-records/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/staff-attendance-records/${id}/`, { method: "DELETE" }),
  export: (file_format: "pdf" | "excel", params?: Record<string, string>) => {
    const query = new URLSearchParams({ ...(params ?? {}), file_format }).toString();
    return apiDownload(`/staff-attendance-records/export/?${query}`);
  },
};

export const staffProfileApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<StaffProfile[]>(`/staff-profiles/${q}`);
  },
  create: (data: Omit<StaffProfile, "id" | "campus_name" | "user_name" | "user_role" | "employee_code" | "photo_url" | "created_at" | "updated_at"> & Partial<Pick<StaffProfile, "employee_code" | "photo_url">>) =>
    apiFetch<StaffProfile>("/staff-profiles/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<StaffProfile>) =>
    apiFetch<StaffProfile>(`/staff-profiles/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/staff-profiles/${id}/`, { method: "DELETE" }),
  uploadPhoto: (id: number, file: File) => {
    assertFileSize(file, "photo");
    const form = new FormData();
    form.append("file", file);
    return apiFetch<StaffProfile>(`/staff-profiles/${id}/upload-photo/`, { method: "POST", body: form });
  },
  uploadDocument: (id: number, file: File, title: string, document_type: string) => {
    assertFileSize(file, "document");
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("document_type", document_type);
    return apiFetch<DocumentRecord>(`/staff-profiles/${id}/upload-document/`, { method: "POST", body: form });
  },
  attendanceSummary: (id: number) =>
    apiFetch<{ staffProfile: number; employeeCode: string; total: number; byStatus: Partial<Record<StaffAttendanceStatus, number>> }>(
      `/staff-profiles/${id}/attendance-summary/`
    ),
};

export const timetableApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<TimetableSlot[]>(`/timetable-slots/${q}`);
  },
  create: (data: Omit<TimetableSlot, "id" | "campus_name" | "section_label" | "teacher_name" | "day_name" | "created_at" | "updated_at">) =>
    apiFetch<TimetableSlot>("/timetable-slots/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<TimetableSlot>) =>
    apiFetch<TimetableSlot>(`/timetable-slots/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/timetable-slots/${id}/`, { method: "DELETE" }),
};

export const subjectApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Subject[]>(`/subjects/${q}`);
  },
  create: (data: Omit<Subject, "id" | "campus_name" | "created_at" | "updated_at">) =>
    apiFetch<Subject>("/subjects/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Subject>) =>
    apiFetch<Subject>(`/subjects/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/subjects/${id}/`, { method: "DELETE" }),
};

export const examTypeApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<ExamType[]>(`/exam-types/${q}`);
  },
  create: (data: Omit<ExamType, "id" | "campus_name" | "created_at" | "updated_at">) =>
    apiFetch<ExamType>("/exam-types/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ExamType>) =>
    apiFetch<ExamType>(`/exam-types/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/exam-types/${id}/`, { method: "DELETE" }),
};

export const examSubjectSetupApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<ExamSubjectSetup[]>(`/exam-subject-setups/${q}`);
  },
  create: (data: Omit<ExamSubjectSetup, "id" | "campus_name" | "exam_type_name" | "section_label" | "subject_name" | "created_at" | "updated_at">) =>
    apiFetch<ExamSubjectSetup>("/exam-subject-setups/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ExamSubjectSetup>) =>
    apiFetch<ExamSubjectSetup>(`/exam-subject-setups/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/exam-subject-setups/${id}/`, { method: "DELETE" }),
};

export const examScheduleApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<ExamSchedule[]>(`/exam-schedules/${q}`);
  },
  create: (data: Omit<ExamSchedule, "id" | "campus_name" | "exam_type_name" | "section_label" | "subject_name" | "created_by" | "created_by_name" | "created_at" | "updated_at">) =>
    apiFetch<ExamSchedule>("/exam-schedules/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ExamSchedule>) =>
    apiFetch<ExamSchedule>(`/exam-schedules/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/exam-schedules/${id}/`, { method: "DELETE" }),
  publish: (id: number) => apiFetch<ExamSchedule>(`/exam-schedules/${id}/publish/`, { method: "POST", body: JSON.stringify({}) }),
  unpublish: (id: number) => apiFetch<ExamSchedule>(`/exam-schedules/${id}/unpublish/`, { method: "POST", body: JSON.stringify({}) }),
  archive: (id: number) => apiFetch<ExamSchedule>(`/exam-schedules/${id}/archive/`, { method: "POST", body: JSON.stringify({}) }),
};

export const libraryBookApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<LibraryBook[]>(`/library-books/${q}`);
  },
  create: (data: Omit<LibraryBook, "id" | "campus_name" | "created_at" | "updated_at">) =>
    apiFetch<LibraryBook>("/library-books/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<LibraryBook>) =>
    apiFetch<LibraryBook>(`/library-books/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/library-books/${id}/`, { method: "DELETE" }),
};

export const libraryLoanApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<LibraryLoan[]>(`/library-loans/${q}`);
  },
  create: (data: Omit<LibraryLoan, "id" | "campus_name" | "book_title" | "borrower_name" | "created_at" | "updated_at">) =>
    apiFetch<LibraryLoan>("/library-loans/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<LibraryLoan>) =>
    apiFetch<LibraryLoan>(`/library-loans/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/library-loans/${id}/`, { method: "DELETE" }),
};

export const transportRouteApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<TransportRoute[]>(`/transport-routes/${q}`);
  },
  create: (data: Omit<TransportRoute, "id" | "campus_name" | "created_at" | "updated_at">) =>
    apiFetch<TransportRoute>("/transport-routes/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<TransportRoute>) =>
    apiFetch<TransportRoute>(`/transport-routes/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/transport-routes/${id}/`, { method: "DELETE" }),
};

export const transportVehicleApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<TransportVehicle[]>(`/transport-vehicles/${q}`);
  },
  create: (data: Omit<TransportVehicle, "id" | "campus_name" | "route_name" | "created_at" | "updated_at">) =>
    apiFetch<TransportVehicle>("/transport-vehicles/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<TransportVehicle>) =>
    apiFetch<TransportVehicle>(`/transport-vehicles/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/transport-vehicles/${id}/`, { method: "DELETE" }),
};

export const studentTransportApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<StudentTransportAssignment[]>(`/student-transport-assignments/${q}`);
  },
  create: (data: Omit<StudentTransportAssignment, "id" | "student_name" | "route_name" | "vehicle_number" | "created_at" | "updated_at">) =>
    apiFetch<StudentTransportAssignment>("/student-transport-assignments/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<StudentTransportAssignment>) =>
    apiFetch<StudentTransportAssignment>(`/student-transport-assignments/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/student-transport-assignments/${id}/`, { method: "DELETE" }),
};

export const hostelRoomApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<HostelRoom[]>(`/hostel-rooms/${q}`);
  },
  create: (data: Omit<HostelRoom, "id" | "campus_name" | "created_at" | "updated_at">) =>
    apiFetch<HostelRoom>("/hostel-rooms/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<HostelRoom>) =>
    apiFetch<HostelRoom>(`/hostel-rooms/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/hostel-rooms/${id}/`, { method: "DELETE" }),
};

export const hostelAllocationApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<HostelAllocation[]>(`/hostel-allocations/${q}`);
  },
  create: (data: Omit<HostelAllocation, "id" | "student_name" | "room_label" | "created_at" | "updated_at">) =>
    apiFetch<HostelAllocation>("/hostel-allocations/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<HostelAllocation>) =>
    apiFetch<HostelAllocation>(`/hostel-allocations/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/hostel-allocations/${id}/`, { method: "DELETE" }),
};

export const assignedWorkApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<AssignedWork[]>(`/assigned-work/${q}`);
  },
  create: (data: Omit<AssignedWork, "id" | "assigned_by" | "assigned_by_name" | "section_label" | "file_url" | "file_name" | "file_content_type" | "submission_count">) =>
    apiFetch<AssignedWork>("/assigned-work/", { method: "POST", body: JSON.stringify(data) }),
  upload: (data: {
    section: number;
    title: string;
    subject: string;
    description?: string;
    due_date: string;
    status?: AcademicWorkStatus;
    file: File;
  }) => {
    assertFileSize(data.file, "academic");
    const form = new FormData();
    form.append("section", String(data.section));
    form.append("title", data.title);
    form.append("subject", data.subject);
    form.append("description", data.description ?? "");
    form.append("due_date", data.due_date);
    form.append("status", data.status ?? "published");
    form.append("file", data.file);
    return apiFetch<AssignedWork>("/assigned-work/upload/", { method: "POST", body: form });
  },
  update: (id: number, data: Partial<AssignedWork>) =>
    apiFetch<AssignedWork>(`/assigned-work/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/assigned-work/${id}/`, { method: "DELETE" }),
  publish: (id: number) => apiFetch<AssignedWork>(`/assigned-work/${id}/publish/`, { method: "POST", body: JSON.stringify({}) }),
  unpublish: (id: number) => apiFetch<AssignedWork>(`/assigned-work/${id}/unpublish/`, { method: "POST", body: JSON.stringify({}) }),
  download: (id: number) => apiDownload(`/assigned-work/${id}/download/`),
  submit: (id: number, file: File, notes = "") => {
    assertFileSize(file, "academic");
    const form = new FormData();
    form.append("file", file);
    form.append("notes", notes);
    return apiFetch<AssignmentSubmission>(`/assigned-work/${id}/submit/`, { method: "POST", body: form });
  },
  submissions: (id: number) => apiFetch<AssignmentSubmission[]>(`/assigned-work/${id}/submissions/`),
};

export const assignmentSubmissionApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<AssignmentSubmission[]>(`/assignment-submissions/${q}`);
  },
  download: (id: number) => apiDownload(`/assignment-submissions/${id}/download/`),
  markChecked: (id: number, remarks = "") =>
    apiFetch<AssignmentSubmission>(`/assignment-submissions/${id}/mark-checked/`, {
      method: "POST",
      body: JSON.stringify({ remarks }),
    }),
  addRemarks: (id: number, remarks: string) =>
    apiFetch<AssignmentSubmission>(`/assignment-submissions/${id}/add-remarks/`, {
      method: "POST",
      body: JSON.stringify({ remarks }),
    }),
};

export const learningResourceApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<LearningResource[]>(`/learning-resources/${q}`);
  },
  create: (data: {
    section: number;
    title: string;
    subject: string;
    resource_type?: ResourceType;
    description?: string;
    file_url?: string;
    published_on?: string;
    is_published?: boolean;
  }) =>
    apiFetch<LearningResource>("/learning-resources/", { method: "POST", body: JSON.stringify(data) }),
  upload: (data: {
    section: number;
    title: string;
    subject: string;
    resource_type?: ResourceType;
    description?: string;
    is_published?: boolean;
    file: File;
  }) => {
    assertFileSize(data.file, "academic");
    const form = new FormData();
    form.append("section", String(data.section));
    form.append("title", data.title);
    form.append("subject", data.subject);
    form.append("resource_type", data.resource_type ?? "notes");
    form.append("description", data.description ?? "");
    form.append("is_published", String(data.is_published ?? true));
    form.append("file", data.file);
    return apiFetch<LearningResource>("/learning-resources/upload/", { method: "POST", body: form });
  },
  update: (id: number, data: Partial<LearningResource>) =>
    apiFetch<LearningResource>(`/learning-resources/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/learning-resources/${id}/`, { method: "DELETE" }),
  publish: (id: number) => apiFetch<LearningResource>(`/learning-resources/${id}/publish/`, { method: "POST", body: JSON.stringify({}) }),
  unpublish: (id: number) => apiFetch<LearningResource>(`/learning-resources/${id}/unpublish/`, { method: "POST", body: JSON.stringify({}) }),
  download: (id: number) => apiDownload(`/learning-resources/${id}/download/`),
};

export const resultRecordApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<ResultRecord[]>(`/result-records/${q}`);
  },
  create: (data: {
    student: number;
    exam_name: string;
    subject: string;
    score: string;
    max_score: string;
    grade?: string;
    remarks?: string;
    published_on?: string;
    is_published?: boolean;
  }) =>
    apiFetch<ResultRecord>("/result-records/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ResultRecord>) =>
    apiFetch<ResultRecord>(`/result-records/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/result-records/${id}/`, { method: "DELETE" }),
  uploadMarks: (id: number, file: File) => {
    assertFileSize(file, "marks");
    const form = new FormData();
    form.append("file", file);
    return apiFetch<ResultRecord>(`/result-records/${id}/upload-marks/`, { method: "POST", body: form });
  },
  submitReview: (id: number) =>
    apiFetch<ResultRecord>(`/result-records/${id}/submit-review/`, { method: "POST", body: JSON.stringify({}) }),
  approve: (id: number, review_note = "") =>
    apiFetch<ResultRecord>(`/result-records/${id}/approve/`, { method: "POST", body: JSON.stringify({ review_note }) }),
  reject: (id: number, review_note = "") =>
    apiFetch<ResultRecord>(`/result-records/${id}/reject/`, { method: "POST", body: JSON.stringify({ review_note }) }),
  publish: (id: number) => apiFetch<ResultRecord>(`/result-records/${id}/publish/`, { method: "POST", body: JSON.stringify({}) }),
  unpublish: (id: number) => apiFetch<ResultRecord>(`/result-records/${id}/unpublish/`, { method: "POST", body: JSON.stringify({}) }),
  downloadMarksFile: (id: number) => apiDownload(`/result-records/${id}/download-marks-file/`),
  downloadResult: (id: number) => apiDownload(`/result-records/${id}/download-result/`),
};

export const admitCardApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<AdmitCard[]>(`/admit-cards/${q}`);
  },
  create: (data: Omit<AdmitCard, "id" | "issued_by" | "issued_by_name" | "student_name" | "admission_number" | "section_label">) =>
    apiFetch<AdmitCard>("/admit-cards/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<AdmitCard>) =>
    apiFetch<AdmitCard>(`/admit-cards/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/admit-cards/${id}/`, { method: "DELETE" }),
};

// ─── Fee Assignments ──────────────────────────────────────────────────────────
export const feeStructureApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<FeeStructure[]>(`/fee-structures/${q}`);
  },
  create: (data: {
    campus: number;
    section?: number | null;
    title: string;
    description?: string;
    amount: string;
    late_fee?: string;
    discount_amount?: string;
    due_day?: number;
    is_active?: boolean;
  }) => apiFetch<FeeStructure>("/fee-structures/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<FeeStructure>) =>
    apiFetch<FeeStructure>(`/fee-structures/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/fee-structures/${id}/`, { method: "DELETE" }),
  assign: (id: number, data: { due_date?: string; section?: number; student_ids?: number[] }) =>
    apiFetch<{ created: number; updated: number }>(`/fee-structures/${id}/assign/`, { method: "POST", body: JSON.stringify(data) }),
};

export const feeApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<FeeAssignment[]>(`/fee-assignments/${q}`);
  },
  get: (id: number) => apiFetch<FeeAssignment>(`/fee-assignments/${id}/`),
  create: (data: {
    student: number;
    fee_structure?: number | null;
    title: string;
    amount: string;
    discount_amount?: string;
    late_fee?: string;
    due_date: string;
  }) =>
    apiFetch<FeeAssignment>("/fee-assignments/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number, data: Partial<FeeAssignment>) =>
    apiFetch<FeeAssignment>(`/fee-assignments/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: number) => apiFetch<void>(`/fee-assignments/${id}/`, { method: "DELETE" }),
  generateInvoice: (id: number) =>
    apiFetch<FeeAssignment>(`/fee-assignments/${id}/generate-invoice/`, { method: "POST", body: JSON.stringify({}) }),
  downloadInvoice: (id: number) => apiDownload(`/fee-assignments/${id}/invoice-pdf/`),
  sendReminder: (id: number, data: { channel?: MessageChannel; recipient?: string }) =>
    apiFetch<FeeAssignment>(`/fee-assignments/${id}/send-reminder/`, { method: "POST", body: JSON.stringify(data) }),
};

// ─── Payments ─────────────────────────────────────────────────────────────────
export const paymentGatewayApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<PaymentGatewayConfig[]>(`/payment-gateways/${q}`);
  },
  create: (data: {
    campus: number;
    provider: GatewayProvider;
    key_id?: string;
    key_secret?: string;
    webhook_secret?: string;
    upi_id?: string;
    allowed_methods?: PaymentMethod[];
    is_active?: boolean;
  }) => apiFetch<PaymentGatewayConfig>("/payment-gateways/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<PaymentGatewayConfig> & { key_secret?: string; webhook_secret?: string }) =>
    apiFetch<PaymentGatewayConfig>(`/payment-gateways/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
};

export const paymentApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Payment[]>(`/payments/${q}`);
  },
  create: (data: {
    fee_assignment: number;
    amount_paid: string;
    paid_on: string;
    payment_method: PaymentMethod;
    reference_number?: string;
  }) =>
    apiFetch<Payment>("/payments/", { method: "POST", body: JSON.stringify(data) }),
  downloadReceipt: (id: number) => apiDownload(`/payments/${id}/receipt-pdf/`),
  sendReceipt: (id: number, data: { channel?: MessageChannel; recipient?: string }) =>
    apiFetch<Payment>(`/payments/${id}/send-receipt/`, { method: "POST", body: JSON.stringify(data) }),
};

export const paymentTransactionApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<PaymentTransaction[]>(`/payment-transactions/${q}`);
  },
  create: (data: Omit<PaymentTransaction, "id" | "campus_name" | "student_name" | "fee_title" | "created_by" | "created_by_name" | "created_at" | "updated_at">) =>
    apiFetch<PaymentTransaction>("/payment-transactions/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<PaymentTransaction>) =>
    apiFetch<PaymentTransaction>(`/payment-transactions/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  createOrder: (data: { fee_assignment: number; amount?: string; provider?: GatewayProvider; method?: PaymentMethod }) =>
    apiFetch<PaymentTransaction & { gateway: { provider: GatewayProvider; keyId: string; maskedKeyId: string; upiId: string; allowedMethods: PaymentMethod[] } }>(
      "/payment-transactions/create-order/",
      { method: "POST", body: JSON.stringify(data) }
    ),
  verifyPayment: (id: number, data: Pick<PaymentTransaction, "gateway_payment_id" | "gateway_signature">) =>
    apiFetch<PaymentTransaction>(`/payment-transactions/${id}/verify-payment/`, { method: "POST", body: JSON.stringify(data) }),
  verifyRazorpay: (id: number, data: Partial<Pick<PaymentTransaction, "gateway_order_id" | "gateway_payment_id" | "gateway_signature">>) =>
    apiFetch<PaymentTransaction>(`/payment-transactions/${id}/verify-razorpay/`, { method: "POST", body: JSON.stringify(data) }),
  downloadReceipt: (id: number) => apiDownload(`/payment-transactions/${id}/receipt-pdf/`),
};

export const salarySetupApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<SalarySetup[]>(`/salary-setups/${q}`);
  },
  create: (data: {
    campus: number;
    staff_user: number;
    gross_salary: string;
    default_deductions?: string;
    default_bonus?: string;
    is_active?: boolean;
  }) => apiFetch<SalarySetup>("/salary-setups/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<SalarySetup>) =>
    apiFetch<SalarySetup>(`/salary-setups/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
};

export const salaryRecordApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<SalaryRecord[]>(`/salary-records/${q}`);
  },
  create: (data: Omit<SalaryRecord, "id" | "campus_name" | "staff_name" | "staff_role" | "created_by" | "created_by_name" | "created_at" | "updated_at">) =>
    apiFetch<SalaryRecord>("/salary-records/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<SalaryRecord>) =>
    apiFetch<SalaryRecord>(`/salary-records/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  calculate: (data: { salary_setup: number; month?: number; year?: number; bonus?: string }) =>
    apiFetch<SalaryRecord>("/salary-records/calculate/", { method: "POST", body: JSON.stringify(data) }),
  markPaid: (id: number, data?: { paid_on?: string; payment_reference?: string }) =>
    apiFetch<SalaryRecord>(`/salary-records/${id}/mark-paid/`, { method: "POST", body: JSON.stringify(data ?? {}) }),
  downloadSalarySlip: (id: number) => apiDownload(`/salary-records/${id}/salary-slip-pdf/`),
  sendSlip: (id: number, data: { channel?: MessageChannel; recipient?: string }) =>
    apiFetch<SalaryRecord>(`/salary-records/${id}/send-slip/`, { method: "POST", body: JSON.stringify(data) }),
};

export const financeEventApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<FinanceEvent[]>(`/finance-events/${q}`);
  },
};

export const messageTemplateApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<MessageTemplate[]>(`/message-templates/${q}`);
  },
  create: (data: Omit<MessageTemplate, "id" | "campus_name" | "created_by" | "created_by_name" | "created_at" | "updated_at">) =>
    apiFetch<MessageTemplate>("/message-templates/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<MessageTemplate>) =>
    apiFetch<MessageTemplate>(`/message-templates/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  seedDefaults: (campus: number) =>
    apiFetch<MessageTemplate[]>("/message-templates/seed-defaults/", { method: "POST", body: JSON.stringify({ campus }) }),
  render: (id: number, variables: Record<string, string>) =>
    apiFetch<{ subject: string; body: string; variables: string[] }>(`/message-templates/${id}/render/`, {
      method: "POST",
      body: JSON.stringify({ variables }),
    }),
};

export const communicationSettingApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<CommunicationSetting[]>(`/communication-settings/${q}`);
  },
  create: (
    data: Omit<
      CommunicationSetting,
      | "id"
      | "campus_name"
      | "has_api_key"
      | "has_api_secret"
      | "has_smtp_password"
      | "created_by"
      | "created_by_name"
      | "created_at"
      | "updated_at"
    > & {
      api_key?: string;
      api_secret?: string;
      smtp_password?: string;
    }
  ) => apiFetch<CommunicationSetting>("/communication-settings/", { method: "POST", body: JSON.stringify(data) }),
  update: (
    id: number,
    data: Partial<CommunicationSetting> & {
      api_key?: string;
      api_secret?: string;
      smtp_password?: string;
    }
  ) => apiFetch<CommunicationSetting>(`/communication-settings/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  test: (id: number, recipient: string) =>
    apiFetch<OutboundMessage>(`/communication-settings/${id}/test/`, {
      method: "POST",
      body: JSON.stringify({ recipient }),
    }),
};

export const outboundMessageApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<OutboundMessage[]>(`/outbound-messages/${q}`);
  },
  create: (data: Omit<OutboundMessage, "id" | "campus_name" | "template_name" | "recipient_user_name" | "student_name" | "created_by" | "created_by_name" | "sent_at" | "created_at" | "updated_at">) =>
    apiFetch<OutboundMessage>("/outbound-messages/", { method: "POST", body: JSON.stringify(data) }),
  sendTemplate: (data: {
    template: number;
    campus?: number;
    student?: number;
    recipient_user?: number;
    recipient?: string;
    channel?: MessageChannel;
    provider?: string;
    variables?: Record<string, string>;
  }) => apiFetch<OutboundMessage>("/outbound-messages/send-template/", { method: "POST", body: JSON.stringify(data) }),
  markSent: (id: number, provider_reference?: string) =>
    apiFetch<OutboundMessage>(`/outbound-messages/${id}/mark-sent/`, { method: "POST", body: JSON.stringify({ provider_reference }) }),
};

export const aiLogApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<AILog[]>(`/ai-logs/${q}`);
  },
  create: (data: Pick<AILog, "feature" | "prompt"> & Partial<Pick<AILog, "campus" | "response" | "metadata" | "status">>) =>
    apiFetch<AILog>("/ai-logs/", { method: "POST", body: JSON.stringify(data) }),
};

export const roleAiApi = {
  features: () => apiFetch<{ features: string[] }>("/ai-tools/"),
  run: (data: { feature: string; prompt?: string; campus?: number | null }) =>
    apiFetch<AILog>("/ai-tools/", { method: "POST", body: JSON.stringify(data) }),
};

export const realTimeApi = {
  list: (params?: { limit?: string | number }) => {
    const q = params ? "?" + new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString() : "";
    return apiFetch<{ events: RealTimeEvent[] }>(`/realtime/events/${q}`);
  },
};

export const documentApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<DocumentRecord[]>(`/documents/${q}`);
  },
  create: (data: Omit<DocumentRecord, "id" | "campus_name" | "student_name" | "staff_user_name" | "uploaded_by" | "uploaded_by_name" | "created_by" | "created_by_name" | "created_at" | "updated_at">) =>
    apiFetch<DocumentRecord>("/documents/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<DocumentRecord>) =>
    apiFetch<DocumentRecord>(`/documents/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
};

export const platformSettingApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<PlatformSetting[]>(`/platform-settings/${q}`);
  },
  create: (data: Omit<PlatformSetting, "id" | "campus_name" | "created_by" | "created_by_name" | "created_at" | "updated_at">) =>
    apiFetch<PlatformSetting>("/platform-settings/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<PlatformSetting>) =>
    apiFetch<PlatformSetting>(`/platform-settings/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
};

export const auditApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<AuditEvent[]>(`/audit-events/${q}`);
  },
};

export const enterpriseApi = {
  analytics: () => apiFetch<EnterpriseAnalytics>("/enterprise/analytics/"),
  schoolAnalytics: (campus?: number) => {
    const q = campus ? `?${new URLSearchParams({ campus: String(campus) }).toString()}` : "";
    return apiFetch<SchoolEnterpriseAnalytics>(`/enterprise/school-analytics/${q}`);
  },
  monitoring: (campus?: number) => {
    const q = campus ? `?${new URLSearchParams({ campus: String(campus) }).toString()}` : "";
    return apiFetch<EnterpriseMonitoring>(`/enterprise/monitoring/${q}`);
  },
  plans: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<SaaSPlan[]>(`/saas-plans/${q}`);
    },
    create: (data: Omit<SaaSPlan, "id" | "enabled_module_count" | "created_by" | "created_at" | "updated_at">) =>
      apiFetch<SaaSPlan>("/saas-plans/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<SaaSPlan>) =>
      apiFetch<SaaSPlan>(`/saas-plans/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
    seedDefaults: () => apiFetch<SaaSPlan[]>("/saas-plans/seed-defaults/", { method: "POST", body: JSON.stringify({}) }),
  },
  subscriptions: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<SchoolSubscription[]>(`/school-subscriptions/${q}`);
    },
    create: (data: Omit<SchoolSubscription, "id" | "campus_name" | "campus_code" | "plan_name" | "plan_code" | "effective_price" | "grace_ends_on" | "next_billing_date" | "access_allowed" | "last_alert_at" | "created_by" | "created_at" | "updated_at">) =>
      apiFetch<SchoolSubscription>("/school-subscriptions/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<SchoolSubscription>) =>
      apiFetch<SchoolSubscription>(`/school-subscriptions/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
    renew: (id: number, months = 1) =>
      apiFetch<SchoolSubscription>(`/school-subscriptions/${id}/renew/`, { method: "POST", body: JSON.stringify({ months }) }),
    generateInvoice: (id: number, data?: Partial<Pick<SubscriptionInvoice, "discount_amount" | "gst_rate" | "due_date">>) =>
      apiFetch<SubscriptionInvoice>(`/school-subscriptions/${id}/generate-invoice/`, { method: "POST", body: JSON.stringify(data ?? {}) }),
    enforceExpiry: () => apiFetch<{ updated: number }>("/school-subscriptions/enforce-expiry/", { method: "POST", body: JSON.stringify({}) }),
  },
  invoices: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<SubscriptionInvoice[]>(`/subscription-invoices/${q}`);
    },
    create: (data: Omit<SubscriptionInvoice, "id" | "campus_name" | "plan_name" | "paid_amount" | "outstanding_amount" | "gst_amount" | "total_amount" | "paid_at" | "created_by" | "created_at" | "updated_at">) =>
      apiFetch<SubscriptionInvoice>("/subscription-invoices/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<SubscriptionInvoice>) =>
      apiFetch<SubscriptionInvoice>(`/subscription-invoices/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
    downloadPdf: (id: number) => apiDownload(`/subscription-invoices/${id}/pdf/`),
  },
  payments: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<SubscriptionPayment[]>(`/subscription-payments/${q}`);
    },
    create: (data: Omit<SubscriptionPayment, "id" | "invoice_number" | "campus" | "campus_name" | "created_by" | "created_at" | "updated_at">) =>
      apiFetch<SubscriptionPayment>("/subscription-payments/", { method: "POST", body: JSON.stringify(data) }),
  },
  whiteLabel: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<WhiteLabelConfig[]>(`/white-label-configs/${q}`);
    },
    create: (data: Omit<WhiteLabelConfig, "id" | "campus_name" | "plan_code" | "created_by" | "created_at" | "updated_at">) =>
      apiFetch<WhiteLabelConfig>("/white-label-configs/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<WhiteLabelConfig>) =>
      apiFetch<WhiteLabelConfig>(`/white-label-configs/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  activityLogs: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<UserActivityLog[]>(`/user-activity-logs/${q}`);
    },
  },
  documentAccessLogs: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<DocumentAccessLog[]>(`/document-access-logs/${q}`);
    },
  },
  usageMetrics: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<EnterpriseUsageMetric[]>(`/enterprise-usage-metrics/${q}`);
    },
    create: (data: Omit<EnterpriseUsageMetric, "id" | "campus_name" | "created_at" | "updated_at">) =>
      apiFetch<EnterpriseUsageMetric>("/enterprise-usage-metrics/", { method: "POST", body: JSON.stringify(data) }),
  },
  backupPolicies: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<BackupPolicy[]>(`/backup-policies/${q}`);
    },
    create: (data: Omit<BackupPolicy, "id" | "campus_name" | "created_by" | "created_at" | "updated_at">) =>
      apiFetch<BackupPolicy>("/backup-policies/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<BackupPolicy>) =>
      apiFetch<BackupPolicy>(`/backup-policies/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  backupJobs: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<BackupJob[]>(`/backup-jobs/${q}`);
    },
    create: (data: Omit<BackupJob, "id" | "policy_label" | "campus_name" | "created_by" | "created_at" | "updated_at">) =>
      apiFetch<BackupJob>("/backup-jobs/", { method: "POST", body: JSON.stringify(data) }),
    markRestored: (id: number, note = "") =>
      apiFetch<BackupJob>(`/backup-jobs/${id}/mark-restored/`, { method: "POST", body: JSON.stringify({ note }) }),
  },
  queueJobs: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<QueueJob[]>(`/queue-jobs/${q}`);
    },
    create: (data: Omit<QueueJob, "id" | "campus_name" | "attempts" | "started_at" | "completed_at" | "error_message" | "created_by" | "created_at" | "updated_at">) =>
      apiFetch<QueueJob>("/queue-jobs/", { method: "POST", body: JSON.stringify(data) }),
    runNext: () => apiFetch<QueueJob | { job: null; message: string }>("/queue-jobs/run-next/", { method: "POST", body: JSON.stringify({}) }),
  },
  healthSnapshots: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<SystemHealthSnapshot[]>(`/system-health-snapshots/${q}`);
    },
    create: (data: Omit<SystemHealthSnapshot, "id" | "campus_name" | "created_at" | "updated_at">) =>
      apiFetch<SystemHealthSnapshot>("/system-health-snapshots/", { method: "POST", body: JSON.stringify(data) }),
  },
  secureTokens: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<SecureApiToken[]>(`/secure-api-tokens/${q}`);
    },
    create: (data: Omit<SecureApiToken, "id" | "campus_name" | "prefix" | "last_used_at" | "rawToken" | "created_by" | "created_at" | "updated_at"> & { raw_token?: string }) =>
      apiFetch<SecureApiToken>("/secure-api-tokens/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<SecureApiToken>) =>
      apiFetch<SecureApiToken>(`/secure-api-tokens/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  },
};

export const phase10Api = {
  dashboard: (campus?: number | null) => {
    const q = campus ? `?${new URLSearchParams({ campus: String(campus) }).toString()}` : "";
    return apiFetch<Phase10EcosystemDashboard>(`/enterprise/ecosystem/${q}`);
  },
  admissions: {
    forms: {
      list: (params?: Record<string, string>) => {
        const q = params ? "?" + new URLSearchParams(params).toString() : "";
        return apiFetch<AdmissionFormTemplate[]>(`/admission-form-templates/${q}`);
      },
      create: (data: Omit<AdmissionFormTemplate, "id" | "campus_name" | "created_by" | "created_at" | "updated_at">) =>
        apiFetch<AdmissionFormTemplate>("/admission-form-templates/", { method: "POST", body: JSON.stringify(data) }),
    },
    applications: {
      list: (params?: Record<string, string>) => {
        const q = params ? "?" + new URLSearchParams(params).toString() : "";
        return apiFetch<AdmissionApplication[]>(`/admission-applications/${q}`);
      },
      transition: (id: number, data: { status: AdmissionApplicationStatus; decision_note?: string; interview_at?: string }) =>
        apiFetch<AdmissionApplication>(`/admission-applications/${id}/transition/`, { method: "POST", body: JSON.stringify(data) }),
      markPayment: (id: number, data: { payment_status: AdmissionPaymentStatus; payment_reference?: string }) =>
        apiFetch<AdmissionApplication>(`/admission-applications/${id}/mark-payment/`, { method: "POST", body: JSON.stringify(data) }),
      admit: (id: number, data?: { section?: number; admission_number?: string }) =>
        apiFetch<AdmissionApplication>(`/admission-applications/${id}/admit/`, { method: "POST", body: JSON.stringify(data ?? {}) }),
      dashboard: () => apiFetch<{ totalApplications: number; approvedStudents: number; rejectedStudents: number; admissionRevenue: string; pipeline: Record<string, number>; classWiseAdmissions: { className: string; applications: number }[] }>("/admission-applications/dashboard/"),
    },
  },
  transportDrivers: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<TransportDriver[]>(`/transport-drivers/${q}`);
    },
    create: (data: Omit<TransportDriver, "id" | "campus_name" | "user_name" | "created_by" | "created_at" | "updated_at">) =>
      apiFetch<TransportDriver>("/transport-drivers/", { method: "POST", body: JSON.stringify(data) }),
  },
  digitalLibrary: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<DigitalLibraryResource[]>(`/digital-library-resources/${q}`);
    },
    create: (data: Omit<DigitalLibraryResource, "id" | "campus_name" | "book_title" | "created_by" | "created_at" | "updated_at">) =>
      apiFetch<DigitalLibraryResource>("/digital-library-resources/", { method: "POST", body: JSON.stringify(data) }),
    download: (id: number) => apiDownload(`/digital-library-resources/${id}/download/`),
  },
  inventoryAssets: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<InventoryAsset[]>(`/inventory-assets/${q}`);
    },
    create: (data: Omit<InventoryAsset, "id" | "campus_name" | "allocated_to_user_name" | "allocated_to_student_name" | "created_by" | "created_at" | "updated_at">) =>
      apiFetch<InventoryAsset>("/inventory-assets/", { method: "POST", body: JSON.stringify(data) }),
  },
  website: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<SchoolWebsiteContent[]>(`/school-website-contents/${q}`);
    },
    create: (data: Omit<SchoolWebsiteContent, "id" | "campus_name" | "created_by" | "created_at" | "updated_at">) =>
      apiFetch<SchoolWebsiteContent>("/school-website-contents/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<SchoolWebsiteContent>) =>
      apiFetch<SchoolWebsiteContent>(`/school-website-contents/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: number) => apiFetch<void>(`/school-website-contents/${id}/`, { method: "DELETE" }),
  },
  pushNotifications: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<PushNotificationLog[]>(`/push-notifications/${q}`);
    },
    create: (data: Omit<PushNotificationLog, "id" | "campus_name" | "user_name" | "student_name" | "sent_at" | "error_message" | "created_by" | "created_at" | "updated_at">) =>
      apiFetch<PushNotificationLog>("/push-notifications/", { method: "POST", body: JSON.stringify(data) }),
    markSent: (id: number) => apiFetch<PushNotificationLog>(`/push-notifications/${id}/mark-sent/`, { method: "POST", body: JSON.stringify({}) }),
  },
  marketplace: {
    plugins: {
      list: (params?: Record<string, string>) => {
        const q = params ? "?" + new URLSearchParams(params).toString() : "";
        return apiFetch<MarketplacePlugin[]>(`/marketplace-plugins/${q}`);
      },
      create: (data: Omit<MarketplacePlugin, "id" | "created_by" | "created_at" | "updated_at">) =>
        apiFetch<MarketplacePlugin>("/marketplace-plugins/", { method: "POST", body: JSON.stringify(data) }),
    },
    configs: {
      list: (params?: Record<string, string>) => {
        const q = params ? "?" + new URLSearchParams(params).toString() : "";
        return apiFetch<SchoolPluginConfig[]>(`/school-plugin-configs/${q}`);
      },
      create: (data: Omit<SchoolPluginConfig, "id" | "campus_name" | "plugin_name" | "plugin_type" | "created_by" | "created_at" | "updated_at">) =>
        apiFetch<SchoolPluginConfig>("/school-plugin-configs/", { method: "POST", body: JSON.stringify(data) }),
    },
  },
  accounting: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<AccountingLedgerEntry[]>(`/accounting-ledger-entries/${q}`);
    },
    create: (data: Omit<AccountingLedgerEntry, "id" | "campus_name" | "created_by" | "created_at" | "updated_at">) =>
      apiFetch<AccountingLedgerEntry>("/accounting-ledger-entries/", { method: "POST", body: JSON.stringify(data) }),
    gstReport: () => apiFetch<{ outputGst: string; inputGst: string; entries: AccountingLedgerEntry[] }>("/accounting-ledger-entries/gst-report/"),
  },
  reports: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<ReportDefinition[]>(`/report-definitions/${q}`);
    },
    create: (data: Omit<ReportDefinition, "id" | "campus_name" | "created_by" | "created_at" | "updated_at">) =>
      apiFetch<ReportDefinition>("/report-definitions/", { method: "POST", body: JSON.stringify(data) }),
    run: (id: number) => apiFetch<{ headers: string[]; rows: string[][]; count: number }>(`/report-definitions/${id}/run/`),
    export: (id: number, file_format: "pdf" | "excel" | "csv" = "csv") => apiDownload(`/report-definitions/${id}/export/?${new URLSearchParams({ file_format }).toString()}`),
  },
  security: {
    policies: {
      list: (params?: Record<string, string>) => {
        const q = params ? "?" + new URLSearchParams(params).toString() : "";
        return apiFetch<SecurityPolicy[]>(`/security-policies/${q}`);
      },
      create: (data: Omit<SecurityPolicy, "id" | "campus_name" | "created_by" | "created_at" | "updated_at">) =>
        apiFetch<SecurityPolicy>("/security-policies/", { method: "POST", body: JSON.stringify(data) }),
      update: (id: number, data: Partial<SecurityPolicy>) =>
        apiFetch<SecurityPolicy>(`/security-policies/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
    },
    events: {
      list: (params?: Record<string, string>) => {
        const q = params ? "?" + new URLSearchParams(params).toString() : "";
        return apiFetch<SecurityEvent[]>(`/security-events/${q}`);
      },
      resolve: (id: number) => apiFetch<SecurityEvent>(`/security-events/${id}/resolve/`, { method: "POST", body: JSON.stringify({}) }),
    },
  },
  audits: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return apiFetch<ProductionAuditRun[]>(`/production-audit-runs/${q}`);
    },
    runNow: (campus?: number | null) =>
      apiFetch<ProductionAuditRun>("/production-audit-runs/run-now/", { method: "POST", body: JSON.stringify(campus ? { campus } : {}) }),
    report: (id: number) => apiDownload(`/production-audit-runs/${id}/report/`),
  },
};

export const approvalRequestApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<ApprovalRequest[]>(`/approval-requests/${q}`);
  },
  create: (data: Omit<ApprovalRequest, "id" | "status" | "requested_by" | "requested_by_name" | "reviewed_by" | "reviewed_by_name" | "decided_at" | "decision_note">) =>
    apiFetch<ApprovalRequest>("/approval-requests/", { method: "POST", body: JSON.stringify(data) }),
  approve: (id: number, decision_note = "") =>
    apiFetch<ApprovalRequest>(`/approval-requests/${id}/approve/`, {
      method: "POST",
      body: JSON.stringify({ decision_note }),
    }),
  reject: (id: number, decision_note = "") =>
    apiFetch<ApprovalRequest>(`/approval-requests/${id}/reject/`, {
      method: "POST",
      body: JSON.stringify({ decision_note }),
    }),
};

export const announcementApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Announcement[]>(`/announcements/${q}`);
  },
  create: (data: Pick<Announcement, "title" | "message" | "audience"> & { campus?: number | null; is_active?: boolean }) =>
    apiFetch<Announcement>("/announcements/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Announcement>) =>
    apiFetch<Announcement>(`/announcements/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => apiFetch<void>(`/announcements/${id}/`, { method: "DELETE" }),
  publish: (id: number) => apiFetch<Announcement>(`/announcements/${id}/publish/`, { method: "POST", body: JSON.stringify({}) }),
  unpublish: (id: number) => apiFetch<Announcement>(`/announcements/${id}/unpublish/`, { method: "POST", body: JSON.stringify({}) }),
  archive: (id: number) => apiFetch<Announcement>(`/announcements/${id}/archive/`, { method: "POST", body: JSON.stringify({}) }),
};

export const academicEventApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<AcademicEvent[]>(`/academic-events/${q}`);
  },
};

export const supportTicketApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<SupportTicket[]>(`/support-tickets/${q}`);
  },
  create: (data: {
    campus?: number | null;
    subject: string;
    message: string;
    category: string;
    priority: SupportTicketPriority;
  }) => apiFetch<SupportTicket>("/support-tickets/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Pick<SupportTicket, "status" | "response_note" | "subject" | "message" | "category" | "priority">>) =>
    apiFetch<SupportTicket>(`/support-tickets/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
};

export const reportApi = {
  summary: () => apiFetch<DashboardSummary>("/reports/summary/"),
  financeReport: (reportType: string, file_format: "pdf" | "excel", params?: Record<string, string>) => {
    const query = new URLSearchParams({ ...(params ?? {}), file_format }).toString();
    return apiDownload(`/finance/reports/${reportType}/?${query}`);
  },
};

// ─── Health ───────────────────────────────────────────────────────────────────
export const healthApi = {
  check: () => apiFetch<{ status: string; service: string }>("/health/"),
};
