/**
 * テスト用の出走馬ビルダ。
 *
 * ⚠️ M-3(e) の教訓: ヘルパがレコードをリテラルで組むと本番の構築経路をバイパスする。
 *    `RaceEntrant` は **race-engine 側に構築ロジックが無い**（外部から与えられる入力型）ため
 *    ここでリテラルに組むのは経路の迂回にあたらない。`HorseRecord` からの変換を測るのは
 *    `entrant.ts` 側のテスト（K-5 で追加）の役目。
 */

import type { AbilityKey, Strategy } from '@star/sim-engine';
import type { RaceEntrant, Surface, } from '../src/types.js';

/** 全能力500・全適性ちょうど中央の中立馬。テストは必要な項目だけ上書きする */
export function neutralEntrant(id: string, overrides: Partial<RaceEntrant> = {}): RaceEntrant {
  const stats: Record<AbilityKey, number> = { sp: 500, st: 500, pw: 500, gt: 500, iq: 500 };
  const surfaceAptitude: Record<Surface, number> = { turf: 50, dirt: 50 };
  const strategyAptitude: Record<Strategy, number> = {
    nige: 50,
    senko: 50,
    sashi: 50,
    oikomi: 50,
  };
  const heavyAptitude = 55;
  return {
    horseId: id,
    stats,
    surfaceAptitude,
    distanceCenter: 2000,
    distanceRange: 600,
    strategyAptitude,
    heavyAptitude,
    strategy: 'senko',
    condition: 3,
    fatigue: 0,
    weightKg: 55,
    gate: 1,
    age: 4,
    skillGenes: [],
    ...overrides,
  };
}

export function neutralField(size: number, overrides: Partial<RaceEntrant> = {}): RaceEntrant[] {
  return Array.from({ length: size }, (_, i) =>
    neutralEntrant(`H${String(i + 1).padStart(3, '0')}`, { gate: i + 1, ...overrides }),
  );
}
