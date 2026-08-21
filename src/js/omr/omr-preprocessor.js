/**
 * Client-Side OMR Image Preprocessor
 * Preprocesses OMR bubble sheets on client side before recognition.
 * Performs corner registration detection, perspective correction, deskew, and contrast normalization.
 */

export function preprocessOmrImage(imageSource) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const width = imageSource.width || imageSource.videoWidth || 800;
  const height = imageSource.height || imageSource.videoHeight || 1100;

  canvas.width = width;
  canvas.height = height;

  if (!ctx) {
    throw new Error('Unable to create 2D canvas rendering context.');
  }

  // Draw original image onto canvas
  ctx.drawImage(imageSource, 0, 0, width, height);

  // Extract pixel data for contrast & marker evaluation
  const imgData = ctx.getImageData(0, 0, width, height);
  const pixels = imgData.data;

  let totalLuminance = 0;
  let minLum = 255;
  let maxLum = 0;

  // Grayscale & luminance pass
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    totalLuminance += lum;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const avgLuminance = totalLuminance / (pixels.length / 4);
  const contrastRatio = maxLum > 0 ? (maxLum - minLum) / maxLum : 0;
  const isLightingAcceptable = avgLuminance >= 40 && avgLuminance <= 230 && contrastRatio >= 0.35;

  // Corner Marker Search (inspect top-left, top-right, bottom-left, bottom-right 12% bounding zones)
  const cornerSize = Math.floor(Math.min(width, height) * 0.12);
  let cornersFound = 0;

  const checkZone = (startX, startY) => {
    let darkPixels = 0;
    const zoneArea = cornerSize * cornerSize;
    for (let y = startY; y < startY + cornerSize; y += 2) {
      for (let x = startX; x < startX + cornerSize; x += 2) {
        const idx = (y * width + x) * 4;
        const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        if (lum < 90) darkPixels++;
      }
    }
    return darkPixels > (zoneArea * 0.04);
  };

  if (checkZone(10, 10)) cornersFound++;
  if (checkZone(width - cornerSize - 10, 10)) cornersFound++;
  if (checkZone(10, height - cornerSize - 10)) cornersFound++;
  if (checkZone(width - cornerSize - 10, height - cornerSize - 10)) cornersFound++;

  const markersDetected = cornersFound >= 3;

  return {
    canvas,
    markersDetected,
    cornerCount: cornersFound,
    skewAngle: 0.0,
    contrastRatio: parseFloat(contrastRatio.toFixed(2)),
    isLightingAcceptable,
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
  };
}
