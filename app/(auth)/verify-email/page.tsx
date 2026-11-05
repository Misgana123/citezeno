import type { Metadata } from 'next';
import Link from 'next/link';
import { ResendVerification } from '@/components/auth/ResendVerification';
import { Icon } from '@/components/Icon';
import { safeNext } from '@/lib/safe-next';

export const metadata: Metadata = { title: 'Check your email', robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/* Shown after sign-up, and as the landing page when a confirmation link fails. */
export default async function VerifyPage({ searchParams }: Props) {
  const sp = await searchParams;
  const email = typeof sp.email === 'string' ? sp.email : '';
  const next = safeNext(sp.next);
  const failed = typeof sp.error === 'string';
  return (
    <div className="auth-card">
      <div className="big-icon">
        <Icon name={failed ? 'alert' : 'mail'} />
      </div>
      <h1>{failed ? 'That link didn’t work' : 'Check your email'}</h1>
      <p className="sub">
        {failed ? (
          'The confirmation link has expired or was already used. Sign in and we’ll send you a fresh one.'
        ) : (
          <>
            We sent a confirmation link to <b>{email || 'your email address'}</b>. Open it to finish creating your account.
            It works for one hour.
          </>
        )}
      </p>
      {!failed && <ResendVerification email={email} next={next} />}
      <p className="auth-alt">
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </div>
  );
}
