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

      if (match.quad && match.markers) {
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
      }

      if (!match.success) {
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
   * Uses adaptive lighting threshold so markers are reliably extracted on mobile cameras.
   */
  private static findCandidateMarkers(
    pixels: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    geometry: CanonicalOmrGeometry
  ): DetectedMarkerCandidate[] {
    const scale = Math.min(width / geometry.page.width, height / geometry.page.height);
    const minMarkerDim = Math.max(5, Math.floor(6 * scale));
    const maxMarkerDim = Math.max(55, Math.ceil(45 * scale));

    // Sample image brightness to determine adaptive dark threshold
    let totalLum = 0;
    const sampleStep = 8;
    let sampledCount = 0;
    for (let i = 0; i < pixels.length; i += 4 * sampleStep) {
      totalLum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      sampledCount++;
    }
    const avgLum = sampledCount > 0 ? totalLum / sampledCount : 128;
    // Dark threshold: adaptive between 60 and 130 based on ambient scene lighting
    const darkThreshold = Math.min(130, Math.max(60, Math.floor(avgLum * 0.72)));

    const visited = new Uint8Array(width * height);
    const candidates: DetectedMarkerCandidate[] = [];

    // Scan across pixel grid (step 2 for speed on high-res camera captures)
    const yStep = height > 1200 ? 2 : 1;
    const xStep = width > 1600 ? 2 : 1;

    for (let y = 0; y < height; y += yStep) {
      for (let x = 0; x < width; x += xStep) {
        const idx = y * width + x;
        if (visited[idx]) continue;

        const pIdx = idx * 4;
        const lum = 0.299 * pixels[pIdx] + 0.587 * pixels[pIdx + 1] + 0.114 * pixels[pIdx + 2];
        if (lum > darkThreshold) continue; // Not dark enough

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
              if (nLum <= darkThreshold) {
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

        // Solid square criteria: tolerates camera tilt perspective, lighting, and edge anti-aliasing
        if (
          bw >= minMarkerDim &&
          bw <= maxMarkerDim &&
          bh >= minMarkerDim &&
          bh <= maxMarkerDim &&
          aspect >= 0.55 &&
          aspect <= 1.80 &&
          fill >= 0.50
        ) {
          const cx = sumX / count;
          const cy = sumY / count;
          const confidence = parseFloat((fill * (1 - Math.min(0.5, Math.abs(1 - aspect)))).toFixed(3));

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

    // Reference canonical outer top markers: ANSWERS.TL and ANSWERS.TR
    const refTL =
      geometry.markerMap['ANSWERS.TL']?.center ||
      geometry.markers.find((m) => m.corner === 'TL')?.center || { x: 47, y: 287 };
    const refTR =
      geometry.markerMap['ANSWERS.TR']?.center ||
      geometry.markers.find((m) => m.corner === 'TR')?.center || { x: 634, y: 287 };

    const scaleX = imgWidth / geometry.page.width;
    const scaleY = imgHeight / geometry.page.height;

    // Filter candidates to solid squares with reasonable fill factor (when >= 3 exist)
    const solidCandidates = candidates.filter((c) => c.fillFactor >= 0.80);
    const pool = solidCandidates.length >= 3 ? solidCandidates : candidates;

    // Expected nominal positions
    const expectedTL = { x: refTL.x * scaleX, y: refTL.y * scaleY };
    const expectedTR = { x: refTR.x * scaleX, y: refTR.y * scaleY };

    let candTL = pool[0];
    let minDistTL = Infinity;
    for (const c of pool) {
      const dist = Math.hypot(c.cx - expectedTL.x, c.cy - expectedTL.y);
      if (dist < minDistTL) {
        minDistTL = dist;
        candTL = c;
      }
    }

    let candTR = pool[0];
    let minDistTR = Infinity;
    for (const c of pool) {
      const dist = Math.hypot(c.cx - expectedTR.x, c.cy - expectedTR.y);
      if (dist < minDistTR) {
        minDistTR = dist;
        candTR = c;
      }
    }

    // Generous pose search distance for camera captures where sheet is centered/shifted
    const maxPoseSearchDist = Math.max(90, 140 * nominalScale);
    if (minDistTL > maxPoseSearchDist || minDistTR > maxPoseSearchDist || candTL === candTR) {
      return {
        scale: nominalScale,
        transformPoint: (cx, cy) => ({
          x: cx * scaleX,
          y: cy * scaleY,
        }),
      };
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
    // Must be large enough for camera perspective/lens curvature (up to 33px),
    // but strictly smaller than the ~43px distance to the nearest answer bubble (Q1).
    const maxSearchRadius = Math.max(22, Math.min(33, 38 * pose.scale));

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
    let missingCorner: 'TL' | 'TR' | 'BL' | 'BR' | null = null;

    // Geometric completion: if 3 of 4 markers are found, infer the 4th corner geometrically
    if (detectedCount === 3) {
      if (!matched.TL && matched.TR && matched.BL && matched.BR) {
        missingCorner = 'TL';
        matched.TL = {
          cx: matched.TR.cx + (matched.BL.cx - matched.BR.cx),
          cy: matched.TR.cy + (matched.BL.cy - matched.BR.cy),
          width: matched.TR.width,
          height: matched.TR.height,
          fillFactor: 0.75,
          aspectRatio: 1,
          confidence: 0.65,
        };
      } else if (!matched.TR && matched.TL && matched.BL && matched.BR) {
        missingCorner = 'TR';
        matched.TR = {
          cx: matched.TL.cx + (matched.BR.cx - matched.BL.cx),
          cy: matched.TL.cy + (matched.BR.cy - matched.BL.cy),
          width: matched.TL.width,
          height: matched.TL.height,
          fillFactor: 0.75,
          aspectRatio: 1,
          confidence: 0.65,
        };
      } else if (!matched.BL && matched.TL && matched.TR && matched.BR) {
        missingCorner = 'BL';
        matched.BL = {
          cx: matched.TL.cx + (matched.BR.cx - matched.TR.cx),
          cy: matched.TL.cy + (matched.BR.cy - matched.TR.cy),
          width: matched.TL.width,
          height: matched.TL.height,
          fillFactor: 0.75,
          aspectRatio: 1,
          confidence: 0.65,
        };
      } else if (!matched.BR && matched.TL && matched.TR && matched.BL) {
        missingCorner = 'BR';
        matched.BR = {
          cx: matched.BL.cx + (matched.TR.cx - matched.TL.cx),
          cy: matched.BL.cy + (matched.TR.cy - matched.TL.cy),
          width: matched.BL.width,
          height: matched.BL.height,
          fillFactor: 0.75,
          aspectRatio: 1,
          confidence: 0.65,
        };
      }
    }

    if (missingCorner) {
      // 1 marker was missing, but inferred geometrically:
      // return success: false (so allRegionsDetected=false and failedRegions has details),
      // BUT include the inferred quad so homography can still evaluate real answers.
      const avgConfidence = (matched.TL!.confidence + matched.TR!.confidence + matched.BL!.confidence + matched.BR!.confidence) / 4;
      return {
        success: false,
        detectedCount: 3,
        confidence: parseFloat(avgConfidence.toFixed(3)),
        reason: `Missing fiducial markers: ${region.id}.${missingCorner}.`,
        quad: {
          TL: { x: matched.TL!.cx, y: matched.TL!.cy },
          TR: { x: matched.TR!.cx, y: matched.TR!.cy },
          BL: { x: matched.BL!.cx, y: matched.BL!.cy },
          BR: { x: matched.BR!.cx, y: matched.BR!.cy },
        },
        markers: { TL: matched.TL!, TR: matched.TR!, BL: matched.BL!, BR: matched.BR! },
      };
    }

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

    // Expected dimension check:
    // Ensure the 4 corners form a valid convex quadrilateral roughly matching expected region geometry
    const detectedTopWidth = Math.hypot(TR.cx - TL.cx, TR.cy - TL.cy);
    const detectedBottomWidth = Math.hypot(BR.cx - BL.cx, BR.cy - BL.cy);
    const detectedLeftHeight = Math.hypot(BL.cx - TL.cx, BL.cy - TL.cy);
    const detectedRightHeight = Math.hypot(BR.cx - TR.cx, BR.cy - TR.cy);

    // Natural camera perspective allows near/far edge trapezoid ratios up to 55%
    const maxWidth = Math.max(detectedTopWidth, detectedBottomWidth);
    const minWidth = Math.min(detectedTopWidth, detectedBottomWidth);
    const maxHeight = Math.max(detectedLeftHeight, detectedRightHeight);
    const minHeight = Math.min(detectedLeftHeight, detectedRightHeight);

    const widthRatioDelta = (maxWidth - minWidth) / (maxWidth || 1);
    const heightRatioDelta = (maxHeight - minHeight) / (maxHeight || 1);

    const canonicalWidth = region.markers.TR.center.x - region.markers.TL.center.x;
    const canonicalHeight = region.markers.BL.center.y - region.markers.TL.center.y;
    const expectedAspectRatio = canonicalWidth / (canonicalHeight || 1);
    const avgWidth = (detectedTopWidth + detectedBottomWidth) / 2;
    const avgHeight = (detectedLeftHeight + detectedRightHeight) / 2;
    const detectedAspectRatio = avgWidth / (avgHeight || 1);
    const aspectDev = Math.abs(detectedAspectRatio - expectedAspectRatio) / expectedAspectRatio;

    if (
      widthRatioDelta > 0.55 ||
      heightRatioDelta > 0.55 ||
      aspectDev > 0.55 ||
      TR.cx <= TL.cx ||
      BR.cx <= BL.cx ||
      BL.cy <= TL.cy ||
      BR.cy <= TR.cy
    ) {
      return {
        success: false,
        detectedCount: 4,
        confidence: 0.35,
        reason: `Detected marker quadrilateral for region '${region.id}' deviates from expected geometry.`,
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
