/**
 * Project KIT — Table of Specifications (TOS) Types
 * Compatible with DepEd E-ClassRoom reference model.
 */

export type TosStatus = 'draft' | 'final' | 'approved' | 'archived';

export interface TosSectionItem {
  id: string;
  name: string;
  track?: string;
}

export interface TosRowDomainItem {
  remembering: number;
  understanding: number;
  applying: number;
  analyzing: number;
  evaluating: number;
  creating: number;
}

export interface TosRowItem {
  id: string;
  code?: string;
  description: string;
  daysTaught: number;
  days?: number;
  percentage?: number;
  itemCount?: number;
  domains?: TosRowDomainItem;
  domainItems?: {
    remembering: number[];
    understanding: number[];
    applying: number[];
    analyzing: number[];
    evaluating: number[];
    creating: number[];
  };
}

export interface TosDocument {
  id: string;
  assessment_id?: string | null;
  tenant_id: string;
  subject: string;
  term: string;
  school_year: string;
  grade?: string | null;
  strand?: string | null;
  section?: string | null;
  target_items: number;
  target_hours?: number | null;
  total_days?: number | null;
  days_taught?: number | null;
  status: TosStatus;
  rows: TosRowItem[];
  teacher_name?: string | null;
  exam_type?: string | null;
  description?: string | null;
  sections?: TosSectionItem[] | null;
  generated_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  assessments?: { id: string; title: string } | null;
}

export interface TosSchemaHealth {
  healthy: boolean;
  missing_columns: string[];
  checked_at: string;
}

export const STANDARD_EXAM_TYPES = [
  'Long Quiz',
  'Summative Test 1',
  'Summative Test 2',
  'Summative Test 3',
  'Term Examination',
] as const;

export type StandardExamType = (typeof STANDARD_EXAM_TYPES)[number];

