/**
 * ★**小窓テレビの中継番組**（★2026-10-01・R-28 引き渡し §3〜§8・裁定 `REVIEW_R28_CHANNEL_CANON_VERDICT_20261001.md`）
 *
 * 【★見ている壊れ方】
 *   ① ★編成表の秒が 段の長さとずれる（★次の段へ食い込む・空く）
 *   ② ★番組のオッズが ★掲示板と別の規則で札を付ける（★写しが離れる・D-052）／★「大穴」・払戻の見込み額が入り込む（L-8）
 *   ③ ★実況の文が 1 枚 36 字を超える／★予想を勧める語・素質が入る（§7・§5.5）
 *   ④ ★競馬場の説明に ★数字以外の固有の文が混ざる（D-125 ②）
 *   ⑤ ★データの無い番組で ★空の枠を見せる
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PHASE_OFFSET_MS, VENUES } from '@star/scheduler';
import {
  CHANNEL_BLOCKS, NARR_MAX_CHARS, channelSlotAt, courseLines, cycleSecOf, horseOrder, narrationFor, narrationText,
  oddsBoard, resolveShow, venueFacts, type ChannelRunner, type NarrContext, type NarrKind,
} from '../../web/src/components/uma/broadcast-program';
import { tickerBoard } from '../../web/src/components/uma/race-strip-ticker';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/broadcast-program.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const START = Date.parse('2026-10-01T12:00:00Z');
const clock = (iso: string): string => iso.slice(11, 16);
const venue = VENUES[0]!;
const runner = (gate: number, name: string, winOdds: number | null, extra: Partial<ChannelRunner> = {}): ChannelRunner => ({
  gate, name, winOdds, capped: false, horseId: null, strategy: 'senko', weight: 57, popularity: null,
  isMine: false, starts: 3, wins: 1, recent: [3, 1, 5], ...extra,
});
const runners: ChannelRunner[] = [
  runner(2, 'ウマビーズゴールドスター', 1.8), runner(1, 'ウマA', 12.4), runner(3, 'ウマC', 150, { capped: true, starts: 0 }),
];
const race = {
  name: 'スターパーク 1勝クラス 芝2400m', surface: 'turf', distance: 2400, scheduled_at: new Date(START).toISOString(),
  status: 'scheduled', entry_deadline_at: null,
};
const ctx: NarrContext = { race, venue, going: 'good', runners };
const opts = { fieldSize: 12, size: 'sp' as const, reducedMotion: false, hasOwn: false };

describe('★編成表（R-28 §3）', () => {
  it('① ★段は 0〜360 秒を すき間なく覆い・★各段の枠の合計は 段の長さ以上（★巡回 2 だけ 66 秒で打ち切り）', () => {
    expect(CHANNEL_BLOCKS[0]!.from).toBe(0);
    expect(CHANNEL_BLOCKS.at(-1)!.to).toBe(PHASE_OFFSET_MS.start / 1000);
    for (let i = 1; i < CHANNEL_BLOCKS.length; i += 1) expect(CHANNEL_BLOCKS[i]!.from).toBe(CHANNEL_BLOCKS[i - 1]!.to);
    for (const b of CHANNEL_BLOCKS) {
      const sum = b.slots.reduce((a, s) => a + s.sec, 0);
      expect(sum, `${b.from}〜${b.to}`).toBe(b.from === 180 ? 66 : b.to - b.from);
    }
  });

  it('② ★段の境目は サーバーの `PHASE_OFFSET_MS` と同じ（★確定 0・公示 30・発売 60・締切 300）', () => {
    expect(channelSlotAt(PHASE_OFFSET_MS.publish / 1000, opts).show).toBe('ident');
    expect(channelSlotAt(PHASE_OFFSET_MS.salesOpen / 1000, opts).show).toBe('odds');
    expect(channelSlotAt(PHASE_OFFSET_MS.salesClose / 1000, opts).show).toBe('closing');
    expect(channelSlotAt(0, opts).show).toBe('result');
    expect(cycleSecOf(START - 300_000, START)).toBe(60);
    expect(cycleSecOf(START + 1, START), '★発走の後').toBeNull();
    expect(cycleSecOf(START - PHASE_OFFSET_MS.start - 1, START), '★1 周より先').toBeNull();
  });

  it('③ ★表は 6 秒で 1 ページ（★動きを減らす設定は 9 秒）・★スマホ 6 頭／PC 12 頭', () => {
    expect(channelSlotAt(60, opts)).toMatchObject({ show: 'odds', page: 1, pages: 2 });
    expect(channelSlotAt(66, opts)).toMatchObject({ page: 2 });
    expect(channelSlotAt(66, { ...opts, reducedMotion: true })).toMatchObject({ page: 1 });
    expect(channelSlotAt(60, { ...opts, size: 'pc' })).toMatchObject({ pages: 1 });
  });

  it('④ ★巡回 2 は 別の馬（★紹介・パドックの 4〜6 頭目）', () => {
    expect(channelSlotAt(60 + 18 + 6 + 18, opts)).toMatchObject({ show: 'horse', horseIndex: 0 });
    expect(channelSlotAt(180 + 18 + 6 + 18, opts)).toMatchObject({ show: 'horse', horseIndex: 3 });
    expect(channelSlotAt(240, opts)).toMatchObject({ show: 'paddock', horseIndex: 3 });
  });

  it('⑤ ★自分の馬が出るなら ★公示の実況が「あなたの馬」・★紹介の並びの先頭', () => {
    expect(channelSlotAt(30 + 6 + 18, { ...opts, hasOwn: true }).narr).toBe('own');
    expect(channelSlotAt(30 + 6 + 18, opts).narr).toBe('fieldSet');
    const order = horseOrder([runner(1, 'A', 2), runner(5, 'B', 3, { isMine: true }), runner(3, 'C', 4)]);
    expect(order.map((r) => r.gate)).toEqual([5, 1, 3]);
  });

  it('⑥ ★データの無い番組は 出さない（★出走馬が無ければ つなぎ・★紹介の馬が足りなければ 出馬表）', () => {
    const none = { fieldReady: false, horses: 0, venue: true, going: true, result: false };
    expect(resolveShow(channelSlotAt(60, opts), none).show).toBe('ident');
    expect(resolveShow(channelSlotAt(0, opts), none).show).toBe('venue');
    const few = { fieldReady: true, horses: 2, venue: true, going: true, result: true };
    expect(resolveShow(channelSlotAt(60 + 18 + 6 + 18 + 16, opts), few).show).toBe('card');
  });
});

describe('★番組の中身（R-28 §4・§7）', () => {
  it('⑦ ★オッズの札は 掲示板と同じ関数の出力そのもの・★「大穴」は無い・★締切の前は空', () => {
    const board = oddsBoard(race, runners, START - 60_000, clock);
    expect(board).toEqual(tickerBoard(race, runners, START - 60_000, clock).filter((b) => b.kind === '単勝'));
    expect(board.filter((b) => b.badge === '1番人気').map((b) => b.no)).toEqual([2]);
    expect(JSON.stringify(board)).not.toContain('大穴');
    expect(oddsBoard({ ...race, status: 'announced' }, runners, START - 60_000, clock)).toEqual([]);
  });

  it('⑧ ★実況の文は どの種類も 36 字以内・★予想を勧める語・払戻・素質が無い', () => {
    const kinds: NarrKind[] = ['fieldSet', 'favorite', 'venue', 'going', 'starts', 'closingSoon', 'own', 'stretch', 'field'];
    const withOwn: NarrContext = { ...ctx, runners: [...runners, runner(14, 'ジブンノウマダヨロングネーム', 9.9, { isMine: true })] };
    let made = 0;
    for (const k of kinds) {
      const t = narrationText(k, withOwn);
      if (t !== null) made += 1;
      const one = narrationFor(k, withOwn);
      expect([...one].length, `${k}: ${one}`).toBeLessThanOrEqual(NARR_MAX_CHARS);
      expect(one).not.toMatch(/狙い目|荒れ|大穴|払戻|見込み|素質|最強|確実/);
    }
    expect(made, '★Q5: 6 種類以上').toBeGreaterThanOrEqual(6);
    expect(narrationText('starts', ctx)).toBe('1番ウマAは今日が4戦目です。');
    expect(SRC).not.toMatch(/狙い目|荒れる|大穴'/);
  });

  it('⑨ ★競馬場の説明は 数字から作る 1 文だけ（★全場）・★コースの 3 行は距離と 1 周の長さから', () => {
    for (const v of VENUES) {
      const f = venueFacts(v);
      expect(f.sentence).toBe(`1 周 ${v.lapM.toLocaleString('ja-JP')}m の${v.turn === 'left' ? '左' : '右'}回り。最後の直線は ${v.homeStretchM}m。`);
      const lines = courseLines(v, 2000);
      expect(lines).toHaveLength(3);
      expect(lines[1]).toMatch(/^コーナーは \d+ つ$/);
    }
    /** ★1 周ちょうどなら 角を 4 つ・★1 周未満なら 4 つ以下 */
    expect(courseLines(venue, venue.lapM)[1]).toBe('コーナーは 4 つ');
    expect(Number(/\d+/.exec(courseLines(venue, venue.homeStretchM + 10)[1]!)![0])).toBe(0);
    expect(courseLines(venue, venue.homeStretchM - 10)[2]).toBe('スタートはホームの直線');
  });
});
