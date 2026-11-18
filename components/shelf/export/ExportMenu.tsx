'use client';

import { useCallback, useRef, useState } from 'react';
import { EXPORT_FILES, type ExportFormat } from '@/lib/shelf/export/types';
import { Icon } from '../../Icon';
import { toast } from '../../toast';
import { useDismiss } from '../useDismiss';
import type { Groups } from '../useShelfGroups';
import { exportEverything, exportFile } from './run-export';

/* Export the papers in view (or a selection) as BibTeX, RIS or CSV, or the
   whole shelf with notes and PDFs as one ZIP. */
export function ExportMenu({ groups, query, baseName, label = 'Export', everything = true }: { groups: Groups; query: URLSearchParams; baseName: string; label?: string; everything?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close);

  const one = async (format: ExportFormat) => {
    setOpen(false);
    setBusy('Preparing…');
    try {
      const n = await exportFile(format, query, groups, baseName, (d, t) => setBusy(`${d} of ${t}`));
      toast(`Exported ${n} paper${n === 1 ? '' : 's'}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  const all = async () => {
    setOpen(false);
    setBusy('Preparing…');
    try {
      const r = await exportEverything(groups, setBusy);
      toast(r.missing.length ? `Exported ${r.papers} papers; ${r.missing.length} PDFs could not be included (listed in README.txt)` : `Exported ${r.papers} papers and ${r.pdfs} PDFs`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="sh-export" ref={box}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} disabled={!!busy} aria-haspopup="menu" aria-expanded={open}>
        {busy ? <span className="spin" aria-hidden="true" /> : <Icon name="download" />} {busy ?? label}
      </button>
      {open && (
        <div className="umenu-pop sh-export-menu" role="menu">
          {(Object.keys(EXPORT_FILES) as ExportFormat[]).map((f) => (
            <button key={f} type="button" role="menuitem" onClick={() => one(f)}>
              <Icon name="doc" /> {EXPORT_FILES[f].label}
            </button>
          ))}
          {everything && (
            <button type="button" role="menuitem" onClick={all} className="sh-export-all">
              <Icon name="zip" /> Everything (ZIP with notes and PDFs)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
