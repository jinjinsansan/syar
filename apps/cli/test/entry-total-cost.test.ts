/**
 * ★**出走登録の画面が言う額 ＝ `enter_race` が引く額**（★2026-10-01・裁定 `REVIEW_D130_TRAINING_COST_VERDICT_20261001.md` §4）
 *
 * 【★見ている壊れ方】
 *   ★画面は 登録料（200）だけを「出走料」「登録後の残り」「登録する（… EP）」と確認の文・足りるかの判定に使い、
 *   ★サーバーの `enter_race` は ★登録料 ＋ 騎手の料金 を引いていた（★騎手 400 で 200 と言い 600 引く）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ENTRY_FEE_EP, JOCKEYS } from '@star/scheduler';
import { entryTotalEP } from '../../web/src/lib/entry-screen.js';
import { lastFunctionBody } from './lib/sql-source.js';

const ROOT = path.resolve(__dirname, '../../..');
const PAGE = readFileSync(path.join(ROOT, 'apps/web/src/app/entry/page.tsx'), 'utf8');

describe('★出走登録の額（D-130 裁定 §4）', () => {
  it('① ★騎手 400 なら 600・★騎手なしなら 200（★名簿のすべての騎手で 登録料 ＋ 料金）', () => {
    const j400 = JOCKEYS.find((j) => j.feeEP === 400)!;
    expect(entryTotalEP(ENTRY_FEE_EP, j400.id)).toBe(600);
    expect(entryTotalEP(ENTRY_FEE_EP, null)).toBe(200);
    for (const j of JOCKEYS) expect(entryTotalEP(ENTRY_FEE_EP, j.id), j.id).toBe(ENTRY_FEE_EP + j.feeEP);
  });

  it('② ★サーバーの enter_race も 登録料 ＋ 騎手の料金 を引く（★画面と同じ式であることの錨）', () => {
    const { body } = lastFunctionBody('enter_race');
    expect(body).toMatch(/v_total\s*:=\s*v_fee\s*\+\s*v_jockey_fee/);
  });

  it('③ ★画面の 5 か所（判定・確認の文・不足の札・出走料・残り・ボタン）が 登録料だけを使っていない', () => {
    /** ★`race.feeEP` が残ってよいのは ★合計を作る 1 か所だけ */
    const uses = PAGE.match(/race\.feeEP/g) ?? [];
    expect(uses.length, '★race.feeEP は entryTotalEP に渡す 1 か所だけ').toBe(1);
    expect(PAGE).toMatch(/entryTotalEP\(race\.feeEP, jockeyId\)/);
    expect(PAGE).toMatch(/epBalance >= totalEP/);
    expect(PAGE).toMatch(/`登録する（\$\{totalEP\} EP）`/);
  });
});
