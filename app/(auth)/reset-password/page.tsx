import type { Metadata } from 'next';
import { ResetForm } from '@/components/auth/ResetForm';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/* Better Auth sends people here as /reset-password?token=… (or ?error=INVALID_TOKEN). */
export default async function ResetPage({ searchParams }: Props) {
  const sp = await searchParams;
  return (
    <div className="auth-card">
      <h1>Choose a new password</h1>
      <p className="sub">You’ll be signed out on your other devices once it’s changed.</p>
      <ResetForm token={typeof sp.token === 'string' ? sp.token : undefined} linkError={typeof sp.error === 'string' ? sp.error : undefined} />
    </div>
  );
}
