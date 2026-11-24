'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Paper } from '@/lib/papers/types';
import type { ShelfItem } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { authorsShort, paperLink } from '../papers/format';
import { ReadButton } from '../reader/ReadButton';
import { SaveButton } from '../shelf/SaveButton';
import { useFilePanel } from './file/panel-state';

/* Papers a step found, as a numbered reference list: the number the answer
   cites ([2]), the title in the reading face, who / when / where, and Save.
   Retracted papers are flagged. Each row is an anchor the citations jump to. */

const SHOWN = 5;

export const refAnchor = (turn: number, n: number) => `ref-${turn}-${n}`;

function Row({ n, turn, paper, action, open = false }: { n?: number; turn: number; paper: Paper | ShelfItem['paper']; action: React.ReactNode; open?: boolean }) {
  const href = paperLink(paper);
  const meta = [authorsShort(paper.authors), paper.year, paper.source].filter(Boolean).join(' · ');
  return (
    <li className={`ch-ref-row${paper.isRetracted ? ' is-retracted' : ''}${open ? ' is-open' : ''}`} id={n ? refAnchor(turn, n) : undefined}>
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

/* readOnly: a shared chat's public page, without Read, Save or the shelf (they need an account) */
export function PaperRefs({ papers, items, refs, turn, chatId = null, readOnly = false }: { papers?: Paper[]; items?: ShelfItem[]; refs?: Record<string, number>; turn: number; chatId?: string | null; readOnly?: boolean }) {
  const [all, setAll] = useState(false);
  const panel = useFilePanel();
  /* Read opens the paper beside the chat (when the page has the panel) */
  const read = (id: string, title: string) => (panel ? { onOpen: () => panel.open(id, { title }), open: panel.active === id } : {});
  const rows = [
    ...(papers ?? []).map((p) => ({
      key: p.id,
      n: refs?.[p.id],
      node: (n?: number) => (
        <Row
          key={p.id}
          n={n}
          turn={turn}
          paper={p}
          open={panel?.active === p.id}
          action={
            readOnly ? null : <>
              <ReadButton paperId={p.id} hasPdf={!!p.pdfUrl} chatId={chatId} {...read(p.id, p.title)} />
              <SaveButton paper={p} />
            </>
          }
        />
      ),
    })),
    ...(items ?? []).map((i) => ({
      key: i.id,
      n: refs?.[i.paper.id],
      node: (n?: number) => (
        <Row
          key={i.id}
          n={n}
          turn={turn}
          paper={i.paper}
          open={panel?.active === i.paper.id}
          action={
            readOnly ? null : <>
              <ReadButton paperId={i.paper.id} hasPdf={(i.pdfs?.length ?? 0) > 0 || !!i.paper.pdfUrl} chatId={chatId} {...read(i.paper.id, i.paper.title)} />
              <Link className="ch-ref-open" href={`/app/shelf?item=${encodeURIComponent(i.id)}`}>
                <Icon name="layers" /> On your shelf
              </Link>
            </>
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
