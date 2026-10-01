/**
 * ★**自分の馬は どの画面でも 同じ 1 頭の姿**（★2026-09-28・オーナー「自分の馬は 仔馬の誕生から育成からレース発走まで一環として同じ馬に。
 *   その自分の馬がダッシュボードに出るだけですよね？」・レビュー側の裁定「先に直す・網を 1 行」）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★持ち馬の欄に ★見本の `chibi-horse`（★デザイナーの見本・★全馬同じ）を ★「その馬」として出す（★P0-B と同じ族）
 *   ② 🔴 ★画面ごとに ★馬の姿を 別々に描く（★毛色の出どころが割れて 別の馬に見える）
 *   ③ ★毛色が ★馬 ID でなく 別の物（枠番・並び順）から決まる
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string): string => readFileSync(path.join(ROOT, p), 'utf8');
const live = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const PARTS = live(read('apps/web/src/components/uma/uma-parts.tsx'));

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...filesUnder(rel));
    else if (/\.(tsx?)$/.test(e.name)) out.push(rel);
  }
  return out;
}

describe('★自分の馬は 同じ 1 頭の姿', () => {
  it('🔴 ② ★育成・ダッシュボード・マイページは ★同じ部品 `OwnHorseFigure` で ★その馬の ID を渡す', () => {
    for (const page of ['apps/web/src/app/train/page.tsx', 'apps/web/src/app/home/page.tsx', 'apps/web/src/app/mypage/page.tsx']) {
      expect(live(read(page)), `★${page} が その馬の姿を出していない`).toMatch(/<OwnHorseFigure horseId=\{horse\.id\}/);
    }
    /** ★歩きの表と毛色の掛け方は ★部品の中だけ（★画面が 自分で描かない） */
    for (const page of ['apps/web/src/app/home/page.tsx', 'apps/web/src/app/mypage/page.tsx', 'apps/web/src/app/train/page.tsx']) {
      expect(live(read(page)), `★${page} が 立ち姿を自分で描いている`).not.toContain('horse-stand.webp');
    }
  });

  it('③ ★毛色は ★馬 ID から（★`coatOfHorseId`・★レースの走りと同じ出どころ）', () => {
    /** ★2026-10-01: ★デフォルメの絵なので デフォルメ用の表（★旧の写真向けの表では 約 6 割が同じオレンジだった） */
    expect(PARTS).toContain('const coatFilter = deformedCoatCssFilter(coatOfHorseId(horseId));');
  });

  it('🔴 ① ★利用者の画面が ★見本の `chibi-horse` を ★「その馬」として出さない（★TOP の看板は別扱い）', () => {
    const offenders = filesUnder('apps/web/src/app')
      .filter((f) => !/\/(design-check|design-preview|rig-lab|art-lab|race-quality-lab|race-world-lab|lp-preview|gait-review|still)\//.test(f))
      .filter((f) => /<ChibiHorse\b|chibi-horse/.test(live(read(f))));
    expect(offenders, '★見本の馬を 持ち馬の欄に出している').toEqual([]);
  });
});
