import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { enabledProviders } from '@/lib/auth';
import { safeNext } from '@/lib/safe-next';
import { getSession } from '@/lib/session';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'Create a free account',
  description: 'Sign up free and get monthly credits to find real, verifiable sources for your writing in 12 citation styles.',
  path: '/sign-up',
});

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SignUpPage({ searchParams }: Props) {
  const next = safeNext((await searchParams).next);
  if (await getSession()) redirect(next);
  return (
    <div className="auth-card">
      <h1>Create your account</h1>
      <p className="sub">Answers come only from real papers. Choose a plan when you’re ready to trace.</p>
      <SignUpForm providers={enabledProviders} next={next} />
    </div>
  );
}
