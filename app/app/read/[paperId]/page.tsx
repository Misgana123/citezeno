import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { Reader } from '@/components/reader/Reader';
import { requireSession } from '@/lib/session';
import 'pdfjs-dist/web/pdf_viewer.css';
import '../../papers/papers.css';
import '../reader.css';

export const metadata: Metadata = { title: 'Reader', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ paperId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/* Read a paper: /app/read/openalex:W123 (any paper the user can open). The
   sidebar folds to its icons to give the page room. */
export default async function ReadPage({ params, searchParams }: Props) {
  const { paperId: raw } = await params;
  const sp = await searchParams;
  const pdfId = typeof sp.pdf === 'string' && sp.pdf.length <= 80 ? sp.pdf : null;
  const chatId = typeof sp.chat === 'string' && sp.chat.length <= 80 ? sp.chat : null;
  let paperId = raw;
  try {
    paperId = decodeURIComponent(raw);
  } catch {
    // not encoded
  }
  await requireSession(`/app/read/${encodeURIComponent(paperId)}`);
  return (
    <AppShell current={null} title="Reader" variant="panel" rail>
      <Reader paperId={paperId} pdfId={pdfId} chatId={chatId} />
    </AppShell>
  );
}
