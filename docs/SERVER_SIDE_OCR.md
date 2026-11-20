# Project KIT server-side OCR

## Status

This branch moves lesson-file extraction out of the browser and into the existing NestJS backend. It does not add a paid queue, another hosting service, or a new database.

The frontend uploads original files through its authenticated same-origin backend proxy. The backend stores each original in the existing private `lesson-uploads` Supabase Storage bucket and inserts a row into `document_extraction_jobs`. A database RPC claims jobs with `FOR UPDATE SKIP LOCKED`, so two backend requests cannot claim the same job.

The Render process runs one OCR job at a time. It uses:
- `pdf-parse` for text-based PDFs
- `pdftoppm` to render scanned PDF pages one at a time
- Tesseract CLI with English and Filipino language data for scanned PDF pages and images
- `mammoth` for DOCX
- `unzip` plus slide XML text extraction for PPTX
- direct UTF-8 reading for TXT and Markdown

Extracted text is gzip-compressed and saved back to the same private bucket. The browser polls the job endpoint and then passes the returned text into the existing exam-generation flow. The browser no longer performs lesson PDF/image OCR.

## Limits

- Up to 5 files per upload.
- Up to 20 MB per file.
- Up to 200 PDF pages for scanned-PDF OCR.
- Up to 900,000 extracted characters across the lesson material.
- One OCR job at a time per backend process.
- English + Filipino Tesseract model. Filipino is the available packaged model used for Tagalog-heavy material; OCR quality still depends on scan quality.
- The original source file is removed from Storage after successful extraction or terminal failure. The extracted result remains in Storage for up to 7 days, then the backend removes the result object and old job row.

## Database migration

Apply the new migration from the frontend repository:

`supabase/migrations/20261120120000_server_side_document_extraction_jobs.sql`

The table has RLS enabled and denies direct access to browser roles. Only the backend service-role client can read or mutate queue rows. The claim function is executable only by `service_role`.

The migration assumes the existing private `lesson-uploads` bucket is present. It does not create a public bucket or expose original files.

## Render deployment

Deploy the backend branch `feat/backend-ocr-no-cost` to the existing Render service. The Dockerfile installs Tesseract, Poppler utilities, Unzip, English data, and Filipino data. No new npm dependency or Redis service is required.

Add this environment variable to the existing Render backend service:

- `OCR_DISPATCH_SECRET`: a random secret of at least 32 characters.

Keep it server-only. Do not add it to any `NEXT_PUBLIC_*` variable or commit it to Git.

## Wake-up schedule for a free Render service

The worker runs inside the existing web service. Render Free web services spin down after 15 minutes without inbound traffic and wake on the next request. A durable job remains in Supabase during sleep, but the worker cannot run while the service is stopped.

To let jobs continue after the teacher closes the browser, configure Supabase Cron to call the backend dispatch endpoint. Enable `pg_cron`, `pg_net`, and Vault if they are not already enabled, then store the backend URL and the same secret in Vault:

```sql
select vault.create_secret(
  'https://YOUR-RENDER-SERVICE.onrender.com',
  'projectkit_backend_url'
);

select vault.create_secret(
  'YOUR_SAME_OCR_DISPATCH_SECRET',
  'projectkit_ocr_dispatch_secret'
);
```

Schedule a wake-up/dispatch request every 10 minutes:

```sql
select cron.schedule(
  'projectkit-ocr-dispatch',
  '*/10 * * * *',
  $$
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
  $$
);
```

The endpoint returns immediately and asks the in-process worker to claim one job. The worker continues independently of the browser request. The service's own polling loop claims later jobs while the service remains awake.

**Free-tier cost warning:** keeping a Render Free service awake with a recurring request uses nearly all of the workspace's 750 free instance hours per month (about 720 hours at this cadence). Those hours are shared with other free services in the workspace. If the workspace cannot spare those hours, use a slower schedule and accept that OCR may wait for the next wake-up, or leave the schedule disabled and accept that processing resumes only when another request wakes the backend. Render may also restart free services at any time, so queue leases and retries remain necessary.

## Verification before production

1. Apply the Supabase migration.
2. Set `OCR_DISPATCH_SECRET` in Render and store the same value in Supabase Vault.
3. Deploy the backend branch and verify the Render build completes with `tesseract --list-langs` showing `eng` and `fil`, and `pdftoppm -v` succeeding.
4. Deploy the frontend branch.
5. Test a text PDF, scanned PDF, photo, DOCX, PPTX, TXT, and Markdown file.
6. Close the browser after upload and verify the job continues to `completed` in the database.
7. Restart the backend during a job and verify the expired lease is reclaimed or the job becomes a clear terminal failure after the retry limit.
8. Verify a different signed-in teacher cannot read another user's job.
9. Run frontend tests/build and backend tests/build before merging.

This implementation does not claim that an OCR result is perfect. Teachers must review low-quality scans against the original document.
