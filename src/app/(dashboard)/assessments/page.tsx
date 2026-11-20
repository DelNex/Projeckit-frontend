 dark:bg-gray-900 dark:text-gray-300"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="READY">Ready</option>
              <option value="ADMINISTERED">Administered</option>
              <option value="EVALUATED">Evaluated</option>
            </select>
          </div>
        }
      />

      {/* New Assessment Modal Dialog */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Create New Assessment
              </h3>
              <button type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {availableTosList.length === 0 ? (
              <div className="text-center py-6 space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                    Table of Specifications (TOS) Required
                  </h4>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    Every assessment requires a finished Table of Specifications first. Please define competencies and test blueprint in the TOS workspace before creating an assessment.
                  </p>
                </div>
                <div className="pt-2">
                  <Link
                    href="/tos"
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create a Table of Specifications first</span>
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateAssessment} className="space-y-4 pt-4 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-gray-700 dark:text-gray-300">
                      Select Table of Specifications (TOS) <span className="text-red-500">*</span>
                    </label>
                    <Link
                      href="/tos"
                      className="text-[11px] font-semibold text-blue-600 hover:underline inline-flex items-center gap-0.5 dark:text-blue-400"
                    >
                      <span>TOS Workspace</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  <select
                    required
                    value={selectedTosId}
                    onChange={(e) => handleSelectTos(e.target.value)}
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">-- Choose an existing TOS blueprint --</option>
                    {availableTosList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.subject} ({t.term} · {t.school_year} · {t.target_items} items)
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTos && (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 p-2.5 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>
                        Linked to TOS: <strong className="font-semibold">{selectedTos.subject}</strong>
                      </span>
                    </div>
                    <Link
                      href="/tos"
                      target="_blank"
                      className="font-bold underline text-blue-600 hover:text-blue-800 dark:text-blue-400 inline-flex items-center gap-1"
                    >
                      <span>View TOS</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                )}

                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Assessment Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Midterm Examination in General Mathematics"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Subject (Inherited from TOS)
                    </label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={selectedTos ? selectedTos.subject : (subjectsList.find((s) => s.id === newSubjectId)?.name || 'Select TOS first')}
                      className="h-10 w-full rounded-xl border border-gray-200 bg-gray-100 px-3 text-xs text-gray-600 cursor-not-allowed dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Sections in this TOS <span className="text-red-500">*</span>
                    </label>
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-800">
                      {(selectedTos?.sections || []).map((section) => (
                        <label key={section.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-white dark:text-gray-200 dark:hover:bg-gray-700">
                          <input type="checkbox" checked={selectedSectionIds.includes(section.id)} onChange={() => {
                            setSelectedSectionIds((current) => current.includes(section.id) ? current.filter((id) => id !== section.id) : [...current, section.id]);
                          }} />
                          <span>{section.name}</span>
                        </label>
                      ))}
                      {!selectedTos?.sections?.length && <p className="px-2 py-1 text-[11px] text-amber-700">This TOS has no saved sections. Edit the TOS and select its sections before creating an assessment.</p>}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">One linked assessment will be created for each selected section.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Target Items (Inherited from TOS)
                    </label>
                    <input
                      type="number"
                      readOnly
                      disabled
                      value={newTargetItems}
                      className="h-10 w-full rounded-xl border border-gray-200 bg-gray-100 px-3 text-xs text-gray-600 cursor-not-allowed dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Class Size / Roll (1–70)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={70}
                      required
                      value={newClassSize}
                      onChange={(e) => setNewClassSize(Number(e.target.value))}
                      className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Term (Inherited from TOS)
                    </label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={newTerm}
                      className="h-10 w-full rounded-xl border border-gray-200 bg-gray-100 px-3 text-xs text-gray-600 cursor-not-allowed dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                      School Year (Inherited from TOS)
                    </label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={newSchoolYear}
                      className="h-10 w-full rounded-xl border border-gray-200 bg-gray-100 px-3 text-xs text-gray-600 cursor-not-allowed dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Passing MPS (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      max={100}
                      required
                      value={newPassingMps}
                      onChange={(e) => setNewPassingMps(Number(e.target.value))}
                      className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !selectedTosId}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    <span>{submitting ? 'Creating...' : 'Save Assessment'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Link TOS Modal Dialog for unlinked assessments */}
      {linkTosModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Link2 className="h-5 w-5 text-blue-600" />
                Link Table of Specifications
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Attach a finished Table of Specifications to &quot;{linkTosModal.assessment?.title}&quot;.
              </p>
            </div>

            {availableTosList.length === 0 ? (
              <div className="text-center py-4 space-y-3">
                <p className="text-xs text-gray-500">No available Table of Specifications documents found.</p>
                <Link
                  href="/tos"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create a TOS First</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Select TOS Document
                  </label>
                  <select
                    value={linkTosModal.selectedTosId}
                    onChange={(e) => setLinkTosModal((prev) => ({ ...prev, selectedTosId: e.target.value }))}
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                  >
                    {availableTosList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.subject} ({t.term} · {t.school_year} · {t.target_items} items)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => setLinkTosModal({ isOpen: false, assessment: null, selectedTosId: '', saving: false })}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={linkTosModal.saving || !linkTosModal.selectedTosId}
                    onClick={handleConfirmLinkTos}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {linkTosModal.saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    <span>{linkTosModal.saving ? 'Linking...' : 'Link TOS'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Assessment Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmDelete}
        title={deleteModal.assessment ? `Delete "${deleteModal.assessment.title}"?` : 'Delete Assessment?'}
        description="This action permanently removes the assessment and cannot be undone."
        actionType="delete"
        entityName="assessment"
        affectedCount={1}
        impactTitle={deleteModal.impactTitle}
        impactText={deleteModal.impactText}
        confirmTextMatch={deleteModal.confirmTextMatch}
        isLoading={deleteModal.isLoading}
      />
    </div>
  );
}

export default function AssessmentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
          <span className="text-xs">Loading assessments workspace...</span>
        </div>
      }
    >
      <AssessmentsContent />
    </Suspense>
  );
}
