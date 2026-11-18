'use client';

import { useEffect, useState } from 'react';
import { processOmrScan } from '@/features/omr/adapter';
import { createKitOmrTemplate } from '@/features/omr/templates/template-builder';

const EXPECTED_ANSWERS = [
  'A', 'B', 'C', 'D', 'B', 'A', 'C', 'D', 'B', 'A',
  'A', 'A', 'C', 'A', 'A', 'D', 'A', 'A', 'A', 'B',
  'D', 'D', 'D', 'A', 'C', 'B', 'B', 'B', 'C', 'C',
  'A', 'B', 'B', 'B', 'A', 'C', 'B', 'B', 'B', 'C',
  'B', 'C', 'D', 'A', 'D', 'B', 'D', 'B', 'D', 'D',
  'B', 'A', 'C', 'B', 'D', 'D', 'B', 'C', 'C', 'D',
];

export function OmrBrowserValidation() {
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [uploadReports, setUploadReports] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/omr-validation-fixture');
        if (!response.ok) throw new Error(`Fixture request failed (${response.status})`);
        const image = await response.blob();
        const template = createKitOmrTemplate({ itemCount: EXPECTED_ANSWERS.length });
        const result = await processOmrScan(image, template, { forceEngine: 'kit-optical-native' });
        const correct = result.normalizedAnswers.reduce(
          (count, answer, index) => count + Number(answer === EXPECTED_ANSWERS[index]),
          0,
        );
        const accuracy = correct / EXPECTED_ANSWERS.length;
        if (!cancelled) {
          setReport({
            outcome: result.openCvDiagnostics?.status === 'used' && accuracy >= 0.95 ? 'PASS' : 'FAIL',
            accuracy,
            correct,
            total: EXPECTED_ANSWERS.length,
            fiducialDetected: result.fiducialDetected,
            openCvDiagnostics: result.openCvDiagnostics,
            status: result.status,
            errorCode: result.errorCode,
            answers: result.items.map((item) => ({
              question: item.itemNumber,
              selected: item.selectedChoice,
              expected: EXPECTED_ANSWERS[item.itemNumber - 1],
              state: item.state,
              scores: item.scores,
            })),
          });
        }
      } catch (error) {
        if (!cancelled) setReport({ outcome: 'FAIL', error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const processUploadedFiles = async (files: File[]) => {
    const reports: Record<string, unknown>[] = [];
    setUploadReports([{ outcome: 'RUNNING', count: files.length }]);
    for (const file of files) {
      const name = file.name.toLowerCase();
      const itemCount = name.includes('sheet_63') ? 63
        : name.includes('sample_90') ? 90
        : name.includes('sample_30') ? 30
        : name.includes('multi_roll') ? 20
        : 60;
      const includeRollNumberGrid = name.includes('legacy_roll') || name.includes('multi_roll');
      try {
        const template = createKitOmrTemplate({ itemCount, includeRollNumberGrid });
        const result = await processOmrScan(file, template, { forceEngine: 'kit-optical-native' });
        const expected = name.includes('real_world_scan') || name.includes('codex-clipboard-ff4ca3c4')
          ? EXPECTED_ANSWERS
          : name.includes('marked_60') || name.includes('rotated_60')
            ? ['A', 'B', 'C', 'D', ...Array.from({ length: 56 }, () => null)]
            : null;
        const comparedCount = expected?.length || 0;
        const correct = expected
          ? result.normalizedAnswers.slice(0, comparedCount).reduce(
            (count, answer, index) => count + Number(answer === expected[index]), 0,
          )
          : null;
        reports.push({
          name: file.name,
          bytes: file.size,
          mimeType: file.type,
          fiducialDetected: result.fiducialDetected,
          detectedItems: result.items.length,
          status: result.status,
          errorCode: result.errorCode || null,
          failedRegion: result.failedRegion?.reason || null,
          detectedRollNumber: result.detectedRollNumber,
          openCv: result.openCvDiagnostics?.status || 'not-run',
          correct,
          compared: comparedCount || null,
          accuracy: comparedCount ? correct! / comparedCount : null,
        });
      } catch (error) {
        reports.push({ name: file.name, bytes: file.size, outcome: 'ERROR', error: error instanceof Error ? error.message : String(error) });
      }
    }
    setUploadReports(reports);
  };

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>OMR browser validation</h1>
      <pre data-testid="omr-browser-result">{report ? JSON.stringify(report) : 'RUNNING'}</pre>
      <label>
        Scan image fixtures
        <input
          data-testid="omr-file-input"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => void processUploadedFiles(Array.from(event.currentTarget.files || []))}
        />
      </label>
      <pre data-testid="omr-upload-results">{uploadReports.length ? JSON.stringify(uploadReports) : 'WAITING'}</pre>
    </main>
  );
}
