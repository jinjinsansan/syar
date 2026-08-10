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
 *   `BASE_GAIN = 12` と `headroom` 指数 0.7 のもとで、
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
export const MAIN_EFFECT_COEF = 0.45;

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

/** メニューが能力 `key` に与える係数 */
export function menuCoef(menu: MenuId, key: AbilityKey): number {
  const m = MENUS[menu];
  if (m.flatCoef !== null) return m.flatCoef;
  return m.main.includes(key) ? MAIN_EFFECT_COEF : SIDE_EFFECT_COEF;
}
