'use client';

import { cn } from '@/lib/utils';
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    ChevronLeft,
    ChevronRight,
    Inbox,
    Loader2,
    Search,
    X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

export interface ColumnDef<TData, TValue = any> {
  id?: string;
  accessorKey?: string;
  header: React.ReactNode | ((info: any) => React.ReactNode);
  cell?: (info: {
    row: {
      id: string;
      original: TData;
      getValue: (key: string) => any;
    };
  }) => React.ReactNode;
  sortable?: boolean;
  /** Hide this column from the compact card layout when it is secondary. */
  mobileHidden?: boolean;
}

export interface DataTableProps<TData, TValue = any> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string | string[];
  searchPlaceholder?: string;
  tableLabel?: string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  showPagination?: boolean;
  initialPageSize?: number;
  renderCustomFilter?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  onVisibleRowsChange?: (rows: TData[]) => void;
  onSearchChange?: (search: string) => void;
  /** Render readable record cards on phones instead of requiring sideways table scrolling. */
  mobileLayout?: 'scroll' | 'cards';
}

export function DataTable<TData, TValue = any>({
  columns,
  data,
  searchKey,
  searchPlaceholder = 'Search...',
  tableLabel = 'Data table',
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no records matching your current filter criteria.',
  className,
  showPagination = true,
  initialPageSize = 10,
  renderCustomFilter,
  onRowClick,
  onVisibleRowsChange,
  onSearchChange,
  mobileLayout = 'scroll',
}: DataTableProps<TData, TValue>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [pageIndex, setPageIndex] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(initialPageSize);
  const tableId = React.useId();

  // 1. Filtered data
  const filteredData = useMemo(() => {
    if (!searchFilter.trim()) return data;
    const query = searchFilter.toLowerCase().trim();

    return data.filter((item: any) => {
      if (searchKey) {
        if (Array.isArray(searchKey)) {
          return searchKey.some((key) => {
            const val = item[key];
            if (val === undefined || val === null) return false;
            return String(val).toLowerCase().includes(query);
          });
        }
        const val = item[searchKey];
        if (val === undefined || val === null) return false;
        return String(val).toLowerCase().includes(query);
      }
      // Global search across all fields of object
      return Object.values(item).some((val) => {
        if (val === undefined || val === null) return false;
        if (typeof val === 'object') return false;
        return String(val).toLowerCase().includes(query);
      });
    });
  }, [data, searchKey, searchFilter]);

  // 2. Sorted data
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return filteredData;

    return [...filteredData].sort((a: any, b: any) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortDirection === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
  }, [filteredData, sortKey, sortDirection]);

  // 3. Paginated data
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = useMemo(() => {
    if (!showPagination) return sortedData;
    const start = pageIndex * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, pageIndex, pageSize, showPagination]);

  useEffect(() => {
    onVisibleRowsChange?.(paginatedData);
  }, [paginatedData, onVisibleRowsChange]);

  // Keep the current page valid when a refresh, filter or archive action shrinks the dataset.
  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, Math.ceil(sortedData.length / pageSize) - 1)));
  }, [sortedData.length, pageSize]);

  // Toggle sorting on column
  const handleSort = (key?: string) => {
    if (!key) return;
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection('asc');
    } else if (sortDirection === 'asc') {
      setSortDirection('desc');
    } else {
      setSortKey(null);
      setSortDirection(null);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearchFilter(val);
    setPageIndex(0);
    onSearchChange?.(val);
  };

  return (
    <div className={cn('space-y-4 w-full min-w-0', className)}>
      {/* Table Toolbar: Search and Custom Filters */}
      {(searchKey || renderCustomFilter) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {searchKey && (
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <label className="sr-only" htmlFor={`${tableId}-search`}>Search {tableLabel.toLowerCase()}</label>
              <input
                id={`${tableId}-search`}
                type="search"
                value={searchFilter}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-9 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
              />
              {searchFilter && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {renderCustomFilter && (
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {renderCustomFilter}
            </div>
          )}
        </div>
      )}

      {/* Main Table Container */}
      <div className="rounded-2xl sm:rounded-3xl border border-gray-200 bg-white shadow-2xs dark:border-gray-800 dark:bg-gray-900 overflow-hidden min-w-0">
        {mobileLayout === 'scroll' && <p className="px-4 pt-3 text-[11px] text-gray-500 sm:hidden" aria-hidden="true">Swipe sideways to see all columns</p>}
        {mobileLayout === 'cards' && (
          <div className="grid gap-3 p-3 sm:hidden" role="list" aria-label={`${tableLabel} records`}>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500" role="status"><Loader2 className="h-5 w-5 animate-spin" />Loading records…</div>
            ) : paginatedData.length ? paginatedData.map((item, rowIdx) => {
              const rowId = (item as any)?.id || String(rowIdx);
              const rowObj = { id: rowId, original: item, getValue: (key: string) => (item as any)?.[key] };
              return (
                <article
                  key={rowId}
                  role={onRowClick ? 'link' : 'listitem'}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={onRowClick ? `Open ${tableLabel} record ${rowIdx + 1}` : undefined}
                  onClick={(event) => {
                    if (!onRowClick || (event.target as HTMLElement).closest('a,button,input,select,textarea,[role="button"]')) return;
                    onRowClick(item);
                  }}
                  onKeyDown={(event) => {
                    if (!onRowClick || (event.key !== 'Enter' && event.key !== ' ')) return;
                    if ((event.target as HTMLElement).closest('a,button,input,select,textarea,[role="button"]')) return;
                    event.preventDefault();
                    onRowClick(item);
                  }}
                  className={cn('min-w-0 rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900', onRowClick && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600')}
                >
                  {columns.filter((col) => !col.mobileHidden).map((col, colIdx) => {
                    const label = typeof col.header === 'string' ? col.header : col.accessorKey || col.id || `Field ${colIdx + 1}`;
                    return (
                      <div key={col.accessorKey || col.id || colIdx} className={cn('flex min-w-0 items-start justify-between gap-3 py-2', colIdx > 0 && 'border-t border-gray-100 dark:border-gray-800')}>
                        <span className="w-28 shrink-0 pt-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</span>
                        <div className="min-w-0 flex-1 text-right text-xs text-gray-900 dark:text-gray-100 [&>*]:max-w-full [&>*]:min-w-0">
                          {col.cell ? col.cell({ row: rowObj }) : col.accessorKey ? String((item as any)?.[col.accessorKey] ?? '—') : '—'}
                        </div>
                      </div>
                    );
                  })}
                </article>
              );
            }) : (
              <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center dark:border-gray-700">
                <Inbox className="mx-auto mb-2 h-7 w-7 text-gray-400" />
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{emptyTitle}</p>
                <p className="mt-1 text-xs text-gray-500">{emptyDescription}</p>
              </div>
            )}
          </div>
        )}
        <div className={cn('pk-data-table-scroll overflow-x-auto custom-scrollbar touch-pan-x focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500', mobileLayout === 'cards' && 'hidden sm:block')} tabIndex={0} role="region" aria-label={`${tableLabel}. Use the table view to compare all columns.`}>
          <table className="w-full text-left text-xs border-collapse" style={{ minWidth: `${Math.max(560, columns.length * 112)}px` }}>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-800/40 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {columns.map((col, idx) => {
                  const colKey = col.accessorKey || col.id || String(idx);
                  const isSorted = sortKey === colKey;
                  const canSort = col.sortable !== false && !!col.accessorKey;

                  return (
                    <th
                      key={colKey}
                      aria-sort={isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={cn(
                        'px-4 sm:px-6 py-4 select-none whitespace-nowrap',
                        canSort && 'hover:bg-gray-100/60 dark:hover:bg-gray-800/80 transition-colors'
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {canSort ? <button type="button" onClick={() => handleSort(col.accessorKey)} className="inline-flex items-center gap-1.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={`Sort by ${typeof col.header === 'string' ? col.header : col.accessorKey}`}>
                        <span>
                          {typeof col.header === 'function'
                            ? col.header({})
                            : col.header}
                        </span>
                        {canSort && (
                          <span className="text-gray-400">
                            {isSorted && sortDirection === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                            ) : isSorted && sortDirection === 'desc' ? (
                              <ArrowDown className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40 hover:opacity-100" />
                            )}
                          </span>
                        )}
                        </button> : <span>{typeof col.header === 'function' ? col.header({}) : col.header}</span>}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="py-16 text-center text-gray-400"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-medium">Loading data...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length > 0 ? (
                paginatedData.map((item, rowIdx) => {
                  const rowId = (item as any)?.id || String(rowIdx);
                  const rowObj = {
                    id: rowId,
                    original: item,
                    getValue: (key: string) => (item as any)?.[key],
                  };

                  return (
                    <tr
                      key={rowId}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest('a,button,input,select,textarea,[role="button"]')) return;
                        onRowClick?.(item);
                      }}
                      onKeyDown={(event) => {
                        if (!onRowClick || (event.key !== 'Enter' && event.key !== ' ')) return;
                        if ((event.target as HTMLElement).closest('a,button,input,select,textarea,[role="button"]')) return;
                        event.preventDefault();
                        onRowClick(item);
                      }}
                      tabIndex={onRowClick ? 0 : undefined}
                      aria-label={onRowClick ? `Open ${tableLabel} record ${rowIdx + 1}` : undefined}
                      className={cn(
                        'hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors',
                        onRowClick && 'cursor-pointer'
                      )}
                    >
                      {columns.map((col, colIdx) => (
                        <td
                          key={col.accessorKey || col.id || colIdx}
                          className="px-4 sm:px-6 py-4"
                        >
                          {col.cell
                            ? col.cell({ row: rowObj })
                            : col.accessorKey
                            ? String((item as any)?.[col.accessorKey] ?? '')
                            : null}
                        </td>
                      ))}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="py-16 text-center text-gray-400"
                  >
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto px-4">
                      <Inbox className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {emptyTitle}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {emptyDescription}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {showPagination && !loading && sortedData.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-100 dark:border-gray-800 px-4 sm:px-6 py-3.5 bg-gray-50/40 dark:bg-gray-900/40 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <span>
                Showing{' '}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {pageIndex * pageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {Math.min((pageIndex + 1) * pageSize, sortedData.length)}
                </span>{' '}
                of{' '}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {sortedData.length}
                </span>{' '}
                results
              </span>

              <div className="hidden sm:flex items-center gap-1.5 ml-4">
                <span>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPageIndex(0);
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 outline-none transition focus:border-blue-500 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-200"
                >
                  {[10, 20, 30, 50].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Go to previous page"
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                disabled={pageIndex === 0}
                className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 shadow-2xs hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 transition"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Prev</span>
              </button>

              <span className="px-2 font-medium" aria-live="polite" aria-atomic="true">
                Page {pageIndex + 1} of {totalPages}
              </span>

              <button
                type="button"
                aria-label="Go to next page"
                onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                disabled={pageIndex >= totalPages - 1}
                className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 shadow-2xs hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 transition"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}