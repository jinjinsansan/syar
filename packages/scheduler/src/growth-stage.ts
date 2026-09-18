/**
 * ★**育った実感の 4 層のうち「成長」**（★**D-116**・2026-09-18 オーナー決定・2026-09-19 実装）
 *
 * 【★D-116 が定めた 4 層】
 *   ★**状態** ＝ 調子・疲労（§7.4。「今どうなのか」）
 *   ★**成長** ＝ 「前より○○できるようになった」（「育っている」）  ← ★**ここ**
 *   ★**発見** ＝ 距離・馬場・脚質・気性の判明（D-108。「どんな馬なのか」）
 *   ★**物語** ＝ 初勝利・重賞・記録・血統（§18。「何を成し遂げたか」）
 *
 * 【🔴 ★D-116 ① — 段階は**年齢だけ**から導く】
 *   > 「★成長段階は**年齢〔週齢〕だけ**から導く。★**素質開放率〔`stats ÷ potential`〕から導かない**」
 *
 *   ★**なぜか**: ★開放率から導くと ★**段階が素質の代用品**になり、
 *   ★**D-114 が隠した 24 段階を粗くしたもの**になります。
 *   → ★年齢から導けば ★**「段階＝年齢」「変化＝実際の伸び」と役割が分かれます**。
 *
 * 【★D-116 ⑥ — 純関数は `stats` を受け取らない】
 *   ⚠️ ★`growthStageOf` の引数は ★**週齢だけ**です。★`stats` も `potential` も受け取りません
 *      （★D-108 の `discoveryStageOf` と同じ作法）。★**受け取れないから、漏れません。**
 *
 * 【★D-116 ② — 数値・割合・ランクを出さない】
 *   ⚠️ ★返すのは ★**言葉**だけです。★「成長度 73%」「`stamina` +3」は不可。
 */

import { LIFECYCLE_WEEKS } from './week.js';

/** ★成長段階（★D-116 ① の 5 つ。★言葉そのもの） */
export type GrowthStage = 'young' | 'rising' | 'prime' | 'complete' | 'mature';

/** ★段階 → 画面に出す言葉（★D-116 ①の括弧内がそのまま正） */
export const GROWTH_STAGE_LABEL: Readonly<Record<GrowthStage, string>> = {
  young: 'まだ幼い',
  rising: '力をつけてきた',
  prime: '充実期',
  complete: '完成の域',
  mature: '円熟期',
};

/** ★段階の並び（★下から上へ。★「上がったか」を見るときに使う） */
export const GROWTH_STAGES: readonly GrowthStage[] = ['young', 'rising', 'prime', 'complete', 'mature'];

/**
 * ★**段階の境目**（★週齢）。
 *
 * 【★刻みの決め方（★正典は範囲と名前だけを定め、★境目は書いていません）】
 *   ★D-116 ①: 「★**§7.1 の 104〜260 週にそのまま割り当てる**」
 *   ★§7.1: `0〜78` 育成不可 ／ `78〜104` デビュー前 ／ `104〜260` 現役 ／ `260〜` 強制引退
 *
 *   → ★**`104` は §7.1 そのものの境目**です。
 *     ⚠️ 🔴 ★**数を写さず、`LIFECYCLE_WEEKS` から引きます**（D-052）。
 *        ★最初は `104` と直書きしており、★**写しを 1 つ作っていました**。
 *        ★`@star/sim-engine` は依存ゼロで `@star/scheduler` を引けないので、
 *        ★**この模式を `@star/scheduler` へ移しました**（★段階は一生の話だからでもあります）。
 *     ★**現役の 156 週を 4 等分**しました（★156 ÷ 4 ＝ **39 週ちょうど**）。
 *   ★根拠:
 *     ① ★**104 未満は「まだ幼い」** — ★§7.1 が「育成不可 → デビュー前」と呼ぶ期間で、
 *        ★**走っていない馬**です。★年齢の言葉としてこれ以上のものはありません。
 *     ② ★**156 を 4 で割ると割り切れます**（★5 で割ると 31.2 週で半端）。
 *     ③ ★**境目に §7.1 に無い数を持ち込んでいません**（★104 と 260 だけが外から来た数）。
 *   ⚠️ ★**開発側が置いた刻みです。** ★正典に規則が無いことを、ここに書き残します。
 *
 * ⚠️ ★較正定数として登録簿に載せてあります（★`apps/cli/src/calibration.ts`）。
 *    ★動かすと「いつ言葉が変わるか」だけが変わり、★**能力・着順・成長そのものには入りません**。
 */
const CAREER_WEEKS = LIFECYCLE_WEEKS.retireAt - LIFECYCLE_WEEKS.raceableFrom;
/** ★現役を 4 等分した 1 区切り（★156 ÷ 4 ＝ **39 週ちょうど**） */
const STEP_WEEKS = CAREER_WEEKS / 4;

export const GROWTH_STAGE_FROM_WEEKS: Readonly<Record<GrowthStage, number>> = {
  young: 0,
  rising: LIFECYCLE_WEEKS.raceableFrom,
  prime: LIFECYCLE_WEEKS.raceableFrom + STEP_WEEKS,
  complete: LIFECYCLE_WEEKS.raceableFrom + STEP_WEEKS * 2,
  mature: LIFECYCLE_WEEKS.raceableFrom + STEP_WEEKS * 3,
};

/**
 * ★**週齢 → 成長段階**（★D-116 ①⑥）。
 *
 * ⚠️ ★**引数は週齢だけです。** ★`stats` も `potential` も受け取りません
 *    — ★**受け取れないから、段階が素質の代用品になりません**（D-116 ①）。
 * ⚠️ ★260 週（強制引退）を超えても `mature` のままです（★引退は別の層の話）。
 */
export function growthStageOf(ageWeeks: number): GrowthStage {
  if (!Number.isFinite(ageWeeks)) throw new Error(`週齢が数値ではありません: ${ageWeeks}`);
  let stage: GrowthStage = 'young';
  for (const s of GROWTH_STAGES) {
    if (ageWeeks >= GROWTH_STAGE_FROM_WEEKS[s]) stage = s;
  }
  return stage;
}

/** ★段階が上がったか（★「前より進んだ」を言うため。★下がることはありません） */
export function growthStageAdvanced(before: number, after: number): boolean {
  return GROWTH_STAGES.indexOf(growthStageOf(after)) > GROWTH_STAGES.indexOf(growthStageOf(before));
}

