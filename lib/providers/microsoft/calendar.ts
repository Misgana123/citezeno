import type { Calendar, CalendarEvent } from '../connectors/types';
import { localDateTime, nextDay, previousDay, zonedToUtc } from '../connectors/time';
import { seg, type GraphCall } from './http';

/* The Outlook calendar through Microsoft Graph. Times are asked for in UTC
   and events are made in UTC (from the user's local time), with no attendees:
   nobody is invited. */

type GEvent = { id: string; subject?: string; isAllDay?: boolean; isCancelled?: boolean; showAs?: string; webLink?: string; location?: { displayName?: string }; start?: { dateTime?: string }; end?: { dateTime?: string } };
const UTC = { prefer: 'outlook.timezone="UTC"' };
const SELECT = 'id,subject,isAllDay,isCancelled,showAs,webLink,location,start,end';

/* Graph's UTC times come without a zone ("2026-12-01T09:00:00.0000000"). */
const iso = (v: string | undefined) => (v ? `${v.replace(/\.\d+$/, '')}Z` : '');

export function toEvent(e: GEvent, calendarId: string): CalendarEvent {
  const allDay = !!e.isAllDay;
  return {
    id: e.id,
    calendarId,
    title: e.subject?.trim() || '(No title)',
    start: allDay ? (e.start?.dateTime ?? '').slice(0, 10) : iso(e.start?.dateTime),
    end: allDay ? previousDay((e.end?.dateTime ?? '').slice(0, 10)) : iso(e.end?.dateTime),
    allDay,
    location: e.location?.displayName || null,
    url: e.webLink ?? null,
  };
}

export function outlookCalendar(call: GraphCall): Calendar {
  const view = async (from: string, to: string, calendarIds: string[] | undefined, limit: number) => {
    const lists = await Promise.all(
      (calendarIds?.length ? calendarIds.slice(0, 10) : [null]).map(async (id) => {
        const r = await call<{ value?: GEvent[] }>({
          method: 'GET',
          path: id ? `/me/calendars/${seg(id)}/calendarView` : '/me/calendarView',
          query: { startDateTime: new Date(from).toISOString(), endDateTime: new Date(to).toISOString(), $top: Math.min(250, limit), $orderby: 'start/dateTime', $select: SELECT },
          headers: UTC,
        });
        return (r.value ?? []).filter((e) => !e.isCancelled).map((e) => ({ e, id: id ?? 'default' }));
      }),
    );
    return lists.flat();
  };
  return {
    async calendars() {
      const r = await call<{ value?: { id: string; name?: string; canEdit?: boolean; isDefaultCalendar?: boolean }[] }>({ method: 'GET', path: '/me/calendars', query: { $select: 'id,name,canEdit,isDefaultCalendar', $top: 100 } });
      return (r.value ?? []).map((c) => ({ id: c.id, name: c.name ?? 'Calendar', primary: !!c.isDefaultCalendar, canWrite: c.canEdit !== false }));
    },

    async events({ from, to, calendarIds, query, limit }) {
      const q = query?.trim().toLowerCase();
      return (await view(from, to, calendarIds, limit))
        .filter(({ e }) => !q || (e.subject ?? '').toLowerCase().includes(q) || (e.location?.displayName ?? '').toLowerCase().includes(q))
        .map(({ e, id }) => toEvent(e, id))
        .sort((a, b) => a.start.localeCompare(b.start))
        .slice(0, limit);
    },

    async busy({ from, to, calendarIds }) {
      return (await view(from, to, calendarIds, 250))
        .filter(({ e }) => e.showAs !== 'free' && e.showAs !== 'workingElsewhere')
        .map(({ e }) => ({ start: iso(e.start?.dateTime), end: iso(e.end?.dateTime) }))
        .sort((a, b) => a.start.localeCompare(b.start));
    },

    async create(e) {
      const when = e.allDay
        ? { isAllDay: true, start: { dateTime: `${localDateTime(e.start).slice(0, 10)}T00:00:00`, timeZone: 'UTC' }, end: { dateTime: `${nextDay(localDateTime(e.end).slice(0, 10))}T00:00:00`, timeZone: 'UTC' } }
        : { start: { dateTime: zonedToUtc(e.start, e.timeZone).replace(/\.\d+Z$/, ''), timeZone: 'UTC' }, end: { dateTime: zonedToUtc(e.end, e.timeZone).replace(/\.\d+Z$/, ''), timeZone: 'UTC' } };
      const made = await call<GEvent>({
        method: 'POST',
        path: e.calendarId ? `/me/calendars/${seg(e.calendarId)}/events` : '/me/events',
        json: { subject: e.title, ...(e.description ? { body: { contentType: 'Text', content: e.description } } : {}), ...(e.location ? { location: { displayName: e.location } } : {}), ...when },
        headers: UTC,
      });
      return toEvent(made, e.calendarId ?? 'default');
    },
  };
}
