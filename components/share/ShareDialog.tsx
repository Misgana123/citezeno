'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchRemote, pushRemote } from '@/lib/cloud';
import { fromSaved, type Saved } from '@/lib/library';
import { DEFAULT_THEME, MODE_LABEL, SHARE_MODES, SHARE_THEMES, isShareMode, isShareTheme, themeMeta, type ShareTheme } from '@/lib/share-themes';
import { buildShareView } from '@/lib/share-view';
import { EXPIRY_PRESETS, PASSWORD_MAX, endOfDay, formatExpiry, passwordProblem, type ExpiryPreset } from '@/lib/share-access';
import { STYLES, STYLE_GROUPS } from '@/lib/styles';
import type { Mode } from '@/lib/types';
import { Icon } from '../Icon';
import { toast } from '../toast';
import { SharePreview } from './SharePreview';
import { ThemeThumb } from './ThemeThumb';
import { Select } from '../Select';

const STYLE_OPTIONS = STYLE_GROUPS.map(([g, ids]) => ({ label: g, options: ids.map((sid) => ({ value: sid, label: `${STYLES[sid].name}, ${STYLES[sid].edition}` })) }));

export type ShareState = {
  token: string; url: string; theme: ShareTheme; style: string; mode: Mode; views: number;
  /* ISO date-time, or null for a link that never expires */
  expiresAt: string | null; expired: boolean; hasPassword: boolean;
};

/* 'keep' leaves an existing expiry date as it is */
type ExpiryChoice = 'keep' | ExpiryPreset | 'custom';
type PasswordChoice = 'keep' | 'set' | 'remove';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type Props = {
  id: string;
  title: string;
  /* the signed-in user's name, shown as "Shared by …" */
  owner: string;
  /* the open trace from the studio; the library dialog leaves it out and the dialog fetches it */
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
  const [expiry, setExpiry] = useState<ExpiryChoice>('never');
  const [customDate, setCustomDate] = useState('');
  const [pwChoice, setPwChoice] = useState<PasswordChoice>('keep');
  const [password, setPassword] = useState('');

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
          setExpiry(st.expiresAt ? 'keep' : 'never');
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

  /* the expiry and password changes to send; nothing when they're unchanged */
  const access = useMemo((): { expires?: string; password?: string | null; error?: string } => {
    const out: { expires?: string; password?: string | null; error?: string } = {};
    if (expiry === 'custom') {
      const iso = endOfDay(customDate);
      if (!iso || Date.parse(iso) <= Date.now()) out.error = 'Pick a future date for the link to expire.';
      else out.expires = iso;
    } else if (expiry !== 'keep' && !(expiry === 'never' && !live?.expiresAt)) out.expires = expiry;
    if (pwChoice === 'set') {
      const problem = passwordProblem(password);
      if (problem) out.error = out.error || `Password: ${problem}`;
      else out.password = password;
    } else if (pwChoice === 'remove' && live?.hasPassword) out.password = null;
    return out;
  }, [expiry, customDate, pwChoice, password, live]);
  const accessDirty = access.expires !== undefined || access.password !== undefined || Boolean(access.error);
  const designDirty = Boolean(live && (live.theme !== theme || live.style !== style || live.mode !== mode));
  const dirty = Boolean(live && (designDirty || accessDirty));

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const publish = async () => {
    if (access.error) return toast(access.error, true);
    setBusy(true);
    try {
      const { error: _e, ...changes } = access;
      const st = await call<ShareState>(`/api/traces/${id}/share`, 'POST', { theme, style, mode, ...changes });
      setLive(st);
      setExpiry(st.expiresAt ? 'keep' : 'never');
      setPwChoice('keep');
      setPassword('');
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
      setExpiry('never');
      setPwChoice('keep');
      setPassword('');
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
              <span className={`shd-live${live.expired ? ' is-expired' : ''}`}>
                <i /> {live.expired ? 'Expired' : 'Live'} · {live.views} view{live.views === 1 ? '' : 's'}
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
                <Select value={style} onChange={setStyle} options={STYLE_OPTIONS} />
              </label>
              <label className="field">
                Output
                <Select<Mode> value={mode} onChange={setMode} options={SHARE_MODES.map((m) => ({ value: m, label: MODE_LABEL[m], disabled: m === 'intext' && notes }))} />
              </label>
            </section>
            {notes && mode === 'intext' && <p className="shd-note">{STYLES[style].name} cites with notes, so footnotes are shown.</p>}
            <p className="shd-hint">Viewers can switch the citation style themselves and download BibTeX. The design is yours to choose.</p>
            {ready && (
            <section className="shd-access">
              <h3 className="shd-lbl">Access</h3>
              <label className="field">
                Link expires
                <Select<ExpiryChoice>
                  value={expiry}
                  onChange={setExpiry}
                  options={[
                    ...(live?.expiresAt ? [{ value: 'keep' as const, label: `${live.expired ? 'Expired on' : 'Keep:'} ${formatExpiry(live.expiresAt)}` }] : []),
                    ...EXPIRY_PRESETS.map((p) => ({ value: p.id, label: p.days ? `${p.label} from now` : p.label })),
                    { value: 'custom', label: 'On a date…' },
                  ]}
                />
              </label>
              {expiry === 'custom' && (
                <label className="field">
                  Last day the link works
                  <input
                    className="input"
                    type="date"
                    value={customDate}
                    min={isoDay(new Date())}
                    onChange={(e) => setCustomDate(e.target.value)}
                  />
                </label>
              )}
              {live?.expired && expiry === 'keep' && (
                <p className="shd-note">
                  <Icon name="clock" /> This link has expired. Pick a new expiry to open it again.
                </p>
              )}

              {live?.hasPassword && pwChoice !== 'set' ? (
                <div className="shd-pw">
                  <span className={pwChoice === 'remove' ? 'is-off' : ''}>
                    <Icon name="lock" /> {pwChoice === 'remove' ? 'Password will be removed' : 'Password protected'}
                  </span>
                  {pwChoice === 'remove' ? (
                    <button type="button" className="shd-mini" onClick={() => setPwChoice('keep')}>
                      Keep it
                    </button>
                  ) : (
                    <>
                      <button type="button" className="shd-mini" onClick={() => setPwChoice('set')}>
                        Change
                      </button>
                      <button type="button" className="shd-mini" onClick={() => setPwChoice('remove')}>
                        Remove
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={pwChoice === 'set'}
                    onChange={(e) => {
                      setPwChoice(e.target.checked ? 'set' : 'keep');
                      if (!e.target.checked) setPassword('');
                    }}
                  />
                  {live?.hasPassword ? 'Set a new password' : 'Require a password'}
                </label>
              )}
              {pwChoice === 'set' && (
                <label className="field">
                  <span className="sr-only">Password for the link</span>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 4 characters"
                    value={password}
                    maxLength={PASSWORD_MAX}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                  />
                  <small className="shd-hint">Viewers enter it before they can read the trace. Share it separately from the link.</small>
                </label>
              )}
            </section>
            )}
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
              <Icon name="alert" />{' '}
              {designDirty
                ? `The live link still shows ${themeMeta(live.theme).name} in ${STYLES[live.style]?.name || live.style}. Update it to publish these changes.`
                : 'Update the link to apply the new access settings.'}
            </p>
          )}
          {live && (live.expiresAt || live.hasPassword) && !dirty && (
            <p className="shd-access-sum">
              {live.expiresAt && (
                <span>
                  <Icon name="clock" /> {live.expired ? 'Expired' : 'Expires'} {formatExpiry(live.expiresAt)}
                </span>
              )}
              {live.hasPassword && (
                <span>
                  <Icon name="lock" /> Password
                </span>
              )}
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
