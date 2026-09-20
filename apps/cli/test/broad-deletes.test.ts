/**
 * ★**自分が作った行以外を消す `delete` を、★黙って足せなくする**
 * （★`CLEANUP-NO-RECORD`・2026-09-19）
 *
 * 【🔴 ★何を守るか】
 *   ★片付けの道具が ★**何を消したかをどこにも残さない**と、
 *   ★「本当にそれだけを消したか」を ★**後から人が確かめる方法がありません**。
 *   ★2026-09-19、★`cleanup-ds7-leak` / `verify-unlock-daily` / `verify-flow` が
 *   ★**自分が作っていない行**（★漏れ・★ワーカーの日次集計・★§11.2 の実経済の指標）を
 *   ★消していて、★どれも記録を残していませんでした。
 *
 * 【⚠️ ★なぜ「危ないか」を機械に判定させないか】
 *   🔴 ★同じ日に ★**検出の網を 3 回 書き直しました**（★CK-11 の走査）。
 *     ★1 回目は精度 20%、★2 回目は ★**探しているものを落とし**、★3 回目でやっと使えました。
 *   → ★★**網のほうが壊れます。**
 *   → ★機械は ★**形だけ**を拾い、★危ないかどうかは ★**人が登録簿に書く**。
 *     ★`known-red` / `open-findings` と同じ作法です。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { BROAD_DELETES } from '../../../tools/lib/broad-deletes.mjs';

const ROOT = path.resolve(__dirname, '../../..');

/** ★テンプレート文字列と註記を残したまま、★`delete from` の箇所を拾う */
function broadDeleteSites(src: string): string[] {
  const hits: string[] = [];
  /**
   * ⚠️ ★註記の中の `delete from`（★「以前は … だった」の引用）を数えないように、
   *   ★行頭が `*` か `//` の行は外します。
   */
  const lines = src.split('\n').filter((l) => {
    const t = l.trimStart();
    return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
  });
  const body = lines.join('\n');

  /**
   * 🔴 ★**左に語の切れ目を要求します**（★2026-09-20）。
   *
   *   ⚠️ ★これが無いと、★**識別子の末尾**を文の頭と読み違えます。★実例:
   *   ```sql
   *   select con.confdeltype as on_delete
   *     from pg_constraint con          -- ★`on_delete` ＋ 改行 ＋ `from …` で当たっていた
   *   ```
   *   ★`tools/diag-horses-refs.mjs`（★**読むだけの道具**）が、★これで
   *   ★「条件なしの全消しが 1 件」と数えられました。
   *
   *   ★`tool-guard.test.ts` が `truncate` で同じ直しをしています
   *   （★「語で弾くと、★**書き込みを検査する道具が書き込む道具に見える**」）。★同じ形です。
   */
  for (const m of body.matchAll(/(?<![\w$])delete\s+from\s+[\w.${}]+([^;]*)/gi)) {
    const tail = m[1] ?? '';
    // ★述語の切れ目まで（★次の `)` や引用符の閉じで十分）
    const pred = tail.slice(0, 160);
    const hasWhere = /\bwhere\b/i.test(pred);
    if (!hasWhere) { hits.push(`条件なし: ${m[0].slice(0, 60)}`); continue; }
    if (/[<>]=?\s*\$?\d|[<>]=?\s*\$\d/.test(pred)) { hits.push(`範囲: ${m[0].slice(0, 60)}`); continue; }
    if (/\bdate\b\s*=/.test(pred)) { hits.push(`日付: ${m[0].slice(0, 60)}`); continue; }
  }
  return hits;
}

describe('★CLEANUP-NO-RECORD: 自分が作った行以外を消す delete', () => {
  /**
   * 🔴 ★**網そのものを試す**（★R-14: ★検出器は自分自身を検査しない）。
   *   ★2026-09-20 に左の語境界を足したので、★**拾うものと拾わないものを両方**置きます。
   */
  it('★網が、★拾うべきものを拾い、★識別子を拾わない', () => {
    // ★拾うべき
    expect(broadDeleteSites('await c.query("delete from horses")').length,
      '★条件なしの全消しを見逃した').toBe(1);
    expect(broadDeleteSites('await c.query(`delete from ${t}`)').length,
      '★表名が変数でも拾う').toBe(1);
    expect(broadDeleteSites("q('delete from races where cycle_index >= 900000')").length,
      '★範囲比較を見逃した').toBe(1);
    // ★拾ってはいけない
    expect(broadDeleteSites('q("delete from races where id = $1")'),
      '★自分の行だけを消すものを拾った').toEqual([]);
    expect(
      broadDeleteSites('q(`select con.confdeltype as on_delete\n  from pg_constraint con`)'),
      '🔴 ★識別子 `on_delete` の末尾を文の頭と読み違えた',
    ).toEqual([]);
  });

  const files = execSync('git ls-files tools', { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n')
    .filter((f) => f.endsWith('.mjs') && !f.startsWith('tools/lib/'))
    .map((f) => f.replace(/^tools\//, ''));

  const found = new Map<string, string[]>();
  for (const f of files) {
    const sites = broadDeleteSites(readFileSync(path.join(ROOT, 'tools', f), 'utf8'));
    if (sites.length > 0) found.set(f, sites);
  }

  it('① ★走査が空でない（★対照: ★網が壊れていたら 0 件で通ってしまう）', () => {
    /**
     * 🔴 ★**この検査がいちばん大事です。**
     *   ★正規表現を壊すと ★**「1 件も無い」＝ 全部 合格**になります。
     *   ★2026-09-19 の実測は **7 本**でした。
     */
    expect(files.length, '★tools/*.mjs が見つからない').toBeGreaterThan(50);
    expect(found.size, '🔴 ★1 本も拾えていない。★網が壊れています').toBeGreaterThan(3);
  });

  it('🔴 ② ★拾った道具は、★1 本残らず登録簿に在る（★黙って足せない）', () => {
    const missing = [...found.keys()].filter((f) => BROAD_DELETES[f] === undefined);
    expect(
      missing,
      `🔴 ★自分が作った行以外を消しうる delete が、★登録簿にありません: ${missing.join(' / ')}\n`
        + '   → ★`tools/lib/broad-deletes.mjs` に足して、★`records` に「どう残すか」を書いてください。\n'
        + '   ★残す必要が無いなら、★**なぜ要らないか**を書いてください。',
    ).toEqual([]);
  });

  it('③ ★登録簿にゴーストを残さない（★消えた道具が載ったまま）', () => {
    const ghosts = Object.keys(BROAD_DELETES).filter((f) => !found.has(f));
    expect(ghosts, `★登録簿に在るのに拾えません: ${ghosts.join(' / ')}`).toEqual([]);
  });

  it('🔴 ④ ★箇所の数が増えたら落ちる（★既存の道具に黙って足せない）', () => {
    const grown: string[] = [];
    for (const [f, sites] of found) {
      const e = BROAD_DELETES[f];
      if (e !== undefined && sites.length > e.sites) {
        grown.push(`${f}: 登録 ${e.sites} → 実測 ${sites.length}（${sites.join(' / ')}）`);
      }
    }
    expect(grown, `🔴 ★箇所が増えています:\n   ${grown.join('\n   ')}`).toEqual([]);
  });

  it('⑤ ★`records` に中身がある（★空で登録して閉じない・NT-2）', () => {
    for (const f of Object.keys(BROAD_DELETES)) {
      const e = BROAD_DELETES[f]!;
      expect(e.records.length, `${f}: ★records が短すぎます`).toBeGreaterThan(30);
    }
  });
});
