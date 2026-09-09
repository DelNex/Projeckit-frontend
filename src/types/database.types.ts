export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'admin' | 'teacher';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type AssessmentStatus = 'DRAFT' | 'READY' | 'ADMINISTERED' | 'EVALUATED' | 'ARCHIVED';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'EXCUSED';
export type ResponseStatus = 'PENDING' | 'GRADED' | 'EVALUATED';

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          code: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          tenant_id: string | null;
          role: UserRole;
          status: UserStatus;
          display_name: string | null;
          email: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          tenant_id?: string | null;
          role?: UserRole;
          status?: UserStatus;
          display_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          role?: UserRole;
          status?: UserStatus;
          display_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      academic_configs: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          school_year: string;
          term: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name?: string;
          school_year: string;
          term: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          school_year?: string;
          term?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      sections: {
        Row: {
          id: string;
          config_id: string;
          name: string;
          grade: string;
          strand_code: string;
          is_advisory: boolean;
          student_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          config_id: string;
          name: string;
          grade: string;
          strand_code: string;
          is_advisory?: boolean;
          student_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          config_id?: string;
          name?: string;
          grade?: string;
          strand_code?: string;
          is_advisory?: boolean;
          student_count?: number;
          created_at?: string;
        };
      };
      subjects: {
        Row: {
          id: string;
          config_id: string;
          code: string;
          title: string;
          target_hours: number;
          target_items: number;
          grade: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          config_id: string;
          code: string;
          title: string;
          target_hours?: number;
          target_items?: number;
          grade: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          config_id?: string;
          code?: string;
          title?: string;
          target_hours?: number;
          target_items?: number;
          grade?: string;
          created_at?: string;
        };
      };
      students: {
        Row: {
          id: string;
          tenant_id: string;
          config_id: string;
          lrn: string;
          name: string;
          section_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          config_id: string;
          lrn: string;
          name: string;
          section_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          config_id?: string;
          lrn?: string;
          name?: string;
          section_name?: string;
          created_at?: string;
        };
      };
      assessments: {
        Row: {
          id: string;
          tenant_id: string;
          config_id: string;
          title: string;
          subject_id: string;
          section_id: string;
          term: string;
          school_year: string;
          status: AssessmentStatus;
          target_items: number;
          class_size: number;
          choices: Json;
          passing_mps: number;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          config_id: string;
          title: string;
          subject_id: string;
          section_id: string;
          term: string;
          school_year: string;
          status?: AssessmentStatus;
          target_items?: number;
          class_size?: number;
          choices?: Json;
          passing_mps?: number;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          config_id?: string;
          title?: string;
          subject_id?: string;
          section_id?: string;
          term?: string;
          school_year?: string;
          status?: AssessmentStatus;
          target_items?: number;
          class_size?: number;
          choices?: Json;
          passing_mps?: number;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      tos_documents: {
        Row: {
          id: string;
          assessment_id: string | null;
          tenant_id: string;
          subject: string;
          term: string;
          school_year: string;
          grade: string | null;
          strand: string | null;
          section: string | null;
          target_hours: number;
          target_items: number;
          status: string;
          rows: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assessment_id?: string | null;
          tenant_id: string;
          subject: string;
          term: string;
          school_year: string;
          grade?: string | null;
          strand?: string | null;
          section?: string | null;
          target_hours?: number;
          target_items?: number;
          status?: string;
          rows?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          assessment_id?: string | null;
          tenant_id?: string;
          subject?: string;
          term?: string;
          school_year?: string;
          grade?: string | null;
          strand?: string | null;
          section?: string | null;
          target_hours?: number;
          target_items?: number;
          status?: string;
          rows?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      answer_keys: {
        Row: {
          id: string;
          assessment_id: string | null;
          tenant_id: string;
          title: string | null;
          answers: Record<string, string>;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assessment_id?: string | null;
          tenant_id: string;
          title?: string | null;
          answers?: Record<string, string>;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          assessment_id?: string | null;
          tenant_id?: string;
          title?: string | null;
          answers?: Record<string, string>;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      attendances: {
        Row: {
          id: string;
          assessment_id: string;
          student_id: string;
          student_lrn: string | null;
          status: AttendanceStatus;
          notes: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assessment_id: string;
          student_id: string;
          student_lrn?: string | null;
          status?: AttendanceStatus;
          notes?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          assessment_id?: string;
          student_id?: string;
          student_lrn?: string | null;
          status?: AttendanceStatus;
          notes?: string | null;
          updated_at?: string;
        };
      };
      responses: {
        Row: {
          id: string;
          assessment_id: string;
          tenant_id: string;
          student_id: string | null;
          student_lrn: string | null;
          section_name: string | null;
          score: number | null;
          total_items: number | null;
          percentage: number | null;
          status: ResponseStatus;
          raw_response: Json | null;
          audit_trail: Json | null;
          scanned_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assessment_id: string;
          tenant_id: string;
          student_id?: string | null;
          student_lrn?: string | null;
          section_name?: string | null;
          score?: number | null;
          total_items?: number | null;
          percentage?: number | null;
          status?: ResponseStatus;
          raw_response?: Json | null;
          audit_trail?: Json | null;
          scanned_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          assessment_id?: string;
          tenant_id?: string;
          student_id?: string | null;
          student_lrn?: string | null;
          section_name?: string | null;
          score?: number | null;
          total_items?: number | null;
          percentage?: number | null;
          status?: ResponseStatus;
          raw_response?: Json | null;
          audit_trail?: Json | null;
          scanned_at?: string;
          updated_at?: string;
        };
      };
      response_items: {
        Row: {
          id: string;
          response_id: string;
          item_number: number;
          given_answer: string | null;
          is_correct: boolean;
        };
        Insert: {
          id?: string;
          response_id: string;
          item_number: number;
          given_answer?: string | null;
          is_correct?: boolean;
        };
        Update: {
          id?: string;
          response_id?: string;
          item_number?: number;
          given_answer?: string | null;
          is_correct?: boolean;
        };
      };
      scan_jobs: {
        Row: {
          id: string;
          tenant_id: string;
          assessment_id: string;
          idempotency_key: string;
          status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
          error_message: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          assessment_id: string;
          idempotency_key: string;
          status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
          error_message?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          assessment_id?: string;
          idempotency_key?: string;
          status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
          error_message?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
      };
      scan_results: {
        Row: {
          id: string;
          scan_job_id: string | null;
          assessment_id: string;
          student_id: string | null;
          image_storage_path: string | null;
          image_hash: string;
          confidence: number;
          raw_answers: Json;
          normalized_answers: Json;
          status: 'PROCESSED' | 'VERIFICATION_REQUIRED' | 'REJECTED';
          detected_roll_number: number | null;
          failed_region: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          scan_job_id?: string | null;
          assessment_id: string;
          student_id?: string | null;
          image_storage_path?: string | null;
          image_hash: string;
          confidence?: number;
          raw_answers?: Json;
          normalized_answers?: Json;
          status?: 'PROCESSED' | 'VERIFICATION_REQUIRED' | 'REJECTED';
          detected_roll_number?: number | null;
          failed_region?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          scan_job_id?: string | null;
          assessment_id?: string;
          student_id?: string | null;
          image_storage_path?: string | null;
          image_hash?: string;
          confidence?: number;
          raw_answers?: Json;
          normalized_answers?: Json;
          status?: 'PROCESSED' | 'VERIFICATION_REQUIRED' | 'REJECTED';
          detected_roll_number?: number | null;
          failed_region?: string | null;
          created_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          tenant_id: string | null;
          user_id: string | null;
          action: string;
          ip: string | null;
          device: string | null;
          details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          user_id?: string | null;
          action: string;
          ip?: string | null;
          device?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          user_id?: string | null;
          action?: string;
          ip?: string | null;
          device?: string | null;
          details?: Json | null;
          created_at?: string;
        };
      };
    };
  };
}

