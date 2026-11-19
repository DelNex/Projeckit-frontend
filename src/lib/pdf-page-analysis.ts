export type PdfPageOcrSignal = {
  textLength: number;
  imageOperatorCount: number;
};

/**
 * A page containing a raster image but almost no selectable text is likely a
 * scan. This is a conservative detector, not an OCR confidence score.
 */
export function isLikelyScannedPdfPage(signal: PdfPageOcrSignal): boolean {
  return Number.isFinite(signal.textLength)
    && Number.isFinite(signal.imageOperatorCount)
    && signal.textLength >= 0
    && signal.imageOperatorCount > 0
    && signal.textLength < 16;
}
