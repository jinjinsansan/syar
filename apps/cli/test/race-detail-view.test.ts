/**
 * ★**レース詳細（`/races/[id]`）の見た目を 実際に描いて見る**（★2026-09-30・デザイナー R-21 の引き渡し資料で作り直した）。
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★照合が一致しないとき ★赤の × を出さない（★隠す）
 *   ② 🔴 ★1〜3 番人気の単勝だけ 色や大きさを変える（★オッズを煽る・資料 §2-5 ①・L-8）
 *   ③ ★上限の単勝を「150.0+」で出さない／★確定後に 着順の順に並ばない
 *   ④ ★「録画」の語・★そのレースの映像への直のリンク（★裁定 Q-RACE-6）が戻る
 * ★サーバーの読み込みは通さない（★画面の部品に 計算済みの値を渡して描く）。
 */
import { describe, it, expect } from 'vitest';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// @ts-expect-error ★画面の部品は .tsx（★この網の型検査は jsx を持たない）。★型は下の props の型で縛る
import RaceDetailView from '../../web/src/app/races/[id]/race-detail-view';
import type { RaceDetailProps } from '../../web/src/app/races/[id]/race-detail-props';

const BASE: Omit<RaceDetailProps, 'status' | 'reveal' | 'verified'> = {
  id: 'r1', title: '天河記念', gradeLabel: 'G1', scheduledAtIso: '2026-09-30T12:00:00Z', startClock: '21:00',
  distanceLabel: '芝2,400m', conditionLabel: '良', purse: 12000, commit: 'c0ffee',
  rows: [1, 2, 3, 4].map((g) => ({
    gate: g, horseName: `ウマ${g}`, ownerLabel: '厩舎', strategy: 'nige',
    odds: g === 4 ? 150 : 2.5 * g, capped: g === 4, popularity: g, place: 5 - g, finishTime: '2:24.1',
  })),
};
/** ★この網の変換は 旧い JSX（React.createElement）なので ★描く前に React を置く（★画面の側は Next の自動変換） */
(globalThis as { React?: unknown }).React = React;
const render = (p: RaceDetailProps): string => renderToStaticMarkup(createElement(RaceDetailView, p));

describe('★レース詳細を描く（R-21）', () => {
  it('🔴 ① 照合: 一致しない → 赤の ×「一致しません（要調査）」／一致 → ✓／公開前 → 確定後に検証', () => {
    const bad = render({ ...BASE, status: 'settled', reveal: 'r', verified: false });
    expect(bad).toContain('一致しません（要調査）');
    expect(bad).toContain('#a81a13');
    expect(render({ ...BASE, status: 'settled', reveal: 'r', verified: true })).toContain('一致しました');
    const pending = render({ ...BASE, status: 'scheduled', reveal: null, verified: null });
    expect(pending).toContain('確定後に検証できます');
    expect(pending).toContain('確定後に公開されます');
    expect(pending).toContain('発売締切まで');
  });

  it('🔴 ② 単勝は 人気に関係なく 同じ大きさ・同じ色（★赤く大きくしない）', () => {
    const h = render({ ...BASE, status: 'scheduled', reveal: null, verified: null });
    const odds = [...h.matchAll(/<span class="u-num" style="([^"]*)">(\d+\.\d\+?)<\/span>/g)];
    expect(odds.length, '★単勝が 4 頭ぶん描かれていない').toBe(4);
    expect(new Set(odds.map((m) => m[1])).size, '★人気で 単勝の見た目が変わっている').toBe(1);
    expect(odds[0]![1]).toContain('font-size:16px');
    expect(odds[0]![1]).not.toMatch(/#a81a13|#d62f26|a-num-rank/);
  });

  it('③ 上限は「150.0+」・確定後は 着順の順に並ぶ', () => {
    const settled = render({ ...BASE, status: 'settled', reveal: 'r', verified: true });
    expect(settled).toContain('150.0+');
    const order = [...settled.matchAll(/ウマ(\d)/g)].map((m) => m[1]);
    expect(order.slice(0, 4)).toEqual(['4', '3', '2', '1']);
    expect(settled).toContain('このレースは');
  });

  it('🔴 ④「録画」の語・そのレースの映像への直のリンクが無い（★Q-RACE-6）', () => {
    for (const status of ['scheduled', 'settled'] as const) {
      const h = render({ ...BASE, status, reveal: status === 'settled' ? 'r' : null, verified: status === 'settled' ? true : null });
      expect(h).not.toContain('録画');
      expect(h).not.toContain('/race?race=');
      expect(h, '★投票の入口（/races/[id]/bet）を張っている').not.toContain('/bet');
    }
  });
});
