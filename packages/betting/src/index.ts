/**
 * @star/betting — STAR 馬券（正典 §9）。純粋 TypeScript / 依存ゼロ。
 *
 * ★ここに残高・時刻・DB を持ち込まない。
 *   EP 減算と馬券発行の原子性（§14.4・A-5）は Postgres 関数側の責務で、
 *   このパッケージは「何が当たりで、いくら払うか」だけを決める。
 */
export * from './types.js';
export * from './balance.js';
export * from './settle.js';
export * from './point-flow.js';
