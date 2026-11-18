/** Pixel-space size limit shared by camera and uploaded OMR images. */
export const MAX_OMR_IMAGE_EDGE = 1600;

export interface ImageDimensions {
  width: number;
  height: number;
}

/** Reduce oversized images proportionally without upscaling small scans. */
export function fitImageDimensions(
  width: number,
  height: number,
  maxEdge = MAX_OMR_IMAGE_EDGE
): ImageDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(maxEdge) || width < 1 || height < 1 || maxEdge < 1) {
    throw new Error('INVALID_IMAGE_DIMENSIONS');
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
