/**
 * ★**賞金の「発生」と「発行」を分ける**（★PR-1・2026-09-19）
 *   ★裁定 `REVIEW_UI4_PREP_VERDICT_20260919.md` §5
 *
 * 【🔴 ★何が無かったか】
 *   ★`pp_ledger.user_id` は `not null`（`0001:48`）／★`awardPrizes` は NPC 馬を `continue` で飛ばす。
 *   → ★★**NPC 馬の獲得賞金は、どこにも 1 行も存在しませんでした。**
 *   ★**D-102 ③** の出品価格の式〔`3,000 + G1勝利数 × 8,000 + 総獲得賞金 / 20`〕は
 *   ★**D-102 ②**「売る馬は NPC 世界から取る」と組で、★**存在しない数**を必要としていました（★T-11 を塞ぐ）。
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**`prize_pp` の書き込みが `continue` の後ろに移る**（★NPC が源を失う・再発）
 *   ② 🔴 ★**賞金表が SQL に写される**（D-052）
 *   ③ 🔴 ★**`pp_ledger` にも NPC の行を立てる**（★§3.4 の PP 発行量が過大に出る）
 *   ④ 🔴 ★**確定していない行に賞金が入る**
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { allMigrationsBody } from './lib/sql-source.js';

const ROOT = path.resolve(__dirname, '../../..');
const AWARD = readFileSync(path.join(ROOT, 'apps/worker/src/prize-award.ts'), 'utf8');
/** ★TypeScript の註記を落とす（★CK-1 と同じ考え） */
const LIVE = AWARD.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const ALL = allMigrationsBody();

describe('★① 書き込みの位置（★NPC を飛ばす前）', () => {
  it('🔴 ★`prize_pp` の update が、NPC を飛ばす `continue` より前にある', () => {
    const upd = LIVE.indexOf('update race_entries set prize_pp');
    const skip = LIVE.indexOf('row.owner_id === null');
    expect(upd, '★prize_pp を書いていない').toBeGreaterThan(-1);
    expect(skip, '★NPC を飛ばす判定が無い（★走査が空・R-21）').toBeGreaterThan(-1);
    expect(upd, '🔴 ★NPC を飛ばした後に書いている ＝ ★NPC の賞金がまた存在しなくなる')
      .toBeLessThan(skip);
  });

  it('★額は `prizeFor()` が決めた同じ値（★別に計算し直していない）', () => {
    expect(LIVE, '★prizeFor の結果を渡していない').toMatch(/prize_pp = \$1[\s\S]{0,120}\[amount,/);
  });
});

describe('★② 賞金表を SQL に写していない（D-052）', () => {
  it('🔴 ★移行のどこにも賞金の額が直書きされていない', () => {
    /**
     * ⚠️ ★`prize.ts` の値（★win1 の 1 着 5,000 など）が SQL に現れたら、
     *    ★**表が 2 か所**になります。
     */
    expect(ALL, '★賞金表が SQL に写されている').not.toMatch(/\bprize_pp\s*:?=\s*\d/);
    expect(ALL, '★賞金の計算が SQL に入っている').not.toMatch(/case[\s\S]{0,80}finish_pos[\s\S]{0,80}then\s+\d{4}/i);
  });
});

describe('★③ `pp_ledger` は「実際に発行した分だけ」のまま', () => {
  it('🔴 ★NPC にも `pp_ledger` を立てていない（★§3.4 の PP 発行量が過大に出る）', () => {
    /** ★`insert into pp_ledger` は `continue` より**後ろ**にあること */
    const skip = LIVE.indexOf('row.owner_id === null');
    const led = LIVE.indexOf('insert into pp_ledger');
    expect(led, '★pp_ledger を書いていない').toBeGreaterThan(-1);
    expect(led, '🔴 ★NPC にも PP を発行している').toBeGreaterThan(skip);
  });

  it('★`users.prize_points` の更新も `continue` より後ろ', () => {
    const skip = LIVE.indexOf('row.owner_id === null');
    const upd = LIVE.indexOf('update users set prize_points');
    expect(upd).toBeGreaterThan(skip);
  });
});

describe('★④ 列の制約', () => {
  it('🔴 ★確定していない走りに賞金が入らない', () => {
    expect(ALL, '★制約が無い').toMatch(/race_entries_prize_only_when_finished[\s\S]{0,200}finish_pos is not null/);
  });

  it('🔴 ★負の賞金が入らない', () => {
    expect(ALL, '★制約が無い').toMatch(/race_entries_prize_non_negative/);
  });

  it('★`race_entries` は閉じたまま（★公開ビュー経由だけ）', () => {
    /** ⚠️ ★`prize_pp` を足したからといって、★実体表を開けないこと */
    expect(ALL, '★race_entries に grant が付いた').not.toMatch(/grant\s+select\s+on\s+race_entries\s+to/i);
  });
});
