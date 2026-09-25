/**
 * ★**道具（`tools/*.mjs`）に型検査が当たっている本数を釘付けする**
 *   ★裁定 `REVIEW_EP_INFLOW_AND_ENTRY_20260925.md` §7 ②（2026-09-25・レビュー側の指示）
 *
 * 【🔴 ★なぜ要るか — ★門が 6 日間 赤いまま、誰も原因を見なかった】
 *   ★`aggregateDay` は ★**BT-6（2026-09-19）**で `date` → `date` ＋ `from`/`to` に分かれました。
 *   ★`tools/verify-flow.mjs` の呼び出しは ★**引数 2 つのまま**でした。
 *   → ★`from`/`to` が `undefined` で渡り、★SQL は `created_at >= null` になって ★**1 行も当たらず**、
 *     ★全項目 0 ＝「★実データを数えている: **FAIL**」を出し続けていました。
 *   ⚠️ ★`.mjs` なので ★**型検査が鳴きません**。★引数が減っても静かに通ります。
 *
 * 【★レビュー側の判断: ★新しい網を作らず、★型検査そのものを当てる】
 *   ★`tools/tsconfig.json`（★`allowJs` ＋ `checkJs: false`）を作り、
 *   ★`// @ts-check` を書いたファイルだけを見ます。
 *   ✔ ★対照で確かめました: ★当時の壊れた呼び方に戻すと
 *     ★`error TS2554: Expected 4 arguments, but got 2.` が出ます。
 *
 * 【★なぜ全部に付けないか】
 *   ★`tools` には `.mjs` が **443 本**あり、★一度に付けると ★**498 件 / 73 ファイル**落ちます。
 *   ★使い捨ての下見道具（`_` 付き）も多く、★製品の正しさとは関係のない落ち方が混ざります。
 *   → ★**門（`verify-*` / `check-*`）のうち、いま通るものから**始め、★件数を釘付けして増やします。
 *
 * ⚠️ ★**この数は減らせません。** ★減らすときは ★なぜ外すかを裁定に書いてから。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const TOOLS = path.join(ROOT, 'tools');

/**
 * ★**下限**（★2026-09-25 時点の実測）。
 * ⚠️ ★増やすのは歓迎。★**減らすには理由が要ります。**
 */
const PINNED_MIN = 13;

/**
 * ★**必ず入っていること**（★壊れた当人と、★EP の便で作ったもの）。
 * ⚠️ ★名指しするのは ★「この 2 本だけは外さない」を機械で言うためです。
 */
const MUST_BE_CHECKED = [
  // 🔴 ★2026-09-19 から 6 日間 赤かった当人
  'verify-flow.mjs',
  // ★D-075 のデイリー EP の検査（★2026-09-25 に作った）
  'verify-ep-daily.mjs',
] as const;

function checkedFiles(): string[] {
  return readdirSync(TOOLS)
    .filter((f) => f.endsWith('.mjs'))
    .filter((f) => readFileSync(path.join(TOOLS, f), 'utf8').startsWith('// @ts-check'));
}

describe('★道具の型検査（★裁定 §7 ②）', () => {
  it('★tools/tsconfig.json が在り、★checkJs は false（★印を付けたものだけ見る）', () => {
    const p = path.join(TOOLS, 'tsconfig.json');
    expect(existsSync(p), '🔴 ★tools/tsconfig.json が無い').toBe(true);
    const cfg = readFileSync(p, 'utf8');
    expect(cfg, '★allowJs を有効にすること').toMatch(/"allowJs":\s*true/);
    expect(cfg, '★checkJs は false（★443 本を一度に見ない）').toMatch(/"checkJs":\s*false/);
  });

  it('★npm run typecheck が tools も見る（★流されない設定を作らない）', () => {
    const pkg = readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    expect(pkg, '🔴 ★typecheck が tools を見ていません（★設定だけ在って誰も流さない形）')
      .toMatch(/"typecheck":\s*"[^"]*-p tools/);
  });

  it(`🔴 ★型検査を当てた道具が ${PINNED_MIN} 本以上ある（★減らさない）`, () => {
    const checked = checkedFiles();
    expect(
      checked.length,
      `🔴 ★型検査を当てた道具が減っています（★いま ${checked.length} 本 / 下限 ${PINNED_MIN} 本）。\n`
      + '  ★`// @ts-check` を外したなら、★なぜ外すかを裁定に書いてから下限を下げてください。\n'
      + `  ★いま付いているもの: ${checked.join(', ')}`,
    ).toBeGreaterThanOrEqual(PINNED_MIN);
  });

  it('🔴 ★壊れた当人（verify-flow.mjs）に印が付いている', () => {
    const checked = checkedFiles();
    const missing = MUST_BE_CHECKED.filter((f) => !checked.includes(f));
    expect(
      missing,
      '🔴 ★名指しの道具から `// @ts-check` が外れています。\n'
      + '  ★`verify-flow.mjs` は ★引数の数が合わなくなって 6 日間 赤かった当人です',
    ).toEqual([]);
  });
});
