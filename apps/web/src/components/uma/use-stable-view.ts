'use client';

import { useEffect, useState } from 'react';
import { SetupRequiredError, SignInRequiredError, supabaseStableRepo } from '../../lib/stable-repo';
import type { StableView } from '../../lib/stable';

export function useStableView(): {
  readonly view: StableView | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly needsSetup: boolean;
  readonly needsLogin: boolean;
  readonly refresh: () => void;
} {
  const [view, setView] = useState<StableView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void supabaseStableRepo.stable().then((fresh) => {
      if (!active) return;
      setView(fresh);
      setError(null);
      setNeedsSetup(false);
      setNeedsLogin(false);
    }).catch((cause: unknown) => {
      if (!active) return;
      setView(null);
      setError(cause instanceof Error ? cause.message : String(cause));
      setNeedsSetup(cause instanceof SetupRequiredError);
      setNeedsLogin(cause instanceof SignInRequiredError);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  return { view, loading, error, needsSetup, needsLogin, refresh: () => { setRevision((current) => current + 1); } };
}
