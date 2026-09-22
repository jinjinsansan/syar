/**
 * 🔴 ★**`breed()` の中の年齢の判定が、★年の尺度のずれで効いていない**（★裁定 322d603 §5・2026-09-22）。
 *
 * 【★何が起きているか】
 *   ★ワーカーは親を `breedingRecordOf` で読み、★`birthYear` を ★**ゲームの年**（`gameYearOf(birth_week)`）にします。
 *   ★事前の判定 `canMate(sire, dam, balance, year)` も ★ゲームの年 → ★**尺度が揃っていて正しい**。
 *   ★ところが `breed()` は内部で ★`canMate(sire, dam, balance, birthYear)` を呼び、★そこに渡るのは
 *   ★`year + yearOffset`（★**保存する尺度**・本番の実測で差 46）。
 *   → ★`breed()` の中では ★**親が 46 歳年上に見え**、★「若すぎる」を弾きません（★NPC の経路も同じ）。
 *
 * 【★なぜ赤のまま置くか】
 *   ★今は事前の判定が正しいので ★実害はありません。★しかし `breed()` の中の判定は ★**安全網のつもりで効いていない**。
 *   ★直すと ★NPC の世界の結果に触れうるので、★固定の種で前後を比べる便で扱います（★裁定）。
 *   → ★**この検査は赤で登録し、★既知の赤の簿（`tools/lib/known-red.mjs`）に載せます**（★黙って緑にしない）。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, FOUNDERS, breed, canMate, createFounder, deriveRng } from '@star/sim-engine';

/** ★本番の実測の差（★`birth_year - floor(birth_week/52)` ＝ 46・`breeding-runner.ts` の `birthYearOffset`） */
const YEAR_OFFSET = 46;
const GAME_YEAR = 10;

const founder = (id: string, sex: 'male' | 'female') => createFounder({
  id, sex, sireLine: `L-${id}`, birthYear: GAME_YEAR,
  rng: deriveRng(7, id.length, id.charCodeAt(0)), balance: DEFAULT_BALANCE, founders: FOUNDERS,
});

describe('🔴 ★breed() の年の尺度（★裁定 322d603 §5）', () => {
  it('★前提: ★事前の判定は ★ゲームの年で「若すぎる」を弾く', () => {
    // ★0 歳の父母（★ゲームの年 10 に生まれ、★ゲームの年 10 に配合）
    const check = canMate(founder('s', 'male'), founder('d', 'female'), DEFAULT_BALANCE, GAME_YEAR);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('sire_too_young');
  });

  it('★対照: ★同じ父母を ★ゲームの年の尺度で渡せば breed() は投げる（★赤の原因は尺度のずれだけ）', () => {
    expect(() => breed({
      id: 'foal', sire: founder('s', 'male'), dam: founder('d', 'female'), seed: 1,
      generation: 1, birthYear: GAME_YEAR,
      lookup: () => undefined, balance: DEFAULT_BALANCE, nicks: new Map(),
    })).toThrow(/交配不可/);
  });

  it('🔴 ★ワーカーと同じ年の渡し方で、★若すぎる父母を breed() に直接渡すと投げる', () => {
    expect(() => breed({
      id: 'foal', sire: founder('s', 'male'), dam: founder('d', 'female'), seed: 1,
      generation: 1,
      // ★ワーカーが渡す値（★保存する尺度 ＝ ゲームの年 ＋ 46）
      birthYear: GAME_YEAR + YEAR_OFFSET,
      lookup: () => undefined, balance: DEFAULT_BALANCE, nicks: new Map(),
    })).toThrow(/交配不可/);
  });
});
