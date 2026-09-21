'use client';

import { useEffect, useState } from 'react';
import { supabaseStableRepo } from '../../lib/stable-repo';
import type { StableView } from '../../lib/stable';

export function useStableView(): {
  readonly view: StableView | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
} {
  const [view, setView] = useState<StableView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void supabaseStableRepo.stable().then((fresh) => {
      if (!active) return;
      setView(fresh);
      setError(null);
    }).catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  return { view, loading, error, refresh: () => { setRevision((current) => current + 1); } };
}
