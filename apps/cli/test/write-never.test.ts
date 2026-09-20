/**
 * 🔴 ★**「読む側だけ在って、書く側が無い」列が、★黙って増えない**
 *   （★正典 **D-119** / **DB-1**・2026-09-20）
 *
 * 【★なぜ門に入れるか】
 *   ✔ ★2026-09-20 の 1 日で ★**5 例**出ました（★`D-119`）。
 *   ★★**5 回 起きたものは、★次も起きます。** ★人の目では追えません。
 *   ✔ ★精度を測りました（★8 表）: ★**6 件中 5 件 ＝ 83%**。
 *
 * 【⚠️ ★この検査が守らないもの】
 *   ★**「当たりかどうか」を判定しません**（★網の精度は 83%・★100% にはなりません）。
 *   → ★**形だけを拾い、★判定は `tools/lib/write-never.mjs` に人が書きます。**
 *   ⚠️ ★**緑 ＝ 欠陥が無い、ではありません。★緑 ＝ 登録簿と一致している、です。**
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
// @ts-expect-error ★`.mjs` の登録簿（★`.d.mts` を置いていません）
import { WRITE_NEVER } from '../../../tools/lib/write-never.mjs';

const ROOT = path.resolve(__dirname, '../../..');

/** ★snake_case → camelCase（★TS 側はこちらで読みます） */
const camelOf = (col: string): string => col.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** ★移行から列を集める（★`default` の有無つき） */
function columnsOf(table: string): Map<string, { hasDefault: boolean }> {
  const dir = path.join(ROOT, 'db/migrations');
  const out = new Map<string, { hasDefault: boolean }>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(path.join(dir, f), 'utf8');
    const ct = sql.match(
      new RegExp(`create table (?:if not exists )?${table}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'),
    );
    if (ct) {
      for (const line of (ct[1] ?? '').split('\n')) {
        const m = line.match(/^\s*([a-z_][a-z0-9_]*)\s+[a-z]/i);
        if (!m) continue;
        const name = (m[1] ?? '').toLowerCase();
        if (['primary', 'unique', 'check', 'foreign', 'constraint'].includes(name)) continue;
        out.set(name, { hasDefault: line.toLowerCase().includes(' default ') });
      }
    }
    for (const m of sql.matchAll(
      new RegExp(`${'alter '}table ${table} add column (?:if not exists )?([a-z_][a-z0-9_]*)`, 'gi'),
    )) {
      out.set((m[1] ?? '').toLowerCase(), {
        hasDefault: String(m[0] ?? '').toLowerCase().includes(' default '),
      });
    }
  }
  return out;
}

/** ★原文（★註記を外す・**CK-13**） */
const sources = execSync('git ls-files db apps packages tools', { cwd: ROOT, encoding: 'utf8' })
  .trim().split('\n')
  .filter((f) => /\.(sql|ts|tsx|mjs)$/.test(f) && !f.includes('/test/'))
  .map((f) => ({
    f,
    live: readFileSync(path.join(ROOT, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*--.*$/gm, ' ')
      .replace(/^\s*\/\/.*$/gm, ' '),
  }));

function writtenBy(col: string): string[] {
  const upd = new RegExp(`update\\s+[\\w."]+[\\s\\S]{0,80}?\\bset\\b[\\s\\S]{0,600}?\\b${col}\\s*=`, 'i');
  const ins = new RegExp(`insert\\s+into\\s+[\\w."]+\\s*\\([^)]*\\b${col}\\b[^)]*\\)`, 'i');
  const asn = new RegExp(`\\b${col}\\s*:=`, 'i');
  return sources.filter((s) => upd.test(s.live) || ins.test(s.live) || asn.test(s.live)).map((s) => s.f);
}

function readByProduct(col: string): boolean {
  const re = new RegExp(`\\b${col}\\b|\\b${camelOf(col)}\\b`);
  return sources.some((s) => (s.f.startsWith('apps/') || s.f.startsWith('packages/')) && re.test(s.live));
}

/** ★その表で「書く側が無く、製品が読んでいる」列 */
function suspectsOf(table: string): string[] {
  const out: string[] = [];
  for (const [col, meta] of columnsOf(table)) {
    if (writtenBy(col).length > 0) continue;
    if (!readByProduct(col)) continue;
    // ⚠️ ★`default` が在っても、★製品が読んでいるなら積む（★`default false` は毎年 戻す必要が在る）
    void meta;
    out.push(col);
  }
  return out.sort();
}

describe('🔴 ★D-119: 読む側だけ在って、書く側が無い列が黙って増えない', () => {
  it('★網が、★書く形を拾い／読むだけを拾わない（★R-14）', () => {
    // ★`sources` を使わない純粋な確認は書けないので、★既知の当たりで代用します
    expect(suspectsOf('horses'), '★既知の当たりを拾えていない')
      .toEqual(expect.arrayContaining(['bred_this_year']));
    // ★対照: ★書かれている列は拾わない
    expect(suspectsOf('horses'), '★書かれている列まで拾った').not.toContain('birth_week');
  });

  const registry = WRITE_NEVER as Record<string, { known: string[]; why: string }>;

  for (const table of Object.keys(registry)) {
    it(`🔴 ★${table}: ★登録簿と一致している（★増えたら落ちる）`, () => {
      const found = suspectsOf(table);
      const known = [...(registry[table]?.known ?? [])].sort();
      const added = found.filter((c) => !known.includes(c));
      const gone = known.filter((c) => !found.includes(c));
      expect(
        added,
        `🔴 ★**新しく「書く側が無い」列が出ました**（★正典 **D-119**）: ${added.join(', ')}\n`
          + '   → ★**繋ぐ**か、★`tools/lib/write-never.mjs` に「なぜ当たりではないか」を書いてください。\n'
          + '   ⚠️ ★**「あとで繋ぐ」で素通りさせないこと** — ★それが D-119 の 5 例を作りました。',
      ).toEqual([]);
      expect(
        gone,
        `✅ ★繋がったようです: ${gone.join(', ')} → ★登録簿から外してください（★ゴースト）`,
      ).toEqual([]);
    });
  }

  it('★登録簿の理由が短すぎない', () => {
    for (const [t, e] of Object.entries(registry)) {
      expect(e.why.length, `${t} の理由が短すぎます`).toBeGreaterThan(40);
    }
  });
});
