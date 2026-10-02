/**
 * ★**芝とカメラの監査の集計**（`apps/web/src/app/race/race-audit.ts`・★2026-10-02）。
 *   ★普通のレース（★対照）は 0 件・★逆回転・超高速・急変・離れるを 1 件ずつ見つける・★据え置きのゲートは 超スローに数えない。
 */
import { describe, it, expect } from 'vitest';
import { analyzeAuditGround, type AuditGroundFrame } from '../../web/src/app/race/race-audit';

const frame = (d: number, shot: string, groundMps: number | null, opts: Partial<AuditGroundFrame> = {}): AuditGroundFrame => ({
  d, shot, persp: false, groundMps, trueMps: 16, shownMps: 40, horseRatio: 0.25, camDistM: 44, ...opts,
});
const run = (shot: string, from: number, n: number, v: (i: number) => number, opts: (i: number) => Partial<AuditGroundFrame> = () => ({})): AuditGroundFrame[] =>
  Array.from({ length: n }, (_, i) => frame(from + i / 60, shot, i === 0 ? null : v(i), opts(i)));

describe('★芝とカメラの監査の集計', () => {
  it('★対照: ★本当の速さで流れる芝・★同じ大きさの馬は 0 件', () => {
    const fr = [...run('side-drive', 34, 120, () => 16), ...run('homestretch-side', 36, 120, () => 16.3)];
    const { findings, shots } = analyzeAuditGround(fr, 33);
    expect(findings).toEqual([]);
    expect(shots.map((s) => s.ratioMed)).toEqual([1, 1.02]);
  });

  it('🔴 ★逆回転・超高速・急変を見つけ ★続くコマは 1 件に束ねる', () => {
    const fr = run('homestretch-side', 34, 120, (i) => (i >= 40 && i < 46 ? -3 : i >= 80 && i < 83 ? 40 : 16));
    const kinds = analyzeAuditGround(fr, 33).findings.map((f) => `${f.kind}:${f.frames}`);
    expect(kinds).toContain('逆回転:6');
    expect(kinds).toContain('超高速:3');
    expect(kinds.some((k) => k.startsWith('急変'))).toBe(true);
  });

  it('🔴 ★直線で 馬が どんどん小さくなる（★カメラが離れる）を見つける', () => {
    const fr = run('finish-line', 50, 180, () => 16, (i) => ({ horseRatio: 0.27 * (1 - i / 300), camDistM: 44 + i / 3 }));
    const f = analyzeAuditGround(fr, 33).findings.find((x) => x.kind === '離れる');
    expect(f?.detail).toContain('カメラ 44m');
  });

  it('★据え置きのゲートで 芝が止まるのは 正しい（★超スローに数えない）・★対照: 追うカメラなら数える', () => {
    expect(analyzeAuditGround(run('start-gate-side', 33, 60, () => 0.1), 33).findings).toEqual([]);
    expect(analyzeAuditGround(run('side-drive', 33, 60, () => 0.1), 33).findings.map((f) => f.kind)).toContain('超スロー');
  });
});
