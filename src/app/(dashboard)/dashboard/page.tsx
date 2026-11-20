          className="font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 inline-flex items-center gap-1"
            >
              <span>Manage Learners</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Assessment Operations Table Matching Legacy Structure */}
      <div className="p-5 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-600" />
              Recent Assessment Operations
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Latest parsed answer sheet scans and computational runs
            </p>
          </div>
          <Link
            href="/assessments"
            className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400 inline-flex items-center gap-1"
          >
            <span>View All Assessments</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
            <span className="text-xs">Loading assessment records...</span>
          </div>
        ) : assessments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">No assessments found</p>
            <p className="text-xs text-gray-400 max-w-sm mt-1 mb-4">
              Get started by creating a Table of Specifications (TOS) first to define learning competencies and days taught before generating exams.
            </p>
            <Link
              href="/tos"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              <span>Create Table of Specifications First</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 sm:mx-0">
            <table className="w-full text-left text-xs min-w-[620px]">
              <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 sm:px-6 py-3.5">File / Assessment Name</th>
                  <th className="px-4 sm:px-6 py-3.5">Section &amp; Strand</th>
                  <th className="px-4 sm:px-6 py-3.5">Academic Term</th>
                  <th className="px-4 sm:px-6 py-3.5 text-center">Calculated MPS</th>
                  <th className="px-4 sm:px-6 py-3.5 text-center">Status</th>
                  <th className="px-4 sm:px-6 py-3.5 text-right">Workspace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {assessments.slice(0, 8).map((a) => (
                  <tr
                    key={a.id}
                    className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <td className="px-4 sm:px-6 py-4 font-bold text-gray-900 dark:text-white max-w-xs truncate">
                      <div className="flex flex-col">
                        <span className="truncate">{a.title}</span>
                        <span className="text-[10px] text-gray-400 font-normal">
                          {a.subjectCode} • {a.targetItems} items
                        </span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600 dark:text-gray-300">
                      <span className="font-semibold text-gray-800 dark:text-gray-200">
                        {a.sectionName}
                      </span>
                      {a.strand ? ` (${a.strand})` : ''}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-500 dark:text-gray-400 font-medium">
                      {a.term} • {a.schoolYear}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center">
                      {a.calculatedMps !== null ? (
                        <span
                          className={`font-mono font-bold text-xs px-2.5 py-1 rounded-full ${
                            a.calculatedMps >= 75.0
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : a.calculatedMps >= 60.0
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                          }`}
                        >
                          {a.calculatedMps}%
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400 font-medium italic">
                          Pending Scans
                        </span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          a.status === 'ACTIVE' || a.status === 'FINALIZED'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-right">
                      <Link
                        href={`/assessments/${a.id}`}
                        className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      >
                        <span>Open</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
