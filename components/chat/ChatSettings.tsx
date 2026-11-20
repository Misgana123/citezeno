'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ORDER, STYLES } from '@/lib/styles';
import type { ModelInfo } from '@/lib/providers/chat/catalog';
import { Icon } from '../Icon';
import { studioPrefs } from './citations';

/* The assistant's settings: which model new chats start with (kept in this
   browser), and the citation style find_citations formats references in
   (the Studio's own style setting, shared with the Studio). */

const MODEL_KEY = 'cz:chat-model';

export function savedModel(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}

function saveModel(id: string) {
  try {
    localStorage.setItem(MODEL_KEY, id);
  } catch {
    /* storage blocked */
  }
}

function saveStyle(style: string) {
  try {
    const raw = localStorage.getItem('cz:prefs');
    const prefs = raw ? JSON.parse(raw) : {};
    localStorage.setItem('cz:prefs', JSON.stringify({ ...prefs, style }));
  } catch {
    /* storage blocked */
  }
}

export function ChatSettings({ models, onDefaultModel }: { models: ModelInfo[]; onDefaultModel(id: string): void }) {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState<string>('');
  const [style, setStyle] = useState('apa');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setModel(savedModel() ?? models[0]?.id ?? '');
    setStyle(studioPrefs().style);
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open, models]);

  return (
    <div className="ch-settings" ref={box}>
      <button type="button" className="ch-pill" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="gear" /> <span className="ch-pill-lbl">Settings</span>
      </button>
      {open && (
        <div className="ch-pop" role="dialog" aria-label="Assistant settings">
          {models.length > 0 && (
            <label className="field">
              Model for new chats
              <select
                className="select"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  saveModel(e.target.value);
                  onDefaultModel(e.target.value);
                }}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Citation style
            <select
              className="select"
              value={style}
              onChange={(e) => {
                setStyle(e.target.value);
                saveStyle(e.target.value);
              }}
            >
              {ORDER.filter((id) => STYLES[id]).map((id) => (
                <option key={id} value={id}>
                  {STYLES[id].name} {STYLES[id].edition}
                </option>
              ))}
            </select>
          </label>
          <p className="ch-pop-note">
            Used when the assistant finds citations. It’s the same setting as in the <Link href="/app/citation">Citation studio</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
