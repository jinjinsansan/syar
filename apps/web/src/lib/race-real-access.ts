/**
 * ★**実レースの録画を この人に出せるか**（★2026-09-28・1 か所）
 *
 * ★いまは ★ログインしている人だけ（★未ログインを出すかは オーナーの判断待ち・レビュー側が照会）。
 * ★読む層（`race-real.ts` の `loadRealRace`）と ★帯（`race-strip.tsx`）が ★同じこの関数を見ます。
 *   ★帯が知らずに本編を開くと ★本編が「ログインしてください」で止まり、★帯が「録画を出せませんでした」と出していました
 *   （★未ログインの /home・予測できる状態でエラーを出していた）。
 * ⚠️ ★`race-real.ts` を帯から読まない（★レースの計算まで帯の荷に入る）ので ★ここに分けています。
 */
import { authClient } from './supabase';

export const REAL_RACE_SIGN_IN_MESSAGE = 'ログインしてください（★いまは ★自分の馬が出たレースの中継だけを出しています）';

export async function canPlayRealRace(): Promise<boolean> {
  const session = await authClient().auth.getSession();
  return session.data.session !== null;
}
