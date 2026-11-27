'use client';

import { useState } from 'react';
import type { DocOptions } from '@/lib/docmodel';
import { EXPORTS, exportText, type ExportFormat, type Rendered } from '@/lib/engine';
import { Icon } from '../Icon';
import { copyText } from '../Specimens';
import { Select } from '../Select';

export function ExportPanel({
  rendered,
  doc,
  setDoc,
  onWord,
  onPdf,
  busy,
  style,
  cloud,
}: {
  rendered: Rendered;
  doc: DocOptions;
  setDoc: (p: Partial<DocOptions>) => void;
  onWord: () => void;
  onPdf: () => void;
  busy: '' | 'word' | 'pdf' | 'cloud';
  style: string;
  /* a connected app that keeps editable documents (Google Docs), when one can be connected here */
  cloud?: { label: string; connected: boolean; connectHref: string; onSave: () => void } | null;
}) {
  const [fmt, setFmt] = useState<ExportFormat>('bibtex');

  const download = () => {
    const meta = EXPORTS[fmt];
    const blob = new Blob([exportText(fmt, rendered)], { type: meta.mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `citezeno-${style}.${meta.ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const preview = doc.contents === 'refs' ? rendered.refHtml : rendered.docHtml;

  return (
    <div className="xp">
      <section className="xp-doc">
        <div className="xp-form">
          <h3 className="h3">Download a document</h3>
          <p className="small">A finished file with your citations, notes and reference list, ready to submit or keep editing.</p>

          <div className="xp-fields">
            <label className="field span2">
              Title
              <input className="input" value={doc.title} onChange={(e) => setDoc({ title: e.target.value })} placeholder="Untitled manuscript" />
            </label>
            <label className="field span2">
              Author
              <input className="input" value={doc.author} onChange={(e) => setDoc({ author: e.target.value })} placeholder="Your name (optional)" />
            </label>
            <label className="field span2">
              Contents
              <div className="seg seg-full" role="group" aria-label="Contents">
                <button type="button" aria-pressed={doc.contents === 'full'} onClick={() => setDoc({ contents: 'full' })}>
                  Full manuscript
                </button>
                <button type="button" aria-pressed={doc.contents === 'refs'} onClick={() => setDoc({ contents: 'refs' })}>
                  Reference list only
                </button>
              </div>
            </label>
            <label className="field">
              Paper
              <Select<DocOptions['paper']>
                value={doc.paper}
                onChange={(paper) => setDoc({ paper })}
                options={[
                  { value: 'a4', label: 'A4' },
                  { value: 'letter', label: 'US Letter' },
                ]}
              />
            </label>
            <label className="field">
              Text size
              <Select<DocOptions['fontSize']>
                value={doc.fontSize}
                onChange={(fontSize) => setDoc({ fontSize })}
                options={[
                  { value: 11, label: '11 pt' },
                  { value: 12, label: '12 pt' },
                ]}
              />
            </label>
            <label className="field">
              Line spacing
              <Select<DocOptions['spacing']>
                value={doc.spacing}
                onChange={(spacing) => setDoc({ spacing })}
                options={[
                  { value: 1, label: 'Single' },
                  { value: 1.5, label: '1.5 lines' },
                  { value: 2, label: 'Double' },
                ]}
              />
            </label>
            <label className="check" style={{ alignSelf: 'end', paddingBottom: 10 }}>
              <input type="checkbox" checked={doc.titleBlock} onChange={(e) => setDoc({ titleBlock: e.target.checked })} />
              Title and date at the top
            </label>
          </div>

          <div className="xp-go">
            <button className="xp-tile" onClick={onWord} disabled={!!busy}>
              <span className="xp-ico word"><Icon name="word" /></span>
              <span>
                <b>{busy === 'word' ? 'Preparing…' : 'Download Word'}</b>
                <small>.docx with real footnotes, for Word and Google Docs</small>
              </span>
            </button>
            <button className="xp-tile" onClick={onPdf} disabled={!!busy}>
              <span className="xp-ico pdf"><Icon name="pdf" /></span>
              <span>
                <b>{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</b>
                <small>Print-ready, with clickable links and page numbers</small>
              </span>
            </button>
            {cloud &&
              (cloud.connected ? (
                <button className="xp-tile" onClick={cloud.onSave} disabled={!!busy}>
                  <span className="xp-ico word"><Icon name="word" /></span>
                  <span>
                    <b>{busy === 'cloud' ? 'Saving…' : 'Save to Google Docs'}</b>
                    <small>An editable copy in your {cloud.label}</small>
                  </span>
                </button>
              ) : (
                <a className="xp-tile" href={cloud.connectHref}>
                  <span className="xp-ico word"><Icon name="word" /></span>
                  <span>
                    <b>Save to Google Docs</b>
                    <small>Connect {cloud.label} first</small>
                  </span>
                </a>
              ))}
          </div>
        </div>

        <div className="xp-preview" aria-hidden="true">
          <div className={`xp-page ${doc.paper}`} style={{ ['--sp' as string]: doc.spacing, ['--fs' as string]: `${doc.fontSize}px` } as React.CSSProperties}>
            {doc.titleBlock && (
              <div className="xp-titleblock">
                <b>{doc.title || 'Untitled manuscript'}</b>
                <span>{[doc.author, new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })].filter(Boolean).join(', ')}</span>
              </div>
            )}
            <div className="xp-body" dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
          <p className="small">First page preview</p>
        </div>
      </section>

      <section className="xp-mgr">
        <div className="panel-tools">
          <div>
            <h3 className="h3">Reference manager formats</h3>
            <p className="small" style={{ margin: '4px 0 0' }}>{EXPORTS[fmt].hint}</p>
          </div>
          <div className="panel-btns">
            <div className="seg" role="group" aria-label="Export format">
              {(Object.keys(EXPORTS) as ExportFormat[]).map((k) => (
                <button key={k} aria-pressed={fmt === k} onClick={() => setFmt(k)}>
                  {EXPORTS[k].label}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => copyText(exportText(fmt, rendered))}>
              <Icon name="copy" /> Copy
            </button>
            <button className="btn btn-sm" onClick={download}>
              <Icon name="download" /> .{EXPORTS[fmt].ext}
            </button>
          </div>
        </div>
        <pre className="code">{rendered.list.length || fmt === 'text' ? exportText(fmt, rendered) : 'No sources to export yet.'}</pre>
      </section>
    </div>
  );
}
