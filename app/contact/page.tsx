import type { Metadata } from 'next';
import { ContactForm } from '@/components/ContactForm';
import { Footer, Nav } from '@/components/Nav';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'Contact us',
  description: 'Questions, bug reports, a wrong citation or an idea for Citezeno? Send us a message and a person will reply by email, usually within two working days.',
  path: '/contact',
});

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ContactPage({ searchParams }: Props) {
  const topic = (await searchParams).topic;
  return (
    <>
      <Nav />
      <main className="wrap page letter-page">
        <header className="letter-head">
          <span className="letter-k">Contact</span>
          <h1>
            Dear Citezeno, <em>a note…</em>
          </h1>
          <p>Write to us the way you’d write to a colleague. A person reads every letter and replies by email, usually within two working days.</p>
        </header>
        <ContactForm initialTopic={typeof topic === 'string' ? topic : undefined} />
      </main>
      <Footer />
    </>
  );
}
