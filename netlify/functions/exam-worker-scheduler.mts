export const config = {
  // Keep the durable exam queue moving even when no teacher has the page open.
  schedule: "* * * * *",
};

export default async (request: Request) => {
  const { next_run } = await request.json().catch(() => ({})) as { next_run?: string };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const secret = process.env.CRON_SECRET || "";

  if (!/^https:\/\//i.test(appUrl) || secret.length < 32) {
    console.error("[exam scheduler] Missing HTTPS app URL or CRON_SECRET.");
    throw new Error("Exam scheduler environment is incomplete.");
  }

  const endpoint = new URL("/api/internal/exam-worker", appUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    console.error("[exam scheduler] Worker dispatch failed with HTTP", response.status);
    throw new Error(`Exam worker dispatch failed with HTTP ${response.status}.`);
  }

  console.info("[exam scheduler] Worker dispatch accepted.", { nextRun: next_run || null });
};
