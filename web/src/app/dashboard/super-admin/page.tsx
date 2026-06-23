import { AppShell } from "@/components/app-shell";

export default function SuperAdminDashboardPage() {
  return <AppShell requiredRole="super_admin" />;
}
