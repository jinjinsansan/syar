/**
 * ★**どのカットを挿入画面に置き換えるか**（★2026-09-10・★構成案 §1）
 *
 * ⚠️ ★置き換えは ★**カットの数・境界・尺を変えない**（★台帳「カット数は減らさない」）。
 *    ★この検査は ★**対象が 1 つだけであること**を固定する。★増やすときは着手順に沿って足す。
 */
import { describe, it, expect } from 'vitest';
import { raceCutInFor } from '../src/race-cutin.js';

/** ★台本 v6 に出てくるカット（★`tmp/timeline` の実測より） */
const SHOTS = [
  'start-front', 'opening-side-lead', 'opening-formation', 'opening-side-settle', 'side-drive', 'fourth-corner-front',
  'straight-contest', 'homestretch-front', 'finish-line', 'winner-follow', 'finish-replay',
] as const;

describe('挿入画面に置き換えるカット', () => {
  it('位置取りの短い隊列図と、4角のコース図だけを置き換える', () => {
    const replaced = SHOTS.filter((id) => raceCutInFor(id) !== undefined);
    expect(replaced).toEqual(['opening-formation', 'fourth-corner-front']);
  });

  it('置き換えるカットには、一言が付いている（★一画面につき一情報）', () => {
    const cut = raceCutInFor('fourth-corner-front');
    expect(cut?.kind).toBe('course-map');
    expect((cut?.caption ?? '').length).toBeGreaterThan(0);
  });

  it('位置取りは実際の隊列を示す専用の挿入画面を使う', () => {
    const cut = raceCutInFor('opening-formation');
    expect(cut?.kind).toBe('formation');
    expect((cut?.caption ?? '').length).toBeGreaterThan(0);
  });

  it('★合格済みのカットは 1 つも置き換えない（★④⑥⑦⑧⑨）', () => {
    for (const id of ['opening-side-lead', 'opening-side-settle', 'side-drive', 'straight-contest', 'finish-line', 'winner-follow', 'finish-replay']) {
      expect(raceCutInFor(id), id).toBeUndefined();
    }
  });

  it('知らない名前でも落ちない', () => {
    expect(raceCutInFor('')).toBeUndefined();
    expect(raceCutInFor('no-such-shot')).toBeUndefined();
  });
});
