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
          region: string | null;
          division: string | null;
          logo_data: string | null;
          ai_monthly_limit: number | null;
          ai_hourly_limit: number | null;
          ai_user_hourly_limit: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code?: string | null;
          is_active?: boolean;
          region?: string | null;
          division?: string | null;
          logo_data?: string | null;
          ai_monthly_limit?: number | null;
          ai_hourly_limit?: number | null;
          ai_user_hourly_limit?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string | null;
          is_active?: boolean;
          region?: string | null;
          division?: string | null;
          logo_data?: string | null;
          ai_monthly_limit?: number | null;
          ai_hourly_limit?: number | null;
          ai_user_hourly_limit?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      profiles: {
        Row: {
          id: string;
          tenant_id: string | null;
          role: UserRole;
          status: UserStatus;
          is_platform_admin: boolean;
          display_name: string | null;
          email: string | null;
          avatar_url: string | null;
          is_archived: boolean;
          archived_at: string | null;
          archived_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          tenant_id?: string | null;
          role?: UserRole;
          status?: UserStatus;
          is_platform_admin?: boolean;
          display_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          is_archived?: boolean;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          role?: UserRole;
          status?: UserStatus;
          is_platform_admin?: boolean;
          display_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          is_archived?: boolean;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };

      academic_configs: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          school_year: string;
          term: string;
          is_active: boolean;
          cog_dist_lower: number | null;
          cog_dist_mid: number | null;
          cog_dist_higher: number | null;
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
          cog_dist_lower?: number | null;
          cog_dist_mid?: number | null;
          cog_dist_higher?: number | null;
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
          cog_dist_lower?: number | null;
          cog_dist_mid?: number | null;
          cog_dist_higher?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'academic_configs_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };

      admin_delete_codes: {
        Row: {
          id: string;
          user_id: string;
          hashed_code: string;
          attempts: number;
          locked_until: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          hashed_code: string;
          attempts?: number;
          locked_until?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          hashed_code?: string;
          attempts?: number;
          locked_until?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      faculty: {
        Row: {
          id: string;
          config_id: string;
          teacher_name: string;
          designation: string | null;
          department: string | null;
          approver_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          config_id: string;
          teacher_name: string;
          designation?: string | null;
          department?: string | null;
          approver_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          config_id?: string;
          teacher_name?: string;
          designation?: string | null;
          department?: string | null;
          approver_name?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'faculty_config_id_fkey';
            columns: ['config_id'];
            referencedRelation: 'academic_configs';
            referencedColumns: ['id'];
          },
        ];
      };

      grading_periods: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          code: string;
          position: number;
          is_current: boolean;
          is_archived: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          code: string;
          position: number;
          is_current?: boolean;
          is_archived?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          code?: string;
          position?: number;
          is_current?: boolean;
          is_archived?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'grading_periods_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };

      strands: {
        Row: {
          id: string;
          config_id: string;
          code: string;
          track: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          config_id: string;
          code: string;
          track: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          config_id?: string;
          code?: string;
          track?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'strands_config_id_fkey';
            columns: ['config_id'];
            referencedRelation: 'academic_configs';
            referencedColumns: ['id'];
          },
        ];
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
          is_archived: boolean;
          archived_at: string | null;
          archived_by: string | null;
          track: string | null;
          grade_level: string | null;
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
          is_archived?: boolean;
          archived_at?: string | null;
          archived_by?: string | null;
          track?: string | null;
          grade_level?: string | null;
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
          is_archived?: boolean;
          archived_at?: string | null;
          archived_by?: string | null;
          track?: string | null;
          grade_level?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sections_config_id_fkey';
            columns: ['config_id'];
            referencedRelation: 'academic_configs';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'subjects_config_id_fkey';
            columns: ['config_id'];
            referencedRelation: 'academic_configs';
            referencedColumns: ['id'];
          },
        ];
      };

      students: {
        Row: {
          id: string;
          tenant_id: string;
          config_id: string;
          lrn: string;
          name: string;
          section_name: string;
          section_id?: string | null;
          is_archived: boolean;
          archived_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          config_id: string;
          lrn: string;
          name: string;
          section_name: string;
          section_id?: string | null;
          is_archived?: boolean;
          archived_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          config_id?: string;
          lrn?: string;
          name?: string;
          section_name?: string;
          section_id?: string | null;
          is_archived?: boolean;
          archived_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'students_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'students_config_id_fkey';
            columns: ['config_id'];
            referencedRelation: 'academic_configs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'students_section_id_fkey';
            columns: ['section_id'];
            referencedRelation: 'sections';
            referencedColumns: ['id'];
          },
        ];
      };

      assessments: {
        Row: {
          id: string;
          tenant_id: string;
          config_id: string;
          tos_id: string | null;
          title: string;
          subject_id: string;
          section_id: string;
          term: string;
          school_year: string;
          status: AssessmentStatus;
          target_items: number;
          passing_mps: number;
          version: number;
          class_size: number | null;
          choices: number | null;
          teacher_name: string | null;
          questions: Json | null;
          exam_status: string | null;
          general_directions: string | null;
          exam_date: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          config_id: string;
          tos_id?: string | null;
          title: string;
          subject_id: string;
          section_id: string;
          term: string;
          school_year: string;
          status?: AssessmentStatus;
          target_items?: number;
          passing_mps?: number;
          version?: number;
          class_size?: number | null;
          choices?: number | null;
          teacher_name?: string | null;
          questions?: Json | null;
          exam_status?: string | null;
          general_directions?: string | null;
          exam_date?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          config_id?: string;
          tos_id?: string | null;
          title?: string;
          subject_id?: string;
          section_id?: string;
          term?: string;
          school_year?: string;
          status?: AssessmentStatus;
          target_items?: number;
          passing_mps?: number;
          version?: number;
          class_size?: number | null;
          choices?: number | null;
          teacher_name?: string | null;
          questions?: Json | null;
          exam_status?: string | null;
          general_directions?: string | null;
          exam_date?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assessments_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessments_config_id_fkey';
            columns: ['config_id'];
            referencedRelation: 'academic_configs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessments_subject_id_fkey';
            columns: ['subject_id'];
            referencedRelation: 'subjects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessments_section_id_fkey';
            columns: ['section_id'];
            referencedRelation: 'sections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessments_tos_id_fkey';
            columns: ['tos_id'];
            referencedRelation: 'tos_documents';
            referencedColumns: ['id'];
          },
        ];
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
          days_taught: number | null;
          total_days: number | null;
          teacher_name: string | null;
          questions: Json | null;
          exam_status: string | null;
          general_directions: string | null;
          exam_type: string | null;
          description: string | null;
          sections: Json | null;
          generated_at: string | null;
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
          days_taught?: number | null;
          total_days?: number | null;
          teacher_name?: string | null;
          questions?: Json | null;
          exam_status?: string | null;
          general_directions?: string | null;
          exam_type?: string | null;
          description?: string | null;
          sections?: Json | null;
          generated_at?: string | null;
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
          days_taught?: number | null;
          total_days?: number | null;
          teacher_name?: string | null;
          questions?: Json | null;
          exam_status?: string | null;
          general_directions?: string | null;
          exam_type?: string | null;
          description?: string | null;
          sections?: Json | null;
          generated_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tos_documents_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tos_documents_assessment_id_fkey';
            columns: ['assessment_id'];
            referencedRelation: 'assessments';
            referencedColumns: ['id'];
          },
        ];
      };

      answer_keys: {
        Row: {
          id: string;
          assessment_id: string;
          tenant_id: string;
          title: string | null;
          answers: Json;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assessment_id: string;
          tenant_id: string;
          title?: string | null;
          answers?: Json;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          assessment_id?: string;
          tenant_id?: string;
          title?: string | null;
          answers?: Json;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'answer_keys_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'answer_keys_assessment_id_fkey';
            columns: ['assessment_id'];
            referencedRelation: 'assessments';
            referencedColumns: ['id'];
          },
        ];
      };

      attendances: {
        Row: {
          id: string;
          assessment_id: string;
          student_id: string;
          status: AttendanceStatus;
          marked_at: string;
        };
        Insert: {
          id?: string;
          assessment_id: string;
          student_id: string;
          status?: AttendanceStatus;
          marked_at?: string;
        };
        Update: {
          id?: string;
          assessment_id?: string;
          student_id?: string;
          status?: AttendanceStatus;
          marked_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'attendances_assessment_id_fkey';
            columns: ['assessment_id'];
            referencedRelation: 'assessments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendances_student_id_fkey';
            columns: ['student_id'];
            referencedRelation: 'students';
            referencedColumns: ['id'];
          },
        ];
      };

      responses: {
        Row: {
          id: string;
          tenant_id: string;
          assessment_id: string;
          student_id: string | null;
          student_lrn: string | null;
          section_name: string | null;
          score: number | null;
          total_items: number | null;
          percentage: number | null;
          status: string;
          raw_response: Json | null;
          audit_trail: Json | null;
          scanned_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          assessment_id: string;
          student_id?: string | null;
          student_lrn?: string | null;
          section_name?: string | null;
          score?: number | null;
          total_items?: number | null;
          percentage?: number | null;
          status?: string;
          raw_response?: Json | null;
          audit_trail?: Json | null;
          scanned_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          assessment_id?: string;
          student_id?: string | null;
          student_lrn?: string | null;
          section_name?: string | null;
          score?: number | null;
          total_items?: number | null;
          percentage?: number | null;
          status?: string;
          raw_response?: Json | null;
          audit_trail?: Json | null;
          scanned_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'responses_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'responses_assessment_id_fkey';
            columns: ['assessment_id'];
            referencedRelation: 'assessments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'responses_student_id_fkey';
            columns: ['student_id'];
            referencedRelation: 'students';
            referencedColumns: ['id'];
          },
        ];
      };

      response_items: {
        Row: {
          id: string;
          response_id: string;
          item_number: number;
          selected_option: string | null;
          is_correct: boolean | null;
          confidence: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          response_id: string;
          item_number: number;
          selected_option?: string | null;
          is_correct?: boolean | null;
          confidence?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          response_id?: string;
          item_number?: number;
          selected_option?: string | null;
          is_correct?: boolean | null;
          confidence?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'response_items_response_id_fkey';
            columns: ['response_id'];
            referencedRelation: 'responses';
            referencedColumns: ['id'];
          },
        ];
      };

      scan_jobs: {
        Row: {
          id: string;
          tenant_id: string;
          assessment_id: string;
          status: string;
          total_sheets: number;
          processed_sheets: number;
          failed_sheets: number;
          error_log: Json | null;
          created_by: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          assessment_id: string;
          status?: string;
          total_sheets?: number;
          processed_sheets?: number;
          failed_sheets?: number;
          error_log?: Json | null;
          created_by?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          assessment_id?: string;
          status?: string;
          total_sheets?: number;
          processed_sheets?: number;
          failed_sheets?: number;
          error_log?: Json | null;
          created_by?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'scan_jobs_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'scan_jobs_assessment_id_fkey';
            columns: ['assessment_id'];
            referencedRelation: 'assessments';
            referencedColumns: ['id'];
          },
        ];
      };

      scan_results: {
        Row: {
          id: string;
          scan_job_id: string | null;
          assessment_id: string;
          student_id: string | null;
          image_storage_path: string | null;
          image_hash: string;
          confidence: number | null;
          raw_answers: Json;
          normalized_answers: Json;
          status: string;
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
          confidence?: number | null;
          raw_answers?: Json;
          normalized_answers?: Json;
          status?: string;
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
          confidence?: number | null;
          raw_answers?: Json;
          normalized_answers?: Json;
          status?: string;
          detected_roll_number?: number | null;
          failed_region?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'scan_results_scan_job_id_fkey';
            columns: ['scan_job_id'];
            referencedRelation: 'scan_jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'scan_results_assessment_id_fkey';
            columns: ['assessment_id'];
            referencedRelation: 'assessments';
            referencedColumns: ['id'];
          },
        ];
      };

      course_materials: {
        Row: {
          id: string;
          tenant_id: string;
          uploaded_by: string | null;
          filename: string;
          storage_path: string;
          file_size: number | null;
          mime_type: string | null;
          extracted_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          uploaded_by?: string | null;
          filename: string;
          storage_path: string;
          file_size?: number | null;
          mime_type?: string | null;
          extracted_text?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          uploaded_by?: string | null;
          filename?: string;
          storage_path?: string;
          file_size?: number | null;
          mime_type?: string | null;
          extracted_text?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'course_materials_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'course_materials_uploaded_by_fkey';
            columns: ['uploaded_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      audit_logs: {
        Row: {
          id: string;
          tenant_id: string | null;
          user_id: string | null;
          action: string;
          details: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          user_id?: string | null;
          action: string;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          user_id?: string | null;
          action?: string;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      create_exam_from_tos: {
        Args: {
          p_tos_id: string;
          p_exam_date: string | null;
          p_questions: Json;
        };
        Returns: string[];
      };
      get_current_tenant_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      is_current_user_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_platform_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      check_tos_schema_health: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      set_current_grading_period: {
        Args: {
          p_period_id: string;
        };
        Returns: Json;
      };
      add_grading_period: {
        Args: {
          p_name: string;
          p_code: string;
          p_position: number;
        };
        Returns: Json;
      };
      get_grading_period_usage: {
        Args: {
          p_period_id: string;
        };
        Returns: Json;
      };
      delete_or_archive_grading_period: {
        Args: {
          p_period_id: string;
          p_action: string;
          p_destination_id?: string | null;
        };
        Returns: Json;
      };
      restore_grading_period: {
        Args: {
          p_period_id: string;
        };
        Returns: Json;
      };
      apply_grading_period_preset: {
        Args: {
          p_preset: string;
        };
        Returns: Json;
      };
    };

    Enums: {
      user_role: UserRole;
      user_status: UserStatus;
      assessment_status: AssessmentStatus;
      attendance_status: AttendanceStatus;
      response_status: ResponseStatus;
    };

    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
