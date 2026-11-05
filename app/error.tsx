'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="sys">
      <div>
        <div className="code">Oops</div>
        <h1>Something went wrong</h1>
        <p>
          The page hit an error. Your draft is saved in this browser, so nothing is lost.
          {error.digest ? ` (Reference: ${error.digest})` : ''}
        </p>
        <div className="row">
          <button className="btn btn-thread" onClick={reset}>
            Try again
          </button>
          <Link className="btn btn-ghost" href="/contact?topic=Bug%20report">
            Report the problem
          </Link>
        </div>
      </div>
    </main>
  );
}
