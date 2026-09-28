'use client';

/**
 * ★**古い版の知らせ**（★出すのは 帯の上の 1 か所だけ・★部品は既存の `NoticeBar`・★新しい意匠を作らない）
 * ★決まりは `stale-build.ts`。
 */
import { useEffect, useState } from 'react';
import { NoticeBar } from './uma-parts';
import { STALE_BUILD_TEXT, isStaleBuild, readServedSha } from './stale-build';

/** ★束に焼かれた版（★ビルドのときに 文字列へ置き換わる） */
const CLIENT_SHA: string | undefined = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;

export function StaleBuildNotice(): React.ReactElement | null {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const check = (): void => {
      if (document.visibilityState !== 'visible') return;
      readServedSha(fetch).then((served) => { if (!cancelled) setStale(isStaleBuild(CLIENT_SHA, served)); }, () => undefined);
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', check); };
  }, []);
  if (!stale) return null;
  /** ★`<a href>` で ★同じ場所を 読み直す（★新しい束が来る） */
  const here = typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`;
  return <NoticeBar kind="soon" text={STALE_BUILD_TEXT} actionLabel="再読み込み" actionHref={here} />;
}
