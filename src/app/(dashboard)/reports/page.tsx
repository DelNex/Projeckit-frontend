import { redirect } from 'next/navigation';

export default function ReportsRedirectPage() {
  redirect('/analytics?tab=reports');
}
