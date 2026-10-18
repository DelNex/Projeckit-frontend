'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  HelpCircle,
  Loader2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { createClient } from '@/lib/supabase/client';
import { getTenantContext } from '@/lib/tenant-context';
import { useToast } from '@/components/ui/toast';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';

interface SectionItem {
  id: string;
  name: string;
}

interface ExistingStudentItem {
  lrn: string;
  name: string;
  is_archived?: boolean;
}

export interface BulkAddStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingStudents: ExistingStudentItem[];
  sections: SectionItem[];
}

interface ParsedRow {
  rowNum: number;
  rawLrn: string;
  rawName: string;
  rawSection: string;
  normalizedSection: string;
  isValid: boolean;
  errors: string[];
}

export interface FailedRowItem {
  lrn: string;
  name: string;
  reason: string;
}

export interface ImportResult {
  enrolledCount: number;
  failedRows: FailedRowItem[];
}

export function BulkAddStudentsModal({
  isOpen,
  onClose,
  onSuccess,
  existingStudents,
  sections,
}: BulkAddStudentsModalProps) {
  const { toast } = useToast();
  const supabase = createClient();

  const [rawText, setRawText] = useState('');
  const [defaultSection, setDefaultSection] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [insertProgress, setInsertProgress] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size exceeds the 2 MB limit.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      let content = (event.target?.result as string) || '';
      // Strip leading BOM (0xFEFF) if present
      if (content.charCodeAt(0) === 0xfeff) {
        content = content.slice(1);
      }
      setRawText(content);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => {
      toast.error('Failed to read uploaded file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const exampleSection = sections[0]?.name || 'Diamond';
    const content = `LRN,Name,Section\r\n101234567890,"Dela Cruz, Juan D.","${exampleSection.replace(/"/g, '""')}"\r\n`;
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'learners_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Map of active section names for case-insensitive lookup
  const sectionMap = useMemo(() => {
    const map = new Map<string, string>();
    sections.forEach((s) => {
      map.set(s.name.trim().toLowerCase(), s.name.trim());
    });
    return map;
  }, [sections]);

  // Map of active section IDs for foreign key lookup
  const sectionIdMap = useMemo(() => {
    const map = new Map<string, string>();
    sections.forEach((s) => {
      map.set(s.name.trim().toLowerCase(), s.id);
    });
    return map;
  }, [sections]);

  // Existing LRN sets
  const activeLrnSet = useMemo(() => {
    const set = new Set<string>();
    existingStudents.forEach((s) => {
      if (!s.is_archived) set.add(s.lrn.trim());
    });
    return set;
  }, [existingStudents]);

  const archivedLrnSet = useMemo(() => {
    const set = new Set<string>();
    existingStudents.forEach((s) => {
      if (s.is_archived) set.add(s.lrn.trim());
    });
    return set;
  }, [existingStudents]);

function detectDelimiter(firstLine: string): string {
  let inQuotes = false;
  let commas = 0;
  let tabs = 0;
  let semicolons = 0;

  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      if (inQuotes && firstLine[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes) {
      if (ch === '\t') tabs++;
      else if (ch === ';') semicolons++;
      else if (ch === ',') commas++;
    }
  }

  if (tabs > 0 && tabs >= commas && tabs >= semicolons) return '\t';
  if (semicolons > commas && semicolons > tabs) return ';';
  return ',';
}

function parseCsvRecords(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  const len = text.length;
  for (let i = 0; i < len; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && i + 1 < len && text[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && i + 1 < len && text[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      currentField = '';
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += ch;
    }
  }

  currentRow.push(currentField.trim());
  if (currentRow.some((f) => f.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

interface ColumnMapping {
  hasHeader: boolean;
  lrnIdx: number;
  nameIdx: number;
  sectionIdx: number;
}

function detectColumnMapping(firstRow: string[]): ColumnMapping {
  const norm = firstRow.map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ''));

  let lrnIdx = norm.findIndex((c) => c.includes('lrn') || c.includes('studentid'));
  let nameIdx = norm.findIndex(
    (c) => c.includes('name') || c.includes('learner') || c.includes('student')
  );
  let sectionIdx = norm.findIndex((c) => c.includes('section') || c.includes('class'));

  const hasHeader = lrnIdx !== -1 && (nameIdx !== -1 || sectionIdx !== -1);

  if (hasHeader) {
    if (nameIdx === -1) nameIdx = 1;
    return { hasHeader: true, lrnIdx, nameIdx, sectionIdx };
  }

  return {
    hasHeader: false,
    lrnIdx: 0,
    nameIdx: 1,
    sectionIdx: 2,
  };
}

  // Parse lines
  const { parsedRows, isCapped, totalInputRows } = useMemo(() => {
    if (!rawText.trim()) return { parsedRows: [], isCapped: false, totalInputRows: 0 };

    const firstNonEmptyLine = rawText.split(/\r?\n/).find((l) => l.trim().length > 0) || '';
    const delimiter = detectDelimiter(firstNonEmptyLine);
    const records = parseCsvRecords(rawText, delimiter);

    if (records.length === 0) return { parsedRows: [], isCapped: false, totalInputRows: 0 };

    const mapping = detectColumnMapping(records[0]);
    const dataRecords = mapping.hasHeader ? records.slice(1) : records;
    const totalInputRows = dataRecords.length;
    const isCapped = totalInputRows > 1000;
    const recordsToProcess = isCapped ? dataRecords.slice(0, 1000) : dataRecords;

    const seenLrnInBatch = new Set<string>();
    const results: ParsedRow[] = [];

    recordsToProcess.forEach((parts, index) => {
      const rawLrn = (mapping.lrnIdx !== -1 ? parts[mapping.lrnIdx] : '') || '';
      const rawName = (mapping.nameIdx !== -1 ? parts[mapping.nameIdx] : '') || '';
      const rawSection =
        (mapping.sectionIdx !== -1 ? parts[mapping.sectionIdx] : '') || defaultSection || '';

      const errors: string[] = [];

      // Validate LRN: strip spaces and dashes
      const cleanLrn = rawLrn.replace(/[\s\-]/g, '');
      const isScientific =
        /^[0-9]+(\.[0-9]+)?[eE][+-]?[0-9]+$/.test(cleanLrn) || /[eE]\+[0-9]+/.test(rawLrn);

      if (!cleanLrn) {
        errors.push('LRN is missing');
      } else if (isScientific) {
        errors.push(
          'LRN looks like Excel scientific notation. Format the LRN column as Text and re-export.'
        );
      } else if (!/^\d{12}$/.test(cleanLrn)) {
        errors.push(`Invalid LRN (${cleanLrn.length} digits, must be exactly 12 numeric digits)`);
      } else if (seenLrnInBatch.has(cleanLrn)) {
        errors.push('Duplicate LRN in pasted batch');
      } else if (activeLrnSet.has(cleanLrn)) {
        errors.push('LRN already exists in active roster');
      } else if (archivedLrnSet.has(cleanLrn)) {
        errors.push('LRN belongs to an archived learner (restore them instead)');
      }

      if (/^\d{12}$/.test(cleanLrn) && !isScientific) {
        seenLrnInBatch.add(cleanLrn);
      }

      // Validate Name
      if (!rawName.trim()) {
        errors.push('Learner name is required');
      }

      // Validate Section
      let matchedSection = '';
      if (!rawSection.trim()) {
        errors.push('Section assignment is required');
      } else {
        const found = sectionMap.get(rawSection.toLowerCase());
        if (!found) {
          errors.push(`Section "${rawSection}" not found in active sections`);
        } else {
          matchedSection = found;
        }
      }

      results.push({
        rowNum: index + 1,
        rawLrn: cleanLrn,
        rawName: rawName.trim(),
        rawSection: rawSection.trim(),
        normalizedSection: matchedSection,
        isValid: errors.length === 0,
        errors,
      });
    });

    return { parsedRows: results, isCapped, totalInputRows };
  }, [rawText, defaultSection, sectionMap, activeLrnSet, archivedLrnSet]);

  const validRows = useMemo(() => parsedRows.filter((r) => r.isValid), [parsedRows]);
  const invalidRows = useMemo(() => parsedRows.filter((r) => !r.isValid), [parsedRows]);

  const handleReset = () => {
    setRawText('');
    setDefaultSection('');
    setInsertProgress(null);
    setImportResult(null);
    onClose();
  };

  const handleAttemptClose = () => {
    if (importResult) {
      handleReset();
      return;
    }
    if (rawText.trim().length > 0) {
      setIsDiscardModalOpen(true);
      return;
    }
    handleReset();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        handleAttemptClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, rawText, importResult]);

  const handleImport = async () => {
    if (validRows.length === 0) return;

    setIsSubmitting(true);
    setInsertProgress('Validating school tenant context...');

    let totalInserted = 0;
    const failures: FailedRowItem[] = [];

    try {
      const { tenantId, configId } = await getTenantContext(supabase);

      const recordsToInsert = validRows.map((r) => ({
        tenant_id: tenantId,
        config_id: configId,
        lrn: r.rawLrn,
        name: r.rawName,
        section_id: sectionIdMap.get(r.normalizedSection.trim().toLowerCase()) || null,
        section_name: r.normalizedSection,
      }));

      // Insert in chunks of 200
      const CHUNK_SIZE = 200;

      for (let i = 0; i < recordsToInsert.length; i += CHUNK_SIZE) {
        const chunk = recordsToInsert.slice(i, i + CHUNK_SIZE);
        setInsertProgress(
          `Enrolling learners ${i + 1}–${Math.min(i + CHUNK_SIZE, recordsToInsert.length)} of ${recordsToInsert.length}...`
        );

        const { error: insErr } = await (supabase as any)
          .from('students')
          .insert(chunk);

        if (!insErr) {
          totalInserted += chunk.length;
        } else {
          // If a chunk fails, retry that chunk's rows one at a time so one bad row doesn't block the others
          for (const row of chunk) {
            const { error: singleErr } = await (supabase as any)
              .from('students')
              .insert(row);

            if (!singleErr) {
              totalInserted += 1;
            } else {
              const isDuplicate =
                singleErr.code === '23505' ||
                singleErr.message?.includes('23505') ||
                singleErr.message?.includes('uq_tenant_student_lrn') ||
                singleErr.message?.includes('duplicate key');

              failures.push({
                lrn: row.lrn,
                name: row.name,
                reason: isDuplicate
                  ? 'LRN already enrolled.'
                  : friendlyError(singleErr, 'Failed to enroll'),
              });
            }
          }
        }
      }

      onSuccess();
      setImportResult({
        enrolledCount: totalInserted,
        failedRows: failures,
      });
    } catch (err: any) {
      console.error('Bulk insert error:', err);
      // Item 4: If import throws unexpectedly, still call onSuccess() and show result screen
      onSuccess();
      setImportResult({
        enrolledCount: totalInserted,
        failedRows: [
          ...failures,
          {
            lrn: '—',
            name: 'Remaining records',
            reason: friendlyError(err, 'Import interrupted unexpectedly.'),
          },
        ],
      });
      toast.error(friendlyError(err, 'Failed to complete bulk enrollment.'));
    } finally {
      setIsSubmitting(false);
      setInsertProgress(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          handleAttemptClose();
        }
      }}
    >
      <div className="relative w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                {importResult ? 'Import Results' : 'Bulk Add Learners (Excel / CSV Paste)'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {importResult
                  ? 'Summary of bulk learner enrollment operation.'
                  : 'Paste student rows copied directly from Excel, Google Sheets, or CSV.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAttemptClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {importResult ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {importResult.enrolledCount} learner{importResult.enrolledCount !== 1 ? 's' : ''} successfully enrolled!
                </span>
              </div>
              <p className="mt-1 text-emerald-700 dark:text-emerald-400">
                The school roster has been refreshed with newly registered learners.
              </p>
            </div>

            {importResult.failedRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    {importResult.failedRows.length} learner{importResult.failedRows.length > 1 ? 's' : ''} failed to enroll:
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 font-semibold">
                      <tr>
                        <th className="p-2 w-32 font-mono">LRN</th>
                        <th className="p-2">Name</th>
                        <th className="p-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {importResult.failedRows.map((f, idx) => (
                        <tr key={idx} className="bg-rose-50/30 dark:bg-rose-950/20">
                          <td className="p-2 font-mono text-gray-800 dark:text-gray-200">{f.lrn}</td>
                          <td className="p-2 font-medium text-gray-900 dark:text-gray-100">{f.name}</td>
                          <td className="p-2 text-rose-600 dark:text-rose-400 font-medium">{f.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end border-t border-gray-100 pt-4 dark:border-gray-800">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>

        {/* Instructions & Fallback Section */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 rounded-xl bg-blue-50/60 p-3 border border-blue-100 dark:border-blue-900/30 dark:bg-blue-950/20 text-xs text-blue-800 dark:text-blue-300">
            <div className="flex items-center gap-1.5 font-semibold mb-1">
              <HelpCircle className="h-4 w-4" />
              <span>Expected Column Format:</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              <strong>Column 1:</strong> 12-digit DepEd LRN &bull; <strong>Column 2:</strong> Full Name &bull; <strong>Column 3:</strong> Section (optional if chosen below)
            </p>
            <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1 font-mono">
              e.g. 101234567890 &nbsp; Dela Cruz, Juan D. &nbsp; Diamond
            </p>
          </div>

          <div className="rounded-xl bg-gray-50 p-3 border border-gray-200 dark:border-gray-800 dark:bg-gray-800/40">
            <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Default Section
            </label>
            <select
              value={defaultSection}
              onChange={(e) => setDefaultSection(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white p-2 text-xs font-medium text-gray-800 outline-none transition focus:border-blue-600 dark:border-gray-700 dark:bg-gray-850 dark:text-gray-200"
            >
              <option value="">Use Section from pasted row</option>
              {sections.map((sec) => (
                <option key={sec.id} value={sec.name}>
                  {sec.name} (apply if missing)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Textarea Input */}
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Pasted Data ({parsedRows.length} rows detected)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-750 transition"
              >
                <Upload className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span>Upload CSV</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-750 transition"
              >
                <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Download template</span>
              </button>
            </div>
          </div>
          <textarea
            rows={6}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            disabled={isSubmitting}
            placeholder={`101234567891\tDela Cruz, Juan\tDiamond\n101234567892\tSantos, Maria\tDiamond\n101234567893\tReyes, Antonio\tEmerald`}
            className="w-full rounded-xl border border-gray-200 bg-gray-50/50 p-3 font-mono text-xs text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800 resize-y"
          />
          {isCapped && (
            <div className="mt-2 flex items-center gap-2 p-2.5 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                Input capped at 1,000 rows. The first 1,000 rows were loaded; {totalInputRows - 1000} row{totalInputRows - 1000 > 1 ? 's were' : ' was'} cut off.
              </span>
            </div>
          )}
        </div>

        {/* Preview Summary Pills */}
        {parsedRows.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              Total: {parsedRows.length}
            </span>
            <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Valid: {validRows.length}
            </span>
            {invalidRows.length > 0 && (
              <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Errors: {invalidRows.length}
              </span>
            )}
          </div>
        )}

        {/* Parsed Rows Preview Table */}
        {parsedRows.length > 0 && (
          <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 font-semibold">
                <tr>
                  <th className="p-2 w-12 text-center">#</th>
                  <th className="p-2">LRN</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Section</th>
                  <th className="p-2">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {parsedRows.map((r) => (
                  <tr
                    key={r.rowNum}
                    className={cn(
                      'transition',
                      r.isValid
                        ? 'hover:bg-gray-50/60 dark:hover:bg-gray-850/50'
                        : 'bg-rose-50/40 dark:bg-rose-950/20'
                    )}
                  >
                    <td className="p-2 text-center text-gray-400 font-mono text-[11px]">
                      {r.rowNum}
                    </td>
                    <td className="p-2 font-mono text-gray-800 dark:text-gray-200">
                      {r.rawLrn || <span className="text-gray-400 italic">Empty</span>}
                    </td>
                    <td className="p-2 font-medium text-gray-900 dark:text-gray-100">
                      {r.rawName || <span className="text-gray-400 italic">Empty</span>}
                    </td>
                    <td className="p-2 text-gray-700 dark:text-gray-300">
                      {r.normalizedSection || r.rawSection || (
                        <span className="text-gray-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="p-2">
                      {r.isValid ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> Ready
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                          <XCircle className="h-3.5 w-3.5 shrink-0" />
                          <span>{r.errors.join(', ')}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {insertProgress ? (
              <span className="flex items-center gap-2 text-blue-600 font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                {insertProgress}
              </span>
            ) : validRows.length > 0 ? (
              <span>
                Ready to enroll <strong>{validRows.length}</strong> learner
                {validRows.length > 1 ? 's' : ''} in batches of 200.
              </span>
            ) : (
              <span>Paste student rows above to validate and preview.</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleAttemptClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={isSubmitting || validRows.length === 0}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Enrolling...</span>
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  <span>Enroll {validRows.length > 0 ? validRows.length : ''} Learners</span>
                </>
              )}
            </button>
          </div>
        </div>
        </>
      )}
      </div>

      <ConfirmationModal
        isOpen={isDiscardModalOpen}
        onClose={() => setIsDiscardModalOpen(false)}
        onConfirm={() => {
          setIsDiscardModalOpen(false);
          handleReset();
        }}
        title="Discard pasted data?"
        description="You have entered student rows that have not been enrolled yet. Are you sure you want to discard them and exit?"
        actionType="neutral"
        confirmLabel="Discard Data"
        cancelLabel="Keep Editing"
      />
    </div>
  );
}
