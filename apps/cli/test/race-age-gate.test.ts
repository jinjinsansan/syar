/**
 * ★**出走の齢の門**（★2026-09-30・正典 §7.1「出走できるのは 104〜260 週」・裁定 `REVIEW_POOL_DRAIN_20260930.md`）。
 *
 * 【★見ている壊れ方】
 *   ★NPC の出走プール（`ACTIVE_WHERE`）と ★利用者の登録（`enter_race`）の ★どちらかが 齢を見なくなる
 *   （★配合で生まれた 104 週未満の仔が 出走表に載る）。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LIFECYCLE_WEEKS } from '@star/scheduler';
import { ACTIVE_WHERE, RACEABLE_AGE_WHERE } from '../../worker/src/horse-repo';

const MIG = path.resolve(__dirname, '../../../db/migrations');

describe('★出走の齢の門（104 週から）', () => {
  it('🔴 NPC の出走プールは 齢 104 週以上だけ（★数は LIFECYCLE_WEEKS から）', () => {
    expect(LIFECYCLE_WEEKS.raceableFrom).toBe(104);
    expect(RACEABLE_AGE_WHERE).toContain(`(select game_week from world_state where id) - ${LIFECYCLE_WEEKS.raceableFrom}`);
    expect(RACEABLE_AGE_WHERE).toContain('birth_week is not null');
    expect(ACTIVE_WHERE, '★プールの述語に 齢の門が入っていない').toContain(RACEABLE_AGE_WHERE);
  });

  it('🔴 enter_race の最後の定義が 齢を見る（★レースの週 − 生まれた週 < 104 を拒む）', () => {
    const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
    const last = files.filter((f) => /create\s+or\s+replace\s+function\s+public\.enter_race\s*\(/i.test(readFileSync(path.join(MIG, f), 'utf8'))).at(-1)!;
    const body = readFileSync(path.join(MIG, last), 'utf8');
    expect(body).toMatch(/coalesce\(v_race\.game_week, \(select game_week from world_state where id\)\) - h\.birth_week < 104/);
    expect(body).toContain("まだ出走できる年齢ではありません");
    /** ★判定は レースを読んだ後（★`v_race` を使うので） */
    expect(body.indexOf('まだ出走できる年齢ではありません')).toBeGreaterThan(body.indexOf('select * into v_race from races where id = p_race_id;'));
  });
});
