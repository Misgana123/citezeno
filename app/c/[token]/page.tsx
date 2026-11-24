import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { SharedChat } from '@/components/chat/SharedChat';
import { Footer, Nav } from '@/components/Nav';
import { pool } from '@/lib/db';
import { countShareView, openSharedChat } from '@/lib/agent/share';
import '../../app/chat/chat.css';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

const load = cache((token: string) => openSharedChat(pool, token));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const chat = await load((await params).token);
  return {
    title: chat ? chat.title : 'Shared chat',
    description: chat ? 'A research conversation with cited, real papers, shared from Citezeno.' : undefined,
    robots: { index: false, follow: false },
  };
}

/* A chat its owner shared: read-only, as it was when shared. */
export default async function SharedChatPage({ params }: Props) {
  const { token } = await params;
  const chat = await load(token);
  if (!chat) notFound();
  countShareView(pool, token).catch(() => {});
  return (
    <>
      <Nav />
      <main>
        <SharedChat chat={chat} />
      </main>
      <Footer />
    </>
  );
}
