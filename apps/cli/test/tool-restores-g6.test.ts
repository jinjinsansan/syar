/**
 * ★**`verify-g6.mjs` の控えが、★本当に戻る**（★**SB-6**・`TOOL-SNAPSHOT-IN-MEMORY` ①/7・2026-09-19）
 *
 * 【🔴 ★何を守るか】
 *   ★`verify-g6.mjs` は ★**NPC 馬を 1 頭 プレイヤー所有に付け替え**、★終わりに戻します。
 *   ★`horses_owner_xor_npc` があるので、★`owner_id` を入れた時点で
 *   ★**`npc_stable_id` は行から消えます**。★元の厩舎番号は ★**メモリの中だけ**でした。
 *   ★2026-09-19、★同型の道具（`verify-v11-synthetic.mjs`）が `timeout` の SIGTERM で殺され、
 *   ★**馬 9 頭の所属厩舎を永久に失いました。**
 *
 * 【⚠️ 🔴 ★この検査が見ないもの — ★**実 DB で確かめていません**】
 *   ★渡しているのは ★**偽の client** です。★分かるのは
 *     ★① ★控えが ★**プロセスの外**に落ちていること
 *     ★② ★次の実行が ★**それを読んで戻す手を呼ぶ**こと
 *     ★③ ★その手が ★**冪等**であること
 *   ★分から**ない**のは ★**SQL の文面が staging で正しく当たるか**です。
 *   → ★確かめるには staging の馬を 1 頭 動かす必要があり、★それ自体が
 *     ★`STABLE-1-SKEW` を測っている母集団を動かします。★**やりません。**
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { takeSnapshot, readSnapshot, dropSnapshot } from '../../../tools/lib/snapshot-file.mjs';
import { RESTORE_G6, TOOL_RESTORES } from '../../../tools/lib/tool-restores.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const NAME = RESTORE_G6.snapshot;

/** ★偽の client。★**何を投げたか**を残します（★`rowCount` は当たった行数のつもり） */
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

afterEach(() => { try { dropSnapshot(NAME); } catch { /* 片付け */ } });

describe('★SB-6 ①/7: verify-g6.mjs の控え', () => {
  it('🔴 ★殺された次の実行が、★控えを読んで**元の厩舎に戻す**', async () => {
    /**
     * ★筋書き: ★道具が厩舎 7 の馬を控えてから付け替え、★**そこで死ぬ**。
     *   ★`dropSnapshot` は走っていないので、★控えはファイルに残ります。
     */
    takeSnapshot(NAME, { horseId: 'h-abc', npcStableId: 7, uid: 'u-g6' });

    // ★次の実行が始まる
    const left = readSnapshot<{ horseId: string; npcStableId: number; uid: string }>(NAME);
    expect(left, '★控えが読めない（★前の実行の跡が消えている）').not.toBe(null);

    const c = fakeClient();
    const { rows } = await RESTORE_G6.restore(c, left!.data);

    expect(rows, '★戻した行数を数えていない（★TL-1 の restores）').toBe(1);
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0]!.params).toEqual(['h-abc', 7]);
    expect(c.calls[0]!.sql).toMatch(/update horses/);
  });

  it('🔴 ★`owner_id` を外すのと `npc_stable_id` を戻すのは**同じ 1 文**', async () => {
    /**
     * 🔴 ★2 文に分けると、★間で死んだときに ★**両方 null** の行ができ、
     *   ★`horses_owner_xor_npc` に当たって ★**次の実行が準備で落ちます**。
     *   ★ここは「1 回の `query` で両方」を留めるためだけの検査です。
     */
    const c = fakeClient();
    await RESTORE_G6.restore(c, { horseId: 'h-abc', npcStableId: 7, uid: 'u-g6' });

    expect(c.calls, '★戻しが 2 文に分かれています').toHaveLength(1);
    const sql = c.calls[0]!.sql;
    expect(sql).toMatch(/owner_id\s*=\s*null/);
    expect(sql).toMatch(/npc_stable_id\s*=\s*\$2/);
  });

  it('🔴 ★冪等: ★一部だけ戻っていても、★2 回目が異常にならない', async () => {
    /**
     * ★殺され方によっては ★**もう戻っている**ことがあります。
     *   ★そのとき当たる行は 0 件で、★それは ★**異常ではありません**。
     */
    const already = fakeClient(0);
    const { rows } = await RESTORE_G6.restore(already, { horseId: 'h-abc', npcStableId: 7, uid: 'u-g6' });
    expect(rows, '★0 行を異常にしていないか').toBe(0);

    // ★同じ手をもう一度呼んでも、★投げる文は同じ（★状態を持っていない）
    const again = fakeClient(0);
    await RESTORE_G6.restore(again, { horseId: 'h-abc', npcStableId: 7, uid: 'u-g6' });
    expect(again.calls[0]!.sql).toBe(already.calls[0]!.sql);
  });

  it('🔴 ★控えは**別のプロセスから**読める（★これが「メモリでない」の意味）', () => {
    /**
     * 🔴 ★同じプロセスで読めても意味がありません — ★メモリでも読めます。
     *   ★`TOOL-SNAPSHOT-IN-MEMORY` が指しているのは、★まさにそこです。
     */
    takeSnapshot(NAME, { horseId: 'h-xyz', npcStableId: 11, uid: 'u-g6' });
    const out = execFileSync(process.execPath, [
      '-e',
      `const { readSnapshot } = await import('./tools/lib/snapshot-file.mjs');`
        + `process.stdout.write(String(readSnapshot('${NAME}').data.npcStableId));`,
    ], { cwd: ROOT, encoding: 'utf8', timeout: 20_000 });
    expect(out, '★別のプロセスから控えが読めていない').toBe('11');
  });

  it('⚠️ ★`verify-g6.mjs` の**中**で、★控えが付け替えの**前**に取られている', () => {
    /**
     * 🔴 ★**順番がこの道具の安全の全部**です。
     *   ★変えてから控えると、★間で殺されたときに ★**控えが無い**。
     *   ★`snapshot-file.d.mts` にも「変える前に呼ぶこと」と書いてありますが、
     *   ★註記は守らせません（★**NT-2**）。★ここで位置を留めます。
     */
    const src = execFileSync(process.execPath, [
      '-e', `process.stdout.write(require('node:fs').readFileSync('tools/verify-g6.mjs','utf8'))`,
    ], { cwd: ROOT, encoding: 'utf8' });

    const take = src.indexOf('takeSnapshot(RESTORE_G6.snapshot');
    const update = src.indexOf('set owner_id = $1, npc_stable_id = null');
    const restoreLeftover = src.indexOf('RESTORE_G6.restore(c, left.data)');
    const clearOwner = src.indexOf("update horses set owner_id = null where owner_id = $1");

    expect(take, '★takeSnapshot が見つからない').toBeGreaterThan(-1);
    expect(update, '★付け替えの文が見つからない').toBeGreaterThan(-1);
    expect(take, '🔴 ★控えが付け替えより**後**にある').toBeLessThan(update);

    expect(restoreLeftover, '★残り物の復元が見つからない').toBeGreaterThan(-1);
    expect(clearOwner, '★準備の owner_id 消しが見つからない').toBeGreaterThan(-1);
    expect(restoreLeftover, '🔴 ★残り物を戻す前に `owner_id` を外している（★両方 null になる）')
      .toBeLessThan(clearOwner);
  });

  it('⚠️ ★控えを捨てるのは、★戻ったことを数えた**後**', () => {
    const src = execFileSync(process.execPath, [
      '-e', `process.stdout.write(require('node:fs').readFileSync('tools/verify-g6.mjs','utf8'))`,
    ], { cwd: ROOT, encoding: 'utf8' });

    // ★`stableOk` を作ってから、★その真偽で捨てるかどうかを決めている
    const stableOk = src.indexOf('const stableOk =');
    const guardedDrop = src.indexOf('if (stableOk) {');
    expect(stableOk).toBeGreaterThan(-1);
    expect(guardedDrop, '🔴 ★`stableOk` を見ずに控えを捨てている').toBeGreaterThan(stableOk);
  });

  it('★表に載っている（★次の 6 本を足す場所）', () => {
    expect(TOOL_RESTORES['verify-g6.mjs']).toBe(RESTORE_G6);
    expect(RESTORE_G6.tool).toBe('verify-g6.mjs');
    // ★控えの名前は道具の名前から拡張子を取ったもの（★人が探せるように）
    expect(RESTORE_G6.snapshot).toBe('verify-g6');
  });

  it('★片付け: ★検査が控えを置き去りにしない（★SH-1‴）', () => {
    takeSnapshot(NAME, { horseId: 'h', npcStableId: 1, uid: 'u' });
    dropSnapshot(NAME);
    expect(existsSync(path.join(ROOT, 'tmp/snapshots', `${NAME}.json`))).toBe(false);
  });
});
