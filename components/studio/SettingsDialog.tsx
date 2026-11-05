'use client';

import { useEffect, useState } from 'react';
import type { ApiSettings } from '@/lib/types';

export function SettingsDialog({ value, onSave, onClose }: { value: ApiSettings; onSave: (v: ApiSettings) => void; onClose: () => void }) {
  const [email, setEmail] = useState(value.email || '');
  const [key, setKey] = useState(value.openalexKey || '');
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        role="dialog"
        aria-labelledby="set-title"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ email: email.trim(), openalexKey: key.trim() });
        }}
      >
        <h2 id="set-title">Database settings</h2>
        <p>
          Both are optional. A contact email moves your requests into the faster “polite pool” at OpenAlex and Crossref,
          and is sent only to those two services.
        </p>
        <label className="field">
          Contact email
          <input className="input" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@university.edu" />
        </label>
        <label className="field">
          OpenAlex API key
          <input className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Leave blank to use the free tier" />
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-sm">
            Save settings
          </button>
        </div>
      </form>
    </div>
  );
}
