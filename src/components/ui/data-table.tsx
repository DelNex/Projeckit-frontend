r-pointer'
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
