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
import { uploadForPaper } from './upload';

/* The reader page: the PDF in the middle, pages and contents on the left, and
   Chat, Notes and Details on the right. Tablets get the right panel as a
   drawer; phones get a bottom bar that opens each panel as a sheet. */

type Layout = { left: boolean; right: boolean; width: number; tab: RightTab; leftTab: 'pages' | 'contents' };
const LAYOUT: Layout = { left: true, right: true, width: 380, tab: 'details', leftTab: 'pages' };
const clampWidth = (w: number) => Math.min(640, Math.max(300, Math.round(w)));

export function Reader({ paperId, slots }: { paperId: string; slots?: { chat?: ReactNode; notes?: ReactNode; summary?: ReactNode } }) {
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

  // load (and reload after an upload or a retry)
  useEffect(() => {
    const ctl = new AbortController();
    setError(null);
    readerFetch<ReaderData>(readerUrl(paperId), { signal: ctl.signal })
      .then((d) => {
        setData(d);
        setPdfError(null);
      })
      .catch((e) => (e as Error)?.name !== 'AbortError' && setError(e as ReaderApiError));
    return () => ctl.abort();
  }, [paperId, reload]);

  // while the paper is being prepared, check on it now and then
  const text = data?.text ?? null;
  const preparing = text != null && (text.status === 'pending' || text.status === 'processing');
  useEffect(() => {
    if (!preparing) return;
    const t = setInterval(async () => {
      try {
        const r = await readerFetch<{ text: ReaderTextState | null }>(readerUrl(paperId, '/status'));
        setData((d) => (d ? { ...d, text: r.text } : d));
      } catch {
        /* try again next time */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [preparing, paperId]);

  // remember the page, a moment after the user stops on it
  useEffect(() => {
    if (!pdf || !data) return;
    const t = setTimeout(() => {
      readerFetch(readerUrl(paperId, '/position'), { method: 'PATCH', body: { page, pageCount: pdf.pageCount } }).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [page, pdf, data, paperId]);

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
      await readerFetch(readerUrl(paperId, '/retry'), { method: 'POST' });
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
      <Details data={data}>{slots?.summary}</Details>
    ) : tab === 'chat' ? (
      (slots?.chat ?? <PanelEmpty icon="chat" title="Ask about this paper" text="Questions about the paper, answered from its own text with links to the passages, come here." />)
    ) : (
      (slots?.notes ?? <PanelEmpty icon="pencil" title="Highlights and notes" text="Select text in the PDF to highlight it; your highlights and notes are listed here." />)
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
