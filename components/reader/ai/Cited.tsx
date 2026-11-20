'use client';

import { Fragment } from 'react';
import type { PassageRef } from './usePassages';

/* Text with passage citations ("… nurses [p3-2]."): each marker becomes a small
   numbered link that jumps to the passage in the PDF and flashes it. Numbers
   follow `order` (first cited, first numbered) so a whole answer or summary
   shares one numbering. */
const MARKER = /\s*\[\s*(p\d{1,5}-\d{1,4}(?:\s*[,;]\s*p\d{1,5}-\d{1,4})*)\s*\]/g;

/* Light inline formatting models use: **bold**, *italic*, `code`, and $math$ (shown as plain text). */
const INLINE = /\*\*([^*]+)\*\*|(?<![\w*])\*([^*\n]+)\*(?!\w)|`([^`]+)`|\$([^$\n]{1,120})\$/g;

export function Inline({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    out.push(text.slice(last, m.index));
    const k = m.index;
    if (m[1] != null) out.push(<strong key={k}>{m[1]}</strong>);
    else if (m[2] != null) out.push(<em key={k}>{m[2]}</em>);
    else if (m[3] != null) out.push(<code key={k}>{m[3]}</code>);
    else out.push(<span key={k} className="rd-math">{m[4].replace(/\\(text|mathrm|mathit)\{([^}]*)\}/g, '$2').replace(/\\/g, '')}</span>);
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

export function Cited({ text, order, passages, onCite }: { text: string; order: string[]; passages: Map<string, PassageRef>; onCite(id: string): void }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKER)) {
    parts.push(<Inline key={`t${last}`} text={text.slice(last, m.index)} />);
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
  parts.push(<Inline key={`t${last}`} text={text.slice(last)} />);
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
