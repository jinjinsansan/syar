/**
 * ★**初回の配合（無償の生産 1 頭）の画面が使う形**（★2026-09-24・案 A・D-120）
 *
 * 【★なぜ別の層が要るのか】
 *   ★`/stable/breed`（`lib/breed-screen.ts`）は ★**自分の繁殖牝馬 × NPC の種牡馬**です。
 *   ★初回は ★**母も NPC**（★持ち主の居ない功労馬）で、★**種付料がありません**（★無償）。
 *   → ★父の読み口（`npc_stallion_facts`）と ★`canMate` の使い方は ★**同じもの**を使い、
 *     ★母の読み口（`initial_breeding_dams`・移行 `0077`）と ★依頼の口だけが違います。
 *
 * 【🔴 ★「選べるか」をここで決めません】
 *   ★条件は ★`canMate`（`@star/sim-engine`）が持っています。★この層は `damBlockOf` / `sireBlockOf` を呼ぶだけです。
 *   ⚠️ ★書き写した日に、★確定するワーカーと ★**判定が 2 つ**になります。
 *
 * 【★段階は画面が導きません】（★裁定 `REVIEW_ONBOARDING_STATE_VERDICT_20260922.md` §2 条件 1）
 *   ★`my_onboarding_state`（`lib/onboarding.ts`）が返す段階に従います。
 *   ★要求の表も命名前の仔の表も、★画面からは読みません。
 *
 * ⚠️ ★**種付料はありません。** ★EP を引く経路がないので、★`maxFeeEP` に当たるものを渡しません
 *    （★渡す口が無いことを `apps/cli/test/initial-breed-screen-wiring.test.ts` が見ます）。
 */
import {
  DEFAULT_BALANCE, damBlockOf, sireBlockOf, stallionCoveringLimit,
  type MateCandidate, type MateRejection,
} from '@star/sim-engine';
import { gameYearOf, WEEKS_PER_YEAR } from '@star/scheduler';
import { authClient } from './supabase';
import { SignInRequiredError } from './stable-repo';
import { breedFailureOf, type BreedFailureVariant } from './breed-screen';

/** ★画面に出す候補の数（★本番の母は 1,897 頭。★全部は出せません） */
export const DAM_CHOICES = 12;

/** ★母（★NPC の功労馬）。★素質・能力は持ちません（★D-114） */
export interface InitialDamView {
  readonly id: string;
  readonly name: string;
  readonly ageYears: number | null;
  readonly foalCount: number;
  readonly lifetimeFoals: number;
  readonly totalPrizePP: number;
  /** ★選べない理由（★`null` なら選べる）。★`canMate` が出したもの */
  readonly block: MateRejection | null;
}

/** ★父（★NPC の種牡馬）。★初回は ★**種付料を出しません**（★無償） */
export interface InitialSireView {
  readonly id: string;
  readonly name: string;
  readonly ageYears: number | null;
  readonly g1Wins: number;
  readonly totalPrizePP: number;
  readonly coveringsLeft: number;
  readonly block: MateRejection | null;
}

export interface InitialBreedScreenData {
  readonly gameWeek: number;
  readonly gameYear: number;
  /**
   * ★候補の母の総数（★`p_limit` で切る前）。★画面は「N 頭から 12 頭を出しています」と言えます。
   */
  readonly damTotal: number;
  /**
   * ★いまの週が読めたか。★`false` なら ★**年齢で絞っていません**（★移行 `0077`・0068 と同じ考え方）。
   * ⚠️ ★画面は `false` を「候補切れ」と出さないこと。★確定の判定はワーカーです。
   */
  readonly ageKnown: boolean;
  readonly dams: readonly InitialDamView[];
  readonly sires: readonly InitialSireView[];
}

interface DamRow {
  readonly horse_id: string; readonly name: string; readonly birth_week: number | string;
  readonly foal_count: number; readonly total_prize_pp: number | string;
  readonly total_count: number | string; readonly age_known: boolean;
}
interface SireRow {
  readonly horse_id: string; readonly name: string; readonly birth_week: number | string;
  readonly g1_wins: number; readonly coverings_this_year: number; readonly total_prize_pp: number | string;
}

const ageYearsOf = (birthWeek: number, gameWeek: number): number | null =>
  (Number.isFinite(birthWeek) ? gameYearOf(gameWeek) - gameYearOf(birthWeek) : null);

/**
 * ★`MateCandidate` を事実から組む（★`birthYear` の尺度はワーカーと同じ `gameYearOf(birth_week)`）。
 * ⚠️ ★`lib/breed-screen.ts` の同名の関数と ★**同じ規則**です
 *    （★`apps/cli/test/initial-breed-screen-wiring.test.ts` が両方を見ます）。
 */
function candidateOf(input: {
  readonly id: string; readonly sex: 'male' | 'female'; readonly birthWeek: number | null;
  readonly foalCount: number; readonly bredThisYear: boolean;
  readonly coveringsThisYear: number; readonly g1Wins: number;
}): MateCandidate {
  return {
    id: input.id as MateCandidate['id'],
    sex: input.sex,
    // ★誕生の週が無ければ「若すぎる」に倒す（★推測で通さない）
    birthYear: input.birthWeek === null ? Number.MAX_SAFE_INTEGER : gameYearOf(input.birthWeek),
    foalCount: input.foalCount,
    bredThisYear: input.bredThisYear,
    coveringsThisYear: input.coveringsThisYear,
    g1Wins: input.g1Wins,
  };
}

/**
 * ★**画面 1 枚ぶんを読む**。
 * ⚠️ ★**失敗を空配列にしません**（★「候補がいない」に見えてしまう）。★投げます。
 */
export async function loadInitialBreedScreen(): Promise<InitialBreedScreenData> {
  const auth = authClient();
  const { data: sessionData } = await auth.auth.getSession();
  if (sessionData.session === null) throw new SignInRequiredError();

  const [weekRes, damsRes, siresRes] = await Promise.all([
    auth.from('world_state_public').select('game_week').limit(1),
    auth.rpc('initial_breeding_dams', {
      p_min_breeding_age_weeks: DEFAULT_BALANCE.MIN_BREEDING_AGE_YEARS * WEEKS_PER_YEAR,
      p_max_lifetime_foals: DEFAULT_BALANCE.MARE_LIFETIME_FOALS,
      p_limit: DAM_CHOICES,
    }),
    auth.rpc('npc_stallion_facts'),
  ]);
  if (weekRes.error !== null) throw new Error(`world_state_public を読めませんでした: ${weekRes.error.message}`);
  if (damsRes.error !== null) throw new Error(`母の候補を読めませんでした: ${damsRes.error.message}`);
  if (siresRes.error !== null) throw new Error(`父の候補を読めませんでした: ${siresRes.error.message}`);

  const gameWeek = Number(weekRes.data?.[0]?.game_week ?? 0);
  const year = gameYearOf(gameWeek);
  const damRows = (damsRes.data ?? []) as readonly DamRow[];
  const sireRows = (siresRes.data ?? []) as readonly SireRow[];

  const dams = damRows.map((r): InitialDamView => ({
    id: r.horse_id,
    name: r.name,
    ageYears: ageYearsOf(Number(r.birth_week), gameWeek),
    foalCount: r.foal_count,
    lifetimeFoals: DEFAULT_BALANCE.MARE_LIFETIME_FOALS,
    totalPrizePP: Number(r.total_prize_pp),
    block: damBlockOf(candidateOf({
      id: r.horse_id, sex: 'female', birthWeek: Number(r.birth_week),
      foalCount: r.foal_count, bredThisYear: false, coveringsThisYear: 0, g1Wins: 0,
    }), DEFAULT_BALANCE, year),
  }));

  const sires = sireRows.map((r): InitialSireView => ({
    id: r.horse_id,
    name: r.name,
    ageYears: ageYearsOf(Number(r.birth_week), gameWeek),
    g1Wins: r.g1_wins,
    totalPrizePP: Number(r.total_prize_pp),
    coveringsLeft: stallionCoveringLimit({ g1Wins: r.g1_wins }, DEFAULT_BALANCE) - r.coverings_this_year,
    block: sireBlockOf(candidateOf({
      id: r.horse_id, sex: 'male', birthWeek: Number(r.birth_week),
      foalCount: 0, bredThisYear: false, coveringsThisYear: r.coverings_this_year, g1Wins: r.g1_wins,
    }), DEFAULT_BALANCE, year),
  })).filter((s) => s.block === null);

  return {
    gameWeek,
    gameYear: year,
    damTotal: Number(damRows[0]?.total_count ?? 0),
    ageKnown: damRows[0]?.age_known ?? false,
    dams,
    sires,
  };
}

/**
 * ★**初回の配合を依頼する**（★積むだけ。★確定はワーカー）。
 *
 * ⚠️ ★**種付料の引数はありません**（★無償・案 A）。
 * ⚠️ ★受付でその場で弾かれるもの（★候補でない父母・★もう依頼した）は ★**例外**で返ります。
 *    ★語は出さず、見せ方に写します（★`breedFailureOf` を共用）。
 */
export async function requestInitialBreeding(input: {
  readonly requestId: string;
  readonly sireId: string;
  readonly damId: string;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly failure: BreedFailureVariant }> {
  const { error } = await authClient().rpc('request_initial_breeding', {
    p_request_id: input.requestId,
    p_sire_id: input.sireId,
    p_dam_id: input.damId,
  });
  if (error === null) return { ok: true };
  const code = String((error as { code?: string }).code ?? '');
  return { ok: false, failure: ['ST022', 'ST024', 'ST025', 'ST042'].includes(code) ? 'invalid' : 'temp' };
}

export { breedFailureOf, type BreedFailureVariant };
