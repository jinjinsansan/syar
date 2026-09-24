/**
 * ★**導入の段階を読む**（★移行 `0067` の `my_onboarding_state`・裁定 `REVIEW_ONBOARDING_STATE_VERDICT_20260922.md`）。
 *
 * 【★画面は段階を導き直さない】（★裁定 §2 条件 1）
 *   ★段階はサーバーが ★在る行（★口座・★配合と命名の要求・★命名前の仔）から導きます。
 *   ★画面はこの結果だけで行き先を決め、★要求や命名前の仔の表を直に読みません
 *   （★`apps/cli/test/onboarding-screen-reads.test.ts` が構文で見ます。★註記にも表の名前を書かない）。
 *
 * 【★時間の計算は画面が TS で出す】（★裁定 §2 条件 2）
 *   ★「次の年まであと何日」は ★`@star/scheduler` の関数で出します（★SQL に写さない）。
 *   ★候補の有無の判定に要る ★年齢の下限と生涯の産駒数の上限は ★`@star/sim-engine` の値を渡します。
 */
import { DEFAULT_BALANCE } from '@star/sim-engine';
import { WEEKS_PER_YEAR } from '@star/scheduler';

import { authClient } from './supabase';
import { SignInRequiredError } from './stable-repo';

/** ★段階（★移行 `0067` の `stage` と同じ語） */
export type OnboardingStage =
  | 'no_account' | 'legacy' | 'choose_parents' | 'waiting_birth' | 'naming' | 'ready';

export interface OnboardingState {
  readonly stage: OnboardingStage;
  readonly breedRequestId: string | null;
  readonly breedStatus: string | null;
  /** ★失敗の理由の語（★`internal_error` は「もう一度お試しください」・★他は「この組合せは選べない」系・裁定 322d603 §9） */
  readonly breedFailureReason: string | null;
  readonly draftId: string | null;
  readonly foalSex: string | null;
  readonly sireName: string | null;
  readonly damName: string | null;
  readonly nameStatus: string | null;
  readonly nameFailureReason: string | null;
  /** ★いま選べる母の候補が在るか（★`choose_parents` のときだけ。★他は null） */
  readonly hasDamCandidate: boolean | null;
}

const STAGES: readonly OnboardingStage[] = [
  'no_account', 'legacy', 'choose_parents', 'waiting_birth', 'naming', 'ready',
];

/**
 * ★段階を読む。★知らない語が返ったら ★投げる（★黙って既定の段階に落とさない）。
 *
 * 🔴 ★**先に session を見ます**（★2026-09-24）。★この関数は `authenticated` にしか許していないので、
 *    ★ログインしていないと ★**`permission denied for function my_onboarding_state`** が
 *    ★そのまま画面に出ます（★実ブラウザで確認しました）。
 *    ★利用者に DB の文言を見せず、★`SignInRequiredError` にします（★他の読み口と同じ扱い）。
 */
export async function fetchOnboardingState(): Promise<OnboardingState> {
  const { data: sessionData } = await authClient().auth.getSession();
  if (sessionData.session === null) throw new SignInRequiredError();
  const { data, error } = await authClient().rpc('my_onboarding_state', {
    p_min_breeding_age_weeks: DEFAULT_BALANCE.MIN_BREEDING_AGE_YEARS * WEEKS_PER_YEAR,
    p_max_lifetime_foals: DEFAULT_BALANCE.MARE_LIFETIME_FOALS,
  });
  if (error !== null) throw new Error(`導入の段階を読めませんでした: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (row === undefined) throw new Error('導入の段階が返っていません');
  const stage = row['stage'];
  if (typeof stage !== 'string' || !(STAGES as readonly string[]).includes(stage)) {
    throw new Error(`知らない導入の段階です: ${String(stage)}`);
  }
  const s = (k: string): string | null => (typeof row[k] === 'string' ? (row[k] as string) : null);
  return {
    stage: stage as OnboardingStage,
    breedRequestId: s('breed_request_id'),
    breedStatus: s('breed_status'),
    breedFailureReason: s('breed_failure_reason'),
    draftId: s('draft_id'),
    foalSex: s('foal_sex'),
    sireName: s('sire_name'),
    damName: s('dam_name'),
    nameStatus: s('name_status'),
    nameFailureReason: s('name_failure_reason'),
    hasDamCandidate: typeof row['has_dam_candidate'] === 'boolean' ? (row['has_dam_candidate'] as boolean) : null,
  };
}
