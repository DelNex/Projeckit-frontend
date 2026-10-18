import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

describe('Project KIT — Seed Safety & Validation Tests (Task 5)', () => {
  const seedScriptPath = path.join(repoRoot, 'scripts', 'seed-supabase.ts');

  it('1. scripts/seed-supabase.ts exists and enforces strict validation', () => {
    assert.ok(fs.existsSync(seedScriptPath), 'scripts/seed-supabase.ts must exist');
    const content = fs.readFileSync(seedScriptPath, 'utf8');

    assert.ok(content.includes('ADMIN_PASSWORD'), 'Must check ADMIN_PASSWORD');
    assert.ok(content.includes('CONFIRM_PROJECT_REF'), 'Must check CONFIRM_PROJECT_REF');
    assert.ok(content.includes('--dry-run'), 'Must support --dry-run');
    assert.ok(content.includes('--demo'), 'Must support --demo');
  });

  it('2. exits with code 1 when ADMIN_PASSWORD is missing', () => {
    const res = spawnSync(
      'npx',
      ['tsx', 'scripts/seed-supabase.ts', '--dry-run'],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          SUPABASE_URL: 'https://testproject123.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
          ADMIN_EMAIL: 'admin@school.edu',
          ADMIN_PASSWORD: '', // missing
          CONFIRM_PROJECT_REF: 'testproject123',
        },
        encoding: 'utf8',
      }
    );

    assert.strictEqual(res.status, 1, 'Should exit with code 1 when ADMIN_PASSWORD is empty');
    assert.ok(
      res.stderr.includes('ADMIN_PASSWORD') || res.stdout.includes('ADMIN_PASSWORD'),
      'Must print error about ADMIN_PASSWORD'
    );
  });

  it('3. exits with code 1 when ADMIN_PASSWORD is shorter than 12 characters', () => {
    const res = spawnSync(
      'npx',
      ['tsx', 'scripts/seed-supabase.ts', '--dry-run'],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          SUPABASE_URL: 'https://testproject123.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
          ADMIN_EMAIL: 'admin@school.edu',
          ADMIN_PASSWORD: 'short', // < 12 chars
          CONFIRM_PROJECT_REF: 'testproject123',
        },
        encoding: 'utf8',
      }
    );

    assert.strictEqual(res.status, 1, 'Should exit with code 1 when ADMIN_PASSWORD is short');
    assert.ok(
      res.stderr.includes('12 characters') || res.stdout.includes('12 characters'),
      'Must print error about 12 characters requirement'
    );
  });

  it('4. exits with code 1 when CONFIRM_PROJECT_REF does not match project ref', () => {
    const res = spawnSync(
      'npx',
      ['tsx', 'scripts/seed-supabase.ts', '--dry-run'],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          SUPABASE_URL: 'https://testproject123.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
          ADMIN_EMAIL: 'admin@school.edu',
          ADMIN_PASSWORD: 'SuperSecurePassword2026!',
          CONFIRM_PROJECT_REF: 'wrong-project-ref', // mismatch
        },
        encoding: 'utf8',
      }
    );

    assert.strictEqual(res.status, 1, 'Should exit with code 1 when project ref does not match');
    assert.ok(
      res.stderr.includes('CONFIRM_PROJECT_REF') || res.stdout.includes('CONFIRM_PROJECT_REF'),
      'Must print error about CONFIRM_PROJECT_REF'
    );
  });

  it('5. exits with code 0 in --dry-run mode when valid configuration and matching project ref are provided', () => {
    const res = spawnSync(
      'npx',
      ['tsx', 'scripts/seed-supabase.ts', '--dry-run'],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          SUPABASE_URL: 'https://testproject123.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
          ADMIN_EMAIL: 'admin@school.edu',
          ADMIN_PASSWORD: 'SuperSecurePassword2026!',
          CONFIRM_PROJECT_REF: 'testproject123',
        },
        encoding: 'utf8',
      }
    );

    assert.strictEqual(res.status, 0, `Dry run should succeed: stdout=${res.stdout}, stderr=${res.stderr}`);
    assert.ok(res.stdout.includes('[DRY-RUN PLAN]'), 'Output should contain dry-run plan');
    assert.ok(res.stdout.includes('No changes made to the database'), 'Output should indicate no DB writes');
  });

  it('6. requires DEMO_TEACHER_PASSWORD (>=12 chars) when --demo is specified', () => {
    const res = spawnSync(
      'npx',
      ['tsx', 'scripts/seed-supabase.ts', '--dry-run', '--demo'],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          SUPABASE_URL: 'https://testproject123.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
          ADMIN_EMAIL: 'admin@school.edu',
          ADMIN_PASSWORD: 'SuperSecurePassword2026!',
          CONFIRM_PROJECT_REF: 'testproject123',
          DEMO_TEACHER_PASSWORD: '', // missing
        },
        encoding: 'utf8',
      }
    );

    assert.strictEqual(res.status, 1, 'Should exit with code 1 when demo password missing');
    assert.ok(
      res.stderr.includes('DEMO_TEACHER_PASSWORD') || res.stdout.includes('DEMO_TEACHER_PASSWORD'),
      'Must print error about DEMO_TEACHER_PASSWORD'
    );
  });

  it('7. supabase/seed.sql contains DEV/LOCAL ONLY banner and includes section_id in student inserts', () => {
    const seedSqlPath = path.join(repoRoot, 'supabase', 'seed.sql');
    assert.ok(fs.existsSync(seedSqlPath), 'supabase/seed.sql must exist');
    const sql = fs.readFileSync(seedSqlPath, 'utf8');

    assert.ok(sql.includes('DEV / LOCAL ONLY'), 'Must include loud DEV / LOCAL ONLY banner');
    assert.ok(
      sql.includes('INSERT INTO public.students (id, tenant_id, config_id, section_id, lrn, name, section_name)'),
      'Student insert in seed.sql must include section_id'
    );
  });
});

