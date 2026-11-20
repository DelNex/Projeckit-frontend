dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {editingStudent ? 'Edit Learner' : 'Add New Learner'}
              </h3>
              <button
                type="button"
                onClick={handleAttemptCloseAddModal}
                className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-4 pt-4 text-xs">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 space-y-2">
                  <p>{formError}</p>
                  {archivedDuplicateId && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleRestoreDirectly(archivedDuplicateId)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Restore Learner</span>
                    </button>
                  )}
                </div>
              )}

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Learner Full Name
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Juan D. Dela Cruz"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 p-3 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  DepEd 12-Digit LRN
                </label>
                <input
                  type="text"
                  required
                  maxLength={12}
                  pattern="\d{12}"
                  value={formLrn}
                  onChange={(e) => {
                    setFormLrn(e.target.value.replace(/\D/g, ''));
                    if (archivedDuplicateId) setArchivedDuplicateId(null);
                    if (formError) setFormError(null);
                  }}
                  placeholder="e.g. 101234567890"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 p-3 font-mono text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
                />
                <span className="text-[10px] text-gray-400 mt-1 block">
                  Must be exactly 12 numeric digits matching LIS registry.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Section Assignment
                </label>
                <select
                  value={formSection}
                  onChange={(e) => setFormSection(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 p-3 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
                >
                  {sectionsList.map((sec) => (
                    <option key={sec.id} value={sec.name}>
                      {sec.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={handleAttemptCloseAddModal}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>{editingStudent ? 'Save Changes' : 'Enroll Learner'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discard Unsaved Changes Confirmation Modal */}
      <ConfirmationModal
        isOpen={isDiscardModalOpen}
        onClose={() => setIsDiscardModalOpen(false)}
        onConfirm={handleConfirmDiscard}
        title="Discard unsaved changes?"
        description="You have entered learner details that will be lost if you exit now. Are you sure you want to discard them?"
        actionType="neutral"
        confirmLabel="Discard Changes"
        cancelLabel="Keep Editing"
      />

      {/* Bulk Add Learners Modal */}
      <BulkAddStudentsModal
        isOpen={isBulkAddOpen}
        onClose={() => setIsBulkAddOpen(false)}
        onSuccess={() => fetchStudents()}
        existingStudents={students}
        sections={sectionsList}
      />
    </div>
  );
}
