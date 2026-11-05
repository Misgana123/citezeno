import type { Metadata } from 'next';
import { ForgotForm } from '@/components/auth/ForgotForm';

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ForgotPage({ searchParams }: Props) {
  const email = (await searchParams).email;
  return (
    <div className="auth-card">
      <h1>Forgot your password?</h1>
      <p className="sub">Enter your account email and we’ll send you a link to choose a new one.</p>
      <ForgotForm initialEmail={typeof email === 'string' ? email : ''} />
    </div>
  );
}
