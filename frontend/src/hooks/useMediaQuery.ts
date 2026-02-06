import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

const MOBILE_LAYOUT_QUERY =
  '(max-width: 1024px), ((orientation: portrait) and (max-width: 1366px))';

export const useIsMobile = () => useMediaQuery(MOBILE_LAYOUT_QUERY);
