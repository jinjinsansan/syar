/**
 * 調教メニュー8種（正典 §7.2）
 *
 * 【3分類（§16.3）】
 *   **疲労値と EP コストは正典の表の写し**です（較正定数ではありません）。
 *   ★**主効果の係数だけが正典に無く、較正定数です。**
 *     正典が数値で与えているのは **追い切り 1.6 / 軽め調整 0.3** の2つだけで、
 *     「坂路: SP+, PW+」のような**主効果の大きさは書かれていません**。
 *
 * 【★係数の桁は解析で決まります（実装前に確認済み）】
 *   ⚠️ ★**この段落は `BASE_GAIN = 12` の頃の解析です**（★2026-09-19 に気づきました）。
 *      ★いまの値は **7.8**（`growth.ts`・正典 §13.1 も 7.8）。★下の「104週で張り付く」は
 *      ★**12 のときの話**で、★7.8 に下げたのは ★**まさにそれを避けるため**でした（★D-045）。
 *   `BASE_GAIN = 12`（★当時）と `headroom` 指数 0.7 のもとで、
 *   **他の係数がすべて 1 だと、調教104週（182週齢）で素質上限に張り付きます。**
 *   調教できるのは 78→260週の **182週**なので、**後半78週は伸びが 0.00** になり、
 *   §7.1 の「指示を出さない週は成長が鈍る＝デイリー来訪の動機」が
 *   **3歳以降は成立しなくなります**。
 *
 *   → 主効果の典型値は **0.3〜0.5 程度**でなければ、キャリア後半の成長が消えます。
 *     正典の2値（0.3 と 1.6）は、ちょうどその範囲を挟んでいます。
 *   ★この見立てが正しいかは V-7/B-1 の実測で確かめます。**掃引で埋めません。**
 */

import type { AbilityKey } from '@star/sim-engine';

export type MenuId =
  | 'hill'      // 坂路
  | 'wood'      // ウッドチップ
  | 'pool'      // プール
  | 'gate'      // ゲート練習
  | 'partner'   // 併せ馬
  | 'hard'      // 追い切り
  | 'light'     // 軽め調整
  | 'rest';     // 休養（放牧）

export const MENU_IDS: readonly MenuId[] = [
  'hill', 'wood', 'pool', 'gate', 'partner', 'hard', 'light', 'rest',
];

/**
 * ★主効果の係数（較正定数）。正典に数値が無いので、ここで決めています。
 *
 * ⚠️ **1行で書くこと**（変異試験は行単位で宣言を置換するため）。
 * ⚠️ これを上げるとキャリア前半で素質上限に張り付き、下げると伸びなくなります。
 *    §7.1 の「デイリー来訪の動機」が成立する範囲に収める必要があります。
 */
// prettier-ignore
export const MAIN_EFFECT_COEF = 1.6;

/**
 * ★副効果（主効果の付かない形質にも僅かに乗るぶん）。較正定数。
 *   0 にすると「坂路だけ続けた馬は ST/GT/IQ が初期値のまま」になり、
 *   **1形質だけ極端に伸びた馬**が量産されます。正典に規定はありません。
 * ⚠️ **1行で書くこと**
 */
// prettier-ignore
export const SIDE_EFFECT_COEF = 0.08;

export interface MenuSpec {
  readonly id: MenuId;
  /** 表示名（正典の表記） */
  readonly label: string;
  /** 主効果が乗る能力。★正典の「主効果」列の写し */
  readonly main: readonly AbilityKey[];
  /** 全能力に一律で乗る係数。★正典が数値を与えているのはここだけ（追い切り1.6・軽め0.3） */
  readonly flatCoef: number | null;
  /** 疲労の増減。★正典の表の写し */
  readonly fatigue: number;
  /** EP コスト。★正典の表の写し（§13 で調整と明記されている） */
  readonly epCost: number;
  /** 気性への影響。★正典の副効果列の写し */
  readonly temperDelta: number;
  /** 故障率の倍率（§7.5 menuIntensity）。★正典の写し */
  readonly intensity: number;
}

/**
 * ★正典 §7.2 の表をそのまま写したもの（`main` / `fatigue` / `epCost` / `temperDelta`）と、
 *   §7.5 の menuIntensity。**係数だけが上の較正定数**です。
 */
export const MENUS: Readonly<Record<MenuId, MenuSpec>> = {
  hill:    { id: 'hill',    label: '坂路',         main: ['sp', 'pw'], flatCoef: null, fatigue:  18, epCost: 300, temperDelta:  0, intensity: 1.3 },
  wood:    { id: 'wood',    label: 'ウッドチップ', main: ['st', 'gt'], flatCoef: null, fatigue:  15, epCost: 300, temperDelta:  0, intensity: 1.0 },
  // ★プールの「疲労-5（相殺）」は、正典の表の +6 に既に含まれた表記と読みます。
  //   二重に引くと休養より疲労が減るメニューになるため、+6 をそのまま使います。
  pool:    { id: 'pool',    label: 'プール',       main: ['st'],       flatCoef: null, fatigue:   6, epCost: 400, temperDelta:  0, intensity: 0.5 },
  gate:    { id: 'gate',    label: 'ゲート練習',   main: ['iq'],       flatCoef: null, fatigue:   8, epCost: 200, temperDelta:  0, intensity: 1.0 },
  partner: { id: 'partner', label: '併せ馬',       main: ['gt', 'iq'], flatCoef: null, fatigue:  20, epCost: 500, temperDelta: -2, intensity: 1.0 },
  hard:    { id: 'hard',    label: '追い切り',     main: [],           flatCoef: 1.6,  fatigue:  32, epCost: 800, temperDelta:  0, intensity: 2.2 },
  light:   { id: 'light',   label: '軽め調整',     main: [],           flatCoef: 0.3,  fatigue:   4, epCost: 100, temperDelta:  0, intensity: 1.0 },
  rest:    { id: 'rest',    label: '休養',         main: [],           flatCoef: 0,    fatigue: -35, epCost:   0, temperDelta: -5, intensity: 0 },
};

/** ★指示を出さない週の扱い（正典 §7.1: 「軽め調整」扱い） */
export const DEFAULT_MENU: MenuId = 'light';

/**
 * ★**画面の見せ方「体・心 × 強度」への写像**（★GB-1・2026-09-16・正典 §7.2 の註記・D-101・オーナー決定 T-4）。
 *
 * 【★何をしていて、何をしていないか】
 *   ★**見せ方だけ**です。★**週の進み方・成長式・疲労・故障・EP は 1 ミリも変えません**
 *   （★だから V-14・V-15・V-7a/V-7b は「変わらないこと」を示すだけで足ります・D-101）。
 *   ★**新しい乱数・倍率・確率を足しません**。「当たり」の演出は ★既存の伸びの乱数の上側を見せるだけです。
 *
 * ⚠️ ★**写像はここ 1 か所**です（★D-052・R-30）。★画面（`apps/web`）・監査の道具・検査は ★**この関数を引くこと**。
 *    ★画面側に同じ表を複製すると、★**片方だけ直した日に画面と検査が離れます**
 *    （★`v18` の ②b を 2 通りに実装して 0.567 対 0.216 と食い違わせた前科・台帳 B-5）。
 *
 * ⚠️ ★**層の向き**: ★`@star/training` は依存ゼロの純粋な層で、★画面がこちらを引きます（★逆ではない）。
 */
export type TrainingAxis = 'body' | 'mind';
export type TrainingIntensity = 'weak' | 'mid' | 'strong';

export const TRAINING_AXES: readonly TrainingAxis[] = ['body', 'mind'];
export const TRAINING_INTENSITIES: readonly TrainingIntensity[] = ['weak', 'mid', 'strong'];

/** ★画面の見出し（正典 §7.2 の註記の表記） */
export const TRAINING_AXIS_LABEL: Readonly<Record<TrainingAxis, string>> = { body: '体', mind: '心' };
export const TRAINING_INTENSITY_LABEL: Readonly<Record<TrainingIntensity, string>> = { weak: '弱', mid: '中', strong: '強' };

export interface MenuView {
  readonly axis: TrainingAxis;
  readonly intensity: TrainingIntensity;
}

/**
 * ★正典 §7.2 の註記の写し:
 *   ★**体**: 軽め調整（弱）→ 坂路・ウッドチップ・プール（中）→ 追い切り（強）
 *   ★**心**: 休養（弱）→ ゲート練習（中）→ 併せ馬（強）
 */
export const MENU_VIEW: Readonly<Record<MenuId, MenuView>> = {
  light:   { axis: 'body', intensity: 'weak' },
  hill:    { axis: 'body', intensity: 'mid' },
  wood:    { axis: 'body', intensity: 'mid' },
  pool:    { axis: 'body', intensity: 'mid' },
  hard:    { axis: 'body', intensity: 'strong' },
  rest:    { axis: 'mind', intensity: 'weak' },
  gate:    { axis: 'mind', intensity: 'mid' },
  partner: { axis: 'mind', intensity: 'strong' },
};

/** ★そのメニューが画面でどの枡に入るか */
export function menuViewOf(menu: MenuId): MenuView {
  return MENU_VIEW[menu];
}

/** ★その枡に入るメニュー（★`MENU_IDS` の順。★どの枡にも 1 つ以上ある — 検査で固定） */
export function menusOfView(axis: TrainingAxis, intensity: TrainingIntensity): readonly MenuId[] {
  return MENU_IDS.filter((id) => MENU_VIEW[id].axis === axis && MENU_VIEW[id].intensity === intensity);
}

/** メニューが能力 `key` に与える係数 */
export function menuCoef(menu: MenuId, key: AbilityKey): number {
  const m = MENUS[menu];
  if (m.flatCoef !== null) return m.flatCoef;
  return m.main.includes(key) ? MAIN_EFFECT_COEF : SIDE_EFFECT_COEF;
}
