import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { enabledProviders } from '@/lib/auth';
import { FREE_MONTHLY_CREDITS } from '@/lib/pricing';
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
      <p className="sub">{`Free to start, with ${FREE_MONTHLY_CREDITS} credits every month. One credit traces one claim.`}</p>
      <SignUpForm providers={enabledProviders} next={next} />
    </div>
  );
}
