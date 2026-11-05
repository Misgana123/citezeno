'use client';

import type { Rendered } from '@/lib/engine';
import type { Result } from '@/lib/types';
import { PROVIDER_COLOR, TYPE_LABEL, scoreFor, strengthOf } from './SourceCards';

function Bars({ rows, color }: { rows: { label: string; n: number; color?: string }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="bars-l">{r.label}</span>
          <span className="bars-t">
            <i style={{ width: `${(r.n / max) * 100}%`, background: r.color || color }} />
          </span>
          <span className="bars-n">{r.n}</span>
        </li>
      ))}
    </ul>
  );
}

export function Insights({ result, rendered }: { result: Result; rendered: Rendered }) {
  const list = rendered.list;
  if (!list.length) return <p className="empty-note">Insights appear once at least one source is selected.</p>;

  const scores = list.map((s) => scoreFor(result, s.id!).score).filter((x): x is number => x != null);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const strengthRows = (['strong', 'good', 'weak'] as const).map((k) => ({
    label: { strong: 'Strong', good: 'Good', weak: 'Weak' }[k],
    n: scores.filter((x) => strengthOf(x).key === k).length,
    color: { strong: 'var(--verify)', good: 'var(--thread)', weak: 'var(--warn)' }[k],
  }));

  const prov = new Map<string, number>();
  list.forEach((s) => (s.providers || [s.provider]).forEach((p) => prov.set(p, (prov.get(p) || 0) + 1)));
  const types = new Map<string, number>();
  list.forEach((s) => types.set(TYPE_LABEL[s.type] || 'Work', (types.get(TYPE_LABEL[s.type] || 'Work') || 0) + 1));

  const cited = result.claims.filter((c) => c.ids.length).length;
  const sentences = result.analysis.sentences.length;
  const years = list.map((s) => s.year).filter((y): y is number => !!y);
  const yMin = years.length ? Math.min(...years) : 0;
  const yMax = years.length ? Math.max(...years) : 0;
  const span = Math.max(1, yMax - yMin);
  const median = years.length ? years.slice().sort((a, b) => a - b)[Math.floor(years.length / 2)] : null;
  const topCited = list.filter((s) => s.provider !== 'Open Library').sort((a, b) => (b.citedBy || 0) - (a.citedBy || 0))[0];
  const oa = list.filter((s) => s.oa).length;

  return (
    <div className="ins">
      <div className="ins-tile ins-wide">
        <h3>Coverage</h3>
        <div className="ins-big">
          <b>{cited}</b>
          <span>of {result.claims.length} chosen claims have a source, across {sentences} sentences in the draft.</span>
        </div>
        <div className="cover" aria-hidden="true">
          {result.analysis.sentences.map((s) => {
            const c = result.claims.find((x) => x.sid === s.index);
            return <i key={s.index} className={c ? (c.ids.length ? 'yes' : 'miss') : ''} title={s.text} />;
          })}
        </div>
        <p className="small">Each mark is one sentence: filled marks are cited claims, outlined marks are claims with no source found.</p>
      </div>

      <div className="ins-tile">
        <h3>Match strength</h3>
        <div className="ins-big">
          <b>{Math.round(avg * 100)}%</b>
          <span>average overlap between claim and source</span>
        </div>
        <Bars rows={strengthRows} />
      </div>

      <div className="ins-tile">
        <h3>Where the sources came from</h3>
        <Bars rows={[...prov.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n, color: PROVIDER_COLOR[label] }))} />
        <p className="small">A source found in two databases counts once for each.</p>
      </div>

      <div className="ins-tile ins-wide">
        <h3>Publication years</h3>
        {years.length ? (
          <>
            <div className="years">
              {list.map((s) =>
                s.year ? (
                  <a
                    key={s.id}
                    href={s.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="years-dot"
                    style={{ left: `${((s.year - yMin) / span) * 100}%`, background: PROVIDER_COLOR[s.provider] }}
                    title={`${s.title} (${s.year})`}
                  />
                ) : null,
              )}
              <span className="years-axis">
                <span>{yMin}</span>
                <span>{yMax}</span>
              </span>
            </div>
            <p className="small">Median year {median}. {years.length < list.length ? `${list.length - years.length} of the sources ${list.length - years.length === 1 ? 'has' : 'have'} no date.` : ''}</p>
          </>
        ) : (
          <p className="small">None of the sources has a publication year.</p>
        )}
      </div>

      <div className="ins-tile">
        <h3>Kinds of work</h3>
        <Bars rows={[...types.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n }))} color="var(--prussian)" />
        <p className="small">{oa} of {list.length} are open access.</p>
      </div>

      {topCited && (topCited.citedBy || 0) > 0 && (
        <div className="ins-tile">
          <h3>Most cited in your list</h3>
          <p className="ins-title serif">
            <a href={topCited.url} target="_blank" rel="noopener noreferrer">{topCited.title}</a>
          </p>
          <p className="small">Cited {topCited.citedBy!.toLocaleString()} times, published {topCited.year || 'with no date'}.</p>
        </div>
      )}
    </div>
  );
}
