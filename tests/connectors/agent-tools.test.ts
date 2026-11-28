import { describe, expect, it } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { connectorsContext } from '@/lib/agent/prompt';
import { offeredTools } from '@/lib/agent/tools';
import { CONNECTOR_TOOLS } from '@/lib/agent/tools/connectors';
import { pageBlocks } from '@/lib/agent/tools/connectors/notes';
import { runTool } from '@/lib/agent/tools/run';
import { ProviderError } from '@/lib/providers/errors';
import type { Capabilities, Capability, CloudFiles, NotesPages } from '@/lib/providers/connectors/types';

/* A reply's context with only what the connected-app tools use. */
function ctxWith(apis: Partial<Capabilities>, labels: Partial<Record<Capability, string>> = {}) {
  const saved: { name: string; mime: string; bytes: Uint8Array }[] = [];
  const connected = new Map(Object.keys(apis).map((cap) => [cap as Capability, { name: cap, label: labels[cap as Capability] ?? 'Google Drive' }]));
  const ctx = {
    userId: 'u1',
    pdfText: () => ({ name: 'basic', read: async () => ({ text: 'PDF words', pageCount: 1, title: null, doi: null }) }),
    files: {
      save: async (f: { name: string; mime: string; bytes: Uint8Array }) => {
        saved.push(f);
        return { id: `file${saved.length}`, name: f.name, mime: f.mime, size: f.bytes.byteLength };
      },
      read: async (id: string) => (id === 'mine' ? { file: { id, name: 'Report.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 3 }, bytes: new Uint8Array([1, 2, 3]) } : null),
    },
    connectors: { connected, open: async (cap: Capability) => ({ api: apis[cap], connector: cap, label: connected.get(cap)!.label }) },
  } as unknown as AgentContext;
  return { ctx, saved };
}

const file = (id: string, kind: 'document' | 'pdf' | 'other' | 'folder', name: string, mime: string) => ({ id, name, mime, kind, sizeBytes: 3, modifiedAt: null, url: `https://drive/${id}` });

describe('offering connected-app tools', () => {
  it('every connector tool says which capability it needs', () => {
    expect(CONNECTOR_TOOLS.length).toBe(36);
    for (const t of CONNECTOR_TOOLS) expect(t.needs, t.name).toBeTruthy();
  });

  it('offers them only while an app giving them is connected', () => {
    const none = offeredTools({ web: false }).map((t) => t.name);
    expect(none.some((n) => CONNECTOR_TOOLS.some((t) => t.name === n))).toBe(false);
    const some = offeredTools({ web: false, connected: new Set<Capability>(['references']) }).map((t) => t.name);
    expect(some).toContain('ref_library_import');
    expect(some).not.toContain('cloud_file_read');
    expect(some).toContain('search_papers');
  });

  it('tells the assistant what is connected, or where to connect', () => {
    expect(connectorsContext(new Map([['files', { label: 'Google Drive' }], ['sheets', { label: 'Google Drive' }], ['references', { label: 'Zotero' }]]))).toContain('Google Drive (files, sheets); Zotero (references)');
    const two = connectorsContext(new Map([['calendar', [{ label: 'Google Calendar', name: 'google-calendar' }, { label: 'Microsoft 365', name: 'microsoft' }]]]));
    expect(two).toContain('Google Calendar (id "google-calendar": calendar); Microsoft 365 (id "microsoft": calendar)');
    expect(two).toContain('Pass `app`');
    expect(connectorsContext(undefined)).toContain('Settings → Customize → Connectors');
  });
});

describe('connected-app tools', () => {
  const files: CloudFiles = {
    list: async () => [file('d1', 'document', 'Notes', 'application/vnd.google-apps.document')],
    get: async (id) =>
      ({ d1: file('d1', 'document', 'Notes', 'application/vnd.google-apps.document'), p1: file('p1', 'pdf', 'paper.pdf', 'application/pdf'), x1: file('x1', 'other', 'data.xlsx', 'application/vnd.ms-excel'), f1: file('f1', 'folder', 'Dir', 'x') })[id]!,
    download: async (id, o) => (id === 'd1' ? { name: 'Notes.txt', mime: 'text/plain', bytes: new TextEncoder().encode(`as=${o.as}: hello`) } : { name: id, mime: 'application/octet-stream', bytes: new Uint8Array([1]) }),
    upload: async (f) => ({ ...file('n1', 'document', f.name, f.mime), url: 'https://docs/n1' }),
  };

  it('reads a Google Doc as text, a PDF through the PDF reader, and keeps other files in the chat', async () => {
    const { ctx, saved } = ctxWith({ files });
    const doc = await runTool(ctx, 'cloud_file_read', { fileId: 'd1' });
    expect(doc.outcome).toMatchObject({ status: 'done', output: { result: { name: 'Notes', text: 'as=text: hello' } } });
    const pdf = await runTool(ctx, 'cloud_file_read', { fileId: 'p1' });
    expect(pdf.outcome).toMatchObject({ status: 'done', output: { result: { text: 'PDF words' } } });
    const other = await runTool(ctx, 'cloud_file_read', { fileId: 'x1' });
    expect(other.outcome).toMatchObject({ status: 'done', output: { result: { fileId: 'file1', fileName: 'x1' } } });
    expect(saved).toHaveLength(1);
    expect((await runTool(ctx, 'cloud_file_read', { fileId: 'f1' })).outcome).toMatchObject({ status: 'error', code: 'bad_request' });
  });

  it('asks before saving to Drive, naming the file and the app', async () => {
    const { ctx } = ctxWith({ files });
    expect((await runTool(ctx, 'cloud_file_save', { fileId: 'mine', convert: true })).outcome).toEqual({ status: 'needs_confirmation', question: 'Save “Report.docx” to your Google Drive?' });
    expect((await runTool(ctx, 'cloud_file_save', { fileId: 'mine', convert: true }, { confirmed: true })).outcome).toMatchObject({ status: 'done', output: { result: { url: 'https://docs/n1', app: 'Google Drive' } } });
    expect((await runTool(ctx, 'cloud_file_save', { fileId: 'gone' }, { confirmed: true })).outcome).toMatchObject({ status: 'error', code: 'not_found' });
  });

  it('says plainly when the app isn’t connected, or what the app refused', async () => {
    const { ctx } = ctxWith({});
    expect((await runTool(ctx, 'cloud_files_list', {})).outcome).toMatchObject({ status: 'error', code: 'not_connected', message: expect.stringContaining('Customize → Connectors') });
    const refusing = ctxWith({ pages: { search: async () => Promise.reject(new ProviderError('not_found', 'Notion couldn’t find that, or it isn’t shared with Citezeno.', { provider: 'notion' })) } as unknown as NotesPages }, { pages: 'Notion' });
    expect((await runTool(refusing.ctx, 'notes_search', {})).outcome).toMatchObject({ status: 'error', code: 'not_found', message: 'Notion couldn’t find that, or it isn’t shared with Citezeno.' });
  });

  it('makes a Notion page from document blocks', async () => {
    const made: unknown[] = [];
    const pages = { create: async (f: unknown) => (made.push(f), { id: 'p', title: 'Review', kind: 'page', url: 'https://notion/p', editedAt: null }) } as unknown as NotesPages;
    const { ctx } = ctxWith({ pages }, { pages: 'Notion' });
    const input = { parentId: '1234567890abcdef1234567890abcdef', title: 'Review', blocks: [{ type: 'heading', text: 'Aims' }, { type: 'references', items: ['A. (2020) X.'] }] };
    expect((await runTool(ctx, 'notes_create_page', input)).outcome).toEqual({ status: 'needs_confirmation', question: 'Make a page “Review” in Notion?' });
    expect((await runTool(ctx, 'notes_create_page', input, { confirmed: true })).outcome).toMatchObject({ status: 'done' });
    expect(made[0]).toMatchObject({ blocks: [{ type: 'heading', level: 1, text: 'Aims' }, { type: 'heading', level: 2, text: 'References' }, { type: 'numbered', items: ['A. (2020) X.'] }] });
  });

  it('maps every document block to page content', () => {
    expect(pageBlocks([{ type: 'page_break' }, { type: 'image', fileId: 'x' }, { type: 'table', headers: ['a'], rows: [['1']] }])).toEqual([{ type: 'divider' }, { type: 'table', headers: ['a'], rows: [['1']] }]);
  });
});
