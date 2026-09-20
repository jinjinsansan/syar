/**
 * ★**CK-12 の網** — ★旗で変えられる値を、★定数のまま印刷していないか
 *
 * 【★この検査が守るもの】
 *   ★道具が実行条件を印刷するときは、★**実際に使った値**を印刷する。
 *   ★既定値を書き写さない。★**旗で変えられる値を、定数で印刷しない。**
 *
 * 【⚠️ ★この検査が守らないもの】
 *   🔴 ★**桁を落とす嘘**（★CK-12 の 2 件目）は ★**捕まえられません**。
 *     ★`tools/lib/printed-defaults.mjs` の冒頭に、★**なぜ書けなかったか**を書いてあります。
 *   → ★★**ここが緑でも「CK-12 が閉じた」ではありません。**
 */
import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
// @ts-expect-error ★`.mjs` の登録簿（★`.d.mts` を置いていません）
import { PRINTED_DEFAULTS } from '../../../tools/lib/printed-defaults.mjs';

const ROOT = path.resolve(__dirname, '../../..');

/** ★旗から取る数の既定値: `arg('x', 30)` の形 */
const FLAG_CALL = /\b(?:arg|num|argNum|numArg|flagNum|intArg)\(\s*'([a-z0-9-]+)'\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/gi;
/** ★`const X = i >= 0 ? Number(process.argv[i+1]) : 182;` の形 */
const FLAG_TERNARY = /indexOf\(\s*'--([a-z0-9-]+)'\s*\)[\s\S]{0,180}?:\s*(-?\d+(?:\.\d+)?)\s*;/gi;

/**
 * ★**印刷する行に、★旗の既定値が素で出ている箇所**を拾う。
 *
 * ⚠️ ★これは ★**「嘘かどうか」ではなく「人が見るべきか」**を拾う網です（★精度 43%・実測）。
 */
export function printedDefaultSites(src: string): string[] {
  const defaults = new Map<string, string>();
  for (const re of [FLAG_CALL, FLAG_TERNARY]) {
    for (const m of src.matchAll(re)) {
      const v = m[2];
      if (v === undefined) continue;
      // ★0/1/2 は偶然の一致が多すぎる
      if (Math.abs(Number(v)) <= 2) continue;
      defaults.set(v, m[1] ?? '?');
    }
  }
  if (defaults.size === 0) return [];

  const hits: string[] = [];
  for (const [i, line] of src.split('\n').entries()) {
    if (!/console\.(log|error|warn)/.test(line)) continue;
    const t = line.trimStart();
    if (t.startsWith('*') || t.startsWith('//')) continue;
    // ★使い方の行は除く — ★そこに既定値を書くのは**正しい**
    if (/使い方|Usage:|\[--/.test(line)) continue;
    // ★`${…}` の中は変数なので伏せる
    const stripped = line.replace(/\$\{[^}]*\}/g, '@@');
    for (const [v, flag] of defaults) {
      const esc = v.replace('.', '\\.');
      if (!new RegExp(`(?<![\\w.])${esc}(?![\\w.])`).test(stripped)) continue;
      // ★規則の名前（R-30 / PO-6 / D-007）の数字を拾わない
      if (new RegExp(`\\b[A-Z]{1,4}-${esc}\\b`).test(stripped)) continue;
      hits.push(`L${i + 1} --${flag}=${v}`);
    }
  }
  return hits;
}

describe('★CK-12: 旗で変えられる値を、定数のまま印刷しない', () => {
  /**
   * 🔴 ★**網そのものを試す**（★R-14: ★検出器は自分自身を検査しない）。
   */
  it('★網が、★拾うべきものを拾い、★拾ってはいけないものを拾わない', () => {
    const lie = "const S = arg('size', 32);\nconsole.log(`画素は 32×32 の何%`);";
    expect(printedDefaultSites(lie).length, '🔴 ★書き写しを見逃した').toBe(1);

    const fixed = "const S = arg('size', 32);\nconsole.log(`画素は ${S}×${S} の何%`);";
    expect(printedDefaultSites(fixed), '★直したものを拾った').toEqual([]);

    const usage = "const S = arg('size', 32);\nconsole.error('使い方: tool <png> [--size 32]');";
    expect(printedDefaultSites(usage), '★使い方の行を拾った（★そこは正しい）').toEqual([]);

    const rule = "const F = arg('fps', 30);\nconsole.log('★測定条件（R-30）');";
    expect(printedDefaultSites(rule), '★規則の名前を拾った').toEqual([]);

    const small = "const N = arg('n', 2);\nconsole.log('★2 本だけ');";
    expect(printedDefaultSites(small), '★2 以下は偶然が多いので見ない').toEqual([]);

    const ternary = "const i = process.argv.indexOf('--age');\n"
      + 'const A = i >= 0 ? Number(process.argv[i + 1]) : 182;\n'
      + "console.log('★週齢 182 まで育てます');";
    expect(printedDefaultSites(ternary).length, '★三項の既定値を見逃した').toBe(1);
  });

  const files = execSync('git ls-files tools apps/cli/src', { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n')
    .filter((f) => /\.(mjs|ts)$/.test(f) && !f.includes('/lib/'));

  const found = new Map<string, string[]>();
  for (const f of files) {
    const sites = printedDefaultSites(readFileSync(path.join(ROOT, f), 'utf8'));
    if (sites.length > 0) found.set(path.basename(f), sites);
  }

  it('🔴 ★拾った箇所は、★1 つ残らず登録簿に在る（★黙って足せない）', () => {
    const registry = PRINTED_DEFAULTS as Record<string, { sites: number; why: string }>;
    const missing = [...found.keys()].filter((f) => registry[f] === undefined);
    expect(
      missing,
      '🔴 ★旗の既定値を書き写して印刷している箇所が、★登録簿にありません:\n'
        + `  ${missing.join('\n  ')}\n`
        + '   → ★**直す**か、★`tools/lib/printed-defaults.mjs` に「なぜ嘘ではないか」を書いてください。',
    ).toEqual([]);
  });

  /**
   * ⚠️ ★**題は「増えたら」ですが、★中身は `!==` なので ★減った側も落ちます**（★**CK-16**）。
   *   ★題を中身に合わせました（★2026-09-20）。★片側だけ見る網は、
   *   ★**「網が見なくなった」を「直った」と読みます。**
   */
  it('🔴 ★件数が変わったら落ちる（★増えても減っても・★CK-16）', () => {
    const registry = PRINTED_DEFAULTS as Record<string, { sites: number; why: string }>;
    const grew: string[] = [];
    for (const [f, sites] of found) {
      const reg = registry[f];
      if (reg !== undefined && sites.length !== reg.sites) {
        grew.push(`${f}: 登録 ${reg.sites} → 実測 ${sites.length}（${sites.join(' / ')}）`);
      }
    }
    expect(grew, `🔴 ★件数が変わっています:\n  ${grew.join('\n  ')}`).toEqual([]);
  });

  it('⚠️ ★登録簿に、★もう当たらないものが残っていない（★ゴースト）', () => {
    const registry = PRINTED_DEFAULTS as Record<string, { sites: number; why: string }>;
    const stale = Object.keys(registry).filter((f) => !found.has(f));
    expect(stale, `★直ったのに登録簿に残っています: ${stale.join(' / ')}`).toEqual([]);
  });

  it('★登録簿の理由が、★短すぎない', () => {
    const registry = PRINTED_DEFAULTS as Record<string, { sites: number; why: string }>;
    for (const [f, e] of Object.entries(registry)) {
      expect(e.why.length, `${f} の理由が短すぎます`).toBeGreaterThan(20);
    }
  });
});
