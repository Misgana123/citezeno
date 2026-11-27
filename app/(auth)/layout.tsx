import Link from 'next/link';
import { AuthDemo } from '@/components/auth/AuthDemo';
import { LogoMark } from '@/components/Icon';
import './auth.css';

/* Sign in, sign up and the account pages around them: the form on the left,
   and on wide screens a short demo of the assistant on the right. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="au">
      <div className="au-left">
        <Link className="au-logo" href="/" aria-label="Citezeno home">
          <LogoMark className="au-mark" /> Citezeno
        </Link>
        <main className="au-main">{children}</main>
        <footer className="au-foot">
          <span>© {new Date().getFullYear()} Citezeno</span>
          <span>
            <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
          </span>
        </footer>
      </div>
      <AuthDemo />
    </div>
  );
}
