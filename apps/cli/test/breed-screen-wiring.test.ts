/**
 * ★**配合の画面の結線**（★デザイナー第 2 便 §5 B-1〜B-5・失敗 5 通り・2026-09-23）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**ワーカーが理由を増やしたのに、画面が分類していない**（★黙って「もう一度お試しください」になる）
 *   ② 🔴 ★**画面が種付料の式を持つ**（★サーバーと別々に動く）
 *   ③ 🔴 ★**画面が「選べるか」の条件を書き写す**（★確定と判定が 2 つ）
 *   ④ ★見積もりが「払ってよい上限」そのままか（★上乗せしない・§2 B）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_BALANCE } from '@star/sim-engine';
import { npcStudFee } from '@star/scheduler';
import { breedFailureOf, toBreedSireView, type NpcStallionRow } from '../../web/src/lib/breed-screen.js';

const ROOT = path.resolve(__dirname, '../../..');
const SCREEN = readFileSync(path.join(ROOT, 'apps/web/src/lib/breed-screen.ts'), 'utf8');
const WORKER = readFileSync(path.join(ROOT, 'apps/worker/src/player-breeding.ts'), 'utf8');
const ENGINE = readFileSync(path.join(ROOT, 'packages/sim-engine/src/breeding.ts'), 'utf8');

const sire = (over: Partial<NpcStallionRow> = {}): NpcStallionRow => ({
  horse_id: 's1', name: 'タネウマ', birth_week: 52 * 2, g1_wins: 2,
  coverings_this_year: 3, total_prize_pp: 40_000, ...over,
});

describe('★配合の画面の結線（★第 2 便 B-1〜B-5）', () => {
  it('★失敗の 5 通りに写す', () => {
    expect(breedFailureOf('fee_above_max')).toBe('feeup');
    expect(breedFailureOf('ep_short')).toBe('noep');
    expect(breedFailureOf('owner_limit')).toBe('full');
    expect(breedFailureOf('dam_already_bred_this_year')).toBe('invalid');
    expect(breedFailureOf('internal_error')).toBe('temp');
  });

  it('★知らない語・理由なしは「もう一度お試しください」（★利用者のせいにしない）', () => {
    expect(breedFailureOf('nanika_atarashii_riyuu')).toBe('temp');
    expect(breedFailureOf(null)).toBe('temp');
  });

  /**
   * ① 🔴 ★**ワーカーの理由の型を、1 つ残らず分類していること**。
   *   ★`PlayerBreedingFailure` と `MateRejection` の全部を並べ、★`temp` に倒れるものは
   *   ★`internal_error` だけであることを見る（★新しい理由が黙って `temp` にならない）。
   */
  it('① 🔴 ★ワーカーの理由を 1 つ残らず分類している（★増えたら落ちる）', () => {
    const union = /export type PlayerBreedingFailure =([\s\S]*?);/.exec(WORKER);
    expect(union, '★PlayerBreedingFailure の宣言が見つからない').not.toBe(null);
    const mate = /export type MateRejection =([\s\S]*?);/.exec(ENGINE);
    expect(mate, '★MateRejection の宣言が見つからない').not.toBe(null);
    /** ⚠️ ★註記の中の語を拾わない（★`kind = 'breed'` のような例が混ざる） */
    const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    const reasons = [
      ...new Set([
        ...[...strip(union![1]!).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!),
        ...[...strip(mate![1]!).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!),
      ]),
    ];
    expect(reasons.length).toBeGreaterThan(10);
    const fellBack = reasons.filter((r) => breedFailureOf(r) === 'temp');
    expect(fellBack, '★分類されていない理由がある（★breed-screen.ts の INVALID_REASONS に足すこと）')
      .toEqual(['internal_error']);
  });

  it('② 🔴 ★画面は種付料の式を持たない（★npcStudFee が出す）', () => {
    // ★式（3,000 / 8,000 / 20）を画面の層に書いていない
    expect(SCREEN).not.toMatch(/3[,_]?000/);
    expect(SCREEN).not.toMatch(/8[,_]?000/);
    expect(SCREEN).toMatch(/npcStudFee/);
  });

  it('③ 🔴 ★画面は「選べるか」の条件を持たない（★canMate が持つ）', () => {
    expect(SCREEN).toMatch(/damBlockOf/);
    expect(SCREEN).toMatch(/sireBlockOf/);
    // ★上限の定数を画面で使っていない（★使うのは stallionCoveringLimit 経由だけ）
    expect(SCREEN).not.toMatch(/STALLION_BASE_COVERINGS/);
    expect(SCREEN).not.toMatch(/MARE_LIFETIME_FOALS/);
    expect(SCREEN).not.toMatch(/MIN_BREEDING_AGE_YEARS/);
  });

  it('④ ★見積もりは npcStudFee そのまま（★上乗せしない）', () => {
    const view = toBreedSireView(sire(), 52 * 10);
    expect(view.feeEP).toBe(npcStudFee(2, 40_000));
  });

  it('★残り枠は 上限 − 今年の種付数（★負にしない）', () => {
    const limit = DEFAULT_BALANCE.STALLION_BASE_COVERINGS + 2 * DEFAULT_BALANCE.STALLION_COVERINGS_PER_G1;
    expect(toBreedSireView(sire(), 52 * 10).coveringsLeft).toBe(limit - 3);
    expect(toBreedSireView(sire({ coverings_this_year: limit + 5 }), 52 * 10).coveringsLeft).toBe(0);
  });

  it('★枠が尽きた父は選べない（★理由は canMate が出す）', () => {
    const limit = DEFAULT_BALANCE.STALLION_BASE_COVERINGS + 2 * DEFAULT_BALANCE.STALLION_COVERINGS_PER_G1;
    expect(toBreedSireView(sire(), 52 * 10).block).toBe(null);
    expect(toBreedSireView(sire({ coverings_this_year: limit }), 52 * 10).block).toBe('sire_coverings_exceeded');
  });

  it('★誕生の週が無い父は通さない（★推測しない）', () => {
    expect(toBreedSireView(sire({ birth_week: null }), 52 * 10).block).toBe('sire_too_young');
    expect(toBreedSireView(sire({ birth_week: null }), 52 * 10).ageYears).toBe(null);
  });
});
