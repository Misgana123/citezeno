'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import type { ModelInfo } from '@/lib/providers/chat/catalog';
import { Icon } from '../Icon';
import { Select } from '../Select';
import { ATTACH_ACCEPT, canScreenshot, type AttachItem } from './attach';
import { AttachCard } from './AttachCard';
import { ModelIcon } from './ModelIcon';

/* The message box: what to ask (and, with a file open, which paper it's about),
   files or a screenshot added with +, which model, and Send / Stop. */

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
  /* files added to the message (the + menu shows only when these are given) */
  attachments?: AttachItem[];
  onAddFiles?(files: File[]): void;
  onScreenshot?(): void;
  onRemoveAttachment?(id: string): void;
};

/* The + button: upload files, or take a screenshot. */
function AddMenu({ disabled, onAddFiles, onScreenshot }: { disabled?: boolean; onAddFiles(files: File[]): void; onScreenshot(): void }) {
  const [open, setOpen] = useState(false);
  const [shots, setShots] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setShots(canScreenshot()), []);
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

  return (
    <div className="ch-add-wrap" ref={box}>
      <button
        type="button"
        className="ch-add"
        aria-label="Add files or a screenshot"
        title="Add files or a screenshot"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <Icon name="plus" />
      </button>
      {open && (
        <div className="cz-menu ch-add-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              input.current?.click();
            }}
          >
            <Icon name="upload" /> Upload files
          </button>
          {shots && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onScreenshot();
              }}
            >
              <Icon name="screenshot" /> Take a screenshot
            </button>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={ATTACH_ACCEPT}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onAddFiles(files);
        }}
      />
    </div>
  );
}

/* The files added to the message, each with a way to take it out. */
function AttachList({ items, onRemove }: { items: AttachItem[]; onRemove?(id: string): void }) {
  return (
    <ul className="ch-files" aria-label="Added files">
      {items.map((a) => (
        <AttachCard key={a.id} file={{ ...a, kind: a.attachment?.kind }} onRemove={onRemove && (() => onRemove(a.id))} />
      ))}
    </ul>
  );
}

export const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer(p, ref) {
  const files = p.attachments ?? [];
  const reading = files.some((a) => a.status === 'reading');
  const ready = files.some((a) => a.status === 'ready');
  const canSend = (!!p.text.trim() || ready) && !reading && !p.disabled;
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
      {files.length > 0 && <AttachList items={files} onRemove={p.onRemoveAttachment} />}
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
        {p.onAddFiles && p.onScreenshot && <AddMenu disabled={p.disabled} onAddFiles={p.onAddFiles} onScreenshot={p.onScreenshot} />}
        <span className="ch-grow" />
        {p.models.length > 1 ? (
          <Select
            className="ch-model"
            menuClassName="ch-model-pop"
            value={p.model ?? ''}
            onChange={p.onModel}
            aria-label="AI model"
            options={p.models.map((m) => ({ value: m.id, label: m.label, icon: <ModelIcon provider={m.provider} /> }))}
          />
        ) : (
          p.models[0] && (
            <span className="ch-model is-one">
              <ModelIcon provider={p.models[0].provider} />
              {p.models[0].label}
            </span>
          )
        )}
        {p.busy ? (
          <button type="button" className="ch-send is-stop" onClick={p.onStop} aria-label="Stop">
            <Icon name="stop" />
          </button>
        ) : (
          <button type="submit" className="ch-send" disabled={!canSend} aria-label="Send" title={reading ? 'Still reading a file…' : undefined}>
            <Icon name="send" />
          </button>
        )}
      </div>
    </form>
  );
});
