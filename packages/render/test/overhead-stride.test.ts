/**
 * ★**第4コーナーの俯瞰だけ、見た目の完歩を長くしていること**（2026-08-25・オーナー判断）
 *
 * オーナー評「**俯瞰で馬がぴょんぴょんする。絵は良いが走って見えない**」への対処です。
 * 実測（`REPORT_P4_2D_OVERHEAD_STRIDE_20260825.md`）: `fourth-corner-high` は
 * 1 完歩で足元の地面に対して **1.82 馬身**しか進まず、実馬（2.92 馬身）の **62%**。
 * 見た目の完歩を 7m → 9m にすると **77%**（`first-corner-front` と同水準）になります。
 *
 * ★ここで固定するのは 3 つです。
 *   ① その俯瞰だけ 9m で、他のショットは実馬どおり 7m のまま
 *   ② 脚がゆっくり回る向きに効いている（速くなっていない）
 *   ③ ★**採用の前提**＝この俯瞰の前後がハードカットであること
 *
 * ⚠️ ★③が本体です。前後がディゾルブに変わると、**重なっている 0.28 秒の間に
 *    脚の速さが変わるのが見えてしまいます。** 台本を触ったときにここが鳴ります。
 *
 * ⚠️ ★**製品コードだけで再現できる検査に限ります**（`script-v5.test.ts` と同じ方針）。
 *    未追跡の測定ツールや `out/` の動画には依存しません。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BROADCAST_STRIDE_M, BROADCAST_STRIDE_M_BY_SHOT, broadcastStrideMFor,
  SCRIPT_V5, FLASH_INTO, broadcastV2ShotById, type BroadcastV2ShotId,
} from '../src/index.js';

const PAGE = path.resolve('apps/web/src/app/race/page.tsx');
const OVERHEAD: BroadcastV2ShotId = 'fourth-corner-high';

/** ★その距離を走ったときに脚が何回まわるか（`page.tsx` の `phaseOf` と同じ式） */
const cyclesOver = (shotId: BroadcastV2ShotId, meters: number): number =>
  meters / broadcastStrideMFor(shotId);

describe('俯瞰だけ見た目の完歩を長くする', () => {
  it('★`fourth-corner-high` は 9m、他の全ショットは実馬どおり 7m', () => {
    expect(broadcastStrideMFor(OVERHEAD)).toBe(9);
    for (const { id } of SCRIPT_V5) {
      if (id === OVERHEAD) continue;
      expect(broadcastStrideMFor(id)).toBe(BROADCAST_STRIDE_M);
    }
    // ★例外は 1 つだけ。増えたらここが鳴る（増やすならオーナー判断が要る）
    expect([...BROADCAST_STRIDE_M_BY_SHOT.keys()]).toEqual([OVERHEAD]);
  });

  it('★脚は「ゆっくり」側にしか動かない', () => {
    // 同じ距離を走ったとき、俯瞰のほうが脚の回転が少ない＝遅い
    expect(cyclesOver(OVERHEAD, 100)).toBeLessThan(cyclesOver('side-drive', 100));
    // 実馬より速くはしない（7m より短い完歩を入れない）
    for (const stride of BROADCAST_STRIDE_M_BY_SHOT.values()) {
      expect(stride).toBeGreaterThanOrEqual(BROADCAST_STRIDE_M);
    }
  });

  it('★採用の前提: この俯瞰の前後はハードカット（脚の速さの変化が切替に紛れる）', () => {
    /**
     * ★`page.tsx` のディゾルブ条件は `FLASH_INTO.has(to) || sameFamily(from, to)`
     *   （`sameFamily` は `view` の一致）。どちらも成り立たなければ重ねずに切り替わります。
     */
    const dissolves = (from: BroadcastV2ShotId, to: BroadcastV2ShotId): boolean =>
      FLASH_INTO.has(to) || broadcastV2ShotById(from).view === broadcastV2ShotById(to).view;

    const index = SCRIPT_V5.findIndex((cut) => cut.id === OVERHEAD);
    expect(index).toBeGreaterThan(0);
    expect(index).toBeLessThan(SCRIPT_V5.length - 1);

    const before = SCRIPT_V5[index - 1]?.id;
    const after = SCRIPT_V5[index + 1]?.id;
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    expect(dissolves(before as BroadcastV2ShotId, OVERHEAD)).toBe(false);
    expect(dissolves(OVERHEAD, after as BroadcastV2ShotId)).toBe(false);
  });

  it('★画面は完歩を自分で持たず、パッケージの関数から引いている（R-30）', () => {
    const page = readFileSync(PAGE, 'utf8');
    expect(page).toContain('broadcastStrideMFor(sceneToDraw.shot.id)');
    /**
     * ★`scene`（＝いまのショット）から引くと、ディゾルブで前のショットを描く 0.28 秒だけ
     *   前の絵の脚が別の速さになります。だから `sceneToDraw` から引くこと。
     */
    expect(page).not.toContain('broadcastStrideMFor(scene.shot.id)');
    // ★画面側に完歩の数字を書き戻していないこと
    expect(page).not.toMatch(/const\s+STRIDE_M\s*=\s*\d/);
  });
});
