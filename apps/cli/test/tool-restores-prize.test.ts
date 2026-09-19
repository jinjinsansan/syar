/**
 * ★**`verify-prize.mjs` の控えが、★馬ごとに元の厩舎へ戻る**
 * （★**SB-6** ②／★`STABLE-1-SKEW` の原因・2026-09-19）
 *
 * 【🔴 ★何を守るか — ★これは仮定ではなく、★**起きたこと**です】
 *   ★`verify-prize.mjs` は出走表の ★**最終枠を除く全頭**（★1 回 17 頭 前後）を
 *   ★プレイヤー所有にし、★後片付けで ★**`npc_stable_id = 1` と決め打ち**して返していました。
 *   → ★**流すたびに 17 頭が、いろいろな厩舎から 厩舎 1 へ 一方向に移ります。**
 *
 *   ✔ ★staging の跡（★`tools/diag-stable1-skew.mjs`・★読むだけの道具で実測）:
 *     ★**6 本のレースで「厩舎 1 の頭数 ＝ 出走頭数 − 1」ちょうど**
 *       17/18・12/13・10/11・9/10・9/10・7/8（★すべて `settled`）
 *     ★**他の 39 厩舎では 0 本**（★同じ問い合わせを全厩舎に当てた対照）。
 *     ★厩舎 1 の余り **92 頭** のうち ★**66 頭（72%）**がこの 6 本で説明できます。
 *
 * 【⚠️ 🔴 ★`verify-g6` より悪い形でした】
 *   ★`verify-g6` は元の値を**メモリに持って**いました（★殺されると失う）。
 *   ★こちらは ★**元の値を読んでさえいません** → ★**毎回 正常終了しても失っていました。**
 *   → ★私は 2026-09-19 に「★`verify-prize` は控えが要らない」と書きました。★**誤りです。**
 *     ★見たのが ★**「片付ける行をどう探すか」（固定の `uid`）**だけで、
 *     ★**「何の値を書き戻すか」**を見ていませんでした（★`AU-12`: ★結論と理由は別々に確かめる）。
 *
 * 【⚠️ ★この検査が見ないもの】
 *   🔴 ★**実 DB で確かめていません**（★偽の client）。★分かるのは
 *   ★「控えが外に在る・★馬ごとに違う厩舎を戻す・★1 文で当てる・★冪等」までです。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { takeSnapshot, readSnapshot, dropSnapshot } from '../../../tools/lib/snapshot-file.mjs';
import { RESTORE_PRIZE, TOOL_RESTORES } from '../../../tools/lib/tool-restores.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const NAME = RESTORE_PRIZE.snapshot;

function fakeClient(rowCount = 0) {
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
  '-e', `process.stdout.write(require('node:fs').readFileSync('tools/verify-prize.mjs','utf8'))`,
], { cwd: ROOT, encoding: 'utf8' });

afterEach(() => { try { dropSnapshot(NAME); } catch { /* 片付け */ } });

describe('★SB-6 ②: verify-prize.mjs の控え（★STABLE-1-SKEW の原因）', () => {
  it('🔴 ★**馬ごとに違う厩舎**へ戻す（★全部 1 に寄せない）', async () => {
    /**
     * 🔴 ★これがこの検査の中心です。★17 頭が **17 通りの厩舎**から来ていても、
     *   ★旧い形は全部 1 に返していました。
     */
    const horses: [string, number][] = [['h1', 7], ['h2', 23], ['h3', 1], ['h4', 36]];
    takeSnapshot(NAME, { horses, uid: 'u-prize' });

    const left = readSnapshot<{ horses: [string, number][]; uid: string }>(NAME);
    const c = fakeClient(4);
    const { rows } = await RESTORE_PRIZE.restore(c, left!.data);

    expect(rows).toBe(4);
    expect(c.calls).toHaveLength(1);
    const [ids, stables] = c.calls[0]!.params as [string[], number[]];
    expect(ids).toEqual(['h1', 'h2', 'h3', 'h4']);
    expect(stables, '🔴 ★厩舎が 1 に潰れています').toEqual([7, 23, 1, 36]);
    expect(new Set(stables).size, '★厩舎が 1 種類に潰れています').toBeGreaterThan(1);
  });

  it('🔴 ★17 頭でも**1 文**で当てる（★途中で死んで半分だけ戻るのを防ぐ）', async () => {
    const horses = Array.from({ length: 17 }, (_, i) => [`h${i}`, (i % 40) + 1] as [string, number]);
    const c = fakeClient(17);
    await RESTORE_PRIZE.restore(c, { horses, uid: 'u' });

    expect(c.calls, '★1 頭ずつ投げています（★途中で死ぬと半分だけ戻る）').toHaveLength(1);
    expect(c.calls[0]!.sql).toMatch(/unnest/);
    expect(c.calls[0]!.sql).toMatch(/owner_id\s*=\s*null/);
  });

  it('★冪等: ★0 頭でも 0 行でも異常にしない', async () => {
    const empty = fakeClient(0);
    expect(await RESTORE_PRIZE.restore(empty, { horses: [], uid: 'u' })).toEqual({ rows: 0 });
    expect(empty.calls, '★空なのに問い合わせている').toHaveLength(0);

    const already = fakeClient(0);
    const { rows } = await RESTORE_PRIZE.restore(already, { horses: [['h1', 7]], uid: 'u' });
    expect(rows, '★もう戻っている（0 行）を異常にしていないか').toBe(0);
  });

  it('🔴 ★道具から `npc_stable_id = 1` の決め打ちが**消えている**', () => {
    /**
     * 🔴 ★これが `STABLE-1-SKEW` を作った 1 行です。★戻ってこないように留めます。
     * ⚠️ ★註記の中の引用（★「旧: …」）に当たらないよう、★**実行される行の形**で探します。
     */
    const body = src()
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'))
      .join('\n');
    expect(body, '🔴 ★`npc_stable_id = 1` の決め打ちが戻っています')
      .not.toMatch(/npc_stable_id\s*=\s*1\b/);
  });

  it('🔴 ★控えを取るのが、★付け替えより**前**', () => {
    const s = src();
    const take = s.indexOf('takeSnapshot(RESTORE_PRIZE.snapshot');
    const convert = s.indexOf('set owner_id=$1, npc_stable_id=null');
    expect(take, '★takeSnapshot が無い').toBeGreaterThan(-1);
    expect(convert, '★付け替えの文が無い').toBeGreaterThan(-1);
    expect(take, '🔴 ★控えが付け替えより後にある（★間で死ぬと控えが無い）').toBeLessThan(convert);
  });

  it('🔴 ★控えが無いのに所有馬が残っていたら、★**決め打ちで戻さず**に数える', () => {
    /**
     * 🔴 ★ここで 1 に入れてしまうと、★直したはずの `STABLE-1-SKEW` を作り直します。
     *   ★「戻せない」を「片付いた」に落とさない（★`R-21` の族）。
     */
    const s = src();
    expect(s).toMatch(/orphanLeft\s*=\s*orphan/);
    expect(s, '★控えの無い残りを合否に入れていない').toMatch(/orphanLeft === 0/);
  });

  it('★戻ったことを数えている（★TL-1 の countedBy が実在する）', () => {
    const s = src();
    expect(s, '★元の厩舎に戻ったかを数えていない').toMatch(/backHome/);
    expect(s).toMatch(/is distinct from t\.stable/);
  });

  it('★表に載っている', () => {
    expect(TOOL_RESTORES['verify-prize.mjs']).toBe(RESTORE_PRIZE);
    expect(RESTORE_PRIZE.tool).toBe('verify-prize.mjs');
    expect(RESTORE_PRIZE.snapshot).toBe('verify-prize');
  });
});
