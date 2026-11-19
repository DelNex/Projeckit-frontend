export const config = {
  // Keep the durable exam queue moving even when no teacher has the page open.
  schedule: "* * * * *",
};

export default async (request: Request) => {
  // Preview deploys share the configured Supabase project. Never let a manual
  // preview invocation process production jobs.
  if (process.env.EXAM_SCHEDULER_ENABLED !== "true") {
    console.info("[exam scheduler] Disabled for this deploy context.");
    return;
  }

  const { next_run } = await request.json().catch(() => ({})) as { next_run?: string };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const secret = process.env.CRON_SECRET || "";

  if (!/^https:\/\//i.test(appUrl) || secret.length < 32) {
    console.error("[exam scheduler] Missing HTTPS app URL or CRON_SECRET.");
    throw new Error("Exam scheduler environment is incomplete.");
  }

  const endpoint = new URL("/api/internal/exam-worker", appUrl);
  // One authenticated dispatch claims up to four distinct jobs in parallel.
  // The database claim RPC enforces the global and per-school concurrency caps.
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
    signal: AbortSignal.timeout(4_000),
  });

  if (!response.ok) {
    console.error("[exam scheduler] Worker dispatch failed with HTTP", response.status);
    throw new Error(`Exam worker dispatch failed with HTTP ${response.status}.`);
  }

  console.info("[exam scheduler] Worker batch dispatch accepted.", { nextRun: next_run || null });
};
