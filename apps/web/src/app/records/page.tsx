import RecordsView from './records-view';

export const revalidate = 0;

/**
 * ★記録（★UI-4・2026-09-19）
 *
 * ★ここは ★**タブの選択を URL から受け取って渡すだけ**の入れ物です。
 *   ★本体は `records-view.tsx`（`'use client'`）で、★`authClient()` の
 *   ★**ブラウザのセッション**がないと本人の台帳を読めないためです（RLS: `user_id = auth.uid()`）。
 * ⚠️ ★`revalidate` のような区間の設定は ★**サーバー側のファイルにしか書けません**。
 *    ★だから 1 枚に混ぜず、★入れ物と本体を分けています。
 */
export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <RecordsView tab={tab ?? 'runs'} />;
}
