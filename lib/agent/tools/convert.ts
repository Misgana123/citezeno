import { z } from 'zod';
import { ShelfError } from '@/lib/shelf/errors';
import type { AgentContext } from '../context';
import { mimeFor } from './code';
import { defineTool } from './types';

/* Converting a file to another format. Markdown and plain text become Word or
   PDF on our server (the document builders). Office files go through
   LibreOffice or pandoc in the chat's sandbox, which needs the office template
   (e2b/citezeno-office.Dockerfile, E2B_TEMPLATE). */

export const CONVERT_TO = ['pdf', 'docx', 'odt', 'xlsx', 'csv', 'pptx', 'html', 'md', 'txt'] as const;
type Target = (typeof CONVERT_TO)[number];

/* What LibreOffice reads, and what each family can become. */
const FAMILY: Record<string, 'text' | 'sheet' | 'slides'> = {
  docx: 'text',
  doc: 'text',
  odt: 'text',
  rtf: 'text',
  html: 'text',
  htm: 'text',
  md: 'text',
  txt: 'text',
  xlsx: 'sheet',
  xls: 'sheet',
  ods: 'sheet',
  csv: 'sheet',
  pptx: 'slides',
  ppt: 'slides',
  odp: 'slides',
};
const TARGETS: Record<'text' | 'sheet' | 'slides', Target[]> = { text: ['pdf', 'docx', 'odt', 'html', 'md', 'txt'], sheet: ['pdf', 'xlsx', 'csv', 'html'], slides: ['pdf', 'pptx'] };
const CONVERT_TIMEOUT_S = 35;
const MISSING = 'CITEZENO_MISSING_TOOL';

type Source = { name: string; ext: string; bytes: Uint8Array; /* the text the user's browser read out of an attached file */ textOnly: boolean };

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
const stem = (name: string) => name.replace(/\.[^.]*$/, '') || 'file';

async function load(ctx: AgentContext, r: { fileId?: string; pdfId?: string; attachment?: string }): Promise<Source> {
  if (r.fileId) {
    const got = await ctx.files.read(r.fileId);
    if (!got) throw new ShelfError('not_found', `There is no file with fileId "${r.fileId}" in this chat.`);
    return { name: got.file.name, ext: extOf(got.file.name), bytes: got.bytes, textOnly: false };
  }
  if (r.pdfId) throw new ShelfError('bad_request', 'PDFs can’t be converted to other formats. Use pdf_extract_text to read one.');
  const hit = (await ctx.chatAttachments()).findLast((a) => a.name === r.attachment);
  if (!hit) throw new ShelfError('not_found', `No file called "${r.attachment}" was attached to this chat.`);
  if (hit.kind === 'image') throw new ShelfError('bad_request', 'Pictures are converted with edit_image.');
  return { name: hit.name, ext: extOf(hit.name), bytes: new TextEncoder().encode(hit.text), textOnly: true };
}

/* The Python the sandbox runs: LibreOffice or pandoc on fixed paths, with the settings passed as data. */
export function conversionCode(p: { src: string; out: string; tool: 'soffice' | 'pandoc'; filter: string; timeout: number }): string {
  const data = Buffer.from(JSON.stringify(p)).toString('base64');
  return `import base64, json, os, shutil, subprocess
p = json.loads(base64.b64decode('${data}').decode())
src = os.path.join('/home/user', p['src'])
out = os.path.join('/home/user', p['out'])
os.makedirs(os.path.dirname(out), exist_ok=True)
if shutil.which(p['tool']) is None:
    print('${MISSING}')
else:
    if p['tool'] == 'soffice':
        cmd = ['soffice', '--headless', '--norestore', '--convert-to', p['filter'], '--outdir', os.path.dirname(out), src]
    else:
        cmd = ['pandoc', src, '-t', p['filter'], '-o', out]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=p['timeout'])
    print('exit', r.returncode)
    print(r.stderr[-1500:])
`;
}

export const convertFile = defineTool({
  name: 'convert_file',
  description:
    'Convert a file to another format: Markdown or text to Word or PDF; Word, OpenDocument, RTF or HTML to PDF, Word, ODT, HTML, Markdown or text; spreadsheets to PDF, Excel, CSV or HTML; slides to PDF or PowerPoint. The file is one made in this chat (fileId) or attached by the user (attachment; for attached office files only their text arrived, so they convert as text). Pictures: use edit_image. PDFs can’t be converted.',
  input: z
    .object({ fileId: z.string().min(1).max(80).optional(), attachment: z.string().min(1).max(200).optional(), pdfId: z.string().min(1).max(80).optional(), to: z.enum(CONVERT_TO) })
    .refine((r) => [r.fileId, r.attachment, r.pdfId].filter(Boolean).length === 1, 'Give one of fileId or attachment.'),
  kind: 'write',
  step: 'make',
  label: (i) => `Converting ${i.attachment ?? 'a file'} to ${i.to.toUpperCase()}`,
  done: (i) => ({ did: `Converted ${i.attachment ?? 'a file'}`, about: `to ${i.to.toUpperCase()}` }),
  async run(ctx, i) {
    const src = await load(ctx, i);
    const family = src.textOnly ? 'text' : FAMILY[src.ext];
    if (!family) throw new ShelfError('bad_request', `"${src.name}" isn’t a file type that can be converted.`);
    if (!TARGETS[family].includes(i.to)) throw new ShelfError('bad_request', `"${src.name}" can become ${TARGETS[family].map((t) => t.toUpperCase()).join(', ')}, not ${i.to.toUpperCase()}.`);
    if (!src.textOnly && src.ext === i.to) throw new ShelfError('bad_request', `"${src.name}" is already ${i.to.toUpperCase()}.`);
    const name = `${stem(src.name)}.${i.to}`;

    // text and Markdown into Word or PDF: on our server, no sandbox needed
    if ((src.textOnly || src.ext === 'md' || src.ext === 'txt') && (i.to === 'docx' || i.to === 'pdf')) {
      const { markdownBlocks } = await import('../documents/markdown');
      const blocks = markdownBlocks(new TextDecoder().decode(src.bytes));
      const bytes =
        i.to === 'docx' ? await (await import('../documents/docx')).buildDocx({ blocks, pictures: new Map() }) : await (await import('../documents/pdf')).buildPdf({ blocks, pictures: new Map() });
      const file = await ctx.files.save({ name, mime: mimeFor(name), bytes });
      return {
        result: {
          fileId: file.id,
          fileName: file.name,
          ...(src.textOnly && src.ext !== 'md' && src.ext !== 'txt' ? { note: 'Converted from the file’s text; its original layout wasn’t available.' } : {}),
        },
        display: { file, summary: `${i.to.toUpperCase()} ready` },
      };
    }

    const runner = ctx.code();
    if (!runner) throw new ShelfError('unavailable', ctx.limits && !ctx.limits.codeSandbox ? `Converting ${src.ext.toUpperCase()} files uses the code sandbox, which comes with the Lab plan (see /pricing). Text and Markdown files convert on every plan.` : 'Converting this kind of file isn’t set up yet.');
    const inExt = src.textOnly ? 'txt' : src.ext;
    const usePandoc = i.to === 'md' || i.to === 'txt';
    const out = `convert/out/source.${i.to}`;
    const code = conversionCode({
      src: `convert/in/source.${inExt}`,
      out,
      tool: usePandoc ? 'pandoc' : 'soffice',
      filter: usePandoc ? (i.to === 'md' ? 'gfm' : 'plain') : i.to,
      timeout: CONVERT_TIMEOUT_S,
    });
    const run = await runner.run({ code, upload: [{ path: `convert/in/source.${inExt}`, bytes: src.bytes }], download: [out], timeoutMs: (CONVERT_TIMEOUT_S + 5) * 1000 });
    if (run.stdout.includes(MISSING)) throw new ShelfError('unavailable', 'Converting office files needs the sandbox template with LibreOffice (E2B_TEMPLATE); it isn’t set up yet.');
    const made = run.files[0];
    if (run.error || !made?.bytes.byteLength) throw new ShelfError('invalid_file', `"${src.name}" couldn’t be converted to ${i.to.toUpperCase()}.`);
    const file = await ctx.files.save({ name, mime: mimeFor(name), bytes: made.bytes });
    return { result: { fileId: file.id, fileName: file.name }, display: { file, summary: `${i.to.toUpperCase()} ready` } };
  },
});

export const CONVERT_TOOLS = [convertFile];
