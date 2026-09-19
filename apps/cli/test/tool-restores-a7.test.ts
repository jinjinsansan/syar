/**
 * ★**`verify-a7.mjs` の控え — ★これを失うと道具が 1 本も動かなくなる**
 * （★**SB-6** ③・`TOOL-SNAPSHOT-IN-MEMORY`・2026-09-19）
 *
 * 【🔴 ★なぜこれがいちばん危ないか】
 *   ★`verify-a7.mjs` は ★**`app_environment` を丸ごと消します**（★A-7 の門が働くことを確かめるため）。
 *   ★元の宣言は ★**メモリの `original` だけ**でした。
 *
 *   ★`assertEnvironmentMatches` は宣言が無ければ ★**投げます**
 *   （`apps/worker/src/env.ts:78`・★既定値で救いません。★それは正しい設計です）。
 *   → ★★**殺されたら、★ワーカーも、★状態を変える道具 全部も、★起動できなくなります**（fail-closed・R-27）。
 *   ⚠️ ★シグナルは捕まえていますが、★**SIGKILL・電源断・OOM では走りません。**
 *
 * 【⚠️ 🔴 ★この検査が見ないもの — ★実 DB で確かめていません】
 *   ★偽の client です。★分かるのは ★**控えが外に在り・★戻す手が呼ばれ・★1 文で・★冪等**まで。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { takeSnapshot, readSnapshot, dropSnapshot } from '../../../tools/lib/snapshot-file.mjs';
import { RESTORE_A7, TOOL_RESTORES } from '../../../tools/lib/tool-restores.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const NAME = RESTORE_A7.snapshot;

function fakeClient(rowCount = 1) {
  const calls: { sql: string; params: readonly unknown[] }[] = [];
  return {
    calls,
    query(sql: string, params: readonly unknown[]) {
      calls.push({ sql, params });
      return Promise.resolve({ rowCount });
    },
  };
}

const src = () => execFileSync(process.execPath, [
  '-e', `process.stdout.write(require('node:fs').readFileSync('tools/verify-a7.mjs','utf8'))`,
], { cwd: ROOT, encoding: 'utf8' });

afterEach(() => { try { dropSnapshot(NAME); } catch { /* 片付け */ } });

describe('★SB-6 ③: verify-a7.mjs の控え（★失うと道具が全部 止まる）', () => {
  it('🔴 ★殺された次の実行が、★控えから宣言を戻す', async () => {
    takeSnapshot(NAME, { environment: 'staging' });
    const left = readSnapshot<{ environment: string | null }>(NAME);
    const c = fakeClient();
    const { rows } = await RESTORE_A7.restore(c, left!.data);

    expect(rows).toBe(1);
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0]!.params).toEqual(['staging']);
  });

  it('🔴 ★戻しは**1 文**（★`delete` → `insert` の 2 文にしない）', async () => {
    /**
     * 🔴 ★2 文だと、★**間で死んだときに `app_environment` が空**になります。
     *   ★空 ＝ ★**次から何も起動できない**。★この道具ではそこが致命的です。
     */
    const c = fakeClient();
    await RESTORE_A7.restore(c, { environment: 'staging' });
    expect(c.calls, '🔴 ★戻しが 2 文に分かれています').toHaveLength(1);
    expect(c.calls[0]!.sql).toMatch(/on conflict/);
    expect(c.calls[0]!.sql, '🔴 ★`delete` が混ざっています').not.toMatch(/delete/i);
  });

  it('⚠️ ★元から宣言が無かったなら、★消したままが正しい', async () => {
    const c = fakeClient(0);
    const { rows } = await RESTORE_A7.restore(c, { environment: null });
    expect(rows).toBe(0);
    expect(c.calls[0]!.sql).toMatch(/delete from app_environment/);
  });

  it('★冪等: ★同じ値で 2 回 呼んでも同じ文', async () => {
    const a = fakeClient(1); const b = fakeClient(1);
    await RESTORE_A7.restore(a, { environment: 'staging' });
    await RESTORE_A7.restore(b, { environment: 'staging' });
    expect(a.calls[0]!.sql).toBe(b.calls[0]!.sql);
  });

  it('🔴 ★道具の中で、★**残り物を戻すのが「元の宣言を読む」より前**', () => {
    /**
     * 🔴 ★これが順番の急所です。
     *   ★前回が殺されていると `app_environment` は空で、★そのまま読むと `original = null`。
     *   → ★**「元から無かった」と誤認して、★空のまま確定させます。**
     */
    const s = src();
    const restoreLeft = s.indexOf('RESTORE_A7.restore(c, leftA7.data)');
    const readOriginal = s.indexOf('const original = (await c.query(');
    const takeSnap = s.indexOf('takeSnapshot(RESTORE_A7.snapshot');
    const destroy = s.indexOf('await c.query(`delete from app_environment`);');

    expect(restoreLeft, '★残り物の復元が無い').toBeGreaterThan(-1);
    expect(readOriginal, '★元の宣言を読む行が無い').toBeGreaterThan(-1);
    expect(restoreLeft, '🔴 ★元の宣言を読む前に残り物を戻していない').toBeLessThan(readOriginal);

    expect(takeSnap, '★takeSnapshot が無い').toBeGreaterThan(-1);
    expect(destroy, '★壊す行が無い').toBeGreaterThan(-1);
    expect(takeSnap, '🔴 ★控えが「壊す」より後にある').toBeLessThan(destroy);
    expect(readOriginal, '★控えは元の宣言を読んだ後で取る').toBeLessThan(takeSnap);
  });

  it('⚠️ ★控えを捨てるのは、★戻ったことを確かめた後', () => {
    const s = src();
    expect(s).toMatch(/if \(back === original\) \{\s*\n\s*dropSnapshot\(RESTORE_A7\.snapshot\);/);
  });

  it('★表に載っている', () => {
    expect(TOOL_RESTORES['verify-a7.mjs']).toBe(RESTORE_A7);
    expect(RESTORE_A7.snapshot).toBe('verify-a7');
  });
});
