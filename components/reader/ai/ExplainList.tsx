'use client';

import { Icon } from '../../Icon';
import { toast } from '../../toast';
import { Cited, citeOrder } from './Cited';
import type { PassageRef } from './usePassages';

/* "Explain" answers for selections, newest first: the selected text, then a
   plain explanation with links to the passages it used. */

export type ExplainItem = { id: string; quote: string; page: number; status: 'loading' | 'done' | 'error'; text?: string; error?: string };

export function ExplainList({ items, passages, onCite, onRetry }: { items: ExplainItem[]; passages: Map<string, PassageRef>; onCite(id: string): void; onRetry(item: ExplainItem): void }) {
  return (
    <ol className="rd-explains">
      {items.map((it) => (
        <li key={it.id} className="rd-explain">
          <span className="rd-explain-kicker">
            <Icon name="sparkle" /> Explain · p. {it.page}
          </span>
          <blockquote>{it.quote}</blockquote>
          {it.status === 'loading' && (
            <p className="rd-muted">
              <span className="spin" aria-hidden="true" /> Explaining…
            </p>
          )}
          {it.status === 'error' && (
            <p className="rd-ai-error" role="alert">
              <Icon name="alert" /> {it.error}{' '}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRetry(it)}>
                Try again
              </button>
            </p>
          )}
          {it.status === 'done' && it.text && (
            <>
              <p className="rd-explain-text">
                <Cited text={it.text} order={citeOrder([it.text])} passages={passages} onCite={onCite} />
              </p>
              <button
                type="button"
                className="btn btn-ghost btn-sm rd-explain-copy"
                onClick={() =>
                  navigator.clipboard
                    .writeText(it.text!.replace(/\s*\[p\d+-\d+[^\]]*\]/g, ''))
                    .then(() => toast('Copied'))
                    .catch(() => toast('Copy isn’t available here.', true))
                }
              >
                <Icon name="copy" /> Copy
              </button>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
