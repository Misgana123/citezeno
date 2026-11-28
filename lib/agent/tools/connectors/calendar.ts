import { z } from 'zod';
import { ShelfError } from '@/lib/shelf/errors';
import { freeSlots } from '@/lib/providers/connectors/time';
import { defineTool, tally } from '../types';
import { app, APP, appLabel, clip } from './shared';
import { dayWindows, moment, showDate, showTime, zoneOf } from './when';

/* The user's connected calendars (Google Calendar, Outlook): events, free
   time, and new events with nobody invited. Times are the user's local times. */

const WHEN = z.string().trim().min(10).max(40).describe('The user’s local date "YYYY-MM-DD" or date and time "YYYY-MM-DDTHH:mm".');
const CAL_IDS = z.array(z.string().trim().min(1).max(300)).max(10).optional().describe('Calendar IDs from calendar_list (default: the main calendar).');
const TZ = z.string().trim().max(64).optional().describe('IANA time zone of the times given (default: the user’s).');

export const calendarList = defineTool({
  name: 'calendar_list',
  description: 'List the user’s calendars in a connected calendar app (names, IDs, which is the main one, which can be written to).',
  input: z.object({ app: APP }),
  kind: 'read',
  step: 'read',
  needs: 'calendar',
  label: () => 'Looking at your calendars',
  done: () => ({ did: 'Looked at your calendars' }),
  async run(ctx, i) {
    const { api, label } = await app(ctx, 'calendar', i.app);
    const calendars = await api.calendars();
    return { result: { app: label, calendars }, display: { summary: tally(calendars.length, 'calendar') } };
  },
});

export const calendarEvents = defineTool({
  name: 'calendar_events',
  description: 'The user’s events between two local dates/times (at most 31 days), optionally only those whose title has `query` words. Times come back in the user’s time zone.',
  input: z.object({ from: WHEN, to: WHEN, query: z.string().trim().max(100).optional(), calendarIds: CAL_IDS, limit: z.number().int().min(1).max(100).optional(), app: APP }),
  kind: 'read',
  step: 'read',
  needs: 'calendar',
  label: (i) => `Looking at your calendar${i.query ? ` for “${clip(i.query, 40)}”` : ''}`,
  done: (i) => ({ did: 'Looked at your calendar', ...(i.query ? { about: i.query } : {}) }),
  async run(ctx, i) {
    const tz = zoneOf(ctx);
    const from = moment(i.from, tz);
    const to = moment(i.to, tz, true);
    if (Date.parse(to) - Date.parse(from) > 31 * 86_400_000) throw new ShelfError('bad_request', 'Ask for at most 31 days at a time.');
    const { api, label } = await app(ctx, 'calendar', i.app);
    const events = await api.events({ from, to, calendarIds: i.calendarIds, query: i.query, limit: i.limit ?? 50 });
    return {
      result: { app: label, timeZone: tz, events: events.map((e) => ({ title: e.title, when: e.allDay ? (e.start === e.end ? showDate(e.start) : `${showDate(e.start)} – ${showDate(e.end)}`) + ' (all day)' : `${showTime(e.start, tz)} – ${showTime(e.end, tz, false)}`, start: e.start, end: e.end, location: e.location, calendarId: e.calendarId, url: e.url })) },
      display: { summary: tally(events.length, 'event') },
    };
  },
});

export const calendarFreeTime = defineTool({
  name: 'calendar_free_time',
  description: 'When the user is free between two local dates (at most 31 days), within their working hours (default 09:00–18:00), in stretches of at least minMinutes (default 30). Use it before suggesting or adding a time.',
  input: z.object({
    from: WHEN,
    to: WHEN,
    minMinutes: z.number().int().min(15).max(480).optional(),
    dayStart: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('"09:00"'),
    dayEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('"18:00"'),
    calendarIds: CAL_IDS,
    app: APP,
  }),
  kind: 'read',
  step: 'read',
  needs: 'calendar',
  label: () => 'Finding free time in your calendar',
  done: () => ({ did: 'Found free time in your calendar' }),
  async run(ctx, i) {
    const tz = zoneOf(ctx);
    const from = moment(i.from, tz);
    const to = moment(i.to, tz, true);
    if (Date.parse(to) - Date.parse(from) > 31 * 86_400_000) throw new ShelfError('bad_request', 'Ask for at most 31 days at a time.');
    const { api, label } = await app(ctx, 'calendar', i.app);
    const busy = await api.busy({ from, to, calendarIds: i.calendarIds });
    const min = i.minMinutes ?? 30;
    const slots = dayWindows(from, to, tz, i.dayStart ?? '09:00', i.dayEnd ?? '18:00').flatMap((w) => freeSlots(busy.filter((b) => b.end > w.start && b.start < w.end), w.start, w.end, min));
    return {
      result: { app: label, timeZone: tz, free: slots.slice(0, 60).map((s) => ({ when: `${showTime(s.start, tz)} – ${showTime(s.end, tz, false)}`, start: s.start, end: s.end, minutes: Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60_000) })) },
      display: { summary: slots.length ? tally(slots.length, 'free slot') : 'No free time' },
    };
  },
});

export const calendarCreateEvent = defineTool({
  name: 'calendar_create_event',
  description:
    'Add an event to the user’s calendar (e.g. a deadline, reading time, a writing block). Nobody is invited or emailed. Give local times in the user’s time zone ("YYYY-MM-DDTHH:mm"), or dates with allDay (end = the last day). Asks the user first.',
  input: z.object({
    title: z.string().trim().min(1).max(250),
    start: WHEN,
    end: WHEN,
    allDay: z.boolean().optional(),
    timeZone: TZ,
    calendarId: z.string().trim().max(300).optional(),
    location: z.string().trim().max(250).optional(),
    description: z.string().trim().max(5000).optional(),
    app: APP,
  }),
  kind: 'write',
  step: 'make',
  needs: 'calendar',
  label: (i) => `Adding “${clip(i.title, 50)}” to your calendar`,
  done: (i) => ({ did: 'Added an event', about: i.title }),
  confirm(i, ctx) {
    const tz = zoneOf(ctx, i.timeZone);
    const when = i.allDay ? (i.start.slice(0, 10) === i.end.slice(0, 10) ? `on ${showDate(i.start)} (all day)` : `from ${showDate(i.start)} to ${showDate(i.end)} (all day)`) : `on ${showTime(moment(i.start, tz), tz)}–${showTime(moment(i.end, tz), tz, false)} (${tz})`;
    return `Add “${clip(i.title, 80)}” ${when} to your ${appLabel(ctx, 'calendar', 'calendar', i.app)}? Nobody is invited.`;
  },
  async run(ctx, i) {
    const tz = zoneOf(ctx, i.timeZone);
    if (!i.allDay && Date.parse(moment(i.end, tz)) <= Date.parse(moment(i.start, tz))) throw new ShelfError('bad_request', 'The event must end after it starts.');
    const { api, label } = await app(ctx, 'calendar', i.app);
    const e = await api.create({ calendarId: i.calendarId ?? null, title: i.title, start: i.start, end: i.end, allDay: i.allDay, timeZone: tz, location: i.location ?? null, description: i.description ?? null });
    return { result: { added: e.title, start: e.start, end: e.end, allDay: e.allDay, url: e.url, app: label }, display: { ...(e.url ? { links: [{ title: e.title, url: e.url }] } : {}), summary: `Added to ${label}` } };
  },
});

export const CALENDAR_TOOLS = [calendarList, calendarEvents, calendarFreeTime, calendarCreateEvent];
