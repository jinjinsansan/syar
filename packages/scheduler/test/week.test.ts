/**
 * ★週進行。**時刻から決まること**と**欠落・重複が起きないこと**を、境界の両側で確かめる（R-2）。
 *
 *   週は成長・故障・EP の消費を起こすので、
 *   **飛べば馬が育たず、重なれば二重に故障判定を引きます。**
 */
import { describe, expect, it } from 'vitest';
import { CYCLE_MS } from '../src/cycle.js';
import {
  CAREER_RACE_LIMIT,
  CYCLES_PER_WEEK,
  LIFECYCLE_WEEKS,
  WEEK_MS,
  WEEKS_PER_DAY,
  ageWeeks,
  canTrain,
  lifeStageAt,
  offsetInWeek,
  weekIndexAt,
  weekStartMs,
  weeksToProcess,
} from '../src/index.js';

const EPOCH = 1_700_000_000_000;
const H = 60 * 60 * 1000;

describe('§7.1・D-007 週の長さ', () => {
  it('★1週 = リアル4時間 / 1日6週（正典の値と一致する）', () => {
    // ★導出値が正典の記述とずれていないかを、リテラルで当てる
    expect(WEEK_MS).toBe(4 * H);
    expect(WEEKS_PER_DAY).toBe(6);
  });

  it('★1週はサイクル24本ちょうど（週境界が必ずサイクル境界に一致する）', () => {
    expect(CYCLES_PER_WEEK).toBe(24);
    expect(WEEK_MS % CYCLE_MS).toBe(0);
    // 週の開始は、必ずサイクルの開始でもある
    for (const w of [0, 1, 7, 260]) {
      expect((weekStartMs(w, EPOCH) - EPOCH) % CYCLE_MS).toBe(0);
    }
  });
});

describe('★週番号は時刻だけから決まる', () => {
  it('同じ時刻からは必ず同じ週番号が出る（再起動しても変わらない）', () => {
    const t = EPOCH + 13 * WEEK_MS + 12345;
    expect(weekIndexAt(t, EPOCH)).toBe(13);
    expect(weekIndexAt(t, EPOCH)).toBe(weekIndexAt(t, EPOCH));
  });

  it('★境界の両側（R-2）', () => {
    const start = weekStartMs(5, EPOCH);
    expect(weekIndexAt(start - 1, EPOCH)).toBe(4);
    expect(weekIndexAt(start, EPOCH)).toBe(5);
    expect(weekIndexAt(start + WEEK_MS - 1, EPOCH)).toBe(5);
    expect(weekIndexAt(start + WEEK_MS, EPOCH)).toBe(6);
  });

  it('週の先頭からの経過は 0 〜 WEEK_MS-1 に収まる', () => {
    expect(offsetInWeek(weekStartMs(9, EPOCH), EPOCH)).toBe(0);
    expect(offsetInWeek(weekStartMs(9, EPOCH) + WEEK_MS - 1, EPOCH)).toBe(WEEK_MS - 1);
  });
});

describe('★欠落も重複も起こさない（P2 の cycle_index と同じ性質）', () => {
  const at = (w: number, off = 1000) => weekStartMs(w, EPOCH) + off;

  it('いまの週は処理しない（まだ締まっていない）', () => {
    expect(weeksToProcess(at(10), EPOCH, 9)).toEqual([]);
  });

  it('★止まっていた間の週をすべて返す（飛ばすと馬が育たない）', () => {
    // 週3まで処理済み。いま週10 → 4〜9 を処理する
    expect(weeksToProcess(at(10), EPOCH, 3)).toEqual([4, 5, 6, 7, 8, 9]);
  });

  it('★処理済みの週は二度と返さない（重複すると二重に故障判定を引く）', () => {
    const first = weeksToProcess(at(10), EPOCH, 3);
    const last = first[first.length - 1]!;
    expect(weeksToProcess(at(10), EPOCH, last)).toEqual([]);
    // 何度呼んでも増えない
    expect(weeksToProcess(at(10), EPOCH, last)).toEqual([]);
  });

  it('★初回（未処理）は直前の1週だけ（過去を遡って一気に処理しない）', () => {
    // 起動直後に260週ぶん処理すると、馬が一瞬で引退する
    expect(weeksToProcess(at(100), EPOCH, null)).toEqual([99]);
  });

  it('★週をまたいで連続して呼んでも、番号が飛ばず重ならない', () => {
    let last: number | null = 40;
    const seen: number[] = [];
    for (let w = 41; w <= 45; w += 1) {
      // 週の途中で何度呼んでも同じ結果になる
      for (const off of [0, WEEK_MS / 3, WEEK_MS - 1]) {
        const got = weeksToProcess(weekStartMs(w, EPOCH) + off, EPOCH, last);
        if (off === WEEK_MS - 1) {
          seen.push(...got);
          if (got.length > 0) last = got[got.length - 1]!;
        }
      }
    }
    expect(seen).toEqual([40 + 1 - 1, 41, 42, 43, 44].slice(1)); // 41..44
    expect(new Set(seen).size).toBe(seen.length); // 重複なし
  });
});

describe('§7.1 馬の一生の段階', () => {
  it('★境界の両側（R-2）', () => {
    expect(lifeStageAt(77)).toBe('growing');
    expect(lifeStageAt(78)).toBe('trainable');
    expect(lifeStageAt(103)).toBe('trainable');
    expect(lifeStageAt(104)).toBe('racing');
    expect(lifeStageAt(259)).toBe('racing');
    expect(lifeStageAt(260)).toBe('retired');
  });

  it('正典の週齢と一致する', () => {
    expect(LIFECYCLE_WEEKS.trainableFrom).toBe(78);
    expect(LIFECYCLE_WEEKS.raceableFrom).toBe(104);
    expect(LIFECYCLE_WEEKS.retireAt).toBe(260);
    expect(CAREER_RACE_LIMIT).toBe(24);
  });

  it('★調教できるのは 78〜259週（引退後はできない）', () => {
    expect(canTrain(77)).toBe(false);
    expect(canTrain(78)).toBe(true);
    expect(canTrain(259)).toBe(true);
    expect(canTrain(260)).toBe(false);
  });

  it('週齢は誕生週からの差', () => {
    expect(ageWeeks(100, 178)).toBe(78);
  });
});
