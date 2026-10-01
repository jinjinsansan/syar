/**
 * ★**レースの間の番組のデータ**（★2026-10-01・R-28・裁定 `REVIEW_R28_CHANNEL_CANON_VERDICT_20261001.md`）
 *
 * 【★見ている壊れ方】
 *   ① ★番組のオッズが ★掲示板と別の規則で札を付ける（★写しが離れる・D-052）
 *   ② ★「大穴」・払戻の見込み額が ★番組から入り込む（L-8・2026-09-28 の裁定）
 *   ③ ★出走馬が決まる前（公示の前）に ★出馬表・オッズを出す
 *   ④ ★競馬場の説明に ★数字以外の固有の文が混ざる（D-125 ②）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PHASE_OFFSET_MS, VENUES } from '@star/scheduler';
import { courseFacts, programPhaseOf, programSegments, type ProgramInput } from '../../web/src/components/uma/broadcast-program';
import { tickerBoard, type TickerRunner } from '../../web/src/components/uma/race-strip-ticker';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/broadcast-program.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const START = Date.parse('2026-10-01T12:00:00Z');
const clock = (iso: string): string => iso.slice(11, 16);
const venue = VENUES[0]!;
const runners: TickerRunner[] = [
  { gate: 2, name: 'ウマB', winOdds: 1.8, capped: false },
  { gate: 1, name: 'ウマA', winOdds: 12.4, capped: false },
  { gate: 3, name: 'ウマC', winOdds: 150, capped: true },
];
const input = (offsetFromStartMs: number, status = 'scheduled'): ProgramInput => ({
  nowMs: START - offsetFromStartMs,
  next: {
    name: 'テスト', surface: 'turf', distance: venue.lapM + 400, scheduled_at: new Date(START).toISOString(),
    status, entry_deadline_at: null, venueId: venue.id,
  },
  runners,
  lastResult: '前のレース 1着 5番',
});

describe('★番組のデータ（R-28）', () => {
  it('① ★段の境目は サーバーと同じ `PHASE_OFFSET_MS`', () => {
    const cyc = PHASE_OFFSET_MS.start;
    expect(programPhaseOf(START - cyc + 1, START)).toBe('settling');
    expect(programPhaseOf(START - cyc + PHASE_OFFSET_MS.publish, START)).toBe('publishing');
    expect(programPhaseOf(START - cyc + PHASE_OFFSET_MS.salesOpen, START)).toBe('onSale');
    expect(programPhaseOf(START - cyc + PHASE_OFFSET_MS.salesClose, START)).toBe('closed');
    expect(programPhaseOf(START - cyc - 1, START), '★1 周より先').toBe('unknown');
  });

  it('② ★オッズの札は 掲示板と同じ（★同じ関数の出力そのもの）・★「大穴」は無い', () => {
    const segs = programSegments(input(3 * 60_000), clock);
    const odds = segs.find((s) => s.kind === 'odds');
    const board = tickerBoard(input(3 * 60_000).next!, runners, START - 3 * 60_000, clock).filter((b) => b.kind === '単勝');
    expect(odds?.board).toEqual(board);
    expect(segs.find((s) => s.kind === 'favorite')?.board?.map((b) => b.no)).toEqual([2]);
    expect(JSON.stringify(segs)).not.toContain('大穴');
    /** ★払戻の見込み額・予想を勧める言葉を ★ここで作っていない */
    expect(SRC).not.toMatch(/払戻|見込み|狙い目|荒れ|大穴'/);
  });

  it('③ ★出走登録の締切の前は ★出馬表もオッズも出さない（★掲示板と同じ条件 `tickerShowsField`）', () => {
    const segs = programSegments(input(PHASE_OFFSET_MS.start - 10_000, 'announced'), clock);
    expect(segs.map((s) => s.kind)).toEqual(['lastResult', 'course']);
  });

  it('④ ★競馬場の説明は 数字と場名だけ（★固有の文を書いていない）', () => {
    for (const v of VENUES) {
      const lines = courseFacts(v, { surface: 'turf', distance: 2000 });
      expect(lines[0]).toBe(v.name);
      for (const l of lines.slice(1)) expect(l, l).toMatch(/\d/);
    }
    expect(courseFacts(venue, { surface: 'turf', distance: venue.lapM + 400 }).at(-1)).toMatch(/周$/);
  });
});
