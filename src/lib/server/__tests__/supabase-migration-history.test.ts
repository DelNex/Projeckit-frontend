import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const migrationsDirectory = fileURLToPath(new URL('../../../../supabase/migrations/', import.meta.url));

 test('checked-in OCR migrations use the versions already applied to Supabase', async () => {
  const files = await readdir(migrationsDirectory);
  assert.ok(files.includes('20261120095152_server_side_document_extraction_jobs.sql'));
  assert.ok(files.includes('20261120100113_enable_projectkit_ocr_dispatch_extensions.sql'));
  assert.equal(files.some((file) => file.startsWith('20261120120000_')), false);
});

test('OCR dispatch migration installs the ten-minute Vault-authenticated dispatcher', async () => {
  const sql = await readFile(new URL('../../../../supabase/migrations/20261120100113_enable_projectkit_ocr_dispatch_extensions.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS pg_cron/i);
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS pg_net/i);
  assert.match(sql, /projectkit-ocr-dispatch/);
  assert.match(sql, /\*\/10 \* \* \* \*/);
  assert.match(sql, /projectkit_backend_url/);
  assert.match(sql, /projectkit_ocr_dispatch_secret/);
  assert.match(sql, /\/api\/internal\/ocr\/dispatch/);
});

test('tenant competency table is only granted to the server service role', async () => {
  const sql = await readFile(new URL('../../../../supabase/migrations/20261121100000_harden_tenant_competency_access.sql', import.meta.url), 'utf8');
  assert.match(sql, /REVOKE ALL ON TABLE public\.tenant_competencies FROM anon, authenticated/i);
  assert.match(sql, /GRANT ALL ON TABLE public\.tenant_competencies TO service_role/i);
  assert.match(sql, /tenant_competencies_tenant_id_idx/);
});

test('exam finalization locks job rows and commits questions with the final job status atomically', async () => {
  const sql = await readFile(new URL('../../../../supabase/migrations/20261121110000_atomic_exam_job_finalization.sql', import.meta.url), 'utf8');
  assert.match(sql, /FUNCTION public\.finalize_exam_generation_job/i);
  assert.match(sql, /parent_job_id IS NULL[\s\S]*?FOR UPDATE/i);
  assert.match(sql, /status IS DISTINCT FROM 'running'/i);
  assert.match(sql, /UPDATE public\.tos_documents[\s\S]*?UPDATE public\.exam_generation_jobs/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.finalize_exam_generation_job[\s\S]*?FROM PUBLIC, anon, authenticated/i);
});
