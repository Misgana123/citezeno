'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';

/* Copies `text`, or the page's address when no text is given. */
export function CopyButton({ text, label = 'Copy', className }: { text?: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text ?? location.href);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };
  return (
    <button type="button" className={className} onClick={copy}>
      <Icon name={done ? 'check' : text ? 'copy' : 'link'} className="ic" />
      {done ? 'Copied' : label}
    </button>
  );
}
