/**
 * @star/sim-engine — STAR 遺伝・配合エンジン（純粋 TypeScript / 依存ゼロ）
 *
 * 正典 STAR_SPEC_v2.0.md §5・§6 の実装。
 * Node にも React にも依存しない（`crypto` / `fs` を直接使わない）。
 * 乱数と時刻は必ず呼び出し側から注入する（憲法 §1-4 / 正典 §15 のパッケージ分離方針）。
 */

export * from './types.js';
export * from './rng.js';
export * from './balance.js';
export * from './genetics.js';
export * from './phenotype.js';
export * from './inbreeding.js';
export * from './nicks.js';
export * from './breeding.js';
export * from './founders.js';
export * from './naming.js';
export * from './stable.js';
