'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { TOPICS, type Topic } from '@/lib/contact';
import { Notice } from './auth/bits';
import { Icon } from './Icon';

type Errors = Partial<Record<'name' | 'email' | 'message', string>>;

export function ContactForm({ initialTopic }: { initialTopic?: string }) {
  const { data: session } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState<Topic>(TOPICS.includes(initialTopic as Topic) ? (initialTopic as Topic) : 'General question');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fields, setFields] = useState<Errors>({});

  // fill in what we already know about a signed-in visitor
  useEffect(() => {
    if (!session) return;
    setName((n) => n || session.user.name || '');
    setEmail((e) => e || session.user.email || '');
  }, [session]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setFields({});
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, topic, message, website }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body.error || 'We couldn’t send your message. Please try again.');
        setFields(body.fields || {});
        return;
      }
      setSent(true);
      setMessage('');
    } catch {
      setErr('You seem to be offline. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <div className="contact-form">
        <div className="sent">
          <div className="big-icon">
            <Icon name="check" />
          </div>
          <h2>Message sent</h2>
          <p>Thanks, {name.split(' ')[0] || 'friend'}. We usually reply to {email} within two working days.</p>
          <button className="btn btn-ghost btn-sm" onClick={() => setSent(false)}>
            Send another message
          </button>
        </div>
      </div>
    );

  return (
    <form className="contact-form" onSubmit={submit} noValidate>
      {err && <Notice kind="err">{err}</Notice>}
      <div className="two">
        <label className="field">
          Name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} required aria-invalid={!!fields.name} />
          {fields.name && <span className="field-err">{fields.name}</span>}
        </label>
        <label className="field">
          Email
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} required aria-invalid={!!fields.email} />
          {fields.email && <span className="field-err">{fields.email}</span>}
        </label>
      </div>
      <label className="field">
        Topic
        <select className="select" value={topic} onChange={(e) => setTopic(e.target.value as Topic)}>
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="field">
        Message
        <textarea
          className="input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={5000}
          required
          aria-invalid={!!fields.message}
          placeholder={topic === 'Bug report' ? 'What did you do, what did you expect, and what happened instead? Which browser are you using?' : 'How can we help?'}
        />
        {fields.message ? <span className="field-err">{fields.message}</span> : <span className="hint">{message.length.toLocaleString()} / 5,000</span>}
      </label>
      <label className="hp" aria-hidden="true">
        Website
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      <div className="foot-row">
        <span className="hint">We only use your email to reply to you.</span>
        <button className="btn btn-thread" disabled={busy}>
          {busy ? 'Sending…' : 'Send message'}
          {!busy && <Icon name="arrow" />}
        </button>
      </div>
    </form>
  );
}
