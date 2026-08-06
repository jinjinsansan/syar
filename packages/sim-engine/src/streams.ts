/**
 * 乱数ストリームの用途 ID — **全用途をここ1か所に集める**
 *
 * 【なぜ集約するのか（レビュー側 2026-08-07 の指摘）】
 *   用途 ID の表がリポジトリ内に4つあり、番号が重なっていました:
 *
 *     race.ts          SKILL:1 / FINAL:2
 *     verify-payout.ts POOL:1 / FIELD:2 / ODDS:3 / FINAL:4
 *     preseed.ts       FOUNDER:1 / MATING:2 / ...
 *     verify-race.ts   FIELD:11 / ...            ← ここだけ重ならない帯
 *
 *   `verify-race.ts` が 11〜14 を取っているということは、
 *   **この規約は一度確立されていたのに、P2 で新設した `verify-payout.ts` が
 *   1〜4 に戻した**ということです。今日は衝突しません（適用先のシードが違うため）が、
 *   **それを保証しているものが何もありませんでした。**
 *
 *   ★疑った現象（同一 index の別ドメインの相関）は**起きていませんでした**が、
 *     起こりうる構造は実在していました。相関の検定で否定されたのは
 *     「今この瞬間に壊れているか」であって、「壊れうるか」ではありません。
 *
 * 【使い方】
 *   新しい用途を足すときは**このファイルに追記する**。
 *   同じ番号を2度使うと `STREAM_IDS_UNIQUE` の型と ★テストが落ちます。
 */

/** 遺伝・配合（sim-engine / simulator） */
export const GENETICS_STREAM = {
  NICKS: 1,
  FOUNDER: 2,
  RECRUIT: 3,
  MATING: 4,
  V1: 5,
  PERF: 6,
  /** K-4: 実レース選抜のシーズン（他の用途と系列を混ぜない） */
  RACE: 7,
} as const;

/** レース解決（race-engine・馬ごとのサブストリーム） */
export const RACE_STREAM = {
  /** スキル発動判定（馬ごと） */
  SKILL: 21,
  /** 着順を決める最終乱数（馬ごと） */
  FINAL: 22,
} as const;

/** 検証ハーネス（verify-race） */
export const VERIFY_RACE_STREAM = {
  FIELD: 11,
  /** 人気推定（= オッズ算出相当・§9.2 で本番と別系列と定められている） */
  POPULARITY: 12,
  DECIDE: 13,
  INTERVENTION: 14,
} as const;

/** 検証ハーネス（verify-payout / A-3） */
export const VERIFY_PAYOUT_STREAM = {
  POOL: 31,
  FIELD: 32,
  /** ★§9.2: オッズ算出は本番確定と別系列 */
  ODDS: 33,
  /** ★§8.6 の final_seed 相当 */
  FINAL: 34,
} as const;

/** NPC プリシード（P1.5） */
export const PRESEED_STREAM = {
  FOUNDER: 41,
  MATING: 42,
  NAMING: 43,
  NICKS: 45,
} as const;

/** 切り分け用の診断ツール（本番経路では使わない） */
export const DIAGNOSTIC_STREAM = {
  STREAM_A: 51,
  STREAM_B: 52,
} as const;

/**
 * 全 ID の一覧。★重複はここで検出する。
 *
 * ⚠️ ID を足したらこの配列にも入れること。入れ忘れると重複検査を素通りするので、
 *    ★テストが「各表の値がすべてこの配列に含まれること」も併せて検査します
 *    （R-19: 網羅範囲が対象の増加に自動で追従しないなら、緑のまま縮む）。
 */
export const ALL_STREAM_TABLES = {
  GENETICS_STREAM,
  RACE_STREAM,
  VERIFY_RACE_STREAM,
  VERIFY_PAYOUT_STREAM,
  PRESEED_STREAM,
  DIAGNOSTIC_STREAM,
} as const;

/** 重複している ID があれば返す（無ければ空） */
export function duplicateStreamIds(): number[] {
  const seen = new Map<number, string[]>();
  for (const [table, ids] of Object.entries(ALL_STREAM_TABLES)) {
    for (const [name, id] of Object.entries(ids)) {
      const list = seen.get(id as number);
      if (list === undefined) seen.set(id as number, [`${table}.${name}`]);
      else list.push(`${table}.${name}`);
    }
  }
  return [...seen.entries()].filter(([, xs]) => xs.length > 1).map(([id]) => id);
}
