/**
 * ★週送りで失敗した馬だけを飛ばす（照会 Q1・AUDIT_FIX2 BF-1・2026-09-14）
 *
 * 偽の DB で `advanceTrainingWeeks` を本物のまま回します（週送りの純ロジック `advanceWeek` も本物）。
 *
 * 【★頭数と溜まった週数を「実行の上限にちょうど収まる量」にしてある】
 *   4,000 頭（`BATCH_SIZE` 2,000 の倍数）× 8 週（`MAX_WEEKS_PER_RUN`）
 *   → 上限は 16 バッチ × 2,000 枠 ＝ 32,000 枠。進めるべきは 3,999 頭 × 8 週 ＝ 31,992。
 *   ★失敗し続ける馬を除かないと、その馬（ID が最小）が毎回先頭の 1 枠を食い、
 *     ID が最大の馬が最後まで選ばれずに目標の週へ届かない。**除外の効き目を「全頭が届くか」で測れる。**
 *
 * 【偽の DB が SQL の文面に従う】
 *   除外は、選ぶ SQL にその句（`not (id = any($3::uuid[]))`）があるときだけ効かせます。
 *   ★パラメータだけで除くと、製品の SQL から句を消しても偽の DB が除き続け、変異を捕まえられません（R-30）。
 */
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { ABILITY_KEYS } from '@star/sim-engine';
import { WEEK_MS, weekIndexAt } from '@star/scheduler';
import { BATCH_SIZE, EP_SHORT_SQLSTATE, MAX_WEEKS_PER_RUN, advanceTrainingWeeks } from '../src/training-runner.js';
// ★FK-6: ★偽物が読んでいない述語を、★製品の文面で見張るため
import { readFileSync } from 'node:fs';
import nodePath from 'node:path';

const SRC = readFileSync(nodePath.join(nodePath.resolve(__dirname, '..'), 'src/training-runner.ts'), 'utf8');
/** ★註記を外した本文（★註記の中の語に一致して緑にしない・CK-1） */
const LIVE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const EXCLUDE_CLAUSE = 'not (id = any($3::uuid[]))';
const TARGET = 300;
const PENDING = MAX_WEEKS_PER_RUN;
const N = 2 * BATCH_SIZE;

const uuid = (i: number): string => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
/** ★ID が最小で、常に EP 不足以外の理由で失敗する馬 */
const FAIL_ID = uuid(0);
/** ★常に EP 不足（ST001）で失敗する馬。休養に落ちて進む */
const SHORT_ID = uuid(1);

interface FakeHorse {
  id: string;
  owner_id: string | null;
  sex: string;
  growth: string;
  temper: number;
  durability: number;
  potential: Record<string, number>;
  stats: Record<string, number>;
  birth_week: number;
  last_processed_week: number;
  fatigue: number;
  condition: number;
  rest_until_week: number | null;
  career_ended: boolean;
}

function makeHorses(): FakeHorse[] {
  return Array.from({ length: N }, (_, i) => ({
    id: uuid(i),
    owner_id: i === 0 || i === 1 ? 'owner-1' : null,
    sex: i % 2 === 0 ? 'male' : 'female',
    growth: 'normal',
    temper: 50,
    durability: 650,
    potential: Object.fromEntries(ABILITY_KEYS.map((k) => [k, 800])),
    stats: Object.fromEntries(ABILITY_KEYS.map((k) => [k, 400])),
    // 週齢 120（調教できる年齢）から 8 週ぶん溜まっている
    birth_week: TARGET - PENDING - 120,
    last_processed_week: TARGET - PENDING,
    fatigue: 20,
    condition: 3,
    rest_until_week: null,
    career_ended: false,
  }));
}

function fakeDb(horses: FakeHorse[]): {
  client: pg.Client;
  selects: { sql: string; params: readonly unknown[] }[];
} {
  const byId = new Map(horses.map((h) => [h.id, h]));
  const selects: { sql: string; params: readonly unknown[] }[] = [];
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      if (sql.startsWith('select count(*)')) return { rows: [{ n: String(horses.length) }], rowCount: 1 };
      if (sql.includes('from horses') && sql.includes('order by id')) {
        // ★パラメータは呼ばれた時点の値を写し取って記録する。製品は失敗した馬の一覧（同じ配列）を後から追記するので、
        //   参照のまま持つと 1 回目の記録まで書き換わって見える（本物の pg は呼んだ時点の値を送る）
        selects.push({ sql, params: params.map((p) => (Array.isArray(p) ? [...p] : p)) });
        const target = params[0] as number;
        const limit = params[1] as number;
        // ★SQL の文面にある条件だけを効かせる（上の註記）
        const excluded = new Set(sql.includes(EXCLUDE_CLAUSE) ? ((params[2] as string[] | undefined) ?? []) : []);
        const rows = horses
          .filter((h) => h.last_processed_week < target && !excluded.has(h.id))
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .slice(0, limit)
          .map((h) => ({ ...h }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('spend_training_ep')) {
        const id = params[0] as string;
        if (id === FAIL_ID) throw Object.assign(new Error('未認証'), { code: 'P0001' });
        if (id === SHORT_ID) throw Object.assign(new Error('EP が不足している'), { code: EP_SHORT_SQLSTATE });
        return { rows: [{ bal: '100000' }], rowCount: 1 };
      }
      if (sql.includes('update horses h set')) {
        const ids = params[0] as string[];
        const lasts = params[1] as number[];
        const fatigues = params[2] as number[];
        const conditions = params[3] as number[];
        ids.forEach((id, i) => {
          const h = byId.get(id)!;
          h.last_processed_week = lasts[i]!;
          h.fatigue = fatigues[i]!;
          h.condition = conditions[i]!;
        });
        return { rows: [], rowCount: ids.length };
      }
      /**
       * ★**利用者の指示**（★`0057`・2026-09-20）。★この検査では ★**指示なし**を返します。
       *   ⚠️ ★指示が在る場合の挙動は ★別の検査の仕事です（★ここは「失敗した馬だけ飛ばす」を見る）。
       */
      if (sql.includes('from training_orders')) return { rows: [], rowCount: 0 };
      throw new Error(`偽の DB が想定していない SQL: ${sql.slice(0, 60)}`);
    },
  };
  return { client: client as unknown as pg.Client, selects };
}

describe('BF-1 週送りで失敗した馬だけを飛ばす（照会 Q1）', () => {
  it('★前提: 頭数は BATCH_SIZE の倍数・溜まった週数は上限の週数（上の註記の「ちょうど収まる量」）', () => {
    expect(N % BATCH_SIZE).toBe(0);
    expect(N).toBeGreaterThan(BATCH_SIZE);
    expect(PENDING).toBe(MAX_WEEKS_PER_RUN);
    const nowMs = (TARGET + 1) * WEEK_MS + 1;
    expect(weekIndexAt(nowMs, 0) - 1).toBe(TARGET);
  });

  it('★1 回の実行で、失敗した馬以外の全頭が目標の週まで進み、失敗した馬は選び直されない', async () => {
    const horses = makeHorses();
    const { client, selects } = fakeDb(horses);
    const alerts: string[] = [];
    const nowMs = (TARGET + 1) * WEEK_MS + 1;
    const r = await advanceTrainingWeeks(client, nowMs, 0, (m) => alerts.push(m));

    // ① 失敗した馬以外は全頭が目標の週まで進む
    const notReached = horses.filter((h) => h.id !== FAIL_ID && h.last_processed_week !== TARGET);
    expect(notReached.map((h) => h.id), '目標の週に届いていない馬').toEqual([]);
    expect(horses.find((h) => h.id === FAIL_ID)!.last_processed_week).toBe(TARGET - PENDING);
    expect(r.advanced).toBe((N - 1) * PENDING);

    // ② 2 回目以降のバッチを選ぶ SQL のパラメータに、失敗した馬の ID が含まれる
    expect(selects.length).toBeGreaterThan(1);
    expect(selects[0]!.sql).toContain(EXCLUDE_CLAUSE);
    expect(selects[0]!.params[2]).toEqual([]);
    for (const s of selects.slice(1)) expect(s.params[2]).toContain(FAIL_ID);

    // ③ spendErrors = 1・incomplete = true・警報に SQLSTATE
    expect(r.spendErrors).toBe(1);
    expect(r.incomplete).toBe(true);
    expect(alerts.some((a) => a.includes(FAIL_ID) && a.includes('SQLSTATE P0001'))).toBe(true);
    expect(alerts.filter((a) => a.includes(FAIL_ID))).toHaveLength(1); // ★選び直していないので 1 回だけ

    // ④ ST001 の馬は休養に落ちて進み、epShort に数えられ、除外されない
    expect(horses.find((h) => h.id === SHORT_ID)!.last_processed_week).toBe(TARGET);
    expect(r.epShort).toBe(PENDING);
    for (const s of selects) expect((s.params[2] as string[] | undefined) ?? []).not.toContain(SHORT_ID);
  }, 120_000);
});

/**
 * 🔴 ★**週送りが対象を絞る述語**（★2026-09-19・**FK-6** が「偽物は読んでいない」と数えた）
 *
 * ★偽の DB は行を配列で持つので、★`where` を真似ていません（★それ自体は悪くない）。
 * 🔴 ★しかし ★**どちらも誰も見ていませんでした** → ★消えても気づけません:
 *   ★`retired_at_week is null` … ★引退した馬を育て続ける（★§7.1 の寿命を越えて伸びる）
 *   ★`birth_week is not null`  … ★誕生週の無い馬で齢を計算する（★NaN が入りうる）
 */
describe('🔴 FK-6 週送りの対象を絞る述語（★製品の文面で見張る）', () => {
  it('★引退した馬は対象にしない', () => {
    expect(LIVE, '🔴 ★引退で絞っていない（★引退後も育ち続ける）').toMatch(/retired_at_week is null/);
  });

  it('★誕生週の無い馬は対象にしない', () => {
    expect(LIVE, '🔴 ★birth_week で絞っていない（★齢が計算できない馬が混ざる）')
      .toMatch(/birth_week is not null/);
  });

  it('★走査が空でない（R-21・★註記を外して本文が残っていること）', () => {
    expect(LIVE.length).toBeGreaterThan(500);
    expect(LIVE, '★SQL が 1 つも残っていない').toMatch(/select/i);
  });
});
