/**
 * @star/scheduler — 開催サイクル（正典 §10）。純粋 TypeScript / 依存ゼロ。
 *
 * ★このパッケージは時計を持ちません。時刻は必ず引数で受け取ります
 *   （ゲーム内時刻の真実は Postgres の now() のみ・§14）。
 */
export * from './cycle.js';
export * from './programme.js';
export * from './conditions.js';
