/**
 * Project KIT — Universal Multi-Engine Barcode Decoder
 * Dual Engine Architecture:
 * 1. Native BarcodeDetector API (fast GPU/OS-accelerated path for Chromium/Android)
 * 2. Pure JS/WASM ZXing Library (universal fallback for iOS Safari, Firefox, and webviews)
 * 3. Vector SVG Attribute Extractor (for uploaded digital template assets)
 */

import { DecodedBarcode, SupportedBarcodeFormat } from './barcode-types';

let zxingReaderInstance: any = null;
let zxingHintsInstance: any = null;

/**
 * Parses DepEd ProjectKit barcode standards:
 * - K<assessmentCode>-<studentCode> (e.g. K8F12C-A4091B)
 * - KIT:<assessmentId>:<studentId>
 * - LRN:<12-digit Learner Reference Number>
 */
export function parseProjectKitBarcodePayload(rawValue: string): {
  assessmentId?: string;
  studentId?: string;
  studentLrn?: string;
} {
  const trimmed = rawValue.trim();
  if (!trimmed) return {};

  // DepEd short code: K<assessment>-<student>
  const matchK = trimmed.match(/^K([0-9A-Fa-f]{4,10})-([0-9A-Fa-f]{4,10})$/i);
  if (matchK) {
    return {
      assessmentId: matchK[1].toUpperCase(),
      studentId: matchK[2].toUpperCase(),
    };
  }

  // UUID-based pattern KIT:<assessmentUuid>:<studentUuid>
  const matchKit = trimmed.match(/^KIT:([a-z0-9-]+):([a-z0-9-]+)$/i);
  if (matchKit) {
    return {
      assessmentId: matchKit[1],
      studentId: matchKit[2],
    };
  }

  // DepEd Learner Reference Number (LRN) or numeric student ID (6 to 14 digits, e.g. "15472304")
  const matchLrn = trimmed.match(/^(?:LRN:?)?(\d{6,14})$/i);
  if (matchLrn) {
    return {
      studentLrn: matchLrn[1],
      studentId: matchLrn[1],
    };
  }

  return {};
}

/**
 * Convenience extractor for DepEd ProjectKit barcode standards.
 */
export function extractDepEdBarcodePayload(rawValue: string): {
  assessmentId?: string;
  studentId?: string;
  studentLrn?: string;
} {
  const parsed = parseProjectKitBarcodePayload(rawValue);
  return {
    assessmentId: parsed.assessmentId,
    studentId: parsed.studentId || parsed.studentLrn,
    studentLrn: parsed.studentLrn,
  };
}

/**
 * Checks whether a given barcode format is supported by the universal decoder.
 */
export function isBarcodeFormatSupported(format: string): boolean {
  const supported: SupportedBarcodeFormat[] = [
    'code_39',
    'code_128',
    'qr_code',
    'ean_13',
    'ean_8',
    'upc_a',
    'upc_e',
  ];
  return supported.includes(format as SupportedBarcodeFormat);
}

/**
 * Lazy loads and caches the ZXing MultiFormatReader.
 */
async function getZxingReader() {
  if (zxingReaderInstance) {
    return { reader: zxingReaderInstance, hints: zxingHintsInstance };
  }

  try {
    const zxing = await import('@zxing/library');
    const { MultiFormatReader, BarcodeFormat, DecodeHintType } = zxing;

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_128,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new MultiFormatReader();
    reader.setHints(hints);

    zxingReaderInstance = reader;
    zxingHintsInstance = hints;
    return { reader, hints };
  } catch (err) {
    console.warn('[BarcodeEngine] Failed to initialize ZXing fallback:', err);
    return null;
  }
}

/**
 * Attempts to decode a barcode using the Native BarcodeDetector API.
 */
async function decodeWithNativeDetector(
  imageSource: ImageBitmap | HTMLCanvasElement | HTMLVideoElement
): Promise<DecodedBarcode | null> {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
    return null;
  }

  try {
    const Detector = (window as any).BarcodeDetector;
    const allWanted: SupportedBarcodeFormat[] = [
      'code_39',
      'code_128',
      'qr_code',
      'ean_13',
      'ean_8',
      'upc_a',
      'upc_e',
    ];

    let supportedFormats = allWanted;
    if (typeof Detector.getSupportedFormats === 'function') {
      try {
        const nativeSupported = await Detector.getSupportedFormats();
        supportedFormats = allWanted.filter((f) => nativeSupported.includes(f));
        if (supportedFormats.length === 0) return null;
      } catch {
        // Continue with wanted formats
      }
    }

    const detector = new Detector({ formats: supportedFormats });

    const results = await detector.detect(imageSource);
    if (!results || results.length === 0) return null;

    const primary = results[0];
    const rawValue = String(primary.rawValue || '');
    if (!rawValue) return null;

    const parsedIdentity = parseProjectKitBarcodePayload(rawValue);

    let boundingBox: DecodedBarcode['boundingBox'];
    if (primary.boundingBox) {
      boundingBox = {
        x: primary.boundingBox.x,
        y: primary.boundingBox.y,
        width: primary.boundingBox.width,
        height: primary.boundingBox.height,
      };
    }

    return {
      rawValue,
      format: (primary.format as SupportedBarcodeFormat) || 'code_39',
      parsedIdentity,
      boundingBox,
      timestamp: Date.now(),
    };
  } catch (err) {
    return null;
  }
}

/**
 * Attempts to decode a barcode using the ZXing pure JavaScript/WASM engine.
 */
async function decodeWithZxing(
  canvas: HTMLCanvasElement
): Promise<DecodedBarcode | null> {
  const zxing = await getZxingReader();
  if (!zxing) return null;

  try {
    const { RGBLuminanceSource, BinaryBitmap, HybridBinarizer } = await import('@zxing/library');

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return null;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Convert RGBA (4 bytes per pixel) into a 1-channel grayscale buffer
    // using standard Rec. 601 luma weights: (306*R + 601*G + 117*B + 512) >> 10
    const grayscale = new Uint8ClampedArray(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      grayscale[j] = (306 * data[i] + 601 * data[i + 1] + 117 * data[i + 2] + 512) >> 10;
    }

    const luminanceSource = new RGBLuminanceSource(grayscale, width, height);
    const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));

    try {
      const result = zxing.reader.decode(binaryBitmap, zxing.hints);
      if (!result) return null;

      const rawValue = result.getText();
      if (!rawValue) return null;

      const formatName = result.getBarcodeFormat() ? String(result.getBarcodeFormat()).toLowerCase() : 'code_39';
      const parsedIdentity = parseProjectKitBarcodePayload(rawValue);

      return {
        rawValue,
        format: formatName,
        parsedIdentity,
        timestamp: Date.now(),
      };
    } finally {
      zxing.reader.reset?.();
    }
  } catch (err) {
    // Normal when no barcode is found in current frame
    return null;
  }
}

/**
 * Evaluates an SVG document for embedded metadata attributes.
 */
async function decodeFromSvgBlob(blob: Blob): Promise<DecodedBarcode | null> {
  if (blob.type !== 'image/svg+xml' && !(blob as File).name?.toLowerCase().endsWith('.svg')) {
    return null;
  }

  try {
    const text = await blob.text();
    const studentId = text.match(/data-student-id="([^"]+)"/)?.[1];
    const assessmentId = text.match(/data-assessment-id="([^"]+)"/)?.[1];
    const dataCode = text.match(/data-code="([^"]+)"/)?.[1];

    if (studentId || assessmentId || dataCode) {
      const code = dataCode || (assessmentId && studentId ? `K${assessmentId.slice(0, 6)}-${studentId.slice(0, 6)}` : '');
      return {
        rawValue: code,
        format: 'code_39',
        parsedIdentity: {
          assessmentId,
          studentId,
        },
        timestamp: Date.now(),
      };
    }
  } catch {
    // Invalid SVG
  }
  return null;
}

/**
 * Unified entry point to decode a barcode from an HTMLCanvasElement.
 */
export async function decodeBarcodeFromCanvas(
  canvas: HTMLCanvasElement
): Promise<DecodedBarcode | null> {
  // 1. Try hardware-accelerated Native BarcodeDetector first
  const nativeResult = await decodeWithNativeDetector(canvas);
  if (nativeResult) return nativeResult;

  // 2. Fall back to pure JS ZXing engine (works on Safari, Firefox, iOS, Android)
  return await decodeWithZxing(canvas);
}

/**
 * Unified entry point to decode a barcode from a Blob or File.
 */
export async function decodeBarcodeFromBlob(
  blob: Blob
): Promise<DecodedBarcode | null> {
  // 1. Check for vector SVG template
  const svgResult = await decodeFromSvgBlob(blob);
  if (svgResult) return svgResult;

  // 2. Try ImageBitmap with Native BarcodeDetector
  if (typeof createImageBitmap === 'function' && 'BarcodeDetector' in window) {
    try {
      const bitmap = await createImageBitmap(blob);
      const nativeResult = await decodeWithNativeDetector(bitmap);
      bitmap.close?.();
      if (nativeResult) return nativeResult;
    } catch {
      // Continue to canvas fallback
    }
  }

  // 3. Render Blob to offscreen Canvas for universal ZXing / pixel decoding
  return new Promise<DecodedBarcode | null>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = async () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const result = await decodeBarcodeFromCanvas(canvas);
      resolve(result);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}
