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

    // No unverified candidate ranking fallback: every region must match its four physical markers.

    const allRegionsDetected = failedRegions.length === 0 && Object.keys(detectedRegions).length === geometry.regions.length;
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
    const minMarkerDim = Math.max(7, Math.floor(7 * scale));
    const maxMarkerDim = Math.max(45, Math.ceil(34 * scale));

    // Sample image brightness to determine adaptive dark threshold
    let totalLum = 0;
    const sampleStep = 8;
    let sampledCount = 0;
    for (let i = 0; i < pixels.length; i += 4 * sampleStep) {
      totalLum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      sampledCount++;
    }
    const avgLum = sampledCount > 0 ? totalLum / sampledCount : 128;
    // Dark threshold: adaptive between 65 and 130 based on ambient scene lighting,
    // tuned to reliably detect paper markers under low/moderate camera lighting.
    const darkThreshold = Math.min(130, Math.max(65, Math.floor(avgLum * 0.95)));

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
          aspect >= 0.65 &&
          aspect <= 1.55 &&
          fill >= 0.68
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
    const pageOffsetX = (imgWidth - geometry.page.width * nominalScale) / 2;
    const pageOffsetY = (imgHeight - geometry.page.height * nominalScale) / 2;
    const nominalTransformPoint = (cx: number, cy: number) => ({
      x: pageOffsetX + cx * nominalScale,
      y: pageOffsetY + cy * nominalScale,
    });

    // A two-point similarity transform cannot model camera perspective. Fit the
    // sheet plane from all four physical fiducials in the primary region instead.
    const anchorRegion = geometry.regions[0];
    if (!anchorRegion || candidates.length < 4) {
      return { scale: nominalScale, transformPoint: nominalTransformPoint };
    }

    const corners = ['TL', 'TR', 'BL', 'BR'] as const;
    const solidCandidates = candidates.filter((candidate) => candidate.fillFactor >= 0.80);
    const pool = solidCandidates.length >= 4 ? solidCandidates : candidates;
    const used = new Set<DetectedMarkerCandidate>();
    const anchors: Partial<Record<(typeof corners)[number], DetectedMarkerCandidate>> = {};
    const maxAnchorDistance = Math.max(
      70,
      Math.min(320, anchorRegion.markers.TL.size * nominalScale * 12),
    );

    for (const corner of corners) {
      const marker = anchorRegion.markers[corner];
      const target = nominalTransformPoint(marker.center.x, marker.center.y);
      const expectedSize = marker.size * nominalScale;
      let best: DetectedMarkerCandidate | null = null;
      let bestScore = Infinity;

      for (const candidate of pool) {
        if (used.has(candidate)) continue;
        const distance = Math.hypot(candidate.cx - target.x, candidate.cy - target.y);
        const candidateSize = (candidate.width + candidate.height) / 2;
        const sizeRatio = candidateSize / Math.max(1, expectedSize);
        if (
          distance > maxAnchorDistance ||
          sizeRatio < 0.40 ||
          sizeRatio > 2.5
        ) continue;

        const score = distance / maxAnchorDistance + Math.abs(Math.log(sizeRatio)) * 0.35;
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      }

      if (best) {
        anchors[corner] = best;
        used.add(best);
      }
    }

    if (corners.some((corner) => !anchors[corner])) {
      return { scale: nominalScale, transformPoint: nominalTransformPoint };
    }

    const TL = anchors.TL!;
    const TR = anchors.TR!;
    const BL = anchors.BL!;
    const BR = anchors.BR!;
    const topWidth = Math.hypot(TR.cx - TL.cx, TR.cy - TL.cy);
    const bottomWidth = Math.hypot(BR.cx - BL.cx, BR.cy - BL.cy);
    const leftHeight = Math.hypot(BL.cx - TL.cx, BL.cy - TL.cy);
    const rightHeight = Math.hypot(BR.cx - TR.cx, BR.cy - TR.cy);
    const canonicalWidth = anchorRegion.markers.TR.center.x - anchorRegion.markers.TL.center.x;
    const canonicalHeight = anchorRegion.markers.BL.center.y - anchorRegion.markers.TL.center.y;
    const widthRatio = Math.min(topWidth, bottomWidth) / Math.max(topWidth, bottomWidth, 1);
    const heightRatio = Math.min(leftHeight, rightHeight) / Math.max(leftHeight, rightHeight, 1);
    const detectedAspect = ((topWidth + bottomWidth) / 2) / Math.max(1, (leftHeight + rightHeight) / 2);
    const expectedAspect = canonicalWidth / Math.max(1, canonicalHeight);
    const aspectDeviation = Math.abs(detectedAspect - expectedAspect) / Math.max(expectedAspect, 1e-6);

    // Reject implausible anchor assignments; never turn arbitrary dark blobs into a sheet.
    if (
      TL.cx >= TR.cx ||
      BL.cx >= BR.cx ||
      TL.cy >= BL.cy ||
      TR.cy >= BR.cy ||
      widthRatio < 0.25 ||
      heightRatio < 0.25 ||
      aspectDeviation > 0.80
    ) {
      return { scale: nominalScale, transformPoint: nominalTransformPoint };
    }

    const quad: QuadPoints = {
      TL: { x: TL.cx, y: TL.cy },
      TR: { x: TR.cx, y: TR.cy },
      BL: { x: BL.cx, y: BL.cy },
      BR: { x: BR.cx, y: BR.cy },
    };

    try {
      const homography = ProjectiveHomography.fromUnitSquareToQuad(quad);
      const refTL = anchorRegion.markers.TL.center;
      const refTR = anchorRegion.markers.TR.center;
      const refBL = anchorRegion.markers.BL.center;
      const scale = ((topWidth + bottomWidth) / 2) / Math.max(1, canonicalWidth);
      return {
        scale,
        transformPoint: (x: number, y: number) => homography.transformPoint(
          (x - refTL.x) / Math.max(1, refTR.x - refTL.x),
          (y - refTL.y) / Math.max(1, refBL.y - refTL.y)
        ),
      };
    } catch {
      return { scale: nominalScale, transformPoint: nominalTransformPoint };
    }
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
    const usedCandidates = new Set<DetectedMarkerCandidate>();

    // Scale the search radius with the physical marker. A fixed 42px ceiling
    // rejects real fiducials in high-resolution mobile captures after perspective
    // projection. Candidate-size validation below limits false positives.
    const expectedMarkerSize = region.markers.TL.size * pose.scale;
    const maxSearchRadius = Math.max(24, Math.min(180, expectedMarkerSize * 3.5));

    // Prioritize candidates with high fill factor (solid black squares) when available,
    // to distinguish physical fiducial markers from filled answer bubbles.
    const solidCandidates = candidates.filter((c) => c.fillFactor >= 0.88);
    const candidatePool = solidCandidates.length >= 3 ? solidCandidates : candidates;

    for (const corner of corners) {
      const canonicalMarker: ReferenceMarker = region.markers[corner];
      const target = pose.transformPoint(canonicalMarker.center.x, canonicalMarker.center.y);

      let bestCandidate: DetectedMarkerCandidate | null = null;
      let minDistance = Infinity;

      for (const cand of candidatePool) {
        // One physical square can represent only one corner. Reusing it creates
        // collapsed or misleading homographies when detections are sparse.
        if (usedCandidates.has(cand)) continue;
        const dist = Math.hypot(cand.cx - target.x, cand.cy - target.y);
        const candidateSize = (cand.width + cand.height) / 2;
        const sizeRatio = candidateSize / Math.max(1, expectedMarkerSize);
        if (
          dist <= maxSearchRadius &&
          sizeRatio >= 0.40 &&
          sizeRatio <= 2.5 &&
          dist < minDistance
        ) {
          minDistance = dist;
          bestCandidate = cand;
        }
      }

      if (bestCandidate) {
        matched[corner] = bestCandidate;
        usedCandidates.add(bestCandidate);
      }
    }

    const detectedCount = Object.keys(matched).length;
    if (detectedCount < 4) {
      const missing = corners.filter((corner) => !matched[corner]);
      const nearestDiagnostics = missing.map((corner) => {
        const marker = region.markers[corner];
        const target = pose.transformPoint(marker.center.x, marker.center.y);
        const expectedSize = Math.max(1, marker.size * pose.scale);
        const nearest = candidatePool
          .map((candidate) => {
            const distance = Math.hypot(candidate.cx - target.x, candidate.cy - target.y);
            const candidateSize = (candidate.width + candidate.height) / 2;
            return {
              distance,
              sizeRatio: candidateSize / expectedSize,
              fill: candidate.fillFactor,
              x: Math.round(candidate.cx),
              y: Math.round(candidate.cy),
            };
          })
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 3);
        return `${corner} target=(${Math.round(target.x)},${Math.round(target.y)}) nearest=${JSON.stringify(nearest)}`;
      });
      return {
        success: false,
        detectedCount,
        confidence: detectedCount / 4,
        reason: `Missing fiducial markers: ${missing.map((corner) => `${region.id}.${corner}`).join(', ')}. candidates=${candidatePool.length}; radius=${maxSearchRadius.toFixed(1)}; ${nearestDiagnostics.join('; ')}.`,
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
