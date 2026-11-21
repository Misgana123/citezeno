'use client';

import { forwardRef } from 'react';
import type { ModelInfo } from '@/lib/providers/chat/catalog';
import { Icon } from '../Icon';
import { Select } from '../Select';

/* The message box: what to ask (and, with a file open, which paper it's about), which model, and Send / Stop. */

type Props = {
  text: string;
  onText(t: string): void;
  models: ModelInfo[];
  model: string | null;
  onModel(id: string): void;
  busy: boolean;
  disabled?: boolean;
  placeholder: string;
  onSend(): void;
  onStop(): void;
  big?: boolean;
  /* the paper the question is about (the file open beside the chat), with a way to ask generally instead */
  context?: { label: string; onClear(): void } | null;
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
      {p.context && (
        <div className="ch-ctx">
          <Icon name="file" />
          <span>Asking about</span>
          <b title={p.context.label}>{p.context.label}</b>
          <button type="button" onClick={p.context.onClear} aria-label="Ask in general instead" title="Ask in general instead">
            <Icon name="x" />
          </button>
        </div>
      )}
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
        placeholder={p.placeholder}
        rows={p.big ? 2 : 1}
        maxLength={8000}
        aria-label="Message"
        disabled={p.disabled}
      />
      <div className="ch-compose-bar">
        {/* placeholder for adding things to a message (not wired up yet) */}
        <button type="button" className="ch-add" aria-label="Add">
          <Icon name="plus" />
        </button>
        <span className="ch-grow" />
        {p.models.length > 1 ? (
          <Select className="ch-model" menuClassName="ch-model-pop" value={p.model ?? ''} onChange={p.onModel} aria-label="AI model" options={p.models.map((m) => ({ value: m.id, label: m.label }))} />
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
