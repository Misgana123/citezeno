'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageMeta } from '@/lib/agent/types';
import { refreshChats } from '../../chat/chat-index';
import { streamReply } from '../../chat/api';
import { Icon } from '../../Icon';
import { toast } from '../../toast';
import { readerFetch, readerUrl, type ReaderData } from '../api';
import { Cited, citeOrder } from '../ai/Cited';
import type { PassageRef } from '../ai/usePassages';

/* The assistant while reading: one conversation per paper, docked in the right
   panel, with a scope switch.
   - This paper: answers only from the paper, every claim linked to its passage,
     "This paper doesn't say" when it doesn't.
   - Assistant: the research assistant with the paper as context; anything not
     from the paper is labeled as coming from outside it. */

export type Scope = 'paper' | 'assistant';
type Msg = { id: string; role: 'user' | 'assistant'; text: string; meta: MessageMeta | null; streaming?: boolean; steps?: string[]; error?: boolean; credits?: number };

export type ChatRequest = { kind: 'ask' | 'explain'; quote: string; page: number; key: number };

let seq = 0;
const nextId = () => `m${++seq}`;
const clean = (t: string) => t.replace(/\s*\[\s*p\d+-\d+[^\]]*\]/g, '').trim();

export function ReaderChat({
  data,
  pdfId,
  chatId: initialChat,
  passages,
  onCite,
  request,
  onRequestDone,
  onSaveNote,
  onAutoSaved,
}: {
  data: ReaderData;
  pdfId: string | null;
  /* a conversation to continue (from the assistant's Read link or the sidebar) */
  chatId: string | null;
  passages: Map<string, PassageRef>;
  onCite(id: string): void;
  /* "Ask about this" (a quote for the composer) or "Explain" (answered straight away) */
  request: ChatRequest | null;
  onRequestDone(): void;
  onSaveNote(text: string, passageIds: string[]): void;
  onAutoSaved(itemId: string): void;
}) {
  const paperId = data.paper.id;
  const [scope, setScope] = useState<Scope>('paper');
  const [chatId, setChatId] = useState<string | null>(initialChat);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [quote, setQuote] = useState<{ text: string; page: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const q = pdfId ? `?pdf=${encodeURIComponent(pdfId)}` : '';

  useEffect(() => {
    let live = true;
    readerFetch<{ chatId: string | null; messages: { role: 'user' | 'assistant'; text: string; meta: MessageMeta | null }[]; suggestions: string[] }>(
      readerUrl(paperId, `/chat${initialChat ? `?chat=${encodeURIComponent(initialChat)}` : ''}`),
    )
      .then((r) => {
        if (!live) return;
        setChatId(r.chatId);
        setMessages(r.messages.map((m) => ({ ...m, id: nextId() })));
        setSuggestions(r.suggestions);
      })
      .catch((e) => live && toast((e as Error).message, true))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
      abort.current?.abort();
    };
  }, [paperId, initialChat]);

  // keep the newest message in view
  useEffect(() => {
    const el = listRef.current?.lastElementChild;
    el?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages]);

  const status = data.text?.status ?? null;
  const preparing = status === 'pending' || status === 'processing';
  const paperOff = scope === 'paper' && (preparing || (status !== 'ready' && !data.paper.abstract));
  const offReason = !data.ai ? 'AI isn’t set up yet.' : scope === 'paper' && preparing ? 'Preparing paper…' : paperOff ? 'This paper has no text or abstract to answer from. Switch to Assistant, or upload the PDF.' : null;

  const patchLast = (fn: (m: Msg) => Msg) => setMessages((ms) => (ms.length ? [...ms.slice(0, -1), fn(ms[ms.length - 1])] : ms));

  const sendPaper = useCallback(
    async (body: { kind: 'ask' | 'explain'; question: string; quote: string | null; page: number | null }) => {
      const ctl = new AbortController();
      abort.current = ctl;
      setBusy(true);
      const userText = body.kind === 'explain' ? `Explain: “${(body.quote ?? '').slice(0, 300)}${(body.quote ?? '').length > 300 ? '…' : ''}”` : body.question;
      setMessages((ms) => [
        ...ms,
        { id: nextId(), role: 'user', text: userText, meta: { scope: 'paper', kind: body.kind, ...(body.quote ? { quote: body.quote } : {}), ...(body.page ? { page: body.page } : {}) } },
        { id: nextId(), role: 'assistant', text: '', meta: { scope: 'paper', kind: body.kind }, streaming: true },
      ]);
      try {
        await streamReply(
          readerUrl(paperId, `/ask${q}`),
          { ...body, chatId },
          (raw) => {
            const e = raw as unknown as { type: string; chatId?: string; itemId?: string; delta?: string; text?: string; passageIds?: string[]; basedOn?: 'full_text' | 'abstract'; message?: string; charged?: number };
            if (e.type === 'chat' && e.chatId) {
              if (!chatId) void refreshChats();
              setChatId(e.chatId);
            } else if (e.type === 'saved' && e.itemId) onAutoSaved(e.itemId);
            else if (e.type === 'text') patchLast((m) => ({ ...m, text: m.text + (e.delta ?? '') }));
            else if (e.type === 'done') patchLast((m) => ({ ...m, text: e.text ?? m.text, streaming: false, meta: { scope: 'paper', kind: body.kind, passageIds: e.passageIds ?? [], basedOn: e.basedOn } }));
            else if (e.type === 'credits' && e.charged != null) patchLast((m) => ({ ...m, credits: e.charged }));
            else if (e.type === 'error') patchLast((m) => ({ ...m, text: e.message ?? 'Something went wrong.', streaming: false, error: true }));
          },
          ctl.signal,
        );
      } catch (err) {
        patchLast((m) => ({ ...m, text: (err as Error).message, streaming: false, error: true }));
      } finally {
        patchLast((m) => (m.streaming ? { ...m, streaming: false } : m));
        setBusy(false);
      }
    },
    [paperId, q, chatId, onAutoSaved],
  );

  const sendAssistant = useCallback(
    async (text: string) => {
      const ctl = new AbortController();
      abort.current = ctl;
      setBusy(true);
      setMessages((ms) => [...ms, { id: nextId(), role: 'user', text, meta: { scope: 'assistant' } }, { id: nextId(), role: 'assistant', text: '', meta: { scope: 'assistant' }, streaming: true, steps: [] }]);
      try {
        await streamReply(
          '/api/agent/chat',
          { conversationId: chatId, text, paperId },
          (e) => {
            if (e.type === 'conversation') {
              if (!chatId) void refreshChats();
              setChatId(e.id);
            } else if (e.type === 'step') patchLast((m) => ({ ...m, steps: [...(m.steps ?? []), e.label] }));
            else if (e.type === 'text') patchLast((m) => ({ ...m, text: m.text ? `${m.text}\n\n${e.text}` : e.text }));
            else if (e.type === 'confirm' || e.type === 'client_tool') patchLast((m) => ({ ...m, text: `${m.text}\n\nThis step needs you in the assistant page.`.trim() }));
            else if (e.type === 'error') patchLast((m) => ({ ...m, text: e.message, error: true }));
            else if (e.type === 'done') patchLast((m) => ({ ...m, streaming: false }));
          },
          ctl.signal,
        );
      } catch (err) {
        patchLast((m) => ({ ...m, text: (err as Error).message, streaming: false, error: true }));
      } finally {
        patchLast((m) => (m.streaming ? { ...m, streaming: false } : m));
        setBusy(false);
      }
    },
    [chatId, paperId],
  );

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy || offReason) return;
    setInput('');
    if (scope === 'assistant') {
      void sendAssistant(quote ? `About this passage (page ${quote.page}): “${quote.text}”\n\n${t}` : t);
    } else void sendPaper({ kind: 'ask', question: t, quote: quote?.text ?? null, page: quote?.page ?? null });
    setQuote(null);
  };

  // "Ask about this" puts the selection in the message box; "Explain" answers straight away
  useEffect(() => {
    if (!request) return;
    if (request.kind === 'ask') {
      setQuote({ text: request.quote, page: request.page });
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (!busy && data.ai) {
      setScope('paper');
      void sendPaper({ kind: 'explain', question: '', quote: request.quote, page: request.page });
    }
    onRequestDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  return (
    <div className="rd-chat">
      <div className="rd-scope seg" role="tablist" aria-label="Who answers">
        <button type="button" role="tab" aria-selected={scope === 'paper'} onClick={() => setScope('paper')} title="Answers only from this paper, with links to the passages">
          <Icon name="doc" /> This paper
        </button>
        <button type="button" role="tab" aria-selected={scope === 'assistant'} onClick={() => setScope('assistant')} title="The research assistant, with this paper as context">
          <Icon name="sparkle" /> Assistant
        </button>
      </div>

      <ol className="rd-msgs" ref={listRef} aria-live="polite">
        {!loaded && <li className="rd-muted">Loading…</li>}
        {loaded && !messages.length && (
          <li className="rd-chat-empty">
            <b>{scope === 'paper' ? 'Ask about this paper' : 'Ask the research assistant'}</b>
            <p>{scope === 'paper' ? 'Answers come only from the paper, and every claim links to its passage.' : 'It can find related papers, look at your shelf or explain background. Anything not from this paper is labeled.'}</p>
            {scope === 'paper' && !offReason && (
              <span className="rd-suggest">
                {suggestions.map((s) => (
                  <button key={s} type="button" className="rd-chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </span>
            )}
          </li>
        )}
        {messages.map((m) => (
          <Message key={m.id} m={m} passages={passages} onCite={onCite} onSaveNote={onSaveNote} />
        ))}
      </ol>

      <form
        className="rd-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {quote && (
          <div className="rd-quote-chip">
            <Icon name="quote" />
            <span>{quote.text}</span>
            <button type="button" className="icon-btn" aria-label="Remove the quote" onClick={() => setQuote(null)}>
              <Icon name="x" />
            </button>
          </div>
        )}
        {offReason ? (
          <p className="rd-composer-off">
            {preparing && scope === 'paper' && <span className="spin" aria-hidden="true" />} {offReason}
          </p>
        ) : (
          <div className="rd-composer-row">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={2000}
              placeholder={scope === 'paper' ? 'Ask about this paper' : 'Ask the assistant'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            {busy ? (
              <button type="button" className="rd-send" onClick={() => abort.current?.abort()} aria-label="Stop">
                <Icon name="stop" />
              </button>
            ) : (
              <button type="submit" className="rd-send" disabled={!input.trim()} aria-label="Send">
                <Icon name="send" />
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

function Message({ m, passages, onCite, onSaveNote }: { m: Msg; passages: Map<string, PassageRef>; onCite(id: string): void; onSaveNote(text: string, passageIds: string[]): void }) {
  if (m.role === 'user')
    return (
      <li className="rd-msg is-user">
        {m.meta?.quote && m.meta.kind !== 'explain' && <blockquote>{m.meta.quote}</blockquote>}
        <p>{m.text}</p>
      </li>
    );
  const outside = m.meta?.scope === 'assistant' || !m.meta;
  const order = citeOrder([m.text]);
  return (
    <li className={`rd-msg is-ai${m.error ? ' is-error' : ''}`}>
      <span className="rd-msg-who">
        {outside ? (
          <>
            <Icon name="sparkle" /> Assistant
          </>
        ) : (
          <>
            <Icon name="doc" /> {m.meta?.kind === 'explain' ? 'Explained from this paper' : 'From this paper'}
            {m.meta?.basedOn === 'abstract' && <em> · based on the abstract only</em>}
            {m.credits != null && <em> · {m.credits === 0 ? 'no credits' : `${m.credits} credit${m.credits === 1 ? '' : 's'}`}</em>}
          </>
        )}
      </span>
      {m.steps && m.steps.length > 0 && (
        <ul className="rd-steps">
          {m.steps.map((s, i) => (
            <li key={i}>
              <Icon name="check" /> {s}
            </li>
          ))}
        </ul>
      )}
      {m.text ? (
        <div className="rd-msg-text">
          {m.text.split(/\n{2,}/).map((para, i) => (
            <p key={i}>
              <Cited text={para} order={order} passages={passages} onCite={onCite} />
            </p>
          ))}
        </div>
      ) : (
        m.streaming && <span className="rd-typing" aria-label="Writing" />
      )}
      {!m.streaming && !m.error && m.text && (
        <span className="rd-msg-acts">
          {!outside && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSaveNote(m.text, m.meta?.passageIds ?? [])}>
              <Icon name="pencil" /> Save as note
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              navigator.clipboard
                .writeText(clean(m.text))
                .then(() => toast('Copied'))
                .catch(() => toast('Copy isn’t available here.', true))
            }
          >
            <Icon name="copy" /> Copy
          </button>
        </span>
      )}
    </li>
  );
}
