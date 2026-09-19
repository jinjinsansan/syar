/**
 * ★**「前より○○できるようになった」を、一生に何回 言うか**（★**GB-1 ④**・2026-09-19・オーナー決定）
 *
 * 【★オーナーが決めたこと】★`OWNER_DECISIONS_20260919.md` C-4
 *   > ★**閾値から決めず、「一生で何回 言うか」から決めてください。★私の推しは 20〜30 回**
 *   > ★（★実時間で 20〜32 時間に 1 回）
 *   > ★**今 決めるのは「累積で比べるか、週次で比べるか」の 1 行だけ**
 *
 * 【★どちらを採ったか — ★**累積**（★前に言ったときと比べる）】
 *   | ★先週と比べる | ★**ほとんど何も言われない** ＝「育った実感」が出ない |
 *   | ★**前に言ったときと比べる** | ★長く観測すると能力値を **0.8% の精度で復元**できる（★D-114 が隠したもの） |
 *   → ★オーナーの推し（20〜30 回）は ★**週次では届きません**（★この道具が数で示します）。
 *   → ★**累積**を採り、★回数を 20〜30 に収めることで ★**漏れの側を絞ります**。
 *
 * 【🔴 ★なぜ回数が漏れの大きさを決めるのか】
 *   ★D-116 ③ が書いているとおり、★**出れば出るほど符号列が積み上がります**。
 *   ★一生 182 週で毎週 言えば ★**182 個の符号**、★20〜30 回なら ★**その 1/6〜1/9**。
 *   ⚠️ ★**回数を絞ることが、そのまま漏れを絞ること**です。★閾値はそのための道具にすぎません。
 *
 * 【★測り方】
 *   ★`runCareer`（★較正した週送りの経路そのもの）に ★**`onWeek` で覗きます**。
 *   🔴 ★別に週ループを書きません — ★2026-08-11 に、それで §7.6 のイベントを
 *     ★引かないまま測っていました（★R-30「測定器は評価者と同じ入力を見る」）。
 *
 * ```
 * npx tsx apps/cli/src/growth-tell-frequency.ts [--horses 200] [--seed 42] [--seeds 42,7,…]
 * ```
 */

import {
  ABILITY_KEYS, DEFAULT_BALANCE, FOUNDERS, GROWTH_TELL_MIN,
  createFounder, deriveRng, growthTellsOf,
  type AbilityKey, type HorseId, type HorseRecord,
} from '@star/sim-engine';
import { APPROPRIATE_POLICY, runCareer } from './training-career.js';
import { mean, round, sdSample, standardError } from './stats.js';

/** ★候補の閾値（★`GROWTH_TELL_MIN` は現在 8） */
const CANDIDATES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 20, 24, 32, 48, 80] as const;

export interface TellCount {
  /** ★**累積**（★前に言ったときと比べる） */
  readonly cumulative: number;
  /** ★**週次**（★先週と比べる） */
  readonly weekly: number;
}

/**
 * ★1 頭ぶんの週ごとの `stats` から、★2 つの数え方で回数を数える。
 *
 * ⚠️ ★**同じ週に 2 つの能力が届いたら「1 回」**と数えます。
 *    ★画面に出るのは「1 つの知らせ」だからです（★符号の個数ではなく、★**言う回数**）。
 * ⚠️ ★累積の基準は ★**言った週の `stats`**（★言わなかった週では更新しません）。
 *    ★ここを毎週 更新すると、★それは週次と同じものになります。
 */
export function countTells(
  weeks: readonly Readonly<Record<AbilityKey, number>>[],
  minDelta: number,
): TellCount {
  if (weeks.length === 0) return { cumulative: 0, weekly: 0 };
  let cumulative = 0;
  let weekly = 0;
  let base = weeks[0]!;
  for (let i = 1; i < weeks.length; i += 1) {
    const now = weeks[i]!;
    if (growthTellsOf(weeks[i - 1]!, now, minDelta).length > 0) weekly += 1;
    if (growthTellsOf(base, now, minDelta).length > 0) {
      cumulative += 1;
      // ★言った週の値を次の基準にする（★これが「前に言ったときと比べる」）
      base = now;
    }
  }
  return { cumulative, weekly };
}

export interface FrequencyRow {
  readonly minDelta: number;
  readonly cumulativeMean: number;
  readonly cumulativeSd: number;
  readonly cumulativeSe: number;
  readonly cumulativeMin: number;
  readonly cumulativeMax: number;
  readonly weeklyMean: number;
  /** ★一生で 1 度も言われない馬の割合（★**いちばん悪い体験**） */
  readonly silentShare: number;
  /** ★オーナーの推し（20〜30 回）に収まる馬の割合 */
  readonly inTargetShare: number;
}

export function measure(horses: number, seeds: readonly number[]): FrequencyRow[] {
  /** ★週ごとの `stats` を一生ぶん貯める（★`runCareer` の中から覗く） */
  const careers: Readonly<Record<AbilityKey, number>>[][] = [];
  for (const seed of seeds) {
    const rng = deriveRng(seed, 0);
    for (let i = 0; i < horses; i += 1) {
      const h: HorseRecord = createFounder({
        id: `g${i}` as HorseId,
        sex: i % 2 === 0 ? 'male' : 'female',
        sireLine: `L${i % 12}` as never,
        birthYear: 0,
        rng,
        balance: DEFAULT_BALANCE,
        founders: FOUNDERS,
      });
      const weeks: Record<AbilityKey, number>[] = [{ ...h.stats } as Record<AbilityKey, number>];
      runCareer(h, APPROPRIATE_POLICY, i, seed, (_w, stats) => {
        weeks.push({ ...stats } as Record<AbilityKey, number>);
      });
      careers.push(weeks);
    }
  }

  const out: FrequencyRow[] = [];
  for (const minDelta of CANDIDATES) {
    const cum: number[] = [];
    const wk: number[] = [];
    for (const weeks of careers) {
      const c = countTells(weeks, minDelta);
      cum.push(c.cumulative);
      wk.push(c.weekly);
    }
    out.push({
      minDelta,
      cumulativeMean: mean(cum),
      cumulativeSd: sdSample(cum),
      cumulativeSe: standardError(cum),
      cumulativeMin: Math.min(...cum),
      cumulativeMax: Math.max(...cum),
      weeklyMean: mean(wk),
      silentShare: cum.filter((x) => x === 0).length / cum.length,
      inTargetShare: cum.filter((x) => x >= 20 && x <= 30).length / cum.length,
    });
  }
  return out;
}

const isMain = process.argv[1] !== undefined && process.argv[1].endsWith('growth-tell-frequency.ts');
if (isMain) {
  const arg = (n: string, d: number): number => {
    const i = process.argv.indexOf(`--${n}`);
    return i >= 0 ? Number(process.argv[i + 1] ?? d) : d;
  };
  const horses = arg('horses', 200);
  const si = process.argv.indexOf('--seeds');
  const seeds = si >= 0
    ? (process.argv[si + 1] ?? '42').split(',').map(Number)
    : [arg('seed', 42)];

  console.log('★GB-1 ④ 「前より○○できるようになった」を一生に何回 言うか');
  console.log(`  ★標本: ${horses} 頭 × ${seeds.length} シード ＝ ${horses * seeds.length} 頭`);
  console.log(`  ★シード: ${seeds.join(', ')}`);
  console.log(`  ★いまの GROWTH_TELL_MIN = ${GROWTH_TELL_MIN}`);
  console.log(`  ★能力: ${ABILITY_KEYS.join(' / ')}`);
  console.log('');
  console.log('  幅 | ★累積 平均 |    SD |    SE |  最小 |  最大 | 週次 平均 | 0 回 | 20〜30 回');
  console.log('  ---|-----------|-------|-------|-------|-------|----------|------|---------');
  for (const r of measure(horses, seeds)) {
    const mark = r.cumulativeMean >= 20 && r.cumulativeMean <= 30 ? ' ★' : '';
    console.log(
      `  ${String(r.minDelta).padStart(2)} | ${round(r.cumulativeMean, 1).toFixed(1).padStart(9)}`
      + ` | ${round(r.cumulativeSd, 1).toFixed(1).padStart(5)}`
      + ` | ${round(r.cumulativeSe, 2).toFixed(2).padStart(5)}`
      + ` | ${String(r.cumulativeMin).padStart(5)} | ${String(r.cumulativeMax).padStart(5)}`
      + ` | ${round(r.weeklyMean, 1).toFixed(1).padStart(8)}`
      + ` | ${(r.silentShare * 100).toFixed(0).padStart(3)}%`
      + ` | ${(r.inTargetShare * 100).toFixed(0).padStart(7)}%${mark}`,
    );
  }
  console.log('');
  console.log('  ⚠️ ★「週次 平均」は**先週と比べた**ときの回数です（★オーナー判断の表の左側）。');
  console.log('  ⚠️ ★「0 回」は**一生で 1 度も言われない馬**の割合 — ★いちばん悪い体験です。');
}
