/**
 * Project KIT — Table of Specifications (TOS) Deterministic Math & Allocation Engine
 * 
 * Implements:
 * - DepEd Hamilton Largest-Remainder Item Allocation based on Days Taught
 * - Multi-tier Cognitive Domain Distribution (REM, UND, APP, ANA, EVA, CRE)
 * - Contiguous Item Number Range Assignment per Competency & Cognitive Domain
 */

export interface CognitiveDistributionConfig {
  lower: number;   // Default 60% (Remembering + Understanding)
  mid: number;     // Default 30% (Applying + Analyzing)
  higher: number;  // Default 10% (Evaluating + Creating)
}

export const DEFAULT_COGNITIVE_DISTRIBUTION: CognitiveDistributionConfig = {
  lower: 60,
  mid: 30,
  higher: 10,
};

export interface CognitiveDomains {
  remembering: number;
  understanding: number;
  applying: number;
  analyzing: number;
  evaluating: number;
  creating: number;
}

export interface CognitiveRanges {
  remembering: string;
  understanding: string;
  applying: string;
  analyzing: string;
  evaluating: string;
  creating: string;
}

export interface TosCompetencyInput {
  id: string;
  code?: string;
  description: string;
  daysTaught: number;
  legacyHours?: number;
}

export interface CalculatedCompetencyRow {
  id: string;
  code: string;
  description: string;
  daysTaught: number;
  percentage: number; // e.g. 25.0
  itemCount: number;
  itemRange: string; // e.g. "1-8" or "9"
  startItem: number;
  endItem: number;
  domains: CognitiveDomains;
  domainRanges: CognitiveRanges;
}

export interface TosCalculationResult {
  rows: CalculatedCompetencyRow[];
  totalDays: number;
  totalPercentage: number;
  totalAllocatedItems: number;
  targetItems: number;
  isValid: boolean;
  validationError?: string;
  warnings?: string[];
  zeroItemCompetencies?: string[];
}

/**
 * Format a contiguous range: start to end.
 * If start > end, returns "—" (0 items).
 * If start === end, returns "start" (e.g. "5").
 * If start < end, returns "start-end" (e.g. "1-8").
 */
export function formatRange(start: number, end: number): string {
  if (start > end || start <= 0) return '—';
  if (start === end) return `${start}`;
  return `${start}–${end}`;
}

/**
 * Validates inputs for TOS calculation.
 */
export function validateTosInputs(
  competencies: TosCompetencyInput[],
  totalItems: number
): { valid: boolean; error?: string } {
  if (!competencies || competencies.length === 0) {
    return { valid: false, error: 'A TOS must have at least 1 learning competency.' };
  }
  if (competencies.length > 4) {
    return { valid: false, error: 'A TOS can have up to 4 learning competencies.' };
  }
  if (totalItems <= 0) {
    return { valid: false, error: 'Total items must be greater than 0.' };
  }

  for (let i = 0; i < competencies.length; i++) {
    const comp = competencies[i];
    if (comp.daysTaught <= 0) {
      return {
        valid: false,
        error: `Competency ${i + 1} (${comp.code || comp.description || 'Untitled'}) has invalid days taught (${comp.daysTaught}). Days must be greater than 0.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Distributes an item count into 6 Bloom's cognitive domains using Hamilton largest-remainder.
 * Breakdown:
 * - Lower: remembering (lower / 2), understanding (lower / 2)
 * - Mid: applying (mid / 2), analyzing (mid / 2)
 * - Higher: evaluating (higher / 2), creating (higher / 2)
 */
export function allocateCognitiveDomains(
  itemCount: number,
  distConfig: CognitiveDistributionConfig = DEFAULT_COGNITIVE_DISTRIBUTION
): CognitiveDomains {
  const result: CognitiveDomains = {
    remembering: 0,
    understanding: 0,
    applying: 0,
    analyzing: 0,
    evaluating: 0,
    creating: 0,
  };

  if (itemCount <= 0) {
    return result;
  }

  // Exact weights summing to 1.0
  const totalWeight = distConfig.lower + distConfig.mid + distConfig.higher;
  const weights = [
    { key: 'remembering' as const, weight: (distConfig.lower / 2) / totalWeight },
    { key: 'understanding' as const, weight: (distConfig.lower / 2) / totalWeight },
    { key: 'applying' as const, weight: (distConfig.mid / 2) / totalWeight },
    { key: 'analyzing' as const, weight: (distConfig.mid / 2) / totalWeight },
    { key: 'evaluating' as const, weight: (distConfig.higher / 2) / totalWeight },
    { key: 'creating' as const, weight: (distConfig.higher / 2) / totalWeight },
  ];

  // Hamilton Largest-Remainder Method
  const quotas = weights.map((w, index) => {
    const exact = itemCount * w.weight;
    const floor = Math.floor(exact);
    const remainder = exact - floor;
    return {
      key: w.key,
      floor,
      remainder,
      index, // For deterministic tie-breaking by domain priority
    };
  });

  let allocated = quotas.reduce((sum, q) => sum + q.floor, 0);
  let remainderItems = itemCount - allocated;

  // Sort descending by remainder, then ascending by original index (tie-breaker)
  const sortedByRemainder = [...quotas].sort((a, b) => {
    if (Math.abs(b.remainder - a.remainder) > 1e-9) {
      return b.remainder - a.remainder;
    }
    return a.index - b.index;
  });

  for (let i = 0; i < remainderItems; i++) {
    const target = sortedByRemainder[i % sortedByRemainder.length];
    const match = quotas.find((q) => q.key === target.key);
    if (match) {
      match.floor += 1;
    }
  }

  quotas.forEach((q) => {
    result[q.key] = q.floor;
  });

  return result;
}

/**
 * Full Hamilton calculation for all competencies and cognitive levels.
 */
export function calculateTos(
  competencies: TosCompetencyInput[],
  totalItems: number,
  distConfig: CognitiveDistributionConfig = DEFAULT_COGNITIVE_DISTRIBUTION
): TosCalculationResult {
  const validation = validateTosInputs(competencies, totalItems);
  if (!validation.valid) {
    return {
      rows: [],
      totalDays: 0,
      totalPercentage: 0,
      totalAllocatedItems: 0,
      targetItems: totalItems,
      isValid: false,
      validationError: validation.error,
      warnings: [],
      zeroItemCompetencies: [],
    };
  }

  const totalDays = competencies.reduce((acc, c) => acc + Math.max(0, c.daysTaught), 0);
  if (totalDays <= 0) {
    return {
      rows: [],
      totalDays: 0,
      totalPercentage: 0,
      totalAllocatedItems: 0,
      targetItems: totalItems,
      isValid: false,
      validationError: 'Total days taught must be greater than 0.',
      warnings: [],
      zeroItemCompetencies: [],
    };
  }

  // Step 1: Hamilton allocation for competencies based on days taught
  // Requirement C4: Every competency with days > 0 gets at least 1 item when totalItems >= competencies.length.
  const hasMinimumGuarantee = totalItems >= competencies.length;
  const itemsToDistribute = hasMinimumGuarantee ? totalItems - competencies.length : totalItems;

  const compQuotas = competencies.map((comp, index) => {
    const exactFraction = comp.daysTaught / totalDays;
    const additionalItems = itemsToDistribute * exactFraction;
    const floor = (hasMinimumGuarantee ? 1 : 0) + Math.floor(additionalItems);
    const remainder = additionalItems - Math.floor(additionalItems);

    return {
      comp,
      index,
      daysTaught: comp.daysTaught,
      percentage: exactFraction * 100,
      floor,
      remainder,
    };
  });

  const baseAllocated = compQuotas.reduce((sum, q) => sum + q.floor, 0);
  const surplus = totalItems - baseAllocated;

  // Allocate leftover items by largest remainder, using index as deterministic tie-breaker
  const sortedCompByRemainder = [...compQuotas].sort((a, b) => {
    if (Math.abs(b.remainder - a.remainder) > 1e-9) {
      return b.remainder - a.remainder;
    }
    return a.index - b.index;
  });

  for (let i = 0; i < surplus; i++) {
    const target = sortedCompByRemainder[i % sortedCompByRemainder.length];
    const match = compQuotas.find((q) => q.comp.id === target.comp.id);
    if (match) {
      match.floor += 1;
    }
  }

  // Step 2: Assign contiguous item numbers & cognitive domain ranges
  let currentItemCursor = 1;

  const rows: CalculatedCompetencyRow[] = compQuotas.map((cq) => {
    const itemCount = cq.floor;
    const startItem = itemCount > 0 ? currentItemCursor : 0;
    const endItem = itemCount > 0 ? currentItemCursor + itemCount - 1 : 0;
    const itemRange = formatRange(startItem, endItem);

    // Compute cognitive domains for this row
    const domains = allocateCognitiveDomains(itemCount, distConfig);

    // Assign contiguous ranges within cognitive domains in Bloom's order
    let domainCursor = startItem;
    const domainKeys: (keyof CognitiveDomains)[] = [
      'remembering',
      'understanding',
      'applying',
      'analyzing',
      'evaluating',
      'creating',
    ];

    const domainRanges: CognitiveRanges = {
      remembering: '—',
      understanding: '—',
      applying: '—',
      analyzing: '—',
      evaluating: '—',
      creating: '—',
    };

    if (itemCount > 0) {
      domainKeys.forEach((key) => {
        const count = domains[key];
        if (count > 0) {
          const dStart = domainCursor;
          const dEnd = domainCursor + count - 1;
          domainRanges[key] = formatRange(dStart, dEnd);
          domainCursor += count;
        } else {
          domainRanges[key] = '—';
        }
      });
      currentItemCursor = endItem + 1;
    }

    return {
      id: cq.comp.id,
      code: cq.comp.code || `COMP-${cq.index + 1}`,
      description: cq.comp.description,
      daysTaught: cq.comp.daysTaught,
      percentage: Math.round(cq.percentage * 10) / 10,
      itemCount,
      itemRange,
      startItem,
      endItem,
      domains,
      domainRanges,
    };
  });

  const totalAllocatedItems = rows.reduce((sum, r) => sum + r.itemCount, 0);

  const warnings: string[] = [];
  const zeroItemCompetencies: string[] = [];

  if (totalItems < competencies.length) {
    warnings.push(`Total items (${totalItems}) is less than the number of competencies (${competencies.length}).`);
  }

  rows.forEach((r, idx) => {
    if (r.itemCount === 0) {
      const compLabel = r.code || r.description || `Competency ${idx + 1}`;
      warnings.push(`Competency ${compLabel} has no items.`);
      zeroItemCompetencies.push(compLabel);
    }
  });

  return {
    rows,
    totalDays,
    totalPercentage: 100,
    totalAllocatedItems,
    targetItems: totalItems,
    isValid: totalAllocatedItems === totalItems,
    warnings,
    zeroItemCompetencies,
  };
}
