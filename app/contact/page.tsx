import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactForm } from '@/components/ContactForm';
import { Icon } from '@/components/Icon';
import { Footer, Nav } from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Questions, bug reports or ideas for Citezeno. Send us a message and we’ll reply by email.',
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ContactPage({ searchParams }: Props) {
  const topic = (await searchParams).topic;
  return (
    <>
      <Nav />
      <main className="wrap page">
        <header className="page-head">
          <h1 className="h2">Get in touch</h1>
          <p className="lede">Found a source that doesn’t match, a style that’s formatted wrong, or have an idea? Tell us. A person reads every message.</p>
        </header>
        <div className="contact">
          <ContactForm initialTopic={typeof topic === 'string' ? topic : undefined} />
          <aside className="contact-aside">
            <div className="contact-card">
              <h3>
                <Icon name="clock" /> Reply time
              </h3>
              <p>We usually answer within two working days.</p>
            </div>
            <div className="contact-card">
              <h3>
                <Icon name="alert" /> Reporting a wrong citation
              </h3>
              <p>Paste the sentence, the style you chose and the reference Citezeno gave. A DOI or link helps us find it fast.</p>
            </div>
            <div className="contact-card">
              <h3>
                <Icon name="user" /> Account trouble
              </h3>
              <p>
                Locked out? Try <Link href="/forgot-password">resetting your password</Link> first. If that doesn’t work, choose
                “Account help” and use the email on your account.
              </p>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
