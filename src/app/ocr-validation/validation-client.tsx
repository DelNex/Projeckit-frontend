'use client';

import { extractLocalDocument } from '@/lib/local-document-engine';
import { useState } from 'react';

export function OcrValidationClient() {
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleFile(file?: File) {
    if (!file) return;
    setLoading(true);
    setError('');
    setResult('');
    try {
      const extracted = await extractLocalDocument(file);
      setResult(extracted.text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Local document extraction failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-8">
      <h1 className="text-2xl font-bold">Local OCR validation</h1>
      <p className="text-sm text-gray-600">Development-only test page. PDF processing runs in browser workers and uses same-origin OCR assets.</p>
      <input
        aria-label="Scanned PDF fixture"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      {loading && <p role="status">Extracting text locally…</p>}
      {error && <p role="alert">{error}</p>}
      <pre id="ocr-result" data-testid="ocr-result" className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border p-4 text-xs">{result}</pre>
    </main>
  );
}
