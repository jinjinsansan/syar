/**
 * 🔴 ★**遅れた週に、★予算の範囲で追いつく**（★簿 `BREEDING-ONLY-ONE-WEEK-PER-CYCLE`・2026-09-21）
 *
 * ============================================================================
 * 【🔴 ★何を守る検査か】
 *   ★`advanceTrainingWeeks` は ★**N 週 進め**、★`runBreedingWeek` は ★**1 週だけ**でした。
 *   → ★★**歳は N 週ぶん取るのに、★仔は 1 週ぶんしか生まれない。**
 *   ✔ ★実際に起きています: ★2026-08-20〜09-02 の 13 日 停止 ＝ ★78 週。
 *
 * 【⚠️ ★この検査は「配合の中身」を見ていません】
 *   ★牝馬の行を空で返すので、★**どの週も 0 頭**です（★`runBreedingWeek` の「対象 0 頭」の枝）。
 *   ★★見ているのは ★**どの週を、★何週ぶん、★どの順で頼んだか**と、★**印の書き方**だけ。
 *   → ★配合の中身は `breeding-runner.test.ts` と `verify-pool-supply` の仕事です。
 *
 * 【★時計は注入します（★憲法 4）】
 *   ★偽の時計を渡すので、★**予算切れの枝を確実に踏めます**（★実時間に依存しません）。
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { runBreedingCatchUp } from '../../worker/src/breeding-runner.js';

const WEEK_MS = 4 * 60 * 60 * 1000;
const EPOCH = 0;
/** ★`weekIndexAt(now) - 1` が `w` になる `now` */
const nowForWeek = (w: number): number => (w + 1) * WEEK_MS;

interface FakeOptions {
  /** ★`world_state.last_bred_week`（★`null` ＝ 一度も配合していない） */
  lastBredWeek: number | null;
  /** ★`world_state` の行が無い場合 */
  noWorldRow?: boolean;
  /** ★1 週あたり、偽の時計を何 ms 進めるか */
  weekCostMs?: number;
}

function fakeClient(o: FakeOptions) {
  const written: number[] = [];
  let clock = 0;
  const cost = o.weekCostMs ?? 0;
  const client = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes('select last_bred_week from world_state')) {
        if (o.noWorldRow === true) return { rows: [], rowCount: 0 };
        return {
          rows: [{ last_bred_week: o.lastBredWeek === null ? null : String(o.lastBredWeek) }],
          rowCount: 1,
        };
      }
      if (sql.includes('update world_state set last_bred_week')) {
        written.push(Number((params as unknown[])[0]));
        return { rows: [], rowCount: 1 };
      }
      /**
       * 🔴 ★**牝馬を 0 頭で返します** — ★`runBreedingWeek` の「対象 0 頭の週」の枝。
       *   ★そこは ★**何もせず、★投げずに**終わります（★誰の番でもない週は正常）。
       *   → ★★この検査は「どの週を頼んだか」だけを見られます。
       */
      if (sql.includes("retirement_role = 'broodmare' order by id")) {
        clock += cost;                 // ★1 週ぶんの費用を、★偽の時計に載せる
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  return { client: client as never, written, monotonicMs: (): number => clock };
}

const run = async (o: FakeOptions, targetWeek: number, budgetMs: number) => {
  const f = fakeClient(o);
  const r = await runBreedingCatchUp(
    f.client, nowForWeek(targetWeek), EPOCH, () => {},
    undefined, 'top', 13, 800,
    { budgetMs, monotonicMs: f.monotonicMs },
  );
  return { r, written: f.written };
};

describe('🔴 ★配合の追いつき（★予算つき）', () => {
  it('🔴 ① ★印が無いときは、★**いまの週だけ**（★0 週目に遡らない）', async () => {
    /**
     * 🔴 ★ここを間違えると、★**数百週ぶんが一度に生まれます**。
     *   ★本番の `last_bred_week` は ★いま `null` です。★この枝を最初に踏みます。
     */
    const { r, written } = await run({ lastBredWeek: null }, 300, 60_000);
    expect(r.startedFresh, '★印が無いのに fresh になっていない').toBe(true);
    expect(r.weeks, '🔴 ★遡って配合している').toEqual([300]);
    expect(r.remaining).toBe(0);
    expect(written, '★印を書いていない').toEqual([300]);
  });

  it('② ★遅れていないときは、★その 1 週だけ', async () => {
    const { r } = await run({ lastBredWeek: 299 }, 300, 60_000);
    expect(r.weeks).toEqual([300]);
    expect(r.remaining).toBe(0);
    expect(r.stoppedByBudget).toBe(false);
  });

  it('🔴 ③ ★遅れていたら、★続きから順に追いつく', async () => {
    const { r, written } = await run({ lastBredWeek: 295 }, 300, 60_000);
    expect(r.weeks, '🔴 ★飛ばした週がある、または順序が違う').toEqual([296, 297, 298, 299, 300]);
    expect(r.remaining).toBe(0);
    expect(written, '★印は最後の週だけ書けばよい').toEqual([300]);
  });

  it('🔴 ④ ★予算を超えたら止め、★残りを次の周へ持ち越す', async () => {
    /**
     * ★1 週 30ms・予算 100ms。★1 週目は ★**必ず**通します（★でないと永久に進みません）。
     *   ★経過 30 → 続行 / 60 → 続行 / 90 → 続行 / 120 ≥ 100 → 止める
     */
    const { r, written } = await run({ lastBredWeek: 290, weekCostMs: 30 }, 300, 100);
    expect(r.stoppedByBudget, '🔴 ★予算で止まっていない').toBe(true);
    expect(r.weeks.length, '★進めた週数').toBe(4);
    expect(r.weeks).toEqual([291, 292, 293, 294]);
    expect(r.remaining, '★残りが合っていない').toBe(300 - 294);
    expect(written, '🔴 ★止まった位置まで印を進めていない（★次の周がやり直す）').toEqual([294]);
  });

  it('🔴 ⑤ ★予算が 0 でも、★1 週は必ず進む（★でないと永久に追いつかない）', async () => {
    const { r } = await run({ lastBredWeek: 290, weekCostMs: 1000 }, 300, 0);
    expect(r.weeks, '🔴 ★1 週も進んでいない ＝ ★永久に追いつきません').toEqual([291]);
    expect(r.stoppedByBudget).toBe(true);
    expect(r.remaining).toBe(300 - 291);
  });

  it('★既に追いついているなら、★何もしない（★印も書かない）', async () => {
    const { r, written } = await run({ lastBredWeek: 300 }, 300, 60_000);
    expect(r.weeks).toEqual([]);
    expect(r.remaining).toBe(0);
    expect(written, '★何もしていないのに印を書いた').toEqual([]);
  });

  it('🔴 ⑥ ★`world_state` の行が無ければ投げる（★黙って進めない）', async () => {
    await expect(run({ lastBredWeek: null, noWorldRow: true }, 300, 60_000))
      .rejects.toThrow(/world_state/);
  });

  it('🔴 ⑦ ★13 日 止まった場合（★78 週）を、★予算内で刻んで進める', async () => {
    /**
     * ✔ ★実際に起きた形（★2026-08-20〜09-02）。★1 週 15s・予算 54s なら 1 周に 3 週。
     *   ★ここでは同じ比（★1 週 15 / 予算 54）で回します。
     */
    const { r } = await run({ lastBredWeek: 222, weekCostMs: 15 }, 300, 54);
    expect(r.weeks.length, '★1 周で進めた週数').toBe(4);
    expect(r.remaining, '★残り').toBe(300 - 226);
    /**
     * 🔴 ★**追いつけることを、★数で言えること**:
     *   ★実時間では `CYCLES_PER_WEEK`（40）周で 1 週 しか増えません。
     *   → ★1 周に 2 週 以上 進むなら、★必ず縮みます。
     */
    expect(r.weeks.length, '🔴 ★1 周に 2 週 未満 ＝ ★永久に追いつきません').toBeGreaterThanOrEqual(2);
  });
});
