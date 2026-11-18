'use client';

import { useEffect, useState } from 'react';
import { processOmrScan } from '@/features/omr/adapter';
import { createKitOmrTemplate } from '@/features/omr/templates/template-builder';
import expectedAnswerSets from '@/features/omr/__tests__/fixtures/expected-answers.json';

type ExpectedAnswer = string | null;
type ExpectedAnswerSets = Record<string, ExpectedAnswer[]>;

const EXPECTED_ANSWERS = (expectedAnswerSets as ExpectedAnswerSets)['real_world_scan.png'];

function expectedFor(name: string): ExpectedAnswer[] | null {
  const exact = (expectedAnswerSets as ExpectedAnswerSets)[name];
  if (exact) return exact;
  // Phone screenshots supplied to the browser test use generated names.
  if (name.includes('codex-clipboard-ff4ca3c4')) return EXPECTED_ANSWERS;
  return null;
}

function buildAnswerDiagnostics(result: Awaited<ReturnType<typeof processOmrScan>>, expected: ExpectedAnswer[] | null) {
  const diagnosticCount = Math.max(result.items.length, expected?.length ?? 0);
  const answers = Array.from({ length: diagnosticCount }, (_, index) => {
    const item = result.items[index];
    return {
      question: index + 1,
      selected: item?.selectedChoice ?? null,
      expected: expected?.[index] ?? null,
      hasExpected: Boolean(expected && index < expected.length),
      state: item?.state ?? 'MISSING_ITEM',
      confidence: item?.confidence ?? 0,
      scores: item?.scores ?? null,
      measurementDetails: item?.measurementDetails ?? null,
    };
  });
  const mismatches = expected
    ? expected.flatMap((answer, index) => {
      const item = answers[index];
      const expectedState = answer === null ? 'BLANK' : 'MARKED';
      return item && item.selected === answer && item.state === expectedState ? [] : [{
        question: index + 1,
        expected: answer,
        actual: item?.selected ?? null,
        expectedState,
        actualState: item?.state ?? 'MISSING_ITEM',
        scores: item?.scores ?? null,
        measurementDetails: item?.measurementDetails ?? null,
      }];
    })
    : [];
  const nullCount = result.normalizedAnswers.filter((answer) => answer === null).length;
  return {
    answers,
    validation: expected ? {
      compared: expected.length,
      correct: expected.length - mismatches.length,
      nullCount,
      expectedNullCount: expected.filter((answer) => answer === null).length,
      mismatches,
      accuracy: expected.length ? (expected.length - mismatches.length) / expected.length : null,
    } : null,
  };
}

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
        const diagnostics = buildAnswerDiagnostics(result, EXPECTED_ANSWERS);
        const validation = diagnostics.validation!;
        const outcome = result.fiducialDetected &&
          result.openCvDiagnostics?.status === 'used' &&
          validation.mismatches.length === 0 &&
          validation.correct === validation.compared ? 'PASS' : 'FAIL';
        if (!cancelled) {
          setReport({
            outcome,
            imageHash: result.imageHash,
            accuracy: validation.accuracy,
            correct: validation.correct,
            total: validation.compared,
            nullCount: validation.nullCount,
            mismatches: validation.mismatches,
            fiducialDetected: result.fiducialDetected,
            fiducialConfidence: result.fiducialConfidence,
            overallConfidence: result.overallConfidence,
            openCvDiagnostics: result.openCvDiagnostics,
            status: result.status,
            errorCode: result.errorCode,
            engineUsed: result.engineUsed,
            thresholdProfileVersion: result.thresholdProfileVersion,
            answers: diagnostics.answers,
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
      try {
        const template = createKitOmrTemplate({ itemCount });
        const result = await processOmrScan(file, template, { forceEngine: 'kit-optical-native' });
        const expected = expectedFor(file.name);
        const diagnostics = buildAnswerDiagnostics(result, expected);
        const validation = diagnostics.validation;
        reports.push({
          name: file.name,
          bytes: file.size,
          mimeType: file.type,
          imageHash: result.imageHash,
          fiducialDetected: result.fiducialDetected,
          fiducialConfidence: result.fiducialConfidence,
          overallConfidence: result.overallConfidence,
          detectedItems: result.items.length,
          status: result.status,
          errorCode: result.errorCode || null,
          failedRegion: result.failedRegion || null,
          detectedRollNumber: result.detectedRollNumber,
          openCv: result.openCvDiagnostics?.status || 'not-run',
          openCvDiagnostics: result.openCvDiagnostics || null,
          engineUsed: result.engineUsed,
          thresholdProfileVersion: result.thresholdProfileVersion || null,
          nullCount: result.normalizedAnswers.filter((answer) => answer === null).length,
          answers: diagnostics.answers,
          validation,
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
