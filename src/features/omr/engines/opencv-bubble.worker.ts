import * as cvModule from '@techstark/opencv-js';

type CircleSample = { x: number; y: number; radius: number };
type AnalyzeRequest = { id: number; pixels: ArrayBuffer; width: number; height: number; circles: CircleSample[] };
type CircleMeasurement = { fillRatio: number; contrast: number };

const cv: any = (cvModule as any).default || cvModule;
let cvReady: Promise<void> | null = null;
const workerStartedAt = performance.now();
let workerReadyMs: number | null = null;

function ensureOpenCv(): Promise<void> {
  if (cv.Mat) {
    workerReadyMs ??= performance.now() - workerStartedAt;
    return Promise.resolve();
  }
  if (cvReady) return cvReady;
  cvReady = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('OpenCV.js initialization timed out.')), 45000);
    cv.onRuntimeInitialized = () => { clearTimeout(timeout); workerReadyMs = performance.now() - workerStartedAt; resolve(); };
    cv.onAbort = (reason: unknown) => { clearTimeout(timeout); reject(new Error(String(reason || 'OpenCV.js failed to initialize.'))); };
    if (typeof cv.then === 'function') cv.then(
      () => { clearTimeout(timeout); workerReadyMs = performance.now() - workerStartedAt; resolve(); },
      (error: unknown) => { clearTimeout(timeout); reject(error); },
    );
  });
  return cvReady;
}

function measureCircle(gray: any, binary: any, sample: CircleSample): CircleMeasurement {
  const radius = Math.max(2, sample.radius * 0.62); // Exclude the printed bubble outline.
  const outerRadius = Math.max(radius + 1, sample.radius * 0.92);
  const minX = Math.max(0, Math.floor(sample.x - outerRadius));
  const maxX = Math.min(gray.cols - 1, Math.ceil(sample.x + outerRadius));
  const minY = Math.max(0, Math.floor(sample.y - outerRadius));
  const maxY = Math.min(gray.rows - 1, Math.ceil(sample.y + outerRadius));
  let insidePixels = 0;
  let darkPixels = 0;
  let innerLum = 0;
  let innerCount = 0;
  let paperLum = 0;
  let paperCount = 0;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - sample.x;
      const dy = y - sample.y;
      const distance = Math.hypot(dx, dy);
      if (distance > outerRadius) continue;
      const lum = gray.ucharPtr(y, x)[0];
      if (distance <= radius) {
        insidePixels++;
        innerLum += lum;
        innerCount++;
        if (binary.ucharPtr(y, x)[0] > 0) darkPixels++;
      } else if (distance >= sample.radius * 0.76) {
        paperLum += lum;
        paperCount++;
      }
    }
  }

  const innerMean = innerCount ? innerLum / innerCount : 255;
  const paperMean = paperCount ? paperLum / paperCount : 255;
  return {
    fillRatio: insidePixels ? darkPixels / insidePixels : 0,
    contrast: Math.max(0, Math.min(1, (paperMean - innerMean) / Math.max(paperMean, 96))),
  };
}

async function analyze(request: AnalyzeRequest): Promise<CircleMeasurement[]> {
  await ensureOpenCv();
  const rgba = new cv.Mat(request.height, request.width, cv.CV_8UC4);
  const gray = new cv.Mat();
  const binary = new cv.Mat();
  try {
    rgba.data.set(new Uint8Array(request.pixels));
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    const blockSize = Math.max(3, Math.min(31, (Math.floor(Math.min(gray.rows, gray.cols) / 4) | 1)));
    cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, blockSize, 9);
    return request.circles.map((circle) => measureCircle(gray, binary, circle));
  } finally {
    binary.delete();
    gray.delete();
    rgba.delete();
  }
}

self.onmessage = (event: MessageEvent<AnalyzeRequest>) => {
  const request = event.data;
  const workerScope = self as unknown as { postMessage: (message: unknown) => void };
  void ensureOpenCv().then(async () => {
    const analysisStartedAt = performance.now();
    const measurements = await analyze(request);
    workerScope.postMessage({ id: request.id, measurements, workerReadyMs: workerReadyMs || 0, analysisMs: performance.now() - analysisStartedAt });
  }).catch((error: unknown) => {
    workerScope.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) });
  });
};
