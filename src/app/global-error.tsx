'use client';

import { useEffect } from 'react';

type AppError = Error & { digest?: string };

export default function GlobalError({ error, reset }: { error: AppError; reset: () => void }) {
  useEffect(() => {
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: error.name,
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        route: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-bold">Project KIT encountered an unexpected error.</h1>
          <p className="max-w-lg text-sm">The error has been recorded for an administrator. Try again.</p>
          <button onClick={reset} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Try again</button>
        </main>
      </body>
    </html>
  );
}
