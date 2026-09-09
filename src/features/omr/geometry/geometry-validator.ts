/**
 * Project KIT — Canonical OMR Geometry Validator
 * Ensures that the generated physical layout strictly conforms to page boundaries,
 * marker visibility, bubble clearances, margin safety, and valid student/item limits.
 */

import { CanonicalOmrGeometry, GeometryValidationResult } from './geometry-types';

export function validateCanonicalGeometry(geometry: CanonicalOmrGeometry): GeometryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { page, regions, markers, rollNumberGrid, answerBlocks, config } = geometry;

  // 1. Validate Item Count and Capacity
  const maxCapacity = 90;
  if (config.itemCount < 1) {
    errors.push(`Invalid itemCount: ${config.itemCount}. Must be at least 1.`);
  } else if (config.itemCount > maxCapacity) {
    errors.push(
      `CONFIGURATION_ERROR: EXCEEDS_PAGE_CAPACITY. Configured itemCount=${config.itemCount} exceeds single-page capacity of ${maxCapacity}. Available height=${page.height - page.margins.top - page.margins.bottom}px.`
    );
  }

  // 2. Validate Class Size
  if (config.classSize < 1 || config.classSize > 70) {
    errors.push(`Invalid classSize: ${config.classSize}. Must be between 1 and 70.`);
  }

  // 3. Verify exact Roll Number count
  if (rollNumberGrid.length !== config.classSize) {
    errors.push(
      `Roll target mismatch: expected exactly ${config.classSize} roll targets, got ${rollNumberGrid.length}.`
    );
  }

  // 4. Verify exact Answer Items count
  if (answerBlocks.length !== config.itemCount) {
    errors.push(
      `Answer item mismatch: expected exactly ${config.itemCount} answer items, got ${answerBlocks.length}.`
    );
  }

  // 5. Check Region boundaries within printable margins
  const minX = page.margins.left;
  const maxX = page.width - page.margins.right;
  const minY = page.margins.top;
  const maxY = page.height - page.margins.bottom;

  for (const region of regions) {
    if (region.bounds.x < minX || region.bounds.x + region.bounds.width > maxX) {
      errors.push(
        `Region '${region.id}' horizontal bounds [${region.bounds.x}, ${region.bounds.x + region.bounds.width}] exceed printable width [${minX}, ${maxX}].`
      );
    }
    if (region.bounds.y < minY || region.bounds.y + region.bounds.height > maxY) {
      errors.push(
        `Region '${region.id}' vertical bounds [${region.bounds.y}, ${region.bounds.y + region.bounds.height}] exceed printable height [${minY}, ${maxY}].`
      );
    }

    // Verify 4 markers per region
    const corners: Array<'TL' | 'TR' | 'BL' | 'BR'> = ['TL', 'TR', 'BL', 'BR'];
    for (const corner of corners) {
      const m = region.markers[corner];
      if (!m) {
        errors.push(`Region '${region.id}' is missing required fiducial marker ${corner}.`);
      } else {
        if (m.bounds.width !== m.bounds.height || m.bounds.width < 10) {
          errors.push(`Marker '${m.id}' has invalid dimensions ${m.bounds.width}x${m.bounds.height}. Must be square >= 10px.`);
        }
      }
    }
  }

  // 6. Check for Region Collisions
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const r1 = regions[i];
      const r2 = regions[j];
      const overlaps = !(
        r1.bounds.x + r1.bounds.width <= r2.bounds.x ||
        r2.bounds.x + r2.bounds.width <= r1.bounds.x ||
        r1.bounds.y + r1.bounds.height <= r2.bounds.y ||
        r2.bounds.y + r2.bounds.height <= r1.bounds.y
      );
      if (overlaps) {
        errors.push(`Region collision detected between '${r1.id}' and '${r2.id}'.`);
      }
    }
  }

  // 7. Verify Bubble to Marker Clearances (Bubbles must not overlap markers)
  for (const item of answerBlocks) {
    const region = geometry.regionMap[item.regionId];
    if (!region) {
      errors.push(`Answer item ${item.itemNumber} references nonexistent region '${item.regionId}'.`);
      continue;
    }

    for (const choice of item.choices) {
      // Must be within region bounds
      if (
        choice.canonicalCenter.x < region.bounds.x ||
        choice.canonicalCenter.x > region.bounds.x + region.bounds.width ||
        choice.canonicalCenter.y < region.bounds.y ||
        choice.canonicalCenter.y > region.bounds.y + region.bounds.height
      ) {
        errors.push(
          `Answer item ${item.itemNumber} choice ${choice.choice} center (${choice.canonicalCenter.x}, ${choice.canonicalCenter.y}) lies outside region '${region.id}'.`
        );
      }

      // Check clearance with all 4 region markers
      for (const corner of ['TL', 'TR', 'BL', 'BR'] as const) {
        const m = region.markers[corner];
        const dx = choice.canonicalCenter.x - m.center.x;
        const dy = choice.canonicalCenter.y - m.center.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = choice.radius + m.size / 2 + 4; // minimum 4px clearance
        if (dist < minDist) {
          errors.push(
            `Answer item ${item.itemNumber} choice ${choice.choice} collides with marker '${m.id}' (distance=${dist.toFixed(1)}px < min=${minDist}px).`
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      totalItems: answerBlocks.length,
      totalRollTargets: rollNumberGrid.length,
      totalRegions: regions.length,
      totalMarkers: markers.length,
      requiredHeight: maxY,
      availableHeight: page.height,
      requiredWidth: maxX,
      availableWidth: page.width,
    },
  };
}

