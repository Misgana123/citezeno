import { z } from 'zod';
import type { SandboxFile } from '@/lib/providers/code-sandbox/types';
import { ShelfError } from '@/lib/shelf/errors';
import type { AgentContext } from '../context';
import type { AgentFileRef } from '../files';
import { defineTool } from './types';

/* Running Python the assistant writes, in the chat's sandbox (an isolated
   machine with no keys and no access to our servers). For analysis and custom
   work the other tools can't do: statistics on an attached CSV, unusual
   conversions, checking numbers. Files go in only when asked for, and come
   back as files of the chat. */

const CODE_MAX = 20_000;
const TIMEOUT_DEFAULT_S = 30;
/* A chat reply has about 50 seconds; a run must fit inside it. */
const TIMEOUT_MAX_S = 40;
const PLOTS_MAX = 5;
const OUT_TO_MODEL = 8000;

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export const mimeFor = (path: string) => MIME_BY_EXT[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

const inputRef = z
  .object({
    fileId: z.string().min(1).max(80).optional().describe('A file the assistant made in this chat.'),
    pdfId: z.string().min(1).max(80).optional().describe('A PDF on the user’s shelf.'),
    attachment: z.string().min(1).max(200).optional().describe('A file the user attached to this chat, by its name.'),
  })
  .refine((r) => [r.fileId, r.pdfId, r.attachment].filter(Boolean).length === 1, 'Give one of fileId, pdfId or attachment.');
type InputRef = z.infer<typeof inputRef>;

/* A plain file name for the sandbox ("../x/data (1).csv" → "data (1).csv"). */
const baseName = (name: string) =>
  name
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f]/g, '')
    .trim() || 'file';

async function gather(ctx: AgentContext, refs: InputRef[]): Promise<SandboxFile[]> {
  const out: SandboxFile[] = [];
  const used = new Set<string>();
  const add = (name: string, bytes: Uint8Array) => {
    let path = baseName(name);
    for (let n = 2; used.has(path); n++) path = baseName(name).replace(/(\.[^.]*)?$/, ` (${n})$1`);
    used.add(path);
    out.push({ path, bytes });
  };
  const attachments = refs.some((r) => r.attachment) ? await ctx.chatAttachments() : [];
  for (const r of refs) {
    if (r.fileId) {
      const got = await ctx.files.read(r.fileId);
      if (!got) throw new ShelfError('not_found', `There is no file with fileId "${r.fileId}" in this chat.`);
      add(got.file.name, got.bytes);
    } else if (r.pdfId) {
      const got = await ctx.files.readShelfPdf(r.pdfId);
      if (!got) throw new ShelfError('not_found', `There is no PDF with pdfId "${r.pdfId}" on your shelf.`);
      add(got.fileName, got.bytes);
    } else {
      const hit = attachments.findLast((a) => a.name === r.attachment);
      if (!hit) throw new ShelfError('not_found', `No file called "${r.attachment}" was attached to this chat.`);
      // a picture's bytes; for other files, the text the user's browser read out of them
      add(hit.name, hit.kind === 'image' ? Uint8Array.from(Buffer.from(hit.data, 'base64')) : new TextEncoder().encode(hit.text));
    }
  }
  return out;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n… [cut]` : s);

export const runPython = defineTool({
  name: 'run_python',
  description: `Run Python 3 in this chat's sandbox (pandas, numpy, matplotlib and other common packages; it has internet access for pip). Variables and files stay between runs in the same chat for a few idle minutes. Use it only when the other tools can't do the job: analysing an attached CSV, statistics, unusual file work. Put files in with inputs (they appear in the working folder by name) and list the files to keep in downloads (paths in the working folder). Shown plots are kept as pictures. Each run may take at most ${TIMEOUT_MAX_S} seconds.`,
  input: z.object({
    code: z.string().min(1).max(CODE_MAX),
    inputs: z.array(inputRef).max(10).optional(),
    downloads: z.array(z.string().trim().min(1).max(200)).max(10).optional().describe('Files the code makes that the user should get, e.g. ["results.csv"].'),
    timeoutSeconds: z.number().int().min(5).max(TIMEOUT_MAX_S).optional(),
  }),
  kind: 'write',
  step: 'code',
  label: () => 'Running Python',
  done: () => ({ did: 'Ran Python' }),
  async run(ctx, i) {
    const runner = ctx.code();
    if (!runner) throw new ShelfError('unavailable', 'Running code isn’t set up yet.');
    const upload = await gather(ctx, i.inputs ?? []);
    const out = await runner.run({ code: i.code, upload, download: i.downloads ?? [], timeoutMs: (i.timeoutSeconds ?? TIMEOUT_DEFAULT_S) * 1000 });

    const saved: AgentFileRef[] = [];
    for (const [n, o] of out.outputs
      .filter((x) => x.mime !== 'text/plain')
      .slice(0, PLOTS_MAX)
      .entries()) {
      const bytes = o.mime === 'image/svg+xml' ? new TextEncoder().encode(o.data) : Uint8Array.from(Buffer.from(o.data, 'base64'));
      saved.push(await ctx.files.save({ name: `plot ${n + 1}`, mime: o.mime, bytes }));
    }
    for (const f of out.files) saved.push(await ctx.files.save({ name: baseName(f.path), mime: mimeFor(f.path), bytes: f.bytes }));

    const texts = out.outputs.filter((x) => x.mime === 'text/plain').map((x) => x.data);
    const shown = [out.stdout, ...texts, out.stderr, out.error ? `${out.error.name}: ${out.error.message}` : ''].filter(Boolean).join('\n').trim();
    return {
      result: {
        ...(out.newSession ? { newSession: true, note: 'This run started a fresh sandbox: earlier variables and files are gone.' } : {}),
        ...(upload.length ? { inputFiles: upload.map((f) => f.path) } : {}),
        stdout: clip(out.stdout, OUT_TO_MODEL),
        ...(texts.length ? { results: texts.map((t) => clip(t, 2000)) } : {}),
        ...(out.stderr ? { stderr: clip(out.stderr, 3000) } : {}),
        ...(out.error ? { error: { name: out.error.name, message: out.error.message, traceback: clip(out.error.traceback, 3000) } } : {}),
        ...(saved.length ? { savedFiles: saved.map((f) => ({ fileId: f.id, fileName: f.name })) } : {}),
        ...(out.missing.length ? { notFound: out.missing } : {}),
      },
      display: {
        code: { language: 'python', source: i.code, output: clip(shown, 6000), ...(out.error ? { failed: true } : {}) },
        ...(saved.length ? { files: saved } : {}),
        summary: out.error ? `Error: ${out.error.name}` : saved.length ? `${saved.length} file${saved.length === 1 ? '' : 's'}` : 'Done',
      },
    };
  },
});

export const CODE_TOOLS = [runPython];
