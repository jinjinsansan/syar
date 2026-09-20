/**
 * 🔴 ★**現役馬が居るのに 1 頭も育てられないなら、★黙って終わらない**
 * （★`PROD-NEVER-AGED`・2026-09-20）
 *
 * 【★何が起きたか — ★仮定ではありません】
 *   ✔ ★本番の実測（2026-09-19）: ★現役 **7,355 頭**・★`birth_week` 有り **0 頭**・
 *     ★`horse_week_log` **0 行**・★引退 **0 頭**。
 *   ★`advanceTrainingWeeks` は `birth_week is not null` で絞るので、★**選ばれるのは 0 頭**。
 *   → ★最初の `select` が 0 行 → ★`hitCap = false` で `break` → ★★**何事もなく正常終了**。
 *   → ★★**3 日で 6,066 レースが走り、★誰も気づきませんでした**（★**R-16**: ★機構が止まって全部 緑）。
 *
 * 【★なぜ警報ではなく例外か】
 *   ★`onAlert` は ★**読まれないことがあります**。★現役馬が居るのに 1 頭も育たないのは
 *   ★**世界が壊れている**状態なので、★**fail-closed** にします（★R-27: ★既定は狭い側へ）。
 *
 * 【⚠️ ★この検査が見ないもの】
 *   ★偽の client です。★**実 DB では確かめていません。**
 *   ★見ているのは ★**製品の関数が、★どの数のときに投げるか**だけです。
 */
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import { WEEK_MS } from '@star/scheduler';
import { advanceTrainingWeeks } from '../src/training-runner.js';

const SRC = readFileSync(
  nodePath.join(nodePath.resolve(__dirname, '..'), 'src/training-runner.ts'), 'utf8',
);
/** ★註記を外した本文（★註記の中の語で緑にしない・CK-1） */
const LIVE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const EPOCH = 0;
const NOW = EPOCH + WEEK_MS * 10;

/**
 * ★偽の DB。★**SQL の文面で答えを分けます**（★**R-30**）。
 *
 * ⚠️ ★呼ばれた順で分けると、★製品から `birth_week is not null` の句を消しても
 *   ★偽物が同じ答えを返し続け、★**変異を捕まえられません**。
 */
function fakeClient(active: number, withBirthWeek: number): pg.Client {
  const alerts: string[] = [];
  const c = {
    alerts,
    query(sql: string): Promise<{ rows: unknown[]; rowCount: number }> {
      const isCount = /count\(\*\)/.test(sql);
      if (isCount && /birth_week is not null/.test(sql)) {
        return Promise.resolve({ rows: [{ n: String(withBirthWeek) }], rowCount: 1 });
      }
      if (isCount) {
        return Promise.resolve({ rows: [{ n: String(active) }], rowCount: 1 });
      }
      // ★馬を選ぶ問い合わせ。★0 行 ＝ 進める馬が居ない
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
  return c as unknown as pg.Client;
}

describe('★PROD-NEVER-AGED: 育成が 1 頭も進まないときに黙らない', () => {
  it('🔴 ★現役が居るのに `birth_week` 持ちが 0 頭なら、★**投げる**', async () => {
    const c = fakeClient(7355, 0);
    await expect(advanceTrainingWeeks(c, NOW, EPOCH, () => {}))
      .rejects.toThrow(/birth_week/);
  });

  it('🔴 ★投げる文に、★**数と直し方の手がかり**が入っている', async () => {
    const c = fakeClient(7355, 0);
    await expect(advanceTrainingWeeks(c, NOW, EPOCH, () => {}))
      .rejects.toThrow(/7355/);
    await expect(advanceTrainingWeeks(c, NOW, EPOCH, () => {}))
      .rejects.toThrow(/PROD-NEVER-AGED/);
  });

  it('⚠️ ★現役が 0 頭なら投げない（★「まだ世界が無い」は壊れていない）', async () => {
    /**
     * 🔴 ★**対照**。★何でも投げる検査にすると、★世界を作る前に流せなくなります。
     */
    const c = fakeClient(0, 0);
    await expect(advanceTrainingWeeks(c, NOW, EPOCH, () => {})).resolves.toBeDefined();
  });

  it('⚠️ ★一部だけ欠けているなら、★投げずに**数を出す**', async () => {
    /**
     * ★7,000 頭 中 6,900 頭 が `birth_week` 持ち → ★100 頭 が静かに外れている。
     * ★投げると世界が止まるので、★**警報で数を出します**。★黙らせないのが要点。
     */
    const alerts: string[] = [];
    const c = fakeClient(7000, 6900);
    await advanceTrainingWeeks(c, NOW, EPOCH, (m) => alerts.push(m));
    expect(alerts.join(' '), '★欠けている数を出していない').toMatch(/100/);
    expect(alerts.join(' ')).toMatch(/birth_week/);
  });

  it('✅ ★全頭が持っていれば、★警報も例外も出ない（★対照）', async () => {
    const alerts: string[] = [];
    const c = fakeClient(7000, 7000);
    await advanceTrainingWeeks(c, NOW, EPOCH, (m) => alerts.push(m));
    expect(alerts, '★正常なのに警報を出している').toEqual([]);
  });

  it('🔴 ★製品の文面に、★2 つの数を分ける句が在る（★FK-6）', () => {
    /**
     * ⚠️ ★偽の client は SQL の文面で答えを分けています。
     *   ★製品から句が消えると ★**偽物の分岐も意味を失う**ので、★文面を見張ります。
     */
    expect(LIVE, '★`birth_week is not null` で絞る問い合わせが無い')
      .toMatch(/count\(\*\)[\s\S]{0,120}birth_week is not null/);
    expect(LIVE, '★現役だけを数える問い合わせが無い（★比べる相手）')
      .toMatch(/select count\(\*\)::text as n from horses where retired_at_week is null'/);
  });
});
