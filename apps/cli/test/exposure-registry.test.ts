/**
 * ★V-20 ③ — 登録簿に無いテーブルが現れたら落ちること。
 *
 * 【なぜ ③ が本体か】
 *   ①（書き込み権限が無い）と ②（公開ビュー以外は0行）は**今の状態**を測ります。
 *   しかし穴は**新しいテーブルを足したとき**に開きます — Supabase の既定が
 *   `grant all ... to anon, authenticated` なので、**何もしなければ開いた状態で生まれます**。
 *   `0017` に RLS が入ったのはレビュー側が要求したからで、構造が要求したからではありませんでした。
 *
 *   → **登録簿と全走査を突き合わせ、知らないテーブルがあったら落とす。**
 *     ★これは `tools/lib/classification.mjs`（ツールを足したら分類を書け）と同じ形です。
 *
 * 【この試験が守るもの】
 *   登録簿の突き合わせ関数そのもの。**DB を要さずに、判定の論理だけを固定する**
 *   （実際の DB に対する判定は `tools/verify-anon-exposure.mjs`）。
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error -- .mjs の素の JS を読む（型定義は置いていない）
import { EXPECTED_EXPOSURE, unregistered, stale, PUBLIC_VIEW, OWNER_SCOPED, CLOSED } from '../../../tools/lib/exposure-registry.mjs';

const registered = Object.keys(EXPECTED_EXPOSURE) as string[];

describe('V-20 ③ 登録簿との突き合わせ', () => {
  it('★登録簿に無いテーブルを検出する（新しいテーブルを黙って足せない）', () => {
    expect(unregistered([...registered, 'brand_new_table'])).toEqual(['brand_new_table']);
  });

  it('登録簿どおりなら何も出ない', () => {
    expect(unregistered(registered)).toEqual([]);
  });

  it('★DB から消えたのに登録簿に残っているものを検出する', () => {
    const withoutOne = registered.filter((n) => n !== 'users');
    expect(stale(withoutOne)).toContain('users');
  });

  it('登録簿の区分は3種類のいずれか', () => {
    const allowed = new Set([PUBLIC_VIEW, OWNER_SCOPED, CLOSED]);
    for (const [name, kind] of Object.entries(EXPECTED_EXPOSURE)) {
      expect(allowed.has(kind), `${name} の区分が不正: ${String(kind)}`).toBe(true);
    }
  });
});

describe('V-20 登録簿の中身（★正典の要求と直結する項目）', () => {
  it('★potential / genotype を持つ horses は closed', () => {
    expect(EXPECTED_EXPOSURE['horses']).toBe(CLOSED);   // §12.4・§5.5
  });

  it('★server_seed を持つ races は closed（公開は races_public 経由）', () => {
    expect(EXPECTED_EXPOSURE['races']).toBe(CLOSED);    // §8.6 Provably Fair
  });

  it('★残高を持つ users は owner_scoped（公開ビューにしない）', () => {
    // 将来「馬主名を出したい」となっても、ここを public_view にせず users_public を別に作る
    expect(EXPECTED_EXPOSURE['users']).toBe(OWNER_SCOPED);
  });

  it('★外部 ID の対応表 user_identities は closed（本人にも見せる理由がない）', () => {
    expect(EXPECTED_EXPOSURE['user_identities']).toBe(CLOSED);   // D-078・旧 V-19 #15
  });

  it('★レース生成の入力 npc_stables は closed（書き換えは §8.6 の証明範囲外）', () => {
    expect(EXPECTED_EXPOSURE['npc_stables']).toBe(CLOSED);
  });

  it('公開ビューは4つで、いずれも _public 接尾辞', () => {
    const views = Object.entries(EXPECTED_EXPOSURE).filter(([, k]) => k === PUBLIC_VIEW).map(([n]) => n);
    expect(views.sort()).toEqual(['prize_catalog_public', 'race_entries_public', 'race_odds_public', 'races_public']);
    for (const v of views) expect(v.endsWith('_public')).toBe(true);
  });
});
