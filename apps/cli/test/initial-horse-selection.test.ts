/**
 * ★**初期馬の絞り方**（`0037`・UI1-6 / **UI1-7**・2026-09-19）
 *   ★裁定 `REVIEW_UI1_SELECTION_RULE_VERDICT_20260919.md`
 *
 * 【🔴 ★この検査が守っているもの — **D-079 ③**】
 *   > 「★**再付与で得られる素質分布が初回と同じ**」
 *
 *   | 案 | なぜ駄目／良いか |
 *   |---|---|
 *   | 🔴 `order by id limit 1` | ★プールの先頭から順に消費され、★初回と再付与で分布が変わりえる |
 *   | 🔴 `auth.uid()` のハッシュ | ★**D-079 ① が「user_id のハッシュを使わない」と明示** |
 *   | ✅ `order by random()` | ★分布が保たれる |
 *
 *   ⚠️ ★**これが無いと、次に誰かが `order by id` に「最適化」します**（★裁定の言葉）。
 *      ★`order by random()` は全表を並べ替えるので、★**遅いから直そう**という動機が自然に湧きます。
 *      → ★**「なぜ遅い方を選んでいるか」を検査に固定します。**
 *
 * 【★この検査で見ないもの】
 *   ⚠️ ★**実際に引いた分布が候補プールと一致するか**は、★**DB が要ります**。
 *      ★それは `tools/verify-initial-horse-distribution.mjs` が staging で測ります（R-30:
 *      ★測定器は評価者と同じ入力を見る ＝ ★**`pick_initial_horse()` を直に呼ぶ**）。
 *   ★ここは ★**SQL の形**だけを見ます（★DB に繋ぎません）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(__dirname, '../../../db/migrations');

/** ★`--` のコメントを消す（★註記の語を拾わない） */
const stripLineComments = (sql: string): string => sql.replace(/--[^\n]*/g, ' ');
/** ★`comment on … ;` を落とす（★文字列リテラルに書いた説明を拾わない・`rpc-guard` と同じ理由） */
const stripComments = (sql: string): string =>
  stripLineComments(sql).replace(/\bcomment\s+on\b[\s\S]*?;/gi, ' ');

/**
 * ★**最後に定義された関数の本体**を返す（★`create or replace` は重ねられるので、★最後だけが効く）。
 * ⚠️ ★走査の対象は ★**全マイグレーション**です（★`0037` を名指ししません） —
 *    ★誰かが `0040` で上書きしたら、★**そちらを見なければ意味がありません**（R-19）。
 */
function lastBodyOf(name: string): { file: string; body: string } {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  let found: { file: string; body: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(path.join(DIR, file), 'utf8');
    const re = new RegExp(
      `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\s*\\.\\s*)?${name}\\s*\\(`,
      'gi',
    );
    for (const m of sql.matchAll(re)) {
      const rest = sql.slice(m.index);
      const next = rest.slice(1).search(/create\s+(?:or\s+replace\s+)?function\s/i);
      found = { file, body: next === -1 ? rest : rest.slice(0, next + 1) };
    }
  }
  if (found === null) throw new Error(`★${name} の定義がマイグレーションにありません（★走査が空・R-21）`);
  return found;
}

describe('★初期馬の絞り方（UI1-7・D-079 ①③）', () => {
  const pick = lastBodyOf('pick_initial_horse');
  const body = stripComments(pick.body);

  it('★走査が空振りしていない（★本体を実際に読めている・R-21）', () => {
    expect(body.length, `★${pick.file} から本体を読めていない`).toBeGreaterThan(100);
    expect(body).toMatch(/initial_horse_candidates/);
  });

  it('🔴 ① ★無作為に並べている（★D-079 ③「再付与で分布が同じ」）', () => {
    expect(body, '★order by random() が無い').toMatch(/order\s+by\s+random\s*\(\s*\)/i);
  });

  it('🔴 ② ★固定順で並べていない（★`order by id` に「最適化」されていない）', () => {
    /**
     * ★`order by <列>` のうち、★**無作為でないもの**を拾います。
     * ⚠️ ★`order by shuffled.rn` は ★**無作為の並びをそのまま使うため**のものなので、通します
     *    （★`rn` は `row_number() over (order by random())` から来ています — ★①が別に見ています）。
     */
    /**
     * ⚠️ ★**`)` で切らないこと** — ★`order by random()` の `)` まで含めて読みます。
     *    ★旧版は `)` の手前で切っており、★**`order by random(` と読んで自分で自分を赤くしました**。
     */
    const orders = [...body.matchAll(/order\s+by\s+([^\n]+)/gi)].map((m) => m[1]!.trim());
    expect(orders.length, '★order by が 1 つも無い').toBeGreaterThan(0);
    for (const o of orders) {
      const ok = /random\s*\(\s*\)/i.test(o) || /\brn\b/.test(o);
      expect(ok, `🔴 ★固定順で並べています: order by ${o}`).toBe(true);
    }
  });

  it('🔴 ③ ★`auth.uid()` から導いていない（★D-079 ① が明示的に禁じている）', () => {
    expect(body, '★本体で auth.uid() を使っている').not.toMatch(/auth\s*\.\s*uid\s*\(/i);
    /** ★ハッシュで導く形（★`md5`・`hashtext`・`uuid` の並べ替え）も塞ぐ */
    for (const bad of ['md5', 'hashtext', 'digest', 'encode']) {
      expect(body.toLowerCase(), `★ハッシュで導いています: ${bad}`).not.toContain(bad);
    }
  });

  it('🔴 ④ ★同時登録で同じ馬を 2 人に渡さない（★行を掴む）', () => {
    expect(body, '★for update が無い').toMatch(/for\s+update/i);
    expect(body, '★skip locked が無い（★もう 1 人が待たされます）').toMatch(/skip\s+locked/i);
  });

  it('★候補の条件を書き写していない（★D-052・述語は 1 か所）', () => {
    /**
     * ★`pick_initial_horse` は ★**`initial_horse_candidates()` を呼ぶだけ**で、
     * ★候補の条件（`owner_id is null` など）を ★**自分では持ちません**。
     * ⚠️ ★書き写すと、★**片方を直した日に静かに食い違います**（★この案件は同じ形で繰り返し失敗）。
     */
    for (const dup of ['owner_id is null', 'npc_stable_id', 'retired_at_week', 'finish_pos']) {
      expect(body, `🔴 ★候補の条件を書き写しています: ${dup}`).not.toContain(dup);
    }
  });
});

describe('★候補の条件は 1 か所だけが持つ（UI1-1・D-052）', () => {
  const candidates = lastBodyOf('initial_horse_candidates');
  const predicate = lastBodyOf('is_initial_horse_candidate');

  it('★集合の側が条件を持っている', () => {
    const body = stripComments(candidates.body);
    for (const cond of ['owner_id is null', 'npc_stable_id', 'retired_at_week', 'finish_pos']) {
      expect(body, `★${cond} が集合の側に無い`).toContain(cond);
    }
  });

  it('🔴 ★述語の側は条件を持たず、集合に委ねている', () => {
    const body = stripComments(predicate.body);
    expect(body, '★集合を呼んでいない').toMatch(/initial_horse_candidates\s*\(/);
    for (const dup of ['owner_id is null', 'npc_stable_id', 'retired_at_week', 'finish_pos']) {
      expect(body, `🔴 ★条件を書き写しています: ${dup}`).not.toContain(dup);
    }
  });
});

describe('★create_account が初期馬を中で選ぶ（UI1-2・D-074）', () => {
  const create = lastBodyOf('create_account');
  const body = stripComments(create.body);

  it('🔴 ① ★`p_horse_id` を省略できる（★画面は id を渡せない）', () => {
    expect(body, '★p_horse_id に既定値が無い').toMatch(/p_horse_id\s+uuid\s+default\s+null/i);
  });

  it('🔴 ② ★省略されたら中で選ぶ', () => {
    expect(body, '★pick_initial_horse() を呼んでいない').toMatch(/pick_initial_horse\s*\(\s*\)/i);
  });

  it('🔴 ③ ★渡された場合も候補かどうかを確かめる（★呼ぶ側の申告を信用しない・憲法 3）', () => {
    expect(body).toMatch(/is_initial_horse_candidate\s*\(/i);
  });

  it('🔴 ④ ★候補が尽きたら落ちる（★黙って帯を広げない・D-079 ⑦）', () => {
    /** ★`v_horse` が null のまま先へ進まないこと */
    expect(body, '★候補が無いときに落とす経路が無い').toMatch(/v_horse\s+is\s+null[\s\S]{0,200}raise\s+exception/i);
  });

  it('★冪等が残っている（V-19 ⑭・★口座を作る側の登録簿の条件 ③）', () => {
    expect(body).toMatch(/dedupe_key/);
    expect(body, '★upsert を書いていない（★2 回目はここで落ちて全部戻る）').not.toMatch(/on\s+conflict/i);
  });
});
