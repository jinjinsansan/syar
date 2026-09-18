/**
 * ★**V ゲートの集団と、配備されるプールの関係**（★**PO-5**・2026-09-19）
 *   ★裁定 `REVIEW_POOL_SIZE_VERDICT_20260919.md` PO-5
 *
 * 【★何を守るか】
 *   ★**同じである必要はありません。★違うと分かった上で使う**必要があります。
 *   → ★**橋（`--pool`）が消えていないこと**と、★**関係が書いてあること**を見ます。
 *   🔴 ★橋が消えると、★**本番の集団で測り直す手段が無くなります**（★そして誰も気づきません）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { POOL_MARES, POOL_GENERATIONS } from '../src/measurement.js';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string): string => readFileSync(path.join(ROOT, p), 'utf8');

describe('★PO-5: V ゲートと配備プールの関係', () => {
  it('★V ゲートの既定は合成集団（★配備の母数ではない）', () => {
    expect(POOL_MARES).toBe(400);
    expect(POOL_GENERATIONS).toBe(40);
  });

  it('🔴 ★橋（`--pool`）が残っている', () => {
    /**
     * ⚠️ ★これが ★**唯一の突き合わせの手段**です。
     *    ★消えると「V ゲートは本番の集団を説明していない」が ★**確かめられなくなります**。
     */
    const src = read('apps/cli/src/verify-race.ts');
    expect(src, '★本番の集団を食わせる口が消えた').toMatch(/--pool/);
    expect(src, '★ファイルから読む経路が消えた').toMatch(/indexOf\('--pool'\)/);
  });

  it('🔴 ★関係が書いてある（★数つき）', () => {
    /**
     * ★PO-5 は「1 行で書いてください」。★**書いてあることを検査で押さえます** —
     * ★書かないと、★**「同じだと思っていた」に戻ります**（★今日 PO-4 と MK-1 で 2 回起きた形）。
     */
    const m = read('apps/cli/src/measurement.ts');
    expect(m, '★PO-5 の記述が無い').toMatch(/PO-5/);
    expect(m, '★配備側の数が書かれていない').toMatch(/4,389/);
    expect(m, '★V ゲート側の数が書かれていない').toMatch(/400 頭/);
    expect(m, '★橋の名前が書かれていない').toMatch(/--pool/);
  });

  it('🔴 ★配備側の上限が、書いてある数と同じ', () => {
    /** ⚠️ ★註記の数と実装がずれたら、★**註記のほうが嘘になります** */
    const repo = read('apps/worker/src/horse-repo.ts');
    expect(repo, '★上限の定数が無い').toMatch(/export const RACEABLE_POOL_LIMIT = 3000/);
    expect(read('apps/cli/src/measurement.ts'), '★上限の名前で参照していない')
      .toMatch(/RACEABLE_POOL_LIMIT/);
  });
});
