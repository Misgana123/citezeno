import { Nav } from '@/components/Nav';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="auth-page">{children}</main>
    </>
  );
}
