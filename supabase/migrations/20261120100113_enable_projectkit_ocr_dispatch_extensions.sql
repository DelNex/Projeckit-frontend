-- Keep the durable OCR queue moving even when no teacher has the page open.
-- The two Vault secrets must be configured in Supabase before dispatch succeeds.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;

DO $migration$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid FROM cron.job WHERE jobname = 'projectkit-ocr-dispatch'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'projectkit-ocr-dispatch',
    '*/10 * * * *',
    $command$
      select net.http_get(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'projectkit_backend_url'
        ) || '/api/internal/ocr/dispatch',
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'projectkit_ocr_dispatch_secret'
          )
        ),
        timeout_milliseconds := 5000
      );
    $command$
  );
END;
$migration$;
