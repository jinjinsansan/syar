/**
 * 🔴 ★**介入を実装した瞬間に落ちる仕掛け**（★正典 §17.3 **F-2** / §8.8・2026-09-20）
 *
 * 【★なぜ簿ではなく門に置くか】
 *   ✔ ★`ANNOUNCE-G2-G3` は ★**報告書の中だけに在って、★9 時間 消えかけました。**
 *   ★簿でも同じです — ★★**介入を実装する人が、★簿を読むとは限りません。**
 *   → ★★**読まなくても止まる形**にします（★レビュー側の裁定・2026-09-20）。
 *
 * 【★何を見るか】
 *   ★① ★製品コードに ★**`intervention_log` を「書く」経路**が現れたか
 *   ★② ★現れたなら、★**公開ビューが確定後にそれを出している**か
 *   → ★①が無ければ通します（★いまはここ）。★①が出た瞬間、★②を要求します。
 *
 * 【★今日の姿（★2026-09-20 実測・本番）】
 *   ★`race_entries` **79,859 行**のうち ★`intervention_log` 有り **0** / `intervention_mult` 有り **0**。
 *   → ★★**介入はまだ 1 度も使われていません。★だから seed だけで再計算できます。**
 *   🔴 ★正典は ★**「介入がある以上、seed だけでは再現の証明にならない」**と書いています。
 *
 * 【★直し方は、★ビューの中に既に在ります】
 *   ★`finish_pos` は `case when r.status = 'settled' then … else null end` で**確定後だけ**出す。
 *   → ★`intervention_log` にも ★**同じ形を当てるだけ**です（★落としたまま放り出しません）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const COL = 'intervention_log';

/**
 * ★**その列を「書く」経路が在るか**（★製品コードだけ）。
 * ⚠️ ★`tools/` は含めません — ★手で流す道具は、★公開の義務を生みません。
 */
export function writesInterventionLog(sources: readonly { file: string; text: string }[]): string[] {
  const hits: string[] = [];
  for (const { file, text } of sources) {
    const live = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*/gm, ' ');
    const ins = new RegExp(`insert\\s+into\\s+[\\w."]+\\s*\\([^)]*\\b${COL}\\b[^)]*\\)`, 'i');
    const upd = new RegExp(`update\\s+[\\w."]+[\\s\\S]{0,80}?\\bset\\b[\\s\\S]{0,400}?\\b${COL}\\s*=`, 'i');
    if (ins.test(live) || upd.test(live)) hits.push(file);
  }
  return hits;
}

/** ★公開ビューが、★**確定後に**その列を出しているか */
export function viewPublishesAfterSettle(viewSql: string): boolean {
  if (!new RegExp(`\\b${COL}\\b`).test(viewSql)) return false;
  // ★`case when … settled … then … intervention_log` の形（★確定前に出さない）
  return new RegExp(
    `case\\s+when[^\\n]{0,80}status\\s*=\\s*'settled'[\\s\\S]{0,120}?\\b${COL}\\b`, 'i',
  ).test(viewSql)
    || new RegExp(`\\b${COL}\\b[\\s\\S]{0,120}?case\\s+when[^\\n]{0,80}'settled'`, 'i').test(viewSql);
}

/** ★`race_entries_public` の**最後の定義**（★上書きされるので、最後が正） */
function latestViewSql(): string {
  const dir = path.join(ROOT, 'db/migrations');
  let last = '';
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(path.join(dir, f), 'utf8');
    const m = [...sql.matchAll(
      /create\s+(?:or\s+replace\s+)?view\s+race_entries_public\s+as([\s\S]*?);/gi,
    )];
    if (m.length > 0) last = m[m.length - 1]?.[0] ?? last;
  }
  return last;
}

describe('🔴 ★F-2: 介入を入れたら、★介入ログを公開する', () => {
  /**
   * 🔴 ★**網そのものを試す**（★R-14）。★★片方の枝しか試さないと、
   *   ★「いま在らない」ことだけで緑になり、★**在った日に落ちない**網になります。
   */
  it('★網が、★書く経路を拾い／拾いすぎない', () => {
    expect(writesInterventionLog([{
      file: 'x.ts', text: "q('update race_entries set intervention_log = $1 where id = $2')",
    }]), '★update を見逃した').toEqual(['x.ts']);
    expect(writesInterventionLog([{
      file: 'y.ts', text: "q('insert into race_entries (race_id, intervention_log) values ($1,$2)')",
    }]), '★insert を見逃した').toEqual(['y.ts']);
    expect(writesInterventionLog([{
      file: 'z.ts', text: "q('select intervention_log from race_entries')",
    }]), '★読むだけを拾った').toEqual([]);
    expect(writesInterventionLog([{
      file: 'w.ts', text: '// ★いつか intervention_log を書く\nconst a = 1;',
    }]), '★註記を拾った（CK-13）').toEqual([]);
  });

  it('★網が、★ビューの「確定後に出す」を見分ける', () => {
    expect(viewPublishesAfterSettle(
      "create view v as select case when r.status = 'settled' then e.intervention_log else null end;",
    ), '★確定後に出している形を見逃した').toBe(true);
    expect(viewPublishesAfterSettle('create view v as select e.gate;'),
      '★出していないのに true').toBe(false);
    expect(viewPublishesAfterSettle('create view v as select e.intervention_log;'),
      '🔴 ★**無条件に出している**のを通した（★確定前に他人の操作が見える）').toBe(false);
  });

  /**
   * ★製品コード（★`tools/` は含めない）。
   *
   * 🔴 ★**`git ls-files` を使いません**（★**M-6** の教訓・★§17.2 C-4 が `rg -uu` と指定）。
   *   ★新しく書かれた file は ★**`git add` するまで追跡外**です。
   *   → ★★**「介入を実装した瞬間」に落ちてほしいのに、★commit まで落ちない**網になります。
   *   → ★**ディレクトリを歩きます。**
   */
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.next', 'dist', 'test'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx|mjs|sql)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const files = [...walk(path.join(ROOT, 'apps')), ...walk(path.join(ROOT, 'packages'))];
  const sources = files.map((f) => ({
    file: path.relative(ROOT, f).split(path.sep).join('/'),
    text: readFileSync(f, 'utf8'),
  }));
  const writers = writesInterventionLog(sources);

  it('🔴 ★介入ログを書く経路が現れたら、★公開ビューが確定後に出していること', () => {
    if (writers.length === 0) return; // ★まだ実装されていない（★2026-09-20 時点）
    expect(
      viewPublishesAfterSettle(latestViewSql()),
      '🔴 ★**介入ログを書き始めたのに、★公開していません**（★正典 §17.3 **F-2**）。\n'
        + `   ★書いている場所: ${writers.join(' / ')}\n`
        + '   ★直し方: ★`race_entries_public` に、★`finish_pos` と**同じ形**で足してください:\n'
        + "     case when r.status = 'settled' then e.intervention_log else null end as intervention_log\n"
        + '   ⚠️ ★**確定前に出さないこと**（★他人の操作が見えます・`0006_public_views.sql:13`）。',
    ).toBe(true);
  });

  it('⚠️ ★いまは「書く経路が無い」— ★それを固定する（★黙って増えない）', () => {
    /**
     * ⚠️ ★これが無いと、★上の検査は ★**`return` するだけの空の検査**になり、
     *   ★「通っている」のか「そもそも何も見ていない」のかが分かりません（★**CK-11**）。
     */
    expect(writers, `★介入ログを書く経路が増えました: ${writers.join(' / ')}`).toEqual([]);
  });
});
