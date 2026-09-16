/**
 * ★**調教の結果の演出の配線**（★D12-2・2026-09-16・デザイナーのカード `components/training-result`）
 *
 * 【★見ている壊れ方】
 *   ① ★**段の境目（1.13 / 1.10）が画面にも書かれる**（★D-052・二重帳簿。★片方だけ直すと食い違う）
 *   ② ★画面が**伸び幅から段を逆算**する（★`BASE_GAIN` などを画面で再計算する形）
 *   ③ ★**新しい抽選**を画面側で引く（★正典 D-101「既存の乱数の上側を見せるだけ」）
 *   ④ ★「もう一度」「引き直す」に当たるものが置かれる（★射幸性の禁止事項）
 *   ⑤ ★週の印が **1 色に固定**される（★4 値のうち区別が消える）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  TRAINING_RESULT_THRESHOLDS, trainingResultTierOf, GAIN_JITTER,
} from '@star/training';

const ROOT = path.resolve(__dirname, '../../..');
const PAGE = readFileSync(path.join(ROOT, 'apps/web/src/app/training/page.tsx'), 'utf8');
/** ★コメントを空白にしてから見る（★註記の数字を拾わない） */
const CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe('★調教の結果の演出の配線（D12-2）', () => {
  it('① ★段の境目を画面に書いていない', () => {
    /**
     * ⚠️ ★**部分一致で書かないこと**（★2026-09-16 にこれで誤検出しました）。
     *    ★`String(1.10)` は **`"1.1"`** になり、★デモ値 `1.142` の一部に当たって落ちました。
     *    ★**実装は正しく、検査の書き方が雑**でした。
     * → ★画面の**数値リテラルを拾って、値として**比べます。
     */
    const literals = new Set(
      (CODE.match(/(?<![\w.])\d+\.\d+(?![\w.])/g) ?? []).map((s) => Number(s)),
    );
    for (const t of Object.values(TRAINING_RESULT_THRESHOLDS)) {
      expect([...literals], `★境目が画面に写っている: ${t}`).not.toContain(t);
    }
    /** ★段は純関数から引く */
    expect(CODE).toMatch(/trainingResultTierOf/);
    expect(CODE).toMatch(/TRAINING_RESULT_LABEL/);
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

  it('⑤ ★週の印は 4 値それぞれに色がある（★1 色固定にしない）', () => {
    expect(CODE).toMatch(/RACE_MARK_STYLE/);
    /** ★3 つの印に別の見た目（★`none` はバッジを置かずテキスト） */
    expect(CODE).toMatch(/'race-week':/);
    expect(CODE).toMatch(/'before-race':/);
    expect(CODE).toMatch(/'after-race':/);
    expect(CODE).toMatch(/今週の指示に印はありません/);
    /** ★以前の「どの印でも金」に戻していない */
    expect(CODE).not.toMatch(/raceMarkLabel[^\n]*Pill tone="gold"/);
  });

  it('★段の判定そのものは純関数の側（★ここで再実装していない）', () => {
    expect(trainingResultTierOf(GAIN_JITTER.max)).toBe('great');
    expect(trainingResultTierOf(GAIN_JITTER.min)).toBe('normal');
  });
});
