/**
 * ★**発走前の流れの配線**（★2026-09-15・オーナー決定「動画の通りにします」＝ 人気馬の紹介 → 格とレース名 → 出馬表 → ゲート）
 *
 * 【★見ている壊れ方】
 *   ① ★紹介・出馬表の場面が ★**結果**（確定着順・勝ち馬・通過時刻）を読む（★D-098）
 *   ② ★人気の出どころがデモのオッズの 1 か所でない（★画面で勝率やオッズを作る）
 *   ③ ★監査道具が発走の表示秒を ★直書きのまま持つ（★R-31・★2026-09-13 の 4.4 が残る形）
 *   ④ ★場面の分岐が時間割の段と揃っていない（★描かない段がある）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const page = readFileSync(path.resolve(__dirname, '../../web/src/app/race/page.tsx'), 'utf8');

/** ★`if (intro.stage === '<stage>')` から、その分岐の最初の `return;` まで */
function stageBlock(stage: string): string {
  const start = page.indexOf(`if (intro.stage === '${stage}')`);
  expect(start, `★画面に ${stage} の分岐が無い`).toBeGreaterThan(0);
  const end = page.indexOf('return;', start);
  return page.slice(start, end);
}

describe('★発走前の流れの配線', () => {
  it('★① 人気馬の紹介と出馬表の場面は、結果・着順・勝ち馬・通過時刻を読まない（★D-098）', () => {
    for (const stage of ['paddock', 'grade', 'entry']) {
      const block = stageBlock(stage);
      for (const banned of ['result', 'settled', 'winner', 'finishSec', 'finishPos', 'marginLabel', 'development']) {
        expect(block.includes(banned), `★${stage} の分岐が ${banned} を読んでいる`).toBe(false);
      }
    }
  });

  it('★② 人気はデモのオッズ（DEMO_WIN_ODDS）から、描画の関数で並べるだけ', () => {
    expect(page).toContain('const DEMO_WIN_ODDS = [');
    expect(stageBlock('paddock')).toContain('paddockPicksOf(');
    expect(stageBlock('paddock')).toContain('DEMO_WIN_ODDS[i]');
    /** ★パドックの背景（★生成した絵・★無ければタイトルの背景） */
    expect(page).toContain('/art/paddock-bg-v1.webp');
    expect(stageBlock('paddock')).toContain('art.paddockBg ?? art.raceTitle');
    /** ★歩きのコマ（★無ければ走りのコマ）・★走りと同じ組み立て（勝負服・毛色・配置）を通す */
    expect(stageBlock('paddock')).toContain('art.sideWalkHighQuality?.[pick.gate - 1] ?? art.sideHighQuality[pick.gate - 1]');
    expect(page).toContain("loadNativeSet('horse-jockey-side-walk-v1')");
    expect(page).toMatch(/buildFramesByType\(\{ a: walkA, /);
    /** ★携帯（焼いた経路）の歩き: ★目録の役 `side-walk` を読み、★走りと同じ `buildFramesFromBaked` を通す */
    expect(page).toContain("entry.role === 'side-walk'");
    expect(page).toMatch(/return buildFramesFromBaked\(set, new Map\(ok\), SILKS_LAYOUT_CROUCH/);
    expect(page).toContain('const sideWalkHighQuality = bakedWalk !== undefined && bakedWalk.length > 0 ? bakedWalk :');
    const bake = readFileSync(path.resolve(__dirname, '../../../tools/bake-race-frames.mjs'), 'utf8');
    expect(bake).toContain("{ role: 'side-walk', layout: 'crouch', prefix: pickSet('horse-jockey-side-walk-v1') }");
    expect(stageBlock('entry')).toContain('popularityRanksOf(');
    expect(stageBlock('entry')).toContain('DEMO_WIN_ODDS[i]');
    /** ★全画面の出馬表は背景の競馬場を透かす（★オーナー「背景には競馬場」） */
    expect(stageBlock('entry')).toContain('scrimAlpha:');
    expect(stageBlock('entry')).toContain('drawTexturedWorld(');
  });

  it('★③ 監査道具は発走の表示秒を race-intro.ts から読む（★直書きしない）', () => {
    const audit = readFileSync(path.resolve(__dirname, '../../../tools/lib/race-audit-build.mjs'), 'utf8');
    expect(audit).toMatch(/RACE_INTRO_RACE_START_SEC,\s*\n\}\s*from '@star\/render'/);
    expect(audit).not.toMatch(/const RACE_INTRO_RACE_START_SEC\s*=/);
  });

  it('★④ 時間割の段（紹介・空撮・格・レース名・出馬表・ゲート）をすべて画面が描く', () => {
    for (const needle of [
      "if (intro.stage === 'paddock')",
      "if (intro.stage === 'flyover' && renderer === 'v2')",
      "if (intro.stage === 'grade')",
      "if (intro.stage === 'entry')",
      "if (intro.stage === 'title' || intro.stage === 'flyover')",
      "(intro.stage === 'gate-hold' || intro.stage === 'gate-release')",
    ]) expect(page, `★画面に ${needle} が無い`).toContain(needle);
    /** ★ファンファーレは紹介の間は鳴らさない */
    expect(page).toContain("intro.stage !== 'race' && intro.stage !== 'paddock'");
  });
});
