import type { UserRole } from "@/lib/api";
import type { Route } from "next";

export type DashboardRole = UserRole;

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  school_admin: "School Admin",
  account: "Account",
  teacher: "Teacher",
  student: "Student",
};

export const ROLE_DASHBOARD_PATHS: Record<UserRole, Route> = {
  super_admin: "/dashboard/super-admin",
  school_admin: "/dashboard/school-admin",
  account: "/dashboard/account",
  teacher: "/dashboard/teacher",
  student: "/dashboard/student",
};

export function dashboardRouteForRole(role: UserRole) {
  return ROLE_DASHBOARD_PATHS[role];
}
