/**
 * 🔴 ★**音源の「早い／後」の分け方が、★黙って音を消さないこと**（★2026-09-24）
 *
 * ============================================================================
 * 【★何をしたか】
 *   ★音源 5 つを ★**作った時点で全部**取りに行っていました（★2.44MB）。
 *   ★音を出さない人にも落ちます。★1 レースで落ちてくる 10.5MB のうちの ★**23%**。
 *   → ★出番の時刻で分けました。★`early: true` だけ先に取り、★残りは
 *     ★**画面が描き始めてから**（`preloadRest()`）。
 *
 * 【🔴 ★この分け方が壊れる形】
 *   ★① ★`early: false` にしたのに ★**`preloadRest()` を呼ぶ所が無い**
 *      → ★その音は ★**一度も鳴りません**。★しかも ★**例外も出ません**
 *        （`cue` は読めていないとき札を立てずに黙って戻ります）。
 *   ★② ★出番の早い音を `early: false` にする
 *      → ★`fanfare` は出番が ★**4.4 秒**しかなく、★間に合わなければその回は鳴りません
 *        （★2026-09-13 のオーナー評「★なったりならなかったりする」がこれ）。
 *   ★③ ★大きい音源を `early: true` に戻す → ★初回の量が元に戻る
 *
 * ⚠️ ★この検査は ★**原文と実ファイル**を読みます（★音は鳴らしません）。
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { RACE_SOUNDS, type RaceSoundId } from '../../web/src/app/race/race-audio.js';

const ROOT = path.resolve(__dirname, '../../..');
const AUDIO_SRC = readFileSync(path.join(ROOT, 'apps/web/src/app/race/race-audio.ts'), 'utf8');
const PAGE = readFileSync(path.join(ROOT, 'apps/web/src/app/race/page.tsx'), 'utf8');
const ids = Object.keys(RACE_SOUNDS) as RaceSoundId[];
/** ★早い側に置いてよい上限（★`gate-open` 0.03MB / `whinny` 0.03MB / `fanfare` 0.26MB） */
const EARLY_MAX_BYTES = 400 * 1024;

describe('🔴 ★レースの音の先読み', () => {
  it('★音源が実在する（★0 件 通過を合格にしない）', () => {
    expect(ids.length, '🔴 ★音源の表が空').toBeGreaterThan(3);
    for (const id of ids) {
      const p = path.join(ROOT, 'apps/web/public', RACE_SOUNDS[id].url);
      expect(existsSync(p), `🔴 ★${p} が無い`).toBe(true);
    }
  });

  it('🔴 ★① `early: false` が在るなら、★`preloadRest()` を呼ぶ所が在る', () => {
    const later = ids.filter((id) => !RACE_SOUNDS[id].early);
    if (later.length === 0) return;
    expect(AUDIO_SRC, '🔴 ★`preloadRest` が音の側に無い').toContain('preloadRest');
    expect(
      PAGE,
      `🔴 ★${later.join(' / ')} は後から取りに行く約束なのに、★画面が \`preloadRest()\` を呼んでいません。`
      + '★そのままだと ★**一度も鳴らず、★例外も出ません**',
    ).toMatch(/preloadRest\(\)/);
  });

  it('🔴 ② ★出番が 4.4 秒しかない `fanfare` は早い側', () => {
    expect(
      RACE_SOUNDS.fanfare.early,
      '🔴 ★`fanfare` を後回しにしています。★出番はイントロの 4.4 秒だけで、'
      + '★間に合わなければその回は一度も鳴りません（★2026-09-13 のオーナー評）',
    ).toBe(true);
  });

  it('🔴 ③ ★早い側は小さいものだけ（★初回の量を戻さない）', () => {
    const heavy = ids.filter((id) => RACE_SOUNDS[id].early
      && statSync(path.join(ROOT, 'apps/web/public', RACE_SOUNDS[id].url)).size > EARLY_MAX_BYTES);
    expect(
      heavy,
      `🔴 ★早い側に大きい音源が在ります（★上限 ${Math.round(EARLY_MAX_BYTES / 1024)}KB）。`
      + '★初回に落ちてくる量が元に戻ります',
    ).toEqual([]);
  });

  it('★対照: 後回しにしたぶんが、実際に大きい（★分けた意味が在る）', () => {
    const bytes = (f: (id: RaceSoundId) => boolean): number => ids.filter(f)
      .reduce((s, id) => s + statSync(path.join(ROOT, 'apps/web/public', RACE_SOUNDS[id].url)).size, 0);
    const later = bytes((id) => !RACE_SOUNDS[id].early);
    const early = bytes((id) => RACE_SOUNDS[id].early);
    expect(later, `🔴 ★後回しが ${later} B しかありません（★早い側 ${early} B）。★分ける意味が無い`)
      .toBeGreaterThan(early);
  });
});
