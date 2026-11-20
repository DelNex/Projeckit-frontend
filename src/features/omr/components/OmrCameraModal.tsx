tem}
              onSave={handleSave}
              onScanAnother={handleScanAnother}
              isSaving={isSaving}
              isAnswerKeyMode={isAnswerKey}
            />
          ) : (
            <div className="flex flex-1 flex-col gap-2 min-h-0">
              {/* Step 1 Barcode Identified / Action Bar */}
              {phase === 'identify' && (
                <div className="shrink-0 flex items-center justify-between gap-2 rounded-xl bg-gray-800/90 border border-gray-700/80 px-2.5 py-1.5 text-xs">
                  {matchedStudent ? (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        <UserCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span className="truncate text-xs">
                          Learner: <strong className="text-white">{matchedStudent.name}</strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={proceedToOmrScan}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-xs font-bold text-white shrink-0 shadow-sm"
                      >
                        <span>Next</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <select
                        value={selectedStudentId}
                        onChange={(e) => {
                          setSelectedStudentId(e.target.value);
                          setErrorMessage(null);
                        }}
                        className="flex-1 min-w-0 rounded-lg bg-gray-900 border border-gray-700 px-2 py-1 text-xs text-white truncate"
                      >
                        <option value="">
                          {detectedBarcode ? `Barcode: ${detectedBarcode.rawValue} (Select learner)` : '— Or select student manually —'}
                        </option>
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} {s.lrn ? `• ${s.lrn}` : ''}
                          </option>
                        ))}
                      </select>
                      {(selectedStudentId || detectedBarcode) && (
                        <button
                          type="button"
                          onClick={proceedToOmrScan}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-xs font-bold text-white shrink-0 shadow-sm"
                        >
                          <span>{selectedStudentId ? 'Next' : 'Scan Sheet'}</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Step 2 Target Student Strip */}
              {phase === 'scan' && !isAnswerKey && (
                <div className="shrink-0 flex items-center justify-between px-2 py-0.5 text-xs text-gray-300">
                  <span className="truncate">
                    Target: <strong className="text-white">{matchedStudent?.name || 'Assigned Student'}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPhase('identify')}
                    className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 underline shrink-0 ml-2"
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Viewfinder Component */}
              <CameraViewfinder
                videoRef={videoRef}
                cameraState={cameraState}
                qualityMetrics={qualityMetrics}
                detectedBarcode={detectedBarcode}
                matchedStudentName={matchedStudent?.name}
                onCapture={handleCapture}
                onCycleCamera={cycleCamera}
                onRetryCamera={() => void startStream()}
                onUploadFile={handleUploadFile}
                onClose={onClose}
                isProcessing={isProcessing}
                capturePrompt={Boolean(readyFrame)}
                statusMessage={statusMessage || undefined}
                isAnswerKeyMode={isAnswerKey}
                mode={phase === 'identify' ? 'barcode' : 'omr'}
                hasTorch={cameraState.hasTorch}
                isTorchOn={cameraState.isTorchOn}
                onToggleTorch={toggleTorch}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
