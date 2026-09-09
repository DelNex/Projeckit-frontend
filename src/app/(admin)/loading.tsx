import { Loader2 } from 'lucide-react';

export default function AdminLoading() {
  return (
    <div className="flex h-96 w-full flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-purple-600 dark:text-purple-400" />
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 animate-pulse">
        Loading admin console...
      </p>
    </div>
  );
}
