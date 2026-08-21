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

  it('★Web 画面は目標時間から送り速さを逆算している', () => {
    const src = readFileSync(path.join(ROOT, 'apps/web/src/app/race/page.tsx'), 'utf8');
    expect(src).toMatch(/ratesForTarget\s*\(/);
    expect(src).toMatch(/targetDisplaySec\s*\(/);
  });

  it('★免除は理由つきで、対象のファイルが実在する', () => {
    for (const [rel, why] of EXEMPT) {
      expect(why.length, `${rel} の免除理由が短すぎます`).toBeGreaterThan(10);
      expect(() => readFileSync(path.join(ROOT, rel), 'utf8')).not.toThrow();
    }
  });
});
