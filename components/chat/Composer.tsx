'use client';

import { forwardRef } from 'react';
import type { ModelInfo } from '@/lib/providers/chat/catalog';
import { Icon } from '../Icon';

/* The message box: what to ask, Chat or Cite (Cite asks for sources for the
   text), which model, and Send / Stop. */

export type ComposeMode = 'chat' | 'cite';

type Props = {
  text: string;
  onText(t: string): void;
  mode: ComposeMode;
  onMode(m: ComposeMode): void;
  models: ModelInfo[];
  model: string | null;
  onModel(id: string): void;
  busy: boolean;
  disabled?: boolean;
  placeholder: string;
  onSend(): void;
  onStop(): void;
  big?: boolean;
};

export const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer(p, ref) {
  return (
    <form
      className={`ch-compose${p.big ? ' is-big' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        p.onSend();
      }}
    >
      <textarea
        ref={ref}
        className="ch-input"
        value={p.text}
        onChange={(e) => p.onText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            p.onSend();
          }
        }}
        placeholder={p.mode === 'cite' ? 'Paste a claim or paragraph to find sources for…' : p.placeholder}
        rows={p.big ? 2 : 1}
        maxLength={8000}
        aria-label="Message"
        disabled={p.disabled}
      />
      <div className="ch-compose-bar">
        <div className="ch-seg" role="radiogroup" aria-label="What to do">
          <button type="button" role="radio" aria-checked={p.mode === 'chat'} onClick={() => p.onMode('chat')}>
            Chat
          </button>
          <button type="button" role="radio" aria-checked={p.mode === 'cite'} onClick={() => p.onMode('cite')} title="Find real sources for a claim or paragraph (1 credit per claim)">
            Cite
          </button>
        </div>
        <span className="ch-grow" />
        {p.models.length > 1 ? (
          <label className="ch-model">
            <select value={p.model ?? ''} onChange={(e) => p.onModel(e.target.value)} aria-label="AI model">
              {p.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <Icon name="chevron" />
          </label>
        ) : (
          p.models[0] && <span className="ch-model is-one">{p.models[0].label}</span>
        )}
        {p.busy ? (
          <button type="button" className="ch-send is-stop" onClick={p.onStop} aria-label="Stop">
            <Icon name="stop" />
          </button>
        ) : (
          <button type="submit" className="ch-send" disabled={!p.text.trim() || p.disabled} aria-label="Send">
            <Icon name="send" />
          </button>
        )}
      </div>
    </form>
  );
});
