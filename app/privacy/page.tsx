import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/Icon';
import { LegalToc } from '@/components/legal/LegalTools';
import { Footer, Nav } from '@/components/Nav';
import { pageMeta } from '@/lib/seo';
import '../legal.css';

export const metadata: Metadata = pageMeta({
  title: 'Privacy policy',
  description: 'What Citezeno stores about you, why, and how to delete it. No advertising or tracking cookies, and we never sell your data.',
  path: '/privacy',
});

const UPDATED = '17 November 2026';

const GLANCE: [IconName, string, string, string][] = [
  ['device', 'ok', 'Searches run in your browser', 'Short phrases from your draft go straight to the databases, not through us.'],
  ['database', 'br', 'Your account keeps your library', 'Signed in, your drafts and results are saved so you can find them later.'],
  ['x', 'no', 'No ads, no selling', 'No advertising or tracking cookies, no third-party analytics. We never sell data.'],
  ['trash', 'am', 'Delete any time', 'Remove a trace, or your whole account, from the account page.'],
];

const SECTIONS: [string, string][] = [
  ['searching', 'How searching works'],
  ['account', 'Your account'],
  ['credits', 'If you buy credits'],
  ['contact', 'If you contact us'],
  ['cookies', 'Cookies'],
  ['processors', 'Who processes your data'],
  ['choices', 'Your choices'],
];

function Sec({ n, id, title, children }: { n: number; id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="lg-sec" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>
        <span>{String(n).padStart(2, '0')}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/* Plain-language policy describing what this codebase actually stores. Review it
   with your own legal adviser before relying on it. */
export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main className="lg">
        <header className="lg-hero wrap">
          <span className="kicker">Privacy policy</span>
          <h1>
            Your data, <em>in plain words.</em>
          </h1>
          <p>What Citezeno stores about you, why, and what you can do about it. No advertising, no tracking cookies, and we never sell your data.</p>
          <div className="lg-meta">
            <span className="lg-stamp">
              <i aria-hidden="true" /> Last updated {UPDATED}
            </span>
          </div>
        </header>

        <ul className="lg-glance wrap" aria-label="At a glance">
          {GLANCE.map(([icon, tone, title, body]) => (
            <li key={title} className={`t-${tone}`}>
              <span className="lg-glance-ico">
                <Icon name={icon} />
              </span>
              <b>{title}</b>
              <span>{body}</span>
            </li>
          ))}
        </ul>

        <div className="lg-body wrap">
          <LegalToc items={SECTIONS} />
          <article className="lg-doc">
            <p className="lg-intro">This page explains what Citezeno stores about you, why, and what you can do about it.</p>

            <Sec n={1} id="searching" title="How searching works">
              <p>
                Searches run in your browser: to find sources, it sends short search phrases taken from your draft directly
                to OpenAlex, Crossref, Open Library and, if you switch it on, Wikipedia. Their own privacy policies apply to
                those requests. Your draft, settings and a copy of your recent traces are also kept in your own browser (local
                storage). If you’re signed in, your drafts and results are saved to your account so you can find them later
                (see “Saved traces” below).
              </p>
            </Sec>

            <Sec n={2} id="account" title="Your account">
              <ul>
                <li>
                  <b>Account details.</b> Your name, email address, a securely hashed password (if you use one), and, if you
                  sign in with Google or GitHub, your profile picture and the account identifier they give us.
                </li>
                <li>
                  <b>Saved traces.</b> The drafts you trace while signed in, their results and the sources cited, so your
                  library is available on every device.
                </li>
                <li>
                  <b>Shared links.</b> If you share a trace, its link settings: design, style, expiry date and, if you set
                  one, a securely hashed password (never the password itself).
                </li>
                <li>
                  <b>Sessions.</b> For each device you sign in on, its IP address, browser type and sign-in time. This lets
                  you see and sign out devices on your account page, and helps us stop abuse.
                </li>
              </ul>
            </Sec>

            <Sec n={3} id="credits" title="If you buy credits">
              <p>
                Payments are handled by Polar, our merchant of record. Polar collects your payment details and billing
                address; we never see your card number. We keep a record of your credit balance, each purchase (product,
                amount and order number) and how many credits each trace used.
              </p>
              <p className="lg-aside">
                <Icon name="lock" /> We never see or store your card number.
              </p>
            </Sec>

            <Sec n={4} id="contact" title="If you contact us">
              <p>
                We keep your name, email address, message and the IP address it was sent from, and forward the message to our
                team by email so we can reply.
              </p>
            </Sec>

            <Sec n={5} id="cookies" title="Cookies">
              <p>We use only the cookies needed to keep you signed in. There are no advertising or tracking cookies and no third-party analytics.</p>
            </Sec>

            <Sec n={6} id="processors" title="Who processes your data">
              <p>
                The site is hosted on Vercel, account data is stored in a Postgres database, email is sent through Resend, and
                payments are processed by Polar. They process data only to provide those services to us. We never sell your
                data.
              </p>
            </Sec>

            <Sec n={7} id="choices" title="Your choices">
              <div className="lg-actions">
                <Link href="/account">
                  <b>
                    Account page <Icon name="arrow" />
                  </b>
                  <small>Edit your name and sign out other devices.</small>
                </Link>
                <Link href="/library">
                  <b>
                    Delete a saved trace <Icon name="arrow" />
                  </b>
                  <small>From your library, at any time.</small>
                </Link>
                <Link href="/contact?topic=Account%20help">
                  <b>
                    Ask for your data <Icon name="arrow" />
                  </b>
                  <small>A copy of your data, or anything else about your privacy.</small>
                </Link>
              </div>
              <p>
                Delete your account on the <Link href="/account">account page</Link> (we may ask you to confirm by email).
                This removes your account, sessions and saved traces.
              </p>
            </Sec>

            <section className="lg-sec lg-changes" aria-label="Changes">
              <p>If we change this policy in a way that matters, we’ll update the date above and tell account holders by email.</p>
            </section>
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}
