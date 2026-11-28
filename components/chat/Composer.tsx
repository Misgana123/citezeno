'use client';

import { forwardRef } from 'react';
import type { ModelChoice } from '@/lib/agent/models';
import type { ModelInfo } from '@/lib/providers/chat/catalog';

/* A model as the picker gets it: with the plan's lock and about what a reply costs, when the server says */
export type PickerModel = ModelInfo & Partial<Pick<ModelChoice, 'locked' | 'needs' | 'credits'>>;

const cost = (m: PickerModel) => {
  if (m.locked) return ` · needs ${m.needs ?? 'a higher plan'}`;
  const r = m.credits?.reply;
  return r ? ` · ≈${r.low === r.high ? r.low : `${r.low}–${r.high}`} credits` : '';
};
import { Icon } from '../Icon';
import { Select, type SelectItems } from '../Select';
import { AddMenu, type Picked } from './AddMenu';
import type { AttachItem } from './attach';
import { AttachCard } from './AttachCard';
import { ModelIcon } from './ModelIcon';

/* The model picker's list: the popular models first, then every model grouped
   by maker (A to Z) under "All". A short list stays as it is. */
function modelOptions(models: PickerModel[]): SelectItems {
  // locked models stay visible, with the plan that has them
  const option = (m: PickerModel) => ({ value: m.id, label: `${m.label}${cost(m)}`, disabled: Boolean(m.locked), icon: <ModelIcon vendor={m.vendor} /> });
  const groups = new Map<string, PickerModel[]>();
  for (const m of models) groups.set(m.vendorName, [...(groups.get(m.vendorName) ?? []), m]);
  if (groups.size < 2 && models.length <= 8) return models.map(option);
  const makers = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([label, ms]) => ({ label, options: ms.map(option) }));
  const popular = models.filter((m) => m.popular != null).sort((a, b) => a.popular! - b.popular!);
  if (!popular.length || popular.length === models.length) return makers;
  return [{ label: 'Popular', options: popular.map(option), shortcut: true }, { ...makers[0], section: 'All' }, ...makers.slice(1)];
}

/* The message box: what to ask (and, with a file open, which paper it's about),
   files or a screenshot added with +, web search switched on from +, which
   model, and Send / Stop. */

type Props = {
  text: string;
  onText(t: string): void;
  models: PickerModel[];
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
  /* a skill picked in the + menu for the next message (shown as a chip) */
  skill?: Picked;
  onSkill?(v: Picked): void;
  /* a shelf project picked in the + menu as the message's context (shown as a chip) */
  project?: Picked;
  onProject?(v: Picked): void;
};

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
        {p.onAddFiles && p.onScreenshot && (
          <AddMenu
            disabled={p.disabled}
            down={p.big}
            onAddFiles={p.onAddFiles}
            onScreenshot={p.onScreenshot}
            web={p.onWebSearch ? { on: !!p.webSearch, onChange: p.onWebSearch } : undefined}
            research={p.onDeepResearch ? { on: !!p.deepResearch, onChange: p.onDeepResearch } : undefined}
            skill={p.onSkill ? { value: p.skill ?? null, onChange: p.onSkill } : undefined}
            project={p.onProject ? { value: p.project ?? null, onChange: p.onProject } : undefined}
          />
        )}
        {p.skill && p.onSkill && (
          <span className="ch-chip" title="Skill for this message">
            <Icon name="skill" /> {p.skill.name}
            <button type="button" onClick={() => p.onSkill!(null)} aria-label={`Don’t use ${p.skill.name}`} title="Don’t use this skill">
              <Icon name="x" />
            </button>
          </span>
        )}
        {p.project && p.onProject && (
          <span className="ch-chip" title="Shelf project for this message">
            <Icon name="layers" /> {p.project.name}
            <button type="button" onClick={() => p.onProject!(null)} aria-label={`Ask without ${p.project.name}`} title="Ask without this project">
              <Icon name="x" />
            </button>
          </span>
        )}
        {p.deepResearch && p.onDeepResearch && (
          <span className="ch-chip">
            <Icon name="research" /> Research
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
