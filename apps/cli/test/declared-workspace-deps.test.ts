/**
 * ★**`import` した作業領域のパッケージは、★`package.json` に宣言してある**（★2026-09-19）
 *
 * 【🔴 ★なぜ要るか — ★3 本が宣言なしで動いていました】
 *   ★`apps/cli` は ★`@star/training` / `@star/betting` / `@star/render` を ★**import しているのに
 *   宣言していません**でした。★それでも動くのは ★**npm workspaces の巻き上げ**のおかげです。
 *
 *   ⚠️ ★**巻き上げは保証ではありません。** ★次のどれかで ★**まとめて落ちます**:
 *     ★① `apps/cli` だけを切り出す（★アプリ化・正典 §15）
 *     ★② `npm ci --workspace apps/cli`（★CI で 1 つだけ入れる）
 *     ★③ 別の誰かが同名を別バージョンで入れる
 *   🔴 ★そのとき落ちるのは ★**import した所ではなく、★読み込みそのもの**です
 *     （★「落ちる」ではなく「★走らなくなる」。★気づきにくい形・R-16 の家族）。
 *
 * 【★この検査が見るもの】
 *   ★`apps/＊/src` と `apps/＊/test` の `@star/…` を数え、★`package.json` の `dependencies` と突き合わせます。
 * ⚠️ ★**逆（宣言したのに使っていない）は見ません。** ★害が違うので、要るなら別の検査にします。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const APPS = ['cli', 'web', 'worker'] as const;

/** ★`@star/…` の import を、★ディレクトリを歩いて集める */
function importedWorkspacePkgs(dir: string): Set<string> {
  const found = new Set<string>();
  const walk = (d: string): void => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx|mts)$/.test(e.name)) continue;
      for (const m of readFileSync(full, 'utf8').matchAll(/@star\/[a-z-]+/g)) found.add(m[0]);
    }
  };
  walk(dir);
  return found;
}

describe('★作業領域のパッケージは、import したら宣言する', () => {
  for (const app of APPS) {
    it(`🔴 ★apps/${app}: ★import しているのに宣言していないものが無い`, () => {
      const pkg = JSON.parse(readFileSync(path.join(ROOT, `apps/${app}/package.json`), 'utf8')) as {
        name?: string; dependencies?: Record<string, string>;
      };
      const declared = new Set(Object.keys(pkg.dependencies ?? {}));
      const imported = [
        ...importedWorkspacePkgs(path.join(ROOT, `apps/${app}/src`)),
        ...importedWorkspacePkgs(path.join(ROOT, `apps/${app}/test`)),
      ];
      const missing = imported.filter((p) => p !== pkg.name && !declared.has(p));
      expect(
        missing.sort(),
        `🔴 ★apps/${app}/package.json に足りません: ${missing.join(', ')}。`
          + '★いまは npm workspaces の巻き上げで動いていますが、'
          + '★切り出し・`npm ci --workspace`・版の衝突で **読み込みごと落ちます**。',
      ).toEqual([]);
    });
  }

  it('★対照: この検査が実際に import を拾っている（★0 件を数えて緑になっていない）', () => {
    /**
     * ⚠️ ★歩き方を間違えて 0 件になると、★**全部のアプリが無条件に通ります**（R-21）。
     *    ★`apps/cli/src` に `@star/sim-engine` が在ることは分かっているので、そこで確かめます。
     */
    const found = importedWorkspacePkgs(path.join(ROOT, 'apps/cli/src'));
    expect(found.size, '★1 つも拾えていない（★歩き方が壊れている）').toBeGreaterThan(2);
    expect(found.has('@star/sim-engine'), '★在ると分かっているものを拾えていない').toBe(true);
  });
});
