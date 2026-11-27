import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { headingId, type DocBlock } from '@/lib/docs';
import { CopyButton } from './CopyButton';

/* Renders an article's blocks (lib/docs.ts). Text supports **bold**, `code` and [links](/path). */

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = m.index;
    if (m[1]) out.push(<strong key={k}>{m[1]}</strong>);
    else if (m[2]) out.push(<code key={k}>{m[2]}</code>);
    else
      out.push(
        <Link key={k} className="lk" href={m[4]}>
          {m[3]}
        </Link>,
      );
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const TONE: Record<'tip' | 'note' | 'warn', IconName> = { tip: 'bulb', note: 'info', warn: 'alert' };

/* a stand-in app window, used until a guide has its real screenshot */
export function DocWindow() {
  return (
    <div className="dk-win" aria-hidden="true">
      <div className="dk-win-body">
        <div className="dk-win-side">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="dk-win-main">
          <i />
          <i />
          <i style={{ width: '85%' }} />
          <i className="card" />
          <i />
          <i style={{ width: '70%' }} />
          <i className="card" />
        </div>
      </div>
    </div>
  );
}

export function DocBlocks({ blocks }: { blocks: DocBlock[] }) {
  let fig = 0;
  return (
    <div className="dk-prose">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'p':
            return <p key={i}>{inline(b.text)}</p>;
          case 'h2':
          case 'h3': {
            const id = headingId(b.text);
            const H = b.type;
            return (
              <H key={i} id={id}>
                {b.type === 'h2' && (
                  <a className="anc" href={`#${id}`} aria-hidden="true" tabIndex={-1}>
                    #
                  </a>
                )}
                {b.text}
              </H>
            );
          }
          case 'list':
            return (
              <ul key={i} className="dots">
                {b.items.map((t) => (
                  <li key={t}>{inline(t)}</li>
                ))}
              </ul>
            );
          case 'steps':
            return (
              <ol key={i} className="dk-steps">
                {b.items.map((s) => (
                  <li key={s.title}>
                    <div>
                      <b>{s.title}</b>
                      <p>{inline(s.text)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            );
          case 'callout':
            return (
              <div key={i} className={`co ${b.tone}`}>
                <span className="co-ico">
                  <Icon name={TONE[b.tone]} className="ic" />
                </span>
                <div>
                  <b>{b.title}</b>
                  {inline(b.text)}
                </div>
              </div>
            );
          case 'figure':
            fig++;
            return (
              <figure key={i} className="fig">
                <div className="fig-frame">
                  {b.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.src} alt={b.alt ?? ''} />
                  ) : (
                    <DocWindow />
                  )}
                  {b.pins?.map((p, n) => (
                    <span key={n} className="fig-pin" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                      {n + 1}
                    </span>
                  ))}
                </div>
                <figcaption>
                  <i>FIG. {fig}</i> {b.caption}
                </figcaption>
              </figure>
            );
          case 'table':
            return (
              <div key={i} className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      {b.head.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, n) => (
                      <tr key={n}>
                        {r.map((c, m) => (
                          <td key={m}>
                            {c === true ? (
                              <span className="dk-yes" aria-label="Yes">
                                <Icon name="check" className="ic" />
                              </span>
                            ) : c === false ? (
                              <span aria-label="No">—</span>
                            ) : (
                              inline(c)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'keys':
            return (
              <div key={i} className="dk-keys">
                {b.items.map((k) => (
                  <div key={k.label}>
                    {k.label}
                    <span>
                      {k.keys.map((x) => (
                        <kbd key={x} className="dk-kbd">
                          {x}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            );
          case 'code':
            return (
              <div key={i} className="dk-code">
                <div className="dk-code-top">
                  <span>{b.file}</span>
                  <CopyButton text={b.code} />
                </div>
                <pre>{b.code}</pre>
              </div>
            );
        }
      })}
    </div>
  );
}
