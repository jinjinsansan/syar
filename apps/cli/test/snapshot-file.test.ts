/**
 * ★**元に戻すための控えが、★プロセスの外に残る**（★**SB-6**・2026-09-19）
 *
 * 【🔴 ★何を守るか】
 *   ★2026-09-19、★`verify-v11-synthetic.mjs` が `timeout` の SIGTERM で殺され、
 *   ★控え（`STABLE_OF`）が ★**メモリごと消えて**、★**馬 9 頭の所属厩舎を永久に失いました。**
 *   ★`horses_owner_xor_npc` があるので、★`owner_id` を付けた時点で `npc_stable_id` は消えています。
 *
 * ⚠️ ★**シグナルを捕まえるだけでは足りません** — ★`SIGKILL`・電源断・OOM では走りません。
 *   → ★★**「プロセスが死ぬ」という、まさにその場合に、★メモリの控えは消えます。**
 *
 * 【⚠️ ★この検査が見ないもの】
 *   🔴 ★**本当に殺して確かめてはいません。** ★見ているのは
 *   ★**「別のプロセスから読めるか」＝ ★ファイルに落ちているか**までです。
 *   → ★`fsync` が効いているかは ★**電源を落とさないと確かめられません**。★**未検証**と書いておきます。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { takeSnapshot, readSnapshot, dropSnapshot, listSnapshots } from '../../../tools/lib/snapshot-file.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const NAME = 'test-snapshot-file';
const FILE = path.join(ROOT, 'tmp/snapshots', `${NAME}.json`);

afterEach(() => { try { dropSnapshot(NAME); } catch { /* 片付け */ } });

describe('★SB-6: 控えはプロセスの外に置く', () => {
  it('★取ったら、★ファイルとして在る', () => {
    takeSnapshot(NAME, { horses: [{ id: 'abc', npcStableId: 7 }] });
    expect(existsSync(FILE), '★控えのファイルが無い').toBe(true);
    const body = JSON.parse(readFileSync(FILE, 'utf8')) as { data: { horses: { id: string }[] } };
    expect(body.data.horses[0]?.id).toBe('abc');
  });

  it('🔴 ★**別のプロセスから読める**（★これが「外に置く」の意味）', () => {
    /**
     * 🔴 ★**同じプロセスで読めても意味がありません** — ★メモリでも読めます。
     *    ★**別のプロセスを立てて読ませる**のが、★この検査の全部です。
     */
    takeSnapshot(NAME, { marker: 'from-parent' });
    const out = execFileSync(process.execPath, [
      '-e',
      `const { readSnapshot } = await import('./tools/lib/snapshot-file.mjs');`
        + `process.stdout.write(String(readSnapshot('${NAME}').data.marker));`,
    ], { cwd: ROOT, encoding: 'utf8', timeout: 20_000 });
    expect(out, '★別のプロセスから読めていない').toBe('from-parent');
  });

  it('★前の実行が残した控えが在れば、★読める（★片付けずに死んだ跡）', () => {
    takeSnapshot(NAME, { left: true });
    expect(readSnapshot(NAME)).toMatchObject({ data: { left: true } });
    expect(listSnapshots()).toContain(`${NAME}.json`);
  });

  it('★捨てたら無くなる／★無いときは null', () => {
    takeSnapshot(NAME, { x: 1 });
    dropSnapshot(NAME);
    expect(readSnapshot(NAME), '★捨てたのに残っている').toBe(null);
  });

  it('🔴 ★壊れた控えを「無い」と同じに扱わない', () => {
    /**
     * 🔴 ★**「読めない」を「無い」に落とすと、★戻せないのに始めてしまいます。**
     *    ★`R-21`（0 件 ≠ 該当なし）の族です。
     */
    takeSnapshot(NAME, { x: 1 });
    rmSync(FILE);
    writeFileSync(FILE, '{壊れ', 'utf8');
    expect(() => readSnapshot(NAME)).toThrow(/読めません/);
  });

  it('⚠️ ★名前に区切り文字を通さない（★上のディレクトリへ出られない）', () => {
    expect(() => takeSnapshot('../escape', {})).toThrow(/使えない文字/);
    expect(() => takeSnapshot('a/b', {})).toThrow(/使えない文字/);
  });
});
