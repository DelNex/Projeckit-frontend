/**
 * Project KIT — OMR Supabase Storage & Persistence Layer
 * Saves scan image payloads to Supabase Storage bucket 'omr-scans'
 * and records scan evaluation records in public.scan_results.
 */

import { createClient } from '@/lib/supabase/client';
import { OmrScanResult } from './types';

export interface SaveScanPayload {
  assessmentId: string;
  studentId?: string;
  scanResult: OmrScanResult;
  imageBlob?: Blob | File;
  tenantId?: string;
}

export interface SaveScanResponse {
  scanResultId: string | null;
  storagePath: string | null;
  error: string | null;
}

/**
 * Uploads an OMR scan image to Supabase Storage bucket 'omr-scans'
 */
export async function uploadScanImage(
  image: Blob | File,
  tenantId: string,
  assessmentId: string,
  imageHash: string
): Promise<{ path: string | null; error: string | null }> {
  try {
    const supabase = createClient();
    const cleanTenant = tenantId || 'default-tenant';
    const filePath = `${cleanTenant}/${assessmentId}/${imageHash}.jpg`;

    const { data, error } = await supabase.storage
      .from('omr-scans')
      .upload(filePath, image, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('[OMR Storage] Storage upload error', error);
      return { path: null, error: error.message };
    }

    return { path: data.path, error: null };
  } catch (err: any) {
    return { path: null, error: err.message || 'Unknown storage upload error' };
  }
}

/**
 * Saves scan metadata and normalized items into public.scan_results
 */
export async function persistOmrScan(payload: SaveScanPayload): Promise<SaveScanResponse> {
  try {
    const supabase = createClient();
    let storagePath: string | null = payload.scanResult.storagePath || null;

    // 1. Upload scan image if provided
    if (payload.imageBlob && !storagePath) {
      const tenantId = payload.tenantId || 'global';
      const uploadResult = await uploadScanImage(
        payload.imageBlob,
        tenantId,
        payload.assessmentId,
        payload.scanResult.imageHash
      );
      storagePath = uploadResult.path;
    }

    // 2. Persist to public.scan_results
    const { data, error } = await supabase
      .from('scan_results')
      .insert({
        assessment_id: payload.assessmentId,
        student_id: payload.studentId || null,
        image_storage_path: storagePath,
        image_hash: payload.scanResult.imageHash,
        confidence: payload.scanResult.overallConfidence,
        raw_answers: payload.scanResult.rawAnswers,
        normalized_answers: payload.scanResult.normalizedAnswers,
        status: payload.scanResult.status,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[OMR Persistence] DB insert error', error);
      return { scanResultId: null, storagePath, error: error.message };
    }

    return { scanResultId: data.id, storagePath, error: null };
  } catch (err: any) {
    return { scanResultId: null, storagePath: null, error: err.message || 'Database insert failed' };
  }
}

