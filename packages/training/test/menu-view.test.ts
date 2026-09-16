/**
 * ★**調教の見せ方「体・心 × 強度」の写像**（★GB-1・2026-09-16・指示書 `DEV_INSTRUCTIONS_GAME_BODY_1_20260916.md` §1-2）
 *
 * 【★見ている壊れ方】
 *   ① ★写像が 8 メニューの一部を落とす（★画面から消えるメニューが出る）
 *   ② ★枡が空になる（★「体・弱」に何も無い画面ができる）
 *   ③ ★画面のバーが `potential`（素質）から作られる（★正典 §5.5・§12.4「本人にも数値で見せない」を破る）
 * 【★③の見方】★**禁止語の走査ではなく入力の形**で見ます（★D-098 の検査で踏んだ穴と同じ形にしない）。
 *   ★`trainingBarsOf` は `stats` と調子しか受け取らないので、★**素質を渡す口が無い**ことを型と実引数で固定します。
 */
import { describe, it, expect } from 'vitest';
import {
  MENUS, MENU_IDS, MENU_VIEW, TRAINING_AXES, TRAINING_INTENSITIES,
  menuViewOf, menusOfView, trainingBarsOf, raceWeekMarkOf, TRAINING_BAR_MAX, CONDITION_STEPS,
  type MenuId,
} from '../src/index.js';

describe('★調教の見せ方の写像（GB-1）', () => {
  it('① ★8 メニューすべてに枡がある（★全数・落ちがない）', () => {
    expect(MENU_IDS.length).toBe(8);
    for (const id of MENU_IDS) {
      const v = menuViewOf(id);
      expect(TRAINING_AXES, `${id} の軸`).toContain(v.axis);
      expect(TRAINING_INTENSITIES, `${id} の強度`).toContain(v.intensity);
    }
    /** ★写像の鍵の集合が、メニューの集合とちょうど同じ（★増やしても減らしても落ちる） */
    expect(Object.keys(MENU_VIEW).sort()).toEqual([...MENU_IDS].sort());
  });

  it('② ★どの枡にも 1 つ以上ある（体・心 × 弱中強 の 6 枡）', () => {
    const empty: string[] = [];
    for (const axis of TRAINING_AXES) {
      for (const intensity of TRAINING_INTENSITIES) {
        if (menusOfView(axis, intensity).length === 0) empty.push(`${axis}/${intensity}`);
      }
    }
    expect(empty, '★空の枡').toEqual([]);
    /** ★全部の枡を足すと 8 メニューに戻る（★重複も欠落もない） */
    const all = TRAINING_AXES.flatMap((a) => TRAINING_INTENSITIES.flatMap((i) => menusOfView(a, i)));
    expect([...all].sort()).toEqual([...MENU_IDS].sort());
  });

  it('③ ★正典 §7.2 の註記どおりの並び（体: 軽め → 坂路・ウッド・プール → 追い切り ／ 心: 休養 → ゲート → 併せ馬）', () => {
    expect(menusOfView('body', 'weak')).toEqual(['light']);
    expect([...menusOfView('body', 'mid')].sort()).toEqual(['hill', 'pool', 'wood']);
    expect(menusOfView('body', 'strong')).toEqual(['hard']);
    expect(menusOfView('mind', 'weak')).toEqual(['rest']);
    expect(menusOfView('mind', 'mid')).toEqual(['gate']);
    expect(menusOfView('mind', 'strong')).toEqual(['partner']);
  });

  it('④ ★見せ方を足しても、メニューの値（疲労・EP・係数・故障率）は 1 つも変わっていない', () => {
    /** ★正典 §7.2 の表の写し（★この検査は「見せ方の追加で式に触れていない」ことの錨） */
    const want: Readonly<Record<MenuId, readonly [number, number, number]>> = {
      hill: [18, 300, 1.3], wood: [15, 300, 1.0], pool: [6, 400, 0.5], gate: [8, 200, 1.0],
      partner: [20, 500, 1.0], hard: [32, 800, 2.2], light: [4, 100, 1.0], rest: [-35, 0, 0],
    };
    for (const id of MENU_IDS) {
      const m = MENUS[id];
      expect([m.fatigue, m.epCost, m.intensity], `${id}`).toEqual([...want[id]]);
    }
  });

  it('⑤ ★画面の 3 本のバーは `stats` と調子だけから決まる（★素質を渡す口が無い）', () => {
    const stats = { sp: 612, st: 548, pw: 571, gt: 498, iq: 603 };
    const bars = trainingBarsOf(stats, 3);
    expect(bars.map((b) => b.key)).toEqual(['sp', 'st', 'condition']);
    expect(bars[0]!.value).toBe(stats.sp);
    expect(bars[1]!.value).toBe(stats.st);
    expect(bars[0]!.max).toBe(TRAINING_BAR_MAX);
    /** ★調子は能力ではなく状態（★同じ物差しに並べない） */
    expect(bars[2]!.kind).toBe('state');
    expect(bars[2]!.max).toBe(CONDITION_STEPS);
    expect(bars.filter((b) => b.kind === 'ability').every((b) => b.max === TRAINING_BAR_MAX)).toBe(true);
    /** ★入力で見る: ★`stats` だけを変えるとバーが動き、★他に動かす入力が無い */
    expect(trainingBarsOf({ ...stats, sp: 613 }, 3)[0]!.value).toBe(613);
    /** ★`trainingBarsOf` の引数は 2 つ（★素質や「上限までの割合」を足せば、この長さが変わる） */
    expect(trainingBarsOf.length).toBe(2);
  });

  it('⑥ ★出走の前後の週の印（★週の進み方は変えない・言うだけ）', () => {
    expect(raceWeekMarkOf(0, null)).toBe('race-week');
    expect(raceWeekMarkOf(1, 5)).toBe('before-race');
    expect(raceWeekMarkOf(3, 1)).toBe('after-race');
    expect(raceWeekMarkOf(null, null)).toBe('none');
    expect(raceWeekMarkOf(4, 4)).toBe('none');
  });
});
