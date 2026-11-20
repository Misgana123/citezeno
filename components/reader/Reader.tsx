'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { shelfFetch } from '../shelf/api';
import { toast } from '../toast';
import { useMediaQuery } from '../useMediaQuery';
import { usePersistent } from '../usePersistent';
import { ReaderApiError, readerFetch, readerUrl, type ReaderData, type ReaderTextState } from './api';
import { Details, originalHref, RetractedNotice } from './Details';
import { LeftPanel } from './LeftPanel';
import { NoPdf } from './NoPdf';
import { PdfPane, type FindCount, type PdfControls } from './pdf/PdfPane';
import { RIGHT_TABS, RightPanel, type RightTab } from './RightPanel';
import { FindBar, MoreMenu, TopBar } from './TopBar';
import { Annotator } from './annotations/Annotator';
import type { Flash } from './annotations/AnnotationLayer';
import { NotesPanel } from './annotations/NotesPanel';
import { ExplainList, type ExplainItem } from './ai/ExplainList';
import { SummaryCard } from './ai/SummaryCard';
import { usePassages } from './ai/usePassages';
import { useAnnotations } from './annotations/useAnnotations';
import { removeFromShelf, uploadForPaper } from './upload';

/* The reader page: the PDF in the middle, pages and contents on the left, and
   Chat, Notes and Details on the right. Tablets get the right panel as a
   drawer; phones get a bottom bar that opens each panel as a sheet. */

type Layout = { left: boolean; right: boolean; width: number; tab: RightTab; leftTab: 'pages' | 'contents' };
const LAYOUT: Layout = { left: true, right: true, width: 380, tab: 'details', leftTab: 'pages' };
const clampWidth = (w: number) => Math.min(640, Math.max(300, Math.round(w)));

export function Reader({ paperId, pdfId = null, slots }: { paperId: string; pdfId?: string | null; slots?: { chat?: ReactNode; notes?: ReactNode; summary?: ReactNode } }) {
  const router = useRouter();
  const [data, setData] = useState<ReaderData | null>(null);
  const [error, setError] = useState<ReaderApiError | null>(null);
  const [reload, setReload] = useState(0);
  const [layout, setLayout] = usePersistent<Layout>('reader:layout', LAYOUT, (s) => ({ ...LAYOUT, ...s, width: clampWidth(s.width ?? LAYOUT.width) }));
  const tablet = useMediaQuery('(max-width: 1100px)');
  const phone = useMediaQuery('(max-width: 700px)');
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState<RightTab | null>(null);
  const [leftDrawer, setLeftDrawer] = useState(false);

  const [pdf, setPdf] = useState<PdfControls | null>(null);
  const [pdfError, setPdfError] = useState<'load' | 'password' | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<{ count: FindCount | null; notFound: boolean }>({ count: null, notFound: false });
  const [uploading, setUploading] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // highlights and notes
  const [rendered, setRendered] = useState<Set<number>>(new Set());
  const [tick, setTick] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [autoSaved, setAutoSaved] = useState<string | null>(null);
  const pdfKey = data && data.pdf.kind !== 'none' ? data.pdf.key : null;
  const onAutoSaved = useCallback((itemId: string) => {
    setAutoSaved(itemId);
    setData((d) => (d && !d.shelf ? { ...d, shelf: { itemId, readingStatus: 'reading' } } : d));
  }, []);
  const ann = useAnnotations(paperId, pdfKey, onAutoSaved);
  // a new PDF (after an upload) starts with no pages drawn
  useEffect(() => setRendered(new Set()), [pdf]);
  const onPageRendered = useCallback((n: number) => {
    setRendered((r) => (r.has(n) ? r : new Set(r).add(n)));
    setTick((t) => t + 1);
  }, []);
  useEffect(() => {
    if (!autoSaved) return;
    const t = setTimeout(() => setAutoSaved(null), 9000);
    return () => clearTimeout(t);
  }, [autoSaved]);
  const undoSave = async () => {
    const itemId = autoSaved;
    setAutoSaved(null);
    if (!itemId || !data) return;
    try {
      await removeFromShelf(data.paper.id, itemId);
      setData((d) => (d ? { ...d, shelf: null } : d));
      toast('Removed from your shelf. Your highlights and notes are kept.');
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  // AI: passages for citation links, Explain answers
  const textReady = data?.text?.status === 'ready';
  const passages = usePassages(paperId, pdfId, textReady);
  const [explains, setExplains] = useState<ExplainItem[]>([]);
  /* Jump to a place in the PDF and flash it (a highlight, a note, or a cited passage). */
  const jumpTo = useCallback(
    (target: { page: number; rects?: { x: number; y: number; w: number; h: number }[] }) => {
      if (!pdf) return;
      setSheet(null);
      pdf.reveal(target.page, target.rects?.[0]);
      if (target.rects?.length) setFlash({ page: target.page, rects: target.rects, key: Date.now() });
    },
    [pdf],
  );

  // load (and reload after an upload or a retry)
  useEffect(() => {
    const ctl = new AbortController();
    setError(null);
    readerFetch<ReaderData>(readerUrl(paperId, pdfId ? `?pdf=${encodeURIComponent(pdfId)}` : ''), { signal: ctl.signal })
      .then((d) => {
        setData(d);
        setPdfError(null);
      })
      .catch((e) => (e as Error)?.name !== 'AbortError' && setError(e as ReaderApiError));
    return () => ctl.abort();
  }, [paperId, pdfId, reload]);

  // while the paper is being prepared, check on it now and then
  const text = data?.text ?? null;
  const preparing = text != null && (text.status === 'pending' || text.status === 'processing');
  useEffect(() => {
    if (!preparing) return;
    const t = setInterval(async () => {
      try {
        const r = await readerFetch<{ text: ReaderTextState | null }>(readerUrl(paperId, `/status${pdfId ? `?pdf=${encodeURIComponent(pdfId)}` : ''}`));
        setData((d) => (d ? { ...d, text: r.text } : d));
      } catch {
        /* try again next time */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [preparing, paperId, pdfId]);

  // remember the page, a moment after the user stops on it
  useEffect(() => {
    if (!pdf || !data) return;
    const t = setTimeout(() => {
      readerFetch(readerUrl(paperId, '/position'), { method: 'PATCH', body: { page, pageCount: pdf.pageCount } }).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [page, pdf, data, paperId]);

  const cite = useCallback(
    (id: string) => {
      const p = passages.get(id);
      if (!p) return toast('That passage isn’t available in this copy of the PDF.', true);
      jumpTo({ page: p.page, rects: [{ x: p.box.x, y: p.box.y, w: p.box.w, h: p.box.h }] });
    },
    [passages, jumpTo],
  );
  const showPanel = useCallback(
    (tab: RightTab) => {
      setLayout((l) => ({ ...l, tab, right: true }));
      if (phone) setSheet(tab);
      else if (tablet) setDrawer(true);
    },
    [phone, tablet, setLayout],
  );
  const explain = useCallback(
    async (quote: string, page: number, id = `x_${Date.now()}`) => {
      setExplains((xs) => [{ id, quote, page, status: 'loading' as const }, ...xs.filter((x) => x.id !== id)]);
      showPanel('chat');
      try {
        const r = await readerFetch<{ text: string }>(readerUrl(paperId, `/explain${pdfId ? `?pdf=${encodeURIComponent(pdfId)}` : ''}`), { method: 'POST', body: { quote, page } });
        setExplains((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'done', text: r.text } : x)));
      } catch (e) {
        setExplains((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'error', error: (e as Error).message } : x)));
      }
    },
    [paperId, pdfId, showPanel],
  );

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const back = useCallback(() => {
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) router.back();
    else router.push('/app/shelf');
  }, [router]);

  const toggleRight = useCallback(() => {
    if (tablet) setDrawer((d) => !d);
    else setLayout((l) => ({ ...l, right: !l.right }));
  }, [tablet, setLayout]);
  const toggleLeft = useCallback(() => {
    if (tablet) setLeftDrawer((d) => !d);
    else setLayout((l) => ({ ...l, left: !l.left }));
  }, [tablet, setLayout]);

  // keyboard: pages, zoom, search, panels (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && pdf) {
        e.preventDefault();
        setFinding(true);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || !pdf) return;
      const k = e.key;
      if (k === 'n' || k === 'j' || (k === 'ArrowRight' && e.shiftKey)) pdf.next();
      else if (k === 'p' || k === 'k' || (k === 'ArrowLeft' && e.shiftKey)) pdf.prev();
      else if (k === '+' || k === '=') pdf.zoom(1);
      else if (k === '-' || k === '_') pdf.zoom(-1);
      else if (k === '0') pdf.setScale('page-width');
      else if (k === '/') setFinding(true);
      else if (k === '[') toggleLeft();
      else if (k === ']') toggleRight();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pdf, toggleLeft, toggleRight]);

  const upload = async (file: File) => {
    if (!data) return;
    if (file.type && file.type !== 'application/pdf') return toast('Please choose a PDF file.', true);
    setUploading(0);
    try {
      await uploadForPaper(data, file, setUploading);
      toast('Uploaded. Your copy opens now.');
      setPdf(null);
      setReload((n) => n + 1);
    } catch (e) {
      toast((e as Error).message || 'The upload failed. Please try again.', true);
    } finally {
      setUploading(null);
    }
  };

  const retry = async () => {
    try {
      await readerFetch(readerUrl(paperId, `/retry${pdfId ? `?pdf=${encodeURIComponent(pdfId)}` : ''}`), { method: 'POST' });
      setPdf(null);
      setReload((n) => n + 1);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const setStatus = async (status: 'done' | 'reading') => {
    if (!data?.shelf) return;
    try {
      await shelfFetch(`/api/shelf/papers/${encodeURIComponent(data.shelf.itemId)}`, { method: 'PATCH', body: { readingStatus: status } });
      setData((d) => (d && d.shelf ? { ...d, shelf: { ...d.shelf, readingStatus: status } } : d));
      toast(status === 'done' ? 'Marked as done' : 'Marked as reading');
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  if (error) return <ReaderError error={error} onBack={back} onRetry={() => setReload((n) => n + 1)} />;
  if (!data) return <ReaderSkeleton />;

  const hasPdf = data.pdf.kind !== 'none';
  const panelContent = (tab: RightTab) =>
    tab === 'details' ? (
      <Details data={data}>{slots?.summary ?? <SummaryCard data={data} pdfId={pdfId} passages={passages} onCite={cite} />}</Details>
    ) : tab === 'chat' ? (
      (slots?.chat ??
        (explains.length ? (
          <ExplainList items={explains} passages={passages} onCite={cite} onRetry={(it) => explain(it.quote, it.page, it.id)} />
        ) : (
          <PanelEmpty icon="chat" title="Ask about this paper" text="Select text in the PDF and choose Explain for a plain explanation. Questions about the paper come here." />
        )))
    ) : (
      (slots?.notes ?? (
        <NotesPanel
          paperId={data.paper.id}
          ann={ann}
          missing={missing}
          disabled={!hasPdf ? 'Highlights and page notes need a PDF. Upload one to start.' : data.text?.status === 'no_text' ? 'This PDF has no text layer, so text can’t be highlighted. Page notes still work.' : null}
          placing={placing}
          onPlace={(on) => {
            setPlacing(on);
            if (on) setSheet(null);
          }}
          onJump={({ page, highlight, note }) => jumpTo({ page, rects: highlight ? highlight.rects : note ? [{ x: Math.max(0, note.x - 0.02), y: Math.max(0, note.y - 0.01), w: 0.04, h: 0.03 }] : undefined })}
        />
      ))
    );

  const menu = (
    <MoreMenu
      items={[
        originalHref(data) ? { label: 'Open original', icon: 'external', href: originalHref(data)! } : null,
        hasPdf ? { label: 'Download PDF', icon: 'download', href: data.pdf.kind !== 'none' ? data.pdf.url : undefined } : null,
        { label: 'Upload a PDF', icon: 'upload', onClick: () => fileRef.current?.click() },
        data.shelf && data.shelf.readingStatus !== 'done' ? { label: 'Mark as done', icon: 'check', onClick: () => setStatus('done') } : null,
        data.shelf && data.shelf.readingStatus === 'done' ? { label: 'Mark as reading', icon: 'book', onClick: () => setStatus('reading') } : null,
        { label: 'Keyboard shortcuts', icon: 'command', onClick: () => toast('N / P: next and previous page · + / −: zoom · 0: fit width · / or Ctrl F: search · [ ]: panels') },
      ]}
    />
  );

  const rightShown = !phone && (tablet ? drawer : layout.right);
  const leftShown = hasPdf && !phone && (tablet ? leftDrawer : layout.left);

  return (
    <div className={`rd${phone ? ' is-phone' : tablet ? ' is-tablet' : ''}`}>
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <TopBar
        title={data.paper.title}
        retracted={data.paper.isRetracted}
        pdf={pdf}
        page={page}
        scale={scale}
        leftOpen={leftShown}
        rightOpen={rightShown}
        onBack={back}
        onLeft={toggleLeft}
        onRight={toggleRight}
        onSearch={() => setFinding((f) => !f)}
        menu={menu}
        compact={phone}
      />
      <div className="rd-body">
        {leftShown && <LeftPanel pdf={pdf} page={page} tab={layout.leftTab} onTab={(leftTab) => setLayout((l) => ({ ...l, leftTab }))} />}
        <main className="rd-center">
          {finding && pdf && <FindBar pdf={pdf} count={found.count} notFound={found.notFound} onClose={() => setFinding(false)} />}
          <TextNotice data={data} onRetry={retry} />
          {!hasPdf || pdfError ? (
            pdfError ? (
              <PdfFailed data={data} kind={pdfError} onUpload={() => fileRef.current?.click()} onRetry={() => setReload((n) => n + 1)} />
            ) : (
              <NoPdf data={data} onUpload={() => fileRef.current?.click()} onRetry={retry} uploading={uploading} />
            )
          ) : (
            <PdfPane
              key={data.pdf.kind !== 'none' ? data.pdf.url : 'none'}
              url={data.pdf.kind !== 'none' ? data.pdf.url : ''}
              initialPage={data.position?.page ?? 1}
              initialScale={phone ? 'page-width' : 'auto'}
              onReady={setPdf}
              onPage={setPage}
              onScale={setScale}
              onFind={(count, notFound) => setFound({ count, notFound })}
              onError={setPdfError}
              onPageRendered={onPageRendered}
            />
          )}
          {pdf && hasPdf && !pdfError && (
            <Annotator
              pdf={pdf}
              pdfKey={pdfKey}
              ann={ann}
              rendered={rendered}
              tick={tick}
              canHighlight={data.text?.status !== 'no_text'}
              placing={placing}
              onPlacing={setPlacing}
              flash={flash}
              onMissing={setMissing}
              onExplain={data.ai ? (quote, a) => void explain(quote, a.page) : undefined}
            />
          )}
          {hasPdf && !pdf && !pdfError && <div className="rd-pdf-loading" aria-label="Loading the PDF"><span className="spin" /></div>}
        </main>
        {rightShown && (
          <>
            {tablet && <button type="button" className="rd-scrim" aria-label="Close the panel" onClick={() => setDrawer(false)} />}
            <RightPanel
              tab={layout.tab}
              onTab={(tab) => setLayout((l) => ({ ...l, tab }))}
              width={layout.width}
              onWidth={(w) => setLayout((l) => ({ ...l, width: clampWidth(w) }))}
              drawer={tablet}
              onClose={() => setDrawer(false)}
            >
              {panelContent(layout.tab)}
            </RightPanel>
          </>
        )}
      </div>

      {phone && (
        <>
          {sheet && (
            <div className="rd-sheet-wrap" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
              <section className="rd-sheet" aria-label={RIGHT_TABS.find((t) => t.id === sheet)?.label}>
                <div className="rd-sheet-grip" aria-hidden="true" />
                <div className="rd-sheet-head">
                  <b>{RIGHT_TABS.find((t) => t.id === sheet)?.label}</b>
                  <button type="button" className="icon-btn" onClick={() => setSheet(null)} aria-label="Close">
                    <Icon name="x" />
                  </button>
                </div>
                <div className="rd-sheet-body">{panelContent(sheet)}</div>
              </section>
            </div>
          )}
          <nav className="rd-bottom" aria-label="Reader">
            <button type="button" aria-pressed={!sheet} onClick={() => setSheet(null)}>
              <Icon name="book" /> Read
            </button>
            {RIGHT_TABS.map((t) => (
              <button key={t.id} type="button" aria-pressed={sheet === t.id} onClick={() => setSheet(t.id)}>
                <Icon name={t.icon} /> {t.label}
              </button>
            ))}
          </nav>
        </>
      )}
      {uploading != null && hasPdf && <div className="rd-upload-pill">Uploading… {Math.round(uploading * 100)}%</div>}
      {autoSaved && (
        <div className="rd-upload-pill rd-saved-pill" role="status">
          <Icon name="check" /> Saved to your shelf
          <button type="button" onClick={undoSave}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

/* Processing states, shown above the PDF where the user is looking, never blocking it. */
function TextNotice({ data, onRetry }: { data: ReaderData; onRetry(): void }) {
  const t = data.text;
  if (data.paper.isRetracted && data.pdf.kind !== 'none') return <div className="rd-notice is-warn"><RetractedNotice /></div>;
  if (!t || data.pdf.kind === 'none') return null;
  if (t.status === 'no_text')
    return (
      <p className="rd-notice">
        <Icon name="alert" /> This PDF has no text layer (it looks like a scan). You can read it, but search, text highlights and AI are off.
      </p>
    );
  if (t.status === 'failed' && !t.error?.startsWith('download:'))
    return (
      <p className="rd-notice is-warn">
        <Icon name="alert" /> We couldn’t read this PDF’s text.
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
          Try again
        </button>
      </p>
    );
  return null;
}

function PdfFailed({ data, kind, onUpload, onRetry }: { data: ReaderData; kind: 'load' | 'password'; onUpload(): void; onRetry(): void }) {
  const href = originalHref(data);
  return (
    <div className="rd-nopdf">
      <div className="rd-nopdf-card">
        <div className="rd-nopdf-note is-warn">
          <Icon name="alert" />
          <div>
            <b>{kind === 'password' ? 'This PDF is password-protected.' : data.pdf.kind === 'open_access' ? 'We couldn’t load the free PDF.' : 'We couldn’t open this PDF.'}</b>
            <p>You can try again, open the original, or upload your own copy.</p>
          </div>
        </div>
        <div className="rd-nopdf-acts">
          <button type="button" className="btn btn-thread" onClick={onUpload}>
            <Icon name="upload" /> Upload PDF
          </button>
          <button type="button" className="btn btn-ghost" onClick={onRetry}>
            <Icon name="undo" /> Try again
          </button>
          {href && (
            <a className="btn btn-ghost" href={href} target="_blank" rel="noopener noreferrer">
              <Icon name="external" /> Open original
            </a>
          )}
        </div>
        <Details data={data} />
      </div>
    </div>
  );
}

function PanelEmpty({ icon, title, text }: { icon: Parameters<typeof Icon>[0]['name']; title: string; text: string }) {
  return (
    <div className="rd-empty">
      <Icon name={icon} />
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}

function ReaderSkeleton() {
  return (
    <div className="rd" aria-busy="true" aria-label="Opening the paper">
      <header className="rd-top">
        <span className="rd-skel" style={{ width: 32, height: 32, borderRadius: 10 }} />
        <span className="rd-skel" style={{ flex: 1, maxWidth: 420, height: 16 }} />
      </header>
      <div className="rd-body">
        <main className="rd-center">
          <div className="rd-skel-page">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className="rd-skel" style={{ width: `${70 + ((i * 37) % 30)}%` }} />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

function ReaderError({ error, onBack, onRetry }: { error: ReaderApiError; onBack(): void; onRetry(): void }) {
  const notFound = error.code === 'not_found' || error.code === 'bad_request';
  return (
    <div className="rd">
      <div className="rd-nopdf">
        <div className="rd-nopdf-card">
          <div className="rd-nopdf-note is-warn">
            <Icon name="alert" />
            <div>
              <b>{notFound ? 'We couldn’t find that paper.' : 'The paper couldn’t be opened.'}</b>
              <p>{error.message}</p>
            </div>
          </div>
          <div className="rd-nopdf-acts">
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              <Icon name="arrow" className="rd-back-ico" /> Back
            </button>
            {!notFound && (
              <button type="button" className="btn btn-thread" onClick={onRetry}>
                <Icon name="undo" /> Try again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
