/**
 * ★**上限超過は完全抽選**（★正典 §10.4:1321・★**D-117 LT-1〜LT-4**・2026-09-19）
 *
 * > 1レース **8〜18頭**。★**プレイヤー馬を優先し**、残りを NPC 馬で充填
 * > …上限超過は ★**完全抽選**（★**賞金上位優先にしない** — ★新規が弾かれると離脱する）
 *
 * 【★ここで見ている壊れ方】
 *   ★**LT-1** … 18 頭以内なのに絞ってしまう（★「プレイヤー馬を優先し」に反する）
 *   ★**LT-2** … 抽選が決定的でない（★再起動すると当選者が変わる・憲法 4）
 *   🔴 ★**正典が名指しで禁じた形** … ★登録順（先着）や賞金順に偏る
 */
import { describe, expect, it } from 'vitest';
import { drawEntryLottery, lotteryScratchReason, ENTRY_LOTTERY_STREAM } from '../src/entry-lottery.js';
import { FIELD_SIZE } from '../../cli/src/race-field.js';

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `h${String(i).padStart(3, '0')}`);

describe('LT-1 上限以内なら抽選しない', () => {
  it('★1〜18 頭は全員が走る（★境界の内側・R-2）', () => {
    for (const n of [1, 2, 8, 17, FIELD_SIZE.MAX]) {
      const r = drawEntryLottery(ids(n), FIELD_SIZE.MAX, 5);
      expect(r.selected, `${n} 頭`).toEqual(ids(n));
      expect(r.excluded, `${n} 頭`).toEqual([]);
    }
  });

  it('★19 頭で初めて絞る（★境界の外側・R-2）', () => {
    const r = drawEntryLottery(ids(19), FIELD_SIZE.MAX, 5);
    expect(r.selected.length).toBe(FIELD_SIZE.MAX);
    expect(r.excluded.length).toBe(1);
  });

  it('★0 頭でも落ちない', () => {
    expect(drawEntryLottery([], FIELD_SIZE.MAX, 5)).toEqual({ selected: [], excluded: [] });
  });
});

describe('LT-2 決定的（★再起動しても当選者が変わらない）', () => {
  it('★同じ `cycleIndex` なら何度でも同じ', () => {
    const input = ids(30);
    const a = drawEntryLottery(input, FIELD_SIZE.MAX, 123);
    for (let k = 0; k < 20; k += 1) {
      expect(drawEntryLottery(input, FIELD_SIZE.MAX, 123)).toEqual(a);
    }
  });

  it('★`cycleIndex` が違えば違う（★定数を返していないこと・★対照）', () => {
    const input = ids(30);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      seen.add(drawEntryLottery(input, FIELD_SIZE.MAX, i).selected.join(','));
    }
    expect(seen.size, '★どの回も同じ顔ぶれになっている').toBeGreaterThan(30);
  });

  it('★出走表の系列（61）と別の系列を使う', () => {
    // ★同じ系列から引くと、★抽選が起きた回だけ出走表の並びがずれる
    expect(ENTRY_LOTTERY_STREAM).not.toBe(61);
    expect(ENTRY_LOTTERY_STREAM).not.toBe(62); // ★オッズ
    expect(ENTRY_LOTTERY_STREAM).not.toBe(71); // ★凍結（entry-freeze）
  });
});

describe('🔴 完全抽選（★正典が名指しで禁じた偏りが無いこと）', () => {
  /**
   * ★**登録順（先着）に偏っていないか。**
   *   ★30 人の登録から 18 人を選ぶのを 3,000 回。★公平なら**どの順位も 18/30 = 60%** で当たります。
   *   ★先着順の実装なら ★**先頭 18 人が 100%・残り 12 人が 0%** になります。
   */
  it('★登録が早い人が有利になっていない（★3,000 回・どの順位も 60% 前後）', () => {
    const N = 30;
    const TRIALS = 3000;
    const input = ids(N);
    const wins = new Array<number>(N).fill(0);
    for (let i = 0; i < TRIALS; i += 1) {
      const r = drawEntryLottery(input, FIELD_SIZE.MAX, i);
      for (const h of r.selected) wins[input.indexOf(h)]! += 1;
    }
    const rate = wins.map((w) => w / TRIALS);
    const expected = FIELD_SIZE.MAX / N; // ★0.6
    /**
     * ★SE = √(p(1−p)/n) = √(0.6×0.4/3000) ≒ **0.0089**。
     *   ★±4 SE ＝ ±0.036 を外れたら偏りです。
     */
    const se = Math.sqrt((expected * (1 - expected)) / TRIALS);
    for (let k = 0; k < N; k += 1) {
      expect(Math.abs(rate[k]! - expected), `登録 ${k} 番目の当選率 ${rate[k]!.toFixed(3)}`)
        .toBeLessThan(4 * se);
    }
    // ★対照: ★先着順ならここが 1.0 と 0.0 に割れる
    expect(Math.max(...rate)).toBeLessThan(0.95);
    expect(Math.min(...rate)).toBeGreaterThan(0.25);
  });

  it('★当選と落選を足すと登録の全員になる（★誰も消えない）', () => {
    const input = ids(25);
    const r = drawEntryLottery(input, FIELD_SIZE.MAX, 7);
    expect([...r.selected, ...r.excluded].sort()).toEqual([...input].sort());
    expect(new Set([...r.selected, ...r.excluded]).size).toBe(25);
  });

  it('★返す並びは入力の順（★呼ぶ側が行と突き合わせられる）', () => {
    const input = ids(25);
    const r = drawEntryLottery(input, FIELD_SIZE.MAX, 7);
    expect(r.selected).toEqual(input.filter((h) => r.selected.includes(h)));
    expect(r.excluded).toEqual(input.filter((h) => r.excluded.includes(h)));
  });
});

describe('LT-4 落選の理由', () => {
  it('★理由に「抽選」と「返金した」が入る（★黙って消えたにしない）', () => {
    const msg = lotteryScratchReason(25, FIELD_SIZE.MAX);
    expect(msg).toContain('25');
    expect(msg).toContain('18');
    expect(msg).toContain('抽選');
    expect(msg).toContain('返金');
  });
});

describe('★不正な入力', () => {
  it('★`limit` が 0 以下・整数でないなら投げる', () => {
    expect(() => drawEntryLottery(ids(5), 0, 1)).toThrow(/limit が不正/);
    expect(() => drawEntryLottery(ids(5), -1, 1)).toThrow(/limit が不正/);
    expect(() => drawEntryLottery(ids(5), 1.5, 1)).toThrow(/limit が不正/);
  });
});
