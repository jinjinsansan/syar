/**
 * ★**引退馬の役割の結線**（★デザイナー第 2 便 §5 A-1〜A-6・2026-09-23・移行 `0074`）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**画面が「押せるか」を自分で決める** → ★`request_breeding_role` と判定が 2 つに割れ、
 *      ★「押せると出ているのに弾かれる」（`0040:115` CL-4）。★上限の数を画面が持つのも同じ壊れ方
 *   ② 🔴 ★**SQL が理由を増やしたのに、画面が知らない**（★知らない語を「押せる」に倒す）
 *   ③ ★**知らない語・知らない役割が来たときに黙って進む**
 *
 * ⚠️ ★**見た目は見ません**（★見た目はデザイナーの A-1〜A-7）。★「あるか無いか」だけです。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  roleVariantOf, toRetiredHorseView, type RetiredHorseRow,
} from '../../web/src/lib/retired-screen.js';

const ROOT = path.resolve(__dirname, '../../..');
const SCREEN = readFileSync(path.join(ROOT, 'apps/web/src/lib/retired-screen.ts'), 'utf8');
const M0070 = readFileSync(path.join(ROOT, 'db/migrations/0070_breeding_role_requests.sql'), 'utf8');

const row = (over: Partial<RetiredHorseRow> = {}): RetiredHorseRow => ({
  horse_id: 'h1',
  horse_name: 'テストウマ',
  horse_sex: 'female',
  horse_birth_week: 100,
  retirement_role: 'honored',
  foal_count: 0,
  g1_wins: 0,
  wins: 3,
  starts: 12,
  sire_name: 'チチウマ',
  dam_name: 'ハハウマ',
  broodmare_block: null,
  stallion_block: 'sex_mismatch',
  // ★`0075` で足した事実（★B-1 の「選べない母」を canMate が判定するための素）
  bred_this_year: false,
  coverings_this_year: 0,
  ...over,
});

describe('★引退馬の役割の結線（★第 2 便 A-1〜A-6）', () => {
  it('★理由の語を、デザイナーの 4 通りに写す', () => {
    expect(roleVariantOf(null)).toBe(null);
    expect(roleVariantOf('owner_limit')).toBe('cap');
    expect(roleVariantOf('sex_mismatch')).toBe('sex');
    expect(roleVariantOf('not_retired')).toBe('active');
    expect(roleVariantOf('lifetime_foals_reached')).toBe('done8');
    // ★すでにその役割は「変えられない 4 通り」ではない（★枠を出さず、「功労馬に戻す」を出す側）
    expect(roleVariantOf('same_role')).toBe(null);
  });

  it('🔴 ★本人の馬でない行が来たら投げる（★この読む口では起きない）', () => {
    expect(() => roleVariantOf('not_owner')).toThrow(/本人の馬でない/);
  });

  it('③ ★知らない理由・知らない役割は投げる（★黙って「押せる」にしない）', () => {
    expect(() => toRetiredHorseView(row({ broodmare_block: 'nanika' }), 300)).toThrow(/知らない理由/);
    expect(() => toRetiredHorseView(row({ retirement_role: 'nanika' }), 300)).toThrow(/知らない役割/);
  });

  it('★1 行を見せる形に（★年齢・文字列で来る数・血統の名前）', () => {
    const v = toRetiredHorseView(row({ wins: '3', starts: '12', horse_birth_week: '100' }), 100 + 52 * 9);
    expect(v.ageYears).toBe(9);
    expect(v.wins).toBe(3);
    expect(v.starts).toBe(12);
    expect(v.sireName).toBe('チチウマ');
    expect(v.broodmare.enabled).toBe(true);
    expect(v.broodmare.variant).toBe(null);
    expect(v.stallion.enabled).toBe(false);
    expect(v.stallion.variant).toBe('sex');
  });

  it('★誕生の週が無ければ年齢は null（★推測しない）', () => {
    expect(toRetiredHorseView(row({ horse_birth_week: null }), 300).ageYears).toBe(null);
  });

  it('★すでにその役割なら、押せず・枠も出さず・印だけ立つ', () => {
    const v = toRetiredHorseView(row({ retirement_role: 'broodmare', broodmare_block: 'same_role' }), 300);
    expect(v.broodmare.enabled).toBe(false);
    expect(v.broodmare.variant).toBe(null);
    expect(v.broodmare.alreadyThisRole).toBe(true);
  });

  /**
   * ② 🔴 ★**SQL の理由の集合と、画面の型が同じこと**。
   *   ★`0070` の `role_requests_failure_known` が理由を 1 つ増やした日に、★ここが落ちる。
   *   ⚠️ ★落ちなければ、★増えた語は `blockOf` で投げられて画面が止まる（★倒れ方は安全側）。
   */
  it('② 🔴 ★SQL の理由の集合 ＝ 画面の型（★増えたら落ちる）', () => {
    const m = /role_requests_failure_known[\s\S]*?failure_reason\s+in\s*\(([^)]*)\)/.exec(M0070);
    expect(m, '★0070 の理由の制約が見つからない（★切り出しが壊れている）').not.toBe(null);
    const sqlReasons = [...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!).sort();
    const tsUnion = /export type RoleBlock =([\s\S]*?);/.exec(SCREEN);
    expect(tsUnion, '★RoleBlock の宣言が見つからない').not.toBe(null);
    const tsReasons = [...tsUnion![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!).sort();
    expect(tsReasons).toEqual(sqlReasons);
    expect(sqlReasons.length).toBeGreaterThan(0);
  });

  /**
   * ① 🔴 ★**画面が上限の数を持たない**。
   *   ★持った日に、★サーバーと画面で「n / 10」の 10 が別々に動く（★三重帳簿）。
   *   ★上限はサーバーが行に載せて返す（`broodmare_limit` / `stallion_limit` / `lifetime_foals`）。
   */
  it('① 🔴 ★画面の層は上限の定数を持たない（★サーバーが返した数を使う）', () => {
    expect(SCREEN).not.toMatch(/OWNERSHIP_LIMITS/);
    expect(SCREEN).not.toMatch(/MARE_LIFETIME_FOALS/);
    for (const col of ['broodmare_limit', 'stallion_limit', 'lifetime_foals'] as const) {
      expect(SCREEN, `★${col} をサーバーから読んでいない`).toMatch(new RegExp(col));
    }
  });
});
