# OMR validation and release calibration record

This document defines the capture set and measurements to keep with every OMR threshold change or scanner release. It is a protocol, not a claim that the current implementation has passed these trials. At creation, the repository contains synthetic SVG fixtures; no labeled photographic capture set or measured accuracy report was found.

## Versioned operating profile

Profile: `1.0.0`, implemented in `src/features/omr/thresholds.ts`.

| Decision | Current profile |
|---|---:|
| Legacy pixel-only clear mark fallback | Fill/darkness >= 0.35 |
| Legacy ambiguity delta | 0.15 (template profile field; retained for compatibility) |
| Template high-confidence threshold | 0.85 |
| Acceptable average image luminance | 35–250 (0–255 scale) |
| Minimum image contrast ratio | 0.35 |
| Clear mark: fill and contrast | Fill ratio >= 0.20 and contrast >= 0.14 |
| Clear mark: fill-only override | Fill ratio >= 0.37 |
| Clear mark: contrast-only override | Contrast >= 0.32 |
| Residual ink / possible erasure | Fill ratio >= 0.035 or contrast >= 0.075 |
| Staged item confidence resolution threshold | 0.65 |
| Overall confidence prompting review | 0.75 |

Thresholds are starting operating values, not statistically validated universal cutoffs. A profile change must be tied to a reviewed dataset version and evaluation report.

## Required capture groups

Collect labeled sheets from the actual print-and-scan workflow, and include both camera and uploaded-image paths where supported. Label the expected student identity and every item’s intended status before comparing scanner output. Include at least:

- Clean single marks across every answer choice, plus blank responses.
- Faint marks and partially filled bubbles across multiple pencil/pen types.
- Erased marks, including residual graphite that should be classified as invalid/wrong rather than accepted as a fresh answer.
- Double or multiple marks in one item, including one strong and one weak mark.
- Rotated, translated, and mildly perspective-skewed sheets.
- Cropped sheets and missing/obscured registration markers, which should be rejected or routed to review rather than guessed.
- Glare, shadows, uneven lighting, low contrast, and low-resolution captures.
- Different printers, paper stock, print scales, camera devices, and distances.

Capture multiple sheets per group and avoid having the same physical sheet appear in both threshold-tuning and held-out evaluation sets. Record the source device and conditions without including unnecessary learner personal data. Prefer synthetic or consented/de-identified samples for the shared repo; keep private identifiable images in approved restricted storage and reference them by an opaque dataset ID only.

## Dataset manifest format

Use `omr-validation-dataset-template.csv` as the row schema. One row represents one item on one capture; repeat capture-level fields for each item. Add a dataset version, annotation reviewer, and ground-truth review date to the release report. Do not commit identifiable learner images into this public frontend repository.

## Evaluation measures

For each capture group and overall, report:

1. Exact answer-choice accuracy on clean single-mark items.
2. False acceptance rate for blank, erased, and multiple-mark items (especially marks incorrectly accepted as a single answer).
3. False rejection / unnecessary retake rate for clean marks.
4. Correct review-routing rate for uncertain, low-quality, cropped, and marker-failure cases.
5. Student/barcode matching accuracy and duplicate-scan handling separately from answer recognition.
6. Median and p95 OpenCV worker initialization and per-capture analysis time on representative low/mid/high-end devices.
7. Results by capture condition, form template, answer choice, and item count; include sample sizes and confidence intervals.

Any false acceptance of a double/erased mark is a release-blocking case until the threshold or capture guidance is corrected and the held-out set is rerun. Preserve the exact lockfile, scanner profile version, browser/device, and dataset version with the report.

## Release record template

| Release | Threshold profile | Dataset version | Capture count | Clean accuracy | Invalid-mark false acceptance | Retake rate | p95 worker ready | p95 scan analysis | Reviewer / date |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| Pending baseline measurement | 1.0.0 | No labeled photo set yet | — | Not measured | Not measured | Not measured | Measured at runtime; release baseline pending | Measured at runtime; release baseline pending | — |

## Runtime instrumentation

The OpenCV worker returns `workerReadyMs` and `analysisMs`; the staged review audit keeps these values and the worker failure reason. `npm run report:opencv-bundle` appends raw and gzip size snapshots to `opencv-asset-size.json`. The optimized production build emitted a runtime chunk of 10,789,093 bytes (10.29 MiB) raw and 3,509,363 bytes (3.35 MiB) when gzip-compressed on 26 October 2026; this gzip figure estimates transfer compression and is not a browser-network measurement. The route’s first-load JS remains separately reported by Next.js. Re-run the size command against the emitted runtime asset for each release.

Keep the scanner on a lazy path: the main UI imports only the worker bridge, and the OpenCV runtime belongs to the worker entry. If initialization, analysis, or result cardinality fails, the scan is explicitly marked as requiring review and the reason is preserved. The browser-side pixel sampler may provide a provisional fallback measurement, but it cannot silently convert that scan into a trusted result.
