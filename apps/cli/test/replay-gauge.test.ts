/**
 * 🔴 ★**ゲージを「出さない」のは 実レースの録画だけ。★見本の道では必ず出す**
 *   ★裁定 `REVIEW_RACE_WIRING_20260926.md` §7 の 5・★簿 `REPLAY-GAUGE-ABSENT-FOR-REAL-RACE`
 *
 * 【🔴 ★なぜ要るか — ★暫定の欠けを見本へ漏らさない】
 *   ★実レースの録画では ★ゲージを ★**出しません**（★`iq`/`gt`/`st`/`condition`/`fatigue` が要るのに
 *   ★`race_entries_public` は出さず、★出すべきでもない・★D-108 / D-116「素質を隠す」）。
 *   🔴 ★その「出さない」が ★**見本の道にも漏れると、★誰も気づきません** —
 *     ★ゲージは ★枠ごと消えるので、★**消えても画面は壊れません**。
 *   → ★見本の道（★`?venue=` の 50 鞍）では ★**必ず出る**ことを固定します。
 *
 * 【⚠️ ★なぜ `gauge?:`（任意）にしなかったか】
 *   ★任意だと ★**書き忘れても通ります**。★`null` 必須なら ★作る側が毎回決めます
 *   （★TL-1 の「3 つ目の状態を作らない」と同じ形）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const RACE_PAGE = 'apps/web/src/app/race/page.tsx';

const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');
/** ★註記を空白にする（★行の位置を保つ・★註記の中の語で判定しない） */
const strip = (src: string): string => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
  .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

describe('🔴 ★録画のゲージ（★出さないのは実レースだけ）', () => {
  it('★走査が空振りしていない', () => {
    const src = read(RACE_PAGE);
    expect(src.length, '★`/race` が読めていない').toBeGreaterThan(10000);
    expect(strip(src)).toContain('staminaGaugeOf');
  });

  /**
   * 🔴 ★**型は `null` 必須**（★任意にしない）。
   */
  it('🔴 ★gauge の型が「null を許す必須」になっている', () => {
    const src = strip(read(RACE_PAGE));
    expect(/readonly\s+gauge\s*:\s*ReturnType<typeof staminaGaugeOf>\s*\|\s*null\s*;/.test(src),
      '🔴 ★`gauge: ReturnType<typeof staminaGaugeOf> | null` になっていません').toBe(true);
    expect(/readonly\s+gauge\s*\?\s*:/.test(src),
      '🔴 ★`gauge?:`（任意）になっています。★書き忘れても通るので ★`| null` の必須にしてください')
      .toBe(false);
  });

  /**
   * 🔴 ★**見本の道では `null` にしない**（★これが本命）。
   *   ★`build()` は ★`staminaGaugeOf(...)` の戻りを ★そのまま渡すこと。
   */
  it('🔴 ★見本の道（build）は gauge を null にしない', () => {
    const src = strip(read(RACE_PAGE));
    const m = src.match(/function build\([\s\S]*?\n\}/);
    expect(m, '🔴 ★`build()` が見つからない（★走査が壊れている）').not.toBeNull();
    const body = m![0];
    expect(/const\s+gauge\s*=\s*staminaGaugeOf\(/.test(body),
      '🔴 ★`build()` が ★`staminaGaugeOf` からゲージを作っていません').toBe(true);
    expect(/\bgauge\s*:\s*null\b/.test(body),
      '🔴 ★**見本の道で `gauge: null` にしています**。\n'
      + '  ★「出さない」のは ★実レースの録画だけです（★裁定 §7）。\n'
      + '  ★見本で消すと ★**枠ごと消えて誰も気づきません**（★暫定の欠けを見本へ漏らさない）')
      .toBe(false);
  });

  /**
   * 🔴 ★**0 の帯を描かない**（★裁定 §7 の 3）。
   *   ★`staminaAt` を ★**呼ぶ前に**分けていること。
   */
  it('🔴 ★null のとき staminaAt を呼ばず、枠ごと出さない', () => {
    const src = strip(read(RACE_PAGE));
    /** ★`staminaAt(` の呼び出しが ★`null` 判定の後ろに在ること */
    expect(/built\.gauge === null \? null : staminaAt\(built\.gauge/.test(src),
      '🔴 ★`staminaAt` を ★`null` のときも呼んでいます（★`staminaAt` は null を通しません）').toBe(true);
    /** ★枠ごと出さない（★`hud.gauge` を偽にする） */
    expect(/built\.gauge === null \?\s*\{ \.\.\.hudBase, gauge: false \}/.test(src),
      '🔴 ★ゲージが無いのに ★枠を出しています（★0 の帯は「スタミナが尽きた」という嘘）').toBe(true);
  });

  /**
   * 🔴 ★**公開データからゲージを組み立てない**（★裁定 §7 の 4・D-108 / D-116）。
   *   ⚠️ ★人気やタイムからの推定も不可です。
   */
  it('🔴 ★公開データからゲージを作っていない', () => {
    const src = strip(read('apps/web/src/lib/race-real.ts'));
    expect(/staminaGaugeOf|staminaTrackOf|gauge\s*:/.test(src),
      '🔴 ★実レースを読む層が ★ゲージを作っています（★能力は公開できません・D-108 / D-116）').toBe(false);
  });
});
