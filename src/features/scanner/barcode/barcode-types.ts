/**
 * Project KIT — Universal Barcode Scanner Types
 */

export type SupportedBarcodeFormat =
  | 'qr_code'
  | 'code_39'
  | 'code_128'
  | 'ean_13'
  | 'ean_8'
  | 'upc_a'
  | 'upc_e';

export interface DecodedBarcode {
  rawValue: string;
  format: SupportedBarcodeFormat | string;
  parsedIdentity?: {
    assessmentId?: string;
    studentId?: string;
    studentLrn?: string;
  };
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  timestamp: number;
}

export interface BarcodeEngineOptions {
  formats?: SupportedBarcodeFormat[];
  throttleMs?: number;
  duplicateCooldownMs?: number;
}

export type BarcodeDecoderEngine = 'native-detector' | 'zxing' | 'svg-fallback';

