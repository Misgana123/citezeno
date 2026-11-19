import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { Chat } from '@/components/chat/Chat';
import { requireSession } from '@/lib/session';
import '../papers/papers.css';
import './chat.css';

export const metadata: Metadata = { title: 'Assistant', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/* The research assistant: where people land after signing in. */
export default async function ChatPage({ searchParams }: Props) {
  await requireSession('/chat');
  const c = (await searchParams).c;
  return (
    <AppShell current="chat" title="Assistant">
      <Chat initialId={typeof c === 'string' && c.length <= 80 ? c : null} />
    </AppShell>
  );
}
