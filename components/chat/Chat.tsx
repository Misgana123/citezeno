'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent } from '@/lib/agent/types';
import type { ConversationView } from '@/lib/agent/view';
import { Icon } from '../Icon';
import { InlineName } from '../shelf/InlineName';
import { answerQuestion, deleteChat, listChats, openChat, renameChat, sendClientResult, sendMessage, type ChatList } from './api';
import { runClientTool } from './citations';
import { Markdown } from './Markdown';
import { applyEvent, type Entry } from './events';
import { Steps } from './Steps';

/* The research assistant: a conversation list, the conversation, and a
   message box. Each step the assistant takes shows up as it happens. */

type Waiting = NonNullable<ConversationView['waiting']>;
type ClientTask = { callId: string; name: string; input: unknown; label: string };

const EXAMPLES = [
  'Find recent papers on sleep and memory, save the five most relevant to my Thesis project, and tag them “memory”.',
  'What’s in my library about machine learning in healthcare?',
  'Add 10.7717/peerj.4375 to my library and put it in my Climate essay project.',
  'Which papers on my shelf are retracted?',
];

function setUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('c', id);
  else url.searchParams.delete('c');
  window.history.replaceState(null, '', url);
}

export function Chat({ initialId }: { initialId: string | null }) {
  const [list, setList] = useState<ChatList | null>(null);
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
  const [renaming, setRenaming] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshList = useCallback(async () => {
    try {
      const l = await listChats();
      setList(l);
      setListError(null);
      setModel((m) => m ?? l.defaultModel);
    } catch (e) {
      setListError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const load = useCallback(async (id: string | null) => {
    abort.current?.abort();
    setActiveId(id);
    setUrl(id);
    setError(null);
    setWaiting(null);
    setBusy(false);
    if (!id) {
      setEntries([]);
      setTitle(null);
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
  }, []);

  useEffect(() => {
    if (initialId) load(initialId);
  }, [initialId, load]);

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
    if (!message || busy) return;
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

  const remove = async (id: string) => {
    if (!window.confirm('Delete this conversation? This can’t be undone.')) return;
    try {
      await deleteChat(id);
      if (id === activeId) load(null);
      refreshList();
    } catch (e) {
      setListError((e as Error).message);
    }
  };

  const models = list?.models ?? [];
  const noModels = list != null && models.length === 0;

  return (
    <div className="ch">
      <aside className="ch-side" aria-label="Conversations">
        <button type="button" className="btn btn-thread btn-sm ch-new" onClick={() => load(null)}>
          <Icon name="plus" /> New chat
        </button>
        {listError && <p className="ch-side-note">{listError}</p>}
        <ul className="ch-convs">
          {list?.conversations.map((c) => (
            <li key={c.id} className="ch-conv">
              {renaming === c.id ? (
                <InlineName
                  initial={c.title}
                  label="Conversation title"
                  placeholder="Title"
                  onCancel={() => setRenaming(null)}
                  onSave={async (t) => {
                    await renameChat(c.id, t);
                    setRenaming(null);
                    if (c.id === activeId) setTitle(t);
                    refreshList();
                  }}
                />
              ) : (
                <>
                  <button type="button" className="ch-conv-open" aria-current={c.id === activeId ? 'true' : undefined} onClick={() => load(c.id)} title={c.title}>
                    {c.title}
                  </button>
                  <span className="ch-conv-acts">
                    <button type="button" className="btn btn-ghost ch-icon" aria-label={`Rename “${c.title}”`} onClick={() => setRenaming(c.id)}>
                      <Icon name="wand" />
                    </button>
                    <button type="button" className="btn btn-ghost ch-icon" aria-label={`Delete “${c.title}”`} onClick={() => remove(c.id)}>
                      <Icon name="trash" />
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
          {list && !list.conversations.length && <li className="ch-side-note">Your conversations will show here.</li>}
        </ul>
        <p className="ch-side-note ch-private">
          <Icon name="lock" /> Conversations are private to you and never used to train AI.
        </p>
      </aside>

      <section className="ch-main" aria-label={title ?? 'New chat'}>
        <div className="ch-thread" aria-live="polite">
          {loading ? (
            <p className="ch-quiet">Opening the conversation…</p>
          ) : entries.length === 0 && !waiting ? (
            <div className="ch-empty">
              <h2 className="h3">What are you researching?</h2>
              <p>Ask me to find papers, save and organize them on your shelf, or answer questions about what you’ve saved.</p>
              <div className="ch-examples">
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" className="ch-example" onClick={() => send(ex)} disabled={busy || noModels}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            entries.map((e, i) =>
              e.kind === 'user' ? (
                <div key={i} className="ch-msg is-user">
                  <p>{e.text}</p>
                </div>
              ) : e.kind === 'assistant' ? (
                <div key={i} className="ch-msg is-assistant">
                  <Markdown text={e.text} />
                </div>
              ) : (
                <Steps key={i} steps={e.steps} />
              ),
            )
          )}
          {waiting && (
            <div className="ch-confirm" role="alertdialog" aria-label="The assistant is asking first">
              <p>{waiting.kind === 'confirm' ? waiting.question : `${waiting.label}. This uses 1 credit.`}</p>
              <div className="ch-confirm-acts">
                <button type="button" className="btn btn-thread btn-sm" onClick={() => answer(true)} disabled={busy}>
                  {waiting.kind === 'confirm' ? 'Yes' : 'Run it'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => answer(false)} disabled={busy}>
                  {waiting.kind === 'confirm' ? 'No' : 'Skip'}
                </button>
              </div>
            </div>
          )}
          {busy && !entries.some((e) => e.kind === 'steps' && e.steps.some((s) => s.status === 'running')) && <p className="ch-quiet ch-thinking">Thinking…</p>}
          {error && (
            <p className="ch-error" role="alert">
              <Icon name="alert" /> {error}
            </p>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="ch-compose"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          {noModels ? (
            <p className="ch-side-note">The assistant isn’t set up yet: no AI model is available.</p>
          ) : (
            <>
              <textarea
                className="input ch-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(text);
                  }
                }}
                placeholder={waiting ? 'Answer the question above, or write something else' : 'Ask about papers or your shelf…'}
                rows={2}
                maxLength={8000}
                aria-label="Message"
              />
              <div className="ch-compose-bar">
                {models.length > 1 ? (
                  <select className="select ch-model" value={model ?? ''} onChange={(e) => setModel(e.target.value)} aria-label="AI model">
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="ch-model-one">{models[0]?.label}</span>
                )}
                {busy ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => abort.current?.abort()}>
                    <Icon name="stop" /> Stop
                  </button>
                ) : (
                  <button type="submit" className="btn btn-thread btn-sm" disabled={!text.trim()}>
                    <Icon name="arrow" /> Send
                  </button>
                )}
              </div>
            </>
          )}
        </form>
      </section>
    </div>
  );
}
