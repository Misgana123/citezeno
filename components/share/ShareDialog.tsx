'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchRemote, pushRemote } from '@/lib/cloud';
import { fromSaved, type Saved } from '@/lib/library';
import { DEFAULT_THEME, MODE_LABEL, SHARE_MODES, SHARE_THEMES, isShareMode, isShareTheme, themeMeta, type ShareTheme } from '@/lib/share-themes';
import { buildShareView } from '@/lib/share-view';
import { STYLES, STYLE_GROUPS } from '@/lib/styles';
import type { Mode } from '@/lib/types';
import { Icon } from '../Icon';
import { toast } from '../toast';
import { SharePreview } from './SharePreview';
import { ThemeThumb } from './ThemeThumb';

export type ShareState = { token: string; url: string; theme: ShareTheme; style: string; mode: Mode; views: number };

type Props = {
  id: string;
  title: string;
  /* the signed-in user's name, shown as "Shared by …" */
  owner: string;
  /* the open trace from the studio; the library page leaves it out and the dialog fetches it */
  saved?: Saved;
  onClose: () => void;
  onChange?: (s: ShareState | null) => void;
};

const LAST_THEME = 'cz:share-theme';

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data as T;
}

/* Pick a design, style and output form, watch the public page update live,
   then create (or update) the read-only link and copy it. */
export function ShareDialog({ id, title, owner, saved, onClose, onChange }: Props) {
  const initial = useRef(saved);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const [data, setData] = useState<Saved | null>(saved ?? null);
  const [name, setName] = useState(title);
  const [live, setLive] = useState<ShareState | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<ShareTheme>(DEFAULT_THEME);
  const [style, setStyleRaw] = useState(saved && STYLES[saved.style] ? saved.style : 'apa');
  const [mode, setMode] = useState<Mode>(saved && isShareMode(saved.mode) ? saved.mode : 'intext');

  /* sync the latest copy to the account, then learn whether a link already exists */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let entry = initial.current;
        if (entry) await pushRemote(entry);
        else entry = await fetchRemote(id);
        const st = await call<({ shared: true } & ShareState & { title: string }) | { shared: false; title: string }>(`/api/traces/${id}/share`, 'GET');
        if (!alive) return;
        setData(entry);
        if (st.title) setName(st.title);
        if (st.shared) {
          setLive(st);
          setTheme(st.theme);
          setStyleRaw(st.style);
          setMode(st.mode);
        } else {
          let last: string | null = null;
          try {
            last = localStorage.getItem(LAST_THEME);
          } catch {
            /* storage unavailable */
          }
          setTheme(isShareTheme(last) ? last : DEFAULT_THEME);
          setStyleRaw(STYLES[entry.style] ? entry.style : 'apa');
          setMode(isShareMode(entry.mode) ? entry.mode : 'intext');
        }
        setReady(true);
      } catch (e) {
        if (!alive) return;
        toast((e as Error).message, true);
        closeRef.current();
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  /* escape closes; the page behind doesn't scroll */
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = prev;
    };
  }, []);

  const notes = STYLES[style]?.family === 'notes';
  const setStyle = (next: string) => {
    if (!STYLES[next]) return;
    setStyleRaw(next);
    if (STYLES[next].family === 'notes' && mode === 'intext') setMode('footnotes');
  };

  const view = useMemo(
    () => (data && STYLES[style] ? buildShareView({ title: name, owner, savedAt: data.savedAt, style, mode, result: fromSaved(data) }) : null),
    [data, name, owner, style, mode],
  );

  const dirty = Boolean(live && (live.theme !== theme || live.style !== style || live.mode !== mode));

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const publish = async () => {
    setBusy(true);
    try {
      const st = await call<ShareState>(`/api/traces/${id}/share`, 'POST', { theme, style, mode });
      setLive(st);
      onChange?.(st);
      try {
        localStorage.setItem(LAST_THEME, theme);
      } catch {
        /* storage unavailable */
      }
      const copied = await copyText(st.url);
      toast(live ? (copied ? 'Link updated and copied' : 'Link updated') : copied ? 'Link created and copied' : 'Link created');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const primary = async () => {
    if (live && !dirty) {
      toast((await copyText(live.url)) ? 'Link copied' : 'Couldn’t copy. Select the link and copy it.', !(await copyText(live.url)));
      return;
    }
    await publish();
  };

  const unshare = async () => {
    setBusy(true);
    try {
      await call(`/api/traces/${id}/share`, 'DELETE');
      setLive(null);
      onChange?.(null);
      toast('Link turned off');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shd-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="shd" role="dialog" aria-modal="true" aria-labelledby="shd-title">
        <header className="shd-head">
          <div className="shd-head-txt">
            <p className="shd-eyebrow">
              <Icon name="globe" /> Share a read-only link
            </p>
            <h2 id="shd-title" title={name}>
              {name}
            </h2>
          </div>
          <div className="shd-head-end">
            {live && (
              <span className="shd-live">
                <i /> Live · {live.views} view{live.views === 1 ? '' : 's'}
              </span>
            )}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" autoFocus>
              <Icon name="x" />
            </button>
          </div>
        </header>

        <div className="shd-body">
          <aside className="shd-side">
            <section>
              <h3 className="shd-lbl">Design</h3>
              <div className="shd-themes" role="radiogroup" aria-label="Design">
                {SHARE_THEMES.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={theme === t.id} className="shd-theme" onClick={() => setTheme(t.id)}>
                    <ThemeThumb id={t.id} />
                    <span className="shd-theme-txt">
                      <b>
                        {t.name}
                        {t.dark && <i>dark</i>}
                      </b>
                      <small>{t.blurb}</small>
                    </span>
                    <span className="shd-check">
                      <Icon name="check" />
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="shd-two">
              <label className="field">
                Citation style
                <select className="select" value={style} onChange={(e) => setStyle(e.target.value)}>
                  {STYLE_GROUPS.map(([g, ids]) => (
                    <optgroup key={g} label={g}>
                      {ids.map((sid) => (
                        <option key={sid} value={sid}>
                          {STYLES[sid].name}, {STYLES[sid].edition}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="field">
                Output
                <select className="select" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                  {SHARE_MODES.map((m) => (
                    <option key={m} value={m} disabled={m === 'intext' && notes}>
                      {MODE_LABEL[m]}
                    </option>
                  ))}
                </select>
              </label>
            </section>
            {notes && mode === 'intext' && <p className="shd-note">{STYLES[style].name} cites with notes, so footnotes are shown.</p>}
            <p className="shd-hint">Viewers can switch the citation style themselves and download BibTeX. The design is yours to choose.</p>
          </aside>

          <main className="shd-main">
            {ready && view ? (
              <SharePreview theme={theme} view={view} style={style} onStyle={setStyle} token={live?.token} />
            ) : (
              <div className="shd-loading">
                <span className="shd-spin" /> Preparing the preview…
              </div>
            )}
          </main>
        </div>

        <footer className="shd-foot">
          <div className="shd-link">
            <Icon name={live ? 'globe' : 'lock'} />
            {live ? (
              <input readOnly value={live.url} onFocus={(e) => e.target.select()} aria-label="Public link" />
            ) : (
              <p className="shd-link-off">Not shared yet. Anyone with the link will be able to read this trace, but not edit it.</p>
            )}
          </div>
          {dirty && live && (
            <p className="shd-dirty">
              <Icon name="alert" /> The live link still shows {themeMeta(live.theme).name} in {STYLES[live.style]?.name || live.style}. Update it to publish these changes.
            </p>
          )}
          <div className="shd-actions">
            {live && (
              <a className="btn btn-ghost btn-sm" href={live.url} target="_blank" rel="noopener">
                <Icon name="external" /> Open
              </a>
            )}
            {live && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={unshare} disabled={busy}>
                Turn off link
              </button>
            )}
            <button type="button" className="btn btn-thread btn-sm shd-primary" onClick={primary} disabled={busy || !ready}>
              <Icon name={live && !dirty ? 'copy' : 'globe'} />
              {busy ? 'Working…' : !live ? 'Create link & copy' : dirty ? 'Update link & copy' : 'Copy link'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
