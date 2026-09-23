/**
 * ★**配合の画面が使う形**（★デザイナー第 2 便 §5 **B-1〜B-5** と 失敗 5 通り・2026-09-23）
 *
 * 【🔴 ★「選べるか」をここで決めません】
 *   ★条件（6 歳未満・今年もう産んだ・生涯 8 産・種付枠）は ★**`canMate` が持っています**。
 *   ★この層は ★`damBlockOf` / `sireBlockOf` を呼ぶだけです（★条件を書き写さない）。
 *   ⚠️ ★書き写した日に、★確定するワーカーと ★**判定が 2 つ**になります（★役割の画面と同じ壊れ方）。
 *
 * 【🔴 ★種付料の式もここに書きません】
 *   ★`npcStudFee`（`@star/scheduler`）が出します。★素は `npc_stallion_facts` が返す事実です。
 *   ★依頼したときの見積もりが ★**そのまま「払ってよい上限」**になります（★上乗せしない・第 2 便 §2 B）。
 *
 * 【★画面は時計を持ちません】（★正典 §14）
 *   ★週はサーバー（`world_state_public`）。★「依頼してから何秒」は ★`created_at` から画面が出します。
 */
import {
  DEFAULT_BALANCE, damBlockOf, sireBlockOf, stallionCoveringLimit,
  type MateCandidate, type MateRejection,
} from '@star/sim-engine';
import { gameYearOf, npcStudFee } from '@star/scheduler';
import { authClient } from './supabase';
import { SignInRequiredError } from './stable-repo';
import { loadRetiredScreen, type RetiredScreenData } from './retired-screen';

/** ★失敗の見せ方（★第 2 便 §5 の 5 通り。★語そのものは画面に出さない・§4） */
export type BreedFailureVariant = 'feeup' | 'noep' | 'invalid' | 'full' | 'temp';

/**
 * ★**「父母を選び直す」に寄せる理由**（★第 2 便 §5 `invalid`）。
 *   ★語そのものは画面に出しません（★§4）。★出すのは見せ方だけです。
 *   ⚠️ ★ここに ★**並べていない語は `temp` に倒します**（★利用者のせいにしない）。
 *      ★`apps/cli/test/breed-screen-wiring.test.ts` が、★ワーカーの理由の型と突き合わせて
 *      ★**分類漏れがあれば落とします**（★新しい理由が黙って `temp` にならない）。
 */
const INVALID_REASONS: readonly string[] = [
  // ★`canMate` が断ったもの
  'same_horse', 'sire_not_male', 'dam_not_female', 'sire_too_young', 'dam_too_young',
  'dam_lifetime_foals_exceeded', 'dam_already_bred_this_year', 'sire_coverings_exceeded',
  // ★確定のときに候補でなくなっていたもの
  'parent_missing', 'sire_not_candidate', 'dam_not_candidate', 'no_candidate',
];

/**
 * ★**サーバーの理由 → 見せ方**（★写すだけ）。
 * ⚠️ ★知らない語は ★**`temp`（利用者は悪くない）**に倒します。★「選び直して」と言わないためです。
 */
export function breedFailureOf(reason: string | null): BreedFailureVariant {
  if (reason === 'fee_above_max') return 'feeup';
  if (reason === 'ep_short') return 'noep';
  if (reason === 'owner_limit') return 'full';
  if (reason !== null && INVALID_REASONS.includes(reason)) return 'invalid';
  return 'temp';
}

/** ★母（★自分の繁殖牝馬）。★素質・能力は持ちません */
export interface BreedMareView {
  readonly id: string;
  readonly name: string;
  readonly ageYears: number | null;
  readonly foalCount: number;
  readonly lifetimeFoals: number;
  readonly bredThisYear: boolean;
  readonly sireName: string | null;
  readonly damName: string | null;
  /** ★選べない理由（★`null` なら選べる）。★`canMate` が出したもの */
  readonly block: MateRejection | null;
}

/** ★父（★NPC の種牡馬）。★出すのは第 2 便 §2 B が許した 6 つだけ */
export interface BreedSireView {
  readonly id: string;
  readonly name: string;
  readonly ageYears: number | null;
  readonly g1Wins: number;
  readonly totalPrizePP: number;
  /** ★今年の残り枠（★`stallionCoveringLimit` − 今年の種付数） */
  readonly coveringsLeft: number;
  /** ★種付料の見積もり [EP]（★`npcStudFee`。★依頼の上限になる） */
  readonly feeEP: number;
  readonly block: MateRejection | null;
}

export interface BreedScreenData {
  readonly gameWeek: number;
  readonly gameYear: number;
  readonly epBalance: number;
  readonly mares: readonly BreedMareView[];
  readonly sires: readonly BreedSireView[];
}

/** ★`MateCandidate` を事実から組む（★`birthYear` の尺度はワーカーと同じ `gameYearOf(birth_week)`） */
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

/** ★`npc_stallion_facts()` が返す 1 行（★列名は移行 `0071` と同じ） */
export interface NpcStallionRow {
  readonly horse_id: string;
  readonly name: string;
  readonly birth_week: number | string | null;
  readonly g1_wins: number | string;
  readonly coverings_this_year: number | string;
  readonly total_prize_pp: number | string;
}

/** ★1 頭の父を見せる形に（★見積もりと残り枠は ★`packages/` の関数が出す） */
export function toBreedSireView(row: NpcStallionRow, gameWeek: number): BreedSireView {
  const birthWeek = row.birth_week === null ? null : Number(row.birth_week);
  const g1Wins = Number(row.g1_wins);
  const coveringsThisYear = Number(row.coverings_this_year);
  const totalPrizePP = Number(row.total_prize_pp);
  const candidate = candidateOf({
    id: row.horse_id, sex: 'male', birthWeek, foalCount: 0,
    bredThisYear: false, coveringsThisYear, g1Wins,
  });
  return {
    id: row.horse_id,
    name: row.name,
    ageYears: birthWeek === null ? null : gameYearOf(gameWeek) - gameYearOf(birthWeek),
    g1Wins,
    totalPrizePP,
    coveringsLeft: Math.max(0, stallionCoveringLimit(candidate, DEFAULT_BALANCE) - coveringsThisYear),
    feeEP: npcStudFee(g1Wins, totalPrizePP),
    block: sireBlockOf(candidate, DEFAULT_BALANCE, gameYearOf(gameWeek)),
  };
}

/** ★引退馬の読む口（`my_retired_horses`）の行から、母の一覧を組む */
export function toBreedMares(data: RetiredScreenData): readonly BreedMareView[] {
  const year = gameYearOf(data.gameWeek);
  return data.horses
    .filter((h) => h.role === 'broodmare')
    .map((h) => ({
      id: h.id,
      name: h.name,
      ageYears: h.ageYears,
      foalCount: h.foalCount,
      lifetimeFoals: data.lifetimeFoals,
      bredThisYear: h.bredThisYear,
      sireName: h.sireName,
      damName: h.damName,
      block: damBlockOf(candidateOf({
        id: h.id, sex: h.sex === 'male' ? 'male' : 'female', birthWeek: h.birthWeek,
        foalCount: h.foalCount, bredThisYear: h.bredThisYear,
        coveringsThisYear: h.coveringsThisYear, g1Wins: h.g1Wins,
      }), DEFAULT_BALANCE, year),
    }));
}

/**
 * ★**画面 1 枚ぶんを読む**。
 * ⚠️ ★**失敗を空配列にしません**（★「父がいない」に見えてしまう）。★投げます。
 */
export async function loadBreedScreen(): Promise<BreedScreenData> {
  const auth = authClient();
  const { data: sessionData } = await auth.auth.getSession();
  if (sessionData.session === null) throw new SignInRequiredError();

  const [retired, siresRes, userRes] = await Promise.all([
    loadRetiredScreen(),
    auth.rpc('npc_stallion_facts'),
    auth.from('users').select('entry_points').limit(1),
  ]);
  if (siresRes.error !== null) throw new Error(`npc_stallion_facts を読めませんでした: ${siresRes.error.message}`);
  if (userRes.error !== null) throw new Error(`users を読めませんでした: ${userRes.error.message}`);

  const sires = ((siresRes.data ?? []) as readonly NpcStallionRow[])
    .map((r) => toBreedSireView(r, retired.gameWeek));
  return {
    gameWeek: retired.gameWeek,
    gameYear: gameYearOf(retired.gameWeek),
    epBalance: Number(userRes.data?.[0]?.entry_points ?? 0),
    mares: toBreedMares(retired),
    sires,
  };
}

/** ★依頼の状態（★`my_foal_request`・移行 `0073` で `created_at` が付いた） */
export interface BreedRequestState {
  readonly status: 'pending' | 'done' | 'failed';
  readonly failure: BreedFailureVariant | null;
  readonly resultId: string | null;
  /** ★依頼した時刻（★経過は画面が出す。★サーバーは秒を数えない） */
  readonly createdAtMs: number;
}

/**
 * ★**配合を依頼する**（★依頼 → サーバーが確定・待ちあり）。
 *
 * ⚠️ ★`maxFeeEP` は ★**画面に出した見積もりそのもの**を渡します（★上乗せしない・第 2 便 §2 B）。
 * ⚠️ ★受付でその場で弾かれるもの（★自分の母でない・NPC の父でない・その母は今年すでに依頼した）は
 *    ★**例外**で返ります。★語は出さず、見せ方に写します。
 */
export async function requestBreeding(input: {
  readonly requestId: string;
  readonly damId: string;
  readonly sireId: string;
  readonly maxFeeEP: number;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly failure: BreedFailureVariant }> {
  const { error } = await authClient().rpc('request_breeding', {
    p_request_id: input.requestId,
    p_dam_id: input.damId,
    p_sire_id: input.sireId,
    p_max_fee_ep: input.maxFeeEP,
  });
  if (error === null) return { ok: true };
  // ★ST024 / ST025 / ST042 は「この組合せは選べない」。★それ以外は利用者のせいにしない
  const code = String((error as { code?: string }).code ?? '');
  return { ok: false, failure: ['ST022', 'ST024', 'ST025', 'ST042'].includes(code) ? 'invalid' : 'temp' };
}

/** ★依頼 1 件の状態を読む（★待ちの画面が繰り返し呼ぶ） */
export async function loadBreedRequest(requestId: string): Promise<BreedRequestState | null> {
  const { data, error } = await authClient().rpc('my_foal_request', { p_request_id: requestId });
  if (error !== null) throw new Error(`依頼の状態を読めませんでした: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as {
    readonly status?: string; readonly failure_reason?: string | null;
    readonly result_id?: string | null; readonly created_at?: string;
  } | undefined;
  if (row === undefined) return null;
  const status = row.status === 'done' || row.status === 'failed' ? row.status : 'pending';
  return {
    status,
    failure: status === 'failed' ? breedFailureOf(row.failure_reason ?? null) : null,
    resultId: row.result_id ?? null,
    createdAtMs: row.created_at === undefined ? 0 : new Date(row.created_at).getTime(),
  };
}
