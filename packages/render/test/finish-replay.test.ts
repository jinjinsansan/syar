/**
 * ★**ゴール前リプレイ**（`finish-replay.ts`・2026-08-28・オーナー要望⑤）
 *
 *   ★見るのは「本編に触れていないこと」「時間の対応が決定的であること」、
 *   ★そして何より ★**ゴールの瞬間を含んでいること**です。
 */
import { describe, expect, it } from 'vitest';
import {
  FINISH_REPLAY_DISPLAY_SEC, FINISH_REPLAY_SOURCE_SEC, FINISH_REPLAY_TAIL_SEC,
  finishReplayAt, raceTotalDisplaySec,
} from '../src/finish-replay.js';
import { withFinishRunOut } from '../src/replay-model.js';

const MAIN = 38.78;         // 本編の表示＝★最後の 1 頭がゴールする時刻（seed 42 の実測）
const CROSS = 35.95;        // ★勝馬が決勝線を通る時刻（同・本編の終わりより 2.83 秒前）
const WINNER_FOLLOW = 2.4;  // 勝馬の寄り
const at = (d: number) => finishReplayAt(d, MAIN, WINNER_FOLLOW, CROSS);
const FROM = MAIN + WINNER_FOLLOW;

describe('ゴール前リプレイ', () => {
  it('★本編と勝馬の寄りの間は一度も起動しない（本編に触れない）', () => {
    for (const d of [0, 1, 10, 20, 30, MAIN - 0.01, MAIN, MAIN + 1, FROM - 0.01]) {
      expect(at(d).active, `表示 ${d}s`).toBe(false);
    }
  });

  it('★★ゴールの瞬間を含む（本編の終わりより後ろまで見せる）', () => {
    /**
     * ⚠️ ★これが最初は満たせていませんでした。★リプレイは残り 43.1m から始まり
     *    ★**残り 8.3m で終わって**いました（実画面で確認・2026-08-28）。
     *    ★8.3m の正体は `broadcastV2StartLagM` の発走の遅れで、位置モデルが 1600m 頭打ちのため
     *    ★**表示位置は 1600m に永久に届きません。** 本編ではゴール後の「流し」がその先を作ります。
     * ★だから**本編の終わり（`MAIN`）より後ろ**まで含めること。ここが 0 以下なら退行です。
     */
    expect(FINISH_REPLAY_TAIL_SEC).toBeGreaterThan(0);
    const end = at(FROM + FINISH_REPLAY_DISPLAY_SEC);
    expect(end.sourceDisplaySec, '★終わりは勝馬の通過より後ろ').toBeGreaterThan(CROSS);
    expect(end.sourceDisplaySec).toBeCloseTo(CROSS + FINISH_REPLAY_TAIL_SEC, 6);
  });

  it('★★基準は「勝馬の通過」であって「本編の終わり」ではない', () => {
    /**
     * ⚠️ ★最初これを本編の終わり（＝**最後の 1 頭**がゴールする時刻）に取っていました。
     *    ★実測（seed 42）で **2.83 秒**ずれており、★リプレイは
     *    ★**勝馬が通り過ぎた後から**始まっていました（オーナー指摘）。
     */
    expect(CROSS).toBeLessThan(MAIN);
    const start = at(FROM);
    expect(start.sourceDisplaySec).toBeLessThan(CROSS);
    /** ★本編の終わりを基準にしていたら、始まりは通過より後ろになってしまう */
    expect(MAIN - FINISH_REPLAY_SOURCE_SEC).toBeGreaterThan(CROSS);
  });

  it('★始まりはゴールの手前（勝馬の通過より前）', () => {
    const start = at(FROM);
    expect(start.active).toBe(true);
    expect(start.sourceDisplaySec).toBeCloseTo(CROSS - FINISH_REPLAY_SOURCE_SEC, 6);
    expect(start.sourceDisplaySec, '★始まりは勝馬の通過より前').toBeLessThan(CROSS);
  });

  it('★見せる時刻は単調に増える（巻き戻ったり跳んだりしない）', () => {
    let prev = -Infinity;
    for (let d = FROM; d <= FROM + FINISH_REPLAY_DISPLAY_SEC; d += 1 / 30) {
      const r = at(d);
      expect(r.sourceDisplaySec, `表示 ${d.toFixed(2)}s`).toBeGreaterThanOrEqual(prev);
      prev = r.sourceDisplaySec;
    }
  });

  it('★スローであること（表示の長さ > 見せる本編の長さ）', () => {
    expect(FINISH_REPLAY_DISPLAY_SEC).toBeGreaterThan(FINISH_REPLAY_SOURCE_SEC + FINISH_REPLAY_TAIL_SEC);
  });

  it('★区間を過ぎたら終わる（出しっぱなしにしない）', () => {
    const over = at(FROM + FINISH_REPLAY_DISPLAY_SEC + 5);
    expect(over.active, '★区間を過ぎたら閉じる').toBe(false);
    expect(over.progress).toBe(1);
  });

  it('★同じ表示秒なら必ず同じ値（決定論・憲法4）', () => {
    const d = FROM + 1.7;
    expect(at(d)).toEqual(at(d));
  });

  it('★総尺はリプレイのぶんだけ伸びる', () => {
    expect(raceTotalDisplaySec(7.8, MAIN, 8.4)).toBeCloseTo(7.8 + MAIN + 8.4 + FINISH_REPLAY_DISPLAY_SEC, 6);
  });
});

/**
 * ★**リプレイで馬が「がくっ」と跳ばない**（2026-08-28・オーナー指摘）
 *
 *   > リプレイの演出の時、ゴール前で必ず１度がくっとします
 *
 *   ★正体は `withFinishRunOut` の `postDisplaySec`。あれは**勝馬の通過**を基準にした値なので、
 *   ★2 着以降が線を越えた瞬間に**その分だけ前へ飛びます**。
 *   ★本編は `raceSec` が止まっているので起きません。リプレイは進み続けるので起きます。
 *   ★実測（seed 42・2 着）: ★**1 コマで 1.42m（約 185px）**、速さ 14.56 → 57.04 → 14.56 m/s。
 */
describe('ゴール前リプレイ — 線の前後で速さが変わらない', () => {
  const DIST = 1600;
  /** ⚠️ ★`HorseAt` の位置は `meters` です（`s` ではない。最初 `s` と書いて NaN になりました） */
  const horsesAt = () => [
    { gate: 1, meters: DIST, w: 6, staminaRatio: 1 },
    { gate: 2, meters: DIST, w: 7, staminaRatio: 1 },
  ];
  /** ★1 着は 100.0 秒、2 着は 0.2 秒後に通過する想定 */
  const finishSecOf = (gate: number): number | undefined => (gate === 1 ? 100.0 : 100.2);
  const speedOf = (): number => 16.5;

  it('★2 着が線を越えた瞬間に前へ飛ばない（速さで走り抜ける）', () => {
    /** ★2 着の通過の直前・直後 */
    const before = withFinishRunOut(horsesAt(), finishSecOf, 100.19, DIST, 0, 14, speedOf);
    const after = withFinishRunOut(horsesAt(), finishSecOf, 100.21, DIST, 0, 14, speedOf);
    const b = before.find((h) => h.gate === 2)!.meters;
    const a = after.find((h) => h.gate === 2)!.meters;
    /** ★0.02 秒ぶんしか進まないこと（16.5 × 0.02 = 0.33m） */
    expect(a - b).toBeLessThan(0.5);
  });

  it('★★`postDisplaySec` を渡すと 2 着が飛ぶ（これが不具合だった）', () => {
    /**
     * ★**この検査は「壊れ方」を固定しています。** ここが飛ばなくなったら、
     * ★`withFinishRunOut` の意味が変わったということなので、上の対処も見直すこと。
     */
    const post = 0.12;   // 勝馬の通過から 0.2 秒 × RUNOUT_SLOW 0.6
    const after = withFinishRunOut(horsesAt(), finishSecOf, 100.21, DIST, post, 14, speedOf);
    const a = after.find((h) => h.gate === 2)!.meters;
    expect(a - DIST, '★勝馬基準の分だけ前へ飛ぶ').toBeGreaterThan(1.0);
  });
});
