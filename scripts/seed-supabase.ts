#!/usr/bin/env node

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const demo = args.has('--demo');

function fail(message: string): never {
  console.error('[SEED SAFETY] ' + message);
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD ?? '';
const confirmedProjectRef = process.env.CONFIRM_PROJECT_REF?.trim();

if (!supabaseUrl) fail('SUPABASE_URL is required.');
if (!serviceRoleKey) fail('SUPABASE_SERVICE_ROLE_KEY is required.');
if (!adminEmail) fail('ADMIN_EMAIL is required.');
if (!adminEmail.endsWith('@deped.gov.ph')) fail('ADMIN_EMAIL must use the @deped.gov.ph domain.');
if (!adminPassword) fail('ADMIN_PASSWORD is required.');
if (adminPassword.length < 12) fail('ADMIN_PASSWORD must contain at least 12 characters.');
if (!confirmedProjectRef) fail('CONFIRM_PROJECT_REF is required.');

let projectRef = '';
try {
  const parsed = new URL(supabaseUrl);
  if (!parsed.hostname.endsWith('.supabase.co')) fail('SUPABASE_URL must point to a Supabase project.');
  projectRef = parsed.hostname.split('.')[0];
} catch {
  fail('SUPABASE_URL is invalid.');
}

if (confirmedProjectRef !== projectRef) {
  fail('CONFIRM_PROJECT_REF does not match the project reference in SUPABASE_URL.');
}

if (!dryRun) {
  fail('This repository seed entry point is validation-only. Use reviewed Supabase migrations for database writes; no seed write mode is enabled.');
}

console.log('[DRY-RUN PLAN]');
console.log(demo ? 'Seed demo academic data' : 'Validate administrator bootstrap configuration');
console.log('Target project reference: ' + projectRef);
console.log('No changes made to the database');
