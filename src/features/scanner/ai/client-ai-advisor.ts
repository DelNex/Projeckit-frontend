/**
 * Project KIT — Client-Side Local AI Diagnostic Advisor
 * Replaces the backend/local Ollama dependency for scanning diagnostics.
 * Evaluates real-time camera frames and OMR results directly in the browser to provide
 * instantaneous, explainable feedback on document quality, lighting, and optical alignment.
 */

import { AiAdvisorState, AiDiagnostic, DocumentQualityMetrics } from './ai-types';

export class ClientAiAdvisor {
  private static instance: ClientAiAdvisor | null = null;

  static getInstance(): ClientAiAdvisor {
    if (!ClientAiAdvisor.instance) {
      ClientAiAdvisor.instance = new ClientAiAdvisor();
    }
    return ClientAiAdvisor.instance;
  }

  /**
   * Evaluates document quality metrics and generates targeted teacher diagnostics.
   */
  evaluateQuality(quality: DocumentQualityMetrics): AiAdvisorState {
    const diagnostics: AiDiagnostic[] = [];

    // 1. Alignment & Registration Marker Analysis
    if (quality.cornersDetected === 4) {
      diagnostics.push({
        id: 'alignment-ok',
        level: 'success',
        category: 'alignment',
        title: 'Perfect Alignment',
        guidance: 'All 4 registration corner squares are visible and aligned.',
      });
    } else if (quality.cornersDetected >= 2) {
      diagnostics.push({
        id: 'alignment-partial',
        level: 'warning',
        category: 'alignment',
        title: `Partial Alignment (${quality.cornersDetected}/4 Markers)`,
        guidance: 'Keep all four black corner registration squares fully inside the viewfinder frame.',
        action: 'Pull camera back slightly so all four corners are visible',
      });
    } else {
      diagnostics.push({
        id: 'alignment-lost',
        level: 'error',
        category: 'alignment',
        title: 'Document Not Detected',
        guidance: 'Position the camera directly above the answer sheet until the corner markers light up.',
        action: 'Aim camera straight down at the OMR sheet',
      });
    }

    // 2. Perspective Tilt / Skew Analysis
    if (quality.skewAngle > 5) {
      diagnostics.push({
        id: 'perspective-skew',
        level: 'warning',
        category: 'alignment',
        title: 'Tilted Camera Angle',
        guidance: `Perspective is tilted by approximately ${quality.skewAngle}°. For best scanner accuracy, hold the phone parallel to the paper.`,
        action: 'Hold phone flat and level directly above the page',
      });
    }

    // 3. Lighting & Shadow Analysis
    if (quality.shadowDetected) {
      diagnostics.push({
        id: 'shadow-detected',
        level: 'warning',
        category: 'lighting',
        title: 'Uneven Lighting / Shadow',
        guidance: 'A strong shadow is cast across one side of the answer sheet, which may obscure faint marks.',
        action: 'Tilt phone or reposition light to eliminate shadows',
      });
    } else if (quality.brightness < 65) {
      diagnostics.push({
        id: 'low-light',
        level: 'warning',
        category: 'lighting',
        title: 'Low Ambient Light',
        guidance: 'The scene is dim. The optical engine needs adequate contrast to read shaded bubbles.',
        action: 'Turn on room lights or move near a light source',
      });
    } else if (quality.glareDetected) {
      diagnostics.push({
        id: 'glare-detected',
        level: 'warning',
        category: 'lighting',
        title: 'Overhead Light Glare',
        guidance: 'Reflected light is washing out sections of the page.',
        action: 'Tilt device slightly to deflect overhead glare',
      });
    } else {
      diagnostics.push({
        id: 'lighting-optimal',
        level: 'success',
        category: 'lighting',
        title: 'Even Lighting',
        guidance: 'Luminance and contrast are optimal for bubble analysis.',
      });
    }

    // 4. Blur / Sharpness Analysis
    if (quality.blurDetected) {
      diagnostics.push({
        id: 'blur-warning',
        level: 'warning',
        category: 'blur',
        title: 'Camera Motion Blur',
        guidance: 'Image detail is soft. Steady the phone for 1 second to allow autofocus to lock.',
        action: 'Hold device steady or tap screen to refocus',
      });
    }

    // Determine overall health
    const hasError = diagnostics.some((d) => d.level === 'error');
    const hasWarning = diagnostics.some((d) => d.level === 'warning');

    const overallHealth = hasError ? 'action_required' : hasWarning ? 'acceptable' : 'optimal';

    let summaryText = '✓ Ready to Capture — Sheet aligned with good contrast.';
    if (hasError) {
      const firstError = diagnostics.find((d) => d.level === 'error');
      summaryText = firstError?.guidance || 'Align the answer sheet inside the frame.';
    } else if (hasWarning) {
      const firstWarn = diagnostics.find((d) => d.level === 'warning');
      summaryText = firstWarn?.action || firstWarn?.guidance || 'Adjust camera position for optimal scan.';
    }

    return {
      provider: 'browser-vision-heuristics',
      status: 'ready',
      diagnostics,
      quality,
      overallHealth,
      summaryText,
    };
  }

  /**
   * Diagnoses post-scan OMR anomalies (ambiguities, erased marks, multiple selections).
   */
  evaluateScanResults(items: Array<{
    itemNumber: number;
    state: string;
    selectedChoice: string | null;
    confidence: number;
  }>): AiDiagnostic[] {
    const diagnostics: AiDiagnostic[] = [];

    const multipleMarks = items.filter((i) => i.state === 'MULTIPLE_MARK');
    const erasedMarks = items.filter((i) => i.state === 'ERASED_MARK');
    const ambiguousMarks = items.filter((i) => i.state === 'AMBIGUOUS');
    const lowConfidence = items.filter((i) => i.confidence < 0.65 && i.state === 'MARKED');

    if (multipleMarks.length > 0) {
      diagnostics.push({
        id: 'omr-multiple-marks',
        level: 'warning',
        category: 'bubbles',
        title: `Multiple Marks on ${multipleMarks.length} Item${multipleMarks.length > 1 ? 's' : ''}`,
        guidance: `Items ${multipleMarks.map((m) => m.itemNumber).join(', ')} have more than one shaded circle. According to DepEd rules, multiple marks are invalid.`,
        action: 'Review these items in the verification table before saving',
      });
    }

    if (erasedMarks.length > 0) {
      diagnostics.push({
        id: 'omr-erased-marks',
        level: 'info',
        category: 'bubbles',
        title: `Residual Ink / Erased Mark Detected`,
        guidance: `Items ${erasedMarks.map((m) => m.itemNumber).join(', ')} show incomplete eraser smudges. The engine distinguished the darker intentional answer.`,
        action: 'Confirm the student’s intended choice',
      });
    }

    if (ambiguousMarks.length > 0) {
      diagnostics.push({
        id: 'omr-ambiguous-marks',
        level: 'warning',
        category: 'bubbles',
        title: `Faint / Marginal Shading on ${ambiguousMarks.length} Item${ambiguousMarks.length > 1 ? 's' : ''}`,
        guidance: `Items ${ambiguousMarks.map((m) => m.itemNumber).join(', ')} have light marks close to the threshold.`,
        action: 'Tap the row in the table to confirm whether it is marked or blank',
      });
    }

    if (lowConfidence.length > 0) {
      diagnostics.push({
        id: 'omr-low-confidence',
        level: 'info',
        category: 'bubbles',
        title: `Review Suggested for ${lowConfidence.length} Item${lowConfidence.length > 1 ? 's' : ''}`,
        guidance: `Items ${lowConfidence.map((m) => m.itemNumber).join(', ')} have marginal contrast.`,
      });
    }

    return diagnostics;
  }

  /**
   * Alias for evaluateQuality returning diagnostics list.
   */
  diagnoseQuality(quality: DocumentQualityMetrics): AiDiagnostic[] {
    return this.evaluateQuality(quality).diagnostics;
  }

  /**
   * Alias for evaluateScanResults returning diagnostics list.
   */
  diagnoseBubbles(items: Array<{
    itemNumber: number;
    state: string;
    selectedChoice: string | null;
    confidence: number;
    scores?: Record<string, number>;
  }>): AiDiagnostic[] {
    return this.evaluateScanResults(items);
  }
}

export const clientAiAdvisor = ClientAiAdvisor.getInstance();

/**
 * Returns instant actionable quality advice for live camera preview HUDs.
 */
export function adviseOnQuality(quality: DocumentQualityMetrics | null): {
  readyToCapture: boolean;
  message: string;
  diagnostics: AiDiagnostic[];
} {
  if (!quality) {
    return {
      readyToCapture: false,
      message: 'Position sheet within viewfinder…',
      diagnostics: [],
    };
  }

  const evaluation = clientAiAdvisor.evaluateQuality(quality);
  const isReady =
    evaluation.overallHealth !== 'action_required' &&
    quality.cornersDetected >= 3 &&
    !quality.blurDetected;

  return {
    readyToCapture: isReady,
    message: evaluation.summaryText,
    diagnostics: evaluation.diagnostics,
  };
}
