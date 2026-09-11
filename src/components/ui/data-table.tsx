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
import React, { useMemo, useState } from 'react';

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
}

export interface DataTableProps<TData, TValue = any> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  showPagination?: boolean;
  initialPageSize?: number;
  renderCustomFilter?: React.ReactNode;
}

export function DataTable<TData, TValue = any>({
  columns,
  data,
  searchKey,
  searchPlaceholder = 'Search records...',
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no records matching your current filter criteria.',
  className,
  showPagination = true,
  initialPageSize = 10,
  renderCustomFilter,
}: DataTableProps<TData, TValue>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [pageIndex, setPageIndex] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(initialPageSize);

  // 1. Filtered data
  const filteredData = useMemo(() => {
    if (!searchFilter.trim()) return data;
    const query = searchFilter.toLowerCase().trim();

    return data.filter((item: any) => {
      if (searchKey) {
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
  };

  return (
    <div className={cn('space-y-4 w-full min-w-0', className)}>
      {/* Table Toolbar: Search and Custom Filters */}
      {(searchKey || renderCustomFilter) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {searchKey && (
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
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
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-800/40 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {columns.map((col, idx) => {
                  const colKey = col.accessorKey || col.id || String(idx);
                  const isSorted = sortKey === colKey;
                  const canSort = col.sortable !== false && !!col.accessorKey;

                  return (
                    <th
                      key={colKey}
                      className={cn(
                        'px-4 sm:px-6 py-4 select-none whitespace-nowrap',
                        canSort &&
                          'cursor-pointer hover:bg-gray-100/60 dark:hover:bg-gray-800/80 transition-colors'
                      )}
                      onClick={() => canSort && handleSort(col.accessorKey)}
                    >
                      <div className="flex items-center gap-1.5">
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
                      className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors"
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
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                disabled={pageIndex === 0}
                className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 shadow-2xs hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 transition"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Prev</span>
              </button>

              <span className="px-2 font-medium">
                Page {pageIndex + 1} of {totalPages}
              </span>

              <button
                type="button"
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

