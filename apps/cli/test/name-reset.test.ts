/**
 * ★**運営が馬名を戻すときに ★新しい名前を選ぶ**（`tools/lib/name-reset.mjs`・裁定 REVIEW_NAME_RESET_TOOL_VERDICT_20260922.md）。
 *   ★持ち主の居る馬は仮の名前・★NPC の馬は普通の名前（§2）。★どちらも一覧と重複を通す（§1 条件 2）。
 */
import { describe, expect, it } from 'vitest';
import { PROVISIONAL_NAME_PREFIX, normalizeName, provisionalHorseName } from '@star/sim-engine';
// @ts-expect-error ★`.mjs` の部品（★`.d.mts` を置いていません）
import { chooseNewName } from '../../../tools/lib/name-reset.mjs';

const choose = chooseNewName as (o: {
  horseId: string; owned: boolean; stablePrefix: string; taken: ReadonlySet<string>;
  blocked: (k: string) => boolean; npcSeed: number;
}) => { name: string; key: string };
const ID = '0f000000-0000-4000-8000-00000000cafe';
const base = { horseId: ID, stablePrefix: 'ホシノ', taken: new Set<string>(), blocked: () => false, npcSeed: 12345 };

describe('★新しい名前を選ぶ（chooseNewName）', () => {
  it('★持ち主の居る馬 → ★仮の名前（接頭辞で始まる・ID から決まる）', () => {
    const r = choose({ ...base, owned: true });
    expect(r.name).toBe(provisionalHorseName(ID, 0));
    expect(r.name.startsWith(PROVISIONAL_NAME_PREFIX)).toBe(true);
    expect(r.key).toBe(normalizeName(r.name));
  });

  it('★仮の名前が重なる・一覧に当たるなら ★次の候補へ（★決定論）', () => {
    const first = normalizeName(provisionalHorseName(ID, 0));
    const second = normalizeName(provisionalHorseName(ID, 1));
    expect(choose({ ...base, owned: true, taken: new Set([first]) }).name).toBe(provisionalHorseName(ID, 1));
    expect(choose({ ...base, owned: true, taken: new Set([first]), blocked: (k) => k === second }).name)
      .toBe(provisionalHorseName(ID, 2));
  });

  it('🔴 ★NPC の馬 → ★仮の名前を使わず ★普通の名前（★裁定 §2）', () => {
    const r = choose({ ...base, owned: false });
    expect(r.name.startsWith(PROVISIONAL_NAME_PREFIX)).toBe(false);
    // ★同じ種なら同じ名前（★決定論）・★重複は避ける
    expect(choose({ ...base, owned: false }).name).toBe(r.name);
    expect(choose({ ...base, owned: false, taken: new Set([r.key]) }).name).not.toBe(r.name);
  });

  it('★NPC の馬も ★一覧に当たる名前は選ばない', () => {
    const r = choose({ ...base, owned: false });
    const other = choose({ ...base, owned: false, blocked: (k) => k === r.key });
    expect(other.key).not.toBe(r.key);
  });
});
