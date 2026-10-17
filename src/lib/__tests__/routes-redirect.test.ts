/**
 * Project KIT — Next.js Configuration & Route Redirect Tests
 * Validates safe redirect from /grades and /grades/* to /tos.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import nextConfig from '../../../next.config.mjs';

describe('Project KIT — Safe /grades Route Redirects', () => {
  it('defines redirects from /grades and /grades/* to /tos in next.config.mjs', async () => {
    assert.ok(typeof nextConfig.redirects === 'function', 'nextConfig must export redirects function');

    const redirects = await nextConfig.redirects();
    assert.ok(Array.isArray(redirects));

    const gradesExact = redirects.find((r: any) => r.source === '/grades');
    assert.ok(gradesExact, 'Missing redirect for /grades');
    assert.strictEqual(gradesExact.destination, '/tos');

    const gradesWildcard = redirects.find((r: any) => r.source === '/grades/:path*');
    assert.ok(gradesWildcard, 'Missing redirect for /grades/:path*');
    assert.strictEqual(gradesWildcard.destination, '/tos');
  });
});
