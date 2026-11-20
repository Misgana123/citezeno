'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Paper } from '@/lib/papers/types';
import type { ShelfItem } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { authorsShort } from '../papers/format';
import { SaveButton } from '../shelf/SaveButton';

/* Papers a step found, as a numbered reference list: the number the answer
   cites ([2]), the title in the reading face, who / when / where, and Save.
   Retracted papers are flagged. Each row is an anchor the citations jump to. */

const SHOWN = 5;

export const refAnchor = (turn: number, n: number) => `ref-${turn}-${n}`;

const link = (p: Pick<Paper, 'doi' | 'landingUrl' | 'record'>) => (p.doi ? `https://doi.org/${p.doi}` : (p.landingUrl ?? p.record?.url ?? null));

function Row({ n, turn, paper, action }: { n?: number; turn: number; paper: Paper | ShelfItem['paper']; action: React.ReactNode }) {
  const href = link(paper);
  const meta = [authorsShort(paper.authors), paper.year, paper.source].filter(Boolean).join(' · ');
  return (
    <li className={`ch-ref-row${paper.isRetracted ? ' is-retracted' : ''}`} id={n ? refAnchor(turn, n) : undefined}>
      <span className="ch-ref-n">{n ?? '•'}</span>
      <div className="ch-ref-body">
        {href ? (
          <a className="ch-ref-title" href={href} target="_blank" rel="noopener noreferrer">
            {paper.title}
          </a>
        ) : (
          <span className="ch-ref-title">{paper.title}</span>
        )}
        {meta && <span className="ch-ref-meta">{meta}</span>}
      </div>
      <div className="ch-ref-act">
        {paper.isRetracted && <span className="ch-flag">Retracted</span>}
        {action}
      </div>
    </li>
  );
}

export function PaperRefs({ papers, items, refs, turn }: { papers?: Paper[]; items?: ShelfItem[]; refs?: Record<string, number>; turn: number }) {
  const [all, setAll] = useState(false);
  const rows = [
    ...(papers ?? []).map((p) => ({ key: p.id, n: refs?.[p.id], node: (n?: number) => <Row key={p.id} n={n} turn={turn} paper={p} action={<SaveButton paper={p} />} /> })),
    ...(items ?? []).map((i) => ({
      key: i.id,
      n: refs?.[i.paper.id],
      node: (n?: number) => (
        <Row
          key={i.id}
          n={n}
          turn={turn}
          paper={i.paper}
          action={
            <Link className="ch-ref-open" href={`/app/shelf?item=${encodeURIComponent(i.id)}`}>
              <Icon name="layers" /> On your shelf
            </Link>
          }
        />
      ),
    })),
  ];
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <div className="ch-refs">
      <ol className="ch-ref-list">{shown.map((r) => r.node(r.n))}</ol>
      {rows.length > SHOWN && (
        <button type="button" className="ch-more-btn" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}
