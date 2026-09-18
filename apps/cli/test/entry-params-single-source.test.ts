/**
 * ★**出走料と斤量の出どころは 1 つ**（★EF-1〜EF-4・2026-09-19）
 *   ★裁定 `REVIEW_UI1_SETUP_VERDICT_20260919.md`
 *
 * 【🔴 ★何が起きていたか — **追ったら既に三重帳簿でした**】
 *   | 量 | どこにあったか |
 *   |---|---|
 *   | 斤量 55 | ✔ 正＝`BASE_WEIGHT_KG`（`@star/race-engine`）／🔴 `race-field.ts` に **3 か所**／🔴 `enter_race` に **1 か所** |
 *   | 出走料 200 | 🔴 ★**TS に定数が無い**（`CAREER_ASSUMPTION` の**説明文の中**だけ）／🔴 `enter_race` に **1 か所** |
 *
 *   ★`/entry` を繋ごうとして ★**画面が 5 つ目・6 つ目の写しを作るところ**で止めました。
 *
 * 【★どう解いたか — **D-103 ④ の先例**】
 *   ★**正 ＝ TypeScript** → ★**ワーカーがレースの行に書く** → ★**RPC・ビュー・画面はその行を読む**。
 *
 * 【★この検査が守るもの】
 *   ① ★**SQL に値を直書きしていない**（★`v_fee := 200` / `weight ... 55` が戻っていない）
 *   ② ★**ワーカーが TS の定数を書いている**（★別の数を書いていない）
 *   ③ ★**画面が自分で持っていない**（★`apps/web/src` に 200 / 55 を書かない）
 *   ④ 🔴 ★**値が変わっていない**（**EF-4**）— ★登録料 200 EP は **正典 §3.4 の前提**で **GB-6 に噛む**
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ENTRY_FEE_EP } from '@star/scheduler';
import { BASE_WEIGHT_KG } from '@star/race-engine';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS = path.join(ROOT, 'db/migrations');

/** ★`--` のコメントと `comment on … ;` を落とす（★註記の語を拾わない・`rpc-guard` と同じ理由） */
const stripComments = (sql: string): string =>
  sql.replace(/--[^\n]*/g, ' ').replace(/\bcomment\s+on\b[\s\S]*?;/gi, ' ');

/** ★最後に定義された `enter_race` の本文（★`create or replace` は重なるので最後だけが効く） */
function lastEnterRace(): { file: string; body: string } {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  let found: { file: string; body: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\s*\.\s*)?enter_race\s*\(/gi;
    for (const m of sql.matchAll(re)) {
      const rest = sql.slice(m.index);
      const next = rest.slice(1).search(/create\s+(?:or\s+replace\s+)?function\s/i);
      found = { file, body: next === -1 ? rest : rest.slice(0, next + 1) };
    }
  }
  if (found === null) throw new Error('★enter_race の定義がありません（★走査が空・R-21）');
  return found;
}

describe('★EF-4: 値が変わっていない（★GB-6 に噛む）', () => {
  it('🔴 ★出走料は 200 EP のまま（★正典 §3.4 の 1 キャリアの収支の前提）', () => {
    expect(ENTRY_FEE_EP).toBe(200);
  });
  it('🔴 ★斤量は 55kg のまま（★§8.3）', () => {
    expect(BASE_WEIGHT_KG).toBe(55);
  });
});

describe('★EF-2: SQL に値を直書きしていない', () => {
  const { file, body } = lastEnterRace();
  const live = stripComments(body);

  it('★走査が空振りしていない（★本文を読めている・R-21）', () => {
    expect(live.length, `★${file} から本文を読めていない`).toBeGreaterThan(500);
    expect(live).toMatch(/insert into race_entries/i);
  });

  it('🔴 ① ★料金をレースの行から取っている（★`v_fee := 200` が戻っていない）', () => {
    expect(live, '★料金を直書きしている').not.toMatch(/v_fee\s*:=\s*\d/);
    expect(live, '★レースの行から取っていない').toMatch(/v_fee\s*:=\s*v_race\.entry_fee_ep/);
  });

  it('🔴 ② ★斤量をレースの行から取っている（★`55` が戻っていない）', () => {
    const insert = live.slice(live.search(/insert into race_entries/i));
    expect(insert, '★斤量を直書きしている').not.toMatch(/v_gate,\s*\d+\s*,/);
    expect(insert, '★レースの行から取っていない').toMatch(/v_race\.weight_kg/);
  });

  it('🔴 ③ ★値が無い行は通さない（★R-27・黙って「無料」にしない）', () => {
    expect(live).toMatch(/v_race\.entry_fee_ep\s+is\s+null[\s\S]{0,200}raise\s+exception/i);
    expect(live).toMatch(/v_race\.weight_kg\s+is\s+null[\s\S]{0,200}raise\s+exception/i);
  });

  it('🔴 ④ ★締切も行から取っている（★ED-1・★SQL に時間を直書きしない）', () => {
    /**
     * 🔴 ★旧: `scheduled_at <= now() + interval '60 minutes'`。
     *   ★レースの行が生まれるのは発走の 12 分前（`LOOKAHEAD_RACES` 2 × `CYCLE_MS` 6 分）なので、
     *   ★**どのレースも生まれた瞬間に「締切後」**でした（★照会 Q-ENTRY-1）。
     * ★新: ★**行に書かれた `entry_deadline_at`**（★正は TS の `PHASE_OFFSET_MS.publish`）。
     */
    expect(live, '★SQL に時間を直書きしている').not.toMatch(/interval\s*'[0-9]+\s*minutes?'/i);
    expect(live, '★行の締切を見ていない').toMatch(/now\(\)\s*>=\s*v_race\.entry_deadline_at/);
    expect(live).toMatch(/v_race\.entry_deadline_at\s+is\s+null[\s\S]{0,200}raise\s+exception/i);
  });
});

describe('★EF-2: ワーカーが TS の定数を書いている', () => {
  const src = readFileSync(path.join(ROOT, 'apps/worker/src/pg-store.ts'), 'utf8');

  it('★レースを作るとき、定数を渡している', () => {
    expect(src).toMatch(/ENTRY_FEE_EP/);
    expect(src).toMatch(/BASE_WEIGHT_KG/);
    expect(src).toMatch(/entry_fee_ep,\s*weight_kg/);
    /** ★締切も行に書く（★ED-1） */
    expect(src).toMatch(/entry_deadline_at/);
    expect(src).toMatch(/spec\.entryDeadlineAtMs/);
  });

  it('🔴 ★別の数を書いていない（★定数を通している）', () => {
    /**
     * ⚠️ ★**リテラル一致では見ません** — ★`55` は `substring(0, 55)` のような所にも出ます。
     *    ★「★定数を渡す行があるか」を見ます（★D-108 ③ の作法）。
     */
    // ⚠️ ★**引数の並びは `on conflict` の**後ろ**にあります**（★SQL の文字列の外）。
    //    ★旧版は `+ 800` で足りると思っていましたが、★註記が長くて届いていませんでした。
    const from = src.search(/insert into races \(/);
    const call = src.slice(from);   // ★引数の並びまで残らず見る
    expect(call, '★出走料の定数を渡していない').toContain('ENTRY_FEE_EP');
    expect(call, '★斤量の定数を渡していない').toContain('BASE_WEIGHT_KG');
  });
});

describe('★EF-3: 画面が自分で持っていない', () => {
  /** ★`apps/web/src` の全 `.ts` / `.tsx` */
  function webFiles(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      const f = path.join(dir, e);
      if (statSync(f).isDirectory()) out.push(...webFiles(f));
      else if (/\.tsx?$/.test(e)) out.push(f);
    }
    return out;
  }

  it('🔴 ★画面が出走料・斤量の定数を引いていない（★公開ビューから読む）', () => {
    const files = webFiles(path.join(ROOT, 'apps/web/src'));
    expect(files.length, '★画面の走査が空（R-21）').toBeGreaterThan(20);
    /**
     * ★**「どの口を引いているか」**で見ます（★数のリテラルでは見ません — ★`200` も `55` も
     * ★`borderRadius` や `height` に普通に出ます。★2026-09-16 にそれで誤検出しました）。
     * ⚠️ ★画面が `ENTRY_FEE_EP` を import すると、★**サーバーが行に書いた値と食い違う日**が来ます
     *    （★レースごとに違う額にした瞬間）。★**行を読ませます。**
     */
    const offenders = files.filter((f) => {
      const s = readFileSync(f, 'utf8');
      return /\bENTRY_FEE_EP\b/.test(s) || /\bBASE_WEIGHT_KG\b/.test(s);
    });
    expect(offenders.map((f) => path.relative(ROOT, f)), '★画面が定数を引いている').toEqual([]);
  });
});

describe('★EF-1: TS 側の写しが 1 つになっている', () => {
  it('🔴 ★`race-field.ts` が斤量を直書きしていない（★旧は 3 か所）', () => {
    const src = readFileSync(path.join(ROOT, 'apps/cli/src/race-field.ts'), 'utf8');
    expect(src, '★定数を引いていない').toMatch(/BASE_WEIGHT_KG/);
    /** ★`weightKg` / `baseWeightKg` に数を直書きしていない */
    expect(src, '★weightKg に数を直書きしている').not.toMatch(/weightKg:\s*\d/i);
    expect(src, '★baseWeightKg に数を直書きしている').not.toMatch(/baseWeightKg:\s*\d/i);
  });
});
