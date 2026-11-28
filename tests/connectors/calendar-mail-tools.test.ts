import { describe, expect, it } from 'vitest';
import type { AgentContext, ConnectedApp } from '@/lib/agent/context';
import { offeredTools } from '@/lib/agent/tools';
import { runTool } from '@/lib/agent/tools/run';
import { permissionOf, type Permission } from '@/lib/connectors/permissions';
import type { Calendar, CalendarEvent, Capability, MailBox } from '@/lib/providers/connectors/types';

/* A reply's context with two calendar apps (and Outlook mail), and per-app settings. */
function ctxWith(perms: Record<string, Record<string, Permission>> = {}, tz = 'Europe/Berlin') {
  const made: { app: string; e: unknown }[] = [];
  const calendarOf = (name: string): Calendar => ({
    calendars: async () => [{ id: 'primary', name: `${name} main`, primary: true, canWrite: true }],
    events: async () => [{ id: 'e', calendarId: 'primary', title: `${name} event`, start: '2026-12-01T08:00:00Z', end: '2026-12-01T09:00:00Z', allDay: false, location: null, url: null }],
    busy: async () => [{ start: '2026-12-01T09:00:00Z', end: '2026-12-01T11:00:00Z' }],
    create: async (e) => (made.push({ app: name, e }), { id: 'n', calendarId: 'primary', title: e.title, start: e.start, end: e.end, allDay: !!e.allDay, location: null, url: null } as CalendarEvent),
  });
  const mail: MailBox = {
    search: async () => [],
    read: async () => Promise.reject(new Error('unused')),
    attachment: async () => Promise.reject(new Error('unused')),
    draft: async () => ({ id: 'd1', url: 'https://outlook/d1' }),
  };
  const apps = new Map<Capability, ConnectedApp[]>([
    ['calendar', [{ name: 'google-calendar', label: 'Google Calendar' }, { name: 'microsoft', label: 'Microsoft 365' }]],
    ['mail', [{ name: 'microsoft', label: 'Microsoft 365' }]],
  ]);
  const permOf = (cap: Capability, kind: 'read' | 'write', name: string) => permissionOf(perms[name], cap, kind);
  const pick = (cap: Capability, kind: 'read' | 'write', app?: string | null) => {
    const list = apps.get(cap) ?? [];
    return app ? (list.find((a) => a.name === app) ?? null) : (list.find((a) => permOf(cap, kind, a.name) !== 'never') ?? list[0] ?? null);
  };
  const ctx = {
    userId: 'u1',
    timeZone: tz,
    connectors: {
      connected: new Map([...apps].map(([c, l]) => [c, l[0]])),
      apps,
      pick,
      permission: (cap: Capability, kind: 'read' | 'write', app?: string) => {
        const p = pick(cap, kind, app);
        return p ? permOf(cap, kind, p.name) : 'never';
      },
      open: async (cap: Capability, app?: string | null) => {
        const chosen = app ? apps.get(cap)!.find((a) => a.name === app)! : apps.get(cap)![0];
        return { api: cap === 'calendar' ? calendarOf(chosen.name) : mail, connector: chosen.name, label: chosen.label };
      },
    },
  } as unknown as AgentContext;
  return { ctx, made };
}

describe('two apps for one capability', () => {
  it('uses the default app, the one asked for, or skips an app set to "never"', async () => {
    const { ctx } = ctxWith();
    const first = await runTool(ctx, 'calendar_list', {});
    expect(first.outcome).toMatchObject({ status: 'done', output: { result: { app: 'Google Calendar' } } });
    const asked = await runTool(ctx, 'calendar_list', { app: 'microsoft' });
    expect(asked.outcome).toMatchObject({ status: 'done', output: { result: { app: 'Microsoft 365' } } });

    const skip = ctxWith({ 'google-calendar': { 'calendar.read': 'never' } });
    expect((await runTool(skip.ctx, 'calendar_list', {})).outcome).toMatchObject({ status: 'done', output: { result: { app: 'Microsoft 365' } } });
    expect((await runTool(skip.ctx, 'calendar_list', { app: 'google-calendar' })).outcome).toMatchObject({ status: 'error', code: 'denied', message: expect.stringContaining('Google Calendar') });
  });

  it('hides a tool only when every app giving it is "never"', () => {
    const both = { 'google-calendar': { 'calendar.write': 'never' as const }, microsoft: { 'calendar.write': 'never' as const } };
    const one = ctxWith({ 'google-calendar': { 'calendar.write': 'never' } }).ctx.connectors!;
    const none = ctxWith(both).ctx.connectors!;
    const names = (c: typeof one) => offeredTools({ web: false, connected: c.connected, permission: c.permission }).map((t) => t.name);
    expect(names(one)).toContain('calendar_create_event');
    expect(names(none)).not.toContain('calendar_create_event');
    expect(names(none)).toContain('calendar_events');
  });
});

describe('calendar tools', () => {
  it('asks before adding an event, in the user’s time, naming the app; then adds it there', async () => {
    const { ctx, made } = ctxWith();
    const input = { title: 'Read 5 papers', start: '2026-12-01T09:00', end: '2026-12-01T11:00', app: 'microsoft' };
    const ask = await runTool(ctx, 'calendar_create_event', input);
    expect(ask.outcome).toMatchObject({ status: 'needs_confirmation', question: expect.stringMatching(/Read 5 papers.*Tue 1 Dec, 09:00–11:00 \(Europe\/Berlin\).*Microsoft 365\? Nobody is invited\./) });
    expect((await runTool(ctx, 'calendar_create_event', input, { confirmed: true })).outcome).toMatchObject({ status: 'done' });
    expect(made).toEqual([{ app: 'microsoft', e: expect.objectContaining({ timeZone: 'Europe/Berlin', start: '2026-12-01T09:00' }) }]);
    expect((await runTool(ctx, 'calendar_create_event', { ...input, end: '2026-12-01T08:00' }, { confirmed: true })).outcome).toMatchObject({ status: 'error', code: 'bad_request' });
  });

  it('finds free time inside working hours, in the user’s time zone', async () => {
    const { ctx } = ctxWith({}, 'UTC');
    const r = await runTool(ctx, 'calendar_free_time', { from: '2026-12-01', to: '2026-12-01' });
    expect(r.outcome).toMatchObject({ status: 'done' });
    const free = (r.outcome as { output: { result: { free: { start: string; end: string }[] } } }).output.result.free;
    expect(free.map((s) => [s.start, s.end])).toEqual([
      ['2026-12-01T11:00:00.000Z', '2026-12-01T18:00:00.000Z'],
    ]);
    expect((await runTool(ctx, 'calendar_events', { from: '2026-12-01', to: '2027-02-01' })).outcome).toMatchObject({ status: 'error', code: 'bad_request' });
    expect((await runTool(ctx, 'calendar_events', { from: 'next week', to: '2026-12-02' })).outcome).toMatchObject({ status: 'error' });
  });
});

describe('mail tools', () => {
  it('drafts only after asking, and says it won’t be sent', async () => {
    const { ctx } = ctxWith();
    const input = { to: ['editor@journal.org'], subject: 'Revision', text: 'Dear editor…' };
    expect((await runTool(ctx, 'mail_draft', input)).outcome).toMatchObject({ status: 'needs_confirmation', question: expect.stringContaining('It won’t be sent.') });
    expect((await runTool(ctx, 'mail_draft', input, { confirmed: true })).outcome).toMatchObject({ status: 'done', output: { result: { sent: false, url: 'https://outlook/d1' } } });
    expect((await runTool(ctx, 'mail_draft', { to: [], subject: '', text: 'x' }, { confirmed: true })).outcome).toMatchObject({ status: 'error', code: 'bad_request' });
  });
});
