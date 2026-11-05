import Link from 'next/link';
import { Nav } from '@/components/Nav';

export default function NotFound() {
  return (
    <>
      <Nav />
      <main className="sys">
        <div>
          <div className="code">404</div>
          <h1>This page has no source</h1>
          <p>The address may be mistyped, or the page has moved.</p>
          <div className="row">
            <Link className="btn btn-thread" href="/studio">
              Open the studio
            </Link>
            <Link className="btn btn-ghost" href="/">
              Go home
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
