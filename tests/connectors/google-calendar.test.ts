import { describe, expect, it } from 'vitest';
import { freeSlots, zonedToUtc } from '@/lib/providers/connectors/time';
import { CALENDAR_SCOPES, googleCalendarConnector } from '@/lib/providers/google-calendar';
import { buildWith, cred, fakeVendor, ok } from './fake-http';

const ENV = { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'cs' };
const CAL = 'www.googleapis.com/calendar/v3';

describe('Google Calendar', () => {
  it('has its own sign-in, sharing Drive’s grant group, with calendar scopes only', () => {
    expect(googleCalendarConnector.grantGroup).toBe('google');
    const s = buildWith(googleCalendarConnector, fakeVendor({}).doFetch, ENV).auth.signIn;
    if (s?.type !== 'oauth2') throw new Error('expected oauth2');
    const u = new URL(s.authorizeUrl({ state: 's', redirectUri: 'https://cz.test/api/connectors/google-calendar/callback', codeChallenge: 'c' }));
    expect(u.searchParams.get('scope')).toBe(CALENDAR_SCOPES.join(' '));
    expect(u.searchParams.get('scope')).not.toContain('drive');
  });

  it('names the account from the primary calendar', async () => {
    const f = fakeVendor({
      'POST oauth2.googleapis.com/token': () => ok({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
      [`GET ${CAL}/users/me/calendarList`]: () => ok({ items: [{ id: 'team@x', primary: false }, { id: 'me@x.com', primary: true }] }),
    });
    const s = buildWith(googleCalendarConnector, f.doFetch, ENV).auth.signIn;
    if (s?.type !== 'oauth2') throw new Error('expected oauth2');
    expect((await s.exchange({ code: 'c', redirectUri: 'r', codeVerifier: 'v'.repeat(43) })).account).toEqual({ id: 'me@x.com', label: 'me@x.com' });
  });

  it('adds events in the user’s time zone without emailing anyone; all-day end is exclusive at Google', async () => {
    const f = fakeVendor({ [`POST ${CAL}/calendars/primary/events`]: (s) => ok({ id: 'e1', summary: 'Deadline', ...(s.json() as object) }) });
    const cal = buildWith(googleCalendarConnector, f.doFetch, ENV).open(cred).calendar!;
    await cal.create({ title: 'Write', start: '2026-12-01T09:00', end: '2026-12-01T10:00', timeZone: 'Africa/Addis_Ababa' });
    expect(f.seen[0].url.searchParams.get('sendUpdates')).toBe('none');
    expect(f.seen[0].json()).toMatchObject({ summary: 'Write', start: { dateTime: '2026-12-01T09:00:00', timeZone: 'Africa/Addis_Ababa' } });
    const e = await cal.create({ title: 'Deadline', start: '2026-12-05', end: '2026-12-05', allDay: true, timeZone: 'UTC' });
    expect(f.seen[1].json()).toMatchObject({ start: { date: '2026-12-05' }, end: { date: '2026-12-06' } });
    expect(e).toMatchObject({ allDay: true, start: '2026-12-05', end: '2026-12-05' });
  });

  it('reads events across calendars in order, and busy time', async () => {
    const f = fakeVendor({
      [`GET ${CAL}/calendars/a/events`]: () => ok({ items: [{ id: '2', summary: 'B', start: { dateTime: '2026-12-01T11:00:00Z' }, end: { dateTime: '2026-12-01T12:00:00Z' } }, { id: 'x', status: 'cancelled', start: {} }] }),
      [`GET ${CAL}/calendars/b/events`]: () => ok({ items: [{ id: '1', summary: 'A', start: { dateTime: '2026-12-01T09:00:00Z' }, end: { dateTime: '2026-12-01T10:00:00Z' } }] }),
      [`POST ${CAL}/freeBusy`]: () => ok({ calendars: { a: { busy: [{ start: '2026-12-01T11:00:00Z', end: '2026-12-01T12:00:00Z' }] } } }),
    });
    const cal = buildWith(googleCalendarConnector, f.doFetch, ENV).open(cred).calendar!;
    expect((await cal.events({ from: '2026-12-01T00:00:00Z', to: '2026-12-02T00:00:00Z', calendarIds: ['a', 'b'], limit: 10 })).map((e) => e.title)).toEqual(['A', 'B']);
    expect(await cal.busy({ from: '2026-12-01T00:00:00Z', to: '2026-12-02T00:00:00Z', calendarIds: ['a'] })).toHaveLength(1);
  });
});

describe('calendar times', () => {
  it('turns local wall time into UTC, across daylight saving', () => {
    expect(zonedToUtc('2026-07-01T09:00', 'Europe/Berlin')).toBe('2026-07-01T07:00:00.000Z');
    expect(zonedToUtc('2026-01-15T09:00', 'Europe/Berlin')).toBe('2026-01-15T08:00:00.000Z');
    expect(zonedToUtc('2026-11-01T01:30', 'America/New_York')).toMatch(/^2026-11-01T0[56]:30:00.000Z$/);
    expect(zonedToUtc('2026-12-01', 'Asia/Kolkata')).toBe('2026-11-30T18:30:00.000Z');
  });

  it('finds free stretches between busy times', () => {
    const busy = [
      { start: '2026-12-01T10:00:00Z', end: '2026-12-01T11:00:00Z' },
      { start: '2026-12-01T10:30:00Z', end: '2026-12-01T12:00:00Z' },
      { start: '2026-12-01T12:10:00Z', end: '2026-12-01T13:00:00Z' },
    ];
    expect(freeSlots(busy, '2026-12-01T09:00:00Z', '2026-12-01T17:00:00Z', 30)).toEqual([
      { start: '2026-12-01T09:00:00.000Z', end: '2026-12-01T10:00:00.000Z' },
      { start: '2026-12-01T13:00:00.000Z', end: '2026-12-01T17:00:00.000Z' },
    ]);
  });
});
