import type { Metadata } from 'next';
import { TwoFactorForm } from '@/components/auth/TwoFactorForm';
import { safeNext } from '@/lib/safe-next';

export const metadata: Metadata = { title: 'Two-step verification', robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function TwoFactorPage({ searchParams }: Props) {
  const next = safeNext((await searchParams).next);
  return (
    <div className="auth-card">
      <h1>Two-step verification</h1>
      <p className="sub">Enter the 6-digit code from your authenticator app.</p>
      <TwoFactorForm next={next} />
    </div>
  );
}
