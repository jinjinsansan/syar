import { describe, expect, it } from 'vitest';
import {
  RACE_INTRO_END_SEC, RACE_INTRO_RACE_START_SEC, raceIntroAt, startHorseVisualAt,
} from '../src/index.js';

describe('raceIntroAt', () => {
  it('タイトルからゲート待機へ進み、発馬までレース時計を止める', () => {
    expect(raceIntroAt(0)).toMatchObject({ stage: 'title', raceDisplaySec: 0 });
    expect(raceIntroAt(2.6)).toMatchObject({ stage: 'gate-hold', raceDisplaySec: 0 });
    expect(raceIntroAt(RACE_INTRO_RACE_START_SEC - 0.01).raceDisplaySec).toBe(0);
  });

  it('扉開放と同時にレース時計を開始する', () => {
    expect(raceIntroAt(RACE_INTRO_RACE_START_SEC)).toEqual({
      stage: 'gate-release', raceDisplaySec: 0, releaseProgress: 0,
    });
    expect(raceIntroAt(5.4).stage).toBe('gate-release');
    expect(raceIntroAt(5.4).raceDisplaySec).toBeCloseTo(0.6);
  });

  it('発馬映像後もレース時間を巻き戻さず通常中継へ渡す', () => {
    const state = raceIntroAt(RACE_INTRO_END_SEC);
    expect(state.stage).toBe('race');
    expect(state.raceDisplaySec).toBeCloseTo(RACE_INTRO_END_SEC - RACE_INTRO_RACE_START_SEC);
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
