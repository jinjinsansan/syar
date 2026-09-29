/**
 * ★**小窓は 本編だけ**（★2026-09-29・オーナー「発走時刻に 小窓も本格的な画面も 両方とも同じものが流れないとおかしい」・レビュー側が受理）
 *
 * 【★見ている壊れ方】
 *   ① ★簡易版の走行（side-v8 の横並び・RaceRun / RunningHorse）が ★どこかの面に戻る（★中身が面ごとに違う）
 *   ② ★「大」の面で 本編を読まない（★本編を流す面が表の一部だけ）
 *   ③ ★先読みが無い（★発走時刻に 本編の用意が始まり 途中から参加になる）
 *   ④ ★先読みしたレースを ★前のレースの窓で閉じる
 *   ⑤ ★本編の時計が 開いた時刻から始まる（★小窓と全画面で 場面がずれる）
 * ⚠️ ★「同じ場面が出ている」ことの実測は ★本番で 2 つの画面を同時に開いて確かめる（★この網は配線だけ）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { STRIP_EMBED_ROUTES, STRIP_SIZE_BY_ROUTE } from '../../web/src/components/uma/race-strip-sizes';

const ROOT = path.resolve(__dirname, '../../..');
const STRIP = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/race-strip.tsx'), 'utf8');
const PAGE = readFileSync(path.join(ROOT, 'apps/web/src/app/race/page.tsx'), 'utf8');

describe('★小窓は 本編だけ（同じ時計・同じ場面）', () => {
  it('🔴 ① 簡易版の走行は どこにも無い（★部品ごと消した）', () => {
    expect(STRIP).not.toMatch(/RaceRun|RunningHorse|RUN_FRAMES|horse-jockey-side-v8-pose/);
    expect(existsSync(path.join(ROOT, 'apps/web/src/components/uma/race-camera.ts'))).toBe(false);
    /** ★「大」の箱は 本編が流れているときだけ */
    expect(STRIP).toContain('const big = size === \'big\' && embedsHere && embedLive;');
  });

  it('🔴 ② 「大」の面は すべて本編（★表の 1 か所から導く）', () => {
    const big = Object.entries(STRIP_SIZE_BY_ROUTE).filter(([, s]) => s === 'big').map(([r]) => r).sort();
    expect(big.length).toBeGreaterThan(2);
    expect([...STRIP_EMBED_ROUTES].sort()).toEqual(big);
  });

  it('🔴 ③ 次のレースを 発走の STRIP_EMBED_LEAD_SEC 秒前から開く（先読み）', () => {
    expect(STRIP).toContain('&& nextStartMs > nowMs && nextStartMs - nowMs <= STRIP_EMBED_LEAD_SEC * 1000;');
    expect(STRIP).toContain('const target = preOpen && nextId !== null && nextStartAt !== null ? { id: nextId, startAt: nextStartAt }');
    /** ★本編は 発走前なら待つ（★エラーにしない・1 秒おきに読み直す） */
    expect(PAGE).toContain('if (e instanceof RaceNotStartedError) {');
    expect(PAGE).toContain("retry = window.setTimeout(attempt, left <= 60_000 ? 1_000 : 10_000);");
  });

  it('🔴 ④ 開いたレースの窓で あきらめる（★前のレースの窓で 先読みを閉じない）', () => {
    expect(STRIP).toContain('const embedWindowOver = embed === null || nowMs === null ? false : replayWindowOver(embed.startAt, nowMs);');
    expect(STRIP).toContain('}, [embedWindowOver]);');
  });

  it('🔴 ⑤ 本編は 流している間 「いま − 発走時刻」の場面から（★時計を 1 本に）', () => {
    expect(PAGE).toContain('const elapsed = (new Date().getTime() - real.scheduledAtMs) / 1000;');
    expect(PAGE).toContain('if (elapsed > 0 && elapsed < total) dRef.current = elapsed;');
  });
});
