/**
 * ニックス — 正典 §6.6
 *
 * 父系ライン × 母父系ライン → 倍率 1.00〜1.15。
 * テーブルは「運営が編集可能なライブオプス素材」なので、エンジンは**注入されたテーブルを参照するだけ**にする。
 */

import type { Rng } from './rng.js';
import type { LineId } from './types.js';

/** key = `${sireLine}|${damSireLine}` */
export type NicksTable = ReadonlyMap<string, number>;

export function nicksKey(sireLine: LineId, damSireLine: LineId): string {
  return `${sireLine}|${damSireLine}`;
}

export function getNicksMultiplier(
  table: NicksTable,
  sireLine: LineId,
  damSireLine: LineId | null,
): number {
  if (damSireLine === null) return 1;
  return table.get(nicksKey(sireLine, damSireLine)) ?? 1;
}

/** LINE_A, LINE_B, ... のライン名を count 個生成 */
export function makeLineIds(count: number): LineId[] {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const out: LineId[] = [];
  for (let i = 0; i < count; i++) {
    const first = alphabet[i % 26] ?? 'A';
    const suffix = i < 26 ? first : `${first}${Math.floor(i / 26)}`;
    out.push(`LINE_${suffix}`);
  }
  return out;
}

/**
 * シミュレータ用のニックステーブルを生成する（指示書 §3.3）。
 * lines × lines のうち hitRatio の割合のセルに multMin〜multMax の倍率を置く。
 * 本番テーブルは運営が別途定義するため、これはあくまで検証用の合成データ。
 */
export function generateNicksTable(
  lines: readonly LineId[],
  rng: Rng,
  hitRatio: number,
  multMin: number,
  multMax: number,
): NicksTable {
  const table = new Map<string, number>();
  for (const sireLine of lines) {
    for (const damSireLine of lines) {
      if (rng.bool(hitRatio)) {
        table.set(nicksKey(sireLine, damSireLine), rng.range(multMin, multMax));
      }
    }
  }
  return table;
}
