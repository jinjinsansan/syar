/**
 * ★**能力の発見度（Discovery）**（★ゲーム本体 第 2 便・2026-09-16・正典 **D-108**・§5.5・§12.4）
 *
 * 【★何をして、何をしないか】
 *   ★画面では ★**「？？？ → 得意かも → B 以上？ → A」**と、実戦・調教を重ねるほど判明していきます。
 *   ⚠️ ★**`stats`・`potential`・`genotype` は 1 ビットも変えません。** ★これは ★**表示の層だけ**です（D-108）。
 *   ⚠️ ★**着順にも人気にも効きません。** ★人気は ★**モンテカルロの勝率順位**（`popularity`）でサーバーが決めるので、
 *      ★発見度をどう見せても ★**V-4（1 番人気の勝率）は動きません**（★裁定 §1-1 の実測の根拠）。
 *
 * 【★D-108 の条件】
 *   ① ★**決定論**（★経験の回数から導く。★`Date.now()` も乱数も読まない・憲法 4）
 *   ② ★**★表示（§12.4 の 1〜5・半星）と同じ量から導く**（★発見度と★を別々に計算しない・`stars.ts` と同じ層に置く）
 *   ③ ★**検査は「入力の形」で書く**（★`potential` を渡す口が無いことを見る。★禁止語の一覧で書かない）
 *   ④ ★レース中の画面に出すなら D-098 に照らす（★本層は「レースの後」に更新する前提・§18 LR-7）
 *
 * 【★この層の約束】★依存ゼロ・純粋関数。
 */

/** ★発見の段階（★画面の文言はこの 4 つだけ） */
export type DiscoveryStage = 'unknown' | 'hint' | 'narrow' | 'known';

export const DISCOVERY_STAGES: readonly DiscoveryStage[] = ['unknown', 'hint', 'narrow', 'known'];

/**
 * ★**段階が上がるのに要る経験の回数**（★較正値ではなく「見せ方の刻み」）。
 * ⚠️ ★**能力にも着順にも入りません。** ★動かすと「いつ分かるか」だけが変わります。
 */
export const DISCOVERY_STEPS: readonly number[] = [1, 3, 6];

/**
 * ★**経験の回数 → 段階**。
 * ★`relevantRuns` … ★その適性が試された回数（★道悪なら道悪のレース・距離ならその距離帯）。
 * ⚠️ ★**素質の値を受け取りません**（★引数は回数だけ。★D-108 ③ の「入力の形」）。
 */
export function discoveryStageOf(relevantRuns: number): DiscoveryStage {
  let step = 0;
  for (const need of DISCOVERY_STEPS) {
    if (relevantRuns >= need) step += 1;
  }
  return DISCOVERY_STAGES[Math.min(step, DISCOVERY_STAGES.length - 1)]!;
}

/**
 * ★**画面に出す文字**。
 * ★`known` のときだけ ★**評価そのもの**（★呼び出し側が §12.4 の表記で渡す）を返します。
 * ⚠️ ★`unknown`・`hint`・`narrow` では ★**評価を返しません**（★数値はどの段階でも返しません）。
 */
export function discoveryLabelOf(stage: DiscoveryStage, knownLabel: string): string {
  switch (stage) {
    case 'unknown': return '？？？';
    case 'hint': return '得意かも？';
    case 'narrow': return 'B 以上？';
    case 'known': return knownLabel;
    default: { const never: never = stage; throw new Error(String(never)); }
  }
}

/**
 * ★**その経験で発見が進んだか**（★`trait-discovered` の出来事を残すかの判定・§18 LR-7）。
 * ⚠️ ★**レースが終わった後に呼びます**（★ゴールより前に結果を読む値を作らない・D-098 の家族）。
 */
export function discoveryAdvanced(beforeRuns: number, afterRuns: number): boolean {
  return discoveryStageOf(beforeRuns) !== discoveryStageOf(afterRuns);
}
