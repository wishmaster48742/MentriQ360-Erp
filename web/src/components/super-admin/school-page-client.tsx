'use client';

import { useParams } from 'next/navigation';
import { SuperAdminSchoolManagement } from '@/components/super-admin/school-management';

type View = 'details' | 'admin' | 'branding' | 'edit';

export function SchoolPageClient({ view }: { view: View }) {
  const { id } = useParams<{ id: string }>();
  return <SuperAdminSchoolManagement view={view} schoolId={Number(id)} />;
}
