'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function ReportsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/analytics?tab=reports');
  }, [router]);

  return (
    <div className="flex h-96 flex-col items-center justify-center space-y-3">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      <span className="text-xs font-semibold text-gray-500">Loading Consolidated Reports...</span>
    </div>
  );
}

