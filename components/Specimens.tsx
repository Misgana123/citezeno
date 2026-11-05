'use client';

import { useState } from 'react';
import { SPECIMENS, STYLE_GROUPS, STYLES, plain, specimen } from '@/lib/styles';
import { Icon } from './Icon';
import { toast } from './toast';

type K = keyof typeof SPECIMENS;
const KINDS: [K, string][] = [
  ['article', 'Journal article'],
  ['book', 'Book'],
  ['web', 'Web page'],
];

export async function copyText(plainText: string, html?: string) {
  try {
    if (html && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ]);
    } else await navigator.clipboard.writeText(plainText);
    toast('Copied to the clipboard');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = plainText;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      /* noop */
    }
    ta.remove();
    toast(ok ? 'Copied to the clipboard' : 'The browser blocked copying. Select the text and copy it manually.', !ok);
  }
}

export function KindSwitch({ kind, setKind }: { kind: K; setKind: (k: K) => void }) {
  return (
    <div className="seg" role="group" aria-label="Source type">
      {KINDS.map(([k, label]) => (
        <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function IndexCard({ styleId, kind }: { styleId: string; kind: K }) {
  const sp = specimen(styleId, SPECIMENS[kind]);
  return (
    <article className="icard" aria-live="polite">
      <div className="icard-head">
        <b>{sp.style.name}</b>
        <span>{sp.style.edition}</span>
      </div>
      <div className="icard-copy">
        <button onClick={() => copyText(plain(sp.entry), `<p style="padding-left:2em;text-indent:-2em">${sp.entry}</p>`)}>
          <Icon name="copy" /> Copy
        </button>
      </div>
      <p className="icard-ref" dangerouslySetInnerHTML={{ __html: sp.entry }} />
      <div className="icard-in">
        <span>{sp.inTextLabel}</span>
        <span
          dangerouslySetInnerHTML={{
            __html:
              sp.style.family === 'numeric'
                ? `…as shown in recent work${sp.style.marker === 'sup' ? `<sup>${sp.inText}</sup>.` : ` ${sp.inText}.`}`
                : sp.inText,
          }}
        />
      </div>
    </article>
  );
}

export function Specimens() {
  const [styleId, setStyleId] = useState('apa');
  const [kind, setKind] = useState<K>('article');
  return (
    <div className="spec">
      <div className="spec-list">
        {STYLE_GROUPS.map(([g, ids]) => (
          <div className="spec-group" key={g}>
            <h4>{g}</h4>
            <ul>
              {ids.map((id) => (
                <li key={id}>
                  <button aria-pressed={styleId === id} onClick={() => setStyleId(id)}>
                    {STYLES[id].name}
                    <small>{STYLES[id].edition}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="spec-stage">
        <KindSwitch kind={kind} setKind={setKind} />
        <IndexCard styleId={styleId} kind={kind} />
      </div>
    </div>
  );
}
