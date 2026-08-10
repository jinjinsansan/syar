/**
 * @star/training — STAR 育成（正典 §7）。純粋 TypeScript。
 *
 * ★DB・時刻・乱数生成をここに持ち込まない。乱数は `Rng` を注入で受け取る。
 *   `sim-engine` と同じ規律です（決定論・再現性・テスト可能性）。
 */
export * from './menus.js';
export * from './growth.js';
export * from './condition.js';
export * from './injury.js';
export * from './events.js';
