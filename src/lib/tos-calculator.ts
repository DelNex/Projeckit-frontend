/**
 * Project KIT — Table of Specifications (TOS) Deterministic Math & Allocation Engine
 * 
 * Implements:
 * - DepEd Hamilton Largest-Remainder Item Allocation based on Days Taught
 * - Action-Verb Driven Bloom's Taxonomy Placement (Balanced with primary action verb)
 * - DepEd Order 8, s. 2015 60/30/10 Cognitive Distribution mode
 * - Exact Item Numbers per Bloom Domain (e.g. "4, 7" or "15, 23")
 * - Uniqueness and completeness validation across all item numbers [1..N]
 */

export type BloomLevel =
  | 'remembering'
  | 'understanding'
  | 'applying'
  | 'analyzing'
  | 'evaluating'
  | 'creating';

export const BLOOM_LEVELS: BloomLevel[] = [
  'remembering',
  'understanding',
  'applying',
  'analyzing',
  'evaluating',
  'creating',
];

export const BLOOM_LEVEL_LABELS: Record<BloomLevel, string> = {
  remembering: 'Remembering',
  understanding: 'Understanding',
  applying: 'Applying',
  analyzing: 'Analyzing',
  evaluating: 'Evaluating',
  creating: 'Creating',
};

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
  domainItemNumbers: Record<BloomLevel, number[]>;
  domainDisplay: Record<BloomLevel, string>;
  primaryBloomLevel: BloomLevel;
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
  allocationMode: 'action_verb' | 'deped_order_8';
}

/**
 * Format a contiguous range: start to end.
 */
export function formatRange(start: number, end: number): string {
  if (start > end || start <= 0) return '—';
  if (start === end) return `${start}`;
  return `${start}–${end}`;
}

/**
 * Format an array of item numbers for display in Bloom cells (e.g. "4" or "15, 23").
 */
export function formatItemList(items: number[]): string {
  if (!items || items.length === 0) return '—';
  return items.join(', ');
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
 * Action Verb dictionary mapping English and Filipino verbs to Bloom's taxonomy levels.
 */
const VERB_TO_BLOOM: Record<string, BloomLevel> = {
  // Remembering
  define: 'remembering',
  defines: 'remembering',
  recall: 'remembering',
  recalls: 'remembering',
  identify: 'remembering',
  identifies: 'remembering',
  list: 'remembering',
  lists: 'remembering',
  name: 'remembering',
  names: 'remembering',
  state: 'remembering',
  states: 'remembering',
  label: 'remembering',
  labels: 'remembering',
  match: 'remembering',
  matches: 'remembering',
  repeat: 'remembering',
  repeats: 'remembering',
  recognize: 'remembering',
  recognizes: 'remembering',
  memorize: 'remembering',
  memorizes: 'remembering',
  kilalanin: 'remembering',
  alalahanin: 'remembering',
  itala: 'remembering',
  magbigay: 'remembering',
  'isa-isahin': 'remembering',
  tukuyin: 'remembering',

  // Understanding
  describe: 'understanding',
  describes: 'understanding',
  explain: 'understanding',
  explains: 'understanding',
  discuss: 'understanding',
  discusses: 'understanding',
  summarize: 'understanding',
  summarizes: 'understanding',
  interpret: 'understanding',
  interprets: 'understanding',
  clarify: 'understanding',
  clarifies: 'understanding',
  classify: 'understanding',
  classifies: 'understanding',
  illustrate: 'understanding',
  illustrates: 'understanding',
  locate: 'understanding',
  locates: 'understanding',
  report: 'understanding',
  reports: 'understanding',
  translate: 'understanding',
  translates: 'understanding',
  paraphrase: 'understanding',
  paraphrases: 'understanding',
  distinguish: 'understanding',
  distinguishes: 'understanding',
  ilarawan: 'understanding',
  ipaliwanag: 'understanding',
  talakayin: 'understanding',
  buurin: 'understanding',
  paghambingin: 'understanding',

  // Applying
  apply: 'applying',
  applies: 'applying',
  demonstrate: 'applying',
  demonstrates: 'applying',
  calculate: 'applying',
  calculates: 'applying',
  solve: 'applying',
  solves: 'applying',
  compute: 'applying',
  computes: 'applying',
  implement: 'applying',
  implements: 'applying',
  use: 'applying',
  uses: 'applying',
  construct: 'applying',
  constructs: 'applying',
  practice: 'applying',
  practices: 'applying',
  operate: 'applying',
  operates: 'applying',
  execute: 'applying',
  executes: 'applying',
  perform: 'applying',
  performs: 'applying',
  show: 'applying',
  shows: 'applying',
  ilapat: 'applying',
  isagawa: 'applying',
  gamitin: 'applying',
  lutasin: 'applying',
  kwentahin: 'applying',
  patakbuhin: 'applying',

  // Analyzing
  analyze: 'analyzing',
  analyzes: 'analyzing',
  compare: 'analyzing',
  compares: 'analyzing',
  contrast: 'analyzing',
  contrasts: 'analyzing',
  examine: 'analyzing',
  examines: 'analyzing',
  differentiate: 'analyzing',
  differentiates: 'analyzing',
  categorize: 'analyzing',
  categorizes: 'analyzing',
  investigate: 'analyzing',
  investigates: 'analyzing',
  inspect: 'analyzing',
  inspects: 'analyzing',
  test: 'analyzing',
  tests: 'analyzing',
  suriin: 'analyzing',
  ihambing: 'analyzing',
  'pag-ibahin': 'analyzing',
  siyasatin: 'analyzing',

  // Evaluating
  evaluate: 'evaluating',
  evaluates: 'evaluating',
  judge: 'evaluating',
  judges: 'evaluating',
  assess: 'evaluating',
  assesses: 'evaluating',
  critique: 'evaluating',
  critiques: 'evaluating',
  defend: 'evaluating',
  defends: 'evaluating',
  justify: 'evaluating',
  justifies: 'evaluating',
  rate: 'evaluating',
  rates: 'evaluating',
  verify: 'evaluating',
  verifies: 'evaluating',
  validate: 'evaluating',
  validates: 'evaluating',
  appraise: 'evaluating',
  appraises: 'evaluating',
  tayain: 'evaluating',
  hatulan: 'evaluating',
  pangatwiranan: 'evaluating',

  // Creating
  create: 'creating',
  creates: 'creating',
  design: 'creating',
  designs: 'creating',
  develop: 'creating',
  develops: 'creating',
  formulate: 'creating',
  formulates: 'creating',
  generate: 'creating',
  generates: 'creating',
  compose: 'creating',
  composes: 'creating',
  produce: 'creating',
  produces: 'creating',
  assemble: 'creating',
  assembles: 'creating',
  write: 'creating',
  writes: 'creating',
  synthesize: 'creating',
  synthesizes: 'creating',
  bumuo: 'creating',
  lumikha: 'creating',
  magdisenyo: 'creating',
  gumawa: 'creating',
};

/**
 * Classifies the primary Bloom's taxonomy level from the leading action verb.
 * Defaults to 'understanding' if no matching verb is found.
 */
export function classifyActionVerb(description: string): BloomLevel {
  if (!description || !description.trim()) return 'understanding';
  const clean = description.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').trim();
  const words = clean.split(/\s+/);
  for (const word of words) {
    if (VERB_TO_BLOOM[word]) {
      return VERB_TO_BLOOM[word];
    }
  }
  return 'understanding';
}

/**
 * Distributes an item count into 6 Bloom's levels using the DepEd Order 8 60/30/10 ratio.
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

  if (itemCount <= 0) return result;

  const totalWeight = distConfig.lower + distConfig.mid + distConfig.higher;
  const weights = [
    { key: 'remembering' as const, weight: (distConfig.lower / 2) / totalWeight },
    { key: 'understanding' as const, weight: (distConfig.lower / 2) / totalWeight },
    { key: 'applying' as const, weight: (distConfig.mid / 2) / totalWeight },
    { key: 'analyzing' as const, weight: (distConfig.mid / 2) / totalWeight },
    { key: 'evaluating' as const, weight: (distConfig.higher / 2) / totalWeight },
    { key: 'creating' as const, weight: (distConfig.higher / 2) / totalWeight },
  ];

  const quotas = weights.map((w, index) => {
    const exact = itemCount * w.weight;
    const floor = Math.floor(exact);
    const remainder = exact - floor;
    return {
      key: w.key,
      floor,
      remainder,
      index,
    };
  });

  const allocated = quotas.reduce((sum, q) => sum + q.floor, 0);
  const remainderItems = itemCount - allocated;

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
 * Balanced Bloom allocation based on the competency's primary action verb and exam type.
 * Divides items evenly across all 6 levels and distributes remainder starting from primary verb level.
 */
export function allocateBalancedCognitiveDomains(
  itemCount: number,
  primaryLevel: BloomLevel,
  examType = 'Summative Test 1'
): CognitiveDomains {
  const result: CognitiveDomains = {
    remembering: 0,
    understanding: 0,
    applying: 0,
    analyzing: 0,
    evaluating: 0,
    creating: 0,
  };

  if (itemCount <= 0) return result;

  const baseEach = Math.floor(itemCount / 6);
  let remainder = itemCount % 6;

  BLOOM_LEVELS.forEach((level) => {
    result[level] = baseEach;
  });

  // Priority order for remainder: primary level first, then adjacent levels
  const primaryIdx = BLOOM_LEVELS.indexOf(primaryLevel);
  const remainderPriority: BloomLevel[] = [];
  remainderPriority.push(primaryLevel);

  // Add adjacent levels in alternating pattern (primary+1, primary-1, etc.)
  for (let step = 1; step < 6; step++) {
    const nextIdx = (primaryIdx + step) % 6;
    if (!remainderPriority.includes(BLOOM_LEVELS[nextIdx])) {
      remainderPriority.push(BLOOM_LEVELS[nextIdx]);
    }
    const prevIdx = (primaryIdx - step + 6) % 6;
    if (!remainderPriority.includes(BLOOM_LEVELS[prevIdx])) {
      remainderPriority.push(BLOOM_LEVELS[prevIdx]);
    }
  }

  for (let i = 0; i < remainder; i++) {
    const levelToIncrement = remainderPriority[i % remainderPriority.length];
    result[levelToIncrement] += 1;
  }

  // Preset adjustment for "Long Quiz" if exam type is quiz: lean slightly toward lower-order thinking
  const cleanExamType = examType.toLowerCase();
  if (cleanExamType.includes('quiz') && itemCount >= 6 && result.creating > 0) {
    // Transfer 1 item from creating to remembering/understanding for quiz preset
    result.creating -= 1;
    if (primaryLevel === 'remembering' || primaryLevel === 'understanding') {
      result[primaryLevel] += 1;
    } else {
      result.understanding += 1;
    }
  }

  return result;
}

export interface CalculateTosOptions {
  allocationMode?: 'action_verb' | 'deped_order_8';
  examType?: string;
  distConfig?: CognitiveDistributionConfig;
}

/**
 * Full deterministic calculation for all competencies and cognitive levels.
 */
export function calculateTos(
  competencies: TosCompetencyInput[],
  totalItems: number,
  optionsOrDistConfig?: CalculateTosOptions | CognitiveDistributionConfig
): TosCalculationResult {
  let mode: 'action_verb' | 'deped_order_8' = 'action_verb';
  let examType = 'Summative Test 1';
  let distConfig = DEFAULT_COGNITIVE_DISTRIBUTION;

  if (optionsOrDistConfig) {
    if ('lower' in optionsOrDistConfig) {
      mode = 'deped_order_8';
      distConfig = optionsOrDistConfig as CognitiveDistributionConfig;
    } else {
      const opts = optionsOrDistConfig as CalculateTosOptions;
      if (opts.allocationMode) mode = opts.allocationMode;
      if (opts.examType) examType = opts.examType;
      if (opts.distConfig) distConfig = opts.distConfig;
    }
  }

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
      allocationMode: mode,
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
      allocationMode: mode,
    };
  }

  // Step 1: Hamilton allocation for competencies based on days taught
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

  // Step 2: Assign contiguous item numbers & individual item placement
  let currentItemCursor = 1;

  const rows: CalculatedCompetencyRow[] = compQuotas.map((cq) => {
    const itemCount = cq.floor;
    const startItem = itemCount > 0 ? currentItemCursor : 0;
    const endItem = itemCount > 0 ? currentItemCursor + itemCount - 1 : 0;
    const itemRange = formatRange(startItem, endItem);

    const primaryBloomLevel = classifyActionVerb(cq.comp.description);

    const domains = mode === 'action_verb'
      ? allocateBalancedCognitiveDomains(itemCount, primaryBloomLevel, examType)
      : allocateCognitiveDomains(itemCount, distConfig);

    const domainRanges: CognitiveRanges = {
      remembering: '—',
      understanding: '—',
      applying: '—',
      analyzing: '—',
      evaluating: '—',
      creating: '—',
    };

    const domainItemNumbers: Record<BloomLevel, number[]> = {
      remembering: [],
      understanding: [],
      applying: [],
      analyzing: [],
      evaluating: [],
      creating: [],
    };

    const domainDisplay: Record<BloomLevel, string> = {
      remembering: '—',
      understanding: '—',
      applying: '—',
      analyzing: '—',
      evaluating: '—',
      creating: '—',
    };

    if (itemCount > 0) {
      let domainCursor = startItem;
      BLOOM_LEVELS.forEach((level) => {
        const count = domains[level];
        if (count > 0) {
          const dStart = domainCursor;
          const dEnd = domainCursor + count - 1;
          domainRanges[level] = formatRange(dStart, dEnd);
          const itemArr: number[] = [];
          for (let it = dStart; it <= dEnd; it++) {
            itemArr.push(it);
          }
          domainItemNumbers[level] = itemArr;
          domainDisplay[level] = formatItemList(itemArr);
          domainCursor += count;
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
      domainItemNumbers,
      domainDisplay,
      primaryBloomLevel,
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
    allocationMode: mode,
  };
}

/**
 * Validates that all item numbers placed across all competencies and Bloom levels
 * are strictly unique and form an exact contiguous cover of 1 to targetItems.
 */
export function validateItemPlacementUniqueness(result: TosCalculationResult): {
  valid: boolean;
  missing: number[];
  duplicates: number[];
} {
  const seen = new Map<number, number>();
  result.rows.forEach((row) => {
    BLOOM_LEVELS.forEach((level) => {
      row.domainItemNumbers[level].forEach((num) => {
        seen.set(num, (seen.get(num) || 0) + 1);
      });
    });
  });

  const duplicates: number[] = [];
  seen.forEach((count, num) => {
    if (count > 1) duplicates.push(num);
  });

  const missing: number[] = [];
  for (let i = 1; i <= result.targetItems; i++) {
    if (!seen.has(i)) {
      missing.push(i);
    }
  }

  return {
    valid: duplicates.length === 0 && missing.length === 0 && seen.size === result.targetItems,
    missing,
    duplicates,
  };
}
