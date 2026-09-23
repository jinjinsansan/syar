/**
 * ★**調教画面の顔 3 種の選び方**（★2026-09-23・`design/art/prompts/train-face-*.txt`）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**素材の無い顔を指す**（★3 枚しかないのに 4 つ目の名前を返す）
 *   ② 🔴 ★**疲れているのに上機嫌の顔**（★「休ませる」を促す画面なのに、逆の合図を出す）
 *   ③ ★**境目が `fatigueColor` とずれる**（★色は赤なのに顔は元気、が起きる）
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

  it('🔴 ★3 枚とも実在する（★画面が読む拡張子で）', () => {
    for (const f of FACES) {
      const p = path.join(ROOT, `apps/web/public/art/uma/train-face-${f}.webp`);
      expect(existsSync(p), `★${p} が無い`).toBe(true);
    }
  });

  it('★画面は選ぶ規則を持たない（★trainFaceOf を呼ぶだけ）', () => {
    expect(PAGE).toMatch(/trainFaceOf\(/);
    // ★画面に疲労の閾値が書かれていない（★二重帳簿）
    expect(PAGE.replace(/\/\*[\s\S]*?\*\//g, ' ')).not.toMatch(/fatigue\s*[<>]=?\s*\d/);
  });
});
