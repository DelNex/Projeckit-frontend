/**
 * Project KIT — Client-Side Computer Vision & Document Quality Analyzer
 * Evaluates real-time camera frames or static images for optical scanner fidelity:
 * - Exposure & lighting uniformity (shadow / glare detection)
 * - Edge gradient sharpness (blur detection)
 * - 4-corner fiducial alignment
 * - Perspective skew estimation
 */

import { DocumentQualityMetrics } from './ai-types';

let offscreenCanvas: HTMLCanvasElement | null = null;

/**
 * Fast evaluation of document image metrics from RGBA pixel data, HTMLVideoElement, or HTMLCanvasElement.
 */
export function analyzeDocumentQuality(
  pixelsOrSource: Uint8ClampedArray | Uint8Array | HTMLVideoElement | HTMLCanvasElement,
  width?: number,
  height?: number
): DocumentQualityMetrics {
  // If passed an HTMLVideoElement or HTMLCanvasElement, extract frame pixels
  if (
    typeof window !== 'undefined' &&
    (pixelsOrSource instanceof HTMLVideoElement ||
      pixelsOrSource instanceof HTMLCanvasElement ||
      ('videoWidth' in (pixelsOrSource as any) && (pixelsOrSource as any).videoWidth > 0))
  ) {
    const videoOrCanvas = pixelsOrSource as HTMLVideoElement | HTMLCanvasElement;
    const srcW = (videoOrCanvas as HTMLVideoElement).videoWidth || videoOrCanvas.width || 0;
    const srcH = (videoOrCanvas as HTMLVideoElement).videoHeight || videoOrCanvas.height || 0;
    if (srcW === 0 || srcH === 0) {
      return {
        brightness: 128,
        contrast: 0.5,
        sharpness: 50,
        skewAngle: 0,
        cornersDetected: 0,
        shadowDetected: false,
        glareDetected: false,
        isQualityAcceptable: false,
        blurDetected: false,
      };
    }

    if (!offscreenCanvas) {
      offscreenCanvas = document.createElement('canvas');
    }
    const targetW = 320;
    const targetH = Math.round((srcH / srcW) * 320);
    offscreenCanvas.width = targetW;
    offscreenCanvas.height = targetH;
    const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return {
        brightness: 128,
        contrast: 0.5,
        sharpness: 50,
        skewAngle: 0,
        cornersDetected: 0,
        shadowDetected: false,
        glareDetected: false,
        isQualityAcceptable: false,
        blurDetected: false,
      };
    }
    ctx.drawImage(videoOrCanvas, 0, 0, targetW, targetH);
    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    return analyzeDocumentQuality(imgData.data, targetW, targetH);
  }

  const pixels = pixelsOrSource as Uint8ClampedArray | Uint8Array;
  const w = width || 0;
  const h = height || 0;
  const totalPixels = w * h;
  if (totalPixels === 0 || pixels.length < totalPixels * 4) {
    return {
      brightness: 128,
      contrast: 0.5,
      sharpness: 50,
      skewAngle: 0,
      cornersDetected: 0,
      shadowDetected: false,
      glareDetected: false,
      isQualityAcceptable: false,
      blurDetected: false,
    };
  }

  let lumSum = 0;
  let minLum = 255;
  let maxLum = 0;
  let saturatedCount = 0;

  // Quadrant sums for shadow/uneven lighting detection
  // Q1 (top-left), Q2 (top-right), Q3 (bottom-left), Q4 (bottom-right)
  const halfW = Math.floor(w / 2);
  const halfH = Math.floor(h / 2);
  const quadSums = [0, 0, 0, 0];
  const quadCounts = [0, 0, 0, 0];

  // Grayscale buffer for fast 3x3 Laplacian sharpness evaluation
  // Sample every 2nd pixel for performance on mobile devices
  const step = 2;
  const sampleW = Math.floor(w / step);
  const sampleH = Math.floor(h / step);
  const gray = new Uint8Array(sampleW * sampleH);

  let grayIdx = 0;

  for (let y = 0; y < h; y += step) {
    const isTop = y < halfH;
    for (let x = 0; x < w; x += step) {
      const idx = (y * w + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

      lumSum += lum;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
      if (lum >= 250) saturatedCount++;

      // Quadrant index
      const isLeft = x < halfW;
      const qIdx = isTop ? (isLeft ? 0 : 1) : (isLeft ? 2 : 3);
      quadSums[qIdx] += lum;
      quadCounts[qIdx]++;

      if (grayIdx < gray.length) {
        gray[grayIdx++] = lum;
      }
    }
  }

  const sampleCount = sampleW * sampleH;
  const avgBrightness = sampleCount > 0 ? lumSum / sampleCount : 128;
  const contrastRatio = maxLum > 0 ? (maxLum - minLum) / maxLum : 0;
  const glareRatio = sampleCount > 0 ? saturatedCount / sampleCount : 0;
  const glareDetected = glareRatio > 0.08; // > 8% blown-out white pixels

  // Shadow detection: compare min vs max quadrant average luminance
  const quadAvgs = quadSums.map((sum, i) => (quadCounts[i] > 0 ? sum / quadCounts[i] : avgBrightness));
  const minQuad = Math.min(...quadAvgs);
  const maxQuad = Math.max(...quadAvgs);
  const shadowDetected = maxQuad - minQuad > 45; // Significant difference across page

  // Sharpness calculation using discrete Laplacian edge kernel:
  // [ 0,  1, 0 ]
  // [ 1, -4, 1 ]
  // [ 0,  1, 0 ]
  let laplacianSum = 0;
  let laplacianSqSum = 0;
  let edgeCount = 0;

  for (let sy = 1; sy < sampleH - 1; sy++) {
    const rowOffset = sy * sampleW;
    for (let sx = 1; sx < sampleW - 1; sx++) {
      const center = gray[rowOffset + sx];
      const top = gray[rowOffset - sampleW + sx];
      const bottom = gray[rowOffset + sampleW + sx];
      const left = gray[rowOffset + sx - 1];
      const right = gray[rowOffset + sx + 1];

      const lap = Math.abs(top + bottom + left + right - 4 * center);
      laplacianSum += lap;
      laplacianSqSum += lap * lap;
      edgeCount++;
    }
  }

  // Variance of Laplacian
  const lapMean = edgeCount > 0 ? laplacianSum / edgeCount : 0;
  const sharpness = edgeCount > 0 ? Math.max(0, laplacianSqSum / edgeCount - lapMean * lapMean) : 0;
  const blurDetected = sharpness < 18; // Very low edge gradient = blurry

  // Corner registration check: verify dark square fiducials in 4 perimeter corners
  const cornerZoneSize = Math.floor(Math.min(w, h) * 0.14);
  let cornersDetected = 0;

  const testCorner = (startX: number, startY: number): boolean => {
    let darkPx = 0;
    let total = 0;
    for (let y = startY; y < startY + cornerZoneSize; y += 3) {
      for (let x = startX; x < startX + cornerZoneSize; x += 3) {
        const i = (y * w + x) * 4;
        if (i + 2 < pixels.length) {
          const lum = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
          if (lum < 85) darkPx++;
          total++;
        }
      }
    }
    return total > 0 && darkPx / total > 0.035;
  };

  const margin = Math.floor(Math.min(w, h) * 0.02);
  const tl = testCorner(margin, margin);
  const tr = testCorner(w - cornerZoneSize - margin, margin);
  const bl = testCorner(margin, h - cornerZoneSize - margin);
  const br = testCorner(w - cornerZoneSize - margin, h - cornerZoneSize - margin);

  if (tl) cornersDetected++;
  if (tr) cornersDetected++;
  if (bl) cornersDetected++;
  if (br) cornersDetected++;

  // Estimated perspective skew: tilt angle estimation
  let skewAngle = 0;
  if (cornersDetected >= 3) {
    // Top vs bottom width difference indicates perspective tilt
    skewAngle = (tl !== tr ? 3.5 : 0) + (bl !== br ? 3.5 : 0);
  }

  const isLightingOk = avgBrightness >= 50 && avgBrightness <= 230 && !glareDetected;
  const isQualityAcceptable = isLightingOk && contrastRatio >= 0.4 && !blurDetected && cornersDetected >= 3;

  return {
    brightness: Math.round(avgBrightness),
    contrast: parseFloat(contrastRatio.toFixed(2)),
    sharpness: Math.round(sharpness),
    skewAngle,
    cornersDetected,
    shadowDetected,
    glareDetected,
    isQualityAcceptable,
    blurDetected,
  };
}
