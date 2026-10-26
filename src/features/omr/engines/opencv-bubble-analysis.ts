export interface BubbleSample {
  x: number;
  y: number;
  radius: number;
}

export interface BubbleMeasurement {
  fillRatio: number;
  contrast: number;
}

export interface OpenCvAnalysisResult {
  measurements: BubbleMeasurement[];
  workerReadyMs: number;
  analysisMs: number;
}

type PendingAnalysis = {
  resolve: (value: OpenCvAnalysisResult) => void;
  reject: (reason: Error) => void;
};

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, PendingAnalysis>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./opencv-bubble.worker.ts', import.meta.url), { type: 'module', name: 'kit-opencv-bubble-analysis' });
  worker.onmessage = (event: MessageEvent<{ id: number; measurements?: BubbleMeasurement[]; error?: string; workerReadyMs?: number; analysisMs?: number }>) => {
    const job = pending.get(event.data.id);
    if (!job) return;
    pending.delete(event.data.id);
    if (event.data.error) {
      const failure = new Error(event.data.error);
      job.reject(failure);
      for (const other of pending.values()) other.reject(failure);
      pending.clear();
      worker?.terminate();
      worker = null;
    } else {
      job.resolve({
        measurements: event.data.measurements || [],
        workerReadyMs: event.data.workerReadyMs || 0,
        analysisMs: event.data.analysisMs || 0,
      });
    }
  };
  worker.onerror = (event) => {
    const failure = new Error(event.message || 'OpenCV.js worker failed.');
    for (const job of pending.values()) job.reject(failure);
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function analyzeBubbleSamples(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  circles: BubbleSample[],
): Promise<OpenCvAnalysisResult> {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return Promise.reject(new Error('OpenCV.js bubble analysis requires a browser worker.'));
  }
  const id = ++requestId;
  const pixelBuffer = new Uint8Array(pixels).buffer;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      getWorker().postMessage({ id, pixels: pixelBuffer, width, height, circles }, [pixelBuffer]);
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error('Could not send image to OpenCV.js worker.'));
    }
  });
}
