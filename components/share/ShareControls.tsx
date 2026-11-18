'use client';

import { usePathname, useRouter } from 'next/navigation';
import { STYLES, STYLE_GROUPS } from '@/lib/styles';
import { Icon } from '../Icon';
import { toast } from '../toast';

/* What a design needs to show its viewer controls. On the public page the
   style switch navigates (the server re-renders); in the share dialog's
   preview the dialog passes onStyle and the buttons are inert. */
export type ToolsProps = { style: string; bib: string; preview?: boolean; onStyle?: (id: string) => void };

type Variant = 'light' | 'glass' | 'dark' | 'bare';

export function ShareControls({ style, bib, preview, onStyle, variant = 'light' }: ToolsProps & { variant?: Variant }) {
  const router = useRouter();
  const path = usePathname();
  const change = (id: string) => (onStyle ? onStyle(id) : router.replace(`${path}?style=${id}`, { scroll: false }));
  const copy = async () => {
    if (preview) return;
    try {
      await navigator.clipboard.writeText(window.location.origin + path);
      toast('Link copied');
    } catch {
      toast('Couldn’t copy. Use the address bar instead.', true);
    }
  };
  const download = () => {
    if (preview) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bib], { type: 'application/x-bibtex' }));
    a.download = 'references.bib';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const btn = variant === 'glass' ? 'btn btn-on-blue btn-sm' : 'btn btn-ghost btn-sm';
  return (
    <div className={`sh-tools sh-tools-${variant}`}>
      <label className="sh-sel">
        <span className="sr-only">Citation style</span>
        <select value={style} onChange={(e) => change(e.target.value)}>
          {STYLE_GROUPS.map(([g, ids]) => (
            <optgroup key={g} label={g}>
              {ids.map((id) => (
                <option key={id} value={id}>
                  {STYLES[id].name}, {STYLES[id].edition}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <button type="button" className={btn} onClick={download} tabIndex={preview ? -1 : 0}>
        <Icon name="download" /> BibTeX
        {variant === 'bare' && <span className="sh-hint">.bib</span>}
      </button>
      <button type="button" className={btn} onClick={copy} tabIndex={preview ? -1 : 0}>
        <Icon name="copy" /> Copy link
      </button>
    </div>
  );
}
