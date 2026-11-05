'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { describe, type HistoryItem } from '@/lib/history-format';
import { Icon, type IconName } from '../Icon';

/* Rendered in the browser so days and times follow the visitor's own time zone. */
const ICON: Record<string, IconName> = {
  'trace.created': 'search',
  'trace.renamed': 'wand',
  'trace.deleted': 'trash',
  'trace.shared': 'globe',
  'trace.unshared': 'globe',
  'auth.signin': 'device',
  'auth.password': 'lock',
  'auth.2fa-on': 'shield',
  'auth.2fa-off': 'shield',
  'contact.sent': 'mail',
};
const iconFor = (k: string): IconName => ICON[k] || (k.startsWith('credits.') ? 'bolt' : 'history');

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

export function HistoryList({ items }: { items: HistoryItem[] }) {
  // the server doesn't know the visitor's time zone, so dates appear after mount
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <div className="hist-loading" aria-busy="true" />;
  const groups: [string, HistoryItem[]][] = [];
  for (const it of items) {
    const label = dayLabel(it.at);
    const last = groups[groups.length - 1];
    if (last && last[0] === label) last[1].push(it);
    else groups.push([label, [it]]);
  }
  return (
    <ol className="hist">
      {groups.map(([label, list]) => (
        <li key={label} className="hist-day">
          <h2 className="hist-day-title">{label}</h2>
          <ol>
            {list.map((it) => {
              const d = describe(it);
              return (
                <li key={it.id} className={`hist-item k-${it.kind.split('.')[0]}`}>
                  <span className="hist-ico" aria-hidden="true">
                    <Icon name={iconFor(it.kind)} />
                  </span>
                  <div className="hist-body">
                    <p>
                      {d.text}
                      {it.title && (
                        <>
                          {' '}
                          {it.traceExists ? (
                            <Link href={`/studio?open=${encodeURIComponent(it.traceId!)}`}>“{it.title}”</Link>
                          ) : (
                            <b>“{it.title}”</b>
                          )}
                        </>
                      )}
                    </p>
                    <small>
                      {new Date(it.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      {d.detail ? ` · ${d.detail}` : ''}
                    </small>
                  </div>
                  {it.delta != null && (
                    <span className={`hist-delta ${it.delta > 0 ? 'plus' : 'minus'}`}>
                      {it.delta > 0 ? '+' : '−'}
                      {Math.abs(it.delta).toLocaleString()}
                      <small> credit{Math.abs(it.delta) === 1 ? '' : 's'}</small>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ol>
  );
}
