"use client";

import { useState, useEffect } from "react";

const TICK_MS = 200;
const EASE_PER_TICK = 0.02;

export function useSmoothedProgress(target: number, ceiling: number): number {
  const [creep, setCreep] = useState(target);

  useEffect(() => {
    if (ceiling <= target) return;
    const timer = setInterval(() => {
      setCreep((prev) => {
        const from = Math.max(prev, target);
        return from + (ceiling - from) * EASE_PER_TICK;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [target, ceiling]);

  return Math.floor(Math.max(target, Math.min(creep, ceiling)));
}
