'use client';

import { useState } from 'react';
import { AlertTriangle, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';

interface SchemaHealthBannerProps {
  missingColumns: string[];
  requiredMigration?: string | null;
  technicalError?: string | null;
}

export function SchemaHealthBanner({
  missingColumns,
  requiredMigration = '20260908000020_tos_eclassroom_redesign.sql',
  technicalError,
}: SchemaHealthBannerProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyDetails = () => {
    const text = `Required Migration: ${requiredMigration}\nMissing Columns: ${missingColumns.join(
      ', '
    )}\nError: ${technicalError || 'None'}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-4 shadow-sm text-amber-900 dark:text-amber-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              Database update needed: run migration {requiredMigration}
            </h4>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              The live database is missing {missingColumns.length} expected column(s):{' '}
              <span className="font-mono font-medium">{missingColumns.join(', ')}</span>. Run migration{' '}
              <span className="font-mono font-semibold">{requiredMigration}</span> in Supabase SQL Editor.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 px-2 py-1 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/50"
        >
          Technical details {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {showDetails && (
        <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800 text-xs font-mono space-y-2">
          <div className="p-3 bg-amber-100/70 dark:bg-amber-900/40 rounded-xl overflow-x-auto text-[11px] leading-relaxed">
            <div><strong>Missing Columns:</strong> {JSON.stringify(missingColumns)}</div>
            <div><strong>Target Migration:</strong> {requiredMigration}</div>
            {technicalError && <div><strong>Error Detail:</strong> {technicalError}</div>}
          </div>
          <button
            onClick={copyDetails}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-amber-200/80 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 text-amber-900 dark:text-amber-100 rounded-lg transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied to Clipboard' : 'Copy Technical Details'}
          </button>
        </div>
      )}
    </div>
  );
}

