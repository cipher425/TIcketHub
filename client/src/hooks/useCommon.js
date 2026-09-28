import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { http } from '../lib/api';

export function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Countdown to a server timestamp. `serverTime` corrects for the user's clock being wrong:
 * we measure the offset once and apply it, so the timer matches the server's hold expiry.
 */
export function useCountdown(targetIso, serverTimeIso) {
  const offsetRef = useRef(0);
  useEffect(() => {
    if (serverTimeIso) offsetRef.current = new Date(serverTimeIso).getTime() - Date.now();
  }, [serverTimeIso]);
  const calc = () => (targetIso ? Math.max(0, new Date(targetIso).getTime() - (Date.now() + offsetRef.current)) : 0);
  const [msLeft, setMsLeft] = useState(calc);
  useEffect(() => {
    setMsLeft(calc());
    const t = setInterval(() => setMsLeft(calc()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIso, serverTimeIso]);
  const total = Math.ceil(msLeft / 1000);
  return { msLeft, minutes: Math.floor(total / 60), seconds: total % 60, expired: targetIso ? msLeft <= 0 : false };
}

/** Public runtime config from the server (feature flags, payment provider). */
export function useAppConfig() {
  return useQuery({ queryKey: ['config'], queryFn: () => http.get('/config').then((r) => r.data), staleTime: Infinity });
}

export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode */
    }
  }, [key, value]);
  return [value, setValue];
}
