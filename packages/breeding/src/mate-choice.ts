/**
 * ★**配合相手の選び方**（正典 D-025 / D-026）。★純粋・時計を持ちません。
 *
 * 🔴 ★**2026-09-20 に `apps/cli/src/preseed.ts` から移しました**（★**G-2**・コピーではありません）。
 *   ★註記はそのまま持ってきています（★根拠はどれも実測で得たものです）。
 */
import type { HorseRecord, Stable } from '@star/sim-engine';
import { ABILITY_KEYS, DISTANCE_BIAS_CENTER } from '@star/sim-engine';
/**
 * 厩舎方針が選抜に効く強さ（正典 §10.5「厩舎方針は調教AIの選択に反映される」）。
 * 重視する能力を、選抜スコア上でこの倍率にする。
 * 1.0 にすると 40厩舎が同じ馬を選び、父系が一系統に潰れる（N-4 の分散基準に落ちる）。
 */
export const STABLE_EMPHASIS_WEIGHT = 1.35;

/**
 * 厩舎方針への適合が配合相手の評価に効く強さ（正典 D-025）。
 * 0 にすると D-025 以前の無差別選択に戻る。
 */
export const POLICY_FIT_WEIGHT = 0.25;

/** 狙う距離帯からこれだけ離れると適合度が 0 になる（m） */
export const DISTANCE_FIT_SPAN = 1200;

/**
 * ★1厩舎が1年に使う種牡馬の数（父方の有効個体数を決める）。
 *
 * 【なぜ要るか — 実測で見つけた律速】
 *   「厩舎の評価軸で最良の1頭を選ぶ」だと、20頭の繁殖牝馬が全員同じ種牡馬に行く。
 *   年間種付上限が 20（§6.7）なのでちょうど1頭で足り、**毎年きっかり40頭**しか
 *   種付けしない（プール200頭のうち160頭は一度も使われない）。
 *   父系ラインの浮動を決めるのは**プールの頭数ではなく実際に使われた頭数**なので、
 *   創始系統を 40 → 200 に増やしても 100世代での有効系統数は 1.27〜2.29 のままだった。
 *   ⚠️ 正典 §6.7 の上限20は**上限**であって「集中させろ」ではない。
 *      1頭に絞っていたのは正典ではなくこちらの実装の都合。
 *
 * 【★ただし分散させると悪化した（実測・seed42・L=5）】
 *   K=1 → y50 有効系統 8.83 / y100 1.27
 *   K=5 → y50 有効系統 2.28 / y100 1.00（種付種牡馬は 40 → 61 に増えたのに悪化）
 *   厩舎ごとの最良（argmax）は厩舎の評価軸の違いが最も出る点なので、
 *   そこから順位を下げると**厩舎間で候補が重なり**、かえって系統が集約する。
 *   ＝ 集中を駆動しているのは浮動ではなく**方向性選択**。R-15 に従い K=1（無効）で入れる。
 */
export const SIRE_CHOICE_TOP_K = 1;

/**
 * ★F-1: NPC 配合 AI の近交回避の強さ（正典 D-026）。
 *
 * 【なぜ mateScore に入れて canMate に入れないか】
 *   `canMate` は**エンジンの規則**で、ここに近交禁止を入れると遺伝エンジンの仕様が変わり
 *   P0 ゲートに波及する。`mateScore` は **AI の選好**であって、
 *   現実の生産者も近交を「禁止」ではなく「割り引いて」評価する。
 *   この層分けにより**遺伝エンジンには一切触れない**。
 *
 * 【R-17】
 *   維持したい属性があるなら、**決定経路がその属性を参照していなければならない**。
 *   D-025（形質による方針選択）は形質しか見ておらず、父系ラインは形質と独立に伝わるので、
 *   評価軸をいくら分散させても系統は保存されなかった。
 *   0 にするとこの項が消え、F-1 以前に戻る（対照が取れる）。
 *
 * 【★2026-08-07: 有効化しました（D-027 撤回）】
 *   12シード共通・対応のある比較で掃引した結果、**トレードオフは存在しませんでした**:
 *
 *     penalty  有効系統数        平均F
 *       0      4.96 ±0.72(SE)   0.0700
 *       0.1    4.75 ±0.41(SE)   0.0461
 *       0.3    4.58 ±0.26(SE)   0.0312   ← 採用
 *       1.0    4.72 ±0.51(SE)   0.0190
 *       3.0    4.82 ±0.65(SE)   0.0094
 *
 *   平均F は単調に −87%、有効系統数は**全水準が互いの SE 内**。3.0 でも系統は壊れません。
 *
 * 【なぜ 3.0 ではなく 0.3 を採るか】
 *   V-12a を通すだけなら 3.0（F=0.0094）が最も余裕がありますが、
 *   **F が小さすぎると §6.5 の近交弱勢と血の濃縮が事実上働かなくなります**。
 *   実在の生産でも平均F は 0.03〜0.10 程度で、0.0094 は「近交がまったく起きない世界」です。
 *   0.3 は V-12a（≤0.10）に対して 3.2倍の余裕を持ちつつ、§6.5 の機構を生かせます。
 *   ⚠️ これは**私の選択**です。正典に F の目標水準の規定が無いので、
 *      「ゲートを通す最大値」ではなく「機構が働く水準」を採りました。異論があれば従います。
 *
 * 【★旧・出荷値を 0（無効）にしていた理由 — 撤回済み】
 *   50世代・3シードで 0 と 3.0 を比べた結果:
 *
 *     penalty=0    平均F 0.0519/0.0884/0.0508（V-12a PASS）  y50 有効系統 6.02/5.25/5.03
 *     penalty=3.0  平均F 0.0095（最大F 0.477→0.046・虚弱 1.7%→0.0%）  y50 有効系統 2.09
 *
 *   近交には**劇的に効く**が、**合格基準3 が悪化する**（有効系統 6.02 → 2.09）。
 *   機構: 牝馬は自厩舎の血を避けるので全厩舎が「自分と血の遠い、最も強い系統」へ集まる。
 *   近交回避そのものが**系統を1本へ収束させる方向に働く**。
 *   さらに 1配合ごとに全種牡馬との F を計算するため 50世代の実行が 4秒 → 3分超（25倍）。
 *
 *   ★この根拠は誤りでした。penalty=0 が3シード・3.0 が1シードの点推定の比較で、
 *   CV 43.7% の量を1点で比べ、**世界史のばらつきをペナルティの効果と取り違えて**いました。
 *   計算コスト（18〜25倍）はレビュー側が許容: プリシードはオフライン1回、
 *   以後の NPC 繁殖も年1回のバッチで、人が待つ経路にありません。
 */
export const INBREED_PENALTY_WEIGHT = 0.3;

/** 自厩舎（自牧場）の種牡馬を配合相手に選ぶときの上乗せ。1.0 = 上乗せなし */
export const HOME_SIRE_BONUS = 1.0;

/**
 * 厩舎方針への適合度（正典 D-025）。−1〜+1。
 *
 * 【なぜ要るか】
 *   D-025 以前は「母の厩舎の評価軸で最も高い種牡馬を、全厩舎から選ぶ」だった。
 *   評価軸が能力合計だけなので 40厩舎がほぼ同じ馬を選び、良い系統が全厩舎に広がって
 *   父系ラインが 50世代で 40 → 9〜15 まで減った（REPORT_P15 §3）。
 *   **厩舎ごとに評価軸が違うことが、系統の多様性を保つ機構**（D-025）。
 */
export function policyFit(h: HorseRecord, stable: Stable): number {
  const terms: number[] = [];

  // 距離: 狙う距離帯からのずれ。DISTANCE_FIT_SPAN 離れると適合度 0
  const target = DISTANCE_BIAS_CENTER[stable.distance];
  terms.push(clampUnit(1 - (2 * Math.abs(h.distanceCenter - target)) / DISTANCE_FIT_SPAN));

  // 馬場: 芝/ダート特化の厩舎だけが見る（'both' は中立）
  if (stable.surface !== 'both') {
    terms.push(clampUnit((h.surfaceAptitude[stable.surface] - 50) / 30));
  }

  // 道悪: 道悪巧者志向の厩舎だけが見る。中央値 55（§6.4 の heavy_aptitude 導出）
  if (stable.heavy) {
    terms.push(clampUnit((h.heavyAptitude - 55) / 25));
  }

  return terms.reduce((a, b) => a + b, 0) / terms.length;
}

function clampUnit(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(-1, x));
}

/**
 * 配合相手の評価（D-025）。能力 × 厩舎方針への適合。
 * ★ POLICY_FIT_WEIGHT を 0 にすると D-025 以前の無差別選択に戻り、系統が集約する。
 */
export function mateScore(h: HorseRecord, stable: Stable, home = false): number {
  const base = stableScore(h, stable) * (1 + POLICY_FIT_WEIGHT * policyFit(h, stable));
  return home ? base * HOME_SIRE_BONUS : base;
}

/**
 * ★F-1: 近交を割り引いた配合相手の評価（正典 D-026）。
 *
 * @param inbreedCoeff この組み合わせで生まれる仔の近交係数 F（§6.5）
 *
 * F=0 なら `mateScore` そのまま。F が大きいほど線形に割り引く。
 * 係数3.0 は「F=0.25（全兄弟相当）で評価が 1/4 になる」水準。
 */
export function mateScoreWithInbreeding(
  h: HorseRecord,
  stable: Stable,
  inbreedCoeff: number,
  home = false,
): number {
  const f = Number.isFinite(inbreedCoeff) ? Math.max(0, inbreedCoeff) : 0;
  return mateScore(h, stable, home) / (1 + INBREED_PENALTY_WEIGHT * f);
}

export function stableScore(h: HorseRecord, stable: Stable): number {
  let total = 0;
  for (const k of ABILITY_KEYS) {
    total += h.potential[k] * (stable.emphasis === k ? STABLE_EMPHASIS_WEIGHT : 1);
  }
  return total;
}
