/**
 * Project KIT — Official DepEd K-12 Grading & Transmutation Engine
 * Compliant with DepEd Order No. 8, s. 2015 for Senior High School (SHS)
 */

export interface GradeComponentWeights {
  writtenWorks: number; // e.g. 0.30 (30%)
  performanceTasks: number; // e.g. 0.50 (50%)
  quarterlyAssessment: number; // e.g. 0.20 (20%)
}

export const DEFAULT_SHS_WEIGHTS: GradeComponentWeights = {
  writtenWorks: 0.30,
  performanceTasks: 0.50,
  quarterlyAssessment: 0.20,
};

export const TRACK_WEIGHT_PRESETS: Record<string, { label: string; weights: GradeComponentWeights }> = {
  core: {
    label: 'Core Subjects (Language, HumSS, etc.)',
    weights: { writtenWorks: 0.25, performanceTasks: 0.50, quarterlyAssessment: 0.25 },
  },
  stem: {
    label: 'Academic Track (STEM, ABM, Math, Sciences)',
    weights: { writtenWorks: 0.35, performanceTasks: 0.40, quarterlyAssessment: 0.25 },
  },
  tvl: {
    label: 'TVL / Arts & Design / Sports Tracks',
    weights: { writtenWorks: 0.20, performanceTasks: 0.60, quarterlyAssessment: 0.20 },
  },
  balanced: {
    label: 'Standard DepEd (30% WW • 50% PT • 20% QA)',
    weights: { writtenWorks: 0.30, performanceTasks: 0.50, quarterlyAssessment: 0.20 },
  },
};

/**
 * Official DepEd K-12 Transmutation Table
 * Maps Initial Grade (0.00 - 100.00) to Transmuted Grade (60 - 100)
 */
export function transmuteInitialGrade(initialGrade: number): number {
  if (isNaN(initialGrade) || initialGrade <= 0) return 60;
  if (initialGrade >= 100) return 100;

  // Exact step mapping as mandated by DepEd Order No. 8, s. 2015
  if (initialGrade >= 98.40) return 99;
  if (initialGrade >= 96.80) return 98;
  if (initialGrade >= 95.20) return 97;
  if (initialGrade >= 93.60) return 96;
  if (initialGrade >= 92.00) return 95;
  if (initialGrade >= 90.40) return 94;
  if (initialGrade >= 88.80) return 93;
  if (initialGrade >= 87.20) return 92;
  if (initialGrade >= 85.60) return 91;
  if (initialGrade >= 84.00) return 90;
  if (initialGrade >= 82.40) return 89;
  if (initialGrade >= 80.80) return 88;
  if (initialGrade >= 79.20) return 87;
  if (initialGrade >= 77.60) return 86;
  if (initialGrade >= 76.00) return 85;
  if (initialGrade >= 74.40) return 84;
  if (initialGrade >= 72.80) return 83;
  if (initialGrade >= 71.20) return 82;
  if (initialGrade >= 69.60) return 81;
  if (initialGrade >= 68.00) return 80;
  if (initialGrade >= 66.40) return 79;
  if (initialGrade >= 64.80) return 78;
  if (initialGrade >= 63.20) return 77;
  if (initialGrade >= 61.60) return 76;
  if (initialGrade >= 60.00) return 75; // DepEd passing threshold

  // Below 60 (Did Not Meet Expectations / 60-74 range)
  if (initialGrade >= 56.00) return 74;
  if (initialGrade >= 52.00) return 73;
  if (initialGrade >= 48.00) return 72;
  if (initialGrade >= 44.00) return 71;
  if (initialGrade >= 40.00) return 70;
  if (initialGrade >= 36.00) return 69;
  if (initialGrade >= 32.00) return 68;
  if (initialGrade >= 28.00) return 67;
  if (initialGrade >= 24.00) return 66;
  if (initialGrade >= 20.00) return 65;
  if (initialGrade >= 16.00) return 64;
  if (initialGrade >= 12.00) return 63;
  if (initialGrade >= 8.00) return 62;
  if (initialGrade >= 4.00) return 61;
  return 60;
}

export interface DepedDescriptor {
  descriptor: string;
  code: 'O' | 'VS' | 'S' | 'FS' | 'DNM';
  color: string;
  isPassed: boolean;
}

export function getDepedDescriptor(transmutedGrade: number): DepedDescriptor {
  if (transmutedGrade >= 90) {
    return {
      descriptor: 'Outstanding',
      code: 'O',
      color: 'emerald',
      isPassed: true,
    };
  }
  if (transmutedGrade >= 85) {
    return {
      descriptor: 'Very Satisfactory',
      code: 'VS',
      color: 'blue',
      isPassed: true,
    };
  }
  if (transmutedGrade >= 80) {
    return {
      descriptor: 'Satisfactory',
      code: 'S',
      color: 'sky',
      isPassed: true,
    };
  }
  if (transmutedGrade >= 75) {
    return {
      descriptor: 'Fairly Satisfactory',
      code: 'FS',
      color: 'amber',
      isPassed: true,
    };
  }
  return {
    descriptor: 'Did Not Meet Expectations',
    code: 'DNM',
    color: 'rose',
    isPassed: false,
  };
}

export interface StudentGradeCalculation {
  wwTotal: number;
  wwMax: number;
  wwPercentage: number;
  wwWeighted: number;

  ptTotal: number;
  ptMax: number;
  ptPercentage: number;
  ptWeighted: number;

  qaScore: number;
  qaMax: number;
  qaPercentage: number;
  qaWeighted: number;

  initialGrade: number;
  transmutedGrade: number;
  descriptor: DepedDescriptor;
}

export function calculateStudentTermGrade(
  quizScores: number[],
  quizMaxScores: number[],
  activityScores: number[],
  activityMaxScores: number[],
  testScore: number,
  testMaxItems: number,
  weights: GradeComponentWeights = DEFAULT_SHS_WEIGHTS
): StudentGradeCalculation {
  // Written Works
  const wwTotal = quizScores.reduce((sum, s) => sum + (Number(s) || 0), 0);
  const wwMax = quizMaxScores.reduce((sum, m) => sum + (Number(m) || 0), 0);
  const wwPercentage = wwMax > 0 ? (wwTotal / wwMax) * 100 : 0;
  const wwWeighted = wwPercentage * weights.writtenWorks;

  // Performance Tasks
  const ptTotal = activityScores.reduce((sum, s) => sum + (Number(s) || 0), 0);
  const ptMax = activityMaxScores.reduce((sum, m) => sum + (Number(m) || 0), 0);
  const ptPercentage = ptMax > 0 ? (ptTotal / ptMax) * 100 : 0;
  const ptWeighted = ptPercentage * weights.performanceTasks;

  // Quarterly Assessment / OMR Exam
  const qaScore = Number(testScore) || 0;
  const qaMax = Number(testMaxItems) > 0 ? Number(testMaxItems) : 50;
  const qaPercentage = qaMax > 0 ? (qaScore / qaMax) * 100 : 0;
  const qaWeighted = qaPercentage * weights.quarterlyAssessment;

  // Initial Composite Grade
  const rawInitial = wwWeighted + ptWeighted + qaWeighted;
  const initialGrade = Math.round(rawInitial * 100) / 100;

  // Transmuted Final Term Grade
  const transmutedGrade = transmuteInitialGrade(initialGrade);
  const descriptor = getDepedDescriptor(transmutedGrade);

  return {
    wwTotal,
    wwMax,
    wwPercentage: Math.round(wwPercentage * 10) / 10,
    wwWeighted: Math.round(wwWeighted * 100) / 100,

    ptTotal,
    ptMax,
    ptPercentage: Math.round(ptPercentage * 10) / 10,
    ptWeighted: Math.round(ptWeighted * 100) / 100,

    qaScore,
    qaMax,
    qaPercentage: Math.round(qaPercentage * 10) / 10,
    qaWeighted: Math.round(qaWeighted * 100) / 100,

    initialGrade,
    transmutedGrade,
    descriptor,
  };
}

export const GRADING_WEIGHTS_STORAGE_KEY = 'projectkit_school_grading_weights';

export function getSavedGradingWeights(): GradeComponentWeights {
  if (typeof window === 'undefined') return DEFAULT_SHS_WEIGHTS;
  try {
    const raw = localStorage.getItem(GRADING_WEIGHTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.writtenWorks === 'number' &&
        typeof parsed.performanceTasks === 'number' &&
        typeof parsed.quarterlyAssessment === 'number'
      ) {
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_SHS_WEIGHTS;
}

export function saveGradingWeights(weights: GradeComponentWeights): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GRADING_WEIGHTS_STORAGE_KEY, JSON.stringify(weights));
  } catch (e) {
    console.warn('Failed to save grading weights to localStorage:', e);
  }
}

