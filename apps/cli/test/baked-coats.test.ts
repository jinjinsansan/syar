/**
 * 🔴 ★**焼いた素材の毛色が、毛色の表とずれないこと**（★2026-09-24・オーナー決定 D-1/D-2）
 *
 * ============================================================================
 * 【★何が起きていたか】
 *   ★毛色の表（`@star/render` の `COAT_TRANSFORMS`）に ★**月毛と白毛を足した**のに、
 *   ★焼いた素材（`apps/web/public/art/baked/`）は ★**7 種のまま**でした。
 *   ★いま `/race` は毛色を ★**枠番**から引く（7 種しか使わない）ので ★実害は出ていませんでした。
 *   🔴 ★しかし ★**馬 ID から引くように変えた日**、★その 2 色で `set.coats[coat]` が
 *      ★`undefined` になり、★**その馬だけ描けなくなります**。
 *   ★簿 `COAT-PALOMINO-WHITE-NOT-BAKED`。
 *
 * 【🔴 ★なぜ機械で見張るか】
 *   ★焼くのは ★**別の道具・別の日**です（`tools/bake-race-frames.mjs`・1 回 6 分）。
 *   ★表に 1 行足すのは ★**5 秒**です。★この 2 つが離れている限り、★また ずれます。
 *   → ★**表を足した時点で落ちる**ようにします。★落ちたら焼き直してください。
 *
 * ⚠️ ★これは「★在ること」しか見ません。★月毛・白毛が ★**まともに見えるか**は別です
 *    （★オーナーが `/design-check` の実画面で見ます）。
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { COAT_TRANSFORMS, DEFORMED_COAT_TRANSFORMS } from '@star/render';

const ROOT = path.resolve(__dirname, '../../..');
const BAKED = path.join(ROOT, 'apps/web/public/art/baked');
const MANIFEST = path.join(BAKED, 'manifest.json');

interface Manifest {
  readonly targetHorsePx: number;
  readonly coats: readonly string[];
  readonly sets: readonly { readonly role: string; readonly coats: Record<string, string> }[];
}

describe('🔴 ★焼いた素材の毛色', () => {
  it('★目録が読める（★0 件 通過を合格にしない・R-21）', () => {
    expect(existsSync(MANIFEST), `🔴 ★${MANIFEST} が無い`).toBe(true);
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
    expect(m.sets.length, '🔴 ★役が 1 つも無い').toBeGreaterThan(3);
  });

  it('🔴 ★目録の毛色が、毛色の表と同じ（★足したら焼き直す）', () => {
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
    const table = Object.keys(COAT_TRANSFORMS).sort();
    expect(
      [...m.coats].sort(),
      `🔴 ★毛色の表と焼いた素材がずれています。★\`npx tsx tools/bake-race-frames.mjs\` を流して焼き直してください。\n`
      + `   ★表:   ${table.join(' ')}\n`
      + `   ★目録: ${[...m.coats].sort().join(' ')}`,
    ).toEqual(table);
  });

  it('🔴 ★2 つの毛色の表が同じ鍵を持つ（★片方だけ足せない）', () => {
    /**
     * ⚠️ ★`CoatName = keyof typeof COAT_TRANSFORMS` なので、★型は片方しか見ていません。
     *    ★`DEFORMED_COAT_TRANSFORMS` に足し忘れると、★デフォルメの素材だけ ★**鹿毛のまま**焼かれます
     *    （★`coated()` は `t === undefined` を「素材そのまま」にするので、★静かに素通りします）。
     */
    expect(Object.keys(DEFORMED_COAT_TRANSFORMS).sort()).toEqual(Object.keys(COAT_TRANSFORMS).sort());
  });

  it('🔴 ★どの役にも、すべての毛色のファイルが在る（★目録だけ直して焼き忘れ、を止める）', () => {
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
    const missing: string[] = [];
    for (const set of m.sets) {
      for (const coat of m.coats) {
        const file = set.coats[coat];
        if (file === undefined) { missing.push(`${set.role}: ${coat} が目録に無い`); continue; }
        if (!existsSync(path.join(BAKED, file))) missing.push(`${set.role}: ${file} が無い`);
      }
    }
    expect(missing, `🔴 ★焼けていない組があります:\n   ${missing.join('\n   ')}`).toEqual([]);
  });
});
