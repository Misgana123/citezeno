/* The five designs for a shared trace. They are plain components (no hooks),
   so the public page renders them on the server and the share dialog renders
   the very same components in its preview. Styles live in app/share.css. */
import type { CSSProperties, ReactNode } from 'react';
import type { ShareSource, ShareView } from '@/lib/share-view';
import { Icon } from '../Icon';
import { PagedSheet } from '../studio/PagedSheet';
import { ShareControls, type ToolsProps } from './ShareControls';
import { ThreadLines } from './ThreadLines';

export type ThemeProps = { v: ShareView; tools: ToolsProps };

const Html = ({ html, className }: { html: string; className?: string }) => <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Meta({ s }: { s: ShareSource }) {
  const parts: ReactNode[] = [];
  if (s.who) parts.push(s.who);
  if (s.venue) parts.push(<i key="v">{s.venue}</i>);
  if (s.year) parts.push(String(s.year));
  parts.push(s.typeLabel);
  if (s.citedBy) parts.push(`cited ${s.citedBy.toLocaleString('en-US')}×`);
  return (
    <span className="m">
      {parts.map((p, i) => (
        <span key={i}>
          {i ? ' · ' : ''}
          {p}
        </span>
      ))}
    </span>
  );
}

function Tags({ s }: { s: ShareSource }) {
  return (
    <span className="f">
      {s.retracted ? <span className="sh-tag warn">retracted</span> : <span className="sh-tag ok">✓ real record</span>}
      {s.doi && <span className="sh-tag doi">doi</span>}
      {s.providers.map((p) => (
        <span key={p} className="sh-tag">
          {p}
        </span>
      ))}
    </span>
  );
}

/* One source, as a card. data-ref links it to its markers; data-w is the match strength for the threads. */
function SourceCard({ s, variant, bar = false }: { s: ShareSource; variant: 'rail' | 'panel' | 'strip' | 'dark'; bar?: boolean }) {
  return (
    <a className={`sh-src sh-src-${variant}`} data-card="" data-ref={s.n - 1} data-w={s.score ?? ''} href={s.url} target="_blank" rel="noopener noreferrer nofollow">
      <span className="n">{s.n}</span>
      <span className="b">
        <span className="t">{s.title}</span>
        <Meta s={s} />
        {bar && s.score != null && (
          <span className="row">
            <span className="sh-bar">
              <i style={{ width: `${Math.round(s.score * 100)}%` }} />
            </span>
            <span className="sh-score">match {s.score.toFixed(2)}</span>
          </span>
        )}
        <Tags s={s} />
      </span>
    </a>
  );
}

function Chips({ v }: { v: ShareView }) {
  const n = v.sources.length;
  return (
    <div className="sh-chips">
      <span className="sh-chip ok">
        <Icon name="check" /> {n} of {n} real records
      </span>
      {v.stats.providers.length > 0 && <span className="sh-chip">{v.stats.providers.join(' · ')}</span>}
      {v.stats.retracted ? (
        <span className="sh-chip warn">
          <Icon name="alert" /> {plural(v.stats.retracted, 'retracted work')}
        </span>
      ) : (
        <span className="sh-chip">No retractions</span>
      )}
    </div>
  );
}

function Cta({ wide = false }: { wide?: boolean }) {
  return (
    <aside className={`sh-cta${wide ? ' sh-cta-wide' : ''}`}>
      <div>
        <h2>Need real sources for your own draft?</h2>
        <p>Paste any AI-written text. Citezeno finds the claims, searches real databases and formats the citations in 12 styles.</p>
      </div>
      <a className="btn btn-thread" href="/sign-up">
        Try Citezeno free
      </a>
    </aside>
  );
}

const sharedBy = (v: ShareView) => (v.owner ? `by ${v.owner}` : 'from Citezeno');

/* ------------------------------------------------------------------ */
/* 1 · Reading Room                                                    */
/* ------------------------------------------------------------------ */
export function Reading({ v, tools }: ThemeProps) {
  const n = v.sources.length;
  return (
    <div className="rr">
      <div className="rr-trust sh-sticky">
        <div className="sh-wrap rr-trust-in">
          <span className="sh-kicker">
            <Icon name="shield" /> Shared {sharedBy(v)} <i /> {v.dateText} <i /> {plural(n, 'source')}
          </span>
          <ShareControls {...tools} />
        </div>
      </div>
      <div className="sh-wrap">
        <header className="rr-head">
          <span className="rr-eyebrow">Shared trace</span>
          <h1 className="rr-title">{v.title}</h1>
          <p className="rr-lede">
            <b>{plural(n, 'source')}</b> in {v.styleName}, {v.styleEdition} ({v.modeLabel.toLowerCase()}). Every reference links to a real record. Open each one to check it
            supports the sentence it’s attached to.
          </p>
          <Chips v={v} />
        </header>
        <div className="rr-grid">
          <article className="rr-paper">
            <Html className="sh-ms rr-ms" html={v.hasDoc ? v.bodyHtml : v.refHtml} />
          </article>
          <aside className="rr-rail sh-sticky">
            <div className="rr-rail-h">
              <h2>Sources</h2>
              <span>
                {n} · {v.stats.retracted ? `${v.stats.retracted} retracted` : 'all real records'}
              </span>
            </div>
            {v.sources.map((s) => (
              <SourceCard key={s.id} s={s} variant="rail" />
            ))}
            <div className="rr-rail-foot">
              <b>Check before you cite</b>
              Citezeno matches by topic; it doesn’t read the paper. Open each record and confirm it supports the sentence.
            </div>
          </aside>
        </div>
        {v.hasDoc && (
          <section className="rr-bib">
            <div className="rr-bib-h">
              <h2>{v.listTitle}</h2>
              <span>
                {v.styleName} · {v.styleEdition}
              </span>
            </div>
            <Html className="sh-refs" html={v.refHtml} />
          </section>
        )}
        <Cta />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2 · Dossier                                                         */
/* ------------------------------------------------------------------ */
export function Dossier({ v, tools }: ThemeProps) {
  const n = v.sources.length;
  const ok = n ? Math.round(((n - v.stats.retracted) / n) * 100) : 100;
  const dbs = v.stats.providers;
  const dbText = dbs.length > 1 ? `${dbs.slice(0, -1).join(', ')} and ${dbs[dbs.length - 1]}` : dbs[0] || 'a live database';
  return (
    <div className="ds">
      <section className="ds-band">
        <div className="sh-wrap ds-band-in">
          <div>
            <span className="ds-kicker">
              <Icon name="shield" /> Shared trace · {sharedBy(v)} · {v.dateText}
            </span>
            <h1 className="ds-title">{v.title}</h1>
            <p className="ds-lede">Every reference below comes from a real published record. Nothing was invented. Open each one to check it supports the sentence it’s attached to.</p>
            <div className="ds-stats">
              <div className="ds-stat ok">
                <b>
                  {n - v.stats.retracted} / {n}
                </b>
                <span>real records</span>
              </div>
              <div className="ds-stat">
                <b>{v.stats.claims}</b>
                <span>claims cited</span>
              </div>
              <div className="ds-stat">
                <b>{v.stats.retracted}</b>
                <span>retractions</span>
              </div>
              <div className="ds-stat">
                <b>{dbs.length}</b>
                <span>databases</span>
              </div>
              {v.stats.years && (
                <div className="ds-stat">
                  <b>{v.stats.years[0] === v.stats.years[1] ? v.stats.years[0] : `${v.stats.years[0]}–${v.stats.years[1]}`}</b>
                  <span>published</span>
                </div>
              )}
            </div>
          </div>
          <ShareControls {...tools} variant="glass" />
        </div>
      </section>
      <div className="sh-wrap ds-body">
        <div>
          {v.hasDoc && (
            <div className="ds-viewer">
              <PagedSheet html={v.docHtml} label={`${v.styleName}, ${v.styleEdition} · ${v.modeLabel}`} />
            </div>
          )}
          <section className="ds-bib">
            <h2>{v.listTitle}</h2>
            <p className="ds-sub">
              {v.styleName}, {v.styleEdition} · {plural(n, 'entry', 'entries')}
            </p>
            <Html className="sh-refs" html={v.refHtml} />
          </section>
        </div>
        <aside className="ds-panel sh-sticky">
          <div className="ds-card">
            <div className="ds-vhead">
              <div className="ds-ring" style={{ '--ds-ok': `${ok}%` } as CSSProperties}>
                <i>
                  {n - v.stats.retracted}/{n}
                </i>
              </div>
              <div>
                <h2>{v.stats.retracted ? 'Check the flagged record' : 'All records resolve'}</h2>
                <p>Each one was found in {dbText} and links to its record.</p>
              </div>
            </div>
            {v.sources.map((s) => (
              <SourceCard key={s.id} s={s} variant="panel" bar />
            ))}
            <div className="ds-vfoot">
              <Icon name="alert" />
              <span>Match strength measures topic overlap, not proof. Read the source before you rely on it.</span>
            </div>
          </div>
          <a className="btn btn-thread ds-cta" href="/sign-up">
            Trace your own draft · free
          </a>
        </aside>
      </div>
      <div className="sh-wrap">
        <Cta />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3 · Cyanotype                                                       */
/* ------------------------------------------------------------------ */
export function Cyanotype({ v, tools }: ThemeProps) {
  const n = v.sources.length;
  return (
    <div className="cy">
      <header className="cy-hero">
        <div className="sh-wrap cy-hero-in">
          <span className="cy-seal">
            <i>
              <Icon name="check" />
            </i>
            {n - v.stats.retracted} of {n} references resolve to a real record
          </span>
          <h1 className="cy-title">{v.title}</h1>
          <p className="cy-lede">
            Cited in {v.styleName}, {v.styleEdition}, with {v.modeLabel.toLowerCase()}. Every reference links to a published record. Nothing is invented — open each one to
            check it supports its sentence.
          </p>
          <div className="cy-by">
            {v.owner && (
              <>
                <span className="cy-av">{v.owner[0]}</span>
                <span>Shared by {v.owner}</span>
                <i />
              </>
            )}
            <span>{v.dateText}</span>
            <i />
            <span>{plural(v.stats.claims, 'claim')} cited</span>
          </div>
        </div>
        <svg className="cy-thread" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-20,90 C200,20 420,110 640,60 S1000,10 1220,70" />
        </svg>
      </header>
      <div className="cy-bar">
        <span className="cy-bar-lab">Style</span>
        <ShareControls {...tools} variant="glass" />
      </div>
      <article className="cy-sheet">
        <span className="cy-corner">
          {v.styleName} {v.styleEdition} · {v.modeLabel}
        </span>
        <Html className="sh-ms cy-ms" html={v.hasDoc ? v.bodyHtml : v.refHtml} />
      </article>
      <section className="sh-wrap cy-sources">
        <div className="cy-sh">
          <div>
            <h2>Sources</h2>
            <p>Each one found in a live database, matched to the sentence it supports.</p>
          </div>
          {v.stats.retracted ? (
            <span className="sh-chip warn">
              <Icon name="alert" /> {plural(v.stats.retracted, 'retracted work')}
            </span>
          ) : (
            <span className="sh-chip ok">
              <Icon name="check" /> No retractions · every link resolves
            </span>
          )}
        </div>
        <div className="cy-cards">
          {v.sources.map((s) => (
            <SourceCard key={s.id} s={s} variant="strip" />
          ))}
        </div>
      </section>
      {v.hasDoc && (
        <section className="sh-wrap cy-bib">
          <h2>{v.listTitle}</h2>
          <Html className="sh-refs" html={v.refHtml} />
        </section>
      )}
      <Cta wide />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4 · Monograph                                                       */
/* ------------------------------------------------------------------ */
export function Monograph({ v, tools }: ThemeProps) {
  const n = v.sources.length;
  const pad = (k: number) => String(k).padStart(2, '0');
  const margin = v.effectiveMode === 'footnotes';
  return (
    <div className="mg">
      <div className="sh-wrap mg-layout">
        <aside className="mg-side sh-sticky">
          <p className="mg-lbl">Contents</p>
          <ul className="mg-toc">
            {v.hasDoc && (
              <li>
                <a href="#sh-manuscript">
                  Manuscript <span>01</span>
                </a>
              </li>
            )}
            <li>
              <a href="#sh-sources">
                Sources <span>02</span>
              </a>
            </li>
            <li>
              <a href="#sh-bibliography">
                {v.listTitle} <span>03</span>
              </a>
            </li>
          </ul>
          <p className="mg-lbl">Trace</p>
          <dl className="mg-dl">
            {v.owner && (
              <div>
                <dt>Shared by</dt>
                <dd>{v.owner}</dd>
              </div>
            )}
            <div>
              <dt>Date</dt>
              <dd>{v.dateShort}</dd>
            </div>
            <div>
              <dt>Style</dt>
              <dd>
                {v.styleName} {v.styleEdition}
              </dd>
            </div>
            <div>
              <dt>Output</dt>
              <dd>{v.modeLabel}</dd>
            </div>
            <div>
              <dt>Sources</dt>
              <dd className={v.stats.retracted ? 'w' : 'v'}>
                {n} · {v.stats.retracted ? `${v.stats.retracted} retracted` : 'all real'}
              </dd>
            </div>
          </dl>
          <p className="mg-lbl">View in</p>
          <ShareControls {...tools} variant="bare" />
        </aside>
        <article className="mg-art">
          <p className="mg-kick">
            <span>Shared trace</span>
            <b>
              ● {n - v.stats.retracted} of {n} records resolve
            </b>
          </p>
          <h1 className="mg-title">{v.title}</h1>
          <p className="mg-abs">
            {plural(v.stats.claims, 'claim')}, {n} <b>real, published {n === 1 ? 'source' : 'sources'}</b>. Each note links to the record it came from. Citezeno matches by topic
            — read each one to confirm it supports the sentence.
          </p>
          {v.hasDoc && (
            <>
              <div className="mg-sec" id="sh-manuscript">
                <h2>01 — Manuscript</h2>
                <span>
                  {v.styleName} {v.styleEdition} · {margin ? 'notes in the margin' : v.modeLabel.toLowerCase()}
                </span>
              </div>
              <Html className="sh-ms mg-ms" html={v.bodyHtml} />
            </>
          )}
          <div className="mg-sec mg-gap" id="sh-sources">
            <h2>02 — Sources</h2>
            <span>{v.stats.providers.join(' · ')}</span>
          </div>
          <table className="mg-tbl">
            <thead>
              <tr>
                <th>№</th>
                <th>Work</th>
                <th>Status</th>
                <th>Found in</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {v.sources.map((s) => (
                <tr key={s.id} data-card="" data-ref={s.n - 1}>
                  <td className="n">{pad(s.n)}</td>
                  <td>
                    <div className="t">{s.title}</div>
                    <Meta s={s} />
                  </td>
                  <td className={s.retracted ? 'bad' : 'ok'}>{s.retracted ? '● retracted' : '● real record'}</td>
                  <td className="db">{s.providers.join(', ')}</td>
                  <td>
                    {s.url && (
                      <a className="go" href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                        Open
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mg-sec mg-gap" id="sh-bibliography">
            <h2>03 — {v.listTitle}</h2>
            <span>{v.numbered ? 'in order of citation' : 'alphabetical'}</span>
          </div>
          <Html className="sh-refs mg-refs" html={v.refHtml} />
          <Cta />
        </article>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5 · Claim Threads                                                   */
/* ------------------------------------------------------------------ */
export function Threads({ v, tools }: ThemeProps) {
  const n = v.sources.length;
  return (
    <div className="th">
      <div className="th-hdr">
        <div className="sh-wrap th-hdr-in">
          <div className="th-id">
            <h1 className="th-h1">
              <span className="ok">
                <Icon name="check" />
              </span>
              {v.title}
            </h1>
            <div className="th-by">
              Shared {sharedBy(v)} · {v.dateText} · {plural(n, 'source')} · {plural(v.stats.claims, 'claim')}
            </div>
          </div>
          <nav className="th-seg" aria-label="Sections">
            <a href="#sh-map">Map</a>
            <a href="#sh-bibliography">{v.listTitle}</a>
          </nav>
          <ShareControls {...tools} variant="dark" />
        </div>
      </div>
      <div className="sh-wrap">
        <section className="th-intro">
          <div>
            <span className="k">Shared trace · every thread leads to a real record</span>
            <h2>
              {plural(v.stats.claims, 'claim')}, {n} {n === 1 ? 'source' : 'sources'} you can open.
            </h2>
            <p>Hover a cited sentence to follow its thread to the record that supports it. Thicker threads mean a stronger topical match.</p>
          </div>
          <div className="th-legend">
            <span>
              <i className="w" />
              strong match
            </span>
            <span>
              <i />
              good
            </span>
            <span>
              <i className="t" />
              weak
            </span>
          </div>
        </section>
        <section className="th-map" id="sh-map">
          <ThreadLines />
          <article className="th-paper">
            <span className="th-corner">
              {v.styleName} {v.styleEdition} · {v.modeLabel}
            </span>
            <Html className="sh-ms th-ms" html={v.hasDoc ? v.bodyHtml : v.refHtml} />
          </article>
          <aside className="th-col sh-sticky">
            <div className="th-ch">
              <h3>Sources</h3>
              <span>
                {n} · {v.stats.retracted ? `${v.stats.retracted} retracted` : 'all real records'}
              </span>
            </div>
            {v.sources.map((s) => (
              <SourceCard key={s.id} s={s} variant="dark" bar />
            ))}
          </aside>
        </section>
        {v.hasDoc && (
          <section className="th-bib" id="sh-bibliography">
            <h2>{v.listTitle}</h2>
            <p className="th-sub">
              {v.styleName}, {v.styleEdition} · {plural(n, 'entry', 'entries')}
            </p>
            <Html className="sh-refs" html={v.refHtml} />
          </section>
        )}
      </div>
      <Cta wide />
    </div>
  );
}
