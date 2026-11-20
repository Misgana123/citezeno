import { Fragment, type ReactNode } from 'react';
import { blocks, inlineTokens, type Inline } from './markdown-parse';

/* The assistant's replies, built as React elements: no HTML from the model
   ever reaches the page. */

/* How a [n] citation shows: a chip linked to paper n of this reply. */
export type CiteRender = (n: number, key: number) => ReactNode;

function render(tokens: Inline[], cite?: CiteRender): ReactNode[] {
  return tokens.map((t, i) => {
    if (t.kind === 'cite') return cite ? cite(t.n, i) : <Fragment key={i}>[{t.n}]</Fragment>;
    if (t.kind === 'text') return <Fragment key={i}>{t.text}</Fragment>;
    if (t.kind === 'code') return <code key={i}>{t.text}</code>;
    if (t.kind === 'strong') return <strong key={i}>{render(t.children, cite)}</strong>;
    if (t.kind === 'em') return <em key={i}>{render(t.children, cite)}</em>;
    return (
      <a key={i} href={t.href} target="_blank" rel="noopener noreferrer">
        {t.text}
      </a>
    );
  });
}

export function Markdown({ text, cite }: { text: string; cite?: CiteRender }) {
  const inline = (t: string) => render(inlineTokens(t), cite);
  return (
    <div className="ch-md">
      {blocks(text).map((b, i) =>
        b.kind === 'h' ? (
          <p key={i} className="ch-md-h">
            {inline(b.text)}
          </p>
        ) : b.kind === 'p' ? (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        ) : b.kind === 'ul' ? (
          <ul key={i}>
            {b.items.map((t, j) => (
              <li key={j}>{inline(t)}</li>
            ))}
          </ul>
        ) : (
          <ol key={i}>
            {b.items.map((t, j) => (
              <li key={j}>{inline(t)}</li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
