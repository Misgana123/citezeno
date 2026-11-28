import { describe, expect, it } from 'vitest';
import { microsoftConnector } from '@/lib/providers/microsoft';
import { searchPhrase } from '@/lib/providers/microsoft/mail';
import { buildWith, cred, fakeVendor, ok } from './fake-http';

const ENV = { MICROSOFT_CLIENT_ID: 'mcid', MICROSOFT_CLIENT_SECRET: 'msecret' };
const GRAPH = 'graph.microsoft.com/v1.0';

describe('Microsoft 365 sign-in', () => {
  it('is off without its keys; asks for mail, calendar and files, never Mail.Send, with PKCE', () => {
    expect(microsoftConnector.create({}, ((t: unknown) => t) as never)).toBeNull();
    const c = buildWith(microsoftConnector, fakeVendor({}).doFetch, ENV);
    const s = c.auth.signIn;
    if (s?.type !== 'oauth2') throw new Error('expected oauth2');
    const u = new URL(s.authorizeUrl({ state: 'st', redirectUri: 'https://cz.test/api/connectors/microsoft/callback', codeChallenge: 'cc' }));
    expect(u.host).toBe('login.microsoftonline.com');
    expect(u.pathname).toBe('/common/oauth2/v2.0/authorize');
    const scope = u.searchParams.get('scope')!;
    expect(scope.split(' ')).toEqual(expect.arrayContaining(['offline_access', 'Mail.ReadWrite', 'Calendars.ReadWrite', 'Files.ReadWrite']));
    expect(scope).not.toContain('Mail.Send');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('trades the code, names the account, keeps a rotated refresh token', async () => {
    const f = fakeVendor({
      'POST login.microsoftonline.com/common/oauth2/v2.0/token': (s) => {
        const form = new URLSearchParams(String(s.body));
        return ok(form.get('grant_type') === 'refresh_token' ? { access_token: 'at2', refresh_token: 'rt2', expires_in: 3600 } : { access_token: 'at1', refresh_token: 'rt1', expires_in: 3600, scope: 'Mail.ReadWrite' });
      },
      [`GET ${GRAPH}/me`]: () => ok({ id: 'u1', displayName: 'Ada', mail: null, userPrincipalName: 'ada@uni.edu' }),
    });
    const s = buildWith(microsoftConnector, f.doFetch, ENV).auth.signIn;
    if (s?.type !== 'oauth2') throw new Error('expected oauth2');
    const c = await s.exchange({ code: 'code1', redirectUri: 'https://cz.test/cb', codeVerifier: 'v'.repeat(43) });
    expect(c).toMatchObject({ accessToken: 'at1', refreshToken: 'rt1', account: { id: 'u1', label: 'ada@uni.edu' } });
    expect(new URLSearchParams(String(f.seen[0].body)).get('code_verifier')).toBe('v'.repeat(43));
    expect((await s.refresh!(c)).refreshToken).toBe('rt2');
  });

  it('explains a university that only lets IT approve apps', () => {
    const s = buildWith(microsoftConnector, fakeVendor({}).doFetch, ENV).auth.signIn;
    if (s?.type !== 'oauth2') throw new Error('expected oauth2');
    expect(s.explainDenied!('access_denied', 'AADSTS65001: The user or administrator has not consented')).toContain('IT team');
    expect(s.explainDenied!('access_denied', 'The user canceled')).toBeNull();
  });
});

describe('Outlook mail', () => {
  it('searches with a quoted phrase, or lists the latest', async () => {
    const f = fakeVendor({ [`GET ${GRAPH}/me/messages`]: () => ok({ value: [{ id: 'm1', subject: 'Reviews', from: { emailAddress: { name: 'Ed', address: 'ed@j.org' } }, bodyPreview: ' hi ', hasAttachments: true }] }) });
    const mail = buildWith(microsoftConnector, f.doFetch, ENV).open(cred).mail!;
    expect(await mail.search({ query: 'reviewer "2"', limit: 5 })).toEqual([expect.objectContaining({ id: 'm1', from: { name: 'Ed', address: 'ed@j.org' }, preview: 'hi', hasAttachments: true })]);
    expect(f.seen[0].url.searchParams.get('$search')).toBe(searchPhrase('reviewer "2"'));
    expect(f.seen[0].url.searchParams.get('$orderby')).toBeNull();
    await mail.search({ limit: 5 });
    expect(f.seen[1].url.searchParams.get('$orderby')).toBe('receivedDateTime desc');
  });

  it('reads text and real attachments only; drafts, never sends', async () => {
    const f = fakeVendor({
      [`GET ${GRAPH}/me/messages/m1/attachments`]: () => ok({ value: [{ id: 'a1', name: 'paper.pdf', contentType: 'application/pdf', size: 9 }, { id: 'a2', name: 'logo.png', isInline: true }] }),
      [`GET ${GRAPH}/me/messages/m1`]: () => ok({ id: 'm1', subject: 'S', body: { content: 'Line\r\n\r\n\r\n\r\nNext' }, toRecipients: [{ emailAddress: { address: 'me@x.com' } }] }),
      [`POST ${GRAPH}/me/messages/m1/createReply`]: () => ok({ id: 'd2', webLink: 'https://outlook/d2' }),
      [`POST ${GRAPH}/me/messages`]: () => ok({ id: 'd1', webLink: 'https://outlook/d1' }),
    });
    const mail = buildWith(microsoftConnector, f.doFetch, ENV).open(cred).mail!;
    const m = await mail.read('m1', 1000);
    expect(m.text).toBe('Line\n\nNext');
    expect(m.attachments).toEqual([{ id: 'a1', name: 'paper.pdf', mime: 'application/pdf', sizeBytes: 9 }]);
    expect(await mail.draft({ to: ['a@b.org'], subject: 'Hi', text: 'Body' })).toEqual({ id: 'd1', url: 'https://outlook/d1' });
    expect(f.seen.find((s) => s.method === 'POST' && s.url.pathname.endsWith('/me/messages'))!.json()).toMatchObject({ subject: 'Hi', body: { contentType: 'Text', content: 'Body' }, toRecipients: [{ emailAddress: { address: 'a@b.org' } }] });
    expect(await mail.draft({ to: [], subject: '', text: 'Thanks!', replyTo: 'm1' })).toMatchObject({ id: 'd2' });
    expect(f.seen.some((s) => /\/send$/.test(s.url.pathname))).toBe(false);
  });
});

describe('Outlook calendar', () => {
  it('makes events in UTC from the user’s local time, with no attendees', async () => {
    const f = fakeVendor({ [`POST ${GRAPH}/me/events`]: (s) => ok({ id: 'e1', subject: s.json().subject, start: (s.json() as { start: { dateTime: string } }).start, end: (s.json() as { end: { dateTime: string } }).end }) });
    const cal = buildWith(microsoftConnector, f.doFetch, ENV).open(cred).calendar!;
    const e = await cal.create({ title: 'Write', start: '2026-12-01T09:00', end: '2026-12-01T10:30', timeZone: 'Europe/Berlin' });
    const body = f.seen[0].json() as { start: { dateTime: string; timeZone: string }; attendees?: unknown };
    expect(body.start).toEqual({ dateTime: '2026-12-01T08:00:00', timeZone: 'UTC' });
    expect(body.attendees).toBeUndefined();
    expect(e).toMatchObject({ start: '2026-12-01T08:00:00Z', end: '2026-12-01T09:30:00Z', allDay: false });
  });

  it('reads events and busy time (free ones aren’t busy); all-day ends on its last day', async () => {
    const f = fakeVendor({
      [`GET ${GRAPH}/me/calendarView`]: () =>
        ok({ value: [{ id: 'e1', subject: 'Lab', start: { dateTime: '2026-12-01T09:00:00.0000000' }, end: { dateTime: '2026-12-01T10:00:00.0000000' } }, { id: 'e2', subject: 'Holiday', isAllDay: true, showAs: 'free', start: { dateTime: '2026-12-24T00:00:00.0000000' }, end: { dateTime: '2026-12-27T00:00:00.0000000' } }] }),
    });
    const cal = buildWith(microsoftConnector, f.doFetch, ENV).open(cred).calendar!;
    const events = await cal.events({ from: '2026-12-01T00:00:00Z', to: '2026-12-31T00:00:00Z', limit: 10 });
    expect(events.map((e) => [e.title, e.start, e.end, e.allDay])).toEqual([
      ['Lab', '2026-12-01T09:00:00Z', '2026-12-01T10:00:00Z', false],
      ['Holiday', '2026-12-24', '2026-12-26', true],
    ]);
    expect(f.seen[0].headers.prefer).toBe('outlook.timezone="UTC"');
    expect(await cal.busy({ from: '2026-12-01T00:00:00Z', to: '2026-12-31T00:00:00Z' })).toEqual([{ start: '2026-12-01T09:00:00Z', end: '2026-12-01T10:00:00Z' }]);
  });
});

describe('OneDrive', () => {
  it('searches (quotes escaped), turns Word into PDF, uploads small and large files', async () => {
    const f = fakeVendor({
      [`GET ${GRAPH}/me/drive/root/search`]: () => ok({ value: [{ id: 'i1', name: 'Draft.docx', file: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } }] }),
      [`GET ${GRAPH}/me/drive/items/i1/content`]: () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { 'content-type': 'application/pdf' } }),
      [`GET ${GRAPH}/me/drive/items/i1`]: () => ok({ id: 'i1', name: 'Draft.docx', file: { mimeType: 'application/msword' } }),
      [`PUT ${GRAPH}/me/drive/root:/Citezeno/`]: () => ok({ id: 'n1', name: 'a.txt', webUrl: 'https://1drv/n1', file: { mimeType: 'text/plain' } }),
      [`POST ${GRAPH}/me/drive/root:/Citezeno/`]: () => ok({ uploadUrl: 'https://upload.1drv.test/session/1' }),
      'PUT upload.1drv.test/session/1': () => ok({ id: 'n2', name: 'big.pdf', file: { mimeType: 'application/pdf' } }),
    });
    const files = buildWith(microsoftConnector, f.doFetch, ENV).open(cred).files!;
    expect(await files.list({ query: "Ada's", limit: 5 })).toEqual([expect.objectContaining({ id: 'i1', kind: 'other' })]);
    expect(decodeURIComponent(f.seen[0].url.pathname)).toContain("search(q='Ada''s')");
    const pdf = await files.download('i1', { maxBytes: 1000, as: 'pdf' });
    expect(pdf).toMatchObject({ name: 'Draft.pdf', mime: 'application/pdf' });
    expect(f.seen.find((s) => s.url.pathname.endsWith('/content'))!.url.searchParams.get('format')).toBe('pdf');

    expect(await files.upload({ name: 'a/b.txt', mime: 'text/plain', bytes: new Uint8Array([1]) })).toMatchObject({ id: 'n1', url: 'https://1drv/n1' });
    expect(decodeURIComponent(f.seen.at(-1)!.url.pathname)).toContain('/Citezeno/a_b.txt:/content');
    await files.upload({ name: 'big.pdf', mime: 'application/pdf', bytes: new Uint8Array(5 * 1024 * 1024) });
    const put = f.seen.at(-1)!;
    expect(put.url.host).toBe('upload.1drv.test');
    expect(put.headers.authorization).toBeUndefined();
    expect(put.headers['content-range']).toBe(`bytes 0-${5 * 1024 * 1024 - 1}/${5 * 1024 * 1024}`);
  });
});
