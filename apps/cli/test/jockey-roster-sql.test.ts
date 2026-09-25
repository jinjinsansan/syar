/**
 * 🔴 ★**騎手の名簿: TS の `JOCKEYS` と DB の転記が一致する**
 *   ★裁定 `REVIEW_JOCKEY_FEE_20260925.md` ①（2026-09-25）・前例は配合の相性表の転記（`d85d591`）
 *
 * 【🔴 ★何を直したのか】
 *   ★正典 **D-105**「騎手の料金は EP」は ★**1 EP も効いていませんでした**。
 *   ★`enter_race` は `coalesce((p_jockey_frozen ->> 'feeEP')::int, 0)` で料金を取り、
 *   ★画面が送るのは `{ id: jockeyId }` だけ（★キーも違い `feeEP` も無い）→ ★**常に 0**。
 *   🔴 ★さらに ★**料金の出どころがクライアントの JSON**で、★繋いだら `feeEP: 0` で無料になる形でした（★憲法 3）。
 *   → ★`0082` で ★名簿を DB に転記し、★`enter_race` は `jockeyId` だけを受け取り、
 *     ★料金と凍結を ★**サーバーが名簿から作る**ようにしました。
 *
 * 【★正は TS・DB は転記】★発明ではありません。★ずれたらこの検査が落ちます（★D-052）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JOCKEYS, JOCKEY_BOND_MAX, JOCKEY_EFFECT } from '@star/scheduler';
import { lastFunctionBody, stripSqlComments } from './lib/sql-source.js';

const MIGRATION = path.resolve(__dirname, '../../../db/migrations/0082_jockey_roster_server_side.sql');

/** ★移行の `insert into jockeys ... values (...)` から行を読む */
function transcribed(): { id: string; name: string; feeEP: number; calm: number }[] {
  const sql = stripSqlComments(readFileSync(MIGRATION, 'utf8'));
  const m = sql.match(/insert into jockeys \(id, name, fee_ep, calm\) values([\s\S]*?)on conflict/i);
  if (m === null) throw new Error('★転記の insert が読めません（★切り出しが壊れている）');
  return [...m[1]!.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g)]
    .map((x) => ({ id: x[1]!, name: x[2]!, feeEP: Number(x[3]), calm: Number(x[4]) }));
}

describe('🔴 ★騎手の名簿（★TS ↔ DB の転記）', () => {
  it('★人数が一致する（★走査が空振りしていない）', () => {
    const rows = transcribed();
    expect(rows.length, '★転記が読めていない').toBeGreaterThan(0);
    expect(rows.length, `🔴 ★人数が違います（TS ${JOCKEYS.length} / DB ${rows.length}）`)
      .toBe(JOCKEYS.length);
  });

  it('🔴 ★id・名前・料金・落ち着きが 1 人ずつ一致する', () => {
    const rows = transcribed();
    const byId = new Map(rows.map((r) => [r.id, r]));
    const wrong: string[] = [];
    for (const j of JOCKEYS) {
      const r = byId.get(j.id);
      if (r === undefined) { wrong.push(`${j.id}: DB に無い`); continue; }
      if (r.name !== j.name) wrong.push(`${j.id}: 名前 TS「${j.name}」/ DB「${r.name}」`);
      if (r.feeEP !== j.feeEP) wrong.push(`${j.id}: 料金 TS ${j.feeEP} / DB ${r.feeEP}`);
      if (r.calm !== j.calm) wrong.push(`${j.id}: 落ち着き TS ${j.calm} / DB ${r.calm}`);
    }
    for (const r of rows) {
      if (!JOCKEYS.some((j) => j.id === r.id)) wrong.push(`${r.id}: TS に無い（★DB で発明している）`);
    }
    expect(wrong, '🔴 ★TS の名簿と DB の転記がずれています（★正は TS）').toEqual([]);
  });

  it('🔴 ★親密度の頭打ちと着順への効果も転記が一致する', () => {
    const { body } = lastFunctionBody('jockey_const');
    const num = (re: RegExp, label: string): number => {
      const all = [...body.matchAll(re)];
      if (all.length !== 1) throw new Error(`★${label}: 一致が ${all.length} 個`);
      return Number(all[0]![1]);
    };
    expect(num(/when\s+'bond_max'\s+then\s+return\s+(\d+)/gi, '頭打ち')).toBe(JOCKEY_BOND_MAX);
    expect(num(/when\s+'effect'\s+then\s+return\s+(\d+)/gi, '効果')).toBe(JOCKEY_EFFECT);
  });
});

describe('🔴 ★料金と凍結をサーバーが作る（★憲法 3）', () => {
  it('🔴 ★enter_race は jockeyId だけを受け取る（★jsonb を受けない）', () => {
    const { file, body } = lastFunctionBody('enter_race');
    /**
     * ⚠️ ★2026-09-25 に ★`0088` へ移りました（★戦績の数え方を `horse_wins()` に寄せたため）。
     *    ★この名指しは ★**「騎手の直しが後の定義でも生きているか」**を見るためです。
     *    ★`enter_race` を定義し直すたびに ★ここが赤くなります（★意図どおり）。
     *    → ★そのとき ★**下の 2 つ（`jsonb` を受けない・`jockey_frozen_build` を呼ぶ）が
     *      ★まだ成り立っているか**を人が見てから、★番号を進めてください。
     */
    expect(file, '★enter_race の最後の定義が 0088 ではない（★定義し直しが漏れた）')
      .toBe('0088_enter_race_record_one_place.sql');
    expect(body.slice(0, 300), '🔴 ★まだクライアントの JSON を受けています')
      .not.toMatch(/p_jockey_frozen\s+jsonb/);
    expect(body.slice(0, 300), '★p_jockey_id text を取ること').toMatch(/p_jockey_id\s+text/);
  });

  it('🔴 ★料金を名簿から引いている（★引数の JSON から読まない）', () => {
    const { body } = lastFunctionBody('enter_race');
    expect(body, '★jockey_frozen_build を呼ぶこと').toMatch(/jockey_frozen_build\(\s*p_jockey_id\s*,/);
    expect(body, '🔴 ★引数の JSON から料金を読んでいます')
      .not.toMatch(/p_jockey_frozen\s*->>/);
    expect(body, '★凍結はサーバーが作ったものを入れること')
      .toMatch(/p_strategy,\s*v_jockey_frozen,\s*p_client_token/);
  });

  /**
   * 🔴 ★**危ない署名を落としていること**。
   *   ★`create or replace` で型を変えると ★**多重定義**になり、
   *   ★`jsonb` を受ける版が ★呼べるまま残ります（★穴が開いたまま）。
   */
  it('🔴 ★jsonb を受ける古い enter_race を drop している', () => {
    const sql = stripSqlComments(readFileSync(MIGRATION, 'utf8'));
    expect(sql, '🔴 ★古い署名を落としていません（★多重定義で穴が残ります）')
      .toMatch(/drop function if exists public\.enter_race\(uuid,\s*uuid,\s*text,\s*jsonb,\s*uuid\)/i);
  });

  it('🔴 ★知らない騎手 id を「無料」にしない', () => {
    const { body } = lastFunctionBody('jockey_frozen_build');
    expect(body, '★名簿に無い id で落ちること').toMatch(/raise exception '騎手が名簿にいません/);
  });

  /**
   * 🔴 ★返金側が ★**「黙って 0」に戻っていない**こと（★裁定の指示）。
   *   ★`?? 0` のままだと、★料金が引かれていないことが ★帳簿に現れません。
   */
  it('🔴 ★返金側が feeEP を「黙って 0」にしていない', () => {
    const root = path.resolve(__dirname, '../../..');
    for (const f of ['apps/worker/src/entry-freeze.ts', 'apps/worker/src/entry-scratch-runner.ts']) {
      const src = readFileSync(path.join(root, f), 'utf8');
      expect(src, `🔴 ★${f} が feeEP を ?? 0 で読んでいます`)
        .not.toMatch(/feeEP\s*\?\?\s*0/);
      expect(src, `★${f} は jockeyFeeOfFrozen を使うこと`).toMatch(/jockeyFeeOfFrozen\(/);
    }
    const scratch = readFileSync(path.join(root, 'apps/worker/src/scratch.ts'), 'utf8');
    expect(scratch, '★凍結に feeEP が無ければ落とすこと').toMatch(/凍結に feeEP がありません/);
  });
});
