import { describe, expect, it } from 'vitest';
import {
  RACE_INTRO_END_SEC, RACE_INTRO_FLYOVER_SEC, RACE_INTRO_FLYOVER_START_SEC, RACE_INTRO_RACE_START_SEC, RACE_INTRO_TITLE_END_SEC,
  RACE_INTRO_TITLE_START_SEC, RACE_INTRO_GRADE_END_SEC, RACE_INTRO_ENTRY_END_SEC, RACE_INTRO_GATE_HOLD_SEC,
  RACE_INTRO_PADDOCK_EACH_SEC, RACE_INTRO_PADDOCK_COUNT, RACE_INTRO_PADDOCK_END_SEC,
  raceIntroAt, startHorseVisualAt, popularityRanksOf, paddockPicksOf, drawPaddockIntro, drawGradeIntro,
} from '../src/index.js';

describe('raceIntroAt', () => {
  /**
   * ★**発走前の順番**（★2026-09-15・オーナー決定「★動画の通りにします」）:
   *   ★人気馬の紹介 → 空撮 → 格の紹介 → レース名 → 出馬表 → ゲート待機 → 発走
   * ⚠️ ★秒を直書きしないこと（★段の ★**真ん中**を渡します）
   */
  it('★人気馬の紹介 → 空撮 → 格 → レース名 → 出馬表 → ゲート待機の順に進み、発馬までレース時計を止める', () => {
    const mid = (a: number, b: number): number => (a + b) / 2;
    const order = [
      mid(0, RACE_INTRO_PADDOCK_END_SEC),
      mid(RACE_INTRO_FLYOVER_START_SEC, RACE_INTRO_FLYOVER_SEC),
      mid(RACE_INTRO_FLYOVER_SEC, RACE_INTRO_GRADE_END_SEC),
      mid(RACE_INTRO_TITLE_START_SEC, RACE_INTRO_TITLE_END_SEC),
      mid(RACE_INTRO_TITLE_END_SEC, RACE_INTRO_ENTRY_END_SEC),
      mid(RACE_INTRO_GATE_HOLD_SEC, RACE_INTRO_RACE_START_SEC),
    ].map((d) => raceIntroAt(d).stage);
    expect(order).toEqual(['paddock', 'flyover', 'grade', 'title', 'entry', 'gate-hold']);
    expect(raceIntroAt(0)).toMatchObject({ stage: 'paddock', raceDisplaySec: 0, paddockIndex: 0, sinceSec: 0 });
    expect(raceIntroAt(RACE_INTRO_TITLE_END_SEC)).toMatchObject({ stage: 'entry', raceDisplaySec: 0, sinceSec: 0 });
    expect(raceIntroAt(RACE_INTRO_GATE_HOLD_SEC)).toMatchObject({ stage: 'gate-hold', raceDisplaySec: 0 });
    expect(raceIntroAt(RACE_INTRO_RACE_START_SEC - 0.01).raceDisplaySec).toBe(0);
    /** ★段は切れ目なく並ぶ（★隙間・重なりが無い） */
    expect(RACE_INTRO_PADDOCK_END_SEC).toBe(RACE_INTRO_PADDOCK_EACH_SEC * RACE_INTRO_PADDOCK_COUNT);
    expect(RACE_INTRO_FLYOVER_START_SEC).toBe(RACE_INTRO_PADDOCK_END_SEC);
    expect(RACE_INTRO_TITLE_START_SEC).toBe(RACE_INTRO_GRADE_END_SEC);
    expect(RACE_INTRO_GATE_HOLD_SEC).toBe(RACE_INTRO_ENTRY_END_SEC);
  });

  it('★人気馬の紹介は 1 頭 RACE_INTRO_PADDOCK_EACH_SEC 秒ずつ、何頭目かと段の中の秒を返す', () => {
    for (let i = 0; i < RACE_INTRO_PADDOCK_COUNT; i += 1) {
      const s = raceIntroAt(i * RACE_INTRO_PADDOCK_EACH_SEC + 1.5);
      expect(s.stage).toBe('paddock');
      expect(s.paddockIndex).toBe(i);
      expect(s.sinceSec).toBeCloseTo(1.5, 9);
    }
  });

  it('扉開放と同時にレース時計を開始する', () => {
    expect(raceIntroAt(RACE_INTRO_RACE_START_SEC)).toEqual({
      stage: 'gate-release', raceDisplaySec: 0, releaseProgress: 0, sinceSec: 0,
    });
    expect(raceIntroAt(RACE_INTRO_RACE_START_SEC + 0.6).stage).toBe('gate-release');
    expect(raceIntroAt(RACE_INTRO_RACE_START_SEC + 0.6).raceDisplaySec).toBeCloseTo(0.6);
  });

  it('発馬映像後もレース時間を巻き戻さず通常中継へ渡す', () => {
    const state = raceIntroAt(RACE_INTRO_END_SEC);
    expect(state.stage).toBe('race');
    expect(state.raceDisplaySec).toBeCloseTo(RACE_INTRO_END_SEC - RACE_INTRO_RACE_START_SEC);
  });
});

describe('★人気と紹介する馬', () => {
  const entries = [
    { gate: 1, winOdds: 17.5 }, { gate: 2, winOdds: 3.4 }, { gate: 3, winOdds: 9.4 }, { gate: 4, winOdds: 8.6 },
    { gate: 5, winOdds: 23.0 }, { gate: 6, winOdds: 7.7 }, { gate: 7, winOdds: 43.9 }, { gate: 8, winOdds: 2.5 },
  ];
  it('★人気はオッズの低い順（★同じオッズは馬番の若い順）', () => {
    const r = popularityRanksOf(entries);
    expect([8, 2, 6, 4, 3, 1, 5, 7].map((g) => r.get(g))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const tie = popularityRanksOf([{ gate: 5, winOdds: 4 }, { gate: 2, winOdds: 4 }]);
    expect(tie.get(2)).toBe(1);
    expect(tie.get(5)).toBe(2);
  });
  it('★紹介は 3 番人気 → 2 番人気 → 1 番人気の順（★動画と同じく人気の低いほうから）', () => {
    expect(paddockPicksOf(entries).map((p) => [p.popularity, p.gate])).toEqual([[3, 6], [2, 2], [1, 8]]);
    expect(paddockPicksOf(entries, 1).map((p) => p.gate)).toEqual([8]);
  });
});

function recorder() {
  const ops: string[] = [];
  const target: Record<string, unknown> = {
    fillText: (t: string) => ops.push(`T:${t}`),
    fillRect: (x: number, y: number, w: number, h: number) => ops.push(`R:${x.toFixed(1)},${y.toFixed(1)},${w.toFixed(1)},${h.toFixed(1)}`),
    drawImage: () => ops.push('img'),
    measureText: () => ({ width: 40 }),
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key === 'createLinearGradient' ? undefined : key in obj ? obj[key as string] : () => undefined),
    set: (obj, key, value) => { obj[key as string] = value; return true; },
  });
  (ctx as unknown as { globalAlpha: number }).globalAlpha = 1;
  return { ctx, ops };
}

describe('★紹介と格の描画', () => {
  const FONT = (px: number): string => `${px}px sans-serif`;
  const VP = { width: 1280, height: 720 };
  const entry = { gate: 8, name: 'テストホース', jockey: '試験 太郎', frameRole: 'frame-8', oddsLabel: '2.5', popularity: 1, order: 3, total: 3 };
  it('★紹介は馬名・騎手・単勝・人気・「出走馬紹介 3 / 3」を描き、同じ秒なら同じ画', () => {
    const draw = (sec: number): string[] => { const { ctx, ops } = recorder(); drawPaddockIntro(ctx as never, {}, VP, FONT, entry, sec); return ops; };
    const a = draw(2);
    for (const t of ['T:テストホース', 'T:騎手　試験 太郎', 'T:2.5', 'T:1', 'T:番人気', 'T:出走馬紹介', 'T:3 / 3']) expect(a, t).toContain(t);
    expect(draw(2)).toEqual(a);
    /** ★対照: ★入りの途中（0.2 秒）は帯の位置が違う（★秒の関数で動いている） */
    expect(draw(0.2)).not.toEqual(a);
  });
  it('★格の紹介は渡された英字を描く（★G1 と G3 で違う）', () => {
    const texts = (roman: string): string[] => { const { ctx, ops } = recorder(); drawGradeIntro(ctx as never, VP, FONT, { roman }, 1.2, 2.6); return ops.filter((o) => o.startsWith('T:')); };
    expect(texts('I')).toContain('T:GI');
    expect(texts('III')).toContain('T:GIII');
  });
});

describe('startHorseVisualAt', () => {
  it('発走中に前後差を作り、終端でも3列の密集馬群を維持する', () => {
    const horses = Array.from({ length: 12 }, (_, index) => startHorseVisualAt(index + 1, 0.55, 8));
    const xs = horses.map((horse) => horse.centerX);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(90);
    const settled = Array.from({ length: 12 }, (_, index) => startHorseVisualAt(index + 1, 1, 8));
    expect(new Set(settled.map((horse) => horse.groundY)).size).toBe(3);
    expect(new Set(settled.map((horse) => horse.displayReferenceHeight)).size).toBe(3);
    expect(Math.max(...settled.map((horse) => horse.groundY))
      - Math.min(...settled.map((horse) => horse.groundY))).toBeLessThanOrEqual(60);
    expect(new Set(horses.map((horse) => horse.frame)).size).toBeGreaterThan(3);
  });

  it('開扉序盤でも反応差により馬群が一枚の縦線にならない', () => {
    const horses = Array.from({ length: 12 }, (_, index) => startHorseVisualAt(index + 1, 0.28, 8));
    const launched = horses.filter((horse) => horse.progress > 0.055);
    const xs = launched.map((horse) => horse.centerX);
    expect(launched.length).toBeGreaterThan(4);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(80);
  });

  it('参考映像同様、開扉0.6秒相当で全頭が強く加速している', () => {
    const horses = Array.from({ length: 12 }, (_, index) => startHorseVisualAt(index + 1, 0.27, 8));
    expect(horses.every((horse) => horse.progress > 0.18)).toBe(true);
    expect(Math.max(...horses.map((horse) => horse.centerX))).toBeGreaterThan(800);
  });

  it('開扉直後はゲート付近、終了時は画面右方向まで加速する', () => {
    const start = startHorseVisualAt(3, 0, 8);
    const finish = startHorseVisualAt(3, 1, 8);
    expect(start.centerX).toBeGreaterThan(230);
    expect(start.centerX).toBeLessThan(450);
    expect(finish.centerX).toBeGreaterThan(900);
  });

  it('待機中から12頭を房内の異なる位置に保持する', () => {
    const horses = Array.from({ length: 12 }, (_, index) => startHorseVisualAt(index + 1, 0, 8));
    expect(new Set(horses.map((horse) => horse.centerX)).size).toBe(12);
    expect(Math.min(...horses.map((horse) => horse.centerX))).toBeGreaterThanOrEqual(238);
    expect(Math.max(...horses.map((horse) => horse.centerX))).toBeLessThanOrEqual(443);
  });
});
