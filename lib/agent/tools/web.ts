import { z } from 'zod';
import { isProviderError } from '@/lib/providers/errors';
import { readAll } from '@/lib/providers/web-files/read';
import type { WebResult } from '@/lib/providers/web-search/types';
import { ShelfError } from '@/lib/shelf/errors';
import type { AgentContext } from '../context';
import { AGENT_FILE_MAX_BYTES } from '../files';
import { defineTool, tally } from './types';

/* Searching and reading the open web, and downloading files from it. Offered
   to the model only while the user has web search on in the chat. Pages and
   files are fetched on our server through the web files job, which refuses
   private addresses. */

export const WEB_RESULTS_MAX = 10;
const PAGE_MAX_BYTES = 3 * 1024 * 1024;
const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const PAGE_CHARS_DEFAULT = 12_000;
const PAGE_CHARS_MAX = 20_000;
/* What the chat shows of a page under its link. */
const PREVIEW_CHARS = 240;

/* Why a page couldn't be read, in words for the user (the web files job's reasons). */
const PAGE_REFUSALS: Record<string, string> = {
  blocked: 'That link can’t be opened (it isn’t a public web address).',
  not_found: 'The site says that page isn’t there.',
  not_page: 'That link isn’t a readable web page.',
  not_pdf: 'That link isn’t a readable web page.',
  too_large: 'That page is too large to read.',
  is_page: 'That link is a web page, not a file. Read it with web_fetch instead.',
  not_file: 'That link isn’t a kind of file that can be downloaded here (documents, spreadsheets, slides, PDFs, data and reference files, pictures and ZIP or gzip archives can).',
};

function readable<T>(work: Promise<T>): Promise<T> {
  return work.catch((e) => {
    const reason = isProviderError(e) ? e.details.reason : undefined;
    if (reason && PAGE_REFUSALS[reason]) throw new ShelfError('bad_request', PAGE_REFUSALS[reason]);
    throw e;
  });
}

const clipText = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

function searcher(ctx: AgentContext) {
  const search = ctx.webSearch();
  if (!search) throw new ShelfError('unavailable', 'Web search isn’t set up yet.');
  return search;
}

export const webSearch = defineTool({
  name: 'web_search',
  description:
    'Search the open web (news, reports, documentation, organizations’ sites) for current or non-academic information. Returns titles, links and short snippets; read a page in full with web_fetch. For research papers use search_papers instead.',
  input: z.object({
    query: z.string().trim().min(2).max(400),
    maxResults: z.number().int().min(1).max(WEB_RESULTS_MAX).optional().describe('How many results (default 5).'),
    topic: z.enum(['general', 'news']).optional().describe('"news" for recent news articles.'),
    days: z.number().int().min(1).max(365).optional().describe('With topic "news": only articles from the last n days.'),
  }),
  kind: 'read',
  step: 'web',
  label: (i) => `Searching the web for “${clipText(i.query, 60)}”`,
  done: (i) => ({ did: 'Searched the web', about: clipText(i.query, 120) }),
  async run(ctx, { query, maxResults, topic, days }) {
    const results: WebResult[] = await searcher(ctx).search(query, { maxResults: maxResults ?? 5, topic, days });
    return {
      result: { query, results: results.map((r, i) => ({ n: i + 1, title: r.title, url: r.url, snippet: r.snippet, published: r.published })) },
      display: { links: results.map((r) => ({ title: r.title, url: r.url, snippet: clipText(r.snippet, PREVIEW_CHARS), published: r.published })), summary: tally(results.length, 'result') },
    };
  },
});

export const webFetch = defineTool({
  name: 'web_fetch',
  description:
    'Read the main text of one public web page (or an online PDF) by its link, e.g. a result from web_search or a link the user gave. Long pages are cut; ask for more characters only when needed.',
  input: z.object({ url: z.string().trim().url().max(2000), maxChars: z.number().int().min(1000).max(PAGE_CHARS_MAX).optional().describe(`How much text to read (default ${PAGE_CHARS_DEFAULT}).`) }),
  kind: 'read',
  step: 'read',
  label: (i) => `Reading ${clipText(i.url.replace(/^https?:\/\/(www\.)?/i, ''), 60)}`,
  done: (i) => ({ did: 'Read', about: i.url.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 80) }),
  async run(ctx, { url, maxChars }) {
    const limit = maxChars ?? PAGE_CHARS_DEFAULT;
    const files = ctx.webFiles();
    let page: { title: string | null; text: string; finalUrl: string; pdf: boolean };
    try {
      page = { ...(await readable(files.fetchPage(url, { maxBytes: PAGE_MAX_BYTES }))), pdf: false };
    } catch (e) {
      // the link is a PDF: read it with the PDF text job
      if (!(isProviderError(e) && e.details.reason === 'is_pdf')) throw e;
      const pdf = await readable(files.fetchPdf(url, { maxBytes: PDF_MAX_BYTES }));
      const bytes = await readable(readAll(pdf.stream, PDF_MAX_BYTES));
      const read = await ctx.pdfText().read(bytes);
      if (!read.text.trim()) throw new ShelfError('invalid_file', 'That PDF has no readable text (it may be scanned).');
      page = { title: read.title, text: read.text, finalUrl: pdf.finalUrl, pdf: true };
    }
    const cut = page.text.length > limit;
    const title = page.title || page.finalUrl;
    return {
      result: { url: page.finalUrl, title, ...(page.pdf ? { kind: 'pdf' } : {}), text: cut ? page.text.slice(0, limit) : page.text, ...(cut ? { cut: true, totalChars: page.text.length } : {}) },
      display: { links: [{ title, url: page.finalUrl, snippet: clipText(page.text.replace(/\s+/g, ' '), PREVIEW_CHARS) }], summary: page.pdf ? 'Read PDF' : 'Read page' },
    };
  },
});

export const downloadFile = defineTool({
  name: 'download_file',
  description: `Download a file from a public link and keep it as a file of this chat, with a fileId for the other tools (unzip_file, run_python inputs, convert_file, pdf tools, clean_references…). For files: documents, spreadsheets, slides, PDFs, CSV/JSON data, BibTeX/RIS, pictures, ZIP or gzip archives; at most ${AGENT_FILE_MAX_BYTES / (1024 * 1024)} MB. Its kind is checked from its content, not its name. A web page is refused: read pages with web_fetch.`,
  input: z.object({ url: z.string().trim().url().max(2000), filename: z.string().trim().min(1).max(120).optional().describe('A name for the file, without the extension (default: the site’s name for it).') }),
  kind: 'write',
  step: 'web',
  label: (i) => `Downloading ${clipText(i.url.replace(/^https?:\/\/(www\.)?/i, ''), 60)}`,
  done: (i) => ({ did: 'Downloaded', about: i.url.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 80) }),
  async run(ctx, { url, filename }) {
    const got = await readable(ctx.webFiles().fetchFile(url, { maxBytes: AGENT_FILE_MAX_BYTES }));
    const name = filename ? `${filename.replace(/\.[a-z0-9]{1,5}$/i, '')}.${got.name.split('.').pop()}` : got.name;
    const file = await ctx.files.save({ name, mime: got.mime, bytes: got.bytes });
    return {
      result: { fileId: file.id, fileName: file.name, mime: file.mime, sizeBytes: file.size, url: got.finalUrl },
      display: { file, links: [{ title: file.name, url: got.finalUrl }], summary: 'Downloaded' },
    };
  },
});

export const WEB_TOOLS = [webSearch, webFetch, downloadFile];
/* The tools the Web switch turns on. */
export const WEB_TOOL_NAMES: ReadonlySet<string> = new Set(WEB_TOOLS.map((t) => t.name));
