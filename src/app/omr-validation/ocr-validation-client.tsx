'use client';

import { useState } from 'react';
import { extractTextFromFiles, type LessonExtractionProgress } from '@/lib/lesson-parser';

export function ServerOcrValidation() {
  const [result, setResult] = useState('WAITING');
  const [progress, setProgress] = useState('');

  const handleFile = async (file?: File) => {
    if (!file) return;
    setResult('RUNNING');
    setProgress('Uploading the file to the server…');
    try {
      const extraction = await extractTextFromFiles([file], {
        onProgress: (value: LessonExtractionProgress) => setProgress(value.message),
      });
      const document = extraction.documents[0];
      setResult(JSON.stringify({
        outcome: 'PASS',
        name: document.name,
        text: document.text,
        lowConfidencePages: document.lowConfidencePages || [],
        notice: extraction.notice,
      }));
    } catch (error) {
      setResult(JSON.stringify({
        outcome: 'FAIL',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  return (
    <section style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h2>Server-side document OCR validation</h2>
      <label>
        Upload a scanned PDF or photo
        <input
          data-testid="ocr-file-input"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"
          onChange={(event) => void handleFile(event.currentTarget.files?.[0])}
        />
      </label>
      <p data-testid="ocr-progress">{progress}</p>
      <pre data-testid="ocr-browser-result">{result}</pre>
    </section>
  );
}
