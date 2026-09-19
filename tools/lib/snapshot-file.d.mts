/**
 * ★`snapshot-file.mjs` の型（★**SB-6**・2026-09-19）。
 *
 * ⚠️ ★`classification.d.mts` / `tool-aftermath.d.mts` と同じ作法です — ★道具は `.mjs`、★型はここ。
 * ⚠️ ★**中身を写しません**（★実装は `.mjs` が持ちます・D-052）。★ここは形だけです。
 */

/** ★控えの中身（★`takeSnapshot` に渡したものが `data` に入ります） */
export interface Snapshot<T = unknown> {
  /** ★取った時刻（ISO8601・★`new Date()` は道具の中だけ） */
  readonly takenAt: string;
  readonly name: string;
  readonly data: T;
}

/**
 * ★**控えを取る**（★`tmp/snapshots/<name>.json` へ・★`fsync` → `rename`）。
 *
 * ⚠️ 🔴 ★**変える前に呼ぶこと。** ★変えてから呼ぶと、★**間で殺されたときに控えが無い。**
 * @throws ★`name` に `[A-Za-z0-9._-]` 以外が入っていたら投げます（★道を抜けられないように）
 * @returns ★書いたファイルの道
 */
export function takeSnapshot(name: string, data: unknown): string;

/**
 * ★**前の実行が残した控え**。★無ければ `null`。
 *
 * 🔴 ★**`null` でなければ、★前の実行は片付けずに死んでいます。** ★先に戻してから始めること。
 * @throws ★**壊れていたら投げます**（★「読めない」を「無い」に落とさない・★`R-21` の族）
 */
export function readSnapshot<T = unknown>(name: string): Snapshot<T> | null;

/**
 * ★片付いたので控えを捨てる。
 * ⚠️ ★**戻したことを数えてから呼ぶこと**（★`TL-1` の `restores`）。
 */
export function dropSnapshot(name: string): void;

/** ★置き去りの控えを数える（★`SH-1‴`: ★守られたこと自体は見えない。★残骸だけが痕跡） */
export function listSnapshots(): string[];
