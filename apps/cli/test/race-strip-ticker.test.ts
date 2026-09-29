/**
 * ★**帯の掲示板**（★2026-09-28・オーナー指示 → A＋C → ★デザイナー回答 R-20・`race-strip-ticker.ts`・★中身の暫定 `QUESTIONS_STRIP_TICKER_20260928.md`）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★受付中に ★途中の顔ぶれを流す（★「この馬が出る」と読ませる）
 *   ② 🔴 ★オッズを ★人気順に並べる・★無い馬に作って出す
 *   ③ ★「あと N 分」が ★切り捨てで 0 分になる・★発走を過ぎても 数え続ける
 *   ④ 🔴 ★停止スイッチ・「動きを減らす」で ★止まらない（★資料 §5-7）
 *   ⑤ 🔴 ★掲示板が ★帯の中で 2 か所になる・★替わるたびに頭から流れ直す
 *   ⑥ 🔴 ★盛り上げ（C）が ★煽りになる（★速い点滅・★大穴の赤・R-20 Q2/Q3）
 *   ⑦ 🔴 ★LED 風に戻る（★オーナー「LED の見た目が悪い」→ R-20 で着順掲示板に）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BOARD_ITEM_SEC, bracketOrNull, tickerBoard, tickerCountdown, tickerItems, tickerShowsField, type TickerRace,
} from '../../web/src/components/uma/race-strip-ticker';

const ROOT = path.resolve(__dirname, '../../..');
const STRIP = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/race-strip.tsx'), 'utf8');
const CSS = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/uma-theme.css'), 'utf8');
const TICKER = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/race-strip-ticker.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
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

describe('★帯の掲示板', () => {
  it('🔴 ① ★受付中は ★馬名もオッズも流さない（★締切と発走だけ）', () => {
    const items = tickerItems(race('announced'), field, T - 5 * 60_000, clock);
    expect(items).toEqual(['次のレース R12291 ・ 芝1600m', '発走 あと 5分（05:12）', '締切 出走登録 04:54']);
    expect(items.join(' ').includes('ウマ'), '★受付中に馬名').toBe(false);
    expect(tickerShowsField('announced')).toBe(false);
  });

  it('🔴 ② ★締切の後は ★馬番順に ★単勝つき（★人気順にしない・★上限は明示・★無い馬は作らない）', () => {
    expect(tickerItems(race('scheduled'), field, T - 2 * 60_000, clock)).toEqual([
      '次のレース R12291 ・ 芝1600m', '発走 あと 2分（05:12）', '出走 3頭',
      '単勝 1番 ウマA 12.4倍', '単勝 2番 ウマB 1.8倍 1番人気', '単勝 3番 ウマC 150.0倍（上限）',
    ]);
    expect(tickerItems(race('closed'), [{ gate: 1, name: 'ウマA', winOdds: null, capped: false }], T - 120_000, clock))
      .toContain('単勝 1番 ウマA');
  });

  it('③ ★「あと N 分」は切り上げ・★1 分未満は「まもなく」（★残り秒）・★過ぎたら結果待ち', () => {
    expect(tickerCountdown(AT, T - 61_000, clock)).toBe('発走まで あと 2 分（05:12）');
    expect(tickerCountdown(AT, T - 59_000, clock)).toBe('まもなく発走（05:12）');
    expect(tickerCountdown(AT, T, clock)).toBe('発走しました・結果を待っています');
    expect(tickerBoard(race('scheduled'), field, T - 60_000, clock)[1]!.num, '★ちょうど 1 分は「あと 1 分」').toBe('1');
    expect(tickerBoard(race('scheduled'), field, T - 48_000, clock)[1]).toMatchObject({ kind: 'まもなく発走', tone: 'hot', text: 'R12291', num: '0:48' });
    expect(tickerBoard(race('scheduled'), field, T + 1, clock)[1]).toMatchObject({ kind: '発走', text: '発走しました・結果を待っています' });
  });

  it('🔴 ④ ★停止スイッチと「動きを減らす」で ★止め、★札を送らず、★折り返して読ませる', () => {
    expect(CSS).toMatch(/\[data-theme='uma'\] \.u-paused \.u-race-strip-board-item \{[^}]*animation: none;[^}]*white-space: normal;/);
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,300}\.u-race-strip-board-item \{[^}]*animation: none;/);
    /** ★見出しの明暗・録画の点も止める（★R-20 Q3） */
    expect(CSS).toMatch(/\.u-paused \.u-board-kind,[\s\S]{0,200}\{ animation: none; \}/);
    expect(STRIP).toContain("if (reduce.matches || hostRef.current?.closest('.u-paused') != null || document.visibilityState !== 'visible') return;");
    expect(CSS).toContain('.u-race-strip-main > span:not(.u-race-strip-rec):not(.u-race-strip-board):not(.u-race-strip-recbadge):not(.u-race-strip-nextchip) {');
  });

  it('🔴 ⑤ ★「大」では ★いつも同じ所で ★1 枚ずつ送り続ける（★秒は TS と CSS で同じ）', () => {
    expect(STRIP).toContain("const tickerOn = size === 'big' && next !== null && next !== undefined && data !== null && nowMs !== null;");
    /** ★分岐（待ち・録画・結果）の外（★間に ★次のレースの札 ⑧ が入る） */
    expect(STRIP).toMatch(/<\/>\}\s*\{\/\*[\s\S]{0,1600}\{tickerOn && next && data && nowMs !== null\s*&& <StripBoard /);
    expect(STRIP.match(/<StripBoard /g)?.length, '★掲示板が 2 か所にある').toBe(1);
    expect(BOARD_ITEM_SEC).toBe(3);
    expect(CSS).toContain('animation: u-board-slide var(--board-sec, 3s) cubic-bezier(.2, .8, .2, 1) both;');
    /** ★見出しは動かさない（★本文だけ `key` で入れ替える） */
    expect(STRIP).toMatch(/<span className=\{`u-board-kind u-board-\$\{item\.tone\}`\} aria-hidden>\{item\.kind\}<\/span>\s*<span key=\{step\}/);
    expect(STRIP).toContain('nextField: nextRace !== null && tickerShowsField(nextRace.status) ? await fetchField(nextRace.id) : [],');
  });

  it('🔴 ⑥ ★盛り上げは ★煽らない（★速い点滅なし・★大穴は赤なし・★1番人気は 1 頭だけ）', () => {
    expect(tickerBoard(race('scheduled'), field, T - 90_000, clock)[1]!.tone, '★1 分より前は普通').toBe('plain');
    const closing = tickerBoard(race('announced'), field, Date.parse('2026-09-28T04:53:30Z'), clock);
    expect(closing[2]).toMatchObject({ kind: '締切', tone: 'alert', text: '出走登録の締切まで', num: '0:30' });
    const board = tickerBoard(race('scheduled'), field, T - 120_000, clock);
    expect(board.filter((b) => b.badge === '1番人気').map((b) => b.no)).toEqual([2]);
    /** ★2026-09-28 レビュー側の裁定: ★「大穴」は出さない（★「当たれば大きい」の煽り・D-102 ③）。★「1番人気」は事実なので残す */
    expect(STRIP + TICKER, '★大穴の札が残っている').not.toContain('大穴');
    /** ★帯に 賭けの入口（★投票・マークシートの画面へのリンク）を置かない（★帯は全ページに出る・レビュー側の裁定） */
    expect(STRIP, '★帯から投票の画面へ送っている').not.toMatch(/href=\{?[`'"][^`'"]*\/(bet|vote|odds)/);
    const tie = tickerBoard(race('scheduled'), [
      { gate: 1, name: 'ウマA', winOdds: 2, capped: false }, { gate: 2, name: 'ウマB', winOdds: 2, capped: false },
    ], T - 120_000, clock);
    expect(tie.filter((b) => b.badge === '1番人気').length).toBe(1);
    expect(tickerBoard(race('announced'), field, T - 300_000, clock).some((b) => b.badge !== null)).toBe(false);
    /** ★R-20 Q3: 1 秒に 3 回以上の明滅は使わない・★見出しだけ 1.6 秒で明暗 */
    expect(CSS, '★速い点滅').not.toMatch(/steps\(1\) infinite/);
    expect(CSS).toMatch(/\.u-board-kind\.u-board-hot \{[^}]*animation: u-board-hot 1\.6s ease-in-out infinite;/);
    expect(CSS, '★大穴の札の見た目が残っている').not.toContain('u-board-badge-longshot');
  });

  it('🔴 ⑦ ★着順掲示板の見た目（★LED 風に戻らない・★馬番の札は枠の色・★左端に「● 録画」）', () => {
    for (const led of ['#0b0906', '#ffb52e', 'radial-gradient(rgba(0, 0, 0, .5)']) expect(CSS, `★LED 風の値 ${led}`).not.toContain(led);
    expect(CSS).toMatch(/\.u-race-strip-main > \.u-race-strip-board \{[^}]*height: 32px;[^}]*background: #061a33;/);
    /** ★馬番の札は ★枠（★`bracketOf`）の色・★白・黄・桃は黒い文字 */
    expect(bracketOrNull(16, 16)).toBe(8);
    expect(bracketOrNull(3, 0), '★頭数が分からなければ 色を付けない').toBeNull();
    expect(STRIP).toContain('{ background: `var(--f${item.bracket})`, color: [1, 5, 8].includes(item.bracket) ? \'#111\' : \'#fff\' }');
    expect(STRIP).toContain('{tickerOn && <span className="u-race-strip-recbadge"><span className="u-race-strip-chiphead">いま:</span><i aria-hidden />録画</span>}');
    /** ★2 つの札の頭の語を揃える（★片方だけ「次」だと もう片方が何か曖昧・レビュー側） */
    expect(STRIP).toContain('<span className="u-race-strip-chiphead">次:</span>');
  });

  /**
   * 🔴 ⑧ ★**次のレースの名前と発走時刻は いつも出す**（★2026-09-28・オーナー「次のレースが何のタイトルのレースか？何時発走なのか？は常に出るように」）。
   *   ★掲示板は流れるので ★見たい時に無いことがあった。★掲示板の左に ★動かない札を 1 つ（★分岐の外・★待ち時間も録画中も）。
   */
  it('🔴 ⑧ ★次のレースの名前と発走時刻を ★動かない札で いつも出す', () => {
    expect(STRIP).toMatch(/\{tickerOn && next && <span className="u-race-strip-nextchip">\s*<span className="u-race-strip-chiphead">次:<\/span>\s*<span className="u-race-strip-nextchip-name">\{next\.name\}<\/span>\s*<span className="u-race-strip-nextchip-time">\{clock\(next\.scheduled_at\)\}<\/span>/);
    /** ★掲示板のすぐ前（★同じ所・★分岐の外） */
    expect(STRIP).toMatch(/<\/span>\}\s*\{tickerOn && next && data && nowMs !== null\s*&& <StripBoard /);
    expect(CSS).toMatch(/\.u-race-strip-main > \.u-race-strip-nextchip \{[^}]*flex: 0 0 auto;/);
    expect(CSS, '★札が動く').not.toMatch(/\.u-race-strip-nextchip[^{]*\{[^}]*animation:/);
  });
});
