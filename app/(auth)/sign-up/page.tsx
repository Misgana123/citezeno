import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { enabledProviders } from '@/lib/auth';
import { safeNext } from '@/lib/safe-next';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Create an account' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SignUpPage({ searchParams }: Props) {
  const next = safeNext((await searchParams).next);
  if (await getSession()) redirect(next);
  return (
    <div className="auth-card">
      <h1>Create your account</h1>
      <p className="sub">Free. Your traces sync across devices, and the studio works exactly as before.</p>
      <SignUpForm providers={enabledProviders} next={next} />
    </div>
  );
}
