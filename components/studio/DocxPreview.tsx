'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';

/* The .docx the user opened, kept in memory for this session only (never uploaded or saved). */
export type OriginalDoc = { name: string; data: ArrayBuffer };

/* A read-only, formatted preview of the original Word file, rendered in the
   browser by docx-preview. The library is only downloaded when this mounts,
   i.e. after a .docx has been opened and its preview is viewed. */
export function DocxPreview({ doc }: { doc: OriginalDoc }) {
  const host = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const styles = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let alive = true;
    const el = body.current;
    const css = styles.current;
    if (!el || !css) return;
    setState('loading');
    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        if (!alive) return;
        el.innerHTML = '';
        css.innerHTML = '';
        await renderAsync(doc.data.slice(0), el, css, {
          className: 'docx',
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderComments: false,
          useBase64URL: false,
          experimental: false,
        });
        if (!alive) return;
        // read-only and safe: links open in a new tab, script links are dropped
        el.querySelectorAll('a').forEach((a) => {
          const href = a.getAttribute('href') || '';
          if (href && !/^(https?:|mailto:|#)/i.test(href)) a.removeAttribute('href');
          else if (!href.startsWith('#')) {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
          }
        });
        setState('ready');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => {
      alive = false;
      // images are blob: URLs; let the browser free them
      el.querySelectorAll('img').forEach((img) => img.src.startsWith('blob:') && URL.revokeObjectURL(img.src));
    };
  }, [doc]);

  /* fit the Word page width to the panel */
  useEffect(() => {
    const h = host.current;
    if (!h) return;
    const fit = () => {
      const page = body.current?.querySelector<HTMLElement>('section.docx');
      if (!page || !h.clientWidth) return;
      setZoom(Math.min(1, (h.clientWidth - 24) / (page.offsetWidth + 24)));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(h);
    if (state === 'ready') fit();
    return () => ro.disconnect();
  }, [state]);

  return (
    <div className="oprev" ref={host}>
      <p className="oprev-note">
        <Icon name="doc" />
        <span>
          <b>Preview only.</b> Edit your text in the editor, or update your Word file and open it again.
          <small>{doc.name} · shown from memory, never uploaded</small>
        </span>
      </p>
      {state === 'loading' && (
        <div className="oprev-state">
          <span className="spin" aria-hidden="true" /> Rendering the original formatting…
        </div>
      )}
      {state === 'error' && (
        <div className="oprev-state err" role="alert">
          <Icon name="alert" />
          <span>
            <b>We couldn’t show a preview of this file.</b> Its text is still in the editor, so you can keep working.
          </span>
        </div>
      )}
      <div className="oprev-scroll" hidden={state === 'error'} aria-busy={state === 'loading'}>
        <div ref={styles} />
        <div className="oprev-doc" ref={body} style={{ ['--z' as string]: zoom } as React.CSSProperties} aria-label={`Formatted preview of ${doc.name}`} />
      </div>
    </div>
  );
}
