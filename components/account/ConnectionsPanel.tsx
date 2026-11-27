'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ConnectorView } from '@/lib/connectors/catalog';
import { confirmDialog } from '../confirm';
import { connectHref, connectorFetch } from '../connectors/api';
import { toast } from '../toast';

/* Account → Connected apps: connect an app (its own sign-in page, or a
   pasted key), see which account is connected, connect again, disconnect. */

const BACK = '/app/account#apps';

export function ConnectionsPanel({ connectors }: { connectors: ConnectorView[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [keyFor, setKeyFor] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // back from an app's sign-in page
  useEffect(() => {
    const ok = params.get('connected');
    const err = params.get('connect_error');
    if (!ok && !err) return;
    const label = connectors.find((c) => c.name === ok)?.label ?? 'The app';
    toast(ok ? `${label} connected` : err!, !ok);
    router.replace(BACK, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveKey = async (c: ConnectorView, e: React.FormEvent) => {
    e.preventDefault();
    setBusy(c.name);
    try {
      await connectorFetch(`/api/connectors/${encodeURIComponent(c.name)}`, { method: 'POST', body: { key } });
      setKey('');
      setKeyFor(null);
      toast(`${c.label} connected`);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (c: ConnectorView) => {
    const ok = await confirmDialog({ title: `Disconnect ${c.label}?`, body: `Citezeno and the assistant will no longer reach your ${c.label}. Nothing in ${c.label} or on your shelf is deleted.`, confirmLabel: 'Disconnect', danger: true });
    if (!ok) return;
    setBusy(c.name);
    try {
      await connectorFetch(`/api/connectors/${encodeURIComponent(c.name)}`, { method: 'DELETE' });
      toast(`${c.label} disconnected`);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel" id="apps">
      <h2>Connected apps</h2>
      <p>Bring papers and files in from the apps you already use, and send your work back to them. The assistant can use connected apps too, and asks before it changes anything.</p>
      {connectors.length === 0 ? (
        <p className="small">Connecting apps isn’t set up on this site yet.</p>
      ) : (
        <ul className="rows">
          {connectors.map((c) => {
            const conn = c.connection;
            const stale = conn?.status === 'needs_reconnect';
            const keyOnly = !c.signIn && !!c.apiKey;
            return (
              <li key={c.name}>
                <span>
                  <b>{c.label}</b>
                  {conn && !stale && <span className="tag">Connected</span>}
                  {stale && <span className="badge warn">Connect again</span>}
                  <small>
                    {conn ? `${conn.label}${c.services.length ? ` · ${c.services.join(', ')}` : ''}` : c.description}
                    {stale && ' The connection stopped working (access was withdrawn or expired).'}
                  </small>
                  {keyFor === c.name && (
                    <form className="conn-key" onSubmit={(e) => saveKey(c, e)}>
                      <label className="field">
                        <span>
                          {c.label} API key{' '}
                          <a href={c.apiKey!.helpUrl} target="_blank" rel="noreferrer">
                            (make one)
                          </a>
                        </span>
                        <input className="input" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} required minLength={8} />
                      </label>
                      <div className="actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setKeyFor(null)}>
                          Cancel
                        </button>
                        <button className="btn btn-sm" disabled={busy === c.name || key.trim().length < 8}>
                          {busy === c.name ? 'Checking…' : 'Connect'}
                        </button>
                      </div>
                    </form>
                  )}
                </span>
                <span className="conn-actions">
                  {(!conn || stale) && c.signIn && (
                    <a className="btn btn-ghost btn-sm" href={connectHref(c.name, BACK)}>
                      {stale ? 'Connect again' : 'Connect'}
                    </a>
                  )}
                  {(!conn || stale) && c.apiKey && keyFor !== c.name && (
                    <button type="button" className={keyOnly ? 'btn btn-ghost btn-sm' : 'link conn-alt'} onClick={() => setKeyFor(c.name)}>
                      {keyOnly ? 'Connect' : 'Use an API key instead'}
                    </button>
                  )}
                  {conn && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy === c.name} onClick={() => remove(c)}>
                      Disconnect
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
