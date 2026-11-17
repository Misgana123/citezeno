'use client';

import { useMemo } from 'react';
import { SPECIMENS, STYLES, STYLE_GROUPS, plain, specimen } from '@/lib/styles';
import { Icon } from '../Icon';

const GROUP_NOTE: Record<string, string> = {
  'Author–date': 'Name and year in the text',
  Numeric: 'Numbered in order of use',
  Notes: 'Footnotes and a bibliography',
};

/* A sentence of the draft that can carry (or already carries) a citation. */
export type OutlineClaim = {
  index: number;
  text: string;
  /* character range in the draft; -1 when it could not be located */
  start: number;
  end: number;
  /* 1–3: how strongly the sentence reads as a factual claim */
  level: 1 | 2 | 3;
  /* sources attached by the last trace */
  sources: number;
};

export type SideTab = 'style' | 'claims';

/* Short mark for a style's tile: the name when it is an acronym, else its first two letters. */
const monogram = (name: string) => (name.length <= 4 ? name.toUpperCase() : name.slice(0, 2));

const LEVEL = ['', 'Possible claim', 'Clear claim', 'Strong claim'];

/* Left panel of the studio: the citation style list and an outline of the draft's claims. */
export function SidePanel({
  tab,
  setTab,
  style,
  onStyle,
  claims,
  onJump,
  hasDraft,
  onClose,
}: {
  tab: SideTab;
  setTab: (t: SideTab) => void;
  style: string;
  onStyle: (id: string) => void;
  claims: OutlineClaim[];
  onJump: (c: OutlineClaim) => void;
  hasDraft: boolean;
  onClose: () => void;
}) {
  const example = useMemo(() => {
    const sp = specimen(style, SPECIMENS.article);
    return {
      inText: sp.style.family === 'numeric' ? `…a claim ${plain(sp.inText)}` : plain(sp.inText),
      label: sp.style.family === 'notes' ? 'First note' : 'In the text',
      entry: sp.entry,
    };
  }, [style]);

  const cited = claims.filter((c) => c.sources > 0).length;
  const pct = claims.length ? Math.round((cited / claims.length) * 100) : 0;

  return (
    <aside className="at-left" aria-label="Citation style and claims">
      <div className="at-panel-head">
        <div className="at-seg" role="tablist" aria-label="Left panel">
          <button role="tab" aria-selected={tab === 'style'} onClick={() => setTab('style')}>
            <Icon name="quote" /> Style
          </button>
          <button role="tab" aria-selected={tab === 'claims'} onClick={() => setTab('claims')}>
            <Icon name="thread" /> Claims
            {claims.length > 0 && <span className="at-count">{claims.length}</span>}
          </button>
        </div>
        <button className="at-x" onClick={onClose} aria-label="Close the panel">
          <Icon name="x" />
        </button>
      </div>

      {tab === 'style' ? (
        <div className="at-panel-body" role="tabpanel">
          <div className="at-now">
            <span className="at-now-mark serif">{monogram(STYLES[style].name)}</span>
            <span>
              <small>Citing in</small>
              <b>
                {STYLES[style].name}, {STYLES[style].edition}
              </b>
            </span>
          </div>
          {STYLE_GROUPS.map(([g, ids]) => (
            <div className="at-group" key={g}>
              <h3>
                {g}
                <span>{GROUP_NOTE[g]}</span>
              </h3>
              <ul>
                {ids.map((id) => (
                  <li key={id}>
                    <button className="at-style" aria-current={id === style ? 'true' : undefined} onClick={() => onStyle(id)}>
                      <span className={`at-style-mark serif${STYLES[id].name.length > 3 && STYLES[id].name.length <= 4 ? ' sm' : ''}`}>{monogram(STYLES[id].name)}</span>
                      <span className="at-style-txt">
                        <b>{STYLES[id].name}</b>
                        <small>{STYLES[id].edition}</small>
                      </span>
                      <Icon name="check" className="at-style-tick" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="at-specimen">
            <span>{example.label}</span>
            <p className="serif">{example.inText}</p>
            <span>Reference</span>
            <p className="serif at-specimen-ref" dangerouslySetInnerHTML={{ __html: example.entry }} />
          </div>
        </div>
      ) : (
        <div className="at-panel-body" role="tabpanel">
          {claims.length === 0 ? (
            <div className="at-empty">
              <Icon name="thread" />
              <b>{hasDraft ? 'No citable claims yet' : 'Your claims appear here'}</b>
              <p>
                {hasDraft
                  ? 'Sentences that state a fact, a number or a finding are listed here as you write.'
                  : 'Paste or type a draft and every sentence worth citing is listed here, ready to jump to.'}
              </p>
            </div>
          ) : (
            <>
              <div className="at-cover">
                <div className="at-cover-top">
                  <b>
                    {cited} of {claims.length}
                  </b>
                  <span>claims cited</span>
                  <em>{pct}%</em>
                </div>
                <div className="at-cover-bar">
                  <i style={{ width: `${pct}%` }} />
                </div>
                <p>Click a claim to select it in your draft, then cite just that passage.</p>
              </div>
              <ol className="at-claims">
                {claims.map((c, k) => (
                  <li key={c.index}>
                    <button className={`at-claim${c.sources ? ' cited' : ''}`} onClick={() => onJump(c)} disabled={c.start < 0}>
                      <span className="at-claim-n">{c.sources ? <Icon name="check" /> : k + 1}</span>
                      <span className="at-claim-txt">
                        <span className="serif">{c.text}</span>
                        <small>
                          {c.sources ? (
                            <>
                              Cited · {c.sources} source{c.sources === 1 ? '' : 's'}
                            </>
                          ) : (
                            <>
                              <span className={`at-dots l${c.level}`} aria-hidden="true">
                                <i />
                                <i />
                                <i />
                              </span>
                              {LEVEL[c.level]}
                            </>
                          )}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
