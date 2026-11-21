'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../Icon';
import { toast } from '../../toast';
import { Details } from '../../reader/Details';
import { LeftPanel } from '../../reader/LeftPanel';
import { NoPdf } from '../../reader/NoPdf';
import { PdfPane, type FindCount, type PdfControls } from '../../reader/pdf/PdfPane';
import { FindBar } from '../../reader/TopBar';
import { usePassages } from '../../reader/ai/usePassages';
import { Annotator } from '../../reader/annotations/Annotator';
import type { Flash } from '../../reader/annotations/AnnotationLayer';
import { NotesPanel } from '../../reader/annotations/NotesPanel';
import { useAnnotations } from '../../reader/annotations/useAnnotations';
import { uploadForPaper } from '../../reader/upload';
import { FileHeader } from './FileHeader';
import { FileToolbar } from './FileToolbar';
import type { Jump } from './panel-state';
import { useReaderData } from './useReaderData';

/* One open file beside the chat: the reader's own PDF view, highlights,
   selection menu (Ask and Explain go to the chat box), passages, notes and
   details, in a compact frame. Papers without a PDF show their details and
   abstract, with the reader's upload. */

type Aside = 'notes' | 'details' | null;
const QUICK = [
  { label: 'Summarize', ask: 'Summarize this paper', icon: 'sparkle' as const },
  { label: 'Key findings', ask: 'What are the key findings of this paper?' },
  { label: 'Limitations', ask: 'What are the limitations of this paper?' },
];

export function FileView({
  paperId,
  jump,
  onJumped,
  onNamed,
  onAsk,
  onClose,
}: {
  paperId: string;
  jump: Jump | null;
  onJumped(): void;
  onNamed(title: string): void;
  /* put a question about this paper in the chat box */
  onAsk(text: string): void;
  onClose(): void;
}) {
  const [pdf, setPdf] = useState<PdfControls | null>(null);
  const [pdfError, setPdfError] = useState<'load' | 'password' | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const { data, setData, error, retry } = useReaderData(paperId, pdf ? page : null, pdf?.pageCount ?? null);
  const [thumbs, setThumbs] = useState(false);
  const [leftTab, setLeftTab] = useState<'pages' | 'contents'>('pages');
  const [aside, setAside] = useState<Aside>(null);
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<{ count: FindCount | null; notFound: boolean }>({ count: null, notFound: false });
  const [uploading, setUploading] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (data) onNamed(data.paper.title);
  }, [data, onNamed]);

  // highlights and notes, as in the reader
  const [rendered, setRendered] = useState<Set<number>>(new Set());
  const [tick, setTick] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const pdfKey = data && data.pdf.kind !== 'none' ? data.pdf.key : null;
  const onAutoSaved = useCallback((itemId: string) => setData((d) => (d && !d.shelf ? { ...d, shelf: { itemId, readingStatus: 'reading' } } : d)), [setData]);
  const ann = useAnnotations(paperId, pdfKey, onAutoSaved);
  useEffect(() => setRendered(new Set()), [pdf]);
  const onPageRendered = useCallback((n: number) => {
    setRendered((r) => (r.has(n) ? r : new Set(r).add(n)));
    setTick((t) => t + 1);
  }, []);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const passages = usePassages(paperId, null, data?.text?.status === 'ready');
  const jumpTo = useCallback(
    (target: { page: number; rects?: { x: number; y: number; w: number; h: number }[] }) => {
      if (!pdf) return;
      pdf.reveal(target.page, target.rects?.[0]);
      if (target.rects?.length) setFlash({ page: target.page, rects: target.rects, key: Date.now() });
    },
    [pdf],
  );

  // a passage link in an answer: once the PDF and its passages are in, go there
  useEffect(() => {
    if (!jump || jump.paperId !== paperId || !pdf || !data) return;
    if (data.text?.status !== 'ready') {
      onJumped();
      return;
    }
    const p = passages.get(jump.passageId);
    if (!p) {
      if (passages.size) {
        toast('That passage isn’t in this copy of the PDF.', true);
        onJumped();
      }
      return;
    }
    jumpTo({ page: p.page, rects: [{ x: p.box.x, y: p.box.y, w: p.box.w, h: p.box.h }] });
    onJumped();
  }, [jump, paperId, pdf, data, passages, jumpTo, onJumped]);

  // Ctrl F while working in the panel searches the PDF
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && pdf && rootRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        setFinding(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pdf]);

  const upload = async (file: File) => {
    if (!data) return;
    if (file.type && file.type !== 'application/pdf') return toast('Please choose a PDF file.', true);
    setUploading(0);
    try {
      await uploadForPaper(data, file, setUploading);
      toast('Uploaded. Your copy opens now.');
      setPdf(null);
      retry();
    } catch (e) {
      toast((e as Error).message || 'The upload failed. Please try again.', true);
    } finally {
      setUploading(null);
    }
  };

  const hasPdf = !!data && data.pdf.kind !== 'none';
  const textOk = data?.text?.status !== 'no_text';
  const quote = (q: string) => (q.length > 160 ? `${q.slice(0, 160).trimEnd()}…` : q);

  return (
    <section className="cf-file" ref={rootRef} aria-label={data ? data.paper.title : 'Opening the file'} tabIndex={-1}>
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <FileHeader
        data={data}
        pages={pdf?.pageCount ?? data?.text?.pageCount ?? null}
        details={aside === 'details'}
        onDetails={() => setAside((a) => (a === 'details' ? null : 'details'))}
        onSaved={(itemId) => setData((d) => (d ? { ...d, shelf: d.shelf ?? { itemId, readingStatus: 'to_read' } } : d))}
        onClose={onClose}
      />
      {hasPdf && !pdfError && (
        <FileToolbar
          pdf={pdf}
          page={page}
          scale={scale}
          thumbs={thumbs}
          notes={aside === 'notes'}
          onThumbs={() => setThumbs((t) => !t)}
          onFind={() => setFinding((f) => !f)}
          onNotes={() => setAside((a) => (a === 'notes' ? null : 'notes'))}
        />
      )}

      <div className="cf-body">
        {hasPdf && thumbs && !pdfError && <LeftPanel pdf={pdf} page={page} tab={leftTab} onTab={setLeftTab} />}
        <div className="cf-doc rd-center">
          {error ? (
            <div className="cf-state">
              <Icon name="alert" />
              <b>The file couldn’t be opened.</b>
              <p>{error.message}</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={retry}>
                <Icon name="undo" /> Try again
              </button>
            </div>
          ) : !data ? (
            <div className="cf-skel" aria-busy="true" aria-label="Opening the file">
              <span />
              <span />
            </div>
          ) : !hasPdf ? (
            <NoPdf data={data} onUpload={() => fileRef.current?.click()} onRetry={retry} uploading={uploading} />
          ) : pdfError ? (
            <div className="cf-state">
              <Icon name="alert" />
              <b>{pdfError === 'password' ? 'This PDF is password-protected.' : 'We couldn’t load this PDF.'}</b>
              <p>Try again, or open it in the full reader to upload your own copy.</p>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setPdfError(null);
                  retry();
                }}
              >
                <Icon name="undo" /> Try again
              </button>
            </div>
          ) : (
            <>
              {finding && pdf && <FindBar pdf={pdf} count={found.count} notFound={found.notFound} onClose={() => setFinding(false)} />}
              <PdfPane
                key={data.pdf.kind !== 'none' ? data.pdf.url : 'none'}
                url={data.pdf.kind !== 'none' ? data.pdf.url : ''}
                initialPage={data.position?.page ?? 1}
                initialScale="page-width"
                onReady={setPdf}
                onPage={setPage}
                onScale={setScale}
                onFind={(count, notFound) => setFound({ count, notFound })}
                onError={setPdfError}
                onPageRendered={onPageRendered}
              />
              {pdf && (
                <Annotator
                  pdf={pdf}
                  pdfKey={pdfKey}
                  ann={ann}
                  rendered={rendered}
                  tick={tick}
                  canHighlight={textOk}
                  placing={placing}
                  onPlacing={setPlacing}
                  flash={flash}
                  onMissing={setMissing}
                  onAsk={(q, a) => onAsk(`About this passage on page ${a.page}: “${quote(q)}”\n\n`)}
                  onExplain={textOk ? (q, a) => onAsk(`Explain this passage from page ${a.page} in plain words: “${quote(q)}”`) : undefined}
                />
              )}
              {!pdf && (
                <div className="rd-pdf-loading" aria-label="Loading the PDF">
                  <span className="spin" />
                </div>
              )}
            </>
          )}
          {data && !error && (
            <div className="cf-quick" role="group" aria-label="Ask about this paper">
              {QUICK.map((q, i) => (
                <button key={q.label} type="button" className={i === 0 ? 'is-go' : undefined} onClick={() => onAsk(q.ask)}>
                  {q.icon && <Icon name={q.icon} />} {q.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {aside && data && (
          <aside className="cf-aside" aria-label={aside === 'notes' ? 'Highlights and notes' : 'Paper details'}>
            {aside === 'notes' ? (
              <NotesPanel
                paperId={data.paper.id}
                ann={ann}
                missing={missing}
                disabled={!hasPdf ? 'Highlights and page notes need a PDF.' : !textOk ? 'This PDF has no text layer, so text can’t be highlighted. Page notes still work.' : null}
                placing={placing}
                onPlace={setPlacing}
                onJump={({ page: pg, highlight, note }) =>
                  jumpTo({ page: pg, rects: highlight ? highlight.rects : note ? [{ x: Math.max(0, note.x - 0.02), y: Math.max(0, note.y - 0.01), w: 0.04, h: 0.03 }] : undefined })
                }
              />
            ) : (
              <Details data={data} />
            )}
          </aside>
        )}
      </div>
      {uploading != null && hasPdf && <div className="rd-upload-pill">Uploading… {Math.round(uploading * 100)}%</div>}
    </section>
  );
}
