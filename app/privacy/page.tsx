import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer, Nav } from '@/components/Nav';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'Privacy policy',
  description: 'What Citezeno stores about you, why, and how to delete it. No advertising or tracking cookies, and we never sell your data.',
  path: '/privacy',
});

/* Plain-language policy describing what this codebase actually stores. Review it
   with your own legal adviser before relying on it. */
export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main className="wrap page">
        <header className="page-head">
          <h1 className="h2">Privacy policy</h1>
        </header>
        <article className="prose">
          <p className="updated">Last updated 5 November 2026</p>
          <p>This page explains what Citezeno stores about you, why, and what you can do about it.</p>

          <h2>How searching works</h2>
          <p>
            Your draft, settings and a copy of your recent traces are saved in your own browser (local storage). To find
            sources, your browser sends short search phrases taken from your draft directly to OpenAlex, Crossref, Open
            Library and, if you switch it on, Wikipedia. Their own privacy policies apply to those requests.
          </p>

          <h2>Your account</h2>
          <ul>
            <li>
              <b>Account details:</b> your name, email address, a securely hashed password (if you use one), and, if you sign
              in with Google or GitHub, your profile picture and the account identifier they give us.
            </li>
            <li>
              <b>Saved traces:</b> the drafts you trace while signed in, their results and the sources cited, so your library
              is available on every device.
            </li>
            <li>
              <b>Sessions:</b> for each device you sign in on, its IP address, browser type and sign-in time. This lets you see
              and sign out devices on your account page, and helps us stop abuse.
            </li>
          </ul>

          <h2>If you buy credits</h2>
          <p>
            Payments are handled by Polar, our merchant of record. Polar collects your payment details and billing address;
            we never see your card number. We keep a record of your credit balance, each purchase (product, amount and
            order number) and how many credits each trace used.
          </p>

          <h2>If you contact us</h2>
          <p>
            We keep your name, email address, message and the IP address it was sent from, and forward the message to our
            team by email so we can reply.
          </p>

          <h2>Cookies</h2>
          <p>
            We use only the cookies needed to keep you signed in. There are no advertising or tracking cookies and no
            third-party analytics.
          </p>

          <h2>Who processes your data</h2>
          <p>
            The site is hosted on Vercel, account data is stored in a Postgres database, email is sent through Resend, and
            payments are processed by Polar.
            They process data only to provide those services to us. We never sell your data.
          </p>

          <h2>Your choices</h2>
          <ul>
            <li>Edit your name and sign out other devices on your <Link href="/account">account page</Link>.</li>
            <li>Delete any saved trace from the studio library.</li>
            <li>
              Delete your account on the account page (we may ask you to confirm by email). This removes your account,
              sessions and saved traces.
            </li>
            <li>
              Ask us for a copy of your data, or anything else about your privacy, through the{' '}
              <Link href="/contact?topic=Account%20help">contact page</Link>.
            </li>
          </ul>

          <h2>Changes</h2>
          <p>If we change this policy in a way that matters, we’ll update the date above and tell account holders by email.</p>
        </article>
      </main>
      <Footer />
    </>
  );
}
