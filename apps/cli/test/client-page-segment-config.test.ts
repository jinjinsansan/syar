/**
 * 🔴 ★**`'use client'` の面が、★サーバー側の区分設定を宣言していないこと**（★2026-09-21）
 *
 * ============================================================================
 * 【🔴 ★なぜ在るか — ★本番が 31 コミット 古いまま配信され続けました】
 *   ★2026-09-21、★`/stable` を ★`'use client'` に変えたとき、
 *   ★`export const revalidate = 0;` を ★**残したままにしました**。
 *   ★`revalidate` は ★**サーバー側の区分設定**で、★クライアント成分からは宣言できません。
 *
 *   → ★`npm run build:web` が落ちます:
 *     ```
 *     Invalid revalidate value "function(){throw Error(...)}" on "/stable"
 *     Export encountered an error on /stable/page: /stable, exiting the build.
 *     ```
 *   🔴 ★★**Vercel は push で自動的に作り直します。★落ちると、★古い版の配信を続けます。**
 *     ★実測: ★`origin/main` = `87c19e6` / ★本番が配信 = `24af9f2`（★31 コミット 前・★1 時間半）。
 *     ★★**「デプロイが抜けている」ように見えました。★実際は「ビルドが落ちていた」。**
 *     ★オーナーの「TOP からログインすると古いデザインが出る」の、★半分はこれです。
 *
 * 【🔴 ★なぜ型検査でも門でも出なかったか】
 *   ⚠️ ★`export const revalidate = 0` は ★**型として正しい** `number` です。★`tsc` は通します。
 *   ⚠️ ★門（`npm run gate`）は ★`build:worker` を作りますが、★**`build:web` は作りません**
 *     （★2 分 かかり、★開発サーバーと `.next` を奪い合うため）。
 *   → ★★**緑の門を通ったまま、★本番だけが作り直せない**状態でした（★正典 R-28 の家族）。
 *
 * 【★この検査の立ち位置】
 *   ✅ ★**速い静的検査**で、★この一族だけを捕まえます（★`build:web` の代わりではありません）。
 *   ⚠️ ★**これは網であって、★ビルドの保証ではありません。**
 *     ★`build:web` が落ちる理由は他にもあります。★簿 `GATE-NO-WEB-BUILD` に残しました。
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const APP = path.join(ROOT, 'apps/web/src/app');

/**
 * ★クライアント成分では宣言できない ★**区分設定**（★Next.js の App Router）。
 * ⚠️ ★**列挙は漏れます**（★**R-29**）。★だから ★`build:web` の代わりにはしません。
 *    ★ここに在るのは ★**実際に踏んだもの**と、★同じ扱いの隣人だけです。
 */
const SERVER_ONLY_EXPORTS = [
  'revalidate',
  'dynamic',
  'dynamicParams',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
  'generateStaticParams',
  'generateMetadata',
  'metadata',
];

describe("🔴 ★`'use client'` の面が、★サーバー側の区分設定を宣言していない", () => {
  const files = globSync('**/*.tsx', { cwd: APP }).map((f) => path.join(APP, f));

  it('★対象の面を 1 つ以上 読めている（★0 件 通過を合格にしない・CK-14）', () => {
    expect(files.length, '🔴 ★1 枚も読めていません。★探し方が壊れています').toBeGreaterThan(10);
  });

  it("🔴 ★`'use client'` と、★サーバー側の宣言が同居していない", () => {
    const offenders: string[] = [];
    let clientFiles = 0;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // ★先頭の宣言だけを見ます（★文字列の中の "use client" に当たらないように）
      if (!/^\s*['"]use client['"]\s*;/.test(src)) continue;
      clientFiles += 1;
      for (const name of SERVER_ONLY_EXPORTS) {
        // ★行頭の `export const <name> =` / `export function <name>` / `export async function <name>`
        const re = new RegExp(`^export\\s+(const|async\\s+function|function)\\s+${name}\\b`, 'm');
        if (re.test(src)) offenders.push(`${path.relative(ROOT, f)}: export ${name}`);
      }
    }
    /**
     * 🔴 ★**対照**: ★`'use client'` の面が 1 枚も無ければ、★この検査は何も見ていません。
     *   ★上の「読めている」だけでは足りません（★全部サーバー成分かもしれない）。
     */
    expect(clientFiles, "🔴 ★`'use client'` の面が 0 枚。★この検査は何も見ていません")
      .toBeGreaterThan(0);
    expect(offenders, `🔴 ★build:web が落ちます:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});
