/**
 * ★**帯の「流れる 1 行」**（★2026-09-28・オーナー指示・`race-strip-ticker.ts`・★中身は暫定 `QUESTIONS_STRIP_TICKER_20260928.md`）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★受付中に ★途中の顔ぶれを流す（★「この馬が出る」と読ませる）
 *   ② 🔴 ★オッズを ★人気順に並べる・★無い馬に作って出す
 *   ③ ★「あと N 分」が ★切り捨てで 0 分になる・★発走を過ぎても 数え続ける
 *   ④ 🔴 ★停止スイッチ・「動きを減らす」で ★止まらない（★資料 §5-7）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BOARD_ITEM_SEC, LONGSHOT_ODDS, tickerBoard, tickerCountdown, tickerItems, tickerShowsField, type TickerRace } from '../../web/src/components/uma/race-strip-ticker';

const ROOT = path.resolve(__dirname, '../../..');
const STRIP = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/race-strip.tsx'), 'utf8');
const CSS = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/uma-theme.css'), 'utf8');
const clock = (iso: string): string => iso.slice(11, 16);
const AT = '2026-09-28T05:12:00Z';
const T = Date.parse(AT);
const race = (status: string): TickerRace => ({
  name: 'R12291', surface: 'turf', distance: 1600, scheduled_at: AT, status, entry_deadline_at: '2026-09-28T04:54:00Z',
});
const field = [
  { gate: 2, name: 'ウマB', winOdds: 1.8, capped: false },
  { gate: 1, name: 'ウマA', winOdds: 12.4, capped: false },
  { gate: 3, name: 'ウマC', winOdds: 150, capped: true },
];

describe('★流れる 1 行', () => {
  it('🔴 ① ★受付中は ★馬名もオッズも流さない（★締切と発走だけ）', () => {
    const items = tickerItems(race('announced'), field, T - 5 * 60_000, clock);
    expect(items).toEqual(['次のレース R12291・芝1600m', '発走まで あと 5 分（05:12）', '出走登録受付中・締切 04:54']);
    expect(items.join(' ').includes('ウマ'), '★受付中に馬名').toBe(false);
    expect(tickerShowsField('announced')).toBe(false);
  });

  it('🔴 ② ★締切の後は ★馬番順に ★単勝つき（★人気順にしない・★上限は明示）', () => {
    const items = tickerItems(race('scheduled'), field, T - 2 * 60_000, clock);
    expect(items).toEqual([
      '次のレース R12291・芝1600m', '発走まで あと 2 分（05:12）', '出走 3 頭',
      '1番 ウマA 単勝 12.4倍', '2番 ウマB 単勝 1.8倍', '3番 ウマC 単勝 150.0倍（上限）',
    ]);
    /** ★単勝が無い馬は ★オッズの欄ごと出さない（★作らない） */
    expect(tickerItems(race('closed'), [{ gate: 1, name: 'ウマA', winOdds: null, capped: false }], T - 120_000, clock))
      .toContain('1番 ウマA');
  });

  it('③ ★「あと N 分」は切り上げ・★1 分未満は「まもなく」・★過ぎたら結果待ち', () => {
    expect(tickerCountdown(AT, T - 61_000, clock)).toBe('発走まで あと 2 分（05:12）');
    expect(tickerCountdown(AT, T - 60_000, clock)).toBe('発走まで あと 1 分（05:12）');
    expect(tickerCountdown(AT, T - 59_000, clock)).toBe('まもなく発走（05:12）');
    expect(tickerCountdown(AT, T, clock)).toBe('発走しました・結果を待っています');
    expect(tickerCountdown('x', T, clock)).toBe('発走時刻を読み込み中');
  });

  it('🔴 ④ ★停止スイッチと「動きを減らす」で ★止め、★札を送らず、★折り返して読ませる', () => {
    expect(CSS).toMatch(/\[data-theme='uma'\] \.u-paused \.u-race-strip-board-item \{[^}]*animation: none;[^}]*white-space: normal;/);
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,200}\.u-race-strip-board-item \{[^}]*animation: none;/);
    /** ★札を送る時計も ★止める（★CSS だけ止めると ★札が 2.9 秒ごとに替わって 動いて見える） */
    expect(STRIP).toContain("if (reduce.matches || hostRef.current?.closest('.u-paused') != null || document.visibilityState !== 'visible') return;");
    /** ★2 行に折る規則（R-18 #4）は ★電光掲示板だけ外す */
    expect(CSS).toContain('.u-race-strip-main > span:not(.u-race-run-mini):not(.u-race-strip-rec):not(.u-race-strip-board) {');
  });

  /**
   * 🔴 ⑤ ★**ずっと動いている**（★2026-09-28・オーナー「ずっと動いているように」→「流れて止まる 電光掲示板・飽きさせない」A＋C＋D）:
   *   ★「大」では ★いつも ★同じ要素（★分岐の外・★文字の行の最後）に ★電光掲示板を 1 つ。★1 枚の秒は ★TS と CSS で同じ。
   */
  it('🔴 ⑤ ★「大」では ★いつも同じ所で ★1 枚ずつ送り続ける（★秒は TS と CSS で同じ）', () => {
    expect(STRIP).toContain("const tickerOn = size === 'big' && next !== null && next !== undefined && data !== null && nowMs !== null;");
    expect(STRIP).toMatch(/<\/>\}\s*\{\/\*[\s\S]{0,600}\*\/\}\s*\{tickerOn && next && data && nowMs !== null\s*&& <StripBoard /);
    expect(STRIP.match(/<StripBoard /g)?.length, '★掲示板が 2 か所にある（★替わるたびに頭から送り直す）').toBe(1);
    expect(BOARD_ITEM_SEC).toBe(2.9);
    expect(CSS).toContain('animation: u-board-slide var(--board-sec, 2.9s) both;');
    expect(STRIP).toContain('nextField: nextRace !== null && tickerShowsField(nextRace.status) ? await fetchField(nextRace.id) : [],');
  });

  /** 🔴 ⑥ ★盛り上げ（C）: ★発走 1 分前は金で点滅・★締切 1 分前は赤・★「1番人気」は 1 頭だけ・★「大穴」は 50 倍から */
  it('🔴 ⑥ ★発走・締切の直前と ★人気・大穴の札', () => {
    const hot = tickerBoard(race('scheduled'), field, T - 30_000, clock);
    expect(hot[1]).toEqual({ text: 'まもなく発走（05:12）', tone: 'hot', badge: null });
    expect(tickerBoard(race('scheduled'), field, T - 90_000, clock)[1]!.tone, '★1 分より前は普通').toBe('plain');
    const closing = tickerBoard(race('announced'), field, Date.parse('2026-09-28T04:53:30Z'), clock);
    expect(closing[2]).toEqual({ text: '出走登録受付中・まもなく締切（04:54）', tone: 'alert', badge: null });
    const board = tickerBoard(race('scheduled'), field, T - 120_000, clock);
    expect(board.filter((b) => b.badge === '1番人気').map((b) => b.text)).toEqual(['2番 ウマB 単勝 1.8倍']);
    expect(board.filter((b) => b.badge === '大穴').map((b) => b.text)).toEqual(['3番 ウマC 単勝 150.0倍（上限）']);
    expect(LONGSHOT_ODDS).toBe(50);
    /** ★同じ倍率なら ★馬番の小さい 1 頭だけ */
    const tie = tickerBoard(race('scheduled'), [
      { gate: 1, name: 'ウマA', winOdds: 2, capped: false }, { gate: 2, name: 'ウマB', winOdds: 2, capped: false },
    ], T - 120_000, clock);
    expect(tie.filter((b) => b.badge === '1番人気').length).toBe(1);
    /** ★オッズが無い段（受付中）は ★札を付けない */
    expect(tickerBoard(race('announced'), field, T - 300_000, clock).some((b) => b.badge !== null)).toBe(false);
  });
});

