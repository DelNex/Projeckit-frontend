'use client';

import { useEffect, useState } from 'react';
import { processOmrScan } from '@/features/omr/adapter';
import { createKitOmrTemplate } from '@/features/omr/templates/template-builder';
import { generateCanonicalGeometry } from '@/features/omr/geometry/canonical-geometry';
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
        // Match the assessment page's real template construction path rather
        // than testing a separately-created generic item-count template.
        const geometry = generateCanonicalGeometry({
          assessmentId: 'browser-validation-assessment',
          itemCount: EXPECTED_ANSWERS.length,
          classSize: 60,
        });
        const template = createKitOmrTemplate({ geometry });

        // A live camera frame is captured as a compressed JPEG Blob, while
        // file upload preserves the original image File. Exercise both paths.
        const bitmap = await createImageBitmap(image);
        const cameraCanvas = document.createElement('canvas');
        cameraCanvas.width = bitmap.width;
        cameraCanvas.height = bitmap.height;
        const cameraContext = cameraCanvas.getContext('2d');
        if (!cameraContext) throw new Error('Could not initialize camera-frame test canvas.');
        cameraContext.drawImage(bitmap, 0, 0);
        bitmap.close();
        const cameraBlob = await new Promise<Blob>((resolve, reject) => {
          cameraCanvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Could not encode camera-style JPEG frame.'));
          }, 'image/jpeg', 0.9);
        });

        const [cameraResult, uploadResult] = await Promise.all([
          processOmrScan(cameraBlob, template, { forceEngine: 'kit-optical-native' }),
          processOmrScan(
            new File([image], 'real_world_scan.png', { type: image.type || 'image/png' }),
            template,
            { forceEngine: 'kit-optical-native' },
          ),
        ]);
        const cameraDiagnostics = buildAnswerDiagnostics(cameraResult, EXPECTED_ANSWERS);
        const uploadDiagnostics = buildAnswerDiagnostics(uploadResult, EXPECTED_ANSWERS);
        const cameraValidation = cameraDiagnostics.validation!;
        const uploadValidation = uploadDiagnostics.validation!;
        const cameraPassed = cameraResult.fiducialDetected &&
          cameraResult.openCvDiagnostics?.status === 'used' &&
          cameraValidation.mismatches.length === 0 &&
          cameraValidation.correct === cameraValidation.compared;
        const uploadPassed = uploadResult.fiducialDetected &&
          uploadResult.openCvDiagnostics?.status === 'used' &&
          uploadValidation.mismatches.length === 0 &&
          uploadValidation.correct === uploadValidation.compared;
        const sameAnswers = JSON.stringify(cameraResult.normalizedAnswers) === JSON.stringify(uploadResult.normalizedAnswers) &&
          cameraResult.items.length === uploadResult.items.length;
        const outcome = cameraPassed && uploadPassed && sameAnswers ? 'PASS' : 'FAIL';
        if (!cancelled) {
          setReport({
            outcome,
            imageHash: uploadResult.imageHash,
            accuracy: uploadValidation.accuracy,
            correct: uploadValidation.correct,
            total: uploadValidation.compared,
            nullCount: uploadValidation.nullCount,
            mismatches: uploadValidation.mismatches,
            fiducialDetected: uploadResult.fiducialDetected,
            fiducialConfidence: uploadResult.fiducialConfidence,
            overallConfidence: uploadResult.overallConfidence,
            openCvDiagnostics: uploadResult.openCvDiagnostics,
            status: uploadResult.status,
            errorCode: uploadResult.errorCode,
            failedRegion: uploadResult.failedRegion || null,
            engineUsed: uploadResult.engineUsed,
            thresholdProfileVersion: uploadResult.thresholdProfileVersion,
            answers: diagnostics.answers,
            inputParity: {
              cameraBlob: { passed: cameraPassed, detectedItems: cameraResult.items.length, accuracy: cameraValidation.accuracy, mimeType: cameraBlob.type },
              uploadFile: { passed: uploadPassed, detectedItems: uploadResult.items.length, accuracy: uploadValidation.accuracy, mimeType: image.type },
              identicalHash: cameraResult.imageHash === uploadResult.imageHash,
              identicalAnswers: JSON.stringify(cameraResult.normalizedAnswers) === JSON.stringify(uploadResult.normalizedAnswers),
            },
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
