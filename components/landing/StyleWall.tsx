'use client';

import { useMemo, useState } from 'react';
import { SPECIMENS, STYLE_GROUPS, STYLES, plain, specimen } from '@/lib/styles';
import { Icon } from '../Icon';
import { copyText } from '../Specimens';

type Kind = keyof typeof SPECIMENS;
type Fam = 'all' | 'author-date' | 'numeric' | 'notes';

const KINDS: [Kind, string][] = [
  ['article', 'Article'],
  ['book', 'Book'],
  ['web', 'Web'],
];
const FAMILIES: [Fam, string][] = [
  ['all', 'All 12'],
  ['author-date', 'Author–date'],
  ['numeric', 'Numeric'],
  ['notes', 'Notes'],
];
const FAM_LABEL: Record<string, string> = { 'author-date': 'Author–date', numeric: 'Numeric', notes: 'Notes' };

/* "Twelve styles from one set of records": the same record typeset by every
   style at once, straight from the real style engine. */
export function StyleWall() {
  const [kind, setKind] = useState<Kind>('article');
  const [fam, setFam] = useState<Fam>('all');
  const ids = useMemo(() => STYLE_GROUPS.flatMap(([, list]) => list), []);
  const cards = useMemo(() => ids.map((id) => ({ id, ...specimen(id, SPECIMENS[kind]) })), [ids, kind]);

  return (
    <div className="wall">
      <div className="wall-bar">
        <div className="wall-filter" role="group" aria-label="Style family">
          {FAMILIES.map(([f, label]) => (
            <button key={f} type="button" aria-pressed={fam === f} onClick={() => setFam(f)}>
              {label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Source type">
          {KINDS.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="wall-grid" aria-live="polite">
        {cards.map(({ id, style, entry, inText }) => {
          const family = style.family as string;
          const dim = fam !== 'all' && family !== fam;
          const cite = family === 'notes' ? '¹ footnote' : style.marker === 'sup' ? '¹ superscript' : plain(inText);
          return (
            <article key={id} className={`wall-card${dim ? ' is-dim' : ''}`} aria-hidden={dim || undefined}>
              <div className="wall-top">
                <b>{style.name}</b>
                <small>{style.edition}</small>
                <span className={`wall-fam f-${family}`}>{FAM_LABEL[family]}</span>
                <button
                  type="button"
                  className="wall-copy"
                  tabIndex={dim ? -1 : 0}
                  onClick={() => copyText(plain(entry), `<p style="padding-left:2em;text-indent:-2em">${entry}</p>`)}
                  aria-label={`Copy the ${style.name} ${style.edition} reference`}
                >
                  <Icon name="copy" /> Copy
                </button>
              </div>
              <p className="wall-ref" dangerouslySetInnerHTML={{ __html: entry }} />
              <div className="wall-cite">
                <span>{family === 'notes' ? 'First note' : 'In the text'}</span>
                <code>{cite}</code>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
