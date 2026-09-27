/**
 * ★**`/race` の用意中 ── 経過秒と 8〜10 秒の 3 択**（★2026-09-28・`RACE_NOTICE_HANDOFF.md` §5・デザイナー R-18 回答・レビュー側）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★「用意しています」だけの ★終わらない待ち（★経過秒が無い・★選べない）
 *   ② 🔴 ★3 択が ★見本（デモ）にだけ出て ★**実レースの録画では出ない**（★2026-09-28 まで そうでした）
 *   ③ ★「戻る」を ★上段バー任せにして ★3 択に並べない（★全画面では上段バーが隠れる）
 *   ④ ★実レースの「結果だけ見る」が ★そのレースの着順でなく ★別の画面へ送る
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = readFileSync(path.join(ROOT, 'apps/web/src/app/race/page.tsx'), 'utf8');
const LIVE = SRC.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1 ');

/** ★用意中の札（`loadingPanel`）の中身だけ */
const PANEL = (() => {
  const at = LIVE.indexOf('const loadingPanel = (');
  return at < 0 ? '' : LIVE.slice(at, LIVE.indexOf('\n  );', at));
})();

describe('★/race の用意中', () => {
  it('★札が見つかる（★走査が空でない）', () => {
    expect(PANEL.length).toBeGreaterThan(100);
  });

  it('🔴 ① ★経過秒を出す', () => {
    expect(PANEL).toMatch(/経過 \{loadingSeconds\} 秒/);
    expect(PANEL).toMatch(/<progress /);
  });

  it('🔴 ① ★選択肢は ★8〜10 秒で出る', () => {
    const m = /const LOADING_CHOICES_SEC = (\d+);/.exec(LIVE);
    expect(m, '★秒の定数が無い').not.toBeNull();
    const sec = Number(m![1]);
    expect(sec).toBeGreaterThanOrEqual(8);
    expect(sec).toBeLessThanOrEqual(10);
    expect(PANEL).toMatch(/loadingSeconds >= LOADING_CHOICES_SEC/);
  });

  it('🔴 ② ★実レースの録画でも出る（★見本だけに絞っていない）', () => {
    const cond = /\{loadingSeconds >= LOADING_CHOICES_SEC([^(]*)\(/.exec(PANEL);
    expect(cond, '★出す条件が見つからない').not.toBeNull();
    expect(cond![1], '★見本のときだけに絞っている').not.toMatch(/real === null/);
  });

  it('🔴 ③ ★3 つ並ぶ（★待つ・結果だけ見る・戻る）', () => {
    for (const label of ['このまま待つ', '結果だけ見る', '戻る']) {
      expect(PANEL, `★「${label}」が無い`).toContain(`>${label}<`);
    }
    expect(PANEL, '★戻り先が ★来た画面（RETURN_TO）でない').toMatch(/href=\{RETURN_TO \?\? '\/home'\}[^>]*>戻る</);
  });

  it('④ ★実レースの「結果だけ見る」は ★そのレースの着順へ', () => {
    expect(PANEL).toMatch(/real !== null \? `\/races\/\$\{encodeURIComponent\(real\.raceId\)\}`/);
  });
});
