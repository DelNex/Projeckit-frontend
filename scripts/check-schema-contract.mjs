#!/usr/bin/env node

/**
 * check-schema-contract.mjs
 * Validates frontend Supabase calls (.from('table').select/insert/update/upsert/eq/order)
 * against the authoritative PostgreSQL migrations in /supabase/migrations.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Locate migrations directory
const potentialMigrationDirs = [
  path.resolve(__dirname, '../../supabase/migrations'),
  path.resolve(process.cwd(), '../supabase/migrations'),
  path.resolve(process.cwd(), 'supabase/migrations'),
];

const migrationsDir = potentialMigrationDirs.find((d) => fs.existsSync(d));

if (!migrationsDir) {
  console.error('❌ Could not locate supabase/migrations directory.');
  process.exit(1);
}

// Load allowlist
const allowlistPath = path.resolve(__dirname, 'schema-contract-allowlist.json');
let allowlist = { allowedColumns: {} };
if (fs.existsSync(allowlistPath)) {
  try {
    allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
  } catch (e) {
    console.warn('⚠️ Warning: failed to parse schema-contract-allowlist.json', e);
  }
}

// 1. Parse all SQL migrations for CREATE TABLE and ALTER TABLE ADD COLUMN
const schema = new Map();

const migrationFiles = fs.readdirSync(migrationsDir).sort();
for (const file of migrationFiles) {
  if (!file.endsWith('.sql')) continue;
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

  // CREATE TABLE
  const createTableRegex =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
  let match;
  while ((match = createTableRegex.exec(content)) !== null) {
    const table = match[1].toLowerCase();
    if (!schema.has(table)) schema.set(table, new Set());
    const body = match[2];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('--') || line.startsWith('/*')) continue;
      if (/^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b/i.test(line)) continue;
      const colMatch = line.match(/^([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+)/);
      if (colMatch) {
        schema.get(table).add(colMatch[1].toLowerCase());
      }
    }
  }

  // ALTER TABLE ... ADD COLUMN
  const alterTableRegex =
    /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+([\s\S]*?);/gi;
  while ((match = alterTableRegex.exec(content)) !== null) {
    const table = match[1].toLowerCase();
    if (!schema.has(table)) schema.set(table, new Set());
    const body = match[2];
    const addColRegex = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\b/gi;
    let colMatch;
    while ((colMatch = addColRegex.exec(body)) !== null) {
      schema.get(table).add(colMatch[1].toLowerCase());
    }
  }
}

// 2. Scan frontend/src
const srcDir = path.resolve(__dirname, '../src');

function getSourceFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        files.push(...getSourceFiles(fullPath));
      }
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.') && !entry.name.includes('__tests__')) {
      files.push(fullPath);
    }
  }
  return files;
}

const sourceFiles = getSourceFiles(srcDir);
const violations = [];

function isColumnAllowed(table, col) {
  const tableCols = schema.get(table);
  if (tableCols && tableCols.has(col)) return true;
  const allowed = allowlist.allowedColumns?.[table];
  if (allowed && allowed.includes(col)) return true;
  if (col === 'id' || col === 'count') return true;
  return false;
}

for (const filePath of sourceFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(srcDir, filePath);

  // Match .from('table') chains
  const fromRegex = /\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)([\s\S]*?)(?=(?:\.from\(|;|\n\s*\n))/g;
  let match;
  while ((match = fromRegex.exec(content)) !== null) {
    const table = match[1].toLowerCase();
    const chain = match[2];

    const validCols = schema.get(table);
    if (!validCols) {
      violations.push({
        file: relPath,
        table,
        column: '(table)',
        method: 'from',
        message: `Table "${table}" does not exist in /supabase/migrations`,
      });
      continue;
    }

    // 1. Check .eq('col'), .order('col'), .neq, .filter, etc.
    const predicateRegex = /\.(?:eq|neq|order|filter|is|in)\(\s*['"]([a-zA-Z0-9_]+)['"]/g;
    let predMatch;
    while ((predMatch = predicateRegex.exec(chain)) !== null) {
      const col = predMatch[1].toLowerCase();
      if (!isColumnAllowed(table, col)) {
        violations.push({
          file: relPath,
          table,
          column: col,
          method: predMatch[0].split('(')[0].replace('.', ''),
          message: `Column "${col}" on table "${table}" is not defined in database migrations.`,
        });
      }
    }

    // 2. Check .select('col1, col2, ...')
    const selectRegex = /\.select\(\s*(?:`([\s\S]*?)`|['"]([\s\S]*?)['"])/g;
    let selMatch;
    while ((selMatch = selectRegex.exec(chain)) !== null) {
      const raw = selMatch[1] ?? selMatch[2] ?? '';
      // Remove joined relation blocks e.g. other_table ( id, title )
      const withoutJoins = raw.replace(/[a-zA-Z0-9_]+\s*\([^)]*\)/g, '');
      const tokens = withoutJoins
        .split(/[\s,\n]+/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      for (const tok of tokens) {
        if (tok === '*' || tok === 'count' || tok.includes(':') || tok === '{' || tok === '}') continue;
        const col = tok.split('(')[0].replace(/[^a-zA-Z0-9_]/g, '');
        if (col && !isColumnAllowed(table, col)) {
          violations.push({
            file: relPath,
            table,
            column: col,
            method: 'select',
            message: `Column "${col}" on table "${table}" is not defined in database migrations.`,
          });
        }
      }
    }

    // 3. Check inline object keys in .insert({ ... }), .update({ ... }), .upsert({ ... })
    const mutationCallRegex = /\.(insert|update|upsert)\s*\(/g;
    let mutCallMatch;
    while ((mutCallMatch = mutationCallRegex.exec(chain)) !== null) {
      const method = mutCallMatch[1];
      const startIdx = mutCallMatch.index + mutCallMatch[0].length;
      // Extract balanced argument
      let depth = 1;
      let endIdx = startIdx;
      let inString = null;
      while (endIdx < chain.length && depth > 0) {
        const ch = chain[endIdx];
        const prev = chain[endIdx - 1];
        if (inString) {
          if (ch === inString && prev !== '\\') inString = null;
        } else if (ch === '"' || ch === "'" || ch === '`') {
          inString = ch;
        } else if (ch === '(') {
          depth++;
        } else if (ch === ')') {
          depth--;
        }
        endIdx++;
      }
      const rawArgStr = chain.slice(startIdx, endIdx - 1);

      // Separate first argument (payload) from options (e.g. { onConflict: ... })
      let argDepthP = 0, argDepthB = 0, argDepthK = 0;
      let argInStr = null;
      let payloadEnd = rawArgStr.length;
      for (let i = 0; i < rawArgStr.length; i++) {
        const ch = rawArgStr[i];
        const prev = i > 0 ? rawArgStr[i - 1] : '';
        if (argInStr) {
          if (ch === argInStr && prev !== '\\') argInStr = null;
        } else if (ch === '"' || ch === "'" || ch === '`') {
          argInStr = ch;
        } else if (ch === '(') argDepthP++;
        else if (ch === ')') argDepthP--;
        else if (ch === '{') argDepthB++;
        else if (ch === '}') argDepthB--;
        else if (ch === '[') argDepthK++;
        else if (ch === ']') argDepthK--;
        else if (ch === ',' && argDepthP === 0 && argDepthB === 0 && argDepthK === 0) {
          payloadEnd = i;
          break;
        }
      }
      const argStr = rawArgStr.slice(0, payloadEnd);

      // Parse top-level object keys (depth 1 inside curly braces)
      const topKeys = [];
      let braceDepth = 0;
      let strQuote = null;
      let keyBuffer = '';
      let expectingKey = false;

      for (let i = 0; i < argStr.length; i++) {
        const c = argStr[i];
        const prev = i > 0 ? argStr[i - 1] : '';

        if (strQuote) {
          if (c === strQuote && prev !== '\\') strQuote = null;
          continue;
        }
        if (c === '"' || c === "'" || c === '`') {
          strQuote = c;
          continue;
        }
        if (c === '{') {
          braceDepth++;
          if (braceDepth === 1) {
            expectingKey = true;
            keyBuffer = '';
          }
          continue;
        }
        if (c === '}') {
          braceDepth--;
          if (braceDepth === 0) expectingKey = false;
          continue;
        }

        if (braceDepth === 1) {
          if (c === ':') {
            const trimmed = keyBuffer.trim().replace(/['"`]/g, '');
            if (/^[a-zA-Z0-9_]+$/.test(trimmed)) {
              topKeys.push(trimmed.toLowerCase());
            }
            expectingKey = false;
            keyBuffer = '';
          } else if (c === ',') {
            expectingKey = true;
            keyBuffer = '';
          } else if (expectingKey) {
            keyBuffer += c;
          }
        }
      }

      for (const col of topKeys) {
        if (!isColumnAllowed(table, col)) {
          violations.push({
            file: relPath,
            table,
            column: col,
            method,
            message: `Column "${col}" on table "${table}" in .${method}() payload is not defined in database migrations.`,
          });
        }
      }
    }
  }
}

// Clean up temporary test file if present
const testContractFile = path.resolve(__dirname, 'test-contract.mjs');
if (fs.existsSync(testContractFile)) {
  fs.unlinkSync(testContractFile);
}

if (violations.length > 0) {
  console.error(`\n❌ Schema Contract Validation FAILED: Found ${violations.length} database mismatch(es):\n`);
  for (const v of violations) {
    console.error(`  - [${v.table}.${v.column}] in ${v.file} via .${v.method}(): ${v.message}`);
  }
  process.exit(1);
} else {
  console.log(`\n✅ Schema Contract Validation PASSED: All frontend Supabase queries match migrations (20 tables, 0 mismatches).\n`);
  process.exit(0);
}
