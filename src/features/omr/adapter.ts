/**
 * Project KIT — Unified OMR Scanner Adapter
 * Orchestrates third-party @armghan3071/omrchecker engine with native optical fallback,
 * normalizing all outputs into KIT's domain OmrScanResult.
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

    // Prefer @armghan3071/omrchecker in the browser if supported
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        return await this.omrCheckerAdapter.process(image, activeTemplate, options);
      } catch (err) {
        console.warn(
          '[@armghan3071/omrchecker] Primary engine unavailable or encountered error, falling back to native optical engine:',
          err
        );
      }
    }

    // Fallback to zero-external-CDN native optical engine
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

