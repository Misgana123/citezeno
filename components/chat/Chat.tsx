'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent } from '@/lib/agent/types';
import type { ConversationView } from '@/lib/agent/view';
import { Icon, type IconName } from '../Icon';
import { answerQuestion, deleteChat, listChats, openChat, pinChat, renameChat, sendClientResult, sendMessage, type ChatList as ChatIndex } from './api';
import { runClientTool } from './citations';
import { ChatList } from './ChatList';
import { ChatSettings, savedModel } from './ChatSettings';
import { applyEvent, type Entry } from './events';
import { Markdown } from './Markdown';
import { refAnchor } from './PaperRefs';
import { Steps } from './Steps';

/* The research assistant: the chat list, the conversation, and a floating
   message box. Each step the assistant takes shows up as it happens; the
   answer cites the papers it found by number ([2]), linked to the list. */

type Waiting = NonNullable<ConversationView['waiting']>;
type ClientTask = { callId: string; name: string; input: unknown; label: string };

const SUGGESTIONS: { icon: IconName; title: string; prompt: string }[] = [
  { icon: 'search', title: 'Find and save papers', prompt: 'Find recent papers on sleep and memory, save the three most relevant to my Thesis project, and tag them “memory”.' },
  { icon: 'layers', title: 'Ask about your shelf', prompt: 'What’s in my library about machine learning in healthcare?' },
  { icon: 'quote', title: 'Cite a claim', prompt: 'Find citations for: regular exercise improves sleep quality in older adults.' },
  { icon: 'shield', title: 'Check for retractions', prompt: 'Which papers on my shelf are retracted?' },
];

function setUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('c', id);
  else url.searchParams.delete('c');
  window.history.replaceState(null, '', url);
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

export function Chat({ initialId }: { initialId: string | null }) {
  const [index, setIndex] = useState<ChatIndex | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [title, setTitle] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!initialId);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const models = index?.models ?? [];
  const noModels = index != null && models.length === 0;
  /* the model new chats start with: the one chosen in Settings, if still offered */
  const startModel = useCallback((l: ChatIndex | null) => {
    const saved = savedModel();
    return l?.models.some((m) => m.id === saved) ? saved : (l?.defaultModel ?? null);
  }, []);

  const refreshList = useCallback(async () => {
    try {
      const l = await listChats();
      setIndex(l);
      setListError(null);
      setModel((m) => m ?? startModel(l));
    } catch (e) {
      setListError((e as Error).message);
    }
  }, [startModel]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const load = useCallback(
    async (id: string | null) => {
      abort.current?.abort();
      setActiveId(id);
      setUrl(id);
      setError(null);
      setWaiting(null);
      setBusy(false);
      setListOpen(false);
      if (!id) {
        setEntries([]);
        setTitle(null);
        setModel(startModel(index));
        inputRef.current?.focus();
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
    [index, startModel],
  );

  useEffect(() => {
    if (initialId) load(initialId);
    // only on first open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

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
    let newId: string | null = null;
    let conversationId = activeId;
    let task: ClientTask | null = null;
    try {
      await start((e) => {
        if (e.type === 'conversation') {
          newId = e.id;
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
      if (newId) refreshList();
    }
    if (task && conversationId && !ctrl.signal.aborted) await runInBrowser(conversationId, task);
  };

  /* Run a step in the browser, then send its result to carry on the reply. */
  const runInBrowser = async (conversationId: string, task: ClientTask) => {
    setBusy(true);
    const outcome = await runClientTool(task.name, task.input);
    await run((onEvent, signal) => sendClientResult({ conversationId, callId: task.callId, outcome }, onEvent, signal));
  };

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || busy || noModels) return;
    setText('');
    setWaiting(null);
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

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refreshList();
    } catch (e) {
      setListError((e as Error).message);
    }
  };

  const remove = (id: string) => {
    if (!window.confirm('Delete this chat? This can’t be undone.')) return;
    act(async () => {
      await deleteChat(id);
      if (id === activeId) load(null);
    });
  };

  const turns = useMemo(() => toTurns(entries), [entries]);
  const working = busy && !entries.some((e) => e.kind === 'steps' && e.steps.some((s) => s.status === 'running'));
  const empty = !loading && entries.length === 0 && !waiting;

  return (
    <div className={`ch${listOpen ? ' is-list-open' : ''}`}>
      <aside className="ch-side" aria-label="Chats">
        <ChatList
          chats={index?.conversations ?? null}
          activeId={activeId}
          error={listError}
          onOpen={(id) => load(id)}
          onNew={() => load(null)}
          onRename={(id, t) =>
            act(async () => {
              await renameChat(id, t);
              if (id === activeId) setTitle(t);
            })
          }
          onPin={(id, pinned) => act(() => pinChat(id, pinned))}
          onDelete={remove}
        />
      </aside>
      {listOpen && <button type="button" className="ch-scrim" aria-label="Close the chat list" onClick={() => setListOpen(false)} />}

      <section className="ch-main" aria-label={title ?? 'New chat'}>
        <header className="ch-head">
          <button type="button" className="ch-icon ch-list-toggle" aria-label="Show your chats" aria-expanded={listOpen} onClick={() => setListOpen(true)}>
            <Icon name="panel" />
          </button>
          <h1 className="ch-title">{title ?? 'New chat'}</h1>
          <div className="ch-head-acts">
            <ChatSettings models={models} onDefaultModel={(id) => !activeId && setModel(id)} />
            <button type="button" className="ch-pill is-dark" onClick={() => load(null)}>
              <Icon name="plus" /> <span className="ch-pill-lbl">New chat</span>
            </button>
          </div>
        </header>

        <div className="ch-thread">
          <div className="ch-col">
            {loading && <p className="ch-quiet">Opening the chat…</p>}

            {empty && (
              <div className="ch-hello">
                <span className="ch-orb" aria-hidden="true" />
                <h2>What are you researching?</h2>
                <p>Find papers, keep your shelf in order, or cite a claim. I only use real papers, and I ask before changing anything big.</p>
                <div className="ch-suggest">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.title} type="button" onClick={() => send(s.prompt)} disabled={busy || noModels}>
                      <span className="ch-suggest-icon">
                        <Icon name={s.icon} />
                      </span>
                      <b>{s.title}</b>
                      <span>{s.prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                      <div className="ch-ai-head">
                        <span className="ch-orb is-small" aria-hidden="true" /> Citezeno
                      </div>
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
            {working && <p className="ch-quiet ch-thinking">Thinking</p>}
            {error && (
              <p className="ch-error" role="alert">
                <Icon name="alert" /> {error}
              </p>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="ch-dock">
          <form
            className="ch-compose"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            {noModels ? (
              <p className="ch-quiet">The assistant isn’t set up yet: no AI model is available.</p>
            ) : (
              <>
                <textarea
                  ref={inputRef}
                  className="ch-input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      send(text);
                    }
                  }}
                  placeholder={waiting ? 'Answer above, or ask something else…' : 'Ask about papers, citations or your shelf…'}
                  rows={1}
                  maxLength={8000}
                  aria-label="Message"
                />
                <div className="ch-compose-bar">
                  {models.length > 1 ? (
                    <label className="ch-model">
                      <Icon name="sparkle" />
                      <select value={model ?? ''} onChange={(e) => setModel(e.target.value)} aria-label="AI model for this chat">
                        {models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <span className="ch-model is-one">
                      <Icon name="sparkle" /> {models[0]?.label}
                    </span>
                  )}
                  {busy ? (
                    <button type="button" className="ch-send is-stop" onClick={() => abort.current?.abort()}>
                      <Icon name="stop" /> Stop
                    </button>
                  ) : (
                    <button type="submit" className="ch-send" disabled={!text.trim()}>
                      <Icon name="send" /> Send
                    </button>
                  )}
                </div>
              </>
            )}
          </form>
          <p className="ch-disclaimer">Answers come only from real papers the tools found. Check important claims against the source.</p>
        </div>
      </section>
    </div>
  );
}
