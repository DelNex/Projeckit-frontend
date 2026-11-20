:bg-gray-800"><p className="text-[10px] text-gray-500">Outstanding</p><p className="mt-0.5 text-sm font-bold text-gray-900 dark:text-white">{row.outstandingCount}</p></div>
                      <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-800"><p className="text-[10px] text-gray-500">Did not meet</p><p className="mt-0.5 text-sm font-bold text-gray-900 dark:text-white">{row.didNotMeetCount}</p></div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-left border-collapse table-fixed min-w-[640px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/60 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                      <th className="px-3 py-2.5 font-bold text-gray-700 dark:text-gray-300">Section Name</th>
                      <th className="px-2 py-2.5 w-20 text-center font-bold text-gray-700 dark:text-gray-300">Enrolled</th>
                      <th className="px-2 py-2.5 w-20 text-center font-bold text-gray-700 dark:text-gray-300">Scanned</th>
                      <th className="px-2 py-2.5 w-24 text-center font-bold text-blue-600 dark:text-blue-400">Mean (X̄)</th>
                      <th className="px-2 py-2.5 w-24 text-center font-bold text-gray-700 dark:text-gray-300">Std Dev (S)</th>
                      <th className="px-2 py-2.5 w-24 text-center font-bold text-gray-700 dark:text-gray-300">MPS %</th>
                      <th className="px-2 py-2.5 w-28 text-center font-bold text-emerald-600 dark:text-emerald-400">Outstanding</th>
                      <th className="px-2 py-2.5 w-28 text-center font-bold text-rose-600 dark:text-rose-400">Did Not Meet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-xs">
                    {consolidatedReportsData.map((row) => (
                      <tr
                        key={row.sectionName}
                        className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <td className="px-3 py-2 font-bold text-gray-900 dark:text-white">
                          {row.sectionName}
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-gray-600 dark:text-gray-300">
                          {row.enrolledStudents}
                        </td>
                        <td className="px-2 py-2 text-center font-mono font-bold text-gray-900 dark:text-white">
                          {row.scannedStudents}
                        </td>
                        <td className="px-2 py-2 text-center font-mono font-bold text-blue-600 dark:text-blue-400">
                          {row.meanScore !== null ? row.meanScore.toFixed(1) : '—'}
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-gray-600 dark:text-gray-300">
                          {row.standardDeviation !== null ? row.standardDeviation.toFixed(2) : '—'}
                        </td>
                        <td className="px-2 py-2 text-center font-mono font-bold">
                          {row.mps !== null ? (
                            <span className={row.mps >= 75 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                              {row.mps.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                          {row.outstandingCount}
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-rose-600 dark:text-rose-400 font-semibold">
                          {row.didNotMeetCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="h-96 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
          <span className="text-xs font-semibold text-gray-500">Loading analytics workspace...</span>
        </div>
      }
    >
      <AnalyticsContent />
    </Suspense>
  );
}
