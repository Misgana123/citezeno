'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { TOPICS, type Topic } from '@/lib/contact';
import { Notice } from './auth/bits';
import { Icon, LogoMark } from './Icon';
import { Select } from './Select';

type Errors = Partial<Record<'name' | 'email' | 'message', string>>;

/* margin note 3 and the writing prompt change with the topic */
const TIPS: Record<Topic, [string, string]> = {
  'General question': ['Ask anything about the assistant, deep research, the reader or your shelf.', 'How can we help?'],
  'Bug report': ['Say what you did, what you expected and what happened. Name your browser.', 'What did you do, what did you expect, and what happened instead? Which browser are you using?'],
  'Feature idea': ['Tell us the problem you hit, not only the fix. It helps us build the right thing.', 'What would make your research easier?'],
  'Account help': ['Use the email on your account so we can find it.', 'What’s happening with your account?'],
  Partnership: ['Tell us who you are and what you have in mind.', 'Who are you and what do you have in mind?'],
  Other: ['Anything else. Press, feedback on the site, or a kind word.', 'What’s on your mind?'],
};

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
  const [date, setDate] = useState('');

  // fill in what we already know about a signed-in visitor
  useEffect(() => {
    if (!session) return;
    setName((n) => n || session.user.name || '');
    setEmail((e) => e || session.user.email || '');
  }, [session]);

  // the visitor's own date, set after mount so server and client markup match
  useEffect(() => setDate(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setFields({});
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email, topic, message, website }) });
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

  const fieldErrs = Object.values(fields).filter(Boolean);

  return (
    <div className="letter-desk">
      {sent ? (
        <div className="letter">
          <div className="letter-sent" role="status">
            <svg viewBox="0 0 120 84" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="116" height="80" rx="6" />
              <path d="M4 6l56 42 56-42" />
              <circle cx="96" cy="22" r="10" />
            </svg>
            <h2>Your letter is on its way</h2>
            <p>
              Thanks, {name.split(' ')[0] || 'friend'}. We usually reply to {email} within two working days.
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => setSent(false)}>
              Write another
            </button>
          </div>
        </div>
      ) : (
        <form className="letter" onSubmit={submit} noValidate>
          <div className="letter-stamp" aria-hidden="true">
            <div>
              Reply in<b>2 days</b>working days
            </div>
          </div>
          <div className="letter-top">
            <span className="brand">
              <LogoMark />
              Citezeno
            </span>
            <div className="letter-meta">
              <span>{date}</span>
              <br />
              To: the Citezeno team
              <br />
              Re: {topic}
            </div>
          </div>
          {err && <Notice kind="err">{err}</Notice>}
          <div className="letter-body">
            <p>
              Hello, my name is{' '}
              <span className="letter-slot">
                <input
                  className="letter-in letter-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="your name"
                  aria-label="Your name"
                  autoComplete="name"
                  maxLength={120}
                  required
                  aria-invalid={!!fields.name}
                />
                <sup>1</sup>
              </span>{' '}
              and you can write back to{' '}
              <span className="letter-slot">
                <input
                  className="letter-in letter-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Your email"
                  autoComplete="email"
                  maxLength={200}
                  required
                  aria-invalid={!!fields.email}
                />
                <sup>2</sup>.
              </span>{' '}
              I’m writing about{' '}
              <span className="letter-slot">
                <Select<Topic> className="letter-in letter-pick" menuClassName="letter-pop" value={topic} onChange={setTopic} options={TOPICS.map((t) => ({ value: t, label: t }))} aria-label="Topic" />
                <sup>3</sup>.
              </span>
            </p>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={TIPS[topic][1]} aria-label="Your message" maxLength={5000} required aria-invalid={!!fields.message} />
          </div>
          <label className="hp" aria-hidden="true">
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
          {fieldErrs.length > 0 && <p className="field-err">{fieldErrs.join(' ')}</p>}
          <div className="letter-sign">
            <div className="letter-sig">
              <small>Yours,</small>
              {name.trim() || ' '}
            </div>
            <div className="letter-send">
              <span className="hint">{message.length.toLocaleString()} / 5,000</span>
              <button className="btn" disabled={busy}>
                {busy ? 'Sending…' : 'Send letter'}
                {!busy && <Icon name="arrow" />}
              </button>
            </div>
          </div>
        </form>
      )}
      <aside className="letter-notes" aria-label="Notes">
        <p>
          <b>1</b>
          <span>
            <strong>Your name</strong>Signed in? We fill this in for you.
          </span>
        </p>
        <p>
          <b>2</b>
          <span>
            <strong>Reply address</strong>We only use it to answer this letter.
          </span>
        </p>
        <p>
          <b>3</b>
          <span>
            <strong>Topic</strong>
            {TIPS[topic][0]}
          </span>
        </p>
        <p className="letter-ruled">
          <b>§</b>
          <span>
            <strong>Before you write</strong>Locked out? <Link href="/forgot-password">Reset your password</Link>. Questions about plans? See <Link href="/pricing">pricing</Link> or the{' '}
            <Link href="/docs">docs</Link>.
          </span>
        </p>
      </aside>
    </div>
  );
}
