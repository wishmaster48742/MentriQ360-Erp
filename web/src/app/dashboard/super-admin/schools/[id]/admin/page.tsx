import { SchoolPageClient } from '@/components/super-admin/school-page-client';

export const dynamic = 'force-static';
export function generateStaticParams() { return [{ id: '0' }]; }

export default function CreateSchoolAdminPage() {
  return <SchoolPageClient view="admin" />;
}
