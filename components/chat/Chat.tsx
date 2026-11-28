'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import type { AgentEvent } from '@/lib/agent/types';
import type { ConversationView } from '@/lib/agent/view';
import { confirmDialog } from '../confirm';
import { Icon, LogoMark, type IconName } from '../Icon';
import { InlineName } from '../shelf/InlineName';
import type { AttachmentView } from '@/lib/agent/view';
import { ATTACH_MAX } from '@/lib/agent/attachments';
import { answerQuestion, deleteChat, openChat, pinChat, renameChat, retryAnswer, sendClientResult, sendMessage, startResearch } from './api';
import { AnswerActions } from './AnswerActions';
import { newAttachId, readAttachment, takeScreenshot, type AttachItem } from './attach';
import { refreshChats, useChatIndex } from './chat-index';
import { runClientTool } from './citations';
import { AttachCard } from './AttachCard';
import { Composer } from './Composer';
import type { Picked } from './AddMenu';
import { FilePanel } from './file/FilePanel';
import { FilePanelProvider, useFilePanelState } from './file/panel-state';
import { readPaper } from './file/read-paper';
import { applyEvent, type Entry } from './events';
import { Markdown } from './Markdown';
import { refAnchor } from './PaperRefs';
import { ShareChatDialog } from './ShareChatDialog';
import { Steps } from './Steps';
import { segments } from './steps/timeline';
import { isReport, refTitles, toTurns } from './turns';

/* The research assistant. A new chat opens on a greeting with a large message
   box; a conversation shows each turn (the steps it took, folded to one line;
   the answer, citing the papers it found by number; the papers) with the
   message box docked below. The chats themselves live in the sidebar. */

type Waiting = NonNullable<ConversationView['waiting']>;
type ClientTask = { callId: string; name: string; input: unknown; label: string };

const MODEL_KEY = 'cz:chat-model';

const CHIPS: { icon: IconName; label: string; prompt: string }[] = [
  { icon: 'search', label: 'Find papers', prompt: 'Find recent papers on ' },
  { icon: 'quote', label: 'Cite a claim', prompt: 'Find citations for this text: ' },
  { icon: 'layers', label: 'Ask my shelf', prompt: 'What’s on my shelf about ' },
  { icon: 'shield', label: 'Check retractions', prompt: 'Which papers on my shelf are retracted?' },
];

function greeting(name: string | null | undefined): string {
  const h = new Date().getHours();
  const part = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

function setUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('c', id);
  else url.searchParams.delete('c');
  window.history.replaceState(window.history.state, '', url);
}

/* The chat's title, with pin / rename / delete. */
function TitleMenu({ id, title, pinned, onRenamed }: { id: string; title: string; pinned: boolean; onRenamed(t: string): void }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (renaming)
    return (
      <div className="ch-title-edit">
        <InlineName
          initial={title}
          label="Chat title"
          placeholder="Title"
          onCancel={() => setRenaming(false)}
          onSave={async (t) => {
            await renameChat(id, t);
            onRenamed(t);
            setRenaming(false);
            refreshChats();
          }}
        />
      </div>
    );

  return (
    <div className="ch-title" ref={box}>
      <button type="button" className="ch-title-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{title}</span> <Icon name="chevron" />
      </button>
      {open && (
        <div className="cz-menu ch-title-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await pinChat(id, !pinned);
              refreshChats();
            }}
          >
            <Icon name="pin" /> {pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setRenaming(true);
            }}
          >
            <Icon name="pencil" /> Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onClick={async () => {
              setOpen(false);
              if (!(await confirmDialog({ title: 'Delete this chat?', body: 'This can’t be undone.', confirmLabel: 'Delete chat', danger: true }))) return;
              await deleteChat(id);
              await refreshChats();
              router.push('/app/chat');
            }}
          >
            <Icon name="trash" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function Chat({ initialId, initialAsk = null }: { initialId: string | null; initialAsk?: string | null }) {
  const { index } = useChatIndex();
  const { data: session } = useSession();
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [title, setTitle] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [loading, setLoading] = useState(!!initialId);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<AttachItem[]>([]);
  /* the Web switch in the + menu, kept per chat; null on a new chat until the user
     sets it: then it is on whenever web search is set up (a research platform) */
  const [webChoice, setWebSearch] = useState<boolean | null>(null);
  /* Deep research chosen from the + menu, for the next message only */
  const [deepResearch, setDeepResearch] = useState(false);
  // a skill and a shelf project picked in the + menu, for the next message
  const [skill, setSkill] = useState<Picked>(null);
  const [project, setProject] = useState<Picked>(null);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);

  // files open beside the chat; questions are about the shown one until the user says otherwise
  const panel = useFilePanelState();
  const { closeAll } = panel;
  const [asking, setAsking] = useState<string | null>(null);
  useEffect(() => setAsking(panel.active), [panel.active]);
  useEffect(() => closeAll(), [activeId, closeAll]);
  const askingTitle = asking ? (panel.files.find((f) => f.paperId === asking)?.title ?? 'this paper') : null;
  const askAbout = useCallback((q: string, paperId: string) => {
    setAsking(paperId);
    setText(q);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);

  /* files added with +: read here, one by one, and sent with the next message */
  const addItem = useCallback((name: string, work: Promise<{ attachment: AttachItem['attachment']; preview?: string; excerpt?: string } | null>) => {
    const id = newAttachId();
    setFiles((fs) => [...fs, { id, name, status: 'reading' }]);
    work.then(
      (r) =>
        setFiles((fs) =>
          r
            ? fs.map((f) => (f.id === id ? { ...f, status: 'ready', name: r.attachment?.name ?? name, attachment: r.attachment, preview: r.preview, excerpt: r.excerpt } : f))
            : fs.filter((f) => f.id !== id),
        ),
      (e: Error) => setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, status: 'error', error: e.message || 'The file could not be read.' } : f))),
    );
  }, []);
  const addFiles = useCallback(
    (picked: File[]) => {
      const room = ATTACH_MAX - files.filter((f) => f.status !== 'error').length;
      if (picked.length > room) setError(room > 0 ? `Add at most ${ATTACH_MAX} files to a message.` : `A message can carry ${ATTACH_MAX} files at most.`);
      for (const f of picked.slice(0, Math.max(0, room))) addItem(f.name, readAttachment(f));
      inputRef.current?.focus();
    },
    [files, addItem],
  );
  const screenshot = useCallback(() => {
    if (files.filter((f) => f.status !== 'error').length >= ATTACH_MAX) return setError(`A message can carry ${ATTACH_MAX} files at most.`);
    addItem('Screenshot', takeScreenshot());
  }, [files, addItem]);
  const removeFile = useCallback((id: string) => setFiles((fs) => fs.filter((f) => f.id !== id)), []);

  const models = useMemo(() => index?.models ?? [], [index]);
  const noModels = index != null && models.length === 0;
  const pinned = index?.conversations.find((c) => c.id === activeId)?.pinned ?? false;
  const webSearch = webChoice ?? index?.web === true;

  /* the model new chats start with: the last one picked on a new chat, if still offered */
  const startModel = useCallback(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MODEL_KEY);
    } catch {
      /* storage blocked */
    }
    // a model the plan no longer allows falls back to the plan's default
    return models.some((m) => m.id === saved && !m.locked) ? saved : (index?.defaultModel ?? null);
  }, [models, index]);

  useEffect(() => {
    if (!model && index) setModel(startModel());
  }, [index, model, startModel]);

  const load = useCallback(
    async (id: string | null) => {
      abort.current?.abort();
      setActiveId(id);
      setError(null);
      setWaiting(null);
      setBusy(false);
      if (!id) {
        setEntries([]);
        setTitle(null);
        setModel(startModel());
        setWebSearch(null);
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      setLoading(true);
      try {
        const c = await openChat(id);
        setEntries(c.entries);
        setTitle(c.title);
        setWaiting(c.waiting);
        setModel(c.model);
        setWebSearch(c.webSearch === true);
      } catch (e) {
        setError((e as Error).message);
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [startModel],
  );

  // the page's ?c= decides the chat: the sidebar's links and New chat change it
  useEffect(() => {
    load(initialId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  // words handed over from Search ("Ask the assistant"): ready to send
  useEffect(() => {
    if (!initialAsk) return;
    setText(initialAsk);
    const url = new URL(window.location.href);
    url.searchParams.delete('ask');
    window.history.replaceState(window.history.state, '', url);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [initialAsk]);

  useEffect(() => {
    const renamed = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; title: string }>).detail;
      if (d.id === activeId) setTitle(d.title);
    };
    window.addEventListener('citezeno:chat-renamed', renamed);
    return () => window.removeEventListener('citezeno:chat-renamed', renamed);
  }, [activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [entries, waiting]);

  /* Run a streamed reply, folding its events into the page. When the reply
     asks the browser to run a step (the citation search), it runs once the
     stream ends and its result starts the next part of the reply. */
  const run = async (start: (onEvent: (e: AgentEvent) => void, signal: AbortSignal) => Promise<void>): Promise<void> => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true);
    setError(null);
    let conversationId = activeId;
    let task: ClientTask | null = null;
    try {
      await start((e) => {
        if (e.type === 'conversation') {
          conversationId = e.id;
          setActiveId(e.id);
          setTitle(e.title);
          setUrl(e.id);
        } else if (e.type === 'title') {
          // the model named this new chat
          setTitle(e.title);
          refreshChats();
        } else if (e.type === 'confirm') setWaiting({ callId: e.callId, kind: 'confirm', question: e.question, ...(e.code ? { code: e.code } : {}) });
        else if (e.type === 'client_tool') task = { callId: e.callId, name: e.name, input: e.input, label: e.label };
        else if (e.type === 'error') setError(e.message);
        else setEntries((prev) => applyEvent(prev, e));
      }, ctrl.signal);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (abort.current === ctrl) setBusy(false);
      refreshChats();
    }
    if (task && conversationId && !ctrl.signal.aborted) await runInBrowser(conversationId, task);
  };

  /* Run a step in the browser, then send its result to carry on the reply. */
  const runInBrowser = async (conversationId: string, task: ClientTask) => {
    setBusy(true);
    const outcome = await runClientTool(task.name, task.input);
    await run((onEvent, signal) => sendClientResult({ conversationId, callId: task.callId, outcome }, onEvent, signal));
  };

  /* Deep research on a question: from the + menu, or the button under an answer that offered it. */
  const research = async (question: string) => {
    if (busy || noModels) return;
    // deep research is the priciest action: say what it costs and ask first
    const est = models.find((m) => m.id === model)?.credits;
    if (est && !est.research) return setError('Deep research needs a plan. Choose one on the pricing page.');
    const range = est?.research ? (est.research.low === est.research.high ? `${est.research.low}` : `${est.research.low}–${est.research.high}`) : null;
    const ok = await confirmDialog({
      title: 'Start deep research?',
      body: `${range ? `This usually uses about ${range} credits` : 'This uses more credits than a normal answer'}, and takes a few minutes. You pay only for what it really uses.`,
      confirmLabel: 'Start research',
    });
    if (!ok) return;
    setWaiting(null);
    setDeepResearch(false);
    setEntries((prev) => [...prev, { kind: 'user', text: question }]);
    return run((onEvent, signal) => startResearch({ conversationId: activeId, text: question, model, webSearch }, onEvent, signal));
  };

  const send = async (raw: string = text) => {
    const typed = raw.trim();
    const ready = files.filter((f) => f.status === 'ready' && f.attachment);
    if ((!typed && !ready.length) || busy || noModels || files.some((f) => f.status === 'reading')) return;
    if (deepResearch) {
      if (files.length) return setError('Deep research takes a question only. Remove the added files, or turn off Deep research.');
      if (typed.length < 3) return setError('Say what to research.');
      setText('');
      return research(typed);
    }
    const attachments = ready.map((f) => f.attachment!);
    const shown: AttachmentView[] = ready.map((f) => ({ kind: f.attachment!.kind, name: f.name, ...(f.preview ? { src: f.preview } : {}), ...(f.excerpt ? { excerpt: f.excerpt } : {}) }));
    setText('');
    setFiles([]);
    setWaiting(null);
    if (!activeId && model) {
      try {
        localStorage.setItem(MODEL_KEY, model);
      } catch {
        /* storage blocked */
      }
    }
    setEntries((prev) => [...prev, { kind: 'user', text: typed, ...(shown.length ? { attachments: shown } : {}) }]);
    const paperId = asking && panel.files.some((f) => f.paperId === asking) ? asking : null;
    const extras = { ...(skill ? { skill: skill.id } : {}), ...(project ? { projectId: project.id } : {}) };
    setSkill(null);
    setProject(null);
    await run((onEvent, signal) => sendMessage({ conversationId: activeId, text: typed, model, paperId, webSearch, ...extras, ...(attachments.length ? { attachments } : {}) }, onEvent, signal));
  };

  /* Try again: the last answer goes, the last message is answered afresh, then the chat is reloaded as saved. */
  const retryLast = async () => {
    if (busy || !activeId) return;
    const id = activeId;
    setWaiting(null);
    setEntries((prev) => {
      const at = prev.map((e) => e.kind).lastIndexOf('user');
      return at < 0 ? prev : prev.slice(0, at + 1);
    });
    await run((onEvent, signal) => retryAnswer({ conversationId: id, model, webSearch }, onEvent, signal));
    try {
      const c = await openChat(id);
      setEntries(c.entries);
      setWaiting(c.waiting);
    } catch {
      /* the streamed answer stays as it is */
    }
  };

  const answer = async (approve: boolean) => {
    if (!waiting || !activeId || busy) return;
    const w = waiting;
    setWaiting(null);
    if (w.kind === 'client' && approve) {
      // reopened while a browser step was waiting: run it now
      setEntries((prev) => applyEvent(prev, { type: 'step', callId: w.callId, name: w.name, label: w.label, input: w.input }));
      return runInBrowser(activeId, w);
    }
    setEntries((prev) => [...prev, { kind: 'user', text: approve ? 'Yes' : 'No' }]);
    await run((onEvent, signal) => answerQuestion({ conversationId: activeId, callId: w.callId, approve }, onEvent, signal));
  };

  const turns = useMemo(() => toTurns(entries), [entries]);
  const working = busy && !entries.some((e) => e.kind === 'steps' && e.steps.some((s) => s.status === 'running'));
  const home = !activeId && !loading && entries.length === 0;

  const composer = (big: boolean) => (
    <Composer
      ref={inputRef}
      big={big}
      text={text}
      onText={setText}
      models={models}
      model={model}
      onModel={setModel}
      busy={busy}
      disabled={noModels}
      placeholder={deepResearch ? 'What should I research?' : big ? 'Ask about papers, citations or your shelf…' : waiting ? 'Answer above, or ask something else…' : asking ? 'Ask about this paper…' : 'Reply…'}
      context={!big && askingTitle ? { label: askingTitle, onClear: () => setAsking(null) } : null}
      attachments={files}
      onAddFiles={addFiles}
      onScreenshot={screenshot}
      onRemoveAttachment={removeFile}
      webSearch={webSearch}
      onWebSearch={setWebSearch}
      deepResearch={deepResearch}
      onDeepResearch={setDeepResearch}
      skill={skill}
      onSkill={setSkill}
      project={project}
      onProject={setProject}
      onSend={() => send()}
      onStop={() => abort.current?.abort()}
    />
  );

  if (home)
    return (
      <div className="ch ch-home">
        <div className="ch-home-in">
          <h1 className="ch-greet">
            <LogoMark className="ch-logo" /> {greeting(session?.user.name)}
          </h1>
          {noModels ? <p className="ch-quiet">The assistant isn’t set up yet: no AI model is available.</p> : composer(true)}
          <div className="ch-chips">
            {CHIPS.map((c) => (
              <button
                key={c.label}
                type="button"
                className="ch-suggest"
                disabled={noModels}
                onClick={() => {
                  setText(c.prompt);
                  inputRef.current?.focus();
                }}
              >
                <Icon name={c.icon} /> {c.label}
              </button>
            ))}
          </div>
          {error && (
            <p className="ch-error" role="alert">
              <Icon name="alert" /> {error}
              {/credit|plan/i.test(error) && (
                <>
                  {' '}
                  <a href="/pricing">See plans</a>
                </>
              )}
            </p>
          )}
        </div>
        <p className="ch-disclaimer is-home">Answers come only from real papers. Check important claims against the source.</p>
      </div>
    );

  return (
    <FilePanelProvider value={panel}>
      <div className="ch-split" ref={splitRef}>
        <div className="ch">
          <header className="ch-head">
            {activeId && title ? <TitleMenu id={activeId} title={title} pinned={pinned} onRenamed={setTitle} /> : <span className="ch-title-plain">{title ?? 'New chat'}</span>}
            {activeId && title && (
              <button type="button" className="ch-share-btn" onClick={() => setSharing(true)} disabled={busy} title={busy ? 'Wait for the reply to finish' : 'Share a read-only link to this chat'}>
                <Icon name="upload" /> Share
              </button>
            )}
          </header>
          {sharing && activeId && title && <ShareChatDialog chatId={activeId} title={title} onClose={() => setSharing(false)} />}

          <div className="ch-thread">
            <div className="ch-col">
              {loading && <p className="ch-quiet">Opening the chat…</p>}

              {turns.map((t, ti) => {
                /* the latest answer offered deep research: a button starts it */
                const offer = ti === turns.length - 1 ? t.parts.flatMap((p) => (p.kind === 'steps' ? p.steps : [])).find((s) => s.status === 'done' && s.display?.research)?.display?.research : undefined;
                const titles = refTitles(t);
                // [p3-2] passages come from the paper the turn read (or the one open)
                const read = readPaper(t.parts) ?? panel.active;
                const passage = (ids: string[], key: number) =>
                  read ? (
                    <span key={key} className="ch-psg">
                      {ids.map((id) => (
                        <button key={id} type="button" className="ch-psg-btn" title={`Show page ${id.slice(1).split('-')[0]} in the PDF`} onClick={() => panel.open(read, { passageId: id })}>
                          p.{id.slice(1).split('-')[0]}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <Fragment key={key} />
                  );
                const cite = (n: number, key: number) =>
                  titles.has(n) ? (
                    <a key={key} className="ch-cite" href={`#${refAnchor(t.key, n)}`} title={titles.get(n)}>
                      {n}
                    </a>
                  ) : (
                    <Fragment key={key}>[{n}]</Fragment>
                  );
                return (
                  <div key={t.key} className="ch-turn">
                    {!!t.files?.length && (
                      <ul className="ch-user-files" aria-label="Attached">
                        {t.files.map((f, i) => (
                          <AttachCard key={i} file={{ kind: f.kind, name: f.name, preview: f.src, excerpt: f.excerpt }} />
                        ))}
                      </ul>
                    )}
                    {!!t.user && <div className="ch-user">{t.user}</div>}
                    {t.parts.length > 0 && (
                      <div className="ch-ai">
                        {segments(t.parts).map((seg, si, segs) => {
                          // the steps and the notes between them make one timeline; answers stay in view
                          if (seg.kind === 'work') return <Steps key={`w${seg.at}`} items={seg.items} turn={t.key} chatId={activeId} />;
                          const i = seg.at;
                          const p = t.parts[i];
                          // the actions sit under the turn's final answer, once it is written
                          const final = !segs.slice(si + 1).some((x) => x.kind === 'answer');
                          const live = ti === turns.length - 1 && busy;
                          return p.kind === 'assistant' ? (
                            <div key={i} className="ch-answer">
                              <Markdown text={p.text} cite={cite} passage={passage} />
                              {final && !live && (
                                <AnswerActions
                                  key={`${p.seq ?? i}-${p.feedback ?? ''}`}
                                  chatId={activeId}
                                  text={p.text}
                                  seq={p.seq}
                                  at={p.at}
                                  feedback={p.feedback}
                                  credits={p.credits}
                                  onRetry={ti === turns.length - 1 && !isReport(t, i) && !waiting ? retryLast : undefined}
                                />
                              )}
                              {isReport(t, i) && !busy && (
                                <div className="ch-report-acts">
                                  <button type="button" className="ch-btn" onClick={() => send('Save the research report above as a Word document, with its sources.')}>
                                    <Icon name="word" /> Save as Word
                                  </button>
                                  <button type="button" className="ch-btn" onClick={() => send('Save the research report above as a PDF, with its sources.')}>
                                    <Icon name="pdf" /> Save as PDF
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : null;
                        })}
                        {offer && !busy && (
                          <div className="ch-offer" role="group" aria-label="Deep research">
                            <Icon name="compass" />
                            <p>
                              This could use a full research report: <strong>{offer.question}</strong>
                              <span className="ch-quiet"> Takes a few minutes and searches many sources.</span>
                            </p>
                            <button type="button" className="ch-btn is-go" onClick={() => research(offer.question)}>
                              Run deep research
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {waiting && (
                <div className="ch-ask" role="alertdialog" aria-label="The assistant is asking first">
                  <p>{waiting.kind === 'confirm' ? waiting.question : `${waiting.label}. This uses 1 credit.`}</p>
                  {waiting.kind === 'confirm' && waiting.code && (
                    <details className="ch-code ch-ask-code">
                      <summary>
                        <Icon name="code" /> Show code
                      </summary>
                      <pre className="ch-code-src">
                        <code>{waiting.code.source}</code>
                      </pre>
                    </details>
                  )}
                  <div className="ch-ask-acts">
                    <button type="button" className="ch-btn is-go" onClick={() => answer(true)} disabled={busy}>
                      {waiting.kind === 'confirm' ? 'Yes' : 'Run it'}
                    </button>
                    <button type="button" className="ch-btn" onClick={() => answer(false)} disabled={busy}>
                      {waiting.kind === 'confirm' ? 'No' : 'Skip'}
                    </button>
                  </div>
                </div>
              )}
              {working && (
                <p className="ch-quiet ch-thinking">
                  <LogoMark className="ch-think-logo" /> Thinking
                </p>
              )}
              {error && (
                <p className="ch-error" role="alert">
                  <Icon name="alert" /> {error}
              {/credit|plan/i.test(error) && (
                <>
                  {' '}
                  <a href="/pricing">See plans</a>
                </>
              )}
                </p>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div className="ch-dock">
            {noModels ? <p className="ch-quiet">The assistant isn’t set up yet: no AI model is available.</p> : composer(false)}
            <p className="ch-disclaimer">Answers come only from real papers. Check important claims against the source.</p>
          </div>
        </div>
        <FilePanel panel={panel} split={splitRef} onAsk={askAbout} />
      </div>
    </FilePanelProvider>
  );
}
