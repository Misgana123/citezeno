'use client';

import { useCallback, useRef, useState } from 'react';
import { EXPORT_FILES, type ExportFormat } from '@/lib/shelf/export/types';
import { Icon } from '../../Icon';
import { toast } from '../../toast';
import { useDismiss } from '../useDismiss';
import type { Groups } from '../useShelfGroups';
import { exportEverything, exportFile } from './run-export';
import { SendDialog, type SendKind } from '../../connectors/SendDialog';
import { useConnectors } from '../../connectors/useConnectors';
import type { ConnectorView } from '@/lib/connectors/catalog';

/* Export the papers in view (or a selection) as BibTeX, RIS or CSV, or the
   whole shelf with notes and PDFs as one ZIP; or send them to a connected app. */

const SEND_LABEL: Record<SendKind, (app: ConnectorView) => string> = { references: (a) => `Send to ${a.label}`, sheets: () => 'Send to Google Sheets', pages: (a) => `Send to a ${a.label} database` };

export function ExportMenu({ groups, query, baseName, label = 'Export', everything = true, compact = false, count = null }: { groups: Groups; query: URLSearchParams; baseName: string; label?: string; everything?: boolean; compact?: boolean; count?: number | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close);
  const apps = useConnectors();
  const sendTo = (['references', 'sheets', 'pages'] as SendKind[]).flatMap((kind) => {
    const app = apps.forCapability(kind);
    return app?.connection?.status === 'ok' ? [{ kind, app }] : [];
  });
  const [sending, setSending] = useState<{ kind: SendKind; app: ConnectorView } | null>(null);

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
      {compact && !busy ? (
        <button type="button" className="sh-tool-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label}>
          <Icon name="download" />
        </button>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} disabled={!!busy} aria-haspopup="menu" aria-expanded={open}>
          {busy ? <span className="spin" aria-hidden="true" /> : <Icon name="download" />} {busy ?? label}
        </button>
      )}
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
          {sendTo.map(({ kind, app }, i) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              className={i === 0 ? 'sh-export-all' : undefined}
              onClick={() => {
                setOpen(false);
                setSending({ kind, app });
              }}
            >
              <Icon name="upload" /> {SEND_LABEL[kind](app)}
            </button>
          ))}
        </div>
      )}
      {sending && <SendDialog app={sending.app} kind={sending.kind} query={query} count={count} defaultTitle={baseName.replace(/^citezeno-?/, '').replace(/-/g, ' ').trim() || 'Citezeno papers'} onClose={() => setSending(null)} />}
    </div>
  );
}
