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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
    /** ★2026-10-01: ★毛色は ★馬体の画素だけに焼く（`coated-image.ts`）。★毛色は馬 ID から */
    expect(PARTS).toContain('const coat = coatOfHorseId(horseId);');
    /** ★2026-10-01: ★PC は 2 倍の表（`-2x`）・★スマホは 1 倍。★どちらも 同じ毛色（`coat`） */
    /** ★2026-10-02: ★絵の名前は ★`horseArt`（★性別 × 立ち姿／歩き × 1 倍／2 倍）。★どれも 同じ毛色（`coat`） */
    expect(PARTS).toContain("const walkUrl = useCoatedImage(hires === null ? null : horseArt(sex, 'walk', hires), coat);");
    expect(PARTS).toContain("const standUrl = useCoatedImage(hires === null ? null : horseArt(sex, 'stand', hires), coat);");
  });

  /** ★牝馬は 牝馬の絵（★2026-10-02 オーナー「牝馬戦では さすがにメスの馬の絵が必要」） */
  it('④ ★絵の名前は 性別 × 立ち姿／歩き × 1 倍／2 倍（★牝馬は horse-mare-*）・★画面は その馬の性別を渡す', () => {
    /** ★JSX の部品は ここでは読み込めないので ★原文から関数を取り出して ★そのまま動かす（★写さない） */
    const m = /export function horseArt\(([^)]*)\)[^{]*\{([\s\S]*?)\n\}/.exec(PARTS);
    expect(m, '★horseArt が無い').not.toBeNull();
    const params = m![1]!.split(',').map((p) => p.split(':')[0]!.trim());
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    /** ★`MARE_ART_READY` は ★原文の値を そのまま渡す（★絵を置く前は false ＝ 牝馬も牡馬の絵） */
    const ready = /export const MARE_ART_READY = (true|false);/.exec(PARTS);
    expect(ready, '★MARE_ART_READY が無い').not.toBeNull();
    const f = new Function('MARE_ART_READY', ...params, m![2]!).bind(null, ready![1] === 'true') as (s: string, k: string, h: boolean) => string;
    expect(f('male', 'walk', false)).toBe('/art/uma/horse-walk-sheet.webp');
    expect(f('male', 'stand', true)).toBe('/art/uma/horse-stand-2x.webp');
    if (ready![1] === 'true') {
      expect(f('female', 'walk', true)).toBe('/art/uma/horse-mare-walk-sheet-2x.webp');
      expect(f('female', 'stand', false)).toBe('/art/uma/horse-mare-stand.webp');
      /** ★置いたと言うなら ★本当に置いてある（★404 で 絵が消えない） */
      for (const f2 of ['horse-mare-walk-sheet.webp', 'horse-mare-walk-sheet-2x.webp', 'horse-mare-stand.webp', 'horse-mare-stand-2x.webp']) {
        expect(existsSync(path.join(ROOT, 'apps/web/public/art/uma', f2)), `★${f2} が無い`).toBe(true);
      }
    } else {
      expect(f('female', 'walk', true), '★絵を置く前に 牝馬の名前を出している（★404）').toBe('/art/uma/horse-walk-sheet-2x.webp');
    }
    for (const page of ['apps/web/src/app/train/page.tsx', 'apps/web/src/app/home/page.tsx', 'apps/web/src/app/mypage/page.tsx']) {
      expect(live(read(page)), `★${page} が 性別を渡していない`).toMatch(/<OwnHorseFigure horseId=\{horse\.id\} sex=\{horse\.sex\}/);
    }
  });

  /**
   * 🔴 ★**馬の絵全体に CSS の filter を掛けない**（★2026-10-01・オーナー「馬の上に黒っぽくオーバーレイがあり薄暗い」）。
   *   ★絵全体の brightness / saturate が ★膜を被せたように見えた。★掛けてよいのは影（drop-shadow）だけ。
   */
  it('🔴 ④ ★ホーム・育成の馬に 毛色の CSS filter が残っていない（★鹿毛は素材のまま）', () => {
    const TRAIN = readFileSync(path.join(ROOT, 'apps/web/src/app/train/page.tsx'), 'utf8');
    for (const [name, code] of [['uma-parts', PARTS], ['train', TRAIN]] as const) {
      expect(code, name).not.toMatch(/deformedCoatCssFilter|coatCssFilter/);
    }
    const HOOK = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/coated-image.ts'), 'utf8');
    expect(HOOK).toMatch(/if \(coat === 'bay'\) \{ setUrl\(\{ key, url: src \}\); return; \}/);
    expect(HOOK).toContain('recolorCoatPixels(');
  });

  it('🔴 ① ★利用者の画面が ★見本の `chibi-horse` を ★「その馬」として出さない（★TOP の看板は別扱い）', () => {
    const offenders = filesUnder('apps/web/src/app')
      .filter((f) => !/\/(design-check|design-preview|rig-lab|art-lab|race-quality-lab|race-world-lab|lp-preview|gait-review|still)\//.test(f))
      .filter((f) => /<ChibiHorse\b|chibi-horse/.test(live(read(f))));
    expect(offenders, '★見本の馬を 持ち馬の欄に出している').toEqual([]);
  });
});
