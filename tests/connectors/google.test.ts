import { describe, expect, it } from 'vitest';
import { connectorTransport } from '@/lib/providers/connectors/http';
import { googleConnector, googleClient } from '@/lib/providers/google-workspace';
import { exportMime, driveQuoted, toCloudFile } from '@/lib/providers/google-workspace/drive';
import { a1 } from '@/lib/providers/google-workspace/sheets';
import type { Gate } from '@/lib/providers/types';

type Seen = { url: URL; method: string; headers: Record<string, string>; body: unknown };

/* A pretend Google: answers by path, records every call. */
function fakeGoogle(answers: Record<string, (s: Seen) => Response>) {
  const seen: Seen[] = [];
  const doFetch = (async (u: string, init: RequestInit) => {
    const s: Seen = { url: new URL(u), method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body };
    seen.push(s);
    const key = Object.keys(answers).find((k) => `${s.method} ${s.url.host}${s.url.pathname}`.startsWith(k));
    return key ? answers[key](s) : new Response('{"error":{"message":"no route"}}', { status: 404 });
  }) as unknown as typeof fetch;
  return { seen, doFetch };
}

/* The connector, its transport using the fake fetch instead of the gateway. */
function build(doFetch: typeof fetch, env: Record<string, string> = {}) {
  const gate: Gate = (_t, policy) => connectorTransport({ provider: policy.provider, label: policy.label, fetch: doFetch }) as never;
  return googleConnector.create({ GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', ...env }, gate)!;
}

const cred = { accessToken: 'at', account: { id: 'p1', label: 'me@x.com' } };

describe('Google connector set-up', () => {
  it('reuses the sign-in client unless its own is set; off without one', () => {
    expect(googleClient({})).toBeNull();
    expect(googleClient({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' })).toEqual({ clientId: 'a', clientSecret: 'b' });
    expect(googleClient({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', GOOGLE_CONNECTOR_CLIENT_ID: 'c', GOOGLE_CONNECTOR_CLIENT_SECRET: 'd' })).toEqual({ clientId: 'c', clientSecret: 'd' });
    expect(googleConnector.create({}, ((t: unknown) => t) as never)).toBeNull();
  });

  it('asks only for drive.file, offline, with PKCE', () => {
    const c = build(fakeGoogle({}).doFetch);
    const signIn = c.auth.signIn;
    if (signIn?.type !== 'oauth2') throw new Error('expected oauth2');
    const u = new URL(signIn.authorizeUrl({ state: 's1', redirectUri: 'https://cz.test/api/connectors/google/callback', codeChallenge: 'cc' }));
    expect(u.host).toBe('accounts.google.com');
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('state')).toBe('s1');
  });

  it('trades the code for tokens and names the account from Drive', async () => {
    const g = fakeGoogle({
      'POST oauth2.googleapis.com/token': () => Response.json({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' }),
      'GET www.googleapis.com/drive/v3/about': () => Response.json({ user: { emailAddress: 'me@x.com', permissionId: 'p1' } }),
    });
    const signIn = build(g.doFetch).auth.signIn;
    if (signIn?.type !== 'oauth2') throw new Error('expected oauth2');
    const c = await signIn.exchange({ code: 'CODE', redirectUri: 'https://cz.test/cb', codeVerifier: 'VER' });
    expect(c).toMatchObject({ accessToken: 'AT', refreshToken: 'RT', account: { id: 'p1', label: 'me@x.com' } });
    expect(c.expiresAt).toBeGreaterThan(Date.now());
    expect(String(g.seen[0].body)).toContain('code_verifier=VER');
    expect(g.seen[1].headers.authorization).toBe('Bearer AT');
  });

  it('gives the picker only when its keys are set', () => {
    expect(build(fakeGoogle({}).doFetch).picker!(cred)).toBeNull();
    expect(build(fakeGoogle({}).doFetch, { GOOGLE_PICKER_API_KEY: 'k', GOOGLE_CLOUD_PROJECT_NUMBER: '123' }).picker!(cred)).toMatchObject({ type: 'google-picker', apiKey: 'k', appId: '123', accessToken: 'at' });
  });
});

describe('Drive', () => {
  it('lists visible files newest first, searching by name safely', async () => {
    const g = fakeGoogle({ 'GET www.googleapis.com/drive/v3/files': () => Response.json({ files: [{ id: 'f1', name: 'a.pdf', mimeType: 'application/pdf', size: '120', webViewLink: 'https://drive/f1' }] }) });
    const files = await build(g.doFetch).open(cred).files!.list({ query: "it's", limit: 5 });
    expect(files).toEqual([{ id: 'f1', name: 'a.pdf', mime: 'application/pdf', kind: 'pdf', sizeBytes: 120, modifiedAt: null, url: 'https://drive/f1' }]);
    expect(g.seen[0].url.searchParams.get('q')).toBe("trashed = false and mimeType != 'application/vnd.google-apps.folder' and name contains 'it\\'s'");
    expect(g.seen[0].url.searchParams.get('orderBy')).toBe('modifiedTime desc');
  });

  it('exports Google documents and downloads other files', async () => {
    const g = fakeGoogle({
      'GET www.googleapis.com/drive/v3/files/doc1/export': () => new Response('hello', { headers: { 'content-type': 'text/plain' } }),
      'GET www.googleapis.com/drive/v3/files/doc1': () => Response.json({ id: 'doc1', name: 'Notes', mimeType: 'application/vnd.google-apps.document' }),
      'GET www.googleapis.com/drive/v3/files/pdf1': (s) => (s.url.searchParams.get('alt') === 'media' ? new Response(new Uint8Array([37, 80, 68, 70])) : Response.json({ id: 'pdf1', name: 'p.pdf', mimeType: 'application/pdf', size: '4' })),
    });
    const files = build(g.doFetch).open(cred).files!;
    const doc = await files.download('doc1', { maxBytes: 1000, as: 'text' });
    expect(doc).toMatchObject({ name: 'Notes.txt', mime: 'text/plain' });
    expect(new TextDecoder().decode(doc.bytes)).toBe('hello');
    expect(g.seen.find((s) => s.url.pathname.endsWith('/export'))!.url.searchParams.get('mimeType')).toBe('text/plain');
    const pdf = await files.download('pdf1', { maxBytes: 1000 });
    expect(pdf.bytes).toEqual(new Uint8Array([37, 80, 68, 70]));
    await expect(files.download('pdf1', { maxBytes: 2 })).rejects.toMatchObject({ details: { reason: 'too_large' } });
  });

  it('uploads with conversion to a Google Doc', async () => {
    const g = fakeGoogle({ 'POST www.googleapis.com/upload/drive/v3/files': () => Response.json({ id: 'new1', name: 'Report', mimeType: 'application/vnd.google-apps.document', webViewLink: 'https://docs/new1' }) });
    const docs = build(g.doFetch).open(cred).documents!;
    const f = await docs.createFromDocx({ title: 'Report', bytes: new Uint8Array([80, 75, 3, 4]) });
    expect(f).toMatchObject({ id: 'new1', kind: 'document', url: 'https://docs/new1' });
    const s = g.seen[0];
    expect(s.url.searchParams.get('uploadType')).toBe('multipart');
    expect(s.headers['content-type']).toMatch(/^multipart\/related; boundary=/);
    const text = new TextDecoder().decode(s.body as Uint8Array);
    expect(text).toContain('"mimeType":"application/vnd.google-apps.document"');
    expect(text).toContain('"name":"Report"');
  });

  it('maps kinds and export types', () => {
    expect(toCloudFile({ id: 'x', mimeType: 'application/vnd.google-apps.spreadsheet' }).kind).toBe('spreadsheet');
    expect(exportMime('application/vnd.google-apps.spreadsheet', 'text')).toEqual({ mime: 'text/csv', ext: 'csv' });
    expect(exportMime('application/vnd.google-apps.document', 'office').ext).toBe('docx');
    expect(driveQuoted('a\\b')).toBe("'a\\\\b'");
  });
});

describe('Sheets', () => {
  const meta = () => Response.json({ spreadsheetId: 's1', spreadsheetUrl: 'https://sheets/s1', properties: { title: 'Data' }, sheets: [{ properties: { title: 'Main' } }, { properties: { title: "Bob's" } }] });

  it('reads a range from the first sheet by default', async () => {
    const g = fakeGoogle({
      'GET sheets.googleapis.com/v4/spreadsheets/s1/values/': () => Response.json({ range: "'Main'!A1:B2", values: [['a', 1], ['b']] }),
      'GET sheets.googleapis.com/v4/spreadsheets/s1': meta,
    });
    const r = await build(g.doFetch).open(cred).sheets!.read('s1', { maxRows: 10 });
    expect(r).toEqual({ title: 'Data', sheets: ['Main', "Bob's"], range: "'Main'!A1:B2", rows: [['a', '1'], ['b']], url: 'https://sheets/s1' });
  });

  it('appends rows RAW (no formulas run) and refuses an unknown sheet', async () => {
    const g = fakeGoogle({
      'POST sheets.googleapis.com/v4/spreadsheets/s1/values/': () => Response.json({ updates: { updatedRows: 2 } }),
      'GET sheets.googleapis.com/v4/spreadsheets/s1': meta,
    });
    const sheets = build(g.doFetch).open(cred).sheets!;
    expect(await sheets.append('s1', [['=HYPERLINK("x")', 2], [null, true]], { sheet: "Bob's" })).toEqual({ appended: 2, url: 'https://sheets/s1' });
    const post = g.seen.find((s) => s.method === 'POST')!;
    expect(decodeURIComponent(post.url.pathname)).toContain("'Bob''s':append");
    expect(post.url.searchParams.get('valueInputOption')).toBe('RAW');
    expect(JSON.parse(String(post.body)).values).toEqual([['=HYPERLINK("x")', 2], ['', true]]);
    await expect(sheets.append('s1', [['x']], { sheet: 'Nope' })).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('creates a spreadsheet with typed cells', async () => {
    const g = fakeGoogle({ 'POST sheets.googleapis.com/v4/spreadsheets': () => Response.json({ spreadsheetId: 'n1', spreadsheetUrl: 'https://sheets/n1', properties: { title: 'Papers' } }) });
    const f = await build(g.doFetch).open(cred).sheets!.create({ title: 'Papers', sheets: [{ name: 'Papers', rows: [['Title', 'Year'], ['A', 2020]] }] });
    expect(f).toMatchObject({ id: 'n1', kind: 'spreadsheet', url: 'https://sheets/n1' });
    const body = JSON.parse(String(g.seen[0].body));
    expect(body.sheets[0].data[0].rowData[1].values).toEqual([{ userEnteredValue: { stringValue: 'A' } }, { userEnteredValue: { numberValue: 2020 } }]);
    expect(a1("O'Neil", 'A1:B')).toBe("'O''Neil'!A1:B");
  });
});
