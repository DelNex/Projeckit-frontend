/**
 * Project KIT — Unified OMR Scanner Adapter
 * Uses the bundled OpenCV.js geometry-aware pipeline by default. The older
 * OMRChecker adapter remains available for explicit compatibility scans.
 */

import { NativeOpticalEngineAdapter } from './engines/native-optical-engine';
import { OmrCheckerEngineAdapter } from './engines/omrchecker-adapter';
import { createKitOmrTemplate } from './templates/template-builder';
import { KitOmrTemplate, OmrProcessOptions, OmrScanResult } from './types';

export class KitOmrAdapter {
  private omrCheckerAdapter = new OmrCheckerEngineAdapter();
  private nativeOpticalAdapter = new NativeOpticalEngineAdapter();

  /**
   * Main scan processing entrypoint
   */
  async processScan(
    image: File | Blob | ArrayBuffer | Uint8Array | string,
    template?: KitOmrTemplate,
    options: OmrProcessOptions = {}
  ): Promise<OmrScanResult> {
    const activeTemplate = template || createKitOmrTemplate();

    if (options.forceEngine === '@armghan3071/omrchecker') {
      return await this.omrCheckerAdapter.process(image, activeTemplate, options);
    }

    if (options.forceEngine === 'kit-optical-native') {
      return await this.nativeOpticalAdapter.process(image, activeTemplate, options);
    }

    // The bundled OpenCV worker returns per-bubble features and has no runtime CDN dependency.
    return await this.nativeOpticalAdapter.process(image, activeTemplate, options);
  }
}

// Global singleton instance
export const omrAdapter = new KitOmrAdapter();

/**
 * Convenience helper to process an OMR scan
 */
export async function processOmrScan(
  image: File | Blob | ArrayBuffer | Uint8Array | string,
  template?: KitOmrTemplate,
  options?: OmrProcessOptions
): Promise<OmrScanResult> {
  return omrAdapter.processScan(image, template, options);
}
