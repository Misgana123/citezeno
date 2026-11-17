'use client';

import { SPECIMENS } from '@/lib/styles';
import { toast } from './toast';

type K = keyof typeof SPECIMENS;
const KINDS: [K, string][] = [
  ['article', 'Journal article'],
  ['book', 'Book'],
  ['web', 'Web page'],
];

export async function copyText(plainText: string, html?: string) {
  try {
    if (html && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ]);
    } else await navigator.clipboard.writeText(plainText);
    toast('Copied to the clipboard');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = plainText;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      /* noop */
    }
    ta.remove();
    toast(ok ? 'Copied to the clipboard' : 'The browser blocked copying. Select the text and copy it manually.', !ok);
  }
}

export function KindSwitch({ kind, setKind }: { kind: K; setKind: (k: K) => void }) {
  return (
    <div className="seg" role="group" aria-label="Source type">
      {KINDS.map(([k, label]) => (
        <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}
