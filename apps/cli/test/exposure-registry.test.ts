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
import { EXPECTED_EXPOSURE, unregistered, stale, judgeGrants, judgeReads, WRITE_PRIVILEGES, PUBLIC_VIEW, OWNER_SCOPED, CLOSED, EXPECTED_FUNCTION_EXECUTE, unregisteredFunctions, staleFunctions, judgeFunctionExecute } from '../../../tools/lib/exposure-registry.mjs';

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

  it('公開ビューは5つで、いずれも _public 接尾辞', () => {
    /**
     * ⚠️ ★**一覧を名指しで書いています**（★数だけではなく）。
     *    ★★**公開ビューを 1 つ増やすのは、★外に出すものを増やすということ**です。
     *    ★ここが赤くなったら、★**名前を足す前に「未ログインに見せてよいか」を決めてください。
     * ★`world_state_public`（★2026-09-19・UI1-10）: ★週番号と「最後に書かれてからの秒数」だけ。
     *    ★番組表が既に未ログインで見られるので（`races_public`）、★週番号を隠す意味はない。
     */
    const views = Object.entries(EXPECTED_EXPOSURE).filter(([, k]) => k === PUBLIC_VIEW).map(([n]) => n);
    expect(views.sort()).toEqual([
      'prize_catalog_public', 'race_entries_public', 'race_odds_public', 'races_public', 'world_state_public',
    ]);
    for (const v of views) expect(v.endsWith('_public')).toBe(true);
  });
});

describe('V-20 ① 書き込み権限の検出（★実際に開いていた形をそのまま並べる）', () => {
  it('★TRUNCATE を書き込みとして数える（RLS はこれを止めない）', () => {
    // 2026-08-20 に本番・staging で実際にこの付与があった
    const grants = [
      { table_name: 'ep_ledger', grantee: 'anon', privilege_type: 'TRUNCATE' },
      { table_name: 'pp_ledger', grantee: 'anon', privilege_type: 'TRUNCATE' },
    ];
    expect(judgeGrants(grants)).toEqual([
      'ep_ledger.TRUNCATE(anon)',
      'pp_ledger.TRUNCATE(anon)',
    ]);
  });

  it('★users への UPDATE を検出する（他人の EP/PP を書き換えられた形）', () => {
    const grants = [{ table_name: 'users', grantee: 'anon', privilege_type: 'UPDATE' }];
    expect(judgeGrants(grants)).toEqual(['users.UPDATE(anon)']);
  });

  it.each(WRITE_PRIVILEGES as string[])('★%s を見逃さない', (priv) => {
    expect(judgeGrants([{ table_name: 't', grantee: 'anon', privilege_type: priv }])).toHaveLength(1);
  });

  it('SELECT / REFERENCES / TRIGGER は書き込みとして数えない', () => {
    const grants = ['SELECT', 'REFERENCES', 'TRIGGER'].map((p) => ({ table_name: 't', grantee: 'anon', privilege_type: p }));
    expect(judgeGrants(grants)).toEqual([]);
  });

  it('付与が空なら合格', () => {
    expect(judgeGrants([])).toEqual([]);
  });
});

describe('V-20 ② 読み取りの判定', () => {
  it('★公開ビュー以外が1行でも返したら漏洩として数える', () => {
    const r = judgeReads([
      { name: 'users', rows: 1 },
      { name: 'races_public', rows: 1 },
    ]);
    expect(r.leaked).toEqual(['users(1行)']);
    expect(r.viewsUnreadable).toEqual([]);
  });

  it('★無防備でも0行なら ② では捕まらない（だから ① が要る）', () => {
    // users が 0 行なのは「守られているから」ではなく「利用者がいないから」だった。
    // ★読み取り側だけでは安全と見えてしまうことを、この試験で明示しておく。
    const r = judgeReads([{ name: 'users', rows: 0 }]);
    expect(r.leaked).toEqual([]);
    // 同じ状態を ① は捕まえる
    expect(judgeGrants([{ table_name: 'users', grantee: 'anon', privilege_type: 'UPDATE' }])).toHaveLength(1);
  });

  it('★公開ビューが読めなくなったら不合格（塞ぎすぎも検出する）', () => {
    const r = judgeReads([{ name: 'races_public', rows: -1 }]);
    expect(r.viewsUnreadable).toEqual(['races_public']);
  });

  it('拒否された非公開テーブル（-1）は漏洩ではない', () => {
    expect(judgeReads([{ name: 'horses', rows: -1 }]).leaked).toEqual([]);
  });
});

describe('V-20 ④ 関数の EXECUTE（監査 H-4・2026-09-14）', () => {
  // ★判定の論理だけを固定する合成の登録簿（本物の期待値は staging の実測から書く）
  const registry = {
    'spend_training_ep(uuid,bigint,integer)': { anon: false, authenticated: false },
    'place_bet(uuid,text,jsonb,integer,uuid)': { anon: false, authenticated: true },
  };
  const names = Object.keys(registry);

  it('★登録簿に無い関数を検出する（新しい関数を黙って足せない）', () => {
    expect(unregisteredFunctions([...names, 'brand_new_fn()'], registry)).toEqual(['brand_new_fn()']);
    expect(unregisteredFunctions(names, registry)).toEqual([]);
  });

  it('★DB から消えたのに登録簿に残っている関数を検出する', () => {
    expect(staleFunctions(['place_bet(uuid,text,jsonb,integer,uuid)'], registry)).toEqual([
      'spend_training_ep(uuid,bigint,integer)',
    ]);
  });

  it('★anon に EXECUTE が残っていたら検出する（0013・0014 が anon を剥がし忘れていた形）', () => {
    expect(
      judgeFunctionExecute([{ fn: 'spend_training_ep(uuid,bigint,integer)', anon: true, authenticated: false }], registry),
    ).toEqual(['spend_training_ep(uuid,bigint,integer).EXECUTE(anon) 実測=true 期待=false']);
  });

  it('★塞ぎすぎも検出する（利用者の RPC から authenticated を剥がした形）', () => {
    expect(
      judgeFunctionExecute([{ fn: 'place_bet(uuid,text,jsonb,integer,uuid)', anon: false, authenticated: false }], registry),
    ).toEqual(['place_bet(uuid,text,jsonb,integer,uuid).EXECUTE(authenticated) 実測=false 期待=true']);
  });

  it('登録簿どおりなら何も出ない／未登録の関数はここでは数えない（④の未登録は別の判定が見る）', () => {
    expect(
      judgeFunctionExecute(
        [
          { fn: 'spend_training_ep(uuid,bigint,integer)', anon: false, authenticated: false },
          { fn: 'place_bet(uuid,text,jsonb,integer,uuid)', anon: false, authenticated: true },
          { fn: 'brand_new_fn()', anon: true, authenticated: true },
        ],
        registry,
      ),
    ).toEqual([]);
  });

  it('★本物の登録簿: ワーカー専用の spend_training_ep は anon にも authenticated にも実行させない（staging 実測・0021 適用後）', () => {
    expect(EXPECTED_FUNCTION_EXECUTE['spend_training_ep(uuid,bigint,integer)']).toEqual({ anon: false, authenticated: false });
    // ★ガード自身は anon に実行させない（0019）
    expect(EXPECTED_FUNCTION_EXECUTE['assert_setup_complete()']?.anon).toBe(false);
    // ★利用者の RPC は authenticated だけが実行できる（anon には実行させない・0022・照会 Q2 ／ 塞ぎすぎていない）
    expect(EXPECTED_FUNCTION_EXECUTE['place_bet(uuid,text,jsonb,integer,uuid)']).toEqual({ anon: false, authenticated: true });
    expect(EXPECTED_FUNCTION_EXECUTE['exchange_prize(bigint,uuid)']).toEqual({ anon: false, authenticated: true });
    // ★登録簿に無い関数は、本物の登録簿でも未登録として落ちる
    expect(unregisteredFunctions(['brand_new_fn()'])).toEqual(['brand_new_fn()']);
  });
});
