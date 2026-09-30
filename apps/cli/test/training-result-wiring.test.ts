/**
 * ★**調教の画面の配線**（★D12-2・2026-09-16・デザイナーのカード `components/training-result`）
 *
 * ★2026-09-30 書き換え: ★旧 `/training` を `/train` へ畳んだ（★オーナー「1 つにまとめる」・デザイナー R-21）。
 *   ★旧 `/training` の「結果の段」のカードは ★**見本の値（DEMO_JITTERS）だけ**で動いていたので ★持ってこなかった
 *   （★週送りの実データを画面に繋ぐ便が来たら ★その画面で `trainingResultTierOf` を引く）。
 *   ★週の印は ★「今週の一言」として `raceWeekMarkOf` から出す（★バッジの色は使わない・資料 §3-2）。
 *
 * 【★見ている壊れ方】
 *   ① ★**段の境目（1.13 / 1.10）が画面にも書かれる**（★D-052・二重帳簿。★片方だけ直すと食い違う）
 *   ② ★画面が**伸び幅から段を逆算**する（★`BASE_GAIN` などを画面で再計算する形）
 *   ③ ★**新しい抽選**を画面側で引く（★正典 D-101「既存の乱数の上側を見せるだけ」）
 *   ④ ★「もう一度」「引き直す」に当たるものが置かれる（★射幸性の禁止事項）
 *   ⑤ ★出走の前後の判定を ★画面が自前で持つ（★`raceWeekMarkOf` を通さない）
 *   ⑥ ★能力・素質の数値やバーが画面に戻る（★資料 §3-5 ①・正典 §5.5）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  TRAINING_RESULT_THRESHOLDS, trainingResultTierOf, GAIN_JITTER,
} from '@star/training';

const ROOT = path.resolve(__dirname, '../../..');
const PAGE = readFileSync(path.join(ROOT, 'apps/web/src/app/train/page.tsx'), 'utf8');
/** ★コメントを空白にしてから見る（★註記の数字を拾わない） */
const CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe('★調教の画面の配線（D12-2・R-21）', () => {
  it('① ★段の境目を画面に書いていない', () => {
    /** ★数値リテラルを拾って ★値として比べる（★部分一致だと `1.1` が `1.142` に当たる・2026-09-16） */
    const literals = new Set(
      (CODE.match(/(?<![\w.])\d+\.\d+(?![\w.])/g) ?? []).map((s) => Number(s)),
    );
    for (const t of Object.values(TRAINING_RESULT_THRESHOLDS)) {
      expect([...literals], `★境目が画面に写っている: ${t}`).not.toContain(t);
    }
  });

  it('② ★伸び幅から逆算していない（★成長式の項が画面に無い）', () => {
    for (const leak of ['BASE_GAIN', 'menuCoef', 'headroom', 'growthCoef', 'temperCoef']) {
      expect(CODE, `★成長式が画面に写っている: ${leak}`).not.toContain(leak);
    }
  });

  it('③ ★画面で乱数を引いていない（★憲法 4・新しい抽選を足さない）', () => {
    expect(CODE).not.toMatch(/Math\.random\(/);
    expect(CODE).not.toMatch(/Date\.now\(/);
  });

  it('④ ★「もう一度」「引き直す」に当たる語を置いていない', () => {
    for (const bad of ['もう一度', '引き直', 'リロール', 'やり直']) {
      expect(CODE, `★射幸性の語が画面にある: ${bad}`).not.toContain(bad);
    }
  });

  it('⑤ ★出走の前後は `raceWeekMarkOf` から（★画面で週数を比べない）', () => {
    expect(CODE).toMatch(/raceWeekMarkOf\(h\.weeksToNextRace, h\.weeksSinceLastRace\)/);
    expect(CODE, '★画面が 週数で 印を決めている').not.toMatch(/weeksToNextRace\s*[=<>!]=?\s*\d/);
  });

  it('🔴 ⑥ ★能力・素質の数値やバーを出さない（★調子と疲れの段と言葉だけ）', () => {
    for (const bad of ['trainingBarsOf', 'DEMO_TRAINING_ABILITY', 'potential', 'StatBar', '{horse.fatigue}']) {
      expect(CODE, `★能力・数値が画面に戻った: ${bad}`).not.toContain(bad);
    }
    expect(CODE).toContain('fatigueStepOf(horse.fatigue)');
  });

  it('★段の判定そのものは純関数の側（★ここで再実装していない）', () => {
    expect(trainingResultTierOf(GAIN_JITTER.max)).toBe('great');
    expect(trainingResultTierOf(GAIN_JITTER.min)).toBe('normal');
  });
});
