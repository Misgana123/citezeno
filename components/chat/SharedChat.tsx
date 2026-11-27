'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import type { SharedChat as SharedChatData } from '@/lib/agent/share';
import { Icon } from '../Icon';
import { Markdown } from './Markdown';
import { refAnchor } from './PaperRefs';
import { Steps } from './Steps';
import { segments } from './steps/timeline';
import { refTitles, toTurns } from './turns';

/* A shared chat's public page: the conversation as it was shared, read-only,
   in the chat's own look. Citations jump to the numbered papers; attached
   files are shown by name only. */

export function SharedChat({ chat }: { chat: SharedChatData }) {
  const turns = toTurns(chat.entries);
  const date = new Date(chat.sharedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="ch-shared">
      <header className="ch-shared-head">
        <h1>{chat.title}</h1>
        <p>
          {chat.owner ? `Shared by ${chat.owner} · ` : 'Shared · '}
          {date}
        </p>
      </header>

      <div className="ch-col">
        {turns.map((t) => {
          const titles = refTitles(t);
          const cite = (n: number, key: number) =>
            titles.has(n) ? (
              <a key={key} className="ch-cite" href={`#${refAnchor(t.key, n)}`} title={titles.get(n)}>
                {n}
              </a>
            ) : (
              <Fragment key={key}>[{n}]</Fragment>
            );
          return (
            <div key={t.key} className="ch-turn">
              {!!t.files?.length && (
                <ul className="ch-shared-files" aria-label="Attached">
                  {t.files.map((f, i) => (
                    <li key={i}>
                      <Icon name={f.kind === 'image' ? 'screenshot' : 'file'} /> {f.name}
                    </li>
                  ))}
                </ul>
              )}
              {!!t.user && <div className="ch-user">{t.user}</div>}
              {t.parts.length > 0 && (
                <div className="ch-ai">
                  {segments(t.parts).map((seg) => {
                    if (seg.kind === 'work') return <Steps key={`w${seg.at}`} items={seg.items} turn={t.key} readOnly />;
                    const p = t.parts[seg.at];
                    return p.kind === 'assistant' ? (
                      <div key={seg.at} className="ch-answer">
                        <Markdown text={p.text} cite={cite} />
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <footer className="ch-shared-foot">
        <p>This is a copy of a chat with the Citezeno research assistant. Answers come only from real papers; check important claims against the source.</p>
        <Link className="btn btn-sm btn-thread" href="/app/chat">
          Ask your own question
        </Link>
      </footer>
    </div>
  );
}
