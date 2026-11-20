'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import type { AgentEvent } from '@/lib/agent/types';
import type { ConversationView } from '@/lib/agent/view';
import { Icon, LogoMark, type IconName } from '../Icon';
import { InlineName } from '../shelf/InlineName';
import { answerQuestion, deleteChat, openChat, pinChat, renameChat, sendClientResult, sendMessage } from './api';
import { refreshChats, useChatIndex } from './chat-index';
import { runClientTool } from './citations';
import { Composer, type ComposeMode } from './Composer';
import { applyEvent, type Entry } from './events';
import { Markdown } from './Markdown';
import { refAnchor } from './PaperRefs';
import { Steps } from './Steps';

/* The research assistant. A new chat opens on a greeting with a large message
   box; a conversation shows each turn (the steps it took, folded to one line;
   the answer, citing the papers it found by number; the papers) with the
   message box docked below. The chats themselves live in the sidebar. */

type Waiting = NonNullable<ConversationView['waiting']>;
type ClientTask = { callId: string; name: string; input: unknown; label: string };

const MODEL_KEY = 'cz:chat-model';

const CHIPS: { icon: IconName; label: string; prompt: string; mode?: ComposeMode }[] = [
  { icon: 'search', label: 'Find papers', prompt: 'Find recent papers on ' },
  { icon: 'quote', label: 'Cite a claim', prompt: '', mode: 'cite' },
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

/* Entries as turns: each user message with everything the assistant did after it. */
type Turn = { key: number; user: string | null; parts: Entry[] };

function toTurns(entries: Entry[]): Turn[] {
  const turns: Turn[] = [];
  entries.forEach((e, i) => {
    if (e.kind === 'user') turns.push({ key: i, user: e.text, parts: [] });
    else if (turns.length) turns.at(-1)!.parts.push(e);
    else turns.push({ key: i, user: null, parts: [e] });
  });
  return turns;
}

/* The titles of a turn's numbered papers, for the citation chips' tooltips. */
function refTitles(turn: Turn): Map<number, string> {
  const m = new Map<number, string>();
  for (const p of turn.parts) {
    if (p.kind !== 'steps') continue;
    for (const s of p.steps) {
      const refs = s.display?.refs ?? {};
      for (const paper of s.display?.papers ?? []) if (refs[paper.id]) m.set(refs[paper.id], paper.title);
      for (const item of s.display?.items ?? []) if (refs[item.paper.id]) m.set(refs[item.paper.id], item.paper.title);
    }
  }
  return m;
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
              if (!window.confirm('Delete this chat? This can’t be undone.')) return;
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
  const [mode, setMode] = useState<ComposeMode>('chat');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!initialId);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const models = useMemo(() => index?.models ?? [], [index]);
  const noModels = index != null && models.length === 0;
  const pinned = index?.conversations.find((c) => c.id === activeId)?.pinned ?? false;

  /* the model new chats start with: the last one picked on a new chat, if still offered */
  const startModel = useCallback(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MODEL_KEY);
    } catch {
      /* storage blocked */
    }
    return models.some((m) => m.id === saved) ? saved : (index?.defaultModel ?? null);
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
        } else if (e.type === 'confirm') setWaiting({ callId: e.callId, kind: 'confirm', question: e.question });
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

  const send = async (raw: string = text) => {
    const typed = raw.trim();
    if (!typed || busy || noModels) return;
    const message = mode === 'cite' ? `Find citations for this text:\n\n${typed}` : typed;
    setText('');
    setMode('chat');
    setWaiting(null);
    if (!activeId && model) {
      try {
        localStorage.setItem(MODEL_KEY, model);
      } catch {
        /* storage blocked */
      }
    }
    setEntries((prev) => [...prev, { kind: 'user', text: message }]);
    await run((onEvent, signal) => sendMessage({ conversationId: activeId, text: message, model }, onEvent, signal));
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
      mode={mode}
      onMode={(m) => {
        setMode(m);
        inputRef.current?.focus();
      }}
      models={models}
      model={model}
      onModel={setModel}
      busy={busy}
      disabled={noModels}
      placeholder={big ? 'Ask about papers, citations or your shelf…' : waiting ? 'Answer above, or ask something else…' : 'Reply…'}
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
                className="ch-chip"
                disabled={noModels}
                onClick={() => {
                  setMode(c.mode ?? 'chat');
                  if (c.prompt.endsWith('?')) return send(c.prompt);
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
            </p>
          )}
        </div>
        <p className="ch-disclaimer is-home">Answers come only from real papers. Check important claims against the source.</p>
      </div>
    );

  return (
    <div className="ch">
      <header className="ch-head">
        {activeId && title ? <TitleMenu id={activeId} title={title} pinned={pinned} onRenamed={setTitle} /> : <span className="ch-title-plain">{title ?? 'New chat'}</span>}
      </header>

      <div className="ch-thread">
        <div className="ch-col">
          {loading && <p className="ch-quiet">Opening the chat…</p>}

          {turns.map((t) => {
            const titles = refTitles(t);
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
                {t.user != null && <div className="ch-user">{t.user}</div>}
                {t.parts.length > 0 && (
                  <div className="ch-ai">
                    {t.parts.map((p, i) =>
                      p.kind === 'steps' ? (
                        <Steps key={i} steps={p.steps} turn={t.key} />
                      ) : p.kind === 'assistant' ? (
                        <div key={i} className="ch-answer">
                          <Markdown text={p.text} cite={cite} />
                        </div>
                      ) : null,
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {waiting && (
            <div className="ch-ask" role="alertdialog" aria-label="The assistant is asking first">
              <p>{waiting.kind === 'confirm' ? waiting.question : `${waiting.label}. This uses 1 credit.`}</p>
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
              <span className="ch-orb is-small is-pulse" aria-hidden="true" /> Thinking
            </p>
          )}
          {error && (
            <p className="ch-error" role="alert">
              <Icon name="alert" /> {error}
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
  );
}
