/**
 * ★**画面と道具が同じ経路で表示時間を決めているか**を留める（メタテスト）
 *
 * 【なぜ要るか（2026-08-21 の実害）】
 *   レースを 30 秒にする指示を受け、`targetDisplaySec` を 45→30 に変えました。
 *   計測道具は `ratesForTarget(knots, targetDisplaySec(距離))` を通しており **29.9 秒**と出ました。
 *   ★ところが **Web 画面は `DEFAULT_PHASE_RATES`（固定値）** を使っており、
 *     `targetDisplaySec` を**一度も通していませんでした。**
 *     画面は **80.3 秒**のまま。目標を何秒にしても**画面は変わりません**でした。
 *
 *   ★オーナー指摘「**不合格シーンは除外されていますが尺は 100 秒ありますよ？**」で発覚。
 *   ★**道具と画面が別の経路を測っていた**のは、この日 3 度目です
 *     （① 監査道具が古い素材を読む ② 監査道具が横視点用の背景を貼る ③ 今回）。
 *     **同じ形の失敗なので、テストで留めます。**
 *
 * 【何を見るか】
 *   `DEFAULT_PHASE_RATES` は**固定の送り速さ**なので、これを直に `timeWarpFor` に渡すと
 *   目標時間が効きません。**本番の経路と、それを検証する道具は、渡してはいけません。**
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

/**
 * ★免除。**旧固定2D（legacy）専用の道具だけ**が対象です。
 *   V2（本番）の映像を扱うものは免除しません。
 */
const EXEMPT: ReadonlyMap<string, string> = new Map([
  ['tools/shot.mjs', '旧固定2D（legacy）の静止画専用。V2 の表示時間とは無関係'],
  ['tools/diag-speed.mjs', '送り速さそのものを比較する診断。固定値を渡すのが目的'],
]);

function filesToScan(): string[] {
  const out: string[] = ['apps/web/src/app/race/page.tsx'];
  for (const f of readdirSync(path.join(ROOT, 'tools'))) {
    if (f.endsWith('.mjs')) out.push(`tools/${f}`);
  }
  return out;
}

describe('★表示時間の経路（メタテスト）', () => {
  it('★★`timeWarpFor(..., DEFAULT_PHASE_RATES)` を本番経路で使っていない', () => {
    const offenders: string[] = [];
    for (const rel of filesToScan()) {
      if (EXEMPT.has(rel)) continue;
      let src: string;
      try { src = readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
      // ★コメント中の言及は拾わない。**実際に呼んでいる**形だけを見る
      const calls = src.match(/timeWarpFor\s*\([^)]*DEFAULT_PHASE_RATES/g) ?? [];
      if (calls.length > 0) offenders.push(`${rel}（${calls.length} 箇所）`);
    }
    expect(offenders, '固定の送り速さを渡すと `targetDisplaySec` が効きません').toEqual([]);
  });

  /**
   * ★**画面と監査道具は、同じ 1 つの関数で方針を選ぶこと**（★2026-09-09・裁定 §3 Q-1a-1）
   *
   * 【なぜ関数名を数えるだけでは足りないか】
   *   ★以前ここは ★`page.tsx` に `ratesForTarget(` があることだけを見ていました。
   *   ★ところが 2026-09-09、★画面と道具の両方が
   *   ★`(LEGACY_MOTION ? ratesForTarget : readableRaceRates)(...)` という
   *   ★**同じ三項演算子を 2 か所に写して**持つ形になりました。
   *   ★どちらも `ratesForTarget` を含むので ★**古い検定は素通り**します。
   *   ★片方だけ直せば静かにずれます（★台帳 B-6・★2026-08-21 の実害と同じ形）。
   *
   * → ★**呼び出し側は送り速さを自分で組まない**ことを見ます。
   *   ★時計は `raceClockFor` から受け取り、★`timeWarpFor` / `ratesForPolicy` /
   *   ★`ratesForTarget` / `readableRaceRates` を ★**呼び出し側では使わない**こと。
   *
   * ⚠️ ★これは文字列の検査なので、★**振る舞いの証拠にはなりません。**
   *    ★名前だけ残して戻り値を捨てる壊し方は ★構文木で見ます
   *    （★`apps/cli/test/race-clock-wiring.test.ts`・★F-3）。
   *    ★新版の振る舞いは ★`packages/render/test/readable-rates.test.ts` で見ます。
   */
  const PACE_CALLERS: readonly string[] = [
    'apps/web/src/app/race/page.tsx',
    'tools/lib/race-audit-build.mjs',
  ];

  it('★★画面と監査道具は、同じ `raceClockFor` を通っている', () => {
    for (const rel of PACE_CALLERS) {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src, `${rel} が共有の時計部品を通っていません`).toMatch(/raceClockFor\s*\(/);
    }
  });

  it('★★方針の分岐が呼び出し側に写されていない（1 か所であること）', () => {
    const offenders: string[] = [];
    for (const rel of PACE_CALLERS) {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      /**
       * ★コメント中の言及は拾いません。★**実際に呼んでいる**形だけを見ます
       *   （★注記でこれらの名前に触れるのは、経緯を残すために必要です）。
       */
      /**
       * ⚠️ ★**`名前(` という形で探さないこと**（★2026-09-09・R-22 で判明）。
       *    ★実際に壊れていた形は ★`(LEGACY_MOTION ? ratesForTarget : readableRaceRates)(...)` で、
       *    ★`ratesForTarget` の直後は `(` ではなく ` : ` です。
       *    ★`名前\s*\(` で書いた最初の版は、★**この行を 0 件と数えました**
       *    （★直前の版 `2b4a3a8` に当てて確かめています）。
       * → ★**名前が本文に出てくること自体**を違反とします。
       */
      const lines = src.split('\n').filter((l) => {
        const code = l.replace(/^\s*(\*|\/\/).*$/, '');
        return /(?<![.\w])(ratesForTarget|readableRaceRates|ratesForPolicy|timeWarpFor)(?![\w])/.test(code);
      });
      if (lines.length > 0) offenders.push(`${rel}（${lines.length} 行: ${lines.map((l) => l.trim()).join(' / ')}）`);
    }
    expect(
      offenders,
      '★時計は `raceClockFor` から受け取ること（★送り速さを自分で組まない）',
    ).toEqual([]);
  });

  it('★免除は理由つきで、対象のファイルが実在する', () => {
    for (const [rel, why] of EXEMPT) {
      expect(why.length, `${rel} の免除理由が短すぎます`).toBeGreaterThan(10);
      expect(() => readFileSync(path.join(ROOT, rel), 'utf8')).not.toThrow();
    }
  });
});
