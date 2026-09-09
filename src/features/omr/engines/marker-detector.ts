/**
 * Project KIT — Optical Marker Detector & Region Topology Engine
 *
 * Scans decoded image pixel buffers for solid black square fiducials, validates
 * their geometric properties, and associates them with canonical region topologies.
 *
 * Strictly enforces:
 * - 4 valid markers per expected region before bubble sampling is allowed.
 * - Zero coordinate guessing if any required marker is missing or ambiguous.
 */

import { CanonicalOmrGeometry, OmrRegionGeometry, ReferenceMarker } from '../geometry/geometry-types';
import { ProjectiveHomography, QuadPoints } from './homography';

export interface DetectedMarkerCandidate {
  cx: number;
  cy: number;
  width: number;
  height: number;
  fillFactor: number;
  aspectRatio: number;
  confidence: number;
}

export interface DetectedRegionQuad {
  regionId: string;
  quad: QuadPoints;
  homography: ProjectiveHomography;
  confidence: number;
  markers: {
    TL: DetectedMarkerCandidate;
    TR: DetectedMarkerCandidate;
    BL: DetectedMarkerCandidate;
    BR: DetectedMarkerCandidate;
  };
}

export interface RegionDetectionFailure {
  regionId: string;
  detectedMarkerCount: number;
  expectedMarkerCount: number;
  markerConfidence: number;
  reason: string;
}

export interface MarkerDetectionResult {
  allRegionsDetected: boolean;
  detectedRegions: Record<string, DetectedRegionQuad>;
  failedRegions: RegionDetectionFailure[];
  candidates: DetectedMarkerCandidate[];
  overallMarkerConfidence: number;
}

export class MarkerDetector {
  /**
   * Main marker detection entrypoint.
   */
  static detectRegionMarkers(
    pixels: Uint8Array | Uint8ClampedArray,
    imgWidth: number,
    imgHeight: number,
    geometry: CanonicalOmrGeometry
  ): MarkerDetectionResult {
    // 1. Extract candidate dark square components
    const candidates = this.findCandidateMarkers(pixels, imgWidth, imgHeight, geometry);

    // 2. Estimate global paper pose (rotation, translation, scale) from outer markers
    const pose = this.estimateGlobalPose(candidates, geometry, imgWidth, imgHeight);

    const detectedRegions: Record<string, DetectedRegionQuad> = {};
    const failedRegions: RegionDetectionFailure[] = [];
    let totalConfidence = 0;

    // 3. Topology matching for each expected region using pose-transformed targets
    for (const region of geometry.regions) {
      const match = this.matchRegionQuad(region, candidates, pose);

      if (match.success && match.quad && match.markers) {
        try {
          const homography = ProjectiveHomography.fromUnitSquareToQuad(match.quad);
          detectedRegions[region.id] = {
            regionId: region.id,
            quad: match.quad,
            homography,
            confidence: match.confidence,
            markers: match.markers,
          };
          totalConfidence += match.confidence;
        } catch (err: any) {
          failedRegions.push({
            regionId: region.id,
            detectedMarkerCount: match.detectedCount,
            expectedMarkerCount: 4,
            markerConfidence: match.confidence,
            reason: `Region '${region.id}' quad is mathematically degenerate: ${err.message}`,
          });
        }
      } else {
        failedRegions.push({
          regionId: region.id,
          detectedMarkerCount: match.detectedCount,
          expectedMarkerCount: 4,
          markerConfidence: match.confidence,
          reason: match.reason || `Region '${region.id}' reference markers were not confidently detected.`,
        });
      }
    }

    const allRegionsDetected = failedRegions.length === 0;
    const overallMarkerConfidence =
      geometry.regions.length > 0 ? totalConfidence / geometry.regions.length : 0;

    return {
      allRegionsDetected,
      detectedRegions,
      failedRegions,
      candidates,
      overallMarkerConfidence: parseFloat(overallMarkerConfidence.toFixed(3)),
    };
  }

  /**
   * Fast connected-component detection for dark, solid, square blobs.
   */
  private static findCandidateMarkers(
    pixels: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    geometry: CanonicalOmrGeometry
  ): DetectedMarkerCandidate[] {
    const scale = Math.min(width / geometry.page.width, height / geometry.page.height);
    const minMarkerDim = Math.max(7, Math.floor(9 * scale));
    const maxMarkerDim = Math.max(35, Math.ceil(30 * scale));

    const visited = new Uint8Array(width * height);
    const candidates: DetectedMarkerCandidate[] = [];

    // Scan across pixel grid
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (visited[idx]) continue;

        const pIdx = idx * 4;
        const lum = 0.299 * pixels[pIdx] + 0.587 * pixels[pIdx + 1] + 0.114 * pixels[pIdx + 2];
        if (lum >= 75) continue; // Not dark enough

        // Flood fill to trace blob
        const queue = [idx];
        visited[idx] = 1;
        let count = 0;
        let sumX = 0;
        let sumY = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;

        let qHead = 0;
        while (qHead < queue.length) {
          const curr = queue[qHead++];
          const cy = Math.floor(curr / width);
          const cx = curr % width;

          count++;
          sumX += cx;
          sumY += cy;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // 4-neighborhood
          const neighbors = [
            cx > 0 ? curr - 1 : -1,
            cx < width - 1 ? curr + 1 : -1,
            cy > 0 ? curr - width : -1,
            cy < height - 1 ? curr + width : -1,
          ];

          for (const n of neighbors) {
            if (n >= 0 && !visited[n]) {
              const npIdx = n * 4;
              const nLum = 0.299 * pixels[npIdx] + 0.587 * pixels[npIdx + 1] + 0.114 * pixels[npIdx + 2];
              if (nLum < 75) {
                visited[n] = 1;
                queue.push(n);
              }
            }
          }
        }

        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const aspect = bw / bh;
        const fill = count / (bw * bh);

        // Solid square criteria:
        // - Dimensions within expected range
        // - Aspect ratio between 0.70 and 1.40
        // - Fill factor >= 0.70 (solid square)
        if (
          bw >= minMarkerDim &&
          bw <= maxMarkerDim &&
          bh >= minMarkerDim &&
          bh <= maxMarkerDim &&
          aspect >= 0.70 &&
          aspect <= 1.40 &&
          fill >= 0.70
        ) {
          const cx = sumX / count;
          const cy = sumY / count;
          const confidence = parseFloat((fill * (1 - Math.abs(1 - aspect) * 0.5)).toFixed(3));

          candidates.push({
            cx,
            cy,
            width: bw,
            height: bh,
            fillFactor: parseFloat(fill.toFixed(3)),
            aspectRatio: parseFloat(aspect.toFixed(3)),
            confidence,
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Estimates global paper pose (rotation, translation, scale) by tracking outer-most markers.
   */
  private static estimateGlobalPose(
    candidates: DetectedMarkerCandidate[],
    geometry: CanonicalOmrGeometry,
    imgWidth: number,
    imgHeight: number
  ): {
    scale: number;
    transformPoint: (cx: number, cy: number) => { x: number; y: number };
  } {
    const nominalScale = Math.min(imgWidth / geometry.page.width, imgHeight / geometry.page.height);

    if (candidates.length < 4) {
      return {
        scale: nominalScale,
        transformPoint: (cx, cy) => ({
          x: cx * (imgWidth / geometry.page.width),
          y: cy * (imgHeight / geometry.page.height),
        }),
      };
    }

    // Reference canonical outer top markers: STUDENT_INFO.TL and ROLL_NUMBER.TR
    const refTL = geometry.markerMap['STUDENT_INFO.TL']?.center || { x: 47, y: 42 };
    const refTR = geometry.markerMap['ROLL_NUMBER.TR']?.center || { x: 634, y: 42 };

    // Find candidate closest to expected top-left corner
    let candTL = candidates[0];
    let minScoreTL = Infinity;
    for (const c of candidates) {
      const score = c.cx + c.cy * 1.5;
      if (score < minScoreTL) {
        minScoreTL = score;
        candTL = c;
      }
    }

    // Find candidate closest to expected top-right corner
    let candTR = candidates[0];
    let maxScoreTR = -Infinity;
    for (const c of candidates) {
      const score = c.cx - c.cy * 1.5;
      if (score > maxScoreTR) {
        maxScoreTR = score;
        candTR = c;
      }
    }

    const d0 = Math.hypot(refTR.x - refTL.x, refTR.y - refTL.y);
    const d = Math.hypot(candTR.cx - candTL.cx, candTR.cy - candTL.cy);
    const scale = d0 > 0 ? d / d0 : nominalScale;

    // Angle of paper tilt
    const theta0 = Math.atan2(refTR.y - refTL.y, refTR.x - refTL.x);
    const theta = Math.atan2(candTR.cy - candTL.cy, candTR.cx - candTL.cx);
    const angleDelta = theta - theta0;

    const cosA = Math.cos(angleDelta);
    const sinA = Math.sin(angleDelta);

    return {
      scale,
      transformPoint: (cx: number, cy: number) => {
        const dx = cx - refTL.x;
        const dy = cy - refTL.y;
        return {
          x: candTL.cx + scale * (dx * cosA - dy * sinA),
          y: candTL.cy + scale * (dx * sinA + dy * cosA),
        };
      },
    };
  }

  /**
   * Matches 4 detected candidate markers to an expected region topology.
   */
  private static matchRegionQuad(
    region: OmrRegionGeometry,
    candidates: DetectedMarkerCandidate[],
    pose: { scale: number; transformPoint: (cx: number, cy: number) => { x: number; y: number } }
  ): {
    success: boolean;
    detectedCount: number;
    confidence: number;
    quad?: QuadPoints;
    markers?: DetectedRegionQuad['markers'];
    reason?: string;
  } {
    const corners = ['TL', 'TR', 'BL', 'BR'] as const;
    const matched: Partial<Record<'TL' | 'TR' | 'BL' | 'BR', DetectedMarkerCandidate>> = {};

    // Search radius around pose-transformed center
    const maxSearchRadius = 18 * pose.scale;

    for (const corner of corners) {
      const canonicalMarker: ReferenceMarker = region.markers[corner];
      const target = pose.transformPoint(canonicalMarker.center.x, canonicalMarker.center.y);

      let bestCandidate: DetectedMarkerCandidate | null = null;
      let minDistance = Infinity;

      for (const cand of candidates) {
        const dist = Math.hypot(cand.cx - target.x, cand.cy - target.y);
        if (dist <= maxSearchRadius && dist < minDistance) {
          minDistance = dist;
          bestCandidate = cand;
        }
      }

      if (bestCandidate) {
        matched[corner] = bestCandidate;
      }
    }

    const detectedCount = Object.keys(matched).length;

    if (detectedCount < 4) {
      const missing = corners.filter((c) => !matched[c]);
      return {
        success: false,
        detectedCount,
        confidence: detectedCount / 4,
        reason: `Missing fiducial markers: ${missing.map((c) => `${region.id}.${c}`).join(', ')}.`,
      };
    }

    const TL = matched.TL!;
    const TR = matched.TR!;
    const BL = matched.BL!;
    const BR = matched.BR!;

    // Expected dimension ratio check (must match canonical region width/height within 15%)
    const expectedWidth = (region.markers.TR.center.x - region.markers.TL.center.x) * pose.scale;
    const expectedHeight = (region.markers.BL.center.y - region.markers.TL.center.y) * pose.scale;

    const detectedTopWidth = Math.hypot(TR.cx - TL.cx, TR.cy - TL.cy);
    const detectedBottomWidth = Math.hypot(BR.cx - BL.cx, BR.cy - BL.cy);
    const detectedLeftHeight = Math.hypot(BL.cx - TL.cx, BL.cy - TL.cy);
    const detectedRightHeight = Math.hypot(BR.cx - TR.cx, BR.cy - TR.cy);

    const widthRatioTop = Math.abs(detectedTopWidth - expectedWidth) / expectedWidth;
    const widthRatioBottom = Math.abs(detectedBottomWidth - expectedWidth) / expectedWidth;
    const heightRatioLeft = Math.abs(detectedLeftHeight - expectedHeight) / expectedHeight;
    const heightRatioRight = Math.abs(detectedRightHeight - expectedHeight) / expectedHeight;

    if (
      widthRatioTop > 0.15 ||
      widthRatioBottom > 0.15 ||
      heightRatioLeft > 0.15 ||
      heightRatioRight > 0.15
    ) {
      return {
        success: false,
        detectedCount,
        confidence: 0.4,
        reason: `Detected marker quadrilateral for region '${region.id}' deviates from expected dimensions.`,
      };
    }

    const avgConfidence = (TL.confidence + TR.confidence + BL.confidence + BR.confidence) / 4;

    return {
      success: true,
      detectedCount: 4,
      confidence: parseFloat(avgConfidence.toFixed(3)),
      quad: {
        TL: { x: TL.cx, y: TL.cy },
        TR: { x: TR.cx, y: TR.cy },
        BL: { x: BL.cx, y: BL.cy },
        BR: { x: BR.cx, y: BR.cy },
      },
      markers: { TL, TR, BL, BR },
    };
  }
}
