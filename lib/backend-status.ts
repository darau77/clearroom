'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Recover a temporarily unavailable connection without restarting a conversation. */
export function useBackendStatus(paused: boolean) {
 const [live, setLive] = useState(false);
 const [checking, setChecking] = useState(true);
 const pausedRef = useRef(paused);
 const checkRef = useRef<(() => Promise<void>) | null>(null);
 useEffect(() => { pausedRef.current = paused; }, [paused]);
 const checkBackend = useCallback(() => checkRef.current?.(), []);

 useEffect(() => {
  let active = true;
  let ready = false;
  let request: AbortController | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
   if (active && !ready) retry = setTimeout(() => { retry = undefined; void check(); }, 15000);
  };
  async function check() {
   if (!active || request) return;
   if (pausedRef.current) { if (!retry) schedule(); return; }
   if (retry) { clearTimeout(retry); retry = undefined; }
   const current = new AbortController();
   request = current;
   const timeout = setTimeout(() => current.abort(), 10000);
   setChecking(true);
   try {
    const response = await fetch('/api/status', { cache: 'no-store', signal: current.signal });
    const status = await response.json() as { ready?: boolean };
    ready = response.ok && status.ready === true;
    if (active) setLive(ready);
   } catch {
    ready = false;
    if (active) setLive(false);
   } finally {
    clearTimeout(timeout);
    request = null;
    if (active) { setChecking(false); schedule(); }
   }
  }
  const reconnect = () => { void check(); };
  checkRef.current = check;
  window.addEventListener('focus', reconnect);
  window.addEventListener('online', reconnect);
  void check();
  return () => {
   active = false;
   if (retry) clearTimeout(retry);
   request?.abort();
   checkRef.current = null;
   window.removeEventListener('focus', reconnect);
   window.removeEventListener('online', reconnect);
  };
 }, []);

 return { live, checking, checkBackend };
}
