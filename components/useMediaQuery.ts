'use client';

import { useEffect, useState } from 'react';

/* Whether a CSS media query matches, kept up to date. False on the server and
   on the first render, so markup that depends on it appears after mount. */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return match;
}
