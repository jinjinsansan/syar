/**
 * ★**告知をどこまで先に出すか**（★**DS-5 ②**・2026-09-19・オーナー決定）
 *
 * 【★見ている壊れ方】
 *   ① ★G1 の窓が延びていない（★「今度の G1 に合わせて仕上げる」が成立しない）
 *   ② ★G2・G3・重賞以外まで延びた（★「出走馬もオッズも無いレース」が画面に大量に並ぶ）
 *   ③ ★窓の長さが **2 か所**にある（★D-052）
 *   ④ ★告知が**飛ぶ**（★近い側を返し忘れて、12 分前に存在しないレースができる）
 *   ⑤ ★遠い先の G1 を **組成しようとする**（★締切前に出走表を締めてしまう）
 *   ⑥ ★時刻が進んでも同じ番号が返り続ける／番号が重複する（★A-2）
 */
import { describe, expect, it } from 'vitest';
import {
  ANNOUNCE_AHEAD_BY_GRADE,
  ANNOUNCE_AHEAD_RACES,
  CYCLES_PER_WEEK,
  CYCLE_MS,
  LOOKAHEAD_RACES,
  WEEK_MS,
  announceAheadFor,
  cycleStartMs,
  entryDeadlineMs,
  gradeOf,
  racesToAnnounce,
} from '../src/index.js';

const EPOCH = 1_700_000_000_000;
/** ★サイクル `i` の途中の時刻（★境目ちょうどを避ける） */
const at = (i: number): number => cycleStartMs(i, EPOCH) + 1000;

/** ★最初に見つかる、その格のサイクル番号 */
function firstCycleOfGrade(grade: 'G1' | 'G2' | 'G3', from = 0): number {
  for (let i = from; i < from + 20_000; i += 1) if (gradeOf(i) === grade) return i;
  throw new Error(`${grade} のサイクルが 20,000 本 探しても見つかりません`);
}

describe('DS-5 ② 重賞だけ告知を先に出す', () => {
  it('★前提: ★G1・G2・G3 が実在する（★0 件を「該当なし」と読まない・R-21）', () => {
    for (const g of ['G1', 'G2', 'G3'] as const) {
      expect(typeof firstCycleOfGrade(g), `${g} が番組表に無い`).toBe('number');
    }
  });

  it('① ★★G1 の窓は 1 ゲーム内週（★4 時間）', () => {
    expect(ANNOUNCE_AHEAD_BY_GRADE.G1).toBe(CYCLES_PER_WEEK);
    /** ★実時間でも 4 時間ちょうど（★数で書いていないことの確認） */
    expect(ANNOUNCE_AHEAD_BY_GRADE.G1 * CYCLE_MS).toBe(WEEK_MS);
    expect(WEEK_MS).toBe(4 * 60 * 60 * 1000);
  });

  it('② ★★G2・G3・重賞以外は 12 分のまま（★狭いほうへ倒す・R-27）', () => {
    /**
     * 🔴 ★DS-5 ② の文に挙がっているのは **G1 だけ**です。
     *    ★G2・G3 の長さは正典にも判断にも書かれていないので、★延ばしません。
     *    ⚠️ ★決まったら `ANNOUNCE_AHEAD_BY_GRADE` の 1 行を変えるだけです。
     */
    expect(ANNOUNCE_AHEAD_BY_GRADE.G2).toBe(ANNOUNCE_AHEAD_RACES);
    expect(ANNOUNCE_AHEAD_BY_GRADE.G3).toBe(ANNOUNCE_AHEAD_RACES);
    /** ★窓（登録できる長さ）＝ 告知 − 組成 ＝ 2 サイクル ＝ 12 分 */
    expect((ANNOUNCE_AHEAD_RACES - LOOKAHEAD_RACES) * CYCLE_MS).toBe(12 * 60 * 1000);
  });

  it('★`announceAheadFor` が格で分かれる（★対照つき）', () => {
    expect(announceAheadFor(firstCycleOfGrade('G1'))).toBe(CYCLES_PER_WEEK);
    expect(announceAheadFor(firstCycleOfGrade('G2'))).toBe(ANNOUNCE_AHEAD_RACES);
    expect(announceAheadFor(firstCycleOfGrade('G3'))).toBe(ANNOUNCE_AHEAD_RACES);
    /** ★重賞でないサイクルを 1 本 探して、既定であること */
    let plain = -1;
    for (let i = 0; i < 1000; i += 1) if (gradeOf(i) === null) { plain = i; break; }
    expect(plain, '★重賞でないサイクルが 1,000 本 探しても無い').toBeGreaterThan(-1);
    expect(announceAheadFor(plain)).toBe(ANNOUNCE_AHEAD_RACES);
  });

  it('④ ★★近い 4 本は必ず入る（★告知が飛ばない）', () => {
    for (const now of [0, 37, 1234]) {
      const out = racesToAnnounce(at(now), EPOCH);
      for (let i = 1; i <= ANNOUNCE_AHEAD_RACES; i += 1) {
        expect(out, `★now=${now}: ${i} 本先が抜けている`).toContain(now + i);
      }
    }
  });

  it('⑥ ★番号が重複しない／昇順（★A-2 の前提）', () => {
    for (const now of [0, 37, 1234, 99_999]) {
      const out = racesToAnnounce(at(now), EPOCH);
      expect(new Set(out).size, `★now=${now}: 重複がある`).toBe(out.length);
      expect([...out].sort((a, b) => a - b), `★now=${now}: 昇順でない`).toEqual(out);
      /** ★自分より先だけ（★過ぎたレースを告知しない） */
      expect(Math.min(...out)).toBeGreaterThan(now);
    }
  });

  it('★同じ時刻からは必ず同じ答え（★再起動しても変わらない）', () => {
    const t = at(500);
    expect(racesToAnnounce(t, EPOCH)).toEqual(racesToAnnounce(t, EPOCH));
    /** ★サイクルの途中のどこで呼んでも同じ */
    expect(racesToAnnounce(cycleStartMs(500, EPOCH), EPOCH))
      .toEqual(racesToAnnounce(cycleStartMs(500, EPOCH) + CYCLE_MS - 1, EPOCH));
  });

  it('① ★★G1 は、その 40 サイクル前から返り始める（★境界の両側・R-2）', () => {
    const g1 = firstCycleOfGrade('G1', 100);
    /** ★40 本 前 → 入る */
    expect(racesToAnnounce(at(g1 - CYCLES_PER_WEEK), EPOCH), '★40 本前に入っていない').toContain(g1);
    /** ★41 本 前 → まだ入らない（★境界の外側） */
    expect(racesToAnnounce(at(g1 - CYCLES_PER_WEEK - 1), EPOCH), '★41 本前から入っている').not.toContain(g1);
    /** ★直前 → まだ入っている（★間で消えない） */
    expect(racesToAnnounce(at(g1 - 1), EPOCH), '★直前で消えた').toContain(g1);
  });

  it('② ★★G3 は、その 5 本前には**まだ**返らない（★延びていないことの対照）', () => {
    const g3 = firstCycleOfGrade('G3', 100);
    expect(racesToAnnounce(at(g3 - ANNOUNCE_AHEAD_RACES), EPOCH)).toContain(g3);
    expect(racesToAnnounce(at(g3 - ANNOUNCE_AHEAD_RACES - 1), EPOCH), '🔴 ★G3 まで延びている').not.toContain(g3);
  });

  it('★★並ぶ本数が増えすぎない（★「出走馬もオッズも無いレース」が画面に何本 並ぶか）', () => {
    /**
     * ⚠️ ★DS-5 の ②③ に付いていた但し書きが、ここです。
     *   ★1,000 周 まわして、★1 周あたりに返る本数の最大を数えます。
     */
    let worst = 0;
    let five = 0;
    const N = 5_000;
    for (let i = 0; i < N; i += 1) {
      const n = racesToAnnounce(at(i), EPOCH).length;
      worst = Math.max(worst, n);
      if (n > ANNOUNCE_AHEAD_RACES) five += 1;
    }
    /**
     * ✔ ★実測（2026-09-19・5,000 サイクル）: ★**最大 5 本**（★6 本は一度も出ません）。
     *   ★93.5% の周は **4 本のまま**で、★**6.5% の周だけ 5 本**になります。
     *   ★G1 は 625 サイクルに 1 本、★窓は 40 サイクルなので、★**2 本 同時には入りません**。
     * 🔴 ★`+2` ではなく ★**`+1`** で押さえます（★緩い上限は「通るだけの検査」です・R-16）。
     */
    expect(worst, `★1 周に ${worst} 本 並びます（★G1 が 2 本 重なっています）`)
      .toBe(ANNOUNCE_AHEAD_RACES + 1);
    expect(five / N, '★5 本になる周が多すぎます').toBeLessThan(0.10);
    expect(five, '★対照: 5 本の周が 1 つも無い（★G1 の窓が効いていない）').toBeGreaterThan(0);
  });

  it('⑤ ★★遠い先の G1 は、まだ組成できない（★締切が先にある）', () => {
    /**
     * 🔴 ★告知を延ばしても、★**締切は動きません**（`entryDeadlineMs` ＝ `cycleStart(N − 2)`）。
     *    ★`cycle-runner` は `nowMs < entryDeadlineMs(idx)` の間 飛ばすので、
     *    ★遠い先の G1 を掴んで出走表を締めることはありません。
     */
    const g1 = firstCycleOfGrade('G1', 100);
    const announcedAt = at(g1 - CYCLES_PER_WEEK);
    expect(racesToAnnounce(announcedAt, EPOCH)).toContain(g1);
    expect(announcedAt, '🔴 ★告知した時点で、もう締切を過ぎている').toBeLessThan(entryDeadlineMs(g1, EPOCH));
    /** ★登録できる長さ ＝ 38 サイクル ＝ 3 時間 48 分 */
    const window = entryDeadlineMs(g1, EPOCH) - cycleStartMs(g1 - CYCLES_PER_WEEK, EPOCH);
    expect(window).toBe((CYCLES_PER_WEEK - LOOKAHEAD_RACES) * CYCLE_MS);
    expect(window).toBe((3 * 60 + 48) * 60 * 1000);
  });

  it('③ ★★窓の長さを持つのは 1 か所だけ（★D-052）', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '../../..');
    /** ★`cycle.ts` に写しを置いていない */
    const cycle = readFileSync(path.join(root, 'packages/scheduler/src/cycle.ts'), 'utf8');
    expect(cycle, '🔴 ★`cycle.ts` に `racesToAnnounce` の写しが戻っている')
      .not.toMatch(/export function racesToAnnounce/);
    /** ★SQL にも画面にも窓の長さを書いていない */
    const win = readFileSync(path.join(root, 'packages/scheduler/src/announce-window.ts'), 'utf8');
    expect(win, '★G1 の窓を数で書いている（★`CYCLES_PER_WEEK` から引くこと）')
      .toMatch(/G1: CYCLES_PER_WEEK/);
    expect(win, '★4 時間をミリ秒で書いている').not.toMatch(/G1:\s*\d/);
  });
});
