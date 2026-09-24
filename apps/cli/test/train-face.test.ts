/**
 * ★**調教画面の気分 3 段の選び方**（★2026-09-23）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**素材の無い名前を返す**（★段を増やしたのに素材が無い）
 *   ② 🔴 ★**疲れているのに上機嫌**（★「休ませる」を促す画面なのに、逆の合図を出す）
 *   ③ ★**境目が `fatigueColor` とずれる**（★色は赤なのに顔は元気、が起きる）
 *   ④ 🔴 ★**画面が指す素材が実在しない**（★割れた画像が出る）
 *   ⑤ 🔴 ★**3 値が画面のどこにも出ない**（★2026-09-24 に絵が 1 種になったので、★言葉だけが頼り）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { trainFaceOf, fatigueColor, type TrainFace } from '../../web/src/lib/stable.js';

const ROOT = path.resolve(__dirname, '../../..');
const PAGE = readFileSync(path.join(ROOT, 'apps/web/src/app/train/page.tsx'), 'utf8');
const FACES: readonly TrainFace[] = ['happy', 'normal', 'tired'];

describe('★調教画面の顔 3 種', () => {
  it('① ★返すのは 3 種だけ（★どの入力でも）', () => {
    for (let c = 1; c <= 5; c += 1) {
      for (const f of [0, 15, 30, 31, 59, 60, 61, 80, 100]) {
        expect(FACES, `★condition=${c} fatigue=${f}`).toContain(trainFaceOf(c as 1 | 2 | 3 | 4 | 5, f));
      }
    }
  });

  it('② 🔴 ★疲労が先（★絶好調でも疲れていれば疲れた顔）', () => {
    expect(trainFaceOf(5, 80)).toBe('tired');
    expect(trainFaceOf(5, 30)).toBe('happy');
  });

  it('③ ★境目は fatigueColor と同じ（★60 超で赤 ＝ 疲れた顔）', () => {
    expect(fatigueColor(60)).not.toBe('#a81a13');
    expect(fatigueColor(61)).toBe('#a81a13');
    expect(trainFaceOf(5, 60)).toBe('happy');
    expect(trainFaceOf(5, 61)).toBe('tired');
  });

  it('★調子での出し分け（★疲れていないとき）', () => {
    expect(trainFaceOf(1, 0)).toBe('tired');
    expect(trainFaceOf(2, 0)).toBe('tired');
    expect(trainFaceOf(3, 0)).toBe('normal');
    expect(trainFaceOf(4, 0)).toBe('happy');
    expect(trainFaceOf(5, 0)).toBe('happy');
  });

  /**
   * 🔴 ★**2026-09-24: 顔の絵は 1 種になりました**（★空き `LOOK-FACE-MOODS-MISSING`）。
   *   ★以前ここは `train-face-{happy,normal,tired}.webp` の 3 枚を見ていました。
   *   ★しかしその 3 枚は ★**レースの馬と絵柄が違う**ため使うのをやめ、
   *   ★画面は ★**歩きのコマから切り出した 1 枚**（`horse-face.webp`）を出しています。
   *   ⚠️ ★網を消さずに ★**見る先を変えます** — ★画面が読むファイルを見ていないと、
   *      ★素材を消したときに ★**割れた画像**が出ます（★それがこの網の目的）。
   */
  it('🔴 ★画面が読む素材が実在する（★画面の記述から拾う）', () => {
    const refs = [...PAGE.matchAll(/\/art\/uma\/([\w-]+\.webp)/g)].map((m) => m[1]!);
    expect(refs.length, '★画面が素材を 1 つも指していない').toBeGreaterThan(0);
    for (const f of new Set(refs)) {
      const p = path.join(ROOT, `apps/web/public/art/uma/${f}`);
      expect(existsSync(p), `★${p} が無い`).toBe(true);
    }
  });

  /**
   * 🔴 ★**3 値が画面のどこにも出ていない、を止める**。
   *   ★言葉も部品も消えると ★`trainFaceOf` は「呼ばれているが何も変えない」関数になります。
   */
  it('🔴 ★3 値それぞれに出す言葉が在る', () => {
    const table = PAGE.match(/FACE_WORD[^=]*=\s*\{([\s\S]*?)\}/);
    expect(table, '★FACE_WORD が画面に無い').not.toBeNull();
    for (const f of FACES) expect(table![1], `★${f} の言葉が無い`).toContain(`${f}:`);
  });

  /**
   * 🔴 ★**表情の部品が、素材ごと在ること**（★オーナー決定 D-4・2026-09-24）。
   *   ★`FACE_PART` が `null` でない段には、★`/art/uma/horse-face-part-<名>.webp` が要ります。
   *   ⚠️ ★**平常は `null`** が正しい（★部品は「平常をどう変えるか」なので）。
   *      ★3 つとも `null` なら、★絵は 1 種に戻っています。★それも落とします。
   */
  it('🔴 ★表情の部品が、素材ごと在る', () => {
    const table = PAGE.match(/FACE_PART[^=]*=\s*\{([\s\S]*?)\}/);
    expect(table, '★FACE_PART が画面に無い').not.toBeNull();
    const parts = new Map(
      [...table![1]!.matchAll(/(\w+)\s*:\s*(null|'([\w-]+)')/g)].map((m) => [m[1]!, m[3] ?? null]),
    );
    for (const f of FACES) expect(parts.has(f), `★${f} の段が FACE_PART に無い`).toBe(true);
    const named = [...parts.values()].filter((v) => v !== null);
    expect(named.length, '🔴 ★部品が 1 つも無い（★絵が 1 種に戻っています）').toBeGreaterThan(1);
    for (const name of named) {
      const p = path.join(ROOT, `apps/web/public/art/uma/horse-face-part-${name}.webp`);
      expect(existsSync(p), `★${p} が無い`).toBe(true);
    }
  });

  it('★画面は選ぶ規則を持たない（★trainFaceOf を呼ぶだけ）', () => {
    expect(PAGE).toMatch(/trainFaceOf\(/);
    // ★画面に疲労の閾値が書かれていない（★二重帳簿）
    expect(PAGE.replace(/\/\*[\s\S]*?\*\//g, ' ')).not.toMatch(/fatigue\s*[<>]=?\s*\d/);
  });
});
