/**
 * Build-time global search index generator.
 * Crawls src/*.html (including nested <include> partials), strips markup, and
 * writes build/search-index.json so the command palette can search across pages.
 */
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const SRC_DIR = path.resolve(__dirname, '..', 'src');
const OUT_FILE = path.resolve(__dirname, '..', 'build', 'search-index.json');
const INCLUDE_RE = /<include\s+src=["'](.+?)["']\s*\/?>\s*(?:<\/include>)?/gis;

// Extra aliases so searches like "roster", "learners", "admin" surface the right page
const KEYWORD_HINTS = {
  'index.html': ['dashboard', 'overview', 'home', 'kpi', 'mps', 'performance'],
  'students.html': ['roster', 'learners', 'enrolled', 'student list', 'lrn'],
  'reports.html': ['report', 'printing', 'sf5', 'sf4', 'summary'],
  'login.html': ['sign in', 'signin', 'auth'],
  'register.html': ['sign up', 'new account', 'create account'],
};

// Admin-only routes — must mirror the list in src/js/auth-adapter.js (isAdminRoute).
// They are excluded from the index so they never appear in the search palette
// (or the shipped build payload) for non-admin users.
const ADMIN_ONLY_PAGES = [
  'admin.html',
  'pending-users.html',
  'audit-logs.html',
  'app-config.html',
  'app.html',
  'tenants.html',
  'tenant.html',
  'system-health.html',
];

function processNestedHtml(content, dir, seen = new Set()) {
  return content.replace(INCLUDE_RE, (m, src) => {
    const filePath = path.resolve(dir, src);
    if (seen.has(filePath)) return '';
    seen.add(filePath);
    try {
      return processNestedHtml(fs.readFileSync(filePath, 'utf8'), path.dirname(filePath), seen);
    } catch (e) {
      return '';
    }
  });
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHeadings(html) {
  const out = [];
  const re = /<(h[1-4])[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html))) {
    const text = stripTags(m[2]);
    if (text && !out.includes(text)) out.push(text);
  }
  return out.slice(0, 24);
}

function extractTitle(html) {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (t && t[1].trim()) return stripTags(t[1].trim());
  const h = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  return h ? stripTags(h[1]) : '';
}

try {
  const files = glob.sync('*.html', { cwd: SRC_DIR });
  const index = [];

  for (const rel of files) {
    const filePath = path.resolve(SRC_DIR, rel);
    let raw = fs.readFileSync(filePath, 'utf8');
    raw = processNestedHtml(raw, SRC_DIR);

    const title = extractTitle(raw);
    const headings = extractHeadings(raw);
    const text = stripTags(raw).slice(0, 6000);
    const basename = path.basename(filePath);
    if (ADMIN_ONLY_PAGES.includes(basename)) continue;

    const keywords = [...(KEYWORD_HINTS[basename] || [])];

    index.push({ url: basename, title, headings, text, keywords });
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(index));
  console.log(`[search-index] generated ${index.length} pages -> build/search-index.json (${fs.statSync(OUT_FILE).size} bytes)`);
} catch (e) {
  console.error('[search-index] generation failed:', e.message);
  process.exit(1);
}