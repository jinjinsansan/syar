/**
 * ★**「前より○○できるようになった」の配線**（★**GB-1 ④⑤⑥**・移行 `0053`・2026-09-19）
 *
 * 【★オーナー決定】★`OWNER_DECISIONS_20260919.md` C-4
 *   ★**累積**（前に言ったときと比べる）／★一生 **20〜30 回**（★実測 24.4 回・幅 13）。
 *
 * 【★見ている壊れ方】
 *   ① ★作っただけで、★**ワーカーが呼んでいない**（★LR-9 と同じ形）
 *   ② 🔴 ★**毎週 基準を書く**（★累積が週次と同じものになる・**GB-1 ⑤**）
 *   ③ ★初回の基準が無い／★`null` のまま（★初回に全部 言うか、一度も言わないか・**GB-1 ⑥**）
 *   ④ ★**NPC にも言う**（★持ち主がいないので「前より」の起点が無い）
 *   ⑤ ★`buy_horse` など **3 つの RPC に写しを置く**（★D-052）
 *   ⑥ 🔴 ★**能力の名前を標準出力に出す**（★符号列が積み上がる・D-114 ②）
 *   ⑦ ★公開ビューに列が漏れる（★`stats` の写しなので D-114 が開き直す）
 */
import { describe, expect, it } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { functionBodyAfter, stripComments } from './lib/ts-blocks.js';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string): string => stripComments(readFileSync(path.join(ROOT, rel), 'utf8'));
const RUNNER = read('apps/worker/src/training-runner.ts');
const MIGRATION = readFileSync(path.join(ROOT, 'db/migrations/0053_growth_tell_baseline.sql'), 'utf8');

describe('GB-1 ④⑤⑥ 育った実感の配線', () => {
  it('★切り出しが成立している（R-21）', () => {
    expect(RUNNER.length).toBeGreaterThan(2_000);
    expect(MIGRATION.length).toBeGreaterThan(500);
  });

  it('① 🔴 ★★ワーカーが本当に呼んでいる（★作っただけで終わらせない・LR-9）', () => {
    expect(RUNNER, '★`growthTellsOf` を呼んでいない').toContain('growthTellsOf(');
    /** ★列を読んでいる／書いている */
    expect(RUNNER, '★基準を読んでいない').toContain('growth_told_stats');
    expect(RUNNER, '★基準を書いていない').toContain('growth_told_stats = t.told_stats');
    expect(RUNNER, '★週を書いていない').toContain('growth_told_week = t.told_week');
  });

  it('② 🔴 ★★言わなかった週は、基準を「そのまま戻す」（★GB-1 ⑤）', () => {
    /**
     * 🔴 ★ここが累積と週次の分かれ目です。
     *    ★言わなかった週に今の `stats` を書くと、★**累積が週次と同じもの**になります。
     *    ✔ `growth-tell-frequency.test.ts`: ★毎週 +5 の馬は 週次 0 回 ／ 累積 10 回。
     */
    const body = functionBodyAfter(RUNNER, 'if (isOwned)');
    expect(body.length, '★自馬の枝が切り出せていない').toBeGreaterThan(100);
    /** ★「言った」枝だけが `out.state.current` を基準にする */
    const told = body.slice(body.indexOf('keys.length > 0'));
    expect(told, '★言った週に今の値を基準にしていない').toContain('out.state.current');
    /** 🔴 ★「言わなかった」枝は、★**読んだ値をそのまま**戻す */
    const kept = body.slice(body.lastIndexOf('} else {'));
    expect(kept, '🔴 ★言わなかった週に今の値を書いている（★累積が週次になる）')
      .not.toContain('out.state.current');
    expect(kept, '★読んだ基準をそのまま戻していない').toContain("numRec(row.growth_told_stats");
    expect(kept, '★読んだ週をそのまま戻していない').toContain("num(row.growth_told_week");
  });

  it('③ ★★初回の基準は「この週を進める前の値」（★GB-1 ⑥・取得した瞬間の値）', () => {
    const body = functionBodyAfter(RUNNER, 'if (isOwned)');
    /** ★`null` のとき `state.current`（★進める前）を使う。★`out.state.current`（★進めた後）ではない */
    expect(body).toMatch(/growth_told_stats === null[\s\S]{0,200}?state\.current/);
    /**
     * ⚠️ ★**切り出せたことを先に確かめます**（★**CK-3**）。
     *    ★`indexOf` が -1 なら `slice(0, -1)` になり、★**ほぼ全文**を見てしまいます。
     *    ★否定の検査（`not.toMatch`）は ★**切り出しが空でも通る**ので、★ここが要ります。
     */
    const at = body.indexOf('keys.length > 0');
    expect(at, '★「言った」枝が見つからない（★切り出しが壊れている・R-21）').toBeGreaterThan(0);
    const first = body.slice(0, at);
    expect(first.length, '★初回の枝の切り出しが空').toBeGreaterThan(50);
    expect(first, '🔴 ★初回の基準に「進めた後」の値を使っている')
      .not.toMatch(/\?\s*\(out\.state\.current/);
  });

  it('④ ★★NPC には言わない（★「前より」の起点が無い）', () => {
    expect(RUNNER, '★持ち主の有無で分けていない').toContain('const isOwned = row.owner_id !== null');
    /** ★`toldStats` の初期値は `null`（★NPC はそのまま `null` が書かれる＝変わらない） */
    expect(RUNNER).toMatch(/let toldStats: string \| null = null;/);
  });

  it('⑤ 🔴 ★★RPC に写しを置いていない（★D-052）', () => {
    /**
     * 🔴 ★`buy_horse`（`0025`）・`setup_account`（`0031`）・`create_account_picks_horse`（`0037`）の
     *    ★**3 か所**が `owner_id` を書きます。★そこに基準を書くと ★**写しが 3 つ**できます。
     *    → ★入れるのは ★**ワーカーの 1 か所だけ**。
     */
    const sqls = globSync('db/migrations/*.sql', { cwd: ROOT })
      .map((p) => p.split(path.sep).join('/'))
      .filter((p) => !p.endsWith('0053_growth_tell_baseline.sql'))
      .sort();
    expect(sqls.length, '★移行が拾えていない（R-21）').toBeGreaterThan(40);
    const writers = sqls.filter((f) => /growth_told_stats\s*=/.test(readFileSync(path.join(ROOT, f), 'utf8')));
    expect(writers, `🔴 ★SQL 側で基準を書いています（★写しになる）: ${writers.join(' / ')}`).toEqual([]);
  });

  it('⑥ 🔴 ★★能力の名前を標準出力に出さない（★符号列を作らない・D-114 ②）', () => {
    /**
     * 🔴 ★`console.log(... keys.join(...))` のように書くと、
     *    ★**journal に符号列が積み上がります**（★D-116 ③ が閾値を置いた理由そのもの）。
     *    → ★出すのは ★**頭数だけ**。
     */
    const logs = RUNNER.split(String.fromCharCode(10)).filter((l) => l.includes('前より'));
    expect(logs.length, '★通報の行が無い（★黙って落としている）').toBeGreaterThan(0);
    for (const l of logs) {
      expect(l, `🔴 ★能力の名前を出しています: ${l.trim()}`).not.toMatch(/\bkeys\b/);
      expect(l, '★頭数を出していない').toContain('told.length');
    }
  });

  it('⑦ ★★公開ビューに列を足していない（★`stats` の写し）', () => {
    const views = globSync('db/migrations/*.sql', { cwd: ROOT })
      .map((p) => p.split(path.sep).join('/'))
      .filter((f) => /create (or replace )?view/i.test(readFileSync(path.join(ROOT, f), 'utf8')));
    expect(views.length, '★ビューを作る移行が拾えていない').toBeGreaterThan(0);
    for (const f of views) {
      const sql = readFileSync(path.join(ROOT, f), 'utf8');
      expect(sql, `🔴 ★${f} のビューに基準の列が出ています`).not.toMatch(/growth_told/);
    }
  });

  it('★移行 0053 の要点（★片方だけを作れない）', () => {
    expect(MIGRATION).toMatch(/add column if not exists growth_told_stats jsonb/i);
    expect(MIGRATION).toMatch(/add column if not exists growth_told_week bigint/i);
    expect(MIGRATION).toMatch(/horses_growth_told_both_or_neither/);
    /** ★1 つの移行で 1 つのこと */
    expect(MIGRATION, '★RPC を混ぜている').not.toMatch(/create or replace function/i);
    expect(MIGRATION, '★他の表を壊している').not.toMatch(/drop table|drop column/i);
  });

  it('🔴 ★★実 DB の対が在る（★FK-5・★unnest の並びは型検査では出ない）', () => {
    const tool = 'tools/verify-gb1-growth-tell.mjs';
    const src = readFileSync(path.join(ROOT, tool), 'utf8');
    expect(src, '★実 DB に繋いでいない').toContain("from 'pg'");
    expect(src, '★rollback していない').toContain('rollback');
    expect(src, '★`assertNotProduction` を呼んでいない').toContain('assertNotProduction');
    /** 🔴 ★**2 頭ぶんを一度に書いて混ざらないこと**を見ている（★`unnest` の並び） */
    expect(src, '★2 頭ぶんの検査が無い').toContain('混ざらない');
    const reg = readFileSync(path.join(ROOT, 'tools/lib/classification.mjs'), 'utf8');
    expect(reg, '★分類簿に載っていない').toContain('verify-gb1-growth-tell.mjs');
  });

  it('🔴 ★★`unnest` の並びが、宣言と `$N` と値で 3 つとも揃っている（★列を足したら落ちる）', () => {
    /**
     * 🔴 ★**レビュー側の指示**（2026-09-19）: ★「実 DB で 1 回 通した」だけでは、
     *    ★**次に列を足したとき黙って崩れます**。→ ★検査として残します。
     *
     * ★一括更新は 3 つの並びが ★**同じ順序**でなければなりません:
     *   ★① `as t(id, last, …, told_stats, told_week)`   … ★名前
     *   ★② `unnest($1::uuid[], …, $15::bigint[])`        … ★型と番号
     *   ★③ `updates.map((u) => u.…)`                      … ★値
     * ★1 つでもずれると ★**別の馬の基準を書きます**（★`fillRace` の `$1..$19` と同じ形）。
     * ⚠️ ★型検査でも偽の DB でも出ません。
     */
    /** ★`as t(...)` の名前 */
    const names = /as t\(([\s\S]*?)\)\s*where h\.id = t\.id/.exec(RUNNER)?.[1];
    expect(names, '★`as t(...)` が見つからない').toBeDefined();
    const cols = names!.split(',').map((x) => x.trim()).filter((x) => x !== '');

    /** ★`unnest(...)` の `$N::型[]` */
    const un = /from unnest\(([\s\S]*?)\)\s*as t\(/.exec(RUNNER)?.[1];
    expect(un, '★`unnest(...)` が見つからない').toBeDefined();
    const params = [...un!.matchAll(/\$(\d+)::/g)].map((m) => Number(m[1]));

    /** ★値の並び（★`updates.map((u) => u.xxx)`） */
    const argsBlock = RUNNER.slice(RUNNER.indexOf('where h.id = t.id'));
    const values = [...argsBlock.matchAll(/updates\.map\(\(u\) => u\.(\w+)\)/g)].map((m) => m[1]!);

    expect(cols.length, '★名前が拾えていない（R-21）').toBeGreaterThan(10);
    expect(params.length, `★名前 ${cols.length} 個に対し \$N が ${params.length} 個`).toBe(cols.length);
    expect(values.length, `★名前 ${cols.length} 個に対し値が ${values.length} 個`).toBe(cols.length);
    /** ★`$N` が 1 から順に並んでいる（★飛びも重複もない） */
    expect(params, '🔴 ★`$N` が 1 から順に並んでいない').toEqual(
      Array.from({ length: cols.length }, (_, i) => i + 1),
    );
    /** 🔴 ★**この便で足した 2 つが、最後の 2 つ**（★名前と値の両方で） */
    expect(cols.slice(-2), '★`as t(...)` の末尾が told_stats, told_week でない')
      .toEqual(['told_stats', 'told_week']);
    expect(values.slice(-2), '🔴 ★値の並びの末尾が toldStats, toldWeek でない（★別の馬に書く）')
      .toEqual(['toldStats', 'toldWeek']);
    /** ★`set` 側にも同じ名前が在る */
    expect(RUNNER).toContain('growth_told_stats = t.told_stats');
    expect(RUNNER).toContain('growth_told_week = t.told_week');
  });

  it('⚠️ 🔴 欠陥の記録: 画面にはまだ出していない（★言葉を組み立てるのは画面の仕事・未実装）', () => {
    /**
     * ★`growthTellsOf` は ★**能力の名前**を返すだけで、★言葉にするのは画面です（D-116 ②）。
     * ★いまは ★**行に基準を持ち、ワーカーが数えるところまで**です。
     * ⚠️ ★**画面に出す便は、まだ来ていません。** ★「配線した」と読まないこと。
     */
    const web = globSync('apps/web/src/**/*.tsx', { cwd: ROOT })
      .filter((f) => /growthTellsOf|ABILITY_GROWTH_LABEL/.test(readFileSync(path.join(ROOT, f), 'utf8')));
    expect(web, '★画面に出し始めています（★この検査の名前を直してください）').toEqual([]);
  });
});
