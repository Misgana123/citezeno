'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import type { ModelInfo } from '@/lib/providers/chat/catalog';
import { Icon } from '../Icon';
import { Select, type SelectItems } from '../Select';
import { ATTACH_ACCEPT, canScreenshot, type AttachItem } from './attach';
import { AttachCard } from './AttachCard';
import { ModelIcon } from './ModelIcon';

/* The model picker's list: grouped by maker (A to Z) when there is more than one. */
function modelOptions(models: ModelInfo[]): SelectItems {
  const option = (m: ModelInfo) => ({ value: m.id, label: m.label, icon: <ModelIcon vendor={m.vendor} /> });
  const groups = new Map<string, ModelInfo[]>();
  for (const m of models) groups.set(m.vendorName, [...(groups.get(m.vendorName) ?? []), m]);
  if (groups.size < 2) return models.map(option);
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([label, ms]) => ({ label, options: ms.map(option) }));
}

/* The message box: what to ask (and, with a file open, which paper it's about),
   files or a screenshot added with +, web search switched on from +, which
   model, and Send / Stop. */

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
  /* the Web switch (in the + menu, shown as a chip while on) */
  webSearch?: boolean;
  onWebSearch?(on: boolean): void;
  /* Deep research for the next message (in the + menu, shown as a chip while chosen) */
  deepResearch?: boolean;
  onDeepResearch?(on: boolean): void;
};

type Web = { on: boolean; onChange(on: boolean): void };

/* The + button: upload files, take a screenshot, or turn web search on or off. */
function AddMenu({ disabled, onAddFiles, onScreenshot, web, research }: { disabled?: boolean; onAddFiles(files: File[]): void; onScreenshot(): void; web?: Web; research?: Web }) {
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
        aria-label="Add files, a screenshot, web search or deep research"
        title="Add files, a screenshot, web search or deep research"
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
          {web && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={web.on}
              className="ch-add-toggle"
              onClick={() => {
                setOpen(false);
                web.onChange(!web.on);
              }}
            >
              <Icon name="globe" /> Web search <span className={`ch-switch${web.on ? ' is-on' : ''}`} aria-hidden="true" />
            </button>
          )}
          {research && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={research.on}
              className="ch-add-toggle"
              onClick={() => {
                setOpen(false);
                research.onChange(!research.on);
              }}
            >
              <Icon name="compass" /> Deep research {research.on && <Icon name="check" className="ch-add-check" />}
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
        {p.onAddFiles && p.onScreenshot && <AddMenu disabled={p.disabled} onAddFiles={p.onAddFiles} onScreenshot={p.onScreenshot} web={p.onWebSearch ? { on: !!p.webSearch, onChange: p.onWebSearch } : undefined} research={p.onDeepResearch ? { on: !!p.deepResearch, onChange: p.onDeepResearch } : undefined} />}
        {p.deepResearch && p.onDeepResearch && (
          <span className="ch-chip">
            <Icon name="compass" /> Deep research
            <button type="button" onClick={() => p.onDeepResearch!(false)} aria-label="Turn off deep research" title="Turn off deep research">
              <Icon name="x" />
            </button>
          </span>
        )}
        {p.webSearch && p.onWebSearch && (
          <span className="ch-chip">
            <Icon name="globe" /> Web
            <button type="button" onClick={() => p.onWebSearch!(false)} aria-label="Turn off web search" title="Turn off web search">
              <Icon name="x" />
            </button>
          </span>
        )}
        <span className="ch-grow" />
        {p.models.length > 1 ? (
          <Select
            className="ch-model"
            menuClassName="ch-model-pop"
            value={p.model ?? ''}
            onChange={p.onModel}
            aria-label="AI model"
            search={p.models.length > 8 ? 'Search models' : undefined}
            options={modelOptions(p.models)}
          />
        ) : (
          p.models[0] && (
            <span className="ch-model is-one">
              <ModelIcon vendor={p.models[0].vendor} />
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
