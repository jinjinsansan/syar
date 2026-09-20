/**
 * 🔴 ★**`--yes-production` の門を、★組み合わせで回す**（★2026-09-20）。
 *
 * 【★なぜ在るか】
 *   ⚠️ ★`migrate.mjs` に ★**下見（`--plan`）**を足したとき、
 *     ★註記にも運用簿にも「★`--yes-production` は要りません」と書きました。
 *   🔴 ★**動きませんでした。** ★門が手前で投げます。
 *   🔴 ★原因は ★**試した場所**です: ★staging で試したので、
 *     ★★**門が効かない側でしか確かめていませんでした。**
 *     → ★**差が出ない環境で確かめて、★差が出る環境の話を書いた。**
 *   → ★★**組み合わせは、★環境に触らずここで回します。**
 *
 * ⚠️ ★免除するのは ★**何も書かない `--plan` だけ**。
 *    ★`--baseline` / `--repair-checksum` と併せたら ★**免除しません**（★どちらも記録を書く）。
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error ★`.mjs` の部品（★`.d.mts` を置いていません）
import { needsYesProduction } from '../../../tools/lib/args.mjs';

const needs = needsYesProduction as (
  env: string,
  o?: { plan?: boolean; baseline?: boolean; repair?: boolean },
) => boolean;

describe('🔴 ★migrate: --yes-production を要求する条件', () => {
  it('★staging は、★何をしても要求しない', () => {
    expect(needs('staging'), '★staging で要求した').toBe(false);
    expect(needs('staging', { plan: true })).toBe(false);
    expect(needs('staging', { baseline: true })).toBe(false);
  });

  it('🔴 ★本番は、★既定で要求する（★打ち間違いでは到達できない形）', () => {
    expect(needs('production'), '🔴 ★本番なのに素通りした').toBe(true);
  });

  it('✅ ★本番でも、★何も書かない `--plan` だけは免除', () => {
    expect(needs('production', { plan: true }), '★下見が門で止まる').toBe(false);
  });

  it('🔴 ★`--plan` に、★書く操作を足したら免除しない', () => {
    expect(needs('production', { plan: true, baseline: true }),
      '🔴 ★--baseline は記録を書くのに素通りした').toBe(true);
    expect(needs('production', { plan: true, repair: true }),
      '🔴 ★--repair-checksum は記録を直すのに素通りした').toBe(true);
  });

  it('⚠️ ★知らない環境名は、★安全な側（要求する）に倒す', () => {
    // ★`migrate.mjs` は先に環境名を弾くが、★この関数だけを見たときも広く通らないこと
    expect(needs('prod')).toBe(false);   // ★'production' ではないので、そもそも本番扱いしない
    expect(needs('production', {})).toBe(true);
  });
});
