/**
 * @star/race-engine — STAR レース判定エンジン（純粋 TypeScript / 依存ゼロ）
 *
 * 正典 STAR_SPEC_v2.0.md §8（レースシミュレーション + Provably Fair）の実装。
 * `@star/sim-engine` の型と Rng のみに依存し、Node にも React にも依存しない
 * （`crypto` / `fs` を直接使わない。ハッシュは K-2 で注入する）。
 */

export * from './types.js';
export * from './balance.js';
export * from './coefficients.js';
export * from './skills.js';
export * from './race.js';
export * from './fairness.js';
export * from './intervention.js';
export * from './replay.js';
export * from './watch.js';
export * from './lane.js';
