import type { Calendar, CalendarEvent } from '../connectors/types';
import { localDateTime, nextDay, previousDay } from '../connectors/time';
import type { GoogleCall } from '../google-workspace/http';

/* Google Calendar, as the calendar capability. Events are made with no
   guests and sendUpdates=none: nobody gets an email. */

export const CALENDAR = 'https://www.googleapis.com/calendar/v3';

type GEvent = { id: string; summary?: string; status?: string; location?: string; htmlLink?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } };
type GCalendar = { id: string; summary?: string; summaryOverride?: string; primary?: boolean; accessRole?: string };

const cal = (id: string) => encodeURIComponent(id);

export function toEvent(e: GEvent, calendarId: string): CalendarEvent {
  const allDay = !e.start?.dateTime && !!e.start?.date;
  return {
    id: e.id,
    calendarId,
    title: e.summary?.trim() || '(No title)',
    start: e.start?.dateTime ?? e.start?.date ?? '',
    // Google's all-day end is the day after; ours is the last day
    end: allDay && e.end?.date ? previousDay(e.end.date) : (e.end?.dateTime ?? e.end?.date ?? ''),
    allDay,
    location: e.location ?? null,
    url: e.htmlLink ?? null,
  };
}

export function googleCalendar(call: GoogleCall): Calendar {
  const ids = (calendarIds?: string[]) => (calendarIds?.length ? calendarIds.slice(0, 10) : ['primary']);
  return {
    async calendars() {
      const r = await call<{ items?: GCalendar[] }>({ method: 'GET', url: `${CALENDAR}/users/me/calendarList`, query: { minAccessRole: 'reader', maxResults: 100 } });
      return (r.items ?? []).map((c) => ({ id: c.id, name: c.summaryOverride ?? c.summary ?? c.id, primary: !!c.primary, canWrite: c.accessRole === 'owner' || c.accessRole === 'writer' }));
    },

    async events({ from, to, calendarIds, query, limit }) {
      const lists = await Promise.all(
        ids(calendarIds).map(async (id) => {
          const r = await call<{ items?: GEvent[] }>({
            method: 'GET',
            url: `${CALENDAR}/calendars/${cal(id)}/events`,
            query: { timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: Math.min(250, limit), q: query?.trim() || undefined },
          });
          return (r.items ?? []).filter((e) => e.status !== 'cancelled').map((e) => toEvent(e, id));
        }),
      );
      return lists
        .flat()
        .sort((a, b) => a.start.localeCompare(b.start))
        .slice(0, limit);
    },

    async busy({ from, to, calendarIds }) {
      const list = ids(calendarIds);
      const r = await call<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>({
        method: 'POST',
        url: `${CALENDAR}/freeBusy`,
        json: { timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), items: list.map((id) => ({ id })) },
      });
      return Object.values(r.calendars ?? {})
        .flatMap((c) => c.busy ?? [])
        .sort((a, b) => a.start.localeCompare(b.start));
    },

    async create(e) {
      const calendarId = e.calendarId || 'primary';
      const when = e.allDay
        ? { start: { date: localDateTime(e.start).slice(0, 10) }, end: { date: nextDay(localDateTime(e.end).slice(0, 10)) } }
        : { start: { dateTime: localDateTime(e.start), timeZone: e.timeZone }, end: { dateTime: localDateTime(e.end), timeZone: e.timeZone } };
      const made = await call<GEvent>({
        method: 'POST',
        url: `${CALENDAR}/calendars/${cal(calendarId)}/events`,
        query: { sendUpdates: 'none' },
        json: { summary: e.title, ...(e.description ? { description: e.description } : {}), ...(e.location ? { location: e.location } : {}), ...when },
      });
      return toEvent(made, calendarId);
    },
  };
}
