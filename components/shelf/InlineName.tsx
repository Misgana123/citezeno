'use client';

import { useEffect, useRef, useState } from 'react';

/* A one-line name field used to create or rename a project, folder or tag.
   Enter saves, Escape or leaving an empty field cancels. */
export function InlineName({
  initial = '',
  placeholder,
  label,
  onSave,
  onCancel,
}: {
  initial?: string;
  placeholder: string;
  label: string;
  onSave: (name: string) => Promise<unknown> | void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const save = async () => {
    const name = value.trim();
    if (!name || name === initial) return onCancel();
    setBusy(true);
    await onSave(name);
    setBusy(false);
  };

  return (
    <form
      className="sh-inline"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <input
        ref={ref}
        className="input"
        value={value}
        maxLength={80}
        placeholder={placeholder}
        aria-label={label}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        onBlur={() => !value.trim() && onCancel()}
      />
    </form>
  );
}
