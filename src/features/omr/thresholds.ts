/** Versioned baseline. Calibrate against the release's labeled capture set before changing. */
export const OMR_THRESHOLD_PROFILE_VERSION = '1.0.0';

export const OMR_THRESHOLDS = Object.freeze({
  imageQuality: { minimumAverageLuminance: 35, maximumAverageLuminance: 250, minimumContrastRatio: 0.35 },
  openCv: {
    clearMark: { fillAndContrast: { fillRatio: 0.2, contrast: 0.14 }, fillOnly: 0.37, contrastOnly: 0.32 },
    residualInk: { fillRatio: 0.035, contrast: 0.075 },
  },
  review: { resolvedItemConfidence: 0.65, minimumOverallConfidence: 0.75 },
});
