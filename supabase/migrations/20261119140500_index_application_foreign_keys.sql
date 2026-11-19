-- Index foreign-key columns in the application schema.
-- These indexes support joins and avoid expensive scans when referenced rows
-- are updated or deleted. Supabase-managed auth/storage tables are intentionally
-- excluded from application migrations.
CREATE INDEX IF NOT EXISTS idx_admin_delete_codes_set_by_fk
  ON public.admin_delete_codes (set_by);
CREATE INDEX IF NOT EXISTS idx_answer_keys_tenant_id_fk
  ON public.answer_keys (tenant_id);
CREATE INDEX IF NOT EXISTS idx_assessments_created_by_fk
  ON public.assessments (created_by);
CREATE INDEX IF NOT EXISTS idx_assessments_section_id_fk
  ON public.assessments (section_id);
CREATE INDEX IF NOT EXISTS idx_assessments_subject_id_fk
  ON public.assessments (subject_id);
CREATE INDEX IF NOT EXISTS idx_course_materials_uploaded_by_fk
  ON public.course_materials (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_exam_generation_jobs_created_by_fk
  ON public.exam_generation_jobs (created_by);
CREATE INDEX IF NOT EXISTS idx_exam_generation_jobs_tenant_id_fk
  ON public.exam_generation_jobs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_helper_status_current_job_id_fk
  ON public.helper_status (current_job_id);
CREATE INDEX IF NOT EXISTS idx_profiles_archived_by_fk
  ON public.profiles (archived_by);
CREATE INDEX IF NOT EXISTS idx_responses_tenant_id_fk
  ON public.responses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_scan_jobs_assessment_id_fk
  ON public.scan_jobs (assessment_id);
CREATE INDEX IF NOT EXISTS idx_scan_jobs_created_by_fk
  ON public.scan_jobs (created_by);
CREATE INDEX IF NOT EXISTS idx_scan_results_scan_job_id_fk
  ON public.scan_results (scan_job_id);
CREATE INDEX IF NOT EXISTS idx_scan_results_student_id_fk
  ON public.scan_results (student_id);
CREATE INDEX IF NOT EXISTS idx_sections_archived_by_fk
  ON public.sections (archived_by);
CREATE INDEX IF NOT EXISTS idx_students_archived_by_fk
  ON public.students (archived_by);
CREATE INDEX IF NOT EXISTS idx_tenant_competencies_created_by_fk
  ON public.tenant_competencies (created_by);
CREATE INDEX IF NOT EXISTS idx_tos_documents_created_by_fk
  ON public.tos_documents (created_by);
