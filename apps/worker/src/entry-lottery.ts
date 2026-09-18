/**
 * ★**上限を超えた登録を、完全抽選で 18 頭に絞る**（★正典 §10.4・★**D-117 LT-1〜LT-5**・2026-09-19）
 *
 * 【★正典にありました】`STAR_SPEC_v2.0.md:1321`
 *   > 1レース **8〜18頭**。★**プレイヤー馬を優先し**、残りを NPC 馬で充填
 *   > …上限超過は ★**完全抽選**（★**賞金上位優先にしない** — ★新規が弾かれると離脱する）
 *
 * 🔴 ★**私はこれを照会に出しました**（`QUESTIONS_DS2_20260919.md`）。★規則はあり、
 *   ★D-117 の形にも入っていて、★**実装だけが抜けて**いました。★長い箇条書きの末尾にあって見落としました。
 *   → ★照会は取り下げます。★**「賞金上位優先」は正典が名指しで禁じています。**
 *
 * 【★なぜ「完全」抽選なのか】
 *   ★賞金順にすると ★**強い人だけが走れる**。★新規は一度も走れないまま辞めます。
 *   ★先着順にすると ★**締切の瞬間に張り付く**動機になります（★サイクルは 6 分）。
 *   → ★正典はどちらも採りません。
 *
 * 【★この層の責務】
 *   ★**誰が当たったかを決めるだけ**です。★弾かれた人への返金（**LT-3**）と通知（**LT-4**）は
 *   ★呼ぶ側が `scratch.ts` の経路で行います（★D-111 ③⑤ と同じ関数・D-052）。
 *
 * ⚠️ ★**決定的です**（**LT-2**）。★`Math.random()` も時計も読みません（憲法 4）。
 *    ★同じ `cycleIndex` なら**何度回しても同じ結果**です（★再起動しても当選者が変わらない）。
 */

import { deriveRng } from '@star/sim-engine';

/**
 * ★**抽選の乱数系列**（★憲法 4・D-112 ① と同じ縛りで、★用途 ID を固定します）。
 *
 * ⚠️ ★**出走表の系列（`STREAM.FIELD = 61`）と別**にしてあります。
 *    ★同じ系列から引くと、★**抽選が起きた回だけ出走表の並びがずれます**
 *    （★= 登録者の数が出走馬の顔ぶれを変える）。★それは D-117 が避けたかったことです。
 * ⚠️ ★`FREEZE_STREAM = 71`（`entry-freeze.ts`）の次を取っています。
 */
export const ENTRY_LOTTERY_STREAM = 72;

export interface LotteryResult {
  /** ★当選（★出走する）。★入力の順を保ちます */
  readonly selected: readonly string[];
  /** ★落選（★返金して理由を伝える対象・LT-3/LT-4）。★入力の順を保ちます */
  readonly excluded: readonly string[];
}

/**
 * ★`horseIds` が `limit` を超えていたら、★**完全抽選**で `limit` 頭に絞ります。
 *
 * ★超えていなければ ★**何もしません**（★`excluded` は空・★抽選もしません）。
 *   ★正典は「プレイヤー馬を優先し」なので、★**18 人以内なら全員が走ります**（**LT-1**）。
 *
 * @param horseIds ★登録した馬（★`race_entries` にある順＝登録順）
 * @param limit ★上限（★正典 §10.4 の 18）
 * @param cycleIndex ★そのレースの番号。★**ここだけが乱数の入力**です（LT-2）
 */
export function drawEntryLottery(
  horseIds: readonly string[],
  limit: number,
  cycleIndex: number,
): LotteryResult {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`drawEntryLottery: limit が不正（${limit}）`);
  }
  if (horseIds.length <= limit) return { selected: horseIds, excluded: [] };

  /**
   * ★**並べ替えてから先頭 `limit` 頭**（★`Rng.shuffled` は Fisher-Yates）。
   * ⚠️ ★**登録順に依存しません** — ★それが「完全」抽選の意味です。
   *    ★`horseIds` を先に並べ替えると、★登録順（`gate`）が結果に効かなくなります。
   */
  const rng = deriveRng(cycleIndex, ENTRY_LOTTERY_STREAM, 0);
  const shuffled = rng.shuffled([...horseIds]);
  const won = new Set(shuffled.slice(0, limit));
  /** ★**入力の順で返します**（★呼ぶ側が `race_entries` の行と突き合わせやすいように） */
  return {
    selected: horseIds.filter((h) => won.has(h)),
    excluded: horseIds.filter((h) => !won.has(h)),
  };
}

/** ★落選した人に見せる理由（**LT-4**）。★「黙って消えた」にしない */
export function lotteryScratchReason(registered: number, limit: number): string {
  return (
    `登録が ${registered} 頭で上限 ${limit} 頭を超えたため、抽選で出走できませんでした`
    + '（正典 §10.4・完全抽選）。登録料と騎手の料金は返金しました'
  );
}
