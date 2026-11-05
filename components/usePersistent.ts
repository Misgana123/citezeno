'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* useState that mirrors to localStorage. Starts from `initial` so server and
   client render the same markup, then loads the stored value after mount. */
export function usePersistent<T>(key: string, initial: T, merge?: (stored: T) => T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const mergeRef = useRef(merge);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('cz:' + key);
      if (raw != null) {
        const parsed = JSON.parse(raw) as T;
        setValue(mergeRef.current ? mergeRef.current(parsed) : parsed);
      }
    } catch {
      /* storage unavailable or corrupt: keep the initial value */
    }
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem('cz:' + key, JSON.stringify(value));
    } catch {
      /* storage full or blocked */
    }
  }, [key, value, loaded]);

  const set = useCallback((v: T | ((prev: T) => T)) => setValue(v), []);
  return [value, set, loaded] as const;
}
