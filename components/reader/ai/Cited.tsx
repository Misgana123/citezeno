'use client';

import { Fragment } from 'react';
import type { PassageRef } from './usePassages';

/* Text with passage citations ("… nurses [p3-2]."): each marker becomes a small
   numbered link that jumps to the passage in the PDF and flashes it. Numbers
   follow `order` (first cited, first numbered) so a whole answer or summary
   shares one numbering. */
const MARKER = /\s*\[\s*(p\d{1,5}-\d{1,4}(?:\s*[,;]\s*p\d{1,5}-\d{1,4})*)\s*\]/g;

export function Cited({ text, order, passages, onCite }: { text: string; order: string[]; passages: Map<string, PassageRef>; onCite(id: string): void }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKER)) {
    parts.push(text.slice(last, m.index));
    const ids = m[1].split(/[,;]/).map((s) => s.trim());
    parts.push(
      <Fragment key={m.index}>
        {ids.map((id) => (
          <CiteChip key={id} id={id} n={order.indexOf(id) + 1} passage={passages.get(id)} onCite={onCite} />
        ))}
      </Fragment>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

export function CiteChip({ id, n, passage, onCite }: { id: string; n: number; passage?: PassageRef; onCite(id: string): void }) {
  return (
    <button
      type="button"
      className="rd-cite"
      onClick={() => onCite(id)}
      title={passage ? `Page ${passage.page}${passage.section ? ` · ${passage.section}` : ''}: ${passage.text.slice(0, 160)}${passage.text.length > 160 ? '…' : ''}` : `Passage ${id}`}
      aria-label={`Source ${n > 0 ? n : ''}, page ${passage?.page ?? id.slice(1).split('-')[0]}`}
    >
      {n > 0 ? n : '•'}
    </button>
  );
}

/* Passage IDs in the order they are first cited. */
export const citeOrder = (texts: string[]) => [...new Set(texts.flatMap((t) => [...t.matchAll(MARKER)].flatMap((m) => m[1].split(/[,;]/).map((s) => s.trim()))))];
