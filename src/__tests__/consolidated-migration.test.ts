import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// This generator lives in the parent monorepo, not in the standalone frontend checkout.
const generatorPath = path.resolve(__dirname, '../../../scripts/build-consolidated.mjs');
const hasGenerator = fs.existsSync(generatorPath);

describe('Project KIT — Consolidated Migrations Parity Tests', () => {
  const repoRoot = path.resolve(__dirname, '../../..');

  it('1. committed consolidated_migration_and_seed.sql matches generated output exactly', { skip: !hasGenerator }, async () => {
    const committedFilePath = path.join(
      repoRoot,
      'supabase',
      'consolidated_migration_and_seed.sql'
    );
    assert.ok(
      fs.existsSync(committedFilePath),
      'supabase/consolidated_migration_and_seed.sql must exist'
    );

    const committedContent = fs.readFileSync(committedFilePath, 'utf8');
    const { generateConsolidatedAllWithSeed } = await import(pathToFileURL(generatorPath).href);
    const expectedContent = generateConsolidatedAllWithSeed();

    assert.ok(
      committedContent.startsWith('-- =============================================================================\n-- GENERATED FILE - DO NOT EDIT'),
      'Must contain GENERATED FILE - DO NOT EDIT header at the top'
    );

    assert.strictEqual(
      committedContent,
      expectedContent,
      'Committed supabase/consolidated_migration_and_seed.sql does not match generated output! Run "node scripts/build-consolidated.mjs" to regenerate.'
    );
  });

  it('2. committed consolidated_migrations_14_to_20.sql matches generated output exactly', { skip: !generators }, () => {
    const committedFilePath = path.join(
      repoRoot,
      'supabase',
      'migrations',
      'consolidated_migrations_14_to_20.sql'
    );
    assert.ok(
      fs.existsSync(committedFilePath),
      'supabase/migrations/consolidated_migrations_14_to_20.sql must exist'
    );

    const committedContent = fs.readFileSync(committedFilePath, 'utf8');
    const { generateConsolidated14to20 } = await import(pathToFileURL(generatorPath).href);
    const expectedContent = generateConsolidated14to20();

    assert.ok(
      committedContent.startsWith('-- =============================================================================\n-- GENERATED FILE - DO NOT EDIT'),
      'Must contain GENERATED FILE - DO NOT EDIT header at the top'
    );

    assert.strictEqual(
      committedContent,
      expectedContent,
      'Committed supabase/migrations/consolidated_migrations_14_to_20.sql does not match generated output! Run "node scripts/build-consolidated.mjs" to regenerate.'
    );
  });
});

