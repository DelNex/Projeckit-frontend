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

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>OMR browser validation</h1>
      <pre data-testid="omr-browser-result">{report ? JSON.stringify(report) : 'RUNNING'}</pre>
    </main>
  );
}
