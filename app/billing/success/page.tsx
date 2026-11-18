import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { PurchaseWatcher } from '@/components/billing/PurchaseWatcher';
import { getBalance } from '@/lib/credits';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Thanks for your purchase', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* Polar sends buyers here after paying. Credits arrive by webhook a few seconds later. */
export default async function SuccessPage() {
  const s = await requireSession('/billing/success');
  const b = await getBalance(s.user.id);
  return (
    <AppShell current={null} title="Purchase">
      <div className="at-center">
        <div className="auth-card">
          <PurchaseWatcher startPaid={b.paid} />
        </div>
      </div>
    </AppShell>
  );
}
