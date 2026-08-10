/**
 * 成長式（正典 §7.3）
 *
 * 【★この式の要点は `current ≤ potential` です】
 *   正典: 「**current が potential を超えることは絶対にない**（超えたら素質値＝遺伝の意味が消える）」
 *   → **コメントではなく不変条件として実装**し、テストと変異試験で守ります（B-4）。
 *
 * 【★正典に無い値（＝較正定数。照会に上げます）】
 *   正典が数値で与えているのは `BASE_GAIN = 12` / headroom 指数 `0.7` /
 *   `rand(0.85, 1.15)` / 成長曲線の4点 / temperCoef の2つの範囲 / conditionCoef の幅 `0.7〜1.3`。
 *   **書かれていないもの**:
 *     - 気性難／温順の**閾値**（temper は 0..100・創始水準 50。境界が無い）
 *     - conditionCoef の **0..5 → 0.7〜1.3 の対応**
 *     - 成長曲線の**点間の補間**と **104週未満**の値
 */

import type { AbilityKey, GrowthType, Rng } from '@star/sim-engine';
import { ABILITY_KEYS } from '@star/sim-engine';
import { MENUS, menuCoef, type MenuId } from './menus.js';

/** 正典 §7.3 の既定値。★正典の写し */
export const BASE_GAIN = 12;

/** 正典 §7.3 の headroom 指数。★正典の写し */
export const HEADROOM_EXPONENT = 0.7;

/** 正典 §7.3 の最終ゆらぎ `rand(0.85, 1.15)`。★正典の写し */
export const GAIN_JITTER = { min: 0.85, max: 1.15 } as const;

/**
 * ★気性難とみなす閾値（較正定数・**正典に規定なし**）。
 *   temper は 0..100 で高いほど気性難、創始水準は 50（D-009）。
 *   ここを動かすと「不安定な馬」の割合が変わり、成長のばらつきが変わります。
 * ⚠️ **1行で書くこと**（変異試験は行単位で宣言を置換するため）
 */
// prettier-ignore
export const TEMPER_DIFFICULT_AT = 50;

/** 正典 §7.3: 気性難は不安定 `rand(0.5,1.3)` / 温順は `rand(0.9,1.1)`。★正典の写し */
export const TEMPER_COEF_RANGE = {
  difficult: { min: 0.5, max: 1.3 },
  gentle: { min: 0.9, max: 1.1 },
} as const;

/** 正典 §7.3: conditionCoef は 0.7〜1.3。★幅は正典の写し（対応は下で決める） */
export const CONDITION_COEF_RANGE = { min: 0.7, max: 1.3 } as const;

/** 正典 §7.3 の成長曲線（週齢 → 係数）。★正典の表の写し */
export const GROWTH_CURVE: Readonly<Record<GrowthType, readonly (readonly [number, number])[]>> = {
  early: [[104, 1.5], [156, 1.2], [208, 0.6], [260, 0.3]],
  normal: [[104, 1.0], [156, 1.2], [208, 1.0], [260, 0.7]],
  late: [[104, 0.5], [156, 0.9], [208, 1.3], [260, 1.2]],
  late_bloomer: [[104, 0.3], [156, 0.6], [208, 1.2], [260, 1.5]],
};

/**
 * 成長型と週齢から係数を出す。
 *
 * ★**点間は線形補間**します（正典は4点しか与えていません）。
 *   階段状にすると 156週で係数が跳ね、**同じ調教で伸びが不連続に変わります**。
 * ★**104週未満は 104週の値**を使います。調教は78週から可能ですが、
 *   正典の表は104週から始まっているためです。**外挿しません** —
 *   late_bloomer を外挿すると 78週で**負**になり、調教すると能力が下がります。
 */
export function growthCoef(type: GrowthType, ageWeeks: number): number {
  const pts = GROWTH_CURVE[type];
  const first = pts[0]!;
  if (ageWeeks <= first[0]) return first[1];
  const last = pts[pts.length - 1]!;
  if (ageWeeks >= last[0]) return last[1];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    if (ageWeeks <= x1) return y0 + ((y1 - y0) * (ageWeeks - x0)) / (x1 - x0);
  }
  return last[1];
}

/** 気性による係数（§7.3）。★不安定さそのものが効果なので、必ず乱数を消費する */
export function temperCoef(temper: number, rng: Rng): number {
  const r = temper >= TEMPER_DIFFICULT_AT ? TEMPER_COEF_RANGE.difficult : TEMPER_COEF_RANGE.gentle;
  return rng.range(r.min, r.max);
}

/**
 * 調子による係数（§7.3）。
 * ★condition 0..5 を 0.7〜1.3 に**線形**で対応させます（正典は幅だけを与えています）。
 */
export function conditionCoef(condition: number): number {
  const c = Math.max(0, Math.min(5, condition));
  const { min, max } = CONDITION_COEF_RANGE;
  return min + ((max - min) * c) / 5;
}

/** 残り伸びしろ（§7.3）。★potential に達していれば 0 */
export function headroom(current: number, potential: number): number {
  if (potential <= 0) return 0;
  const remain = (potential - current) / potential;
  if (remain <= 0) return 0;
  return Math.pow(remain, HEADROOM_EXPONENT);
}

export interface GrowthInput {
  readonly menu: MenuId;
  readonly ageWeeks: number;
  readonly growth: GrowthType;
  readonly temper: number;
  readonly condition: number;
  readonly current: Readonly<Record<AbilityKey, number>>;
  readonly potential: Readonly<Record<AbilityKey, number>>;
}

/**
 * 1週ぶんの成長を計算し、**新しい current** を返す。
 *
 * ★差分ではなく結果を返します。呼ぶ側に加算させると、
 *   加算し忘れ・二重加算が**静かに**起きます（P2 の payout で踏んだ形）。
 *
 * ★**`current ≤ potential` はここで閉じます。**
 *   到達したら `potential` そのものを入れます（浮動小数で僅かに超えるのを防ぐ）。
 */
export function grow(input: GrowthInput, rng: Rng): Record<AbilityKey, number> {
  const { menu, ageWeeks, growth, temper, condition, current, potential } = input;
  const gc = growthCoef(growth, ageWeeks);
  const cc = conditionCoef(condition);
  // ★気性の係数は**週に1回**引く。形質ごとに引くと、同じ週で馬の気性が形質ごとに変わる
  const tc = temperCoef(temper, rng);
  const out = {} as Record<AbilityKey, number>;
  for (const key of ABILITY_KEYS) {
    const cur = current[key];
    const pot = potential[key];
    const jitter = rng.range(GAIN_JITTER.min, GAIN_JITTER.max);
    const gain = BASE_GAIN * menuCoef(menu, key) * gc * tc * cc * headroom(cur, pot) * jitter;
    const next = cur + Math.max(0, gain);
    // ★不変条件（正典 §7.3・B-4）: current は potential を超えない
    out[key] = next >= pot ? pot : next;
  }
  return out;
}

/** そのメニューの疲労変化（§7.2 の表の写し） */
export function fatigueDelta(menu: MenuId): number {
  return MENUS[menu].fatigue;
}

/** そのメニューの EP コスト（§7.2 の表の写し） */
export function epCost(menu: MenuId): number {
  return MENUS[menu].epCost;
}
