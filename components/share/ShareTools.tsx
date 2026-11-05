'use client';

import { usePathname, useRouter } from 'next/navigation';
import { STYLES, STYLE_GROUPS } from '@/lib/styles';
import { Icon } from '../Icon';
import { toast } from '../toast';

/* Viewer controls on a shared trace: switch style (re-rendered on the server) and copy the link. */
export function ShareTools({ style, bib }: { style: string; bib: string }) {
  const router = useRouter();
  const path = usePathname();
  const copy = async () => {
    await navigator.clipboard.writeText(window.location.origin + path);
    toast('Link copied');
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bib], { type: 'application/x-bibtex' }));
    a.download = 'references.bib';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="share-tools">
      <label className="field" style={{ minWidth: 220 }}>
        <span className="sr-only">Citation style</span>
        <select className="select" value={style} onChange={(e) => router.replace(`${path}?style=${e.target.value}`, { scroll: false })}>
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
      <button className="btn btn-ghost btn-sm" onClick={download}>
        <Icon name="download" /> BibTeX
      </button>
      <button className="btn btn-ghost btn-sm" onClick={copy}>
        <Icon name="copy" /> Copy link
      </button>
    </div>
  );
}
