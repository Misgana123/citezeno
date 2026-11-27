import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/* Keeps "every outside call goes through the provider registry and gateway"
   true by tooling, not just by agreement. App code (app/, lib/, components/,
   middleware.ts) may not, outside lib/providers/:
     - name an outside service's API address,
     - import a vendor SDK,
     - import a provider adapter directly (features ask for the job instead).

   Exempt:
     - lib/sources.ts: the citation feature's browser-side searches (OpenAlex,
       Crossref, Open Library, Wikipedia), which stay as they are for now.
     - infrastructure that isn't a provider job: auth (Better Auth), billing
       (Polar), email (Resend), the database (pg), Redis (ioredis). Their SDKs
       aren't listed below.
     - the reader's PDF renderer (components/reader/pdf/): PDF.js draws pages in
       the browser and makes no outside call; reading text out of PDFs on the
       server still goes through the PDF text job. */

const ROOT = join(__dirname, '..', '..');
const SCAN = ['app', 'lib', 'components', 'middleware.ts'];
const PROVIDERS_DIR = 'lib/providers/';
const EXEMPT = new Set(['lib/sources.ts']);
/* Folders allowed to import one SDK, and why (see above). */
const SDK_EXEMPT: { dir: string; sdk: string }[] = [{ dir: 'components/reader/pdf/', sdk: 'pdfjs-dist' }];

/* Job folders and shared files features may import; every other folder in lib/providers is an adapter. */
const JOB_DIRS = new Set(['gateway', 'papers', 'enrich', 'storage', 'pdf-text', 'chat', 'embeddings', 'web-files', 'web-search', 'code-sandbox', 'connectors']);

/* An outside service's API address: an api.* host, or the citation sources' search endpoints. */
const VENDOR_API = /https?:\/\/(api\.[a-z0-9-]+\.[a-z.]+|[a-z0-9-]+\.googleapis\.com|[a-z.]*openlibrary\.org\/search|[a-z]+\.wikipedia\.org\/w\/api)/i;

/* SDKs for provider jobs (paper data, AI models, embeddings, storage, PDF text). */
const VENDOR_SDKS = [
  'openai',
  '@anthropic-ai/sdk',
  '@google/genai',
  '@google/generative-ai',
  'cohere-ai',
  '@mistralai/mistralai',
  'voyageai',
  'cloudinary',
  '@aws-sdk/client-s3',
  '@vercel/blob',
  'pdf-parse',
  'pdfjs-dist',
  'unpdf',
  '@e2b/code-interpreter',
  'e2b',
];

function files(path: string): string[] {
  const abs = join(ROOT, path);
  if (!statSync(abs, { throwIfNoEntry: false })) return [];
  if (statSync(abs).isFile()) return /\.(ts|tsx|mts|js|mjs)$/.test(path) ? [path] : [];
  return readdirSync(abs).flatMap((name) => (name === 'node_modules' || name.startsWith('.') ? [] : files(join(path, name))));
}

const adapters = readdirSync(join(ROOT, PROVIDERS_DIR), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !JOB_DIRS.has(d.name))
  .map((d) => d.name);

const appFiles = SCAN.flatMap(files).map((f) => relative(ROOT, join(ROOT, f)).split('\\').join('/'));
const outside = appFiles.filter((f) => !f.startsWith(PROVIDERS_DIR) && !EXEMPT.has(f));

const importsOf = (src: string) => [...src.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);

/* Lines a rule matches, as "file:line: text", ignoring comments. */
function offending(test: (line: string) => boolean, list = outside): string[] {
  return list.flatMap((f) =>
    readFileSync(join(ROOT, f), 'utf8')
      .split('\n')
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => !/^\s*(\/\/|\/?\*)/.test(line) && test(line))
      .map(({ line, i }) => `${f}:${i + 1}: ${line.trim().slice(0, 120)}`),
  );
}

describe('provider boundaries', () => {
  it('finds the app code and the adapters', () => {
    expect(outside.length).toBeGreaterThan(50);
    expect(adapters).toEqual(expect.arrayContaining(['openalex', 'cloudinary', 'r2', 'basic-pdf', 'gemini', 'openrouter']));
  });

  it('no outside service API address outside lib/providers (citation exempt)', () => {
    expect(offending((l) => VENDOR_API.test(l))).toEqual([]);
  });

  it('no vendor SDK imported outside lib/providers', () => {
    const bad = outside.flatMap((f) =>
      importsOf(readFileSync(join(ROOT, f), 'utf8'))
        .filter((m) => VENDOR_SDKS.some((sdk) => (m === sdk || m.startsWith(`${sdk}/`)) && !SDK_EXEMPT.some((x) => f.startsWith(x.dir) && x.sdk === sdk)))
        .map((m) => `${f}: ${m}`),
    );
    expect(bad).toEqual([]);
  });

  it('features ask for the job, never import an adapter', () => {
    const adapterImport = new RegExp(`(^|/)lib/providers/(${adapters.join('|')})(/|$)`);
    const bad = outside.flatMap((f) =>
      importsOf(readFileSync(join(ROOT, f), 'utf8'))
        .filter((m) => adapterImport.test(m.replace(/^@\//, '')))
        .map((m) => `${f}: ${m}`),
    );
    expect(bad).toEqual([]);
  });

  it('job folders and the gateway stay vendor-neutral (only registries name adapters)', () => {
    const neutral = appFiles.filter((f) => [...JOB_DIRS].some((d) => f.startsWith(`${PROVIDERS_DIR}${d}/`)) && !f.endsWith('/registry.ts'));
    const adapterImport = new RegExp(`(^|/)(lib/providers/)?(${adapters.join('|')})(/|$)`);
    const bad = neutral.flatMap((f) =>
      importsOf(readFileSync(join(ROOT, f), 'utf8'))
        .filter((m) => adapterImport.test(m.replace(/^@\//, '').replace(/^(\.\.\/)+/, '')))
        .map((m) => `${f}: ${m}`),
    );
    expect(bad).toEqual([]);
    expect(offending((l) => VENDOR_API.test(l), neutral)).toEqual([]);
  });

  it('the rule really catches a violation', () => {
    expect(VENDOR_API.test("fetch('https://api.openalex.org/works')")).toBe(true);
    expect(VENDOR_API.test("const u = 'https://api.semanticscholar.org/graph/v1/paper'")).toBe(true);
    expect(VENDOR_API.test("const link = 'https://openalex.org/W123'")).toBe(false); // a link for people, not an API call
    expect(VENDOR_API.test("const doi = 'https://doi.org/10.1/x'")).toBe(false);
    expect(VENDOR_API.test("fetch('https://generativelanguage.googleapis.com/v1beta/models')")).toBe(true);
    expect(VENDOR_API.test("fetch('https://api.anthropic.com/v1/messages')")).toBe(true);
  });
});
