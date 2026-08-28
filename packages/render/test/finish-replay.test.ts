/**
 * ★**ゴール前リプレイ**（`finish-replay.ts`・2026-08-28・オーナー要望⑤）
 *
 *   ★見るのは「本編に触れていないこと」と「時間の対応が決定的であること」です。
 */
import { describe, expect, it } from 'vitest';
import {
  FINISH_REPLAY_DISPLAY_SEC, FINISH_REPLAY_RACE_SEC,
  finishReplayAt, raceTotalDisplaySec,
} from '../src/finish-replay.js';

const MAIN = 38.52;      // 本編の表示（seed 42 の実測）
const POST = 8.4;        // 勝馬の寄り 2.4 ＋ 着順ボード 6
const FINISH = 99.90;    // 勝馬のゴール秒（seed 42 の実測）
const at = (d: number) => finishReplayAt(d, MAIN, POST, FINISH);

describe('ゴール前リプレイ', () => {
  it('★本編と後処理の間は一度も起動しない（本編に触れない）', () => {
    for (const d of [0, 1, 10, 20, 30, MAIN - 0.01, MAIN, MAIN + 1, MAIN + POST - 0.01]) {
      expect(at(d).active, `表示 ${d}s`).toBe(false);
    }
  });

  it('★区間に入るとゴールの手前から始まり、終わりでちょうどゴールになる', () => {
    const start = at(MAIN + POST);
    expect(start.active).toBe(true);
    expect(start.raceSec).toBeCloseTo(FINISH - FINISH_REPLAY_RACE_SEC, 6);
    const end = at(MAIN + POST + FINISH_REPLAY_DISPLAY_SEC);
    expect(end.active).toBe(true);
    expect(end.raceSec).toBeCloseTo(FINISH, 6);
  });

  it('★レース秒は単調に増える（巻き戻ったり跳んだりしない）', () => {
    let prev = -Infinity;
    for (let d = MAIN + POST; d <= MAIN + POST + FINISH_REPLAY_DISPLAY_SEC; d += 1 / 30) {
      const r = at(d);
      expect(r.raceSec, `表示 ${d.toFixed(2)}s`).toBeGreaterThanOrEqual(prev);
      prev = r.raceSec;
    }
  });

  it('★スローであること（表示の長さ > 見せるレース時間）', () => {
    expect(FINISH_REPLAY_DISPLAY_SEC).toBeGreaterThan(FINISH_REPLAY_RACE_SEC);
  });

  it('★区間を過ぎてもゴールで止まる（その先を再生しない）', () => {
    const over = at(MAIN + POST + FINISH_REPLAY_DISPLAY_SEC + 5);
    expect(over.raceSec).toBeCloseTo(FINISH, 6);
    expect(over.progress).toBe(1);
  });

  it('★同じ表示秒なら必ず同じ値（決定論・憲法4）', () => {
    const d = MAIN + POST + 1.7;
    expect(at(d)).toEqual(at(d));
  });

  it('★総尺はリプレイのぶんだけ伸びる', () => {
    expect(raceTotalDisplaySec(7.8, MAIN, POST)).toBeCloseTo(7.8 + MAIN + POST + FINISH_REPLAY_DISPLAY_SEC, 6);
  });
});
