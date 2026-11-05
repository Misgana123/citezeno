import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer, Nav } from '@/components/Nav';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'Terms of use',
  description: 'The terms for using Citezeno: accounts, credits and payments, your content, and what Citezeno can and can’t check.',
  path: '/terms',
});

/* Plain-language terms. Review them with your own legal adviser before relying on them. */
export default function TermsPage() {
  return (
    <>
      <Nav />
      <main className="wrap page">
        <header className="page-head">
          <h1 className="h2">Terms of use</h1>
        </header>
        <article className="prose">
          <p className="updated">Last updated 5 November 2026</p>
          <p>By using Citezeno you agree to these terms. If you don’t agree, please don’t use the service.</p>

          <h2>What Citezeno does, and doesn’t do</h2>
          <p>
            Citezeno finds published works in public databases that match the topic of the sentences in your draft, and
            formats them as citations. It matches by topic and does not read every work in full.{' '}
            <b>It cannot confirm that a source supports your sentence.</b> You are responsible for opening each source,
            checking it says what you claim, and following your institution’s rules on citation and the use of AI.
          </p>

          <h2>Your account</h2>
          <ul>
            <li>Give a real email address and keep your password private. You’re responsible for activity on your account.</li>
            <li>You must be old enough to agree to these terms where you live, or have a parent or guardian’s permission.</li>
            <li>You can delete your account at any time from the account page.</li>
          </ul>

          <h2>Credits and payments</h2>
          <ul>
            <li>Searching for sources uses credits: one per claim. The cost is shown before each trace.</li>
            <li>
              Free monthly credits refill on the first of each month (UTC) and don’t roll over. Purchased credits don’t expire
              while your account is open. Credits have no cash value and can’t be transferred.
            </li>
            <li>
              Payments are processed by Polar as merchant of record, under its own terms. When a payment is refunded, the
              credits it bought are removed from your balance.
            </li>
            <li>Deleting your account deletes any unused credits.</li>
            <li>We may change prices for future purchases. Credits you already have keep their value.</li>
          </ul>

          <h2>Your content</h2>
          <p>
            Drafts you trace stay yours. You give us permission to store and process them only to provide the service to
            you, for example to keep your library in sync.
          </p>

          <h2>Fair use</h2>
          <p>
            Don’t use Citezeno to break the law, to overload it or the databases it searches with automated requests, to
            get into other people’s accounts, or to send spam through the contact form. We may suspend accounts that do.
          </p>

          <h2>Third-party data</h2>
          <p>
            Bibliographic records come from OpenAlex, Crossref, Open Library and Wikipedia under their own terms. They can
            contain mistakes. Check important details against the original publication.
          </p>

          <h2>No warranty</h2>
          <p>
            Citezeno is provided “as is”. We work to keep it accurate and available, but we can’t promise it will be
            error-free or always online. To the extent the law allows, we aren’t liable for losses that come from relying on
            its output.
          </p>

          <h2>Changes and contact</h2>
          <p>
            We may update these terms and will change the date above when we do. Questions? <Link href="/contact">Contact us</Link>.
          </p>
        </article>
      </main>
      <Footer />
    </>
  );
}
