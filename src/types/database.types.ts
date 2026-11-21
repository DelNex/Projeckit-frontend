export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      academic_configs: {
        Row: {
          ai_daily_school_limit: number | null
          ai_hourly_user_limit: number | null
          allowed_registration_domains: string | null
          cog_dist_higher: number | null
          cog_dist_lower: number | null
          cog_dist_mid: number | null
          created_at: string | null
          division: string | null
          id: string
          is_active: boolean | null
          logo_data: string | null
          name: string | null
          region: string | null
          school_year: string
          tenant_id: string
          term: string
          updated_at: string | null
        }
        Insert: {
          ai_daily_school_limit?: number | null
          ai_hourly_user_limit?: number | null
          allowed_registration_domains?: string | null
          cog_dist_higher?: number | null
          cog_dist_lower?: number | null
          cog_dist_mid?: number | null
          created_at?: string | null
          division?: string | null
          id?: string
          is_active?: boolean | null
          logo_data?: string | null
          name?: string | null
          region?: string | null
          school_year: string
          tenant_id: string
          term: string
          updated_at?: string | null
        }
        Update: {
          ai_daily_school_limit?: number | null
          ai_hourly_user_limit?: number | null
          allowed_registration_domains?: string | null
          cog_dist_higher?: number | null
          cog_dist_lower?: number | null
          cog_dist_mid?: number | null
          created_at?: string | null
          division?: string | null
          id?: string
          is_active?: boolean | null
          logo_data?: string | null
          name?: string | null
          region?: string | null
          school_year?: string
          tenant_id?: string
          term?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_delete_codes: {
        Row: {
          code_hash: string
          failed_attempts: number
          locked_until: string | null
          set_by: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code_hash: string
          failed_attempts?: number
          locked_until?: string | null
          set_by?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code_hash?: string
          failed_attempts?: number
          locked_until?: string | null
          set_by?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_delete_codes_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_delete_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      answer_keys: {
        Row: {
          answers: Json
          assessment_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          tenant_id: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          answers?: Json
          assessment_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          tenant_id: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          answers?: Json
          assessment_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answer_keys_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answer_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          choices: Json | null
          class_size: number | null
          config_id: string
          created_at: string | null
          created_by: string | null
          exam_date: string | null
          exam_status: string | null
          general_directions: string | null
          id: string
          passing_mps: number | null
          questions: Json | null
          school_year: string
          section_id: string
          status: string | null
          subject_id: string
          target_items: number | null
          teacher_name: string | null
          tenant_id: string
          term: string
          title: string
          tos_id: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          choices?: Json | null
          class_size?: number | null
          config_id: string
          created_at?: string | null
          created_by?: string | null
          exam_date?: string | null
          exam_status?: string | null
          general_directions?: string | null
          id?: string
          passing_mps?: number | null
          questions?: Json | null
          school_year: string
          section_id: string
          status?: string | null
          subject_id: string
          target_items?: number | null
          teacher_name?: string | null
          tenant_id: string
          term: string
          title: string
          tos_id?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          choices?: Json | null
          class_size?: number | null
          config_id?: string
          created_at?: string | null
          created_by?: string | null
          exam_date?: string | null
          exam_status?: string | null
          general_directions?: string | null
          id?: string
          passing_mps?: number | null
          questions?: Json | null
          school_year?: string
          section_id?: string
          status?: string | null
          subject_id?: string
          target_items?: number | null
          teacher_name?: string | null
          tenant_id?: string
          term?: string
          title?: string
          tos_id?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "academic_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_tos_id_fkey"
            columns: ["tos_id"]
            isOneToOne: false
            referencedRelation: "tos_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      attendances: {
        Row: {
          assessment_id: string
          id: string
          notes: string | null
          status: string | null
          student_id: string
          student_lrn: string | null
          updated_at: string | null
        }
        Insert: {
          assessment_id: string
          id?: string
          notes?: string | null
          status?: string | null
          student_id: string
          student_lrn?: string | null
          updated_at?: string | null
        }
        Update: {
          assessment_id?: string
          id?: string
          notes?: string | null
          status?: string | null
          student_id?: string
          student_lrn?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendances_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          device: string | null
          id: string
          ip: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          device?: string | null
          id?: string
          ip?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          device?: string | null
          id?: string
          ip?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_materials: {
        Row: {
          created_at: string | null
          extracted_text: string | null
          file_size: number | null
          filename: string
          id: string
          mime_type: string | null
          storage_path: string
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          extracted_text?: string | null
          file_size?: number | null
          filename: string
          id?: string
          mime_type?: string | null
          storage_path: string
          tenant_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          extracted_text?: string | null
          file_size?: number | null
          filename?: string
          id?: string
          mime_type?: string | null
          storage_path?: string
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_materials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_materials_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_generation_jobs: {
        Row: {
          attempts: number
          claimed_by: string | null
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          id: string
          job_kind: string
          lease_expires_at: string | null
          max_attempts: number
          parent_job_id: string | null
          payload: Json
          progress: Json
          provider: string
          repair_round: number
          result_summary: Json | null
          status: string
          tenant_id: string
          tos_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_kind?: string
          lease_expires_at?: string | null
          max_attempts?: number
          parent_job_id?: string | null
          payload: Json
          progress?: Json
          provider?: string
          repair_round?: number
          result_summary?: Json | null
          status?: string
          tenant_id: string
          tos_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_kind?: string
          lease_expires_at?: string | null
          max_attempts?: number
          parent_job_id?: string | null
          payload?: Json
          progress?: Json
          provider?: string
          repair_round?: number
          result_summary?: Json | null
          status?: string
          tenant_id?: string
          tos_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_generation_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_generation_jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "exam_generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_generation_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_generation_jobs_tos_id_fkey"
            columns: ["tos_id"]
            isOneToOne: false
            referencedRelation: "tos_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      faculty: {
        Row: {
          approver_name: string | null
          config_id: string
          created_at: string | null
          department: string | null
          designation: string | null
          id: string
          teacher_name: string
        }
        Insert: {
          approver_name?: string | null
          config_id: string
          created_at?: string | null
          department?: string | null
          designation?: string | null
          id?: string
          teacher_name: string
        }
        Update: {
          approver_name?: string | null
          config_id?: string
          created_at?: string | null
          department?: string | null
          designation?: string | null
          id?: string
          teacher_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "faculty_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "academic_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_periods: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_archived: boolean
          is_current: boolean
          name: string
          position: number
          tenant_id: string
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_archived?: boolean
          is_current?: boolean
          name: string
          position: number
          tenant_id: string
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_archived?: boolean
          is_current?: boolean
          name?: string
          position?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_status: {
        Row: {
          current_job_id: string | null
          helper_id: string
          last_seen_at: string
          note: string | null
          state: string
          version: string | null
        }
        Insert: {
          current_job_id?: string | null
          helper_id: string
          last_seen_at?: string
          note?: string | null
          state: string
          version?: string | null
        }
        Update: {
          current_job_id?: string | null
          helper_id?: string
          last_seen_at?: string
          note?: string | null
          state?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helper_status_current_job_id_fkey"
            columns: ["current_job_id"]
            isOneToOne: false
            referencedRelation: "exam_generation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          id: number
          max_module_upload_cap_mb: number
          max_scan_image_cap_mb: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          max_module_upload_cap_mb?: number
          max_scan_image_cap_mb?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          max_module_upload_cap_mb?: number
          max_scan_image_cap_mb?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          is_platform_admin: boolean
          previous_status: string | null
          role: string
          status: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          is_platform_admin?: boolean
          previous_status?: string | null
          role?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_platform_admin?: boolean
          previous_status?: string | null
          role?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      response_items: {
        Row: {
          given_answer: string | null
          id: string
          is_correct: boolean | null
          item_number: number
          response_id: string
        }
        Insert: {
          given_answer?: string | null
          id?: string
          is_correct?: boolean | null
          item_number: number
          response_id: string
        }
        Update: {
          given_answer?: string | null
          id?: string
          is_correct?: boolean | null
          item_number?: number
          response_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "response_items_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "responses"
            referencedColumns: ["id"]
          },
        ]
      }
      responses: {
        Row: {
          assessment_id: string
          audit_trail: Json | null
          id: string
          percentage: number | null
          raw_response: Json | null
          scanned_at: string | null
          score: number | null
          section_name: string | null
          status: string | null
          student_id: string | null
          student_lrn: string | null
          tenant_id: string
          total_items: number | null
          updated_at: string | null
        }
        Insert: {
          assessment_id: string
          audit_trail?: Json | null
          id?: string
          percentage?: number | null
          raw_response?: Json | null
          scanned_at?: string | null
          score?: number | null
          section_name?: string | null
          status?: string | null
          student_id?: string | null
          student_lrn?: string | null
          tenant_id: string
          total_items?: number | null
          updated_at?: string | null
        }
        Update: {
          assessment_id?: string
          audit_trail?: Json | null
          id?: string
          percentage?: number | null
          raw_response?: Json | null
          scanned_at?: string | null
          score?: number | null
          section_name?: string | null
          status?: string | null
          student_id?: string | null
          student_lrn?: string | null
          tenant_id?: string
          total_items?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "responses_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_jobs: {
        Row: {
          assessment_id: string
          created_at: string | null
          created_by: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          status: string | null
          tenant_id: string
        }
        Insert: {
          assessment_id: string
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          status?: string | null
          tenant_id: string
        }
        Update: {
          assessment_id?: string
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_jobs_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_results: {
        Row: {
          assessment_id: string
          confidence: number | null
          created_at: string | null
          detected_roll_number: number | null
          failed_region: string | null
          id: string
          image_hash: string
          image_storage_path: string | null
          normalized_answers: Json
          raw_answers: Json
          scan_job_id: string | null
          status: string | null
          student_id: string | null
        }
        Insert: {
          assessment_id: string
          confidence?: number | null
          created_at?: string | null
          detected_roll_number?: number | null
          failed_region?: string | null
          id?: string
          image_hash: string
          image_storage_path?: string | null
          normalized_answers?: Json
          raw_answers?: Json
          scan_job_id?: string | null
          status?: string | null
          student_id?: string | null
        }
        Update: {
          assessment_id?: string
          confidence?: number | null
          created_at?: string | null
          detected_roll_number?: number | null
          failed_region?: string | null
          id?: string
          image_hash?: string
          image_storage_path?: string | null
          normalized_answers?: Json
          raw_answers?: Json
          scan_job_id?: string | null
          status?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_results_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_results_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "scan_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      school_settings: {
        Row: {
          allow_public_registration: boolean
          default_passing_mps: number
          max_module_upload_mb: number
          max_scan_image_mb: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_public_registration?: boolean
          default_passing_mps?: number
          max_module_upload_mb?: number
          max_scan_image_mb?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_public_registration?: boolean
          default_passing_mps?: number
          max_module_upload_mb?: number
          max_scan_image_mb?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          config_id: string
          created_at: string | null
          grade: string
          grade_level: string | null
          id: string
          is_advisory: boolean | null
          is_archived: boolean
          name: string
          strand_code: string
          student_count: number | null
          track: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          config_id: string
          created_at?: string | null
          grade: string
          grade_level?: string | null
          id?: string
          is_advisory?: boolean | null
          is_archived?: boolean
          name: string
          strand_code: string
          student_count?: number | null
          track?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          config_id?: string
          created_at?: string | null
          grade?: string
          grade_level?: string | null
          id?: string
          is_advisory?: boolean | null
          is_archived?: boolean
          name?: string
          strand_code?: string
          student_count?: number | null
          track?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sections_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "academic_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      strands: {
        Row: {
          code: string
          config_id: string
          created_at: string | null
          description: string | null
          id: string
          track: string
        }
        Insert: {
          code: string
          config_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          track: string
        }
        Update: {
          code?: string
          config_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          track?: string
        }
        Relationships: [
          {
            foreignKeyName: "strands_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "academic_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          config_id: string
          created_at: string | null
          id: string
          is_archived: boolean
          lrn: string
          name: string
          section_id: string | null
          section_name: string
          tenant_id: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          config_id: string
          created_at?: string | null
          id?: string
          is_archived?: boolean
          lrn: string
          name: string
          section_id?: string | null
          section_name: string
          tenant_id: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          config_id?: string
          created_at?: string | null
          id?: string
          is_archived?: boolean
          lrn?: string
          name?: string
          section_id?: string | null
          section_name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "academic_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string
          config_id: string
          created_at: string | null
          grade: string
          id: string
          target_hours: number | null
          target_items: number | null
          title: string
        }
        Insert: {
          code: string
          config_id: string
          created_at?: string | null
          grade: string
          id?: string
          target_hours?: number | null
          target_items?: number | null
          title: string
        }
        Update: {
          code?: string
          config_id?: string
          created_at?: string | null
          grade?: string
          id?: string
          target_hours?: number | null
          target_items?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "academic_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_competencies: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          tenant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          tenant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_competencies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          ai_daily_school_limit: number | null
          ai_hourly_user_limit: number | null
          allowed_registration_domains: string | null
          code: string | null
          created_at: string | null
          division: string | null
          id: string
          is_active: boolean | null
          logo_data: string | null
          name: string
          region: string | null
          updated_at: string | null
        }
        Insert: {
          ai_daily_school_limit?: number | null
          ai_hourly_user_limit?: number | null
          allowed_registration_domains?: string | null
          code?: string | null
          created_at?: string | null
          division?: string | null
          id?: string
          is_active?: boolean | null
          logo_data?: string | null
          name: string
          region?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_daily_school_limit?: number | null
          ai_hourly_user_limit?: number | null
          allowed_registration_domains?: string | null
          code?: string | null
          created_at?: string | null
          division?: string | null
          id?: string
          is_active?: boolean | null
          logo_data?: string | null
          name?: string
          region?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tos_documents: {
        Row: {
          assessment_id: string | null
          created_at: string | null
          created_by: string | null
          days_taught: number | null
          description: string | null
          exam_type: string | null
          generated_at: string | null
          grade: string | null
          id: string
          questions: Json | null
          rows: Json
          school_year: string
          section: string | null
          sections: Json | null
          status: string | null
          strand: string | null
          subject: string
          target_hours: number | null
          target_items: number | null
          teacher_name: string | null
          tenant_id: string
          term: string
          total_days: number | null
          updated_at: string | null
        }
        Insert: {
          assessment_id?: string | null
          created_at?: string | null
          created_by?: string | null
          days_taught?: number | null
          description?: string | null
          exam_type?: string | null
          generated_at?: string | null
          grade?: string | null
          id?: string
          questions?: Json | null
          rows?: Json
          school_year: string
          section?: string | null
          sections?: Json | null
          status?: string | null
          strand?: string | null
          subject: string
          target_hours?: number | null
          target_items?: number | null
          teacher_name?: string | null
          tenant_id: string
          term: string
          total_days?: number | null
          updated_at?: string | null
        }
        Update: {
          assessment_id?: string | null
          created_at?: string | null
          created_by?: string | null
          days_taught?: number | null
          description?: string | null
          exam_type?: string | null
          generated_at?: string | null
          grade?: string | null
          id?: string
          questions?: Json | null
          rows?: Json
          school_year?: string
          section?: string | null
          sections?: Json | null
          status?: string | null
          strand?: string | null
          subject?: string
          target_hours?: number | null
          target_items?: number | null
          teacher_name?: string | null
          tenant_id?: string
          term?: string
          total_days?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tos_documents_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tos_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tos_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_grading_period: {
        Args: { p_code?: string; p_name: string; p_type?: string }
        Returns: Json
      }
      apply_grading_period_preset: { Args: { p_preset: string }; Returns: Json }
      check_tos_schema_health: { Args: never; Returns: Json }
      claim_exam_job: {
        Args: { p_helper_id: string; p_lease_seconds: number }
        Returns: {
          attempts: number
          claimed_by: string | null
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          id: string
          job_kind: string
          lease_expires_at: string | null
          max_attempts: number
          parent_job_id: string | null
          payload: Json
          progress: Json
          provider: string
          repair_round: number
          result_summary: Json | null
          status: string
          tenant_id: string
          tos_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "exam_generation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_groq_exam_job: {
        Args: {
          p_job_id: string
          p_lease_seconds?: number
          p_worker_id: string
        }
        Returns: {
          attempts: number
          claimed_by: string | null
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          id: string
          job_kind: string
          lease_expires_at: string | null
          max_attempts: number
          parent_job_id: string | null
          payload: Json
          progress: Json
          provider: string
          repair_round: number
          result_summary: Json | null
          status: string
          tenant_id: string
          tos_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "exam_generation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_exam_job_payloads: { Args: never; Returns: number }
      create_exam_from_tos: {
        Args: { p_exam_date: string; p_questions: Json; p_tos_id: string }
        Returns: string[]
      }
      delete_or_archive_grading_period: {
        Args: {
          p_action: string
          p_period_id: string
          p_target_period_id?: string
        }
        Returns: Json
      }
      enqueue_exam_generation_job: {
        Args: {
          p_created_by: string
          p_job_kind: string
          p_payload: Json
          p_tenant_id: string
          p_tos_id: string
        }
        Returns: {
          created: boolean
          created_at: string
          job_id: string
          status: string
        }[]
      }
      enqueue_groq_exam_generation_job: {
        Args: {
          p_created_by: string
          p_job_kind: string
          p_payload: Json
          p_tenant_id: string
          p_tos_id: string
        }
        Returns: {
          created: boolean
          created_at: string
          job_id: string
          status: string
        }[]
      }
      execute_permanent_account_deletion: {
        Args: {
          p_caller_id?: string
          p_choice: string
          p_reassign_to_id?: string
          p_user_ids: string[]
        }
        Returns: Json
      }
      expire_unserviceable_exam_jobs: { Args: never; Returns: number }
      get_current_tenant_id: { Args: never; Returns: string }
      get_grading_period_usage: { Args: { p_period_id: string }; Returns: Json }
      is_current_user_admin: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      log_period_audit: {
        Args: { p_action: string; p_details: Json; p_tenant_id: string }
        Returns: undefined
      }
      provision_tenant: {
        Args: { p_code?: string; p_name: string; p_school_year?: string }
        Returns: Json
      }
      restore_grading_period: { Args: { p_period_id: string }; Returns: Json }
      save_exam_draft: {
        Args: {
          p_expected_updated_at?: string
          p_overwrite?: boolean
          p_questions: Json
          p_tenant_id: string
          p_tos_id: string
        }
        Returns: {
          assessment_ids: string[]
          saved_updated_at: string
        }[]
      }
      finalize_exam_generation_job: {
        Args: {
          p_error_message?: string | null
          p_exam_status: string
          p_job_id: string
          p_job_status: string
          p_questions: Json
          p_result_summary: Json
          p_root_job_id: string
          p_tenant_id: string
          p_tos_id: string
        }
        Returns: boolean
      }
      cancel_exam_generation_job: {
        Args: {
          p_job_id: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      save_generated_exam_questions: {
        Args: {
          p_exam_status?: string
          p_questions: Json
          p_tenant_id: string
          p_tos_id: string
        }
        Returns: undefined
      }
      set_current_grading_period: {
        Args: { p_period_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
