/**
 * ★出走表を組む機構そのものを固定する（Q-P3-42 の裁定）
 *
 * 【なぜ V-4 / V-6 の帯では守れないか — 実測（60,000本 × 4シード）】
 *
 *   | 壊した定数                | V-4 / V-6 の動き        | 帯を出たか |
 *   |---------------------------|-------------------------|-----------|
 *   | `DISTANCE_SUIT_MIN` → 0   | V-6 が 15% 動く         | ★出ない   |
 *   | `OFF_DISTANCE_ENTRY_RATE` → 1.0 | V-6 が 5% 動く   | ★出ない   |
 *   | `OFF_SURFACE_ENTRY_RATE` → 1.0  | V-4/V-6 が 8% 動く | ★出ない  |
 *   | `FIELD_STRENGTH_FLOOR` → 0.0    | V-4 が 5% 動く   | ★出ない   |
 *
 *   > 「効いている」は必要条件で、十分条件ではない。
 *   > 帯に余裕があれば、大きく効く定数でも壊れたまま通る。
 *
 *   ★**下流の帯には余裕がありますが、機構の直接の性質には余裕がありません。**
 *     だからここでは「V-6 が動くか」ではなく
 *       ・床を下回る馬が**実際に引き直されているか**
 *       ・距離が向かない馬の**割合が設定値に一致するか**
 *     を見ます。
 */
import { describe, it, expect } from 'vitest';
import { NICKS_GEN, deriveRng, type HorseRecord } from '@star/sim-engine';
import {
  generateRace, sortPoolByClass, entryStrength, floorForFieldSize,
  DISTANCE_SUIT_MIN, OFF_DISTANCE_ENTRY_RATE, OFF_SURFACE_ENTRY_RATE, FIELD_STRENGTH_FLOOR,
} from '../src/race-field.js';
import { runSimulation } from '../src/simulator.js';
import { resolveRuntimeConfig } from '../src/config.js';

/**
 * ★母集団は `verify-race` と**同じ作り方**で作る。
 *   別の作り方にすると「何を見ているか」が変わり、割合の意味が比較できません。
 */
const { balance, founders } = resolveRuntimeConfig();
const POOL: readonly HorseRecord[] = sortPoolByClass(
  runSimulation(
    { seed: 42, generations: 12, population: 200, stallionPool: 60,
      v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true },
    balance, founders, NICKS_GEN,
  ).finalPopulation ?? [],
);
const RACES = 1500;

/**
 * ★距離適性は **`race-field.ts` の実装と同じ式**を使う（§5.2 の正規分布カーブ）。
 *   ⚠️ 最初ここに**自分で考えた式**（線形の減衰）を書いて落ちました。
 *      推測の式で測ると、落ちても通っても何を意味するか分かりません。
 */
const distanceFitOf = (h: { distanceCenter: number; distanceRange: number }, distance: number): number =>
  100 * Math.exp(-((distance - h.distanceCenter) ** 2) / (2 * h.distanceRange * h.distanceRange));

function fields(): { entrants: ReturnType<typeof generateRace>['entrants']; distance: number; surface: 'turf' | 'dirt' }[] {
  const out = [];
  for (let i = 0; i < RACES; i += 1) {
    const r = generateRace(POOL, i, deriveRng(20260812, 61, i));
    out.push({ entrants: r.entrants, distance: r.conditions.distance, surface: r.conditions.surface });
  }
  return out;
}

describe('★出走表の機構（V-4 / V-6 の帯では守れない）', () => {
  const all = fields();

  it('★床を下回る馬が出走表に残らない（FIELD_STRENGTH_FLOOR が引き直している）', () => {
    let below = 0;
    let total = 0;
    for (const f of all) {
      const ss = f.entrants.map((e) => entryStrength(e, f.distance, f.surface));
      const best = Math.max(...ss);
      const floor = floorForFieldSize(f.entrants.length);
      for (const s of ss) {
        total += 1;
        if (s < best * floor) below += 1;
      }
    }
    // ★引き直しは有限回（FLOOR_REDRAW_PASSES）なので 0 にはならないが、ごく少数のはず。
    //   床を 0 に壊すと**下限が消える**ので、この割合は跳ね上がる。
    expect(total).toBeGreaterThan(0);
    expect(below / total).toBeLessThan(0.02);
    // ★「床が 0 でない」ことも直接言う（0 なら best*0 = 0 未満は存在せず上の検査が空振りする）
    expect(FIELD_STRENGTH_FLOOR).toBeGreaterThan(0);
  });

  it('★距離が向かない馬の割合が OFF_DISTANCE_ENTRY_RATE に見合う', () => {
    let off = 0;
    let total = 0;
    for (const f of all) {
      for (const e of f.entrants) {
        total += 1;
        if (distanceFitOf(e, f.distance) < DISTANCE_SUIT_MIN) off += 1;
      }
    }
    const ratio = off / total;
    // ★設定は 0.12。実測はこれより小さくなる（適性のある馬が先に埋まるため）が、
    //   1.0 に壊すと**絞りが消えて跳ね上がる**ので、上限で捕まえる。
    expect(ratio).toBeLessThan(OFF_DISTANCE_ENTRY_RATE * 2.5);
    expect(OFF_DISTANCE_ENTRY_RATE).toBeLessThan(1.0);
  });

  it('★馬場が向かない馬の割合が OFF_SURFACE_ENTRY_RATE に見合う', () => {
    let off = 0;
    let total = 0;
    for (const f of all) {
      for (const e of f.entrants) {
        total += 1;
        const other = f.surface === 'turf' ? 'dirt' : 'turf';
        if (e.surfaceAptitude[f.surface] < e.surfaceAptitude[other]) off += 1;
      }
    }
    const ratio = off / total;
    // ★1.0 に壊すと「向かない馬でも無条件に出す」ので割合が跳ね上がる
    expect(ratio).toBeLessThan(OFF_SURFACE_ENTRY_RATE * 2.5);
    expect(OFF_SURFACE_ENTRY_RATE).toBeLessThan(1.0);
  });

  it('★距離適性の下限が実際に足切りとして働いている（DISTANCE_SUIT_MIN）', () => {
    // ★「向いている」と見なす下限そのものを検査する。0 に壊すと足切りが消える
    expect(DISTANCE_SUIT_MIN).toBeGreaterThan(0);
    let suited = 0;
    let total = 0;
    for (const f of all) {
      for (const e of f.entrants) {
        total += 1;
        if (distanceFitOf(e, f.distance) >= DISTANCE_SUIT_MIN) suited += 1;
      }
    }
    // 足切りが効いていれば大多数が下限以上になる。0 に壊すと「下限以上」が全馬になるので、
    // ★**上下**で挟む（片側だけだと壊した側でも通る）
    expect(suited / total).toBeGreaterThan(0.7);
    expect(suited / total).toBeLessThan(0.999);
  });
});
