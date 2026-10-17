/**
 * Project KIT — DepEd Exam Generation Data Models & Strict Validator
 * Complies with DepEd TOS competency mapping and cognitive distribution standards.
 */

export type CognitiveDomain =
  | 'remembering'
  | 'understanding'
  | 'applying'
  | 'analyzing'
  | 'evaluating'
  | 'creating';

export interface ExamQuestion {
  item_number: number;
  competency_id: string;
  cognitive_level: CognitiveDomain;
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correct_answer: 'A' | 'B' | 'C' | 'D';
  rationale: string;
}

export interface TosBlueprintSlot {
  item_number: number;
  competency_id: string;
  competency_code: string;
  competency_description: string;
  cognitive_level: CognitiveDomain;
}

export interface ExamValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingItemNumbers: number[];
  repairedQuestions: ExamQuestion[];
  distributionMatchesTOS: boolean;
}

const VALID_DOMAINS: Set<CognitiveDomain> = new Set([
  'remembering',
  'understanding',
  'applying',
  'analyzing',
  'evaluating',
  'creating',
]);

const VALID_ANSWERS = new Set(['A', 'B', 'C', 'D']);

/**
 * Validates and repairs an array of generated questions against the target item count
 * and the expected TOS blueprint slots.
 */
export function validateExamQuestions(
  rawQuestions: unknown[],
  targetItems: number,
  expectedSlots?: TosBlueprintSlot[]
): ExamValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const repairedQuestions: ExamQuestion[] = [];
  const slotMap = new Map<number, TosBlueprintSlot>();

  if (expectedSlots) {
    expectedSlots.forEach((slot) => {
      slotMap.set(slot.item_number, slot);
    });
  }

  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    const missing = Array.from({ length: targetItems }, (_, i) => i + 1);
    return {
      isValid: false,
      errors: ['No questions were generated or the response is empty.'],
      warnings: [],
      missingItemNumbers: missing,
      repairedQuestions: [],
      distributionMatchesTOS: false,
    };
  }

  const seenNumbers = new Set<number>();
  const seenStems: Array<{ itemNum: number; stem: string }> = [];

  rawQuestions.forEach((item: any, idx) => {
    const parsedNum = Number(item?.item_number || item?.number || idx + 1);
    const itemNum = isNaN(parsedNum) || parsedNum <= 0 ? idx + 1 : parsedNum;
    const itemLabel = `Item ${itemNum}`;

    if (seenNumbers.has(itemNum)) {
      warnings.push(`${itemLabel}: Duplicate question number detected. Renumbering.`);
    }
    seenNumbers.add(itemNum);

    // Expected blueprint slot
    const slot = slotMap.get(itemNum);

    // Validate and repair question text
    const questionText = (item?.question || item?.stem || '').trim();
    if (!questionText) {
      errors.push(`${itemLabel}: Question stem is missing.`);
    }

    // Validate options
    let rawOptions = item?.options || item?.choices;
    const formattedOptions: { A: string; B: string; C: string; D: string } = {
      A: '',
      B: '',
      C: '',
      D: '',
    };

    if (Array.isArray(rawOptions)) {
      // [{ label: 'A', text: '...' }]
      rawOptions.forEach((opt: any, optIdx) => {
        const key = (opt?.label || ['A', 'B', 'C', 'D'][optIdx] || '').toUpperCase();
        if (key in formattedOptions) {
          (formattedOptions as any)[key] = (opt?.text || opt?.value || String(opt)).trim();
        }
      });
    } else if (typeof rawOptions === 'object' && rawOptions !== null) {
      formattedOptions.A = (rawOptions.A || rawOptions.a || '').trim();
      formattedOptions.B = (rawOptions.B || rawOptions.b || '').trim();
      formattedOptions.C = (rawOptions.C || rawOptions.c || '').trim();
      formattedOptions.D = (rawOptions.D || rawOptions.d || '').trim();
    } else {
      errors.push(`${itemLabel}: Multiple choice options A-D are missing.`);
    }

    // Check if any option is empty
    if (!formattedOptions.A || !formattedOptions.B || !formattedOptions.C || !formattedOptions.D) {
      errors.push(`${itemLabel}: One or more multiple-choice options (A-D) are blank.`);
    } else {
      // Check for four distinct options
      const optSet = new Set([
        formattedOptions.A.toLowerCase(),
        formattedOptions.B.toLowerCase(),
        formattedOptions.C.toLowerCase(),
        formattedOptions.D.toLowerCase(),
      ]);
      if (optSet.size < 4) {
        errors.push(`${itemLabel}: Duplicate options detected; all four options must be distinct.`);
      }
    }

    // Check duplicate question stems across the exam
    const normalizedStem = questionText.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    if (normalizedStem && normalizedStem.length > 10) {
      const matchExisting = seenStems.find((s) => s.stem === normalizedStem);
      if (matchExisting) {
        errors.push(`${itemLabel}: Duplicate question detected across exam (identical to Item ${matchExisting.itemNum}).`);
      } else {
        seenStems.push({ itemNum, stem: normalizedStem });
      }
    }

    // Validate correct answer
    let rawAns = String(item?.correct_answer || item?.correctAnswer || item?.answer || '')
      .trim()
      .toUpperCase();
    if (!VALID_ANSWERS.has(rawAns)) {
      // Attempt extraction if written as "Option A", "Choice B", "(C)", or single letter
      const match = rawAns.match(/\b([A-D])\b|^([A-D])\)?$/);
      if (match) {
        rawAns = (match[1] || match[2]).toUpperCase();
      } else {
        errors.push(`${itemLabel}: Invalid or missing correct answer (must be A, B, C, or D).`);
        rawAns = 'A'; // fallback to allow repair
      }
    }

    // Validate cognitive domain
    let domain: CognitiveDomain = String(
      item?.cognitive_level || item?.cognitiveLevel || slot?.cognitive_level || 'remembering'
    )
      .toLowerCase()
      .trim() as CognitiveDomain;

    if (!VALID_DOMAINS.has(domain)) {
      domain = slot?.cognitive_level || 'remembering';
      warnings.push(`${itemLabel}: Invalid cognitive level mapped to "${domain}".`);
    }

    // Validate competency id
    const compId = (item?.competency_id || item?.competencyId || slot?.competency_id || 'COMP-1').trim();

    const rationale = (
      item?.rationale ||
      item?.explanation ||
      `Option ${rawAns} is the correct answer according to the lesson material.`
    ).trim();

    repairedQuestions.push({
      item_number: itemNum,
      competency_id: compId,
      cognitive_level: domain,
      question: questionText || `Question ${itemNum} based on competency ${compId}`,
      options: formattedOptions,
      correct_answer: rawAns as 'A' | 'B' | 'C' | 'D',
      rationale,
    });
  });

  // Sort by item number
  repairedQuestions.sort((a, b) => a.item_number - b.item_number);

  // Check for missing item numbers up to targetItems
  const existingNumbers = new Set(repairedQuestions.map((q) => q.item_number));
  const missingItemNumbers: number[] = [];
  for (let i = 1; i <= targetItems; i++) {
    if (!existingNumbers.has(i)) {
      missingItemNumbers.push(i);
    }
  }

  if (missingItemNumbers.length > 0) {
    errors.push(
      `Generated ${repairedQuestions.length} of ${targetItems} items. Missing items: ${missingItemNumbers.join(', ')}.`
    );
  }

  // Check if distribution matches expected slots
  let distributionMatchesTOS = true;
  if (expectedSlots && expectedSlots.length > 0) {
    for (const q of repairedQuestions) {
      const slot = slotMap.get(q.item_number);
      if (slot) {
        if (q.cognitive_level !== slot.cognitive_level) {
          distributionMatchesTOS = false;
        }
      }
    }
  }

  return {
    isValid: errors.length === 0 && missingItemNumbers.length === 0,
    errors,
    warnings,
    missingItemNumbers,
    repairedQuestions,
    distributionMatchesTOS,
  };
}

/**
 * Builds the slot allocation blueprint list from TOS rows.
 */
export function buildTosBlueprintSlots(tosRows: any[], targetItems: number): TosBlueprintSlot[] {
  const slots: TosBlueprintSlot[] = [];
  let currentItemNum = 1;

  for (const row of tosRows) {
    const compId = row.id || row.code || `COMP-${currentItemNum}`;
    const compCode = row.code || compId;
    const compDesc = row.description || row.competency || 'Learning Competency';
    const domains = row.domains || {};

    const domainKeys: CognitiveDomain[] = [
      'remembering',
      'understanding',
      'applying',
      'analyzing',
      'evaluating',
      'creating',
    ];

    for (const dom of domainKeys) {
      const count = Number(domains[dom]) || 0;
      for (let i = 0; i < count; i++) {
        if (currentItemNum <= targetItems) {
          slots.push({
            item_number: currentItemNum,
            competency_id: compId,
            competency_code: compCode,
            competency_description: compDesc,
            cognitive_level: dom,
          });
          currentItemNum++;
        }
      }
    }
  }

  // If there are still items unallocated, fill with remembering
  while (currentItemNum <= targetItems) {
    slots.push({
      item_number: currentItemNum,
      competency_id: 'COMP-1',
      competency_code: 'COMP-1',
      competency_description: 'General Competency',
      cognitive_level: 'remembering',
    });
    currentItemNum++;
  }

  return slots;
}
