import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/auth/SignInForm';
import { enabledProviders } from '@/lib/auth';
import { safeNext } from '@/lib/safe-next';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SignInPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getSession()) redirect(next);
  return (
    <div className="auth-card">
      <h1>Welcome back</h1>
      <p className="sub">Sign in to keep your library of traces on every device.</p>
      <SignInForm providers={enabledProviders} next={next} error={typeof sp.error === 'string' ? sp.error : undefined} />
    </div>
  );
}
