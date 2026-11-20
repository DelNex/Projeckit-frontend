'like'}
                        >
                          <ThumbsUp className="h-3 w-3" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleFeedback(msg.id, 'dislike')}
                          className={cn(
                            'p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition',
                            msg.feedback === 'dislike' && 'text-red-500 font-bold'
                          )}
                          title="Not helpful"
                          aria-label="Mark response not helpful"
                          aria-pressed={msg.feedback === 'dislike'}
                        >
                          <ThumbsDown className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 mt-0.5">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggested Prompt Chips */}
          <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/50 sm:px-6">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0 mr-1">
                Suggested:
              </span>
              {suggestedChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(chip)}
                  disabled={isStreaming}
                  className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-2 text-[11px] font-medium text-gray-700 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 transition"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Composer / Input Area */}
          <div className="shrink-0 border-t border-gray-100 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 dark:border-gray-800 sm:p-4">
            {uploadMessage && (
              <div className="mb-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" />
                <span>{uploadMessage}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-end gap-2"
              aria-label="Send a message to AI Copilot"
            >
              {/* File upload button */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf,.docx,.txt,.md"
                className="sr-only"
                aria-label="Attach a curriculum or module document"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile || isStreaming}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 transition"
                aria-label="Attach curriculum or module document"
                title="Attach Curriculum / Module document (PDF, DOCX, TXT)"
              >
                {uploadingFile ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </button>

              <textarea
                rows={1}
                aria-label="Message AI Copilot"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  activeContextTitle
                    ? `Ask anything about ${activeContextTitle}...`
                    : 'Ask anything about assessments, TOS, or psychometrics...'
                }
                disabled={isStreaming}
                className="max-h-32 min-h-11 flex-1 resize-y rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:border-blue-500 sm:px-4"
              />

              {isStreaming ? (
                <button type="button" onClick={handleStopGeneration} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700" aria-label="Stop generating response" title="Stop generating">
                  <StopCircle className="h-5 w-5" />
                </button>
              ) : (
                <button type="submit" disabled={!inputQuery.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40" aria-label="Send message">
                  <Send className="h-4 w-4" />
                </button>
              )}
            </form>
          </div>
        </div>

        {/* Collapsible System Info Drawer */}
        {showSidebar && (
          <>
          <button type="button" className="absolute inset-0 z-10 bg-black/30 sm:hidden" aria-label="Close AI system information" onClick={() => setShowSidebar(false)} />
          <div id={`${dialogId}-system-info`} className="absolute inset-x-0 bottom-0 z-20 max-h-[72%] w-full shrink-0 overflow-y-auto rounded-t-2xl border-t border-gray-100 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] dark:border-gray-800 dark:bg-gray-900 sm:static sm:inset-auto sm:max-h-none sm:w-80 sm:rounded-none sm:border-l sm:border-t-0 sm:bg-gray-50/60 sm:p-5 sm:pb-5 sm:dark:bg-gray-900/60 custom-scrollbar text-xs">
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-inherit pb-3 dark:border-gray-800">
              <span className="font-bold text-gray-900 dark:text-white">AI Engine Info</span>
              <button
                type="button"
                onClick={() => setShowSidebar(false)}
                aria-label="Close AI system information"
                className="flex h-10 w-10 items-center justify-center rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingInfo ? (
              <div className="py-8 text-center text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                <span>Loading engine stats...</span>
              </div>
            ) : (
              <div className="space-y-4 pt-4">
                {/* System Section */}
                <div>
                  <h4 className="font-bold text-gray-400 uppercase text-[10px] tracking-wider mb-2">
                    System
                  </h4>
                  <div className="space-y-1.5 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-800">
                    <div className="flex justify-between">
                      <span className="text-gray-500">AI Version</span>
                      <span className="font-mono font-semibold text-gray-900 dark:text-white">
                        {aiInfo?.aiVersion || '2.0.4-deped'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Planner</span>
                      <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {aiInfo?.planner?.status || 'Active'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">System Prompt</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {aiInfo?.systemPromptLoaded ? 'Loaded' : 'Standard'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Registered Tools</span>
                      <span className="font-mono font-semibold text-gray-900 dark:text-white">
                        {aiInfo?.toolCount ?? 8}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Session Section */}
                <div>
                  <h4 className="font-bold text-gray-400 uppercase text-[10px] tracking-wider mb-2">
                    Session
                  </h4>
                  <div className="space-y-1.5 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-800">
                    <div className="flex justify-between">
                      <span className="text-gray-500">School</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {aiInfo?.session?.tenantName || 'School'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">User Role</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {aiInfo?.session?.role || 'TEACHER'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Available Tools */}
                <div>
                  <h4 className="font-bold text-gray-400 uppercase text-[10px] tracking-wider mb-2">
                    Available Tools
                  </h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {(aiInfo?.tools || [
                      { name: 'tos.inspect', description: 'Table of specifications evaluator' },
                      { name: 'results.calculate', description: 'Psychometric item difficulty & discrimination calculator' },
                      { name: 'remediation.generate', description: 'Generates targeted learner practice items' },
                      { name: 'module.rag', description: 'Searches uploaded textbook modules' },
                    ]).map((t, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-gray-100 bg-white p-2 text-[11px] dark:border-gray-800 dark:bg-gray-800"
                      >
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                          {t.name || t.id}
                        </span>
                        <p className="text-gray-500 dark:text-gray-400 text-[10px] mt-0.5">
                          {t.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
