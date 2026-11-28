'use client';

import { useState } from 'react';
import type { ConnectorView } from '@/lib/connectors/catalog';
import type { Permission } from '@/lib/connectors/permissions';
import { AppLogo } from '../../connectors/AppLogo';
import { connectWithKey, disconnectApp, setAssistant, setPermission, signInHref } from '../../connectors/actions';
import { Icon } from '../../Icon';
import { longDate } from '../sections/shared';
import { logoFor } from './cards';

const CHOICES: [Permission, string][] = [
  ['allow', 'Always allow'],
  ['ask', 'Ask first'],
  ['never', 'Never'],
];

/* One app: its connection, whether the assistant may use it, and what it may do. */
export function ConnectorDetail({ connector: c, keyForm = false, onBack }: { connector: ConnectorView; keyForm?: boolean; onBack(): void }) {
  const conn = c.connection;
  const stale = conn?.status === 'needs_reconnect';
  const [keyOpen, setKeyOpen] = useState(keyForm && !!c.apiKey);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  const saveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (await connectWithKey(c, key.trim())) {
      setKey('');
      setKeyOpen(false);
    }
    setBusy(false);
  };

  let action: React.ReactNode = null;
  if (conn && !stale)
    action = (
      <button type="button" className="st-btn is-danger" onClick={async () => (await disconnectApp(c)) && onBack()}>
        Disconnect
      </button>
    );
  else if (c.signIn)
    action = (
      <a className="st-btn is-dark" href={signInHref(c.name)}>
        {stale ? 'Reconnect' : 'Connect'}
      </a>
    );
  else if (c.apiKey && !keyOpen)
    action = (
      <button type="button" className="st-btn is-dark" onClick={() => setKeyOpen(true)}>
        {stale ? 'Reconnect' : 'Connect'}
      </button>
    );

  return (
    <section>
      <button type="button" className="st-back" onClick={onBack}>
        <Icon name="arrow" />
        Connectors
      </button>
      <div className="st-dhead">
        <AppLogo app={logoFor(c)} />
        <div className="st-txt">
          <h3>{c.label}</h3>
          <small>
            {c.services.join(', ')}
            {c.services.length ? ' · ' : ''}by Citezeno
          </small>
        </div>
        {action}
      </div>

      <div className="st-group">
        <h4>Connection</h4>
        <div className="st-box">
          <div className="st-line st-wrap">
            <div className="st-txt">
              <b>
                {conn ? conn.label : 'Not connected'}
                {conn && !stale && <span className="st-tag is-ok">Connected</span>}
                {stale && <span className="st-tag is-bad">Connect again</span>}
              </b>
              <small>
                {stale ? 'The connection stopped working (access was withdrawn or expired). ' : ''}
                {c.description}
                {conn ? ` Connected ${longDate(conn.connectedAt)}.` : ''}
              </small>
            </div>
            {!conn && c.signIn && c.apiKey && !keyOpen && (
              <button type="button" className="st-btn is-ghost" onClick={() => setKeyOpen(true)}>
                <Icon name="key" /> Use an API key instead
              </button>
            )}
            {keyOpen && c.apiKey && (
              <form className="st-keyform" onSubmit={saveKey}>
                <label className="st-field">
                  <span>
                    {c.label} API key{' '}
                    <a href={c.apiKey.helpUrl} target="_blank" rel="noreferrer">
                      (make one)
                    </a>
                  </span>
                  <input className="st-input" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} required minLength={8} autoFocus />
                </label>
                <div className="st-acts">
                  <button type="button" className="st-btn" onClick={() => setKeyOpen(false)}>
                    Cancel
                  </button>
                  <button className="st-btn is-dark" disabled={busy || key.trim().length < 8}>
                    {busy ? 'Checking…' : 'Connect'}
                  </button>
                </div>
              </form>
            )}
          </div>
          {c.manage && conn && !stale && (
            <div className="st-line">
              <div className="st-txt">
                <b>What Citezeno can see</b>
                <small>Citezeno only sees what you choose at {c.label}. Change it there at any time.</small>
              </div>
              <a className="st-btn" href={c.manage.url} target="_blank" rel="noreferrer">
                {c.manage.label}
                <Icon name="external" />
              </a>
            </div>
          )}
          {conn && !stale && (
            <div className="st-line">
              <div className="st-txt">
                <b>Use in the assistant</b>
                <small>When this is off, the assistant can’t see or use {c.label}. You can still use it on your shelf and in Citation.</small>
              </div>
              <button type="button" className={`st-switch${conn.assistant ? ' is-on' : ''}`} role="switch" aria-checked={conn.assistant} aria-label={`The assistant can use ${c.label}`} onClick={() => setAssistant(c, !conn.assistant)} />
            </div>
          )}
        </div>
      </div>

      {c.permissions.length > 0 && (
        <div className="st-group">
          <h4>What the assistant can do</h4>
          <p className="st-hint">“Ask first” shows you the step in the chat before it runs.</p>
          <div className="st-box">
            {c.permissions.map((p) => (
              <div className="st-perm" key={p.key}>
                <div className="st-txt">
                  {p.label}
                  <small>{p.hint}</small>
                </div>
                <select className="st-input" value={p.value} disabled={!conn || stale} aria-label={p.label} onChange={(e) => setPermission(c, p.key, e.target.value as Permission)}>
                  {CHOICES.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
