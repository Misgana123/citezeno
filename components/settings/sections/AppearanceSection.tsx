'use client';

import { useEffect, useState } from 'react';

/* Appearance: light, dark, or the same as the device (remembered in this browser). */

type Choice = 'light' | 'dark' | 'system';
const KEY = 'cz:theme';

const systemTheme = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function applyTheme(c: Choice) {
  document.documentElement.dataset.theme = c === 'system' ? systemTheme() : c;
  try {
    if (c === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, c);
  } catch {
    /* storage blocked */
  }
}

export function AppearanceSection() {
  const [choice, setChoice] = useState<Choice>('system');
  useEffect(() => {
    try {
      const t = localStorage.getItem(KEY)?.replace(/"/g, '');
      setChoice(t === 'light' || t === 'dark' ? t : 'system');
    } catch {
      setChoice((document.documentElement.dataset.theme as Choice) ?? 'light');
    }
  }, []);
  // "Match system" follows the device when it changes
  useEffect(() => {
    if (choice !== 'system') return;
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [choice]);
  const pick = (c: Choice) => {
    setChoice(c);
    applyTheme(c);
  };
  return (
    <section>
      <h3>Appearance</h3>
      <p className="st-lead">How Citezeno looks on this device.</p>
      <div className="st-group">
        <h4>Theme</h4>
        <div className="st-themes" role="radiogroup" aria-label="Theme">
          {(
            [
              ['light', 'Light'],
              ['dark', 'Dark'],
              ['system', 'Match system'],
            ] as const
          ).map(([c, label]) => (
            <button key={c} type="button" role="radio" aria-checked={choice === c} className={`st-theme${choice === c ? ' is-on' : ''}`} onClick={() => pick(c)}>
              <span className={`st-theme-pv is-${c}`}>
                <i />
              </span>
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
