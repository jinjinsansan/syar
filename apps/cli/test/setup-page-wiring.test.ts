/**
 * 🔴 ★**`/setup` を組み直しても、★機能が 1 つも落ちていないこと**（★2026-09-21・オーナー判断「B」）
 *
 * ============================================================================
 * 【★何をしたか】
 *   ★`/setup` だけが旧い見た目のままでした（★本番の配信 HTML で実測）。
 *   ★オーナーの選択は ★**B「既存の部品で組み直す（★新しい見た目は作らない）」**。
 *   → ★`/login` `/signup` と ★**同じ `uma-parts`** で書き直しました。
 *
 * 【🔴 ★なぜ検査が要るか】
 *   ★**書き直しは、★黙って機能を落とします。** ★見た目が整うぶん、★気づきにくい。
 *   ★`/setup` は ★**初回セットアップ**で、★新規のお客が必ず通ります。
 *   ★ここで冪等キーや失敗表示が落ちると、★**二重登録**や ★**黙って消える失敗**になります。
 *   → ★★**落としてはいけないものを、★名指しで釘付けします。**
 *
 * 【★釘付けするもの】
 *   ★① ★`supabaseSetupRepo.create` に ★**5 つの引数**を渡している
 *   ★② ★`clientToken` は ★**1 回だけ**作る（★`useState(() => crypto.randomUUID())`）
 *   ★③ ★失敗の 4 種を出し分け、★**サーバーの文言をそのまま**出す枝が在る
 *   ★④ ★`NAME_MAX` で切っている
 *   ★⑤ ★受け取った EP は ★**実数**を出す（★ハードコードしない）
 *   ★⑥ ★`uma-parts` を使っている（★＝ 自前バーを持つ ＝ 帯が二重にならない）
 *
 * ⚠️ ★この検査は ★**原文を読みます**（★描画しません）。★`jsdom` を持ち込まないためです。
 *    ★★だから「在ること」しか言えません。★動くことは、★オーナーが実際に登録して確かめます。
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = readFileSync(path.join(ROOT, 'apps/web/src/app/setup/page.tsx'), 'utf8');

describe('🔴 ★`/setup` の組み直しで、機能が落ちていない', () => {
  it('★原文を読めている（★0 件 通過を合格にしない）', () => {
    expect(SRC.length, '🔴 ★`/setup` が読めていない、または空です').toBeGreaterThan(2000);
  });

  it('🔴 ① ★`supabaseSetupRepo.create` に 5 つとも渡している', () => {
    expect(SRC, '★repo を呼んでいない').toContain('supabaseSetupRepo.create(');
    for (const field of ['displayName', 'stableName', 'colorKey', 'sleeve', 'clientToken']) {
      expect(SRC, `🔴 ★${field} を渡していない`).toMatch(
        new RegExp(`supabaseSetupRepo\\.create\\(\\{[^}]*\\b${field}\\b`, 's'),
      );
    }
  });

  it('🔴 ② ★冪等キーは 1 回だけ作る（★送るたびに作り直さない・V-19 ⑭）', () => {
    /**
     * 🔴 ★ここが落ちると ★**2 回目の登録も通ります**（★馬が 2 頭・EP が 2 回）。
     *   ★`useState(() => …)` の形でないと、★毎描画で作り直されます。
     */
    expect(SRC, '🔴 ★`clientToken` を `useState(() => crypto.randomUUID())` で作っていない')
      .toMatch(/const \[clientToken\]\s*=\s*useState\(\(\)\s*=>\s*crypto\.randomUUID\(\)\)/);
    /** ★対照: ★`setClientToken` が在ったら、★作り直せてしまいます */
    expect(SRC, '🔴 ★`clientToken` に setter が在ります（★作り直せてしまう）')
      .not.toContain('setClientToken');
  });

  it('🔴 ③ ★失敗の 4 種を出し分け、★サーバーの文言をそのまま出す（★UI1-9）', () => {
    for (const kind of ['other', 'network', 'duplicate']) {
      expect(SRC, `🔴 ★失敗 "${kind}" の枝が無い`).toContain(`'${kind}'`);
    }
    expect(SRC, '🔴 ★サーバーの文言（message）を出していない').toMatch(/message\s*\?\?/);
    expect(SRC, '🔴 ★失敗を画面に出していない').toContain('ErrorRow');
    expect(SRC, '🔴 ★やり直しの口が無い').toContain('もう一度');
  });

  it('★④ ★名前は `NAME_MAX` で切る（★数を書かない）', () => {
    expect(SRC, '★NAME_MAX を使っていない').toContain('NAME_MAX');
    expect(SRC, '★切っていない').toMatch(/slice\(0,\s*NAME_MAX\)/);
  });

  it('🔴 ⑤ ★受け取った EP は実数を出す（★ハードコードしない）', () => {
    expect(SRC, '🔴 ★`granted.grantedEP` を出していない').toContain('granted.grantedEP');
  });

  it('🔴 ⑥ ★`uma-parts` を使っている（★帯が二重にならない側）', () => {
    expect(SRC, '🔴 ★`uma-parts` を使っていない').toContain('components/uma/uma-parts');
    for (const part of ['TopBar', 'Backdrop', 'BigButton', 'useMotionPaused']) {
      expect(SRC, `★${part} を使っていない`).toContain(part);
    }
    /** ⚠️ ★旧い意匠（`a-*` の枠・帯）が残っていないこと */
    expect(SRC, '⚠️ ★旧いパネルの意匠が残っています').not.toContain('a-panel');
  });

  it('★2 ステップのまま（★1 牧場をつくる → ★2 最初の 1 頭）', () => {
    expect(SRC).toMatch(/useState<1 \| 2>\(1\)/);
    expect(SRC, '★step 2 へ進めていない').toContain('setStep(2)');
  });
});
