/**
 * ★**投票の上限は 1 か所**（★BT-1〜BT-4・2026-09-19）
 *   ★裁定 `REVIEW_BET_LIMITS_VERDICT_20260919.md`
 *
 * 【★BT-0 — この便の原理】
 *   > ★**画面に渡すのは「判断の材料」ではなく「判断の結果」にする。**
 *   > ★材料を渡すと、画面が判断を組み立て、★そこに第 2 の規則ができる。
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**SQL に上限が直書きで戻る**（★4 つ・D-052）
 *   ② 🔴 ★**規則が 2 か所になる**（★RPC とビューが別々に比較する・BT-2）
 *      ★ずれると「押してから弾かれる」か「買えるのに買えないと出る」。★後者は**誰も気づかない**
 *   ③ 🔴 ★**内訳が外に出る**（★呼ぶ側が `min` を取れると、優先順位が外に漏れる）
 *   ④ 🔴 ★**画面が馬名で自馬を突き合わせる**（★`horses.name` に一意制約は無い・BT-3）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  BET_CAP_PER_KIND_EP, BET_CAP_PER_RACE_EP, BET_CAP_PER_DAY_EP, BET_CAP_OWN_RACE_EP, BET_CAP_LABEL,
} from '@star/betting';

const ROOT = path.resolve(__dirname, '../../..');
const DIR = path.join(ROOT, 'db/migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const sqlOf = (f: string): string => readFileSync(path.join(DIR, f), 'utf8');
/** ★`--` のコメントを落とす（★註記の語を拾わない） */
const strip = (s: string): string => s.replace(/--[^\n]*/g, ' ').replace(/\bcomment\s+on\b[\s\S]*?;/gi, ' ');

/** ★最後に定義された関数の本文（★`create or replace` は重なる・R-19） */
function lastFunction(name: string): { file: string; body: string } {
  let found: { file: string; body: string } | null = null;
  for (const file of files) {
    const sql = sqlOf(file);
    const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\s*\\.\\s*)?${name}\\s*\\(`, 'gi');
    for (const m of sql.matchAll(re)) {
      const rest = sql.slice(m.index);
      const next = rest.slice(1).search(/create\s+(?:or\s+replace\s+)?function\s/i);
      found = { file, body: next === -1 ? rest : rest.slice(0, next + 1) };
    }
  }
  if (found === null) throw new Error(`★${name} の定義がありません（★走査が空・R-21）`);
  return found;
}

describe('★BT-4 ④: 値が 1 ビットも変わっていない（§9.4・§9.5）', () => {
  it('🔴 ★§9.4 の 3 つと §9.5 の 1 つ', () => {
    /** ⚠️ ★これは**賭博性の分水嶺に関わる数**です。★動かすなら正典の改訂 */
    expect(BET_CAP_PER_KIND_EP).toBe(30_000);
    expect(BET_CAP_PER_RACE_EP).toBe(50_000);
    expect(BET_CAP_PER_DAY_EP).toBe(500_000);
    expect(BET_CAP_OWN_RACE_EP).toBe(5_000);
  });

  it('★自馬レースの上限は「1 レース合計」より厳しい（★上書きになっている）', () => {
    expect(BET_CAP_OWN_RACE_EP).toBeLessThan(BET_CAP_PER_RACE_EP);
  });
});

describe('★BT-1 ①: SQL に上限が直書きで戻っていない', () => {
  const pb = strip(lastFunction('place_bet').body);

  it('🔴 ★`place_bet` に 4 つの数が無い', () => {
    for (const cap of ['30000', '50000', '500000', '5000']) {
      expect(pb, `★上限が直書きに戻っている: ${cap}`).not.toContain(cap);
    }
  });

  it('🔴 ★`place_bet` が `bet_allowance()` を呼んでいる', () => {
    expect(pb, '★規則を自分で持っている').toMatch(/bet_allowance\(/);
  });

  it('★§9.5 の「自馬を全頭含む」は `place_bet` に残っている（★金額の話ではない）', () => {
    expect(pb, '★買い目の形の判定が消えている').toMatch(/p_selection\s*@>\s*to_jsonb/);
  });
});

describe('★BT-2: 規則は 1 本だけが持つ', () => {
  const alw = strip(lastFunction('bet_allowance').body);
  const ALL = files.map((f) => strip(sqlOf(f))).join('\n');

  it('★走査が空振りしていない（R-21）', () => {
    expect(alw.length, '★本文が読めていない').toBeGreaterThan(500);
  });

  it('🔴 ★「いちばんきついものを選ぶ」のは `bet_allowance` だけ', () => {
    expect(alw, '★最小を取る所が無い').toMatch(/least\(/);
    /** ★ビューも RPC も、自分では `least` を取らない */
    const view = /create or replace view my_bet_allowance as([\s\S]*?);/i.exec(ALL);
    expect(view, '★my_bet_allowance のビューが無い').not.toBeNull();
    expect(view![1]!, '★ビューが自分で最小を取っている').not.toMatch(/least\(/);
    expect(strip(lastFunction('place_bet').body), '★RPC が自分で最小を取っている').not.toMatch(/least\(/);
  });

  it('🔴 ★ビューも RPC も、同じ 1 本を呼んでいる', () => {
    const view = /create or replace view my_bet_allowance as([\s\S]*?);/i.exec(ALL)![1]!;
    expect(view, '★ビューが bet_allowance を呼んでいない').toMatch(/bet_allowance\(/);
    expect(strip(lastFunction('place_bet').body)).toMatch(/bet_allowance\(/);
  });

  it('🔴 ★BT-1 ③: 内訳（4 つの残り）を返していない', () => {
    /**
     * ★返す列は ★**残り 1 つ ＋ 効いている上限の名前**だけ。
     * ⚠️ ★内訳を返すと、★**呼ぶ側が `min` を取れてしまい**、
     *    ★「どれが優先か」という第 5 の知識が外に出ます（R-29）。
     */
    const sig = /returns table \(([^)]*)\)/i.exec(alw);
    expect(sig, '★戻りの型が読めない').not.toBeNull();
    const cols = sig![1]!.split(',').map((c) => c.trim().split(/\s+/)[0]!);
    expect(cols.sort()).toEqual(['binding', 'binding_label', 'remaining_ep']);
  });

  it('★上限は `bet_limits` の行から読む（★関数が数を持たない）', () => {
    expect(alw, '★bet_limits を読んでいない').toMatch(/from bet_limits/);
    for (const cap of ['30000', '50000', '500000', '5000']) {
      expect(alw, `★関数が数を持っている: ${cap}`).not.toContain(cap);
    }
  });

  it('🔴 ★BT-4 ②: 行が無ければ通さない（R-27）', () => {
    expect(alw).toMatch(/not found then[\s\S]{0,200}raise exception/i);
  });
});

describe('★BT-4 ①: ワーカーが毎周書く', () => {
  const worker = readFileSync(path.join(ROOT, 'apps/worker/src/main.ts'), 'utf8');

  it('🔴 ★TypeScript の定数を渡している（★数を写していない）', () => {
    expect(worker).toMatch(/BET_CAP_PER_KIND_EP/);
    expect(worker).toMatch(/insert into bet_limits/);
  });

  it('🔴 ★「変わったときだけ」になっていない（★止まったのと区別できなくなる）', () => {
    /**
     * ★`world_state` と同じ形（★毎周 `insert … on conflict do update`）。
     * ⚠️ ★`if (changed)` のような分岐で囲まれていないこと。
     */
    const at = worker.indexOf('insert into bet_limits');
    const before = worker.slice(Math.max(0, at - 400), at);
    expect(before, '★条件付きで書いている').not.toMatch(/if\s*\([^)]*chang/i);
    expect(worker.slice(at, at + 600)).toMatch(/on conflict \(id\) do update/);
  });
});

describe('★BT-3: 馬名で突き合わせない', () => {
  const ALL = files.map((f) => strip(sqlOf(f))).join('\n');

  it('🔴 ★`horses.name` に一意制約が無いことを、実物で確かめる', () => {
    /**
     * 🔴 ★開発側は「馬名は一意（`0001` の一意制約）」と書きました — ★**存在しません**。
     *    ★**測っていない前提**でした（★R-21 の家族）。
     * ⚠️ ★staging では 7,370 / 7,370 で**たまたま**一致しています — ★だから危ないのです。
     */
    expect(ALL, '★馬名に一意索引ができている（★前提が変わったので検査を見直すこと）')
      .not.toMatch(/unique[^;]*\bhorses\b[^;]*\(name\)/i);
  });

  it('🔴 ★出走表が「これは自分の馬か」を返す', () => {
    const view = /create or replace view race_entries_public as([\s\S]*?);/gi;
    const hits = [...ALL.matchAll(view)];
    expect(hits.length, '★出走表のビューが無い').toBeGreaterThan(0);
    const last = hits[hits.length - 1]![1]!;
    expect(last, '★is_mine が無い').toMatch(/\bis_mine\b/);
    expect(last, '★auth.uid() で判定していない').toMatch(/auth\.uid\(\)/);
  });

  it('🔴 ★`owner_id` は出していない（★`0006` の註記のまま）', () => {
    const hits = [...ALL.matchAll(/create or replace view race_entries_public as([\s\S]*?);/gi)];
    const last = hits[hits.length - 1]![1]!;
    /** ★`h.owner_id` は **判定の中**でだけ使い、★**列としては出さない** */
    expect(last, '★owner_id を列として出している').not.toMatch(/owner_id\s+as\b|,\s*h\.owner_id\s*,/);
  });

  it('★画面が馬名で突き合わせていない', () => {
    const screen = readFileSync(path.join(ROOT, 'apps/web/src/lib/bet-screen.ts'), 'utf8');
    const live = screen.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    expect(live, '★馬名の集合で突き合わせている').not.toMatch(/myNames/);
    expect(live, '★is_mine を使っていない').toMatch(/is_mine/);
  });
});

describe('★言葉（★「達しています」と書かない）', () => {
  it('🔴 ★上限の名前であって、達したかどうかではない', () => {
    for (const [k, label] of Object.entries(BET_CAP_LABEL)) {
      expect(label, `★${k} が「達した」と言っている`).not.toContain('達し');
    }
    /** ★名前が空でないこと（`none` を除く） */
    for (const k of ['kind', 'race', 'day', 'own_race', 'balance'] as const) {
      expect(BET_CAP_LABEL[k].length, `★${k} の言葉が空`).toBeGreaterThan(0);
    }
  });

  it('🔴 ★SQL の側も同じ（★`bet_allowance` が返す言葉）', () => {
    const alw = strip(lastFunction('bet_allowance').body);
    const labels = [...alw.matchAll(/binding_label\s*:=[^;]*?'([^']+)'/g)].map((m) => m[1]!);
    expect(labels.length, '★言葉が読めていない').toBeGreaterThan(2);
    for (const l of labels) expect(l, `★SQL が「達した」と言っている: ${l}`).not.toContain('達し');
  });
});
