/**
 * ★**既存ショット適性ゲートのテスト**（指示書 §15 の 11 項目）
 *
 * ⚠️ ★測定 JSON が無いときは skip せず**落とします**（§15-11 / R-21）。
 * ⚠️ ★ここで採否は決めません。**ゲートが成立しているか**だけを見ます。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('out/2d-existing-shot-gate');

function load(name: string): Record<string, any> {
  const f = path.join(OUT, name);
  if (!existsSync(f)) throw new Error(`★${name} が無い。先に tools/audit-existing-shot-gate.mjs を走らせること`);
  return JSON.parse(readFileSync(f, 'utf8')) as Record<string, any>;
}

const M = load('measurements.json');

const SEEDS = [42, 332, 474, 14];
const SIDE = ['side-close', 'side-low', 'homestretch-side', 'backstretch-side'];
const HIGH = ['second-corner-high', 'fourth-corner-high', 'aerial'];
const BASELINE = ['side-drive', 'homestretch-front', 'fourth-corner-front', 'finish-line'];

describe('既存ショット適性ゲート', () => {
  /* ① 4 seed すべてを使う */
  it('① 4 seed すべてを測っている', () => {
    expect(M.seeds.map((s: { seed: number }) => s.seed).sort((a: number, b: number) => a - b))
      .toEqual([...SEEDS].sort((a, b) => a - b));
    for (const s of M.seeds) expect(s.rows.length, `seed ${s.seed}`).toBeGreaterThan(0);
  });

  /* ② seed 分類地点が 1280m */
  it('② 分類地点が 1280m（1520m の finish 判定と混同していない）', () => {
    expect(M.classifyLeaderM).toBe(1280);
    for (const s of M.seeds) {
      expect(s.classification.leaderM, `seed ${s.seed}`).toBe(1280);
      expect(['contest', 'solo']).toContain(s.classification.style);
    }
    // ★指示書のラベルどおりであること
    const at = (seed: number): string =>
      M.seeds.find((s: { seed: number }) => s.seed === seed).classification.style;
    expect(at(332), '接戦代表').toBe('contest');
    expect(at(474), '独走代表').toBe('solo');
  });

  /* ③ 全対象ショットを撮る ＋ ④ 基準ショットも撮る */
  it('③④ 候補ショットも基準ショットも全 seed・全地点で測っている', () => {
    const points = M.points.map((p: { key: string }) => p.key);
    expect(points.length).toBeGreaterThanOrEqual(7);
    for (const s of M.seeds) {
      for (const id of [...SIDE, ...HIGH, ...BASELINE]) {
        for (const pk of points) {
          const r = s.rows.find((x: { shotId: string; point: string }) => x.shotId === id && x.point === pk);
          expect(r, `seed ${s.seed} / ${id} / ${pk} が無い`).toBeDefined();
        }
      }
    }
  });

  /* ⑤ 通常 /race と同じ描画経路（＝同じ場面解決を通している） */
  it('⑤ 実画面と同じ場面解決を通し、絵は撮れていないと明示している', () => {
    // ★ショットは resolveBroadcastV2Scene が返したものを記録している
    for (const s of M.seeds) {
      for (const r of s.rows) {
        expect(typeof r.target, `${r.shotId} の target`).toBe('string');
        expect(typeof r.view, `${r.shotId} の view`).toBe('string');
      }
    }
    // ★★実画面の絵が撮れていないことを隠していない
    const readme = readFileSync(path.join(OUT, 'README.txt'), 'utf8');
    expect(readme).toContain('写真ではありません');
  });

  /* ⑥ ショット以外の入力を変更しない */
  it('⑥ 同じ地点なら、どのショットでも馬の実座標が同じ', () => {
    for (const s of M.seeds) {
      for (const p of M.points) {
        const rows = s.rows.filter((r: { point: string }) => r.point === p.key);
        if (rows.length < 2) continue;
        const base = rows[0];
        for (const r of rows) {
          // ★先頭距離・レース秒・進行率が同一＝入力レースを変えていない
          expect(r.leaderM, `seed ${s.seed} ${p.key} ${r.shotId} の先頭距離`).toBe(base.leaderM);
          expect(r.raceSec, `seed ${s.seed} ${p.key} ${r.shotId} のレース秒`).toBe(base.raceSec);
          expect(r.progressRatio).toBe(base.progressRatio);
          // ★12 頭ぶんの箱がある（頭数を減らしていない）
          expect(r.boxes.length).toBe(base.boxes.length);
        }
      }
    }
  });

  /* ⑦ 全画像が 1280×720 原寸（を前提に測っている） */
  it('⑦ 1280x720 を基準に測っている', () => {
    expect(M.viewport).toEqual({ W: 1280, H: 720 });
    for (const r of M.hudRects) {
      expect(r.x1).toBeLessThanOrEqual(1280);
      expect(r.y1).toBeLessThanOrEqual(720);
    }
  });

  /* ⑧ 測定不能値を 0 にしない */
  it('⑧ 測れない値を 0 にしていない', () => {
    let unknownBg = 0;
    let nullCenter = 0;
    for (const s of M.seeds) {
      for (const r of s.rows) {
        expect(r.backgroundOrGroundBreakage, '絵を見ないと分からない項目').toBe('unknown');
        unknownBg += 1;
        // ★target が pack のショットは「中央に来るべき対象」が定義できない → null
        if (r.target === 'pack') {
          expect(r.centerMatchesTarget, `${r.shotId} は pack なので null のはず`).toBeNull();
          nullCenter += 1;
        }
        // ★馬が 1 頭も見えない場面では馬高比を 0 と書かず null
        if (r.fullCount + r.partialCount === 0) expect(r.maxHeightRatio).toBeNull();
      }
    }
    expect(unknownBg).toBeGreaterThan(0);
    expect(nullCenter).toBeGreaterThan(0);
  });

  /* ⑨ 製品コードが無変更（監査ツールを参照していない） */
  it('⑨ 監査ツールが本番コードから参照されていない', async () => {
    const { globSync } = await import('node:fs');
    for (const root of [path.resolve('apps/web/src'), path.resolve('packages/render/src')]) {
      const hits = globSync('**/*.{ts,tsx}', { cwd: root })
        .map((f) => path.join(root, String(f)))
        .filter((f) => /existing-shot-gate|race-audit-build|lib\/cdp/.test(readFileSync(f, 'utf8')));
      expect(hits, root).toEqual([]);
    }
  });

  /* ⑩ 動画が存在しない */
  it('⑩ 動画を作っていない', async () => {
    const { globSync } = await import('node:fs');
    expect(globSync('**/*.{mp4,webm,gif}', { cwd: OUT })).toEqual([]);
  });

  /* ⑪ 測定 JSON がなければ失敗する ＋ 成果物がそろう */
  it('⑪ 必要な成果物がそろっている', () => {
    for (const f of ['measurements.json', 'README.txt', 'baseline-vs-candidates.png',
      'side-candidates-seed42.png', 'side-candidates-contest.png',
      'side-candidates-solo.png', 'side-candidates-boundary.png',
      'high-candidates-seed42.png', 'high-candidates-contest.png',
      'high-candidates-solo.png', 'high-candidates-boundary.png']) {
      expect(existsSync(path.join(OUT, f)), f).toBe(true);
    }
    // ★A/B/C の分類が全行に付いている
    for (const s of M.seeds) {
      for (const r of s.rows) {
        expect(['A', 'B', 'C', 'baseline'], `${r.shotId} の役`).toContain(r.role);
        expect(Array.isArray(r.reasons)).toBe(true);
        expect(r.reasons.length, `${r.shotId} に理由が無い`).toBeGreaterThan(0);
      }
    }
  });
});
