import { useEffect, useState } from "react";

export const PURGE_TTL_SECONDS = 30 * 60;

export function usePurgeCountdown(
  completedAt?: number,
  ttlSeconds: number = PURGE_TTL_SECONDS,
): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!completedAt) return;
    const tick = () => setNow(Date.now());
    const timeout = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(id);
    };
  }, [completedAt]);

  if (!completedAt) return null;
 
  const elapsed = Math.max(0, Math.floor((now - completedAt) / 1000));
  return Math.max(0, ttlSeconds - elapsed);
}
