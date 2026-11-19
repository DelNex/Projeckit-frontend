'use client';

import { useState } from 'react';
import { extractLocalDocument, type LocalDocumentProgress } from '@/lib/local-document-engine';

export function LocalOcrValidation() {
  const [result, setResult] = useState('WAITING');
  const [progress, setProgress] = useState('');

  const handleFile = async (file?: File) => {
    if (!file) return;
    setResult('RUNNING');
    setProgress('Starting local extraction…');
    try {
      const document = await extractLocalDocument(file, {
        onProgress: (value: LocalDocumentProgress) => setProgress(value.message),
      });
      setResult(JSON.stringify({
        outcome: 'PASS',
        name: document.name,
        text: document.text,
        lowConfidencePages: document.lowConfidencePages,
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
      <h2>Local document OCR validation</h2>
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
