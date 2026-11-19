import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  if (process.env.NODE_ENV !== 'development' && process.env.OMR_BROWSER_VALIDATION !== 'true') {
    return new NextResponse(null, { status: 404 });
  }

  const fixturePath = path.join(
    process.cwd(),
    'src', 'features', 'omr', '__tests__', 'fixtures', 'real_world_scan.png',
  );
  const image = await readFile(fixturePath);
  return new NextResponse(image, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
}
